// expect: reach: lost is an island
// A correct domain module that nothing drives: no shell module references
// it, so no attempt reaches it.
export const lost = (n: number): number => n + 1;
