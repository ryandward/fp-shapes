// expect: a method is called on its value
// the mutator reached through its prototype, its name hidden from the method rule
export const mutate = (xs: number[]): number => Array.prototype.push.call(xs, 1);
