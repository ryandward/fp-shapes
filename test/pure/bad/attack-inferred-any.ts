// expect: implicitly has an 'any' type
// any by inference: an unannotated parameter in a callback whose context gives no type.
const apply = <T>(f: T): T => f;
export const g = apply((x) => x);
