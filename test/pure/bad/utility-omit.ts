// expect: Not in L: the type Omit
type Point = { readonly x: number; readonly y: number };
export type X = Omit<Point, 'y'>;
