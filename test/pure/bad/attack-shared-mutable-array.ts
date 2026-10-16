// expect: Not in L: a module-level value that is not deeply readonly
type Point = { readonly x: number };
export const points = [{ x: 1 }] satisfies ReadonlyArray<Point>;
