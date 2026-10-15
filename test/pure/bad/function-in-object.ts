// expect: A parameter cannot hold a function
export const f = (deps: { readonly now: () => number }): number => deps.now();
