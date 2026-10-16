// expect: Not in L: type assertion expression
export const f = (x: unknown): string => <string>x;
