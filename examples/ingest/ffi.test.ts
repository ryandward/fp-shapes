// The FFI's own guarantees, exercised from the shell's side without the
// interpreter: what crosses into the core is parsed, copied and frozen; what
// crosses out is frozen; a step is resumed once; and a halt names the issue.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { start, type Step, type TargetOutcome, type TransferOutcome } from './boundary/ingest.ffi.js';
import type { Variant } from '../../src/variant.js';

const ready: Variant<TargetOutcome> = { kind: 'ready', uri: 'https://example.org/a.bam', destKey: 'files/a.bam' };
const claimed = { kind: 'claimed', c: { fileId: 'f-1', token: 't-1' } } as const;

const expect = <K extends keyof Step>(step: Variant<Step>, kind: K): Extract<Variant<Step>, { readonly kind: K }> => {
  if (step.kind !== kind) throw new Error(`expected ${kind}, got ${step.kind}`);
  return step as Extract<Variant<Step>, { readonly kind: K }>;
};

const atTransfer = () => {
  const claim = expect(expect(start('f-1'), 'await_target').resume(ready), 'await_claim');
  return expect(claim.resume(claimed), 'await_transfer');
};

test('the attempt begins suspended on the first command, carrying its argument', () => {
  const step = expect(start('f-1'), 'await_target');
  assert.equal(step.fileId, 'f-1');
  assert.ok(Object.isFrozen(step));
});

test('an outcome is parsed on its way in: a field of the wrong type halts the attempt, naming it', () => {
  const step = expect(start('f-1'), 'await_target');
  const wrong = { kind: 'ready', uri: 1, destKey: 'files/a.bam' } as unknown as Variant<TargetOutcome>;
  assert.throws(() => step.resume(wrong), /target: uri: /);
});

test('an outcome with a key its case does not declare halts the attempt', () => {
  const step = expect(start('f-1'), 'await_target');
  const extra = { kind: 'gone', hidden: 1 } as unknown as Variant<TargetOutcome>;
  assert.throws(() => step.resume(extra), /target: /);
});

test('an outcome of a kind the operation does not have halts the attempt', () => {
  const step = expect(start('f-1'), 'await_target');
  const foreign = { kind: 'claimed', c: { fileId: 'f-1', token: 't' } } as unknown as Variant<TargetOutcome>;
  assert.throws(() => step.resume(foreign), /target: kind: /);
});

test('an int is a safe integer: a fraction, a string of digits and 2^53 are each refused', () => {
  for (const bytes of [1.5, '48', 2 ** 53, Number.NaN]) {
    const transfer = atTransfer();
    const outcome = { kind: 'transferred', bytes } as unknown as Variant<TransferOutcome>;
    assert.throws(() => transfer.resume(outcome), /transfer: bytes: /, String(bytes));
  }
  assert.equal(atTransfer().resume({ kind: 'transferred', bytes: 2 ** 53 - 1 }).kind, 'await_fence');
});

test('a value handed in is copied: changing the object afterwards changes nothing the core carries', () => {
  const target = expect(start('f-1'), 'await_target');
  const outcome = { kind: 'ready', uri: 'https://example.org/a.bam', destKey: 'files/a.bam' };
  const claim = expect(target.resume(outcome as Variant<TargetOutcome>), 'await_claim');
  outcome.uri = 'https://elsewhere.example/b.bam';
  outcome.destKey = 'files/b.bam';
  const transfer = expect(claim.resume(claimed), 'await_transfer');
  assert.equal(transfer.uri, 'https://example.org/a.bam');
  assert.equal(transfer.destKey, 'files/a.bam');
});

test('what crosses out is frozen all the way down: the step, and the receipt it carries', () => {
  const transfer = atTransfer();
  assert.ok(Object.isFrozen(transfer));
  assert.ok(Object.isFrozen(transfer.c));
  assert.deepEqual(transfer.c, { fileId: 'f-1', token: 't-1' });
});

test('a step is resumed once: the second resumption of the same step halts', () => {
  const target = expect(start('f-1'), 'await_target');
  assert.equal(target.resume(ready).kind, 'await_claim');
  assert.throws(() => target.resume({ kind: 'gone' }), /spent once/);
});

test('a receipt the shell minted comes back as what it minted, and only that', () => {
  const transfer = atTransfer();
  const fence = expect(transfer.resume({ kind: 'transferred', bytes: 48 }), 'await_fence');
  const finalize = expect(fence.resume({ kind: 'held', f: { fileId: 'f-1', bytes: 48 } }), 'await_finalize');
  assert.deepEqual(finalize.f, { fileId: 'f-1', bytes: 48 });
  const settle = expect(finalize.resume({ kind: 'finalized', z: { fileId: 'f-1', bytes: 48 } }), 'await_settle');
  assert.deepEqual(settle.c, { fileId: 'f-1', token: 't-1' });
  assert.deepEqual(settle.z, { fileId: 'f-1', bytes: 48 });
  const done = expect(settle.resume({ kind: 'settle_done' }), 'done');
  assert.deepEqual(done.status, { kind: 'succeeded', bytes: 48 });
});

test('two attempts on one file are independent: each holds its own claim and its own steps', () => {
  const first = atTransfer();
  const second = atTransfer();
  assert.notEqual(first, second);
  assert.equal(expect(first.resume({ kind: 'transferred', bytes: 1 }), 'await_fence').bytes, 1);
  assert.equal(expect(second.resume({ kind: 'transferred', bytes: 2 }), 'await_fence').bytes, 2);
});
