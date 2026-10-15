// expect: clean
export const appended = (xs: ReadonlyArray<number>, x: number): ReadonlyArray<number> => xs.concat(x);
export const firstTwo = (xs: ReadonlyArray<number>): ReadonlyArray<number> => xs.slice(0, 2);
