// expect: Not in L: the type Partial
type Point = { readonly x: number; readonly y: number };
export type Sparse = Partial<Point>;
