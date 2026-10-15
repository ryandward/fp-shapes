// expect: clean
// the primitives tier for variant.ts: the one generic record update
export const replace = <M extends object, K extends keyof M>(acc: M, key: K, value: M[K]): M => ({ ...acc, [key]: value });
