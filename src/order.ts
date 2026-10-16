// Equality and ordering, as functions rather than operators: pure code has no
// ===, <, or >. `eq` compares data structurally (records, arrays and their
// leaves); `compare` orders numbers or strings and answers with a case.

import type { Union } from './union.js';

export type OrderingCases = { lt: {}; eq: {}; gt: {} };
export type Ordering = Union<OrderingCases>;

export const compare = <T extends number | string>(a: T, b: T): Ordering =>
  a < b ? { kind: 'lt' } : a > b ? { kind: 'gt' } : { kind: 'eq' };

// Structural equality on data: same leaves by Object.is (so NaN equals NaN),
// same keys, same array lengths.
export const eq = <T>(a: T, b: T): boolean => {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => k in b && eq((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
};
