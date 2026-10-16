// expect: Not in L: a rest parameter
export const sum = (...ns: ReadonlyArray<number>): number => ns.reduce((a, b) => a + b, 0);
