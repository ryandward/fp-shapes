// expect: reduce takes its initial value
export const total = (xs: ReadonlyArray<number>): number => xs.reduce((a, b) => a + b);
