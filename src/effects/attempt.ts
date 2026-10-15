// The one `try`. An effect that can fail returns an Outcome; the domain folds
// it like any other Variant. `throw` and `try` appear in the effects tier only,
// and only here is a thrown value turned back into a fact.

import type { Variant } from '../variant.js';

export type Tried<T> = {
  ok: { readonly value: T };
  failed: { readonly error: Error };
};

export type Outcome<T> = Variant<Tried<T>>;

const asError = (thrown: unknown): Error =>
  thrown instanceof Error ? thrown : new Error(String(thrown));

export const attempt = async <T>(run: () => Promise<T>): Promise<Outcome<T>> => {
  try {
    return { kind: 'ok', value: await run() };
  } catch (thrown) {
    return { kind: 'failed', error: asError(thrown) };
  }
};
