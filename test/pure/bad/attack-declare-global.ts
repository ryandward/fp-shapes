// expect: Not in L: module declaration
declare global { const fetch: (url: string) => number; }
export const f = (): number => fetch('https://example.com');
