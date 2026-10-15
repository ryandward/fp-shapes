// expect: exactness: the value bound to fact
// A value with a key the type does not declare, assigned through a binding:
// tsc checks excess keys on fresh literals only.
const wide = { id: 'a', hidden: 1 };
export const fact: { readonly id: string } = wide;
