// expect: Not in L: get accessor
export const f = (deps: { get now(): number }): number => deps.now;
