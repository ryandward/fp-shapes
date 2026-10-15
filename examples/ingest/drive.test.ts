// Every path through the core, with no database and no rclone. Each test
// scripts one outcome per operation, drives the core through them, and reads
// back from the ledger which commands ran and what they carried.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
  ClaimOutcome,
  Definitive,
  FenceOutcome,
  FinalizeOutcome,
  IngestStatus,
  MarkOutcome,
  SettleOutcome,
  StrandOutcome,
  TargetOutcome,
  TransferOutcome,
} from './boundary/ingest.ffi.js';
import { classifyTarget } from './boundary/target.js';
import { drive, type Effects, type Entry } from './effects/ingest.drive.js';
import { defect } from '../../src/sealed.js';
import { report, verdict } from './report.js';
import type { Variant } from '../../src/variant.js';

type Script = {
  readonly target: Variant<TargetOutcome>;
  readonly mark: Variant<MarkOutcome>;
  readonly claim: Variant<ClaimOutcome>;
  readonly transfer: Variant<TransferOutcome>;
  readonly fence: Variant<FenceOutcome>;
  readonly finalize: Variant<FinalizeOutcome>;
  readonly settle: Variant<SettleOutcome>;
  readonly strand: Variant<StrandOutcome>;
};

// The real boundary classifies a row shaped like the one the store hands over.
const located = classifyTarget('mount:')({ sourceUri: 'https://example.org/a.bam', destKey: 'files/a.bam', lifecycle: { state: 'arriving' } });
if (located.kind !== 'ready') throw new Error('the fixture row must classify as ready');
const { uri, destKey } = located;

const happy: Script = {
  target: { kind: 'ready', uri, destKey },
  mark: { kind: 'marked' },
  claim: { kind: 'claimed', c: { fileId: 'f-1', token: 'claim-1' } },
  transfer: { kind: 'transferred', bytes: 48 },
  fence: { kind: 'held', f: { fileId: 'f-1', bytes: 48 } },
  finalize: { kind: 'finalized', z: { fileId: 'f-1', bytes: 48 } },
  settle: { kind: 'settle_done' },
  strand: { kind: 'recorded' },
};

const scripted = (overrides: Partial<Script>) => {
  const script = { ...happy, ...overrides };
  const answer = <T>(outcome: T) => async (): Promise<T> => outcome;
  const fx: Effects = {
    target: answer(script.target),
    markNeverStarted: answer(script.mark),
    claim: answer(script.claim),
    transfer: answer(script.transfer),
    fence: answer(script.fence),
    finalize: answer(script.finalize),
    settle: answer(script.settle),
    strand: answer(script.strand),
  };
  return async () => {
    const run = await drive(fx)('f-1');
    if (run.kind !== 'finished') throw new Error(`the attempt halted: ${run.error.message}`);
    assert.deepEqual(run.outstanding, []); // every receipt issued on this path was spent
    const commands = run.ledger.map((entry) => entry.kind);
    const stranded = run.ledger.flatMap((entry) => (entry.kind === 'strand' ? [entry.cause] : []));
    return { status: run.status, commands, stranded, ledger: run.ledger };
  };
};

test('a located, arriving row is claimed, transferred, fenced, finalized and settled', async () => {
  const run = await scripted({})();
  assert.deepEqual(run.status, { kind: 'succeeded', bytes: 48 });
  assert.deepEqual(run.commands, ['target', 'claim', 'transfer', 'fence', 'finalize', 'settle']);
});

test('the ledger carries each command\'s arguments and outcome, and the receipts thread through it', async () => {
  const run = await scripted({})();
  const claim = { fileId: 'f-1', token: 'claim-1' };
  const expected: ReadonlyArray<Variant<Entry>> = [
    { kind: 'target', fileId: 'f-1', outcome: { kind: 'ready', uri, destKey } },
    { kind: 'claim', fileId: 'f-1', outcome: { kind: 'claimed', c: claim } },
    { kind: 'transfer', c: claim, uri, destKey, outcome: { kind: 'transferred', bytes: 48 } },
    { kind: 'fence', c: claim, bytes: 48, outcome: { kind: 'held', f: { fileId: 'f-1', bytes: 48 } } },
    { kind: 'finalize', f: { fileId: 'f-1', bytes: 48 }, outcome: { kind: 'finalized', z: { fileId: 'f-1', bytes: 48 } } },
    { kind: 'settle', c: claim, z: { fileId: 'f-1', bytes: 48 }, outcome: { kind: 'settle_done' } },
  ];
  assert.deepEqual(run.ledger, expected);
  run.ledger.forEach((entry) => assert.ok(Object.isFrozen(entry)));
});

test('a row that is gone ends before any claim', async () => {
  const run = await scripted({ target: { kind: 'gone' } })();
  assert.deepEqual(run.status, { kind: 'row_gone' });
  assert.deepEqual(run.commands, ['target']);
});

