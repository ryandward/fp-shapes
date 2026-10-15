// expect: clean
type Small = { readonly id: string };
type Wide = { readonly id: string; readonly more: number };
const narrow = (w: Wide): Small => ({ id: w.id });
export const kept = (w: Wide): Small => {
  const s = narrow(w);
  return s;
};
