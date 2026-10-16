// expect: Not in L: a default value in a pattern
export const first = ({ a = 1 }: { readonly a: number }): number => a;
