// expect: read a field by its name
export const a = (o: { readonly a: number }): number => o['a'];
