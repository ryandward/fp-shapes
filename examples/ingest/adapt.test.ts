// The adapters are where a thrown class, a boolean result and a matched
// message become cases. These tests hand them a fake of the foreign modules
// that throws and returns the way the real ones do, and check the case that
// comes out, the receipt that comes with it, and the writes that reached the
// database.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyTarget } from './boundary/target.js';
import { adapt, dropStaging } from './effects/adapt.js';
import type { FinalizeResult, Foreign, Source, Transition } from './effects/foreign.js';
import { runExternalIngest } from './effects/run.js';

class LifecycleGuardFailed extends Error {}
class TransferDeadlineExceeded extends Error {
  constructor(readonly afterMs: number) {
    super(`deadline after ${afterMs}ms`);
  }
}

// The one piece of state the guarantees turn on is modelled: a claim mints a
// fresh token and takes the row, and a fenced write lands only while its
// token is the holder's, the way the real statements behave.
type World = {
  readonly transitions: Transition[];
  readonly deleted: string[];
  readonly cleared: string[];
  readonly claims: string[];
  holder: string;
};

const foreignWith = (
  overrides: Partial<Foreign>,
  source: Partial<Source> = {},
  finalize: FinalizeResult = { ok: true },
): { readonly foreign: Foreign; readonly world: World } => {
  const world: World = { transitions: [], deleted: [], cleared: [], claims: [], holder: '' };
  const foreign: Foreign = {
    dataSource: {},
    mountSourcePrefix: 'mount:',
    ingestTarget: async () => ({ sourceUri: 'https://example.org/a.bam', destKey: 'files/a.bam', lifecycle: { state: 'arriving' } }),
    claimFile: async (fileId) => {
      world.claims.push(fileId);
      world.holder = `token-${String(world.claims.length)}`;
      return world.holder;
    },
    transitionFile: async (fileId, transition, guard) => {
      if (guard.kind === 'fence' && guard.token !== world.holder) throw new LifecycleGuardFailed(`${fileId}: the fence moved`);
      world.transitions.push(transition);
    },
    transitionForCause: (cause) => ({ kind: 'failed', cause }),
    LifecycleGuardFailed,
    TransferDeadlineExceeded,
    sourceForUri: () => ({ fetch: async () => ({ bytes: 48 }), ...source }),
    finalizeAfterBytes: async () => finalize,
    refusedByEgress: (reason) => reason.includes('407'),
    publishTransfer: async () => undefined,
    clearTransfer: (fileId) => {
      world.cleared.push(fileId);
    },
    storageDelete: async (key) => {
      world.deleted.push(key);
    },
    storageKeyOf: (uri) => uri.replace('s3://bucket/', ''),
    ...overrides,
  };
  return { foreign, world };
};

const located = classifyTarget('mount:')({ sourceUri: 'https://example.org/a.bam', destKey: 'files/a.bam', lifecycle: { state: 'arriving' } });
if (located.kind !== 'ready') throw new Error('the fixture row must classify as ready');
const { uri, destKey } = located;
const lock = { workerId: 'w-1' };
const signal = new AbortController().signal;
const holding = { lock, signal };

test('a claim carries the token the store issued, under the file it is for', async () => {
  const fx = adapt(foreignWith({}).foreign, holding);
  assert.deepEqual(await fx.claim('f-1'), { kind: 'claimed', c: { fileId: 'f-1', token: 'token-1' } });
});

test('a guard failure on the fenced write is the revoked case', async () => {
  const { foreign } = foreignWith({
    transitionFile: async () => {
      throw new LifecycleGuardFailed('fence lost');
    },
  });
  const fx = adapt(foreign, holding);
  const claimed = await fx.claim('f-1');
  if (claimed.kind !== 'claimed') throw new Error('fixture must claim');
  assert.deepEqual(await fx.fence(claimed.c, 48), { kind: 'fence_revoked' });
});

