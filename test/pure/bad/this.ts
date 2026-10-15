// expect: `this` depends on how a function is called
export const o = { n: 1, get(): number { return this.n; } };
