// expect: a function is called directly
export const once = (f: (n: number) => number): number => f.call(null, 1);
