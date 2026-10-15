// expect: a function read from a value
type Port = { readonly read: () => number };
export const run = (port: Port): number => {
  const read = port.read;
  return read();
};