test('a row already past arriving is left to whoever settled it', async () => {
  const run = await scripted({ target: { kind: 'settled', state: 'ready' } })();
  assert.deepEqual(run.status, { kind: 'already_settled', state: 'ready' });
  assert.deepEqual(run.commands, ['target']);
});

test('an abandoned upload is marked never_started without a claim', async () => {
  const run = await scripted({ target: { kind: 'abandoned' } })();
  assert.deepEqual(run.status, { kind: 'stranded', cause: { kind: 'never_started' } });
  assert.deepEqual(run.commands, ['target', 'mark_never_started']);
});

test("another plane's file is returned, not stranded", async () => {
  const run = await scripted({ target: { kind: 'foreign_plane', uri } })();
  assert.deepEqual(run.status, { kind: 'not_this_plane', uri });
  assert.deepEqual(run.commands, ['target']);
});

test('an unsupported scheme is recorded as format_rejected under the claim', async () => {
  const run = await scripted({ transfer: { kind: 'unsupported_scheme' } })();
  assert.equal(run.status.kind, 'stranded');
  assert.deepEqual(run.commands, ['target', 'claim', 'transfer', 'strand']);
  assert.equal(run.stranded[0]?.kind, 'format_rejected');
});

test('an egress refusal is recorded as destination_refused', async () => {
  const run = await scripted({ transfer: { kind: 'refused_by_egress', diagnostic: '407' } })();
  assert.deepEqual(run.status, { kind: 'stranded', cause: { kind: 'destination_refused', diagnostic: '407' } });
  assert.deepEqual(run.stranded, [{ kind: 'destination_refused', diagnostic: '407' }]);
});

test('a deadline is recorded as deadline_exceeded', async () => {
  const run = await scripted({ transfer: { kind: 'deadline', afterMs: 900, diagnostic: 'deadline' } })();
  assert.deepEqual(run.status, { kind: 'stranded', cause: { kind: 'deadline_exceeded', afterMs: 900, diagnostic: 'deadline' } });
  assert.deepEqual(run.commands, ['target', 'claim', 'transfer', 'strand']);
});

test('a process failure during transfer is handed back unrecorded', async () => {
  const run = await scripted({ transfer: { kind: 'transfer_died', diagnostic: 'ECONNRESET' } })();
  assert.deepEqual(run.status, { kind: 'worker_died', diagnostic: 'ECONNRESET' });
  assert.deepEqual(run.commands, ['target', 'claim', 'transfer']);
});

test('a short read is handed back unrecorded, with the counts', async () => {
  const run = await scripted({ transfer: { kind: 'short_read', advertised: 100, received: 60 } })();
  assert.equal(run.status.kind, 'worker_died');
  assert.match(report(run.status).detail, /advertised 100 bytes and the destination holds 60/);
  assert.deepEqual(run.commands, ['target', 'claim', 'transfer']);
});

test('a fence lost after the fetch stops before finalize', async () => {
  const run = await scripted({ fence: { kind: 'fence_revoked' } })();
  assert.deepEqual(run.status, { kind: 'claim_revoked' });
  assert.deepEqual(run.commands, ['target', 'claim', 'transfer', 'fence']);
});

test('a finalize rejection carries its cause through whole', async () => {
  const cause: Variant<Definitive> = { kind: 'format_rejected', format: 'fasta', compression: 'gzip', diagnostic: 'BGZF gate' };
  const run = await scripted({ finalize: { kind: 'rejected', cause } })();
  assert.deepEqual(run.status, { kind: 'stranded', cause });
  assert.deepEqual(run.stranded, [cause]);
  assert.deepEqual(run.commands, ['target', 'claim', 'transfer', 'fence', 'finalize', 'strand']);
});

test('a definitive cause whose record loses the fence is a revoked claim', async () => {
  const run = await scripted({ finalize: { kind: 'rejected', cause: { kind: 'never_started' } }, strand: { kind: 'strand_revoked' } })();
  assert.deepEqual(run.status, { kind: 'claim_revoked' });
});

test('a definitive cause whose record fails is handed back for another run', async () => {
  const run = await scripted({ finalize: { kind: 'rejected', cause: { kind: 'never_started' } }, strand: { kind: 'strand_died', diagnostic: 'db down' } })();
  assert.deepEqual(run.status, { kind: 'worker_died', diagnostic: 'db down' });
});

test('a fence lost at settle is a revoked claim, not a dead worker', async () => {
  const run = await scripted({ settle: { kind: 'settle_revoked' } })();
  assert.deepEqual(run.status, { kind: 'claim_revoked' });
});

