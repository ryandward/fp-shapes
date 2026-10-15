// How one attempt ended, as data the queue boundary folds.
//
// Every exit is a case. A failure is a stranded cause, the same vocabulary the
// row is stranded with and the user is shown, so `succeeded` is a peer of
// `destination_refused`. The causes are split at the type level into the one
// the queue clears by running again and the ones a holder records: transience
// is a property of a cause, decided where the cause is produced, so no
// consumer asks a predicate.

import type { Variant } from '../../src/variant.js';

export type Transient = {
  worker_died: { readonly diagnostic: string };
};

export type Definitive = {
  deadline_exceeded: { readonly afterMs: number; readonly diagnostic: string };
  destination_refused: { readonly destination: { readonly kind: 'network' }; readonly diagnostic: string };
  format_rejected: { readonly format: string; readonly compression: string; readonly diagnostic: string };
  never_started: {};
};

export type Stranded = Transient & Definitive;

export type Conclusion = {
  succeeded: { readonly bytes: number };
  row_gone: {};
  already_settled: { readonly state: string };
  not_this_plane: { readonly uri: string };
  claim_revoked: {};
};

export type IngestStatus = Variant<Conclusion & Stranded>;
