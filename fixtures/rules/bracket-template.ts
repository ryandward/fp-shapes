// expect: read a field by its name
export const k = (o: { readonly k: number }): number => o[`k`];
