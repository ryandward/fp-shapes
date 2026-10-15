// expect: copy by naming every key
export const copy = <T>(x: T): T => structuredClone(x);
