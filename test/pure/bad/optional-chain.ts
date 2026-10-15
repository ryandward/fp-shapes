// expect: `?.` branches on absence
export const f = (o: { readonly a?: { readonly b: number } }): number | undefined => o.a?.b;
