// expect: `switch` is not exhaustive
export const f = (k: 'a' | 'b'): number => { switch (k) { case 'a': return 1; default: return 2; } };
