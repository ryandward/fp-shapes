// expect: clean
const inc = (n: number): number => n + 1;
const twice = (n: number): number => inc(inc(n));
export const thrice = (n: number): number => inc(twice(n));
