// expect: iterate by mapping a NonEmpty
export const f = (xs: readonly number[]): number => { for (const x of xs) { return x; } return 0; };
