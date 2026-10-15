// expect: `declare` asserts a value exists
declare const secret: number;
export const f = (): number => secret;
