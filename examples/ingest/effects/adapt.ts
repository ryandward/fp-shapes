// The adapters: each foreign call becomes an effect that settles to a case.
//
// This is where a thrown class, a boolean result, a string-matched message or
// a null return is read, once per foreign API, and where the receipts are
// minted. A claim, a fenced write and a finalized file are sealed by
// authorities private to this module, so the worker can thread them and
// nothing else can produce them. The `died` case is what a throw becomes:
// the process failed, not the file.

import { classifyTarget } from '../boundary/target.js';
import type {
  ClaimOutcome,
  FenceOutcome,
  FinalizeOutcome,
  IngestEffects,
  MarkOutcome,
  SettleOutcome,
  StrandOutcome,
  TargetOutcome,
  TransferOutcome,
  TransferRequest,
} from '../contract.js';
import type { Stranded } from '../status.js';
import { Sealed } from '../../../src/sealed.js';
import { fold, type Variant } from '../../../src/variant.js';
import { attempt, type Tried } from '../../../src/effects/attempt.js';
import type { Foreign, HeadMeta, LockIdentity, Source, StrandedCause, Transition } from './foreign.js';

const CLAIM: unique symbol = Symbol('claim');
const FENCE: unique symbol = Symbol('fenced');
const FINAL: unique symbol = Symbol('finalized');

export type Claim = Sealed<typeof CLAIM, { readonly fileId: string; readonly token: string }>;
export type Fenced = Sealed<typeof FENCE, { readonly fileId: string; readonly bytes: number }>;
export type Finalized = Sealed<typeof FINAL, { readonly fileId: string }>;

export type Effects = IngestEffects<LockIdentity, Claim, Fenced, Finalized>;

type Died = { readonly kind: 'died'; readonly diagnostic: string };
const died = (error: Error): Died => ({ kind: 'died', diagnostic: error.message });

// A write under the fence: it lands, the fence is gone, or the process failed.
type Guarded = { held: {}; revoked: {}; died: { readonly diagnostic: string } };

type Advertised = { known: { readonly bytes: number }; unknown: {} };

export type Dropped = {
  dropped: { readonly key: string };
  nothing_to_drop: {};
  orphaned: { readonly diagnostic: string };
};

