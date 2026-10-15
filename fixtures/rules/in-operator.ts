// expect: a comparison is a decision
export const has = (o: { readonly a: number }): boolean => 'a' in o;
