// expect: closed: the type of r is not decided
type Loose = { readonly inner: { readonly v: any } };
export const read = (r: Loose): string => r.inner.v;