test('any other failure on the fenced write is the died case', async () => {
  const { foreign } = foreignWith({
    transitionFile: async () => {
      throw new Error('connection refused');
    },
  });
  const fx = adapt(foreign, holding);
  const claimed = await fx.claim('f-1');
  if (claimed.kind !== 'claimed') throw new Error('fixture must claim');
  assert.deepEqual(await fx.fence(claimed.c, 48), { kind: 'fence_died', diagnostic: 'connection refused' });
});

test('a deadline thrown by the fetch is the deadline case, with its afterMs', async () => {
  const { foreign } = foreignWith({}, {
    fetch: async () => {
      throw new TransferDeadlineExceeded(900);
    },
  });
  const fx = adapt(foreign, holding);
  const claimed = await fx.claim('f-1');
  if (claimed.kind !== 'claimed') throw new Error('fixture must claim');
  assert.deepEqual(await fx.transfer(claimed.c, uri, destKey), { kind: 'deadline', afterMs: 900, diagnostic: 'deadline after 900ms' });
});

test("the egress proxy's refusal is read from the fetch error only", async () => {
  const { foreign } = foreignWith({}, {
    fetch: async () => {
      throw new Error('407 Proxy Authentication Required');
    },
  });
  const fx = adapt(foreign, holding);
  const claimed = await fx.claim('f-1');
  if (claimed.kind !== 'claimed') throw new Error('fixture must claim');
  assert.equal((await fx.transfer(claimed.c, uri, destKey)).kind, 'refused_by_egress');
});

test('head is called on its source, so a source that reads its own state in head still works', async () => {
  const source: Partial<Source> = {
    head: async function (this: { readonly sizes: Record<string, number> }, u: string) {
      return { size: this.sizes[u] ?? 0 };
    },
    fetch: async () => ({ bytes: 60 }),
  };
  const { foreign } = foreignWith({}, source);
  const withState = { ...foreign, sourceForUri: () => ({ sizes: { [uri]: 100 }, fetch: async () => ({ bytes: 60 }), head: source.head }) as Source };
  const fx = adapt(withState, holding);
  const claimed = await fx.claim('f-1');
  if (claimed.kind !== 'claimed') throw new Error('fixture must claim');
  assert.equal((await fx.transfer(claimed.c, uri, destKey)).kind, 'short_read'); // the probe read the size through `this`
});

test("a claim taken by a replacement revokes the first attempt's fenced writes", async () => {
  const { foreign } = foreignWith({});
  const fx = adapt(foreign, holding);
  const first = await fx.claim('f-1');
  if (first.kind !== 'claimed') throw new Error('fixture must claim');
  await adapt(foreign, { lock: { workerId: 'w-2' }, signal }).claim('f-1'); // the replacement takes the row
  assert.deepEqual(await fx.fence(first.c, 48), { kind: 'fence_revoked' });
});

test('a short read is the short_read case when the source advertised more', async () => {
  const { foreign, world } = foreignWith({}, { head: async () => ({ size: 100 }), fetch: async () => ({ bytes: 60 }) });
  const fx = adapt(foreign, holding);
  const claimed = await fx.claim('f-1');
  if (claimed.kind !== 'claimed') throw new Error('fixture must claim');
  assert.deepEqual(await fx.transfer(claimed.c, uri, destKey), { kind: 'short_read', advertised: 100, received: 60 });
  assert.deepEqual(world.transitions, [{ kind: 'measured', sizeBytes: 100 }]); // the probe recorded the advertised size
});

