// expect: `as` overrides the compiler
type Small = { readonly id: string };
export const f = (x: { readonly id: string; readonly extra: number }): Small => x as Small;
