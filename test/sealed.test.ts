// The hole types cannot see. Every laundering below compiles without an
// assertion, because TypeScript types Object.assign and structuredClone as
// preserving the input type; only the runtime brand check in the readers can
// reject them. These tests pin that it does, that an opened payload is
// frozen, and that evidence sealed for one read is read once.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Sealed, registry, spendOnce } from '../src/sealed.js';

const AUTHORITY: unique symbol = Symbol('authority');
type Verdict = { readonly kind: 'go' | 'stop'; readonly reasons: readonly string[] };
type Decision = Sealed<typeof AUTHORITY, Verdict>;

const verdict: Verdict = { kind: 'go', reasons: ['tests pass'] };
const decide = (): Decision => new Sealed(AUTHORITY, verdict, 'open');
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

test('the freeze reaches symbol-keyed and non-enumerable children, and leaves accessors unread', () => {
  const KEY: unique symbol = Symbol('key');
  const child = { n: 1 };
  const hidden = { m: 2 };
  const payload: { readonly a: { readonly n: number } } = { a: { n: 0 } };
  Object.defineProperty(payload, KEY, { value: child, enumerable: false });
  Object.defineProperty(payload, 'hidden', { value: hidden, enumerable: false });
  const reads: number[] = [];
  Object.defineProperty(payload, 'computed', {
    get: () => {
      reads.push(1);
      return { never: 'frozen' };
    },
  });
  const FREEZE: unique symbol = Symbol('freeze');
  const sealed = new Sealed(FREEZE, payload, 'open');
  const opened = Sealed.open(FREEZE, sealed);
  assert.ok(Object.isFrozen(opened));
  assert.ok(Object.isFrozen(opened.a));
  assert.ok(Object.isFrozen(child), 'a symbol-keyed child is frozen');
  assert.ok(Object.isFrozen(hidden), 'a non-enumerable child is frozen');
  assert.equal(reads.length, 0, 'an accessor is not read by the freeze');
});

test('a value the kernel froze is not walked again', () => {
  const inner = { n: 1 };
  const FIRST: unique symbol = Symbol('first');
  new Sealed(FIRST, { inner }, 'open');
  const later = { m: 2 };
  // a frozen object cannot gain a property, so a second walk through `inner`
  // could not reach `later` either way; what the remembered set changes is
  // that the walk stops at `inner` without re-reading its descriptors.
  const outer = { inner, later };
  new Sealed(FIRST, outer, 'open');
  assert.ok(Object.isFrozen(later));
  assert.ok(Object.isFrozen(outer));
});

// --- the readers a generated FFI uses ------------------------------------------

test('spendOnce reads a value once; the second read of the same value halts, through the spent set Sealed.spend keeps', () => {
  const receipt = { token: 't' };
  assert.equal(spendOnce(receipt), receipt);
  assert.throws(() => spendOnce(receipt), /spent once/);
  const resumption = (): number => 1;
  assert.equal(spendOnce(resumption), resumption);
  assert.throws(() => spendOnce(resumption), /spent once/);
});

test('a registry reads back what was minted under a value, frozen, and nothing for a value it did not mint', () => {
  const receipts = registry<{ readonly fileId: string; readonly bytes: number }>('fenced');
  const owner = {};
  const key = { file_id: 'f', bytes: 1 };
  const fields = { fileId: 'f', bytes: 1 };
  assert.equal(receipts.mint(key, fields, owner), key);
  assert.equal(receipts.read(key), fields);
  assert.ok(Object.isFrozen(receipts.read(key)));
  const copy = { ...key }; // the same shape, another identity: what a copy-with-update in the core produces
  assert.throws(() => receipts.read(copy), /fenced: a value the shell did not mint/);
  assert.throws(() => receipts.read({}), /did not mint/);
});

test('a registry answers, per owner, what was minted and never spent', () => {
  const receipts = registry<{ readonly id: number }>('receipt');
  const first = {};
  const second = {};
  const a = receipts.mint({ k: 1 }, { id: 1 }, first);
  const b = receipts.mint({ k: 2 }, { id: 2 }, first);
  receipts.mint({ k: 3 }, { id: 3 }, second);
  assert.deepEqual(receipts.outstanding(first), [{ id: 1 }, { id: 2 }]);
  spendOnce(a);
  assert.deepEqual(receipts.outstanding(first), [{ id: 2 }]);
  spendOnce(b);
  assert.deepEqual(receipts.outstanding(first), []);
  assert.deepEqual(receipts.outstanding(second), [{ id: 3 }]); // another attempt's receipt is its own
  assert.deepEqual(receipts.outstanding({}), []); // an owner that minted nothing
  assert.ok(Object.isFrozen(receipts.outstanding(second)));
});