test('a finalize that says ok:false carries its cause whole; a worker_died cause is the died case', async () => {
  const rejected = foreignWith({}, {}, { ok: false, cause: { kind: 'format_rejected', format: 'fasta', compression: 'gzip', diagnostic: 'BGZF' }, error: 'BGZF' });
  const died = foreignWith({}, {}, { ok: false, cause: { kind: 'worker_died', diagnostic: 'oom' }, error: 'oom' });
  for (const [world, expected] of [
    [rejected, { kind: 'rejected', cause: { kind: 'format_rejected', format: 'fasta', compression: 'gzip', diagnostic: 'BGZF' } }],
    [died, { kind: 'finalize_died', diagnostic: 'oom' }],
  ] as const) {
    const fx = adapt(world.foreign, holding);
    const claimed = await fx.claim('f-1');
    if (claimed.kind !== 'claimed') throw new Error('fixture must claim');
    const fenced = await fx.fence(claimed.c, 48);
    if (fenced.kind !== 'held') throw new Error('fixture must fence');
    assert.deepEqual(await fx.finalize(fenced.f), expected);
  }
});

test('settle takes the finalized receipt for the claimed file; another file\'s is a dead worker, not a settled row', async () => {
  const { foreign, world } = foreignWith({});
  const fx = adapt(foreign, holding);
  const claimed = await fx.claim('f-1');
  if (claimed.kind !== 'claimed') throw new Error('fixture must claim');
  assert.equal((await fx.settle(claimed.c, { fileId: 'f-2', bytes: 1 })).kind, 'settle_died');
  assert.deepEqual(world.transitions, []);
});

test('a stranded cause reaches the store in its vocabulary, with the destination it records', async () => {
  const { foreign, world } = foreignWith({});
  const fx = adapt(foreign, holding);
  const claimed = await fx.claim('f-1');
  if (claimed.kind !== 'claimed') throw new Error('fixture must claim');
  assert.deepEqual(await fx.strand(claimed.c, { kind: 'destination_refused', diagnostic: '407' }), { kind: 'recorded' });
  assert.deepEqual(world.transitions, [{ kind: 'failed', cause: { kind: 'destination_refused', destination: { kind: 'network' }, diagnostic: '407' } }]);
});

test('the whole run: one log line, the transfer cleared, the writes in order, the ledger returned', async () => {
  const { foreign, world } = foreignWith({});
  const lines: string[] = [];
  const original = console.info;
  console.info = (line: string) => {
    lines.push(line);
  };
  try {
    const run = await runExternalIngest(foreign)({ fileId: 'f-1', signal, lock, attempt: 1, maxAttempts: 5 });
    assert.deepEqual(run.status, { kind: 'succeeded', bytes: 48 });
    assert.deepEqual(
      run.ledger.map((entry) => entry.kind),
      ['target', 'claim', 'transfer', 'fence', 'finalize', 'settle'],
    );
  } finally {
    console.info = original;
  }
  assert.equal(lines.length, 1);
  assert.match(lines[0] ?? '', /"action":"completed"/);
  assert.match(lines[0] ?? '', /"commands":6/);
  assert.deepEqual(world.cleared, ['f-1']);
  assert.deepEqual(world.transitions, [{ kind: 'measured', sizeBytes: 48 }, { kind: 'settled' }]);
});

test('dropStaging: a staging key is deleted, anything else is nothing_to_drop, a failure is an orphan', async () => {
  const staged = foreignWith({ ingestTarget: async () => ({ sourceUri: 's3://bucket/staging/a', destKey: 'k', lifecycle: { state: 'ready' } }) });
  assert.deepEqual(await dropStaging(staged.foreign)('f-1'), { kind: 'dropped', key: 'staging/a' });
  assert.deepEqual(staged.world.deleted, ['staging/a']);

  const published = foreignWith({ ingestTarget: async () => ({ sourceUri: 's3://bucket/files/a', destKey: 'k', lifecycle: { state: 'ready' } }) });
  assert.deepEqual(await dropStaging(published.foreign)('f-1'), { kind: 'nothing_to_drop' });

  const failing = foreignWith({
    ingestTarget: async () => {
      throw new Error('db down');
    },
  });
  assert.deepEqual(await dropStaging(failing.foreign)('f-1'), { kind: 'orphaned', diagnostic: 'db down' });
});
