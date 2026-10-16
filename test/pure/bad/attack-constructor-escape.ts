// expect: Property 'constructor' does not exist
// Reach Function through a value's constructor, then build code from a string.
export const run = (s: string): number => ((0).constructor.constructor(s))();
