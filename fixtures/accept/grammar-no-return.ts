// expect: grammar: a body ends in a return
export const silent = (s: string): void => {
  const kept = [s];
  kept.concat();
};
