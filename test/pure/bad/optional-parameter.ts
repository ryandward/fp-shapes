// expect: Not in L: an optional parameter
export const pick = (a: number, b?: number): ReadonlyArray<number | undefined> => [a, b];
