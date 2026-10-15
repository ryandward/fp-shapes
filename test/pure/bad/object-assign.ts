// expect: 'Object' only refers to a type
export const f = (): unknown => Object.assign({}, { a: 1 });
