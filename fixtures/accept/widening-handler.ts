// expect: exactness: the returned value
// A handler's return is held to the fold's declared result, not only a
// fresh literal's.
import { fold, type Variant } from '../../src/variant.js';
type Shape = { circle: { readonly r: number }; square: { readonly side: number } };
type Small = { readonly id: string };
const wide = { id: 'a', hidden: 1 };
export const named: (s: Variant<Shape>) => Small = fold<Shape, Small>({ circle: () => wide, square: () => ({ id: 'square' }) });
