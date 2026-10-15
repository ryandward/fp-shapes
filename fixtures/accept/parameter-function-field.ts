// expect: purity: the type of port holds a function
type Port = { readonly read: () => number; readonly name: string };
export const named = (port: Port): string => port.name;
