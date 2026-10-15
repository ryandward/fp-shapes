// The one structural comparison. `===` on two records is identity, which says
// nothing about the facts they hold; two facts are the same when every leaf is
// the same by `Object.is`. The answer is a decision with its evidence: the
// path to the first leaf that differs, as the keys from the root. Sealed values
// compare by identity, since this module cannot open them; an owner compares
// the payloads it can. Facts are closed records, so their keys are their
// whole structure.

import type { Variant } from '../variant.js';
import { Sealed } from '../sealed.js';

export type Comparison = {
  same: {};
  differs: { readonly at: ReadonlyArray<string> };
};

const differing = (a: unknown, b: unknown, path: ReadonlyArray<string>): ReadonlyArray<string> | null => {
  if (Object.is(a, b)) return null;
  if (typeof a !== 'object' || a === null || a instanceof Sealed) return path;
  if (typeof b !== 'object' || b === null || b instanceof Sealed) return path;
  if (Array.isArray(a) !== Array.isArray(b)) return path;
  const left = Object.entries(a);
  const right = new Map(Object.entries(b));
  if (left.length !== right.size) return path;
  return left.map(([key, value]) => (right.has(key) ? differing(value, right.get(key), [...path, key]) : path)).find((found) => found !== null) ?? null;
};

export const compare = <T>(a: T, b: T): Variant<Comparison> => {
  const at = differing(a, b, []);
  return at === null ? { kind: 'same' } : { kind: 'differs', at };
};
