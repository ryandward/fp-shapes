// expect: Not in L: a type that contains itself through a function
// Non-termination without naming a recursive function: self-application.
type Self = (s: Self) => number;
const omega: Self = (s) => s(s);
export const hang = (): number => omega(omega);
