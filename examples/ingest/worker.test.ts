// Every path through the worker, with no database and no rclone. The worker
// is parametric in its receipts, so the fake supplies plain strings where the
// adapters supply sealed values, and each test scripts one outcome per
// effect and reads back which effects ran.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyTarget } from './boundary/target.js';
import type {
  ClaimOutcome,
  FenceOutcome,
  FinalizeOutcome,
  IngestEffects,
  MarkOutcome,
  SettleOutcome,
  StrandOutcome,
  TargetOutcome,
  TransferOutcome,
} from './contract.js';
import { report, verdict } from './report.js';
import type { Definitive, IngestStatus } from './status.js';
import { ingest } from './worker.js';
import type { Variant } from '../../src/variant.js';

type Script = {
  readonly target: Variant<TargetOutcome>;
  readonly mark: Variant<MarkOutcome>;
  readonly claim: Variant<ClaimOutcome<string>>;
  readonly transfer: Variant<TransferOutcome>;
  readonly fence: Variant<FenceOutcome<string>>;
  readonly finalize: Variant<FinalizeOutcome<string>>;
  readonly settle: Variant<SettleOutcome>;
  readonly strand: Variant<StrandOutcome>;
};

// A branded value is earned by parsing, never asserted: the real boundary
// classifies a row shaped like the one the store hands over.
const located = classifyTarget('mount:')({ sourceUri: 'https://example.org/a.bam', destKey: 'files/a.bam', lifecycle: { state: 'arriving' } });
if (located.kind !== 'ready') throw new Error('the fixture row must classify as ready');
const { uri, destKey } = located;

const happy: Script = {
  target: { kind: 'ready', uri, destKey },
  mark: { kind: 'recorded' },
  claim: { kind: 'claimed', claim: 'claim-1' },
  transfer: { kind: 'transferred', bytes: 48 },
  fence: { kind: 'held', fenced: 'fenced-1' },
  finalize: { kind: 'finalized', finalized: 'final-1' },
  settle: { kind: 'settled' },
  strand: { kind: 'recorded' },
};

const scripted = (overrides: Partial<Script>) => {
  const script = { ...happy, ...overrides };
  const calls: string[] = [];
  const stranded: Variant<Definitive>[] = [];
  const step = <T>(name: string, outcome: T) => async (): Promise<T> => {
    calls.push(name);
    return outcome;
  };
  const fx: IngestEffects<string, string, string, string> = {
    target: step('target', script.target),
    markNeverStarted: step('mark', script.mark),
    claim: step('claim', script.claim),
    transfer: step('transfer', script.transfer),
    fence: step('fence', script.fence),
    finalize: step('finalize', script.finalize),
    settle: step('settle', script.settle),
    strand: async (_claim, cause) => {
      calls.push('strand');
      stranded.push(cause);
      return script.strand;
    },
  };
  const run = ingest(fx);
  return { run: () => run({ fileId: 'f-1', signal: new AbortController().signal, lock: 'lock-1' }), calls, stranded };
};

test('a located, arriving row is claimed, transferred, fenced, finalized and settled', async () => {
  const w = scripted({});
  assert.deepEqual(await w.run(), { kind: 'succeeded', bytes: 48 });
  assert.deepEqual(w.calls, ['target', 'claim', 'transfer', 'fence', 'finalize', 'settle']);
});

test('a row that is gone ends before any claim', async () => {
  const w = scripted({ target: { kind: 'gone' } });
  assert.deepEqual(await w.run(), { kind: 'row_gone' });
  assert.deepEqual(w.calls, ['target']);
});

test('a row already past arriving is left to whoever settled it', async () => {
  const w = scripted({ target: { kind: 'settled', state: 'ready' } });
  assert.deepEqual(await w.run(), { kind: 'already_settled', state: 'ready' });
  assert.deepEqual(w.calls, ['target']);
});

test('an abandoned upload is marked never_started without a claim', async () => {
  const w = scripted({ target: { kind: 'abandoned' } });
  assert.deepEqual(await w.run(), { kind: 'never_started' });
  assert.deepEqual(w.calls, ['target', 'mark']);
});

test("another plane's file is returned, not stranded", async () => {
  const w = scripted({ target: { kind: 'foreign_plane', uri } });
  assert.deepEqual(await w.run(), { kind: 'not_this_plane', uri });
  assert.deepEqual(w.calls, ['target']);
});

test('an unsupported scheme is recorded as format_rejected under the claim', async () => {
  const w = scripted({ transfer: { kind: 'unsupported_scheme' } });
  const status = await w.run();
  assert.equal(status.kind, 'format_rejected');
  assert.deepEqual(w.calls, ['target', 'claim', 'transfer', 'strand']);
  assert.equal(w.stranded[0]?.kind, 'format_rejected');
});

