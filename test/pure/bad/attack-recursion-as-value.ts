// expect: Not in L: recursion
const a = (n: number): number => n;
export const loop = (n: number): number => [loop].map((f) => f(n)).reduce((x, y) => x + y, a(0));
