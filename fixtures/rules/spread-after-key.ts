// expect: spread first, then the keys this value sets
export const merged = (base: { readonly a: number; readonly b: number }): { readonly a: number; readonly b: number } => ({ a: 1, ...base });
