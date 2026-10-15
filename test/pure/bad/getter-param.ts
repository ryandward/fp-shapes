// expect: A parameter cannot hold a function
export const f = (deps: { get now(): number }): number => deps.now;
