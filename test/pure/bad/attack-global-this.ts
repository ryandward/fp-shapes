// expect: Property 'Math' does not exist
export const h = () => globalThis;
export const m = () => globalThis.Math.floor(1.5);
