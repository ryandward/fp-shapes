// expect: clean
export const run = (f: () => number): number => {
  try {
    return f();
  } catch {
    return 0;
  }
};
