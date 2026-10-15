// expect: exactness: the value under satisfies
type Small = { readonly id: string };
const wide = { id: 'a', hidden: 1 };
export const checked = wide satisfies Small;
