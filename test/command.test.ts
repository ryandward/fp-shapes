// The interpreter: it performs the operation each step names, resumes with
// the outcome, notes both in order, and halts with the ledger so far when a
// performer throws. The linearity of what is owed is the compiler's (see
// src/gates.typetest.ts); here is what happens at runtime.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commands, drive, type Effects, type Step } from '../src/command.js';
import type { Variant } from '../src/variant.js';

type Token = { readonly id: string };
type Gate = {
  readonly open: { readonly args: { readonly name: string }; readonly outcome: { opened: { readonly token: Token }; shut: {} }; readonly issues: { readonly opened: 'token' }; readonly spends: never };
  readonly close: { readonly args: { readonly token: Token }; readonly outcome: { closed: {}; stuck: { readonly why: string } }; readonly issues: {}; readonly spends: 'token' };
};
type Ended = { passed: { readonly name: string }; blocked: { readonly why: string } };
const gate = commands<Gate, Variant<Ended>>();

const through = (name: string): Step<Gate, Variant<Ended>, {}> =>
  gate.suspend('open', { name }, {
    opened: ({ token }) =>
      gate.suspend('close', { token }, {
        closed: () => gate.done({ kind: 'passed', name }),
        stuck: ({ why }) => gate.done({ kind: 'blocked', why }),
      }),
    shut: () => gate.done({ kind: 'blocked', why: 'shut' }),
  });

const scripted = (opened: Variant<Gate['open']['outcome']>, closed: Variant<Gate['close']['outcome']>): Effects<Gate> => ({
  open: async () => opened,
  close: async () => closed,
});

test('a run performs each operation in turn and finishes with the status and the ledger', async () => {
  const token = { id: 't-1' };
  const run = await drive(scripted({ kind: 'opened', token }, { kind: 'closed' }), through('a'));
  assert.deepEqual(run, {
    kind: 'finished',
    status: { kind: 'passed', name: 'a' },
    ledger: [
      { kind: 'open', args: { name: 'a' }, outcome: { kind: 'opened', token } },
      { kind: 'close', args: { token }, outcome: { kind: 'closed' } },
    ],
  });
  if (run.kind !== 'finished') throw new Error('unreached');
  run.ledger.forEach((entry) => assert.ok(Object.isFrozen(entry)));
  assert.ok(Object.isFrozen(run.ledger));
});

test('an answer the arm folds ends the run early, with only the operations that ran in the ledger', async () => {
  const run = await drive(scripted({ kind: 'shut' }, { kind: 'closed' }), through('b'));
  assert.deepEqual(run, { kind: 'finished', status: { kind: 'blocked', why: 'shut' }, ledger: [{ kind: 'open', args: { name: 'b' }, outcome: { kind: 'shut' } }] });
});

test('a performer that throws halts the run with the error and the ledger so far', async () => {
  const fx: Effects<Gate> = {
    open: async () => ({ kind: 'opened', token: { id: 't' } }),
    close: async () => {
      throw new Error('the latch jammed');
    },
  };
  const run = await drive(fx, through('c'));
  if (run.kind !== 'halted') throw new Error('the run must halt');
  assert.equal(run.error.message, 'the latch jammed');
  assert.deepEqual(
    run.ledger.map((entry) => entry.kind),
    ['open'],
  );
});

test('a performer that throws a non-error halts with it wrapped as one', async () => {
  const fx: Effects<Gate> = {
    open: async () => {
      throw 'no gate here';
    },
    close: async () => ({ kind: 'closed' }),
  };
  const run = await drive(fx, through('d'));
  if (run.kind !== 'halted') throw new Error('the run must halt');
  assert.equal(run.error.message, 'no gate here');
  assert.deepEqual(run.ledger, []);
});

test('a step is frozen, and done carries its status', () => {
  const step = gate.done({ kind: 'passed', name: 'e' });
  assert.ok(Object.isFrozen(step));
  assert.equal(step.kind, 'done');
  const waiting = through('f');
  assert.equal(waiting.kind, 'await_open');
});