export const adapt = (foreign: Foreign): Effects => {
  const underFence = (fileId: string, transition: Transition, token: string): Promise<Variant<Guarded>> =>
    attempt(() => foreign.transitionFile(fileId, transition, { kind: 'fence', token }, foreign.dataSource)).then(
      fold<Tried<void>, Variant<Guarded>>({
        ok: () => ({ kind: 'held' }),
        failed: ({ error }) => (error instanceof foreign.LifecycleGuardFailed ? { kind: 'revoked' } : died(error)),
      }),
    );

  // A size the source advertises up front, recorded under the fence when known.
  // Best effort throughout: a probe that fails, or a fenced write that is lost
  // here, leaves the size unknown; the fenced write after the fetch is the one
  // that matters.
  const probe = async (source: Source, uri: string, fileId: string, token: string): Promise<Variant<Advertised>> => {
    const head = source.head ?? null;
    if (head === null) return { kind: 'unknown' };
    // A method, called on its source: a real source may read its own state in `head`.
    return attempt(() => head.call(source, uri)).then(
      fold<Tried<HeadMeta>, Promise<Variant<Advertised>>>({
        failed: () => Promise.resolve({ kind: 'unknown' }),
        ok: ({ value }) => {
          const size = value.size ?? 0;
          return size > 0 ?
              underFence(fileId, { kind: 'measured', sizeBytes: size }, token).then(() => ({ kind: 'known', bytes: size }))
            : Promise.resolve({ kind: 'unknown' });
        },
      }),
    );
  };

  // The egress proxy's refusal is read before the deadline and before the
  // source's own words, which would otherwise look like a login the source
  // refused. Only a fetch error is read this way; a database error whose
  // message happens to match is not a refused destination.
  const fetchFailure = (error: Error): Variant<TransferOutcome> =>
    foreign.refusedByEgress(error.message) ? { kind: 'refused_by_egress', diagnostic: error.message }
    : error instanceof foreign.TransferDeadlineExceeded ? { kind: 'deadline', afterMs: error.afterMs, diagnostic: error.message }
    : died(error);

  const moveBytes = async (source: Source, request: TransferRequest<LockIdentity, Claim>, token: string): Promise<Variant<TransferOutcome>> => {
    const advertised = await probe(source, request.uri, request.fileId, token);
    const fetched = await attempt(() =>
      source.fetch(request.uri, request.destKey, {
        signal: request.signal,
        onProgress: (metrics) => {
          void foreign.publishTransfer(request.fileId, request.lock, { stage: 'transferring', ...metrics });
        },
      }),
    );
    return fold<Tried<{ readonly bytes: number }>, Promise<Variant<TransferOutcome>>>({
      failed: ({ error }) => Promise.resolve(fetchFailure(error)),
      ok: ({ value }) =>
        attempt(() => foreign.publishTransfer(request.fileId, request.lock, { stage: 'finalizing' })).then(
          fold<Tried<void>, Variant<TransferOutcome>>({
            failed: ({ error }) => died(error),
            ok: () =>
              fold<Advertised, Variant<TransferOutcome>>({
                unknown: () => ({ kind: 'transferred', bytes: value.bytes }),
                known: ({ bytes }) =>
                  value.bytes < bytes ?
                    { kind: 'short_read', advertised: bytes, received: value.bytes }
                  : { kind: 'transferred', bytes: value.bytes },
              })(advertised),
          }),
        ),
    })(fetched);
  };

  // A finalize failure carries the cause the finalizer decided; this reads it
  // whole. A `worker_died` cause from the finalizer is the process failing,
  // which the queue clears; every other cause is the file's, to record.
  const rejectedBy = (cause: StrandedCause): Variant<FinalizeOutcome<Finalized>> =>
    fold<Stranded, Variant<FinalizeOutcome<Finalized>>>({
      worker_died: ({ diagnostic }) => ({ kind: 'died', diagnostic }),
      deadline_exceeded: (c) => ({ kind: 'rejected', cause: c }),
      destination_refused: (c) => ({ kind: 'rejected', cause: c }),
      format_rejected: (c) => ({ kind: 'rejected', cause: c }),
      never_started: (c) => ({ kind: 'rejected', cause: c }),
    })(cause);

  return {
    target: (fileId) =>
      attempt(() => foreign.ingestTarget(fileId)).then(
        fold<Tried<Awaited<ReturnType<Foreign['ingestTarget']>>>, Variant<TargetOutcome>>({
          ok: ({ value }) => classifyTarget(foreign.mountSourcePrefix)(value),
          failed: ({ error }) => died(error),
        }),
      ),

    markNeverStarted: (fileId) =>
      attempt(() =>
        foreign.transitionFile(fileId, { kind: 'failed', cause: { kind: 'never_started' } }, { kind: 'unsettled' }, foreign.dataSource),
      ).then(
        fold<Tried<void>, Variant<MarkOutcome>>({
          ok: () => ({ kind: 'recorded' }),
          failed: ({ error }) => died(error),
        }),
      ),

    claim: (fileId, lock) =>
      attempt(() => foreign.claimFile(fileId, lock.workerId)).then(
        fold<Tried<string>, Variant<ClaimOutcome<Claim>>>({
          ok: ({ value }) => ({ kind: 'claimed', claim: new Sealed(CLAIM, { fileId, token: value }) }),
          failed: ({ error }) => died(error),
        }),
      ),

    transfer: (request) => {
      const { token } = Sealed.open(CLAIM, request.claim);
      const source = foreign.sourceForUri(request.uri);
      return source === null ? Promise.resolve({ kind: 'unsupported_scheme' }) : moveBytes(source, request, token);
    },

    fence: (claim, bytes) => {
      const { fileId, token } = Sealed.open(CLAIM, claim);
      return underFence(fileId, { kind: 'measured', sizeBytes: bytes }, token).then(
        fold<Guarded, Variant<FenceOutcome<Fenced>>>({
          held: () => ({ kind: 'held', fenced: new Sealed(FENCE, { fileId, bytes }) }),
          revoked: () => ({ kind: 'revoked' }),
          died: (d) => d,
        }),
      );
    },

    finalize: (fenced) => {
      const { fileId } = Sealed.open(FENCE, fenced);
      return attempt(() => foreign.finalizeAfterBytes(fileId)).then(
        fold<Tried<Awaited<ReturnType<Foreign['finalizeAfterBytes']>>>, Variant<FinalizeOutcome<Finalized>>>({
          ok: ({ value }) => (value.ok ? { kind: 'finalized', finalized: new Sealed(FINAL, { fileId }) } : rejectedBy(value.cause)),
          failed: ({ error }) => died(error),
        }),
      );
    },

    settle: (claim, finalized) => {
      const { fileId, token } = Sealed.open(CLAIM, claim);
      const { fileId: finalizedFileId } = Sealed.open(FINAL, finalized);
      return fileId === finalizedFileId ?
          underFence(fileId, { kind: 'settled' }, token).then(
            fold<Guarded, Variant<SettleOutcome>>({
              held: () => ({ kind: 'settled' }),
              revoked: () => ({ kind: 'revoked' }),
              died: (d) => d,
            }),
          )
        : Promise.resolve({ kind: 'died', diagnostic: `settle takes the receipt for ${fileId}; this one is for ${finalizedFileId}` });
    },

    strand: (claim, cause) => {
      const { fileId, token } = Sealed.open(CLAIM, claim);
      return underFence(fileId, foreign.transitionForCause(cause), token).then(
        fold<Guarded, Variant<StrandOutcome>>({
          held: () => ({ kind: 'recorded' }),
          revoked: () => ({ kind: 'revoked' }),
          died: (d) => d,
        }),
      );
    },
  };
};

// Drop an upload's staging copy, once the file has landed or nothing can
// retry it. A copy that could not be dropped is an orphan to report, not a
// failed ingest, so the outcome says which.
export const dropStaging =
  (foreign: Foreign) =>
  (fileId: string): Promise<Variant<Dropped>> =>
    attempt(async (): Promise<Variant<Dropped>> => {
      const row = await foreign.ingestTarget(fileId);
      const key = row === null || row.sourceUri === null ? null : foreign.storageKeyOf(row.sourceUri);
      if (key === null || !key.startsWith('staging/')) return { kind: 'nothing_to_drop' };
      await foreign.storageDelete(key);
      return { kind: 'dropped', key };
    }).then(
      fold<Tried<Variant<Dropped>>, Variant<Dropped>>({
        ok: ({ value }) => value,
        failed: ({ error }) => ({ kind: 'orphaned', diagnostic: error.message }),
      }),
    );
