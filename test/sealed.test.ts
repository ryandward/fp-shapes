// The hole types cannot see. Every laundering below compiles without an
// assertion, because TypeScript types Object.assign and structuredClone as
// preserving the input type; only the runtime brand check in the readers can
// reject them. These tests pin that it does, that an opened payload is
// frozen, and that evidence sealed for one read is read once.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Sealed } from '../src/sealed.js';

const AUTHORITY: unique symbol = Symbol('authority');
type Verdict = { readonly kind: 'go' | 'stop'; readonly reasons: readonly string[] };
type Decision = Sealed<typeof AUTHORITY, Verdict>;

const decide = (): Decision => new Sealed(AUTHORITY, { kind: 'go', reasons: ['tests pass'] }, 'open');
const open = (d: Decision): Verdict => Sealed.open(AUTHORITY, d);

test('a genuine value opens to its payload', () => {
  assert.deepEqual(open(decide()), { kind: 'go', reasons: ['tests pass'] });
});

test('Object.assign({}, sealed) compiles as sealed and is rejected at open', () => {
  const laundered = Object.assign({}, decide());
  assert.throws(() => open(laundered), /sealed by this authority/);
});

test('structuredClone(sealed) compiles as sealed and is rejected at open', () => {
  const cloned = structuredClone(decide());
  assert.throws(() => open(cloned), /sealed by this authority/);
});

test('a value from another authority, merged into the type, is rejected at open', () => {
  const other = new Sealed(Symbol('other'), { n: 0 }, 'open');
  const crossed = Object.assign(other, decide());
  assert.throws(() => open(crossed), /sealed by this authority/);
});

test('mutating the public surface cannot reach the payload', () => {
  const decision = decide();
  Object.assign(decision, { value: { kind: 'stop', reasons: [] } });
  assert.deepEqual(open(decision), { kind: 'go', reasons: ['tests pass'] });
});

test('an opened payload and the arrays it holds are frozen', () => {
  const verdict = open(decide());
  assert.ok(Object.isFrozen(verdict));
  assert.ok(Object.isFrozen(verdict.reasons));
  assert.throws(() => Object.assign(verdict, { kind: 'stop' }), TypeError);
});

test('a payload is frozen all the way down, including a nested object no boundary froze', () => {
  const NESTED: unique symbol = Symbol('nested');
  const inner = { status: { kind: 'go', tags: ['a'] } };
  const sealed = new Sealed(NESTED, { wrapper: inner }, 'open');
  const opened = Sealed.open(NESTED, sealed);
  assert.ok(Object.isFrozen(opened.wrapper));
  assert.ok(Object.isFrozen(opened.wrapper.status));
  assert.ok(Object.isFrozen(opened.wrapper.status.tags));
  assert.throws(() => Object.assign(opened.wrapper.status, { kind: 'stop' }), TypeError);
});

test('provenance names the authority', () => {
  assert.equal(decide().provenance, 'authority');
});

const ONCE: unique symbol = Symbol('once');
type Receipt = Sealed<typeof ONCE, { readonly written: number }, 'spend'>;
const issue = (): Receipt => new Sealed(ONCE, { written: 3 }, 'spend');

test('evidence sealed for one read is read once; the second spend halts', () => {
  const receipt = issue();
  assert.deepEqual(Sealed.spend(ONCE, receipt), { written: 3 });
  assert.throws(() => Sealed.spend(ONCE, receipt), /not yet spent; this was/);
});

test('a second holder of the same spent evidence is refused, whatever route it took', () => {
  const receipt = issue();
  const holders: readonly [Receipt, Receipt] = [receipt, receipt]; // an alias through a collection
  Sealed.spend(ONCE, holders[0]);
  assert.throws(() => Sealed.spend(ONCE, holders[1]), /not yet spent; this was/);
});

test('a laundered copy of spent evidence fails the brand check before the spent set', () => {
  const laundered = Object.assign({}, issue());
  assert.throws(() => Sealed.spend(ONCE, laundered), /sealed for one read by this authority/);
});

test('held evidence is read any number of times', () => {
  const decision = decide();
  assert.deepEqual(open(decision), open(decision));
});
