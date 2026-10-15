// expect: `!` claims a value is present
export const f = (xs: ReadonlyArray<number>): number => xs[0]!;
