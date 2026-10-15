// expect: clean
// an adapter calls a foreign method on its receiver
export const bound = (client: { readonly head: (uri: string) => Promise<number> }, uri: string): Promise<number> => client.head.call(client, uri);
