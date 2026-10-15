// expect: purity: a call that returns nothing
const note = (): void => undefined;
export const noted = (s: string): string => {
  const seen = note();
  return `${s}${seen}`;
};
