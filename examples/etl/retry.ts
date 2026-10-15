// One domain decision, owned here.
//
// `retryOf` is a fold over a parsed fact, sealed by an authority only this
// module can name. A route can read the verdict only through `openRetry`, so
// verification is forced at every read, and it never holds the FileStatus the
// verdict was derived from, so it cannot re-decide.

import { Sealed, type Decide } from '../../src/sealed.js';
import { fold, type Variant } from '../../src/variant.js';
import { statusOf, type FileId, type FileStatus, type Status, type Url } from './boundary/file-status.js';

const RETRY: unique symbol = Symbol('retry');

export type Retry = {
  rebuild: { readonly file: FileId };
  fetch: { readonly from: Url };
  reupload: {};
  none: {};
};

export type RetryDecision = Sealed<typeof RETRY, Variant<Retry>>;

const decide = fold<Status, Variant<Retry>>({
  missing: () => ({ kind: 'reupload' }),
  stale: ({ file }) => ({ kind: 'rebuild', file }),
  remote: ({ url }) => ({ kind: 'fetch', from: url }),
  current: () => ({ kind: 'none' }),
});

export const retryOf: Decide<FileStatus, typeof RETRY, Retry> = (status) =>
  new Sealed(RETRY, decide(statusOf(status)));

export const openRetry = (decision: RetryDecision): Variant<Retry> => Sealed.open(RETRY, decision);
