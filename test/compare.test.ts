// Structural sameness of facts, as a decision with the path to the difference.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compare } from '../src/boundary/compare.js';
import { Sealed } from '../src/sealed.js';

type Fact = { readonly id: string; readonly rows: ReadonlyArray<{ readonly n: number; readonly tags: ReadonlyArray<string> }>; readonly ratio: number };
const fact = (): Fact => ({ id: 'a', rows: [{ n: 1, tags: ['x'] }, { n: 2, tags: [] }], ratio: NaN });

test('two facts built separately are the same; identity is not the question', () => {
  const a = fact();
  const b = fact();
  assert.notEqual(a, b);
  assert.deepEqual(compare(a, b), { kind: 'same' });
});

test('a difference names the path to the first leaf that differs', () => {
  assert.deepEqual(compare(fact(), { ...fact(), rows: [{ n: 1, tags: ['z'] }, { n: 2, tags: [] }] }), { kind: 'differs', at: ['rows', '0', 'tags', '0'] });
});

test('a collection of another length differs at the collection', () => {
  assert.deepEqual(compare(fact(), { ...fact(), rows: [] }), { kind: 'differs', at: ['rows'] });
});

test('NaN is the same as itself, as a leaf', () => {
  assert.deepEqual(compare({ x: NaN }, { x: NaN }), { kind: 'same' });
  assert.deepEqual(compare({ x: 0 }, { x: -0 }), { kind: 'differs', at: ['x'] });
});

test('sealed values compare by identity; the owner compares payloads', () => {
  const TAG: unique symbol = Symbol('tag');
  const one = new Sealed(TAG, { n: 1 }, 'open');
  const same = new Sealed(TAG, { n: 1 }, 'open');
  assert.deepEqual(compare({ evidence: one }, { evidence: one }), { kind: 'same' });
  assert.deepEqual(compare({ evidence: one }, { evidence: same }), { kind: 'differs', at: ['evidence'] });
});
