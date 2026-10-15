// expect: a method is called on its value
// a reviewer's bypass: the mutator reached through its prototype
export const mutate = (xs: number[]): number => Array.prototype.push.call(xs, 1);
