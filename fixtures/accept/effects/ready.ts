// Support for the fixtures: an effects module. Not a fixture.
export const openReady = (token: { readonly id: string }): number => token.id.length;
export const isReady = (token: { readonly id: string }): boolean => token.id.length > 0;
