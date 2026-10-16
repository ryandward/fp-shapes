// expect: Not in L: a type assertion (as)
type Small = { readonly id: string };
export const f = (x: { readonly id: string; readonly extra: number }): Small => x as Small;
