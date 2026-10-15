// expect: copy with spread
export const copy = <T>(x: T): T => structuredClone(x);
