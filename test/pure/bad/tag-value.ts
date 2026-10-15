// expect: A declared tag has no runtime value
declare const KEY: unique symbol;
export const leaked = (): symbol => KEY;
