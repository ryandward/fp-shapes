// expect: values are frozen; a new array comes from
export const appended = (xs: ReadonlyArray<number>, x: number): ReadonlyArray<number> => {
  const copy = [...xs];
  copy.push(x);
  return copy;
};
