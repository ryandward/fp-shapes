// Compile-time assertions about representations.
//
//   Total<T>      completeness: no `?:`, `undefined`, `unknown`, `any`, `never`,
//                 function, index signature, symbol key, `Date`, or open object
//                 (`{}`, `object`) anywhere in a finite, shallow JSON-like value. Branded
//                 primitives are leaves. An exclusion key (`k?: never`, as a
//                 Variant case uses to refuse another case's fields) is not a
//                 hole: it forbids a key rather than permitting its absence.
//   Immutable<T>  every property readonly, every array a ReadonlyArray, all
//                 the way down. Zod's `.readonly()` produces this type and
//                 freezes the value at runtime.
//   Exact<A, B>   correspondence: both total, same keys, mutually assignable.
//                 For repos that keep a hand-declared model beside a schema.
//
// A fact is finite. A type that contains its own kind (a cause whose payload
// is another cause, a node whose field is a node) is two facts folded into
// one; both assertions answer `Recursive<T>`, naming the property the
// recursion runs through. Genuinely recursive data (a tree) is a structure of
// facts: assert the node, and let the structure be built from asserted nodes.
// How deeply a finite fact nests is the model's business, not a rule.
//
// These are gates, so they are tested in gates.typetest.ts like any other gate.

import type { Sealed, Use } from './sealed.js';

type IsAny<T> = 0 extends 1 & T ? true : false;

// A sealed value is a fact with provenance; every assertion reads its payload,
// so sealing a shape does not hide the shape. The envelope is not a container.

type Primitive = string | number | boolean | bigint | symbol | null;

// `k?: never` (and `k: never`): the key is forbidden, not optional.
type Forbidden<T, K extends keyof T> = [Exclude<T[K], undefined>] extends [never] ? true : false;

// Optional keys that permit absence, as opposed to forbidding presence.
type OpenKeys<T extends object> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? (Forbidden<T, K> extends true ? never : K) : never;
}[keyof T];

type Among<T, Seen extends readonly unknown[]> =
  true extends { [I in keyof Seen]: Equal<T, Seen[I]> }[number] ? true : false;

// Every leaf answers: 'finite' when the walk bottoms out, 'recursive' when a
// container is its own ancestor. The walk carries its ancestors, so a cycle
// of any length is found where it closes.
type Walk<T, Seen extends readonly unknown[] = []> =
  IsAny<T> extends true ? 'finite'
  : [T] extends [never] ? 'finite'
  : T extends Sealed<symbol, infer P, Use> ? Walk<P, Seen>
  : T extends Primitive ? 'finite'
  : T extends (...args: never[]) => unknown ? 'finite'
  : Among<T, Seen> extends true ? 'recursive'
  : T extends readonly (infer E)[] ? Walk<E, [...Seen, T]>
  : T extends object ? { [K in keyof T]-?: Walk<T[K], [...Seen, T]> }[keyof T]
  : 'finite';

// The top-level properties through which the recursion runs.
type Through<T, Seen extends readonly unknown[] = []> =
  T extends Sealed<symbol, infer P, Use> ? Through<P, Seen>
  : T extends readonly (infer E)[] ? Through<E, [...Seen, T]>
  : T extends object ? { [K in keyof T]-?: 'recursive' extends Walk<T[K], [...Seen, T]> ? K : never }[keyof T]
  : never;

export type Recursive<T> = { readonly 'a fact is finite; this one contains its own kind through': Through<T> };

type HasHoles<T> =
  IsAny<T> extends true ? true
  : [T] extends [never] ? true
  : unknown extends T ? true
  : undefined extends T ? true
  : true extends (
      T extends Sealed<symbol, infer P, Use> ? HasHoles<P>
      : T extends Primitive ? false
      : T extends (...args: never[]) => unknown ? true
      : T extends readonly (infer E)[] ? ([E] extends [never] ? false : HasHoles<E>)
      : T extends object ?
        string extends keyof T ? true
        : number extends keyof T ? true
        : [Extract<keyof T, symbol>] extends [never] ?
          {} extends T ? true // {}, object, or all-optional: open
          : [OpenKeys<T>] extends [never] ?
            { [K in keyof T]-?: Forbidden<T, K> extends true ? false : HasHoles<T[K]> }[keyof T]
          : true
        : true // a symbol key: a fact's keys are names
      : false
    ) ?
    true
  : false;

export type Total<T> =
  'recursive' extends Walk<T> ? Recursive<T>
  : HasHoles<T> extends false ? true
  : false;

export type Equal<A, B> =
  (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false;

type MutableKeys<T extends object> = {
  [K in keyof T]-?: Equal<Pick<T, K>, { -readonly [P in K]: T[P] }> extends true ? K : never;
}[keyof T];

type HasMutable<T> =
  true extends (
    T extends Sealed<symbol, infer P, Use> ? HasMutable<P>
    : T extends Primitive ? false
    : T extends unknown[] ? true // a mutable array or tuple
    : T extends readonly (infer E)[] ? HasMutable<E>
    : T extends object ?
      [MutableKeys<T>] extends [never] ?
        { [K in keyof T]-?: HasMutable<T[K]> }[keyof T]
      : true
    : false
  ) ?
    true
  : false;

export type Immutable<T> =
  'recursive' extends Walk<T> ? Recursive<T>
  : HasMutable<T> extends false ? true
  : false;

export type Exact<A extends object, B extends object> =
  Total<A> extends true ?
    Total<B> extends true ?
      [Exclude<keyof A, keyof B> | Exclude<keyof B, keyof A>] extends [never] ?
        [A] extends [B] ?
          [B] extends [A] ?
            true
          : false
        : false
      : false
    : false
  : false;

export type Assert<T extends true> = T;
