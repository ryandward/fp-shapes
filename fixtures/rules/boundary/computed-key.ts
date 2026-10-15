// expect: a fact's keys are names
const KEY: unique symbol = Symbol('key');
export const fact = { [KEY]: { n: 1 } };
