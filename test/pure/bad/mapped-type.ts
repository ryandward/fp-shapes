// expect: Not in L: the type mapped type
type P = { readonly x: number };
export type Flags = { readonly [K in 'a' | 'b']: boolean };
