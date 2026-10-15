// expect: clean
// A case of a many-cased Variant, through a binding and into a kernel call:
// the exclusion keys the other cases leave on it are not keys it lacks.
import { fold, type Variant } from '../../src/variant.js';
type Shape = { circle: { readonly r: number }; square: { readonly side: number }; blank: {} };
const unit: Variant<Shape> = { kind: 'square', side: 1 };
const round = { kind: 'circle' as const, r: 2 };
export const rounded: Variant<Shape> = round;
export const name: string = fold<Shape, string>({ circle: () => 'circle', square: () => 'square', blank: () => 'blank' })(unit);