test('an egress refusal is recorded as destination_refused', async () => {
  const w = scripted({ transfer: { kind: 'refused_by_egress', diagnostic: '407' } });
  assert.deepEqual(await w.run(), { kind: 'destination_refused', destination: { kind: 'network' }, diagnostic: '407' });
  assert.deepEqual(w.stranded, [{ kind: 'destination_refused', destination: { kind: 'network' }, diagnostic: '407' }]);
});

test('a deadline is recorded as deadline_exceeded', async () => {
  const w = scripted({ transfer: { kind: 'deadline', afterMs: 900, diagnostic: 'deadline' } });
  assert.deepEqual(await w.run(), { kind: 'deadline_exceeded', afterMs: 900, diagnostic: 'deadline' });
  assert.deepEqual(w.calls, ['target', 'claim', 'transfer', 'strand']);
});

test('a process failure during transfer is handed back unrecorded', async () => {
  const w = scripted({ transfer: { kind: 'died', diagnostic: 'ECONNRESET' } });
  assert.deepEqual(await w.run(), { kind: 'worker_died', diagnostic: 'ECONNRESET' });
  assert.deepEqual(w.calls, ['target', 'claim', 'transfer']);
});

test('a short read is handed back unrecorded, with the counts', async () => {
  const w = scripted({ transfer: { kind: 'short_read', advertised: 100, received: 60 } });
  const status = await w.run();
  assert.equal(status.kind, 'worker_died');
  assert.match(report(status).detail, /advertised 100 bytes and the destination holds 60/);
  assert.deepEqual(w.calls, ['target', 'claim', 'transfer']);
});

test('a fence lost after the fetch stops before finalize', async () => {
  const w = scripted({ fence: { kind: 'revoked' } });
  assert.deepEqual(await w.run(), { kind: 'claim_revoked' });
  assert.deepEqual(w.calls, ['target', 'claim', 'transfer', 'fence']);
});

test('a finalize rejection carries its cause through whole', async () => {
  const cause: Variant<Definitive> = { kind: 'format_rejected', format: 'fasta', compression: 'gzip', diagnostic: 'BGZF gate' };
  const w = scripted({ finalize: { kind: 'rejected', cause } });
  assert.deepEqual(await w.run(), cause);
  assert.deepEqual(w.stranded, [cause]);
  assert.deepEqual(w.calls, ['target', 'claim', 'transfer', 'fence', 'finalize', 'strand']);
});

test('a definitive cause whose record loses the fence is a revoked claim', async () => {
  const cause: Variant<Definitive> = { kind: 'never_started' };
  const w = scripted({ finalize: { kind: 'rejected', cause }, strand: { kind: 'revoked' } });
  assert.deepEqual(await w.run(), { kind: 'claim_revoked' });
});

test('a definitive cause whose record fails is handed back for another run', async () => {
  const cause: Variant<Definitive> = { kind: 'never_started' };
  const w = scripted({ finalize: { kind: 'rejected', cause }, strand: { kind: 'died', diagnostic: 'db down' } });
  assert.deepEqual(await w.run(), { kind: 'worker_died', diagnostic: 'db down' });
});

test('a fence lost at settle is a revoked claim, not a dead worker', async () => {
  const w = scripted({ settle: { kind: 'revoked' } });
  assert.deepEqual(await w.run(), { kind: 'claim_revoked' });
});

// One sample of every case. The record is keyed by the status's kinds, so a
// new case fails to compile here until it has a sample, and the folds below
// are checked over all of them.
const every: { readonly [K in IngestStatus['kind']]: Extract<IngestStatus, { readonly kind: K }> } = {
  succeeded: { kind: 'succeeded', bytes: 1 },
  row_gone: { kind: 'row_gone' },
  already_settled: { kind: 'already_settled', state: 'landed' },
  not_this_plane: { kind: 'not_this_plane', uri: 'mount:x' },
  claim_revoked: { kind: 'claim_revoked' },
  worker_died: { kind: 'worker_died', diagnostic: 'x' },
  deadline_exceeded: { kind: 'deadline_exceeded', afterMs: 1, diagnostic: 'x' },
  destination_refused: { kind: 'destination_refused', destination: { kind: 'network' }, diagnostic: 'x' },
  format_rejected: { kind: 'format_rejected', format: 'f', compression: 'c', diagnostic: 'x' },
  never_started: { kind: 'never_started' },
};

test('the queue runs again on worker_died and on nothing else, carrying the cause', () => {
  const again = Object.values(every).filter((s) => verdict(s).kind === 'again').map((s) => s.kind);
  assert.deepEqual(again, ['worker_died']);
  assert.deepEqual(verdict(every.worker_died), { kind: 'again', cause: { kind: 'worker_died', diagnostic: 'x' } });
});

test('every status has a report line', () => {
  Object.values(every).forEach((s) => assert.ok(report(s).action.length > 0, s.kind));
});
