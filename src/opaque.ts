// Opaque types: a value that only the module holding its tag can create or
// read.
//
//   const USER_ID: unique symbol = Symbol('UserId');   // not exported
//   export type UserId = Opaque<typeof USER_ID, { readonly id: string }>;
//   export const userId = (id: string): UserId => new Opaque(USER_ID, { id }, 'many');
//   export const idOf = (u: UserId): string => Opaque.unwrap(USER_ID, u).id;
//
// The tag is a `unique symbol`, so another module cannot name it and cannot
// build or read the value. The fields are ECMAScript-private, so an object
// literal cannot fake one and spread, `Object.assign` or `structuredClone`
// cannot copy one: the result fails the runtime check in `unwrap`.
//
// The payload type is invariant, so `Opaque<Tag, { id, extra }>` is not an
// `Opaque<Tag, { id }>`: a value cannot gain hidden fields by being wrapped.
// The payload is deep-frozen when wrapped.
//
// A value created with use 'once' is a single-use token: it is read with
// `consume`, and a second `consume` of the same value throws. `unwrap` does
// not accept it, and `consume` does not accept a 'many' value.

import { deepFreeze } from './freeze.js';

export type Use = 'many' | 'once';

const consumed = new WeakSet<object>();
const identity = <X>(x: X): X => x;

export class Opaque<Tag extends symbol, T extends object, U extends Use = 'many'> {
  readonly #tag: Tag;
  readonly #value: T;
  readonly #use: U;
  // A function-typed field mentioning T makes the class invariant in T.
  readonly #invariant: (x: T) => T;

  constructor(tag: Tag, value: T, use: U) {
    this.#tag = tag;
    this.#value = deepFreeze(value);
    this.#use = use;
    this.#invariant = identity;
  }

  static unwrap<Tag extends symbol, T extends object>(tag: Tag, x: Opaque<Tag, T, 'many'>): T {
    if (!(#tag in x) || x.#tag !== tag || x.#use !== 'many') throw new TypeError('unwrap: not a value created with this tag');
    return x.#invariant(x.#value);
  }

  static consume<Tag extends symbol, T extends object>(tag: Tag, x: Opaque<Tag, T, 'once'>): T {
    if (!(#tag in x) || x.#tag !== tag || x.#use !== 'once') throw new TypeError('consume: not a single-use value created with this tag');
    if (consumed.has(x)) throw new TypeError('consume: this value was already consumed');
    consumed.add(x);
    return x.#invariant(x.#value);
  }
}
