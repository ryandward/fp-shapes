// expect: holds an accessor (now), which runs when read
type Clock = { readonly get now(): number };
export const read = (c: Clock): number => c.now;
