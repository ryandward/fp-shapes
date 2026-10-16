// expect: Not in L: spread assignment in a record
type P = { readonly x: number; readonly y: number };
export const moved = (p: P): P => ({ ...p, x: 1 });
