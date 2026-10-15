// expect: a value does not carry keys its type lacks (hidden)
type Line = { readonly sku: string };
const lines = [{ sku: 'a', hidden: 1 }];
export const held: ReadonlyArray<Line> = lines;
