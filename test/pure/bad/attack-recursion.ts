// expect: Not in L: recursion (loop → loop)
export const loop = (n: number): number => loop(n + 1);
