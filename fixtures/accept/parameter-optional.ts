// expect: grammar: a parameter is not optional
export const second = (n: number, by?: number): ReadonlyArray<number | undefined> => [n, by];
