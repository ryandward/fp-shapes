// expect: Not in L: a type predicate
export const isText = (x: string | number): x is string => typeof x === 'string';
