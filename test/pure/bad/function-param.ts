// expect: A parameter cannot hold a function
export const f = (log: (line: string) => void): number => { log('x'); return 1; };
