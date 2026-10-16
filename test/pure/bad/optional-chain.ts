// expect: Not in L: optional chaining
export const f = (o: { readonly a?: { readonly b: number } }): number | undefined => o.a?.b;
