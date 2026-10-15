// expect: Loops need mutation
export const f = (xs: ReadonlyArray<number>): number => { for (const x of xs) { return x; } return 0; };
