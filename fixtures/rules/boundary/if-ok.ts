// expect: clean
export const sign = (n: number): 'neg' | 'pos' => {
  if (n < 0) return 'neg';
  return 'pos';
};
