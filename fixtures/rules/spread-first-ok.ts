// expect: clean
export const merged = (base: { readonly a: number; readonly b: number }): { readonly a: number; readonly b: number } => ({ ...base, a: 1 });
