// expect: Not in L: recursion (runner → runner)
const step = (n: number): number => n + 1;
type Runner = { readonly go: (n: number) => number };
export const runner: Runner = { go: (n: number): number => runner.go(step(n)) };
