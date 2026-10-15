// expect: Assignment mutates
export const f = (o: { n: number }): number => { o.n = 2; return o.n; };
