// expect: grammar: an assertion is not a form of the domain
type Small = { readonly id: string };
export const claimed = (o: { readonly id: string; readonly more: number }): Small => o as Small;
