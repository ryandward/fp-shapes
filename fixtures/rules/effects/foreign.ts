// expect: clean
// the foreign tier describes other code as it is: unions of records, optional methods, predicates, unknown
export type Ending = { readonly kind: 'exited'; readonly code: number } | { readonly kind: 'signaled'; readonly signal: string };
export type Client = {
  readonly head: (uri: string) => Promise<unknown>;
  readonly isReady?: () => boolean;
};
export const transient = (ending: Ending): boolean => {
  switch (ending.kind) {
    case 'exited':
      return ending.code !== 0;
    case 'signaled':
      return true;
  }
};
