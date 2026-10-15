// expect: grammar: IfStatement is not a form of the domain
export const sign = (n: number): string => {
  if (n) {
    return 'some';
  }
  return 'none';
};
