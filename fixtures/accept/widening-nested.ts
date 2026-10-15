// expect: a value does not carry keys its type lacks (hidden)
type Inner = { readonly x: number };
type Outer = { readonly a: Inner };
const inner = { x: 1, hidden: 2 };
export const outer: Outer = { a: inner };
