// expect: grammar: an optional access reads an absence
type Maybe = { readonly inner?: { readonly n: number } };
export const n = (m: Maybe): number | undefined => m.inner?.n;
