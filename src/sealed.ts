// Provenance. The one class in the codebase, and the one brand check.
//
// A Sealed value proves who sealed it. The tag is a `unique symbol` that only
// its declaring module can name, so only that module can construct one for its
// authority. The fields are ECMAScript-private, so:
//   - an object literal cannot declare them (nominal at compile time),
//   - spread, Object.assign, structuredClone, Reflect and JSON cannot read,
//     write or copy them (nominal at runtime),
//   - the payload can only be read through `open` or `spend`, which re-check
//     the brand.
// `Object.assign` and `<T>(x: T) => T` clone utilities still *type* their
// result as Sealed; that is why the readers exist and why lint bans them.
//
// The payload is exactly the type the owner sealed: the class is invariant in
// it, so a payload with keys the declared type lacks is refused where the
// sealed value is declared, which is where a plain record would have widened.
//
// The owner says at sealing time which read the value permits. Held evidence
// (`'open'`) is read any number of times: a claim carried through an attempt,
// a ledger, a decided status. Spent evidence (`'spend'`) is read once, by the
// reader that consumes it: a receipt that settles a batch, a fence that is
// finalized. The type keeps `open` off spent evidence and `spend` off held
// evidence; the spent set keeps a second `spend` from returning, whatever
// route the value took to get there. That set is the library's one piece of
// runtime state: a WeakSet of consumed values, written once each.
//
// The readers return the payload by reference, so the payload is frozen when
// it is sealed, all the way down: every object and array reachable from it,
// however it was built and whether or not something froze its top level
// first. A holder of an opened payload cannot rewrite what a later read
// returns.

import type { Variant } from './variant.js';

const defect = (message: string): never => {
  throw new Error(message);
};

// Frozen all the way down: every object and array reachable from the value.
// The kernel's one freeze, used at sealing and at the boundary.
export const frozen = <T extends object>(value: T): T => {
  const seen = new WeakSet<object>();
  const walk = (v: object): void => {
    if (seen.has(v)) return;
    seen.add(v);
    Object.freeze(v);
    Object.values(v).forEach((inner: object | null) => {
      if (typeof inner === 'object' && inner !== null) walk(inner);
    });
  };
  walk(value);
  return value;
};

export type Use = 'open' | 'spend';

const spent = new WeakSet<object>();

export class Sealed<Tag extends symbol, T extends object, U extends Use = 'open'> {
  readonly #tag: Tag;
  readonly #value: T;
  readonly #use: U;
  // The payload type is exactly what the owner sealed: with T in parameter
  // position as well, a Sealed of a wider payload is not a Sealed of the
  // narrower one, so a value cannot widen by being sealed. The readers pass
  // the payload through it, which is the identity.
  readonly #same = (x: T): T => x;

  constructor(tag: Tag, value: T, use: U) {
    this.#tag = tag;
    this.#value = frozen(value);
    this.#use = use;
  }

  get provenance(): string {
    return String(this.#tag.description);
  }

  // The read of held evidence. A value that reaches here by any route other
  // than its owner's `new Sealed` is a defect, not a domain outcome, so it halts.
  static open<Tag extends symbol, T extends object>(tag: Tag, x: Sealed<Tag, T, 'open'>): T {
    return #tag in x && x.#tag === tag && x.#use === 'open' ? x.#same(x.#value) : defect('open takes held evidence sealed by this authority');
  }

  // The read of spent evidence: once. The second spend of the same value is a
  // defect, whoever holds it and however they came to hold it twice.
  static spend<Tag extends symbol, T extends object>(tag: Tag, x: Sealed<Tag, T, 'spend'>): T {
    if (!(#tag in x && x.#tag === tag && x.#use === 'spend')) return defect('spend takes evidence sealed for one read by this authority');
    if (spent.has(x)) return defect('spend takes evidence not yet spent; this was');
    spent.add(x);
    return x.#same(x.#value);
  }
}

// A decision: facts in, a sealed verdict out. The authority token is private
// to the owner, so only the owner can implement a Decide for its authority.
// A verdict is held: every consumer reads it.
export type Decide<Facts, Authority extends symbol, M> = (
  facts: Facts,
) => Sealed<Authority, Variant<M>, 'open'>;
