// expect: grammar: SwitchStatement is not a form of the domain
export const name = (kind: 'a' | 'b'): string => {
  switch (kind) {
    case 'a':
      return 'A';
    case 'b':
      return 'B';
  }
};
