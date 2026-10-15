// expect: grammar: ThrowStatement is not a form of the domain
export const halt = (s: string): string => {
  throw new Error(s);
};
