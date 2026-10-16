// expect: Not in L: a template part that is not a string, number or boolean
// A record whose toString is called implicitly by a template.
export const shown = (): string => `${{ toString: () => 'hidden call' }}`;
