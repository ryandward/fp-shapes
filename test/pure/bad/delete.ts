// expect: Not in L: delete expression
export const f = (o: { n?: number }): boolean => delete o.n;
