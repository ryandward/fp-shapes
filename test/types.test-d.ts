// Type tests, checked by `tsc`. Each `@ts-expect-error` line must fail to
// compile; if a change to the library lets it compile, tsc reports the
// directive as unused and the build fails.

import { z } from 'zod';
import { decoder } from '../src/decode.js';
import { Opaque } from '../src/opaque.js';
import { program, type Program } from '../src/program.js';
import type { Equal, Expect, IsComplete, IsDeepReadonly, Recursive } from '../src/types.js';
import { match, nonEmpty, type Union } from '../src/union.js';

// --- unions -------------------------------------------------------------------

type ShapeCases = { circle: { readonly r: number }; square: { readonly side: number } };
type Shape = Union<ShapeCases>;

// @ts-expect-error match requires a handler for every case
export const partial = match<ShapeCases, number>({ circle: ({ r }) => r });

declare const both: { readonly kind: 'circle'; readonly r: number; readonly side: number };
// @ts-expect-error a case cannot carry another case's fields
export const mixed: Shape = both;

// @ts-expect-error nonEmpty takes defined elements
export const holes = nonEmpty([undefined]);

// --- opaque types ---------------------------------------------------------------

declare const A: unique symbol;
declare const B: unique symbol;
type Id = { readonly id: string };
declare const a: Opaque<typeof A, Id>;
declare const b: Opaque<typeof B, Id>;
declare const aOnce: Opaque<typeof A, Id, 'once'>;

// @ts-expect-error a value of one tag is not a value of another
export const crossed: Opaque<typeof A, Id> = b;
// @ts-expect-error an object literal is not an opaque value
export const literal: Opaque<typeof A, Id> = { id: 'x' };
// @ts-expect-error a spread copy is not an opaque value
export const spread: Opaque<typeof A, Id> = { ...a };
// @ts-expect-error the payload is private
export const peek = a.value;
// @ts-expect-error unwrap needs the tag the value was created with
export const wrongTag = Opaque.unwrap(B, a);
// @ts-expect-error a single-use value is read with consume, not unwrap
export const reread = Opaque.unwrap(A, aOnce);
// @ts-expect-error a reusable value is read with unwrap, not consume
export const consumedMany = Opaque.consume(A, a);
// @ts-expect-error a single-use value is not a reusable one
export const relabel: Opaque<typeof A, Id> = aOnce;
// @ts-expect-error the payload type is exact: a wider payload is not accepted
export const wider: Opaque<typeof A, Id> = new Opaque(A, { id: 'x', extra: 1 }, 'many');

// --- type checks -----------------------------------------------------------------

type Tree = { readonly value: number; readonly children: readonly Tree[] };
type Deep = { readonly a: { readonly b: { readonly c: readonly { readonly d: string }[] } } };

export type _1 = Expect<IsComplete<Deep>>;
export type _2 = Expect<IsDeepReadonly<Deep>>;
export type _3 = Expect<IsComplete<Shape>>; // forbidden fields of other cases are not gaps
export type _4 = Expect<Equal<IsComplete<{ readonly a?: string }>, false>>;
export type _5 = Expect<Equal<IsComplete<{ readonly a: string | undefined }>, false>>;
export type _6 = Expect<Equal<IsComplete<{ readonly a: unknown }>, false>>;
export type _7 = Expect<Equal<IsComplete<{ readonly a: Record<string, string> }>, false>>;
export type _8 = Expect<Equal<IsComplete<{ readonly a: Date }>, false>>;
export type _9 = Expect<Equal<IsComplete<{ readonly a: () => void }>, false>>;
export type _10 = Expect<Equal<IsComplete<{}>, false>>;
export type _11 = Expect<Equal<IsComplete<Opaque<typeof A, { readonly a?: string }>>, false>>; // checked through to the payload
export type _12 = Expect<Equal<IsComplete<Tree>, Recursive<Tree>>>;
export type _13 = Expect<Equal<Recursive<Tree>['recursive through'], 'children'>>;
export type _14 = Expect<Equal<IsDeepReadonly<{ readonly a: string[] }>, false>>;
export type _15 = Expect<Equal<IsDeepReadonly<{ a: string }>, false>>;
export type _16 = Expect<Equal<IsComplete<{ readonly id: string; readonly note?: string }>, false>>;
export type _17 = Expect<IsComplete<{ readonly owner: Opaque<typeof A, Id> }>>;

// --- decoders ---------------------------------------------------------------------

export const good = decoder(z.strictObject({ id: z.string(), tags: z.array(z.string()).readonly() }).readonly());
// @ts-expect-error a decoder's output has no optional fields
export const optional = decoder(z.object({ id: z.string().optional() }).readonly());
// @ts-expect-error a decoder's output is readonly
export const mutable = decoder(z.object({ id: z.string() }));

// --- programs and resources ----------------------------------------------------------

type Key = { readonly id: string };
type Door = {
  readonly lock: { readonly input: {}; readonly output: { locked: { readonly key: Key }; busy: {} }; readonly acquires: { readonly locked: 'key' }; readonly releases: never };
  readonly unlock: { readonly input: { readonly key: Key }; readonly output: { unlocked: {} }; readonly acquires: {}; readonly releases: 'key' };
  readonly knock: { readonly input: {}; readonly output: { answered: {} }; readonly acquires: {}; readonly releases: never };
};
const { pure, perform } = program<Door, string>();
type P<Held> = Program<Door, string, Held>;

export const correct = (): P<{}> =>
  perform('lock', {}, {
    locked: ({ key }) => perform('unlock', { key }, { unlocked: () => pure('done') }),
    busy: () => pure('busy'),
  });

const unlock = (key: Key): P<{ key: true }> => perform('unlock', { key }, { unlocked: () => pure('done') });
export const unlockOnce = unlock;

// @ts-expect-error a path that acquires the key must release it before finishing
export const leaked = (): P<{}> => perform('lock', {}, { locked: () => pure('done'), busy: () => pure('busy') });

// @ts-expect-error the key cannot be released twice
export const releasedTwice = (key: Key): P<{ key: true }> => perform('unlock', { key }, { unlocked: () => perform('unlock', { key }, { unlocked: () => pure('done') }) });

// @ts-expect-error the key cannot be released before it is acquired
export const releasedEarly = (key: Key): P<{}> => perform('unlock', { key }, { unlocked: () => pure('done') });

// @ts-expect-error the key cannot be acquired again while it is held
export const acquiredTwice = (key: Key): P<{ key: true }> => perform('lock', {}, { locked: () => unlock(key), busy: () => unlock(key) });

// @ts-expect-error a held resource is carried through operations that do not release it
export const forgotten = (): P<{}> => perform('lock', {}, { locked: () => perform('knock', {}, { answered: () => pure('done') }), busy: () => pure('busy') });

// @ts-expect-error a program holding nothing is not a program holding the key
export const relabelled: P<{ key: true }> = pure('done');
