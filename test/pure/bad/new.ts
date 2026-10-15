// expect: `new` creates mutable objects
function Box(this: { v: number }): void {}
export const f = (): unknown => new (Box as unknown as new () => object)();
