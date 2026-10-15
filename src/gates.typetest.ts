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
import { boundary } from './boundary/boundary.js';
import { occupancy } from './boundary/evidence.js';
import { Sealed } from './sealed.js';
import type { Assert, Equal, Exact, Immutable, Total } from './total.js';
import type { Deep, Recursive } from './total.js';
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
export const fresh: Sealed<typeof _A, Fact> = new Sealed(Symbol('a'), { n: 1 });

// @ts-expect-error a spread of a sealed value is plain data
export const copied: Sealed<typeof _A, Fact> = { ...sealedA };

// @ts-expect-error a sealed payload is read through Sealed.open
export const peeked = sealedA.value;

// @ts-expect-error Sealed.open takes the authority that sealed the value
export const misopened = Sealed.open(B, sealedA);

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
export const sparse = boundary(z.object({ a: z.string().optional() }).readonly(), (x) => x);

// @ts-expect-error a boundary schema declares .readonly()
export const mutable = boundary(z.object({ a: z.string() }), (x) => x);

// @ts-expect-error a boundary schema's output nests through at most four containers
export const nested = boundary(z.object({ a: z.object({ b: z.object({ c: z.array(z.object({ d: z.string() }).readonly()).readonly() }).readonly() }).readonly() }).readonly(), (x) => x);

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
export type _r5 = Assert<Total<Four>>; // four containers on a path is a fact
export type _r6 = Assert<Immutable<Four>>;
export type _r7 = Assert<Equal<Total<Five>, Deep<Five>>>; // a fifth is not; this is depth, not recursion
export type _r8 = Assert<Equal<Immutable<Five>, Deep<Five>>>;
export type _r9 = Assert<Equal<Deep<Five>['a fact is shallow; this one nests past four containers through'], 'a'>>;
export type _r10 = Assert<Equal<Deep<Wide>['a fact is shallow; this one nests past four containers through'], never>>; // width is not depth
export type _r11 = Assert<Total<Wide>>;

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
