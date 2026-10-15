// expect: is a global or a package
// A global bound to another name is still the global.
const D = Date;
export const now = (): number => D.now();
