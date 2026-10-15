// expect: clean
// the typetest tier holds ambient declarations and described directives
declare const _authority: unique symbol;
export type Fact = { readonly n: number };
// @ts-expect-error a fact is not a string, and this line pins that
export const wrong: Fact = 'not a fact';
