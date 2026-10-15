// expect: Cannot find name 'JSON'
export const f = (s: string): unknown => JSON.parse(s);
