// expect: Not in L: a destructured element that may be absent
// A head of an empty tuple, by destructuring: undefined with a non-undefined type.
export const first = (xs: ReadonlyArray<number>): number => { const [a] = xs; return a; };
