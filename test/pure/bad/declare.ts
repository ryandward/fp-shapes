// expect: Not in L: the declare modifier
declare const secret: number;
export const f = (): number => secret;
