// expect: A parameter cannot hold a function
export const f = <F extends () => number>(g: F): number => g();
