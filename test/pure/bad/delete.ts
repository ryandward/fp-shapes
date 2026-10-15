// expect: `delete` mutates
export const f = (o: { n?: number }): boolean => delete o.n;
