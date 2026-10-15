// Type-level checks. Each evaluates to `true`, `false`, or (for a recursive
// type) a `Recursive<…>` object naming the property the recursion runs
// through. Use them with `Expect`:
//
//   type _ = Expect<IsComplete<Order>>;
//
// IsComplete<T>     no optional property, `undefined`, `null`-free gaps such as
//                   `unknown`/`any`/`never`, function, index signature, symbol
//                   key, `Date`, or open object (`{}`, `object`) anywhere inside
//                   T. A property declared `k?: never` (as union cases use to
//                   forbid other cases' fields) is not a gap.
// IsDeepReadonly<T> every property readonly and every array a ReadonlyArray,
//                   all the way down.
// Equal<A, B>       exact type equality.
//
// Opaque values are checked through to their payload.

import type { Opaque, Use } from './opaque.js';

type IsAny<T> = 0 extends 1 & T ? true : false;

type Primitive = string | number | boolean | bigint | symbol | null;

// `k?: never`: the key is forbidden, not optional. (An optional key of any
// other type reads as `T | undefined`, which the `undefined` check catches.)
type Forbidden<T, K extends keyof T> = [Exclude<T[K], undefined>] extends [never] ? true : false;

type Among<T, Seen extends readonly unknown[]> = true extends { [I in keyof Seen]: Equal<T, Seen[I]> }[number] ? true : false;

// 'recursive' if some container in T is its own ancestor.
type Walk<T, Seen extends readonly unknown[] = []> =
  IsAny<T> extends true ? 'finite'
  : [T] extends [never] ? 'finite'
  : T extends Opaque<symbol, infer P, Use> ? Walk<P, Seen>
  : T extends Primitive ? 'finite'
  : T extends (...args: never[]) => unknown ? 'finite'
  : Among<T, Seen> extends true ? 'recursive'
  : T extends readonly (infer E)[] ? Walk<E, [...Seen, T]>
  : T extends object ? { [K in keyof T]-?: Walk<T[K], [...Seen, T]> }[keyof T]
  : 'finite';

type RecursiveThrough<T, Seen extends readonly unknown[] = []> =
  T extends Opaque<symbol, infer P, Use> ? RecursiveThrough<P, Seen>
  : T extends readonly (infer E)[] ? RecursiveThrough<E, [...Seen, T]>
  : T extends object ? { [K in keyof T]-?: 'recursive' extends Walk<T[K], [...Seen, T]> ? K : never }[keyof T]
  : never;

export type Recursive<T> = { readonly 'recursive through': RecursiveThrough<T> };

type HasGaps<T> =
  IsAny<T> extends true ? true
  : [T] extends [never] ? true
  : unknown extends T ? true
  : undefined extends T ? true
  : true extends (
      T extends Opaque<symbol, infer P, Use> ? HasGaps<P>
      : T extends Primitive ? false
      : T extends (...args: never[]) => unknown ? true
      : T extends readonly (infer E)[] ? ([E] extends [never] ? false : HasGaps<E>)
      : T extends object ?
        string extends keyof T ? true
        : number extends keyof T ? true
        : [Extract<keyof T, symbol>] extends [never] ?
          {} extends T ? true
          : { [K in keyof T]-?: Forbidden<T, K> extends true ? false : HasGaps<T[K]> }[keyof T]
        : true
      : false
    ) ?
    true
  : false;

export type IsComplete<T> =
  'recursive' extends Walk<T> ? Recursive<T>
  : HasGaps<T> extends false ? true
  : false;

type MutableKeys<T extends object> = {
  [K in keyof T]-?: Equal<Pick<T, K>, { -readonly [P in K]: T[P] }> extends true ? K : never;
}[keyof T];

type HasMutable<T> =
  true extends (
    T extends Opaque<symbol, infer P, Use> ? HasMutable<P>
    : T extends Primitive ? false
    : T extends unknown[] ? true
    : T extends readonly (infer E)[] ? HasMutable<E>
    : T extends object ? ([MutableKeys<T>] extends [never] ? { [K in keyof T]-?: HasMutable<T[K]> }[keyof T] : true)
    : false
  ) ?
    true
  : false;

export type IsDeepReadonly<T> =
  'recursive' extends Walk<T> ? Recursive<T>
  : HasMutable<T> extends false ? true
  : false;

export type Equal<A, B> = (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false;

export type Expect<T extends true> = T;
