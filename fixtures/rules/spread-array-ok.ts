// expect: clean
export const appended = (xs: ReadonlyArray<number>, x: number): ReadonlyArray<number> => [...xs, x];
export const nonEmpty = (head: number, tail: ReadonlyArray<number>): readonly [number, ...number[]] => [head, ...tail];
