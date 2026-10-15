// Evidence constructors: the parse layer's functions that look at a runtime
// fact and return it as a case. This is the one place that may look at
// `.length`; downstream, non-emptiness is a type, not a check.
//
// Elements are defined values: the signature excludes `undefined` and allows
// `null`, so `[undefined]` is a type error, and the head check below is the
// emptiness check.

import type { NonEmpty, Variant } from '../variant.js';

export type Occupancy<T> = {
  empty: {};
  some: { readonly rows: NonEmpty<T> };
};

export const occupancy = <T extends {} | null>(xs: ReadonlyArray<T>): Variant<Occupancy<T>> => {
  const [head, ...tail] = xs;
  return head === undefined ? { kind: 'empty' } : { kind: 'some', rows: [head, ...tail] };
};
