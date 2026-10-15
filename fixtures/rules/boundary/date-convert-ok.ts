// expect: clean
export const ms = Date.parse('2020-01-01T00:00:00Z');
export const same = new Date(ms).getTime();
