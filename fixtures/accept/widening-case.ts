// expect: a value does not carry keys its type lacks (hidden)
// A key that belongs to no case: OnlyOwn refuses another case's keys, tsc
// refuses excess keys on a fresh literal, and neither sees this one.
import type { Variant } from '../../src/variant.js';
type Shape = { circle: { readonly r: number }; square: { readonly side: number } };
const posing = { kind: 'circle' as const, r: 1, hidden: 2 };
export const shape: Variant<Shape> = posing;
