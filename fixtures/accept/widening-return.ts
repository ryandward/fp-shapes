// expect: exactness: the returned value
type Small = { readonly id: string };
const wide = { id: 'a', hidden: 1 };
export const narrow = (): Small => wide;
