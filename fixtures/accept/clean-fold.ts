// expect: clean
import { fold, type Variant } from '../../src/variant.js';
type Shape = { circle: { readonly r: number }; square: { readonly side: number } };
export const area: (s: Variant<Shape>) => number = fold<Shape, number>({
  circle: ({ r }) => Math.PI * r ** 2,
  square: ({ side }) => side * side,
});
