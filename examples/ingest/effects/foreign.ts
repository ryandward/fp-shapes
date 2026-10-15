// The surfaces of the modules the worker depends on, as they are. This file
// describes other code: its predicates, optional methods, thrown classes and
// boolean results are recorded here so that adapt.ts can turn each into a
// case exactly once. Nothing here is a shape of this package.
//
// Reconstructed from the worker's use of each import; the real repository
// passes its real modules, and the gate in gates.typetest.ts holds
// `StrandedCause` to the cause map in src/ingest/status.ts.

import type { TargetRow } from '../boundary/target.js';

export type StrandedCause =
  | { readonly kind: 'worker_died'; readonly diagnostic: string }
  | { readonly kind: 'deadline_exceeded'; readonly afterMs: number; readonly diagnostic: string }
  | { readonly kind: 'destination_refused'; readonly destination: { readonly kind: 'network' }; readonly diagnostic: string }
  | { readonly kind: 'format_rejected'; readonly format: string; readonly compression: string; readonly diagnostic: string }
  | { readonly kind: 'never_started' };

export type Transition =
  | { readonly kind: 'measured'; readonly sizeBytes: number }
  | { readonly kind: 'settled' }
  | { readonly kind: 'failed'; readonly cause: StrandedCause };

export type Guard = { readonly kind: 'fence'; readonly token: string } | { readonly kind: 'unsettled' };

export type LockIdentity = { readonly workerId: string };

export type TransferMetrics = { readonly bytesTransferred: number };

export type TransferProgress =
  | ({ readonly stage: 'transferring' } & TransferMetrics)
  | { readonly stage: 'finalizing' };

export type HeadMeta = { readonly size?: number };

export type Source = {
  readonly head?: (uri: string) => Promise<HeadMeta>;
  readonly fetch: (
    uri: string,
    destKey: string,
    options: { readonly signal: AbortSignal; readonly onProgress: (metrics: TransferMetrics) => void },
  ) => Promise<{ readonly bytes: number }>;
};

export type FinalizeResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly cause: StrandedCause; readonly error: string };

export type Foreign = {
  readonly dataSource: unknown;
  readonly mountSourcePrefix: string;
  readonly ingestTarget: (fileId: string) => Promise<TargetRow | null>;
  readonly claimFile: (fileId: string, workerId: string) => Promise<string>;
  readonly transitionFile: (fileId: string, transition: Transition, guard: Guard, dataSource: unknown) => Promise<void>;
  readonly transitionForCause: (cause: StrandedCause) => Transition;
  readonly LifecycleGuardFailed: abstract new (...args: never[]) => Error;
  readonly TransferDeadlineExceeded: abstract new (...args: never[]) => Error & { readonly afterMs: number };
  readonly sourceForUri: (uri: string) => Source | null;
  readonly finalizeAfterBytes: (fileId: string) => Promise<FinalizeResult>;
  readonly refusedByEgress: (reason: string) => boolean;
  readonly publishTransfer: (fileId: string, lock: LockIdentity, progress: TransferProgress) => Promise<void>;
  readonly clearTransfer: (fileId: string, lock: LockIdentity) => void;
  readonly storageDelete: (key: string) => Promise<void>;
  readonly storageKeyOf: (uri: string) => string | null;
};
