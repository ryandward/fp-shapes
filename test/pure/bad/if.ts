// expect: `if` is not exhaustive
export const f = (n: number): string => { if (n > 0) { return 'positive'; } return 'not'; };
