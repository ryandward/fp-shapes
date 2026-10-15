// expect: `++` and `--` mutate
export const f = (o: { n: number }): number => o.n++;
