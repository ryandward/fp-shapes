// expect: clean
export const code = (status: number): number => (status === 407 ? 407 : 0);
