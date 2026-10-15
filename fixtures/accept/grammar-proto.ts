// expect: grammar: a record has no prototype to set
const shaped = { __proto__: null, n: 1 };
export const laundered = shaped;
