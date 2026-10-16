// expect: Not in L: method signature
export type Handler = { readonly handle: (n: number) => number; run(n: number): number };
