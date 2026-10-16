// expect: Not in L: the type conditional type
export type IsText<T> = T extends string ? true : false;
