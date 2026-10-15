// Provenance. The one class in the codebase, and the one brand check.
//
// A Sealed value proves who sealed it. The tag is a `unique symbol` that only
// its declaring module can name, so only that module can construct one for its
// authority. Both fields are ECMAScript-private, so:
//   - an object literal cannot declare them (nominal at compile time),
//   - spread, Object.assign, structuredClone, Reflect and JSON cannot read,
//     write or copy them (nominal at runtime),
//   - the payload can only be read through `open`, which re-checks the brand.
// `Object.assign` and `<T>(x: T) => T` clone utilities still *type* their
// result as Sealed; that is why `open` exists and why lint bans them.
//
// `open` returns the payload by reference, so the payload is frozen when it is
// sealed, all the way down: every object and array reachable from it, however
// it was built and whether or not something froze its top level first. A
// holder of an opened payload cannot rewrite what a later `open` returns.

import type { Variant } from './variant.js';

const defect = (message: string): never => {
  throw new Error(message);
};

const frozen = <T extends object>(value: T): T => {
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

export class Sealed<Tag extends symbol, T extends object> {
  readonly #tag: Tag;
  readonly #value: T;

  constructor(tag: Tag, value: T) {
    this.#tag = tag;
    this.#value = frozen(value);
  }

  get provenance(): string {
    return String(this.#tag.description);
  }

  // The only read. A value that reaches here by any route other than its
  // owner's `new Sealed` is a defect, not a domain outcome, so it halts.
  static open<Tag extends symbol, T extends object>(tag: Tag, x: Sealed<Tag, T>): T {
    return #tag in x && x.#tag === tag ? x.#value : defect('open takes a value sealed by this authority');
  }
}

// A decision: facts in, a sealed verdict out. The authority token is private
// to the owner, so only the owner can implement a Decide for its authority.
export type Decide<Facts, Authority extends symbol, M> = (
  facts: Facts,
) => Sealed<Authority, Variant<M>>;
