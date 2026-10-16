// expect: Not in L: the type object
export const keep = <T extends object>(t: T): T => t;
