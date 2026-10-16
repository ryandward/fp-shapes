// expect: Not in L: non null expression
export const f = (xs: ReadonlyArray<number>): number => xs[0]!;
