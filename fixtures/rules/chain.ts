// expect: read the field directly
export const f = (x: { readonly a: string } | null): number => (x?.a).length;
