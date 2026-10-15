// expect: exactness: argument 1 of take
type Small = { readonly id: string };
const take = (s: Small): string => s.id;
const wide = { id: 'a', hidden: 1 };
export const taken = take(wide);
