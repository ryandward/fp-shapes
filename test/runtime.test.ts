import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { decoder } from '../src/decode.js';
import { deepFreeze } from '../src/freeze.js';
import { Opaque } from '../src/opaque.js';
import { program, run, type Interpreter, type Program } from '../src/program.js';
import { match, nonEmpty, tryCatch, type Union } from '../src/union.js';

test('match calls the handler for the value’s case', () => {
  type Cases = { circle: { readonly r: number }; square: { readonly side: number } };
  const area = match<Cases, number>({ circle: ({ r }) => 3 * r * r, square: ({ side }) => side * side });
  assert.equal(area({ kind: 'square', side: 2 }), 4);
  assert.equal(area({ kind: 'circle', r: 1 }), 3);
});

test('nonEmpty and tryCatch return Option and Result', async () => {
  assert.deepEqual(nonEmpty([]), { kind: 'none' });
  assert.deepEqual(nonEmpty([1, 2]), { kind: 'some', value: [1, 2] });
  assert.deepEqual(await tryCatch(async () => 1), { kind: 'ok', value: 1 });
  const failed = await tryCatch(async () => Promise.reject('boom'));
  assert.equal(failed.kind, 'err');
  assert.equal(failed.kind === 'err' && failed.error.message, 'boom');
});

test('deepFreeze freezes nested, symbol-keyed and non-enumerable values without calling getters', () => {
  const hidden = { n: 1 };
  const sym = Symbol('s');
  const value = { a: { b: [{ c: 1 }] }, [sym]: { d: 1 } };
  Object.defineProperty(value, 'hidden', { value: hidden, enumerable: false });
  Object.defineProperty(value, 'getter', { get: () => assert.fail('getter was called'), enumerable: true });
  deepFreeze(value);
  assert.ok(Object.isFrozen(value.a.b[0]));
  assert.ok(Object.isFrozen(value[sym]));
  assert.ok(Object.isFrozen(hidden));
});

const TAG: unique symbol = Symbol('tag');
const OTHER: unique symbol = Symbol('other');

test('Opaque: unwrap returns the frozen payload; copies and other tags are rejected', () => {
  const x = new Opaque(TAG, { id: 'a', nested: { n: 1 } }, 'many');
  assert.equal(Opaque.unwrap(TAG, x).id, 'a');
  assert.ok(Object.isFrozen(Opaque.unwrap(TAG, x).nested));
  assert.throws(() => Opaque.unwrap(TAG, Object.assign({}, x)), TypeError);
  assert.throws(() => Opaque.unwrap(TAG, structuredClone(x)), TypeError);
  assert.throws(() => Opaque.unwrap(OTHER as unknown as typeof TAG, x), TypeError);
});

test('Opaque: a single-use value is consumed once, by any holder', () => {
  const token = new Opaque(TAG, { id: 't' }, 'once');
  const alias = token;
  assert.equal(Opaque.consume(TAG, token).id, 't');
  assert.throws(() => Opaque.consume(TAG, alias), /already consumed/);
});

test('decoder returns a frozen value with only the declared keys, or the issues', () => {
  const decode = decoder(z.object({ id: z.string(), tags: z.array(z.string()).readonly() }).readonly());
  const decoded = decode({ id: 'a', tags: ['x'], extra: 1 });
  assert.deepEqual(decoded, { kind: 'ok', value: { id: 'a', tags: ['x'] } });
  assert.ok(decoded.kind === 'ok' && Object.isFrozen(decoded.value.tags));
  const rejected = decode({ id: 1 });
  assert.equal(rejected.kind, 'err');
  assert.deepEqual(rejected.kind === 'err' && rejected.error.map((i) => i.path), ['id', 'tags']);
});

// A door that is locked with a single-use key and unlocked with it.
const KEY: unique symbol = Symbol('key');
type Key = Opaque<typeof KEY, { readonly id: string }, 'once'>;
type Door = {
  readonly lock: { readonly input: { readonly who: string }; readonly output: { locked: { readonly key: Key }; busy: {} }; readonly acquires: { readonly locked: 'key' }; readonly releases: never };
  readonly unlock: { readonly input: { readonly key: Key }; readonly output: { unlocked: {} }; readonly acquires: {}; readonly releases: 'key' };
};
type Visit = Union<{ visited: { readonly who: string }; turnedAway: {} }>;
const { pure, perform } = program<Door, Visit>();

const visit = (who: string): Program<Door, Visit, {}> =>
  perform('lock', { who }, {
    locked: ({ key }) => perform('unlock', { key }, { unlocked: () => pure({ kind: 'visited', who }) }),
    busy: () => pure({ kind: 'turnedAway' }),
  });

const door = (busy: boolean): Interpreter<Door> => ({
  lock: async () => (busy ? { kind: 'busy' } : { kind: 'locked', key: new Opaque(KEY, { id: 'k1' }, 'once') }),
  unlock: async ({ key }) => {
    Opaque.consume(KEY, key);
    return { kind: 'unlocked' };
  },
});

test('run performs each operation, feeds the output to its continuation, and logs both', async () => {
  const outcome = await run(door(false), visit('ann'));
  assert.equal(outcome.kind, 'completed');
  assert.deepEqual(outcome.kind === 'completed' && outcome.value, { kind: 'visited', who: 'ann' });
  assert.deepEqual(outcome.log.map((e) => e.kind), ['lock', 'unlock']);
});

test('run follows the continuation for the case the interpreter returned', async () => {
  const outcome = await run(door(true), visit('bob'));
  assert.deepEqual(outcome.kind === 'completed' && outcome.value, { kind: 'turnedAway' });
  assert.deepEqual(outcome.log.map((e) => e.kind), ['lock']);
});

test('run returns the error and the log so far when the interpreter throws', async () => {
  const broken: Interpreter<Door> = { ...door(false), unlock: async () => Promise.reject(new Error('jammed')) };
  const outcome = await run(broken, visit('cy'));
  assert.equal(outcome.kind, 'failed');
  assert.equal(outcome.kind === 'failed' && outcome.error.message, 'jammed');
  assert.deepEqual(outcome.log.map((e) => e.kind), ['lock']);
});

test('programs are frozen values; nothing runs until run is called', () => {
  const p = visit('dee');
  assert.ok(Object.isFrozen(p));
  assert.equal(p.kind, 'perform');
});
