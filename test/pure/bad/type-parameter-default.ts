// expect: Not in L: the type unknown
export type Box<T = unknown> = { readonly value: T };
