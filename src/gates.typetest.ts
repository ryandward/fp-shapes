// Gates. Compiled, run by tsc.
//
// Each `@ts-expect-error` line states a guarantee and holds a line that the
// guarantee rules out. While the guarantee holds, the line errors and the
// directive is used; if the guarantee weakens, the line compiles and tsc
// reports the directive as unused, which fails the build at this exact line.
// Every binding is exported, so the only error a line can produce is the one
// its guarantee describes. Each line can fail in exactly one way.
//
// These gates cover the library's mechanisms. An application's gates (that a
// particular authority stays private, that a particular writer takes a
// particular receipt) live beside the application; see examples/*/gates.typetest.ts.

import { z } from 'zod';
import { boundary, sealing, type Boundary } from './boundary/boundary.js';
import { commands, type Step } from './command.js';
import { occupancy } from './boundary/evidence.js';
import { Sealed } from './sealed.js';
import type { Assert, Equal, Exact, Immutable, Total } from './total.js';
import type { Recursive } from './total.js';
import { fold, partition, type Classify, type Variant } from './variant.js';

// --- provenance: a Sealed value comes from its authority and is read through it

declare const _A: unique symbol;
declare const B: unique symbol;
type Fact = { readonly n: number };
declare const sealedA: Sealed<typeof _A, Fact>;
declare const sealedB: Sealed<typeof B, Fact>;

// @ts-expect-error a value sealed by one authority is not a value sealed by another
export const crossed: Sealed<typeof _A, Fact> = sealedB;

// @ts-expect-error a value sealed under a fresh symbol is not sealed by a declared authority
export const fresh: Sealed<typeof _A, Fact> = new Sealed(Symbol('a'), { n: 1 }, 'open');

// @ts-expect-error a spread of a sealed value is plain data
export const copied: Sealed<typeof _A, Fact> = { ...sealedA };

// @ts-expect-error a sealed payload is read through Sealed.open
export const peeked = sealedA.value;

// @ts-expect-error Sealed.open takes the authority that sealed the value
export const misopened = Sealed.open(B, sealedA);

// --- evidence is held or spent, as its owner declared ----------------------------

declare const onceA: Sealed<typeof _A, Fact, 'spend'>;

// @ts-expect-error evidence sealed for one read is not held evidence
export const relabelled: Sealed<typeof _A, Fact, 'open'> = onceA;

// @ts-expect-error held evidence is read with open, not spent
export const misspent = Sealed.spend(B, sealedB);

// @ts-expect-error evidence sealed for one read is spent, not opened
export const reread = Sealed.open(_A, onceA);

// --- variants: every case handled, each case carrying its own fields --------

type Shape = { circle: { readonly r: number }; square: { readonly side: number } };
declare const smuggled: { readonly kind: 'circle'; readonly r: number; readonly side: number };

// @ts-expect-error a fold handles every case
export const partial = fold<Shape, number>({ circle: ({ r }) => r });

// @ts-expect-error a case carries its own fields only
export const posing: Variant<Shape> = smuggled;

declare const classify: Classify<number, Shape>;

// @ts-expect-error a partition names every bucket up front
export const halved = partition(classify, { circle: [] });

// --- evidence comes from defined elements -------------------------------------

// @ts-expect-error evidence is built from defined elements
export const nothing = occupancy([undefined]);

// --- a boundary schema is total and readonly ----------------------------------

// @ts-expect-error a boundary schema decides every absence (.default() or .nullable())
export const sparse = boundary(z.object({ a: z.string().optional() }).readonly());

// @ts-expect-error a boundary schema declares .readonly()
export const mutable = boundary(z.object({ a: z.string() }));

export const nested = boundary(z.object({ a: z.object({ b: z.object({ c: z.array(z.object({ d: z.string() }).readonly()).readonly() }).readonly() }).readonly() }).readonly()); // nesting is the model's business

// --- what an owner seals is exactly what it declares ----------------------------

type IdFact = { readonly id: string };
declare const parseIdFact: Boundary<IdFact>;

