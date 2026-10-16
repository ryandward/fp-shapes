// expect: Not in L: a definite-assignment assertion
export const n: number = 1;
export const f = (): number => { const m!: number = n; return m; };
