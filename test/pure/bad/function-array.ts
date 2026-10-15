// expect: A parameter cannot hold a function
export const f = (fs: ReadonlyArray<() => number>): number => fs.reduce((a, g) => a + g(), 0);
