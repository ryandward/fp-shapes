// expect: values are frozen
export const o: { a: number } = { a: 1 }; delete o.a;
