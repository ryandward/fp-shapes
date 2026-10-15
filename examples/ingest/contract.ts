// What the worker asks of the world, and every way each request can end.
//
// Each effect settles to a case, so the worker folds outcomes instead of
// catching. `died` is the one case every effect shares: the process failed,
// not the file, and the queue clears it by running again.
//
// The worker is parametric in L (the queue's lock), C (a claim), F (a fenced
// write), and Z (a finalized file). It threads them and cannot look inside;
// the adapters mint them as sealed receipts, and a test supplies plain tokens.
// The order of the pipeline is in the signatures: `finalize` takes an F that
// only `fence` produces, `settle` takes a Z that only `finalize` produces.

import type { DestKey, SourceUri, Target } from './boundary/target.js';
import type { Variant } from '../../src/variant.js';
import type { Definitive } from './status.js';

export type Died = { died: { readonly diagnostic: string } };

export type TargetOutcome = Target & Died;

export type MarkOutcome = Died & { recorded: {} };

export type ClaimOutcome<C> = Died & { claimed: { readonly claim: C } };

export type TransferOutcome = Died & {
  transferred: { readonly bytes: number };
  unsupported_scheme: {};
  short_read: { readonly advertised: number; readonly received: number };
  refused_by_egress: { readonly diagnostic: string };
  deadline: { readonly afterMs: number; readonly diagnostic: string };
};

export type FenceOutcome<F> = Died & { held: { readonly fenced: F }; revoked: {} };

export type FinalizeOutcome<Z> = Died & {
  finalized: { readonly finalized: Z };
  rejected: { readonly cause: Variant<Definitive> };
};

export type SettleOutcome = Died & { settled: {}; revoked: {} };

export type StrandOutcome = Died & { recorded: {}; revoked: {} };

export type TransferRequest<L, C> = {
  readonly fileId: string;
  readonly lock: L;
  readonly signal: AbortSignal;
  readonly claim: C;
  readonly uri: SourceUri;
  readonly destKey: DestKey;
};

export type IngestArgs<L> = {
  readonly fileId: string;
  readonly signal: AbortSignal;
  readonly lock: L;
};

export type IngestEffects<L, C, F, Z> = {
  readonly target: (fileId: string) => Promise<Variant<TargetOutcome>>;
  readonly markNeverStarted: (fileId: string) => Promise<Variant<MarkOutcome>>;
  readonly claim: (fileId: string, lock: L) => Promise<Variant<ClaimOutcome<C>>>;
  readonly transfer: (request: TransferRequest<L, C>) => Promise<Variant<TransferOutcome>>;
  readonly fence: (claim: C, bytes: number) => Promise<Variant<FenceOutcome<F>>>;
  readonly finalize: (fenced: F) => Promise<Variant<FinalizeOutcome<Z>>>;
  readonly settle: (claim: C, finalized: Z) => Promise<Variant<SettleOutcome>>;
  readonly strand: (claim: C, cause: Variant<Definitive>) => Promise<Variant<StrandOutcome>>;
};
