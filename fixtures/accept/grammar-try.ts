// expect: grammar: TryStatement is not a form of the domain
export const guarded = (s: string): string => {
  try {
    return s;
  } catch {
    return '';
  }
};
