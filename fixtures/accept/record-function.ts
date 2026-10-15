// expect: a function read from a value
type Port = { readonly read: () => number };
export const run = (port: Port): number => port.read();