// @ts-expect-error a sealed payload is exactly the declared type; a wider one is not sealed as it
export const widened: Sealed<typeof _A, IdFact> = new Sealed(_A, { id: 'a', hidden: 1 }, 'open');

// @ts-expect-error sealing takes a seal that returns a sealed value; a plain fact, however total, is not one
export const unsealed = sealing(parseIdFact, (f): IdFact => f);

// @ts-expect-error a sealed payload is a fact: total and readonly
export const dated = sealing(parseIdFact, (f) => new Sealed(_A, { id: f.id, when: new Date() }, 'open'));

export const sealedId: Boundary<Sealed<typeof _A, IdFact>> = sealing(parseIdFact, (f) => new Sealed(_A, f, 'open'));

// --- a fact is finite ---------------------------------------------------------

type Cause = { died: { readonly diagnostic: string }; exhausted: { readonly last: Variant<Cause> } };
type Tree = { readonly v: number; readonly kids: readonly Tree[] };
type Four = { readonly a: { readonly c: readonly { readonly d: string }[] } }; // a record, a sub-record, a collection, its element
type Five = { readonly a: { readonly b: { readonly c: readonly { readonly d: string }[] } } };
type Wide = { readonly a: { readonly x: number }; readonly b: { readonly y: { readonly z: number } } };

export type _r1 = Assert<Equal<Total<Variant<Cause>>, Recursive<Variant<Cause>>>>; // names 'last'
export type _r2 = Assert<Equal<Total<Tree>, Recursive<Tree>>>; // names 'kids'
export type _r3 = Assert<Equal<Immutable<Variant<Cause>>, Recursive<Variant<Cause>>>>;
export type _r4 = Assert<Equal<Recursive<Variant<Cause>>['a fact is finite; this one contains its own kind through'], 'last'>>;
export type _r5 = Assert<Total<Four>>; // nesting is the model's business: four containers on a path is a fact
export type _r6 = Assert<Immutable<Four>>;
export type _r7 = Assert<Total<Five>>; // and so is a fifth; depth is not recursion
export type _r8 = Assert<Immutable<Five>>;
export type _r11 = Assert<Total<Wide>>;

// --- a sealed value is a fact: every assertion reads its payload ----------------

type Holding = { readonly status: Sealed<typeof _A, Variant<Cause>> };
export type _s1 = Assert<Equal<Total<Holding>, Recursive<Holding>>>; // sealing a shape does not hide its recursion
export type _s2 = Assert<Equal<Total<Sealed<typeof _A, { readonly n?: number }>>, false>>; // a sealed payload is total
export type _s3 = Assert<Equal<Immutable<Sealed<typeof _A, { n: number }>>, false>>; // a sealed payload is readonly
export type _s4 = Assert<Total<Sealed<typeof _A, Four>>>; // the envelope is not a container

declare const KEY: unique symbol;
export type _k1 = Assert<Equal<Total<{ readonly [KEY]: { readonly n: number } }>, false>>; // a fact's keys are names

// --- the assertion utilities are gates too ------------------------------------

type Brand = string & { readonly __brand: 'Id' };

export type _t1 = Assert<Equal<Total<undefined>, false>>;
export type _t2 = Assert<Equal<Total<unknown>, false>>;
export type _t3 = Assert<Equal<Total<readonly (string | undefined)[]>, false>>;
export type _t4 = Assert<Equal<Total<{ a?: string }>, false>>;
export type _t5 = Assert<Equal<Total<{ a: string | undefined }>, false>>;
export type _t6 = Assert<Equal<Total<{ kind: 'ok' } | { kind: 'bad'; reason?: string }>, false>>;
export type _t7 = Assert<Equal<Total<{ a: Record<string, string> }>, false>>;
export type _t8 = Assert<Equal<Total<{ a: Date }>, false>>;
export type _t9 = Assert<Equal<Total<{}>, false>>;
export type _t10 = Assert<Equal<Total<object>, false>>;
export type _t11 = Assert<Equal<Total<{ meta: {} }>, false>>;
export type _t12 = Assert<Equal<Total<{ a: string; b?: never }>, true>>; // an exclusion key is not a hole
export type _t13 = Assert<Equal<Total<{ id: Brand }>, true>>; // a branded primitive is a leaf
export type _t14 = Assert<Equal<Total<Variant<Shape>>, true>>;

