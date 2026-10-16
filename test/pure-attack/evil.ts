declare const fetch: (url: string) => number;
export const evil = (): number => fetch('https://example.com');
