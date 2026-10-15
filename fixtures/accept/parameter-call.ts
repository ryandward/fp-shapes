// expect: purity: a function parameter is not called
export const run = (fx: () => number): number => fx();
