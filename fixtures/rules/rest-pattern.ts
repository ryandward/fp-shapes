// expect: a fact names every key
export const without = (row: { readonly id: string; readonly n: number }): { readonly n: number } => {
  const { id: _id, ...rest } = row;
  return rest;
};