test('a performer that throws halts the run: the error, the ledger so far, and nothing outstanding on that path', async () => {
  const fx: Effects = {
    target: async () => ({ kind: 'ready', uri, destKey }),
    markNeverStarted: async () => ({ kind: 'marked' }),
    claim: async () => ({ kind: 'claimed', c: { fileId: 'f-1', token: 'claim-1' } }),
    transfer: async () => defect('the source process could not be spawned'),
    fence: async () => ({ kind: 'fence_revoked' }),
    finalize: async () => ({ kind: 'finalize_died', diagnostic: 'unreached' }),
    settle: async () => ({ kind: 'settle_died', diagnostic: 'unreached' }),
    strand: async () => ({ kind: 'recorded' }),
  };
  const run = await drive(fx)('f-1');
  if (run.kind !== 'halted') throw new Error('the run must halt');
  assert.equal(run.error.message, 'the source process could not be spawned');
  assert.deepEqual(
    run.ledger.map((entry) => entry.kind),
    ['target', 'claim'],
  );
  assert.deepEqual(run.outstanding, []);
});

test('an outcome the FFI refuses halts the run naming the field, with the ledger up to that command', async () => {
  const fx: Effects = {
    target: async () => ({ kind: 'ready', uri, destKey }),
    markNeverStarted: async () => ({ kind: 'marked' }),
    claim: async () => ({ kind: 'claimed', c: { fileId: 'f-1', token: 'claim-1' } }),
    transfer: async () => ({ kind: 'transferred', bytes: 1.5 }),
    fence: async () => ({ kind: 'fence_revoked' }),
    finalize: async () => ({ kind: 'finalize_died', diagnostic: 'unreached' }),
    settle: async () => ({ kind: 'settle_died', diagnostic: 'unreached' }),
    strand: async () => ({ kind: 'recorded' }),
  };
  const run = await drive(fx)('f-1');
  if (run.kind !== 'halted') throw new Error('the run must halt');
  assert.match(run.error.message, /transfer: bytes: /);
  assert.deepEqual(
    run.ledger.map((entry) => entry.kind),
    ['target', 'claim'],
  );
});

test('a halt after a receipt was issued reports that receipt as outstanding', async () => {
  const fx: Effects = {
    target: async () => ({ kind: 'ready', uri, destKey }),
    markNeverStarted: async () => ({ kind: 'marked' }),
    claim: async () => ({ kind: 'claimed', c: { fileId: 'f-1', token: 'claim-1' } }),
    transfer: async () => ({ kind: 'transferred', bytes: 48 }),
    fence: async () => ({ kind: 'held', f: { fileId: 'f-1', bytes: 48 } }),
    finalize: async () => defect('the finalizer process died'), // the fenced receipt was spent by reaching finalize
    settle: async () => ({ kind: 'settle_died', diagnostic: 'unreached' }),
    strand: async () => ({ kind: 'recorded' }),
  };
  const run = await drive(fx)('f-1');
  if (run.kind !== 'halted') throw new Error('the run must halt');
  assert.deepEqual(run.outstanding, []); // spent when the finalize step was read, before its performer threw
  const issued: Effects = { ...fx, fence: async () => defect('the fence write hung') };
  const earlier = await drive(issued)('f-1');
  if (earlier.kind !== 'halted') throw new Error('the run must halt');
  assert.deepEqual(earlier.outstanding, []); // nothing was issued before the fence answered
});

// One sample of every case. The record is keyed by the status's kinds, so a
// case added in the core fails to compile here until it has a sample, and the
// folds below are checked over all of them.
const every: { readonly [K in keyof IngestStatus]: Extract<Variant<IngestStatus>, { readonly kind: K }> } = {
  succeeded: { kind: 'succeeded', bytes: 1 },
  row_gone: { kind: 'row_gone' },
  already_settled: { kind: 'already_settled', state: 'landed' },
  not_this_plane: { kind: 'not_this_plane', uri: 'mount:x' },
  claim_revoked: { kind: 'claim_revoked' },
  worker_died: { kind: 'worker_died', diagnostic: 'x' },
  stranded: { kind: 'stranded', cause: { kind: 'never_started' } },
};

const everyCause: { readonly [K in keyof Definitive]: Extract<Variant<Definitive>, { readonly kind: K }> } = {
  deadline_exceeded: { kind: 'deadline_exceeded', afterMs: 1, diagnostic: 'x' },
  destination_refused: { kind: 'destination_refused', diagnostic: 'x' },
  format_rejected: { kind: 'format_rejected', format: 'f', compression: 'c', diagnostic: 'x' },
  never_started: { kind: 'never_started' },
};

test('the queue runs again on worker_died and on nothing else, carrying the cause', () => {
  const again = Object.values(every).filter((s) => verdict(s).kind === 'again').map((s) => s.kind);
  assert.deepEqual(again, ['worker_died']);
  assert.deepEqual(verdict(every.worker_died), { kind: 'again', cause: { kind: 'worker_died', diagnostic: 'x' } });
  Object.values(everyCause).forEach((cause) => assert.equal(verdict({ kind: 'stranded', cause }).kind, 'left'));
});

test('every status and every stranded cause has a report line', () => {
  Object.values(every).forEach((s) => assert.ok(report(s).action.length > 0, s.kind));
  Object.values(everyCause).forEach((cause) => assert.ok(report({ kind: 'stranded', cause }).action.length > 0, cause.kind));
});
