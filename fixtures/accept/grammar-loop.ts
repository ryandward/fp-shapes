// expect: grammar: ForOfStatement is not a form of the domain
export const total = (ns: ReadonlyArray<number>): number => {
  const sum = 0;
  for (const n of ns) {
    const next = sum + n;
    return next;
  }
  return sum;
};
