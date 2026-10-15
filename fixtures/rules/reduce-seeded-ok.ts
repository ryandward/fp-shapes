// expect: clean
export const total = (xs: ReadonlyArray<number>): number => xs.reduce((a, b) => a + b, 0);
