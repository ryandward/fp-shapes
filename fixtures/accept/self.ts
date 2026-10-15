// expect: termination: again → again is a cycle
export const again = (n: number): number => again(n);
