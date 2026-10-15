// expect: purity: the type of f holds a function
// A function parameter passed to a fact method is called by it.
export const mapped = (xs: ReadonlyArray<number>, f: (n: number) => number): ReadonlyArray<number> => xs.map(f);