export type _i1 = Assert<Equal<Immutable<{ a: string }>, false>>;
export type _i2 = Assert<Equal<Immutable<{ readonly a: string }>, true>>;
export type _i3 = Assert<Equal<Immutable<{ readonly a: string[] }>, false>>;
export type _i4 = Assert<Equal<Immutable<{ readonly a: readonly string[] }>, true>>;
export type _i5 = Assert<Equal<Immutable<{ readonly a: { b: string } }>, false>>;

export type _e1 = Assert<Equal<Exact<{ a: string }, { a: string; b: number }>, false>>;
export type _e2 = Assert<Equal<Exact<{ a?: string }, { a?: string }>, false>>; // optional on both sides
export type _e3 = Assert<Equal<Exact<{ a: string }, { a: string | number }>, false>>;
export type _e4 = Assert<Equal<Exact<{ a: string }, { readonly a: string }>, true>>; // shape, not mutability
export type _e5 = Assert<Equal<Exact<{ a: { b?: string } }, { a: { b?: string } }>, false>>; // nested optional

// --- linearity: what an attempt owes is in the type of its steps ------------

// A plane with one receipt: `open` issues it, `close` and `discard` spend it.
type Token = { readonly id: string };
type Gate = {
  readonly open: { readonly args: {}; readonly outcome: { opened: { readonly token: Token }; shut: {} }; readonly issues: { readonly opened: 'token' }; readonly spends: never };
  readonly close: { readonly args: { readonly token: Token }; readonly outcome: { closed: {} }; readonly issues: {}; readonly spends: 'token' };
  readonly discard: { readonly args: { readonly token: Token }; readonly outcome: { discarded: {} }; readonly issues: {}; readonly spends: 'token' };
  readonly ping: { readonly args: {}; readonly outcome: { pong: {} }; readonly issues: {}; readonly spends: never };
};
type GateStatus = { over: {} };
const gate = commands<Gate, Variant<GateStatus>>();
type GateStep<O> = Step<Gate, Variant<GateStatus>, O>;
const over: Variant<GateStatus> = { kind: 'over' };

// The shape that holds: a token issued is spent on every path, exactly once.
export const whole = (): GateStep<{}> =>
  gate.suspend('open', {}, {
    opened: ({ token }) => gate.suspend('close', { token }, { closed: () => gate.done(over) }),
    shut: () => gate.done(over),
  });

// @ts-expect-error a receipt issued is owed: the arm that received it cannot finish without spending it
export const dropped = (): GateStep<{}> => gate.suspend('open', {}, { opened: () => gate.done(over), shut: () => gate.done(over) });

const closed = (token: Token): GateStep<{ token: true }> => gate.suspend('close', { token }, { closed: () => gate.done(over) });
// @ts-expect-error a receipt is spent once: after close, nothing is owed for discard to spend
export const twice = (token: Token): GateStep<{ token: true }> => gate.suspend('close', { token }, { closed: () => gate.suspend('discard', { token }, { discarded: () => gate.done(over) }) });
export const once = closed;

// @ts-expect-error a receipt is spent after it is issued: nothing is owed yet
export const early = (token: Token): GateStep<{}> => gate.suspend('close', { token }, { closed: () => gate.done(over) });

// @ts-expect-error what is owed is carried through every operation between issue and spend: a drop after ping is still a drop
export const carried = (): GateStep<{}> => gate.suspend('open', {}, { opened: () => gate.suspend('ping', {}, { pong: () => gate.done(over) }), shut: () => gate.done(over) });

// @ts-expect-error a step owing nothing is not a step owing a token, and the reverse: the index is invariant
export const relabelled: GateStep<{ token: true }> = gate.done(over);

// @ts-expect-error a receipt is issued while none of its name is owed: a second open before the first token is spent has no name to run under
export const reissued = (token: Token): GateStep<{ token: true }> => gate.suspend('open', {}, { opened: () => closed(token), shut: () => closed(token) });
