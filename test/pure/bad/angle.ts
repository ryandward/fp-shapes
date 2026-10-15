// expect: A type assertion overrides the compiler
export const f = (x: unknown): string => <string>x;
