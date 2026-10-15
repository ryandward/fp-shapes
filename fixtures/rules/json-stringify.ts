// expect: JSON.stringify throws on a bigint
export const text = (fact: { readonly n: bigint }): string => JSON.stringify(fact);
