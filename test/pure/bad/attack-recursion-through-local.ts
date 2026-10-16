// expect: Not in L: recursion (outer → inner → outer)
export const outer = (n: number): number => {
  const inner = (m: number): number => outer(m);
  return inner(n);
};
