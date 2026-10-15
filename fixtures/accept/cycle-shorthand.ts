// expect: termination: step → step is a cycle
type Plan = { readonly at: number; readonly next: (n: number) => Plan };
export const step = (n: number): Plan => ({ at: n, next: step });
