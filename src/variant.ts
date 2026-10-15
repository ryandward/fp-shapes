// The only eliminator in the domain.
//
// A decision is a Variant; a consumer folds it. The body of `fold` is the
// single property lookup that stands in for every `if` the domain no longer
// has. Both `v.kind` and `cases[v.kind]` are indexed by the same K, so the
// lookup type-checks without an assertion (TypeScript >= 4.6).
//
// Each case forbids the fields of every other case (`readonly k?: never`), so
// a value shaped like `{ kind: 'none', from: url }` cannot pose as `none`.
// What TypeScript cannot refuse on a non-literal value is a field that belongs
// to no case at all; fresh literals, including every handler's return, get
// excess-property checks and are refused.

type PayloadKeys<M> = { [K in keyof M]: keyof M[K] }[keyof M];

type OnlyOwn<M, K extends keyof M> = {
  readonly [Q in Exclude<PayloadKeys<M>, keyof M[K] | 'kind'>]?: never;
};

export type Variant<M, K extends keyof M = keyof M> = {
  [P in K]: { readonly kind: P } & M[P] & OnlyOwn<M, P>;
}[K];

export type Cases<M, R> = {
  readonly [K in keyof M]: (v: Variant<M, K>) => R;
};

export const fold =
  <M, R>(cases: Cases<M, R>) =>
  <K extends keyof M>(v: Variant<M, K>): R =>
    cases[v.kind](v);

// The cases a foreign discriminated union names. With `Equal`, one gate pins a
// domain map to a foreign union in both directions:
//   Assert<Equal<keyof M, KindsOf<Foreign>>>
export type KindsOf<U extends { readonly kind: PropertyKey }> = U['kind'];

// The shape of every decision function. Never `(a: A) => boolean`:
// a boolean forces the caller to branch, which is the `if` just banned.
export type Classify<A, M> = (a: A) => Variant<M>;

// Evidence as a value: a function that needs a first element takes this,
// and the caller proves non-emptiness once, at the boundary.
export type NonEmpty<T> = readonly [T, ...(readonly T[])];

export const mapNonEmpty =
  <A, B>(f: (a: A) => B) =>
  ([head, ...tail]: NonEmpty<A>): NonEmpty<B> =>
    [f(head), ...tail.map(f)];

// partition replaces filter/find/some/every: one classification, every case
// kept, no predicate for a caller to branch on. The caller supplies the empty
// partition so that every bucket is named up front (a missing bucket is a
// compile error) and no assertion is needed to build it.
export type Partition<M> = {
  readonly [K in keyof M]: ReadonlyArray<Variant<M, K>>;
};

// The one builder: each item is appended to its bucket in place, once, so a
// partition of n items costs n appends rather than n copies of a growing
// bucket; the buckets are fresh arrays nothing else holds while they grow.
// The result is the caller's empty partition with each grown bucket set under
// its kind: the one generic record update.
export const partition =
  <A, M>(classify: Classify<A, M>, empty: Partition<M>) =>
  (xs: ReadonlyArray<A>): Partition<M> => {
    const grown = new Map<keyof M, Variant<M>[]>();
    xs.forEach((x) => {
      const v = classify(x);
      const bucket = grown.get(v.kind) ?? [];
      bucket.push(v);
      grown.set(v.kind, bucket);
    });
    return [...grown].reduce((acc: Partition<M>, [kind, items]) => ({ ...acc, [kind]: items }), empty);
  };
