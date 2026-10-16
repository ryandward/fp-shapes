// expect: Not in L: a declared tag used as a value
declare const KEY: unique symbol;
export const leaked = (): symbol => KEY;
