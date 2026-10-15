// expect: grammar: ExpressionStatement is not a form of the domain
export const bumped = (o: { count: number }): number => {
  o.count = o.count + 1;
  return o.count;
};
