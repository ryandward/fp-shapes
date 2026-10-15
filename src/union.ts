// Tagged unions with exhaustive matching.
//
// A union is declared as a map from tag to that case's fields:
//
//   type Shape = Union<{ circle: { radius: number }; square: { side: number } }>;
//
// Each case is `{ kind: tag } & fields`, and each case also forbids the fields
// of every other case, so `{ kind: 'circle', radius: 1, side: 2 }` is not a
// Shape. `match` takes one handler per tag and does not compile if one is
// missing.

type FieldsOf<Cases> = { [K in keyof Cases]: keyof Cases[K] }[keyof Cases];

type ForbidOthers<Cases, K extends keyof Cases> = {
  readonly [F in Exclude<FieldsOf<Cases>, keyof Cases[K] | 'kind'>]?: never;
};

export type Union<Cases, K extends keyof Cases = keyof Cases> = {
  [Tag in K]: { readonly kind: Tag } & Cases[Tag] & ForbidOthers<Cases, Tag>;
}[K];

export type Handlers<Cases, R> = {
  readonly [K in keyof Cases]: (value: Union<Cases, K>) => R;
};

export const match =
  <Cases, R>(handlers: Handlers<Cases, R>) =>
  <K extends keyof Cases>(value: Union<Cases, K>): R =>
    handlers[value.kind](value);

// Option and Result, as unions. The case maps are exported so they can be
// passed to `match`: match<OptionCases<number>, string>({ none: …, some: … }).

export type OptionCases<A> = { none: {}; some: { readonly value: A } };
export type Option<A> = Union<OptionCases<A>>;

export type ResultCases<E, A> = { err: { readonly error: E }; ok: { readonly value: A } };
export type Result<E, A> = Union<ResultCases<E, A>>;

export const none: Option<never> = Object.freeze({ kind: 'none' });
export const some = <A>(value: A): Option<A> => ({ kind: 'some', value });
export const ok = <A>(value: A): Result<never, A> => ({ kind: 'ok', value });
export const err = <E>(error: E): Result<E, never> => ({ kind: 'err', error });

// An array with at least one element, and the one way to get one from an
// ordinary array.

export type NonEmptyArray<A> = readonly [A, ...(readonly A[])];

export const nonEmpty = <A extends {} | null>(xs: ReadonlyArray<A>): Option<NonEmptyArray<A>> => {
  const [head, ...tail] = xs;
  return head === undefined ? none : some<NonEmptyArray<A>>([head, ...tail]);
};
