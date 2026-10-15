// expect: Assignment mutates
export const f = (xs: number[]): number[] => { xs[0] = 1; return xs; };
