// What to say about a status, and what the queue does with it. Two folds, so
// the log line and the retry decision are each written once, next to the
// cases they are about, instead of beside each return. The status is the
// core's, read through the FFI as a Variant; a case added in the core fails
// to compile here until this file says what it means.

import type { Definitive, IngestStatus } from './boundary/ingest.ffi.js';
import { fold, type Variant } from '../../src/variant.js';

export type Report = {
  readonly action: string;
  readonly severity: 'info' | 'error';
  readonly detail: string;
};

const strandedReport: (cause: Variant<Definitive>) => Report = fold<Definitive, Report>({
  deadline_exceeded: ({ afterMs, diagnostic }) => ({ action: 'stranded', severity: 'error', detail: `deadline after ${afterMs}ms: ${diagnostic}` }),
  destination_refused: ({ diagnostic }) => ({ action: 'stranded', severity: 'error', detail: `destination refused: ${diagnostic}` }),
  format_rejected: ({ format, compression, diagnostic }) => ({ action: 'stranded', severity: 'error', detail: `format ${format}/${compression}: ${diagnostic}` }),
  never_started: () => ({ action: 'upload_abandoned', severity: 'info', detail: '' }),
});

export const report: (status: Variant<IngestStatus>) => Report = fold<IngestStatus, Report>({
  succeeded: ({ bytes }) => ({ action: 'completed', severity: 'info', detail: `${bytes} bytes` }),
  row_gone: () => ({ action: 'row_gone', severity: 'info', detail: '' }),
  already_settled: ({ state }) => ({ action: 'already_settled', severity: 'info', detail: state }),
  not_this_plane: ({ uri }) => ({ action: 'not_this_plane', severity: 'info', detail: uri }),
  claim_revoked: () => ({ action: 'claim_revoked', severity: 'info', detail: '' }),
  worker_died: ({ diagnostic }) => ({ action: 'attempt_failed', severity: 'error', detail: diagnostic }),
  stranded: ({ cause }) => strandedReport(cause),
});

// The queue's reading of a status: run again, carrying the transient cause so
// the boundary can record it if the budget is spent, or leave the recorded
// verdict. Transience is a property of a cause, decided in the core: the one
// the queue clears is worker_died, a status of its own, so no consumer asks
// a predicate.
export type Transient = { worker_died: { readonly diagnostic: string } };

export type Verdict = { again: { readonly cause: Variant<Transient> }; left: {} };

const left = (): Variant<Verdict> => ({ kind: 'left' });

export const verdict: (status: Variant<IngestStatus>) => Variant<Verdict> = fold<IngestStatus, Variant<Verdict>>({
  worker_died: ({ diagnostic }) => ({ kind: 'again', cause: { kind: 'worker_died', diagnostic } }),
  succeeded: left,
  row_gone: left,
  already_settled: left,
  not_this_plane: left,
  claim_revoked: left,
  stranded: left,
});
