// expect: grammar: SpreadAssignment in a record is not a form of the domain
type Small = { readonly id: string };
export const copied = (s: Small): Small => ({ ...s });
