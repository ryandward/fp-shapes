// A boundary parses unknown into a total, readonly, frozen fact or a
// rejection with at least one issue; attempt turns a throw into a case;
// partition and occupancy classify without a predicate.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { boundary } from '../src/boundary/boundary.js';
import { occupancy } from '../src/boundary/evidence.js';
import { attempt } from '../src/effects/attempt.js';
import { partition, type Classify } from '../src/variant.js';

const point = boundary(z.object({ x: z.number(), y: z.number().default(0) }).readonly(), (p) => p);

test('an accepted fact is frozen and total', () => {
  const parsed = point({ x: 1 });
  assert.equal(parsed.kind, 'accepted');
  if (parsed.kind !== 'accepted') return;
  assert.deepEqual(parsed.fact, { x: 1, y: 0 });
  assert.ok(Object.isFrozen(parsed.fact));
});

test('a rejected parse carries at least one issue, with a path', () => {
  const parsed = point({ x: 'one' });
  assert.equal(parsed.kind, 'rejected');
  if (parsed.kind !== 'rejected') return;
  assert.ok(parsed.issues.length >= 1);
  assert.equal(parsed.issues[0].path, 'x');
});

test('attempt turns a rejection into a fact and a resolution into a value', async () => {
  assert.deepEqual(await attempt(() => Promise.resolve(1)), { kind: 'ok', value: 1 });
  const failed = await attempt(() => Promise.reject(new Error('boom')));
  assert.equal(failed.kind, 'failed');
  if (failed.kind === 'failed') assert.equal(failed.error.message, 'boom');
});

test('partition keeps every case and names every bucket', () => {
  type Parity = { even: { readonly n: number }; odd: { readonly n: number } };
  const parity: Classify<number, Parity> = (n) => (n % 2 === 0 ? { kind: 'even', n } : { kind: 'odd', n });
  const buckets = partition(parity, { even: [], odd: [] })([1, 2, 3, 4]);
  assert.deepEqual(buckets.even, [{ kind: 'even', n: 2 }, { kind: 'even', n: 4 }]);
  assert.deepEqual(buckets.odd, [{ kind: 'odd', n: 1 }, { kind: 'odd', n: 3 }]);
});

test('occupancy is a case, with the rows as a NonEmpty when there are any', () => {
  assert.deepEqual(occupancy([]), { kind: 'empty' });
  assert.deepEqual(occupancy([null, 'a']), { kind: 'some', rows: [null, 'a'] });
});
