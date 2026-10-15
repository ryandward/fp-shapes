// expect: grammar: a record has no prototype to set
export const laundered = (n: number): { readonly n: number } => ({ __proto__: null, n });
