// expect: `?:` is not exhaustive
export const f = (b: boolean): string => (b ? 'y' : 'n');
