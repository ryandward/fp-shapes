// expect: a sum of records is a Variant over a map
export type Outcome = { readonly kind: 'ok'; readonly value: number } | { readonly kind: 'failed'; readonly reason: string };
