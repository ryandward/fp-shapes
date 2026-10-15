// The adapters: each foreign call becomes the outcome the core asked for.
//
// This is where a thrown class, a boolean result, a string-matched message or
// a null return is read, once per foreign API, into the closed outcome the
// core declares for that operation. The receipts the core threads (a claim, a
// fenced write, a finalized file) are minted here as records; the FFI keeps
// their identity and the core can only hand them on. The `…_died` case of
// every outcome is what a throw becomes: the process failed, not the file.

import { classifyTarget } from '../boundary/target.js';
import type {
  ClaimOutcome,
  Definitive,
  FenceOutcome,
  FinalizeOutcome,
  MarkOutcome,
  SettleOutcome,
  StrandOutcome,
  TargetOutcome,
  TransferOutcome,
} from '../boundary/ingest.ffi.js';
import type { Effects } from './ingest.drive.js';
import type { Transient } from '../report.js';
import { fold, type Variant } from '../../../src/variant.js';
import { attempt, type Tried } from '../../../src/effects/attempt.js';
import type { Foreign, HeadMeta, LockIdentity, Source, StrandedCause } from './foreign.js';

// What one attempt holds from the queue: its lock, and the signal that
// cancels its transfer.
export type Attempt = {
  readonly lock: LockIdentity;
  readonly signal: AbortSignal;
};

// A write under the fence: it lands, the fence is gone, or the process failed.
type Guarded = { held: {}; revoked: {}; died: { readonly diagnostic: string } };

type Advertised = { known: { readonly bytes: number }; unknown: {} };

export type Dropped = {
  dropped: { readonly key: string };
  nothing_to_drop: {};
  orphaned: { readonly diagnostic: string };
};

// The foreign cause vocabulary and the core's definitive causes name the same
// cases (a gate in gates.typetest.ts holds them together); the foreign one
// also carries the constant destination the store records.
const strandedCause: (cause: Variant<Definitive>) => StrandedCause = fold<Definitive, StrandedCause>({
  deadline_exceeded: ({ afterMs, diagnostic }) => ({ kind: 'deadline_exceeded', afterMs, diagnostic }),
  destination_refused: ({ diagnostic }) => ({ kind: 'destination_refused', destination: { kind: 'network' }, diagnostic }),
  format_rejected: ({ format, compression, diagnostic }) => ({ kind: 'format_rejected', format, compression, diagnostic }),
  never_started: () => ({ kind: 'never_started' }),
});

// A finalize failure carries the cause the finalizer decided; this reads it
// whole. A `worker_died` cause from the finalizer is the process failing,
// which the queue clears; every other cause is the file's, to record.
const rejectedBy: (cause: StrandedCause) => Variant<FinalizeOutcome> = fold<Definitive & Transient, Variant<FinalizeOutcome>>({
  worker_died: ({ diagnostic }) => ({ kind: 'finalize_died', diagnostic }),
  deadline_exceeded: ({ afterMs, diagnostic }) => ({ kind: 'rejected', cause: { kind: 'deadline_exceeded', afterMs, diagnostic } }),
  destination_refused: ({ diagnostic }) => ({ kind: 'rejected', cause: { kind: 'destination_refused', diagnostic } }),
  format_rejected: ({ format, compression, diagnostic }) => ({ kind: 'rejected', cause: { kind: 'format_rejected', format, compression, diagnostic } }),
  never_started: () => ({ kind: 'rejected', cause: { kind: 'never_started' } }),
});

export const adapt = (foreign: Foreign, holding: Attempt): Effects => {
  const underFence = (fileId: string, transition: Parameters<Foreign['transitionFile']>[1], token: string): Promise<Variant<Guarded>> =>
    attempt(() => foreign.transitionFile(fileId, transition, { kind: 'fence', token }, foreign.dataSource)).then(
      fold<Tried<void>, Variant<Guarded>>({
        ok: () => ({ kind: 'held' }),
        failed: ({ error }) => {
          const diagnostic = error.message;
          return error instanceof foreign.LifecycleGuardFailed ? { kind: 'revoked' } : { kind: 'died', diagnostic };
        },
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
    : { kind: 'transfer_died', diagnostic: error.message };

  const moveBytes = async (source: Source, fileId: string, token: string, uri: string, destKey: string): Promise<Variant<TransferOutcome>> => {
    const advertised = await probe(source, uri, fileId, token);
    const fetched = await attempt(() =>
      source.fetch(uri, destKey, {
        signal: holding.signal,
        onProgress: (metrics) => {
          void foreign.publishTransfer(fileId, holding.lock, { stage: 'transferring', bytesTransferred: metrics.bytesTransferred });
        },
      }),
    );
    return fold<Tried<{ readonly bytes: number }>, Promise<Variant<TransferOutcome>>>({
      failed: ({ error }) => Promise.resolve(fetchFailure(error)),
      ok: ({ value }) =>
        attempt(() => foreign.publishTransfer(fileId, holding.lock, { stage: 'finalizing' })).then(
          fold<Tried<void>, Variant<TransferOutcome>>({
            failed: ({ error }) => ({ kind: 'transfer_died', diagnostic: error.message }),
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

  return {
    target: (fileId) =>
      attempt(() => foreign.ingestTarget(fileId)).then(
        fold<Tried<Awaited<ReturnType<Foreign['ingestTarget']>>>, Variant<TargetOutcome>>({
          ok: ({ value }) => classifyTarget(foreign.mountSourcePrefix)(value),
          failed: ({ error }) => ({ kind: 'target_died', diagnostic: error.message }),
        }),
      ),

    markNeverStarted: (fileId) =>
      attempt(() =>
        foreign.transitionFile(fileId, { kind: 'failed', cause: { kind: 'never_started' } }, { kind: 'unsettled' }, foreign.dataSource),
      ).then(
        fold<Tried<void>, Variant<MarkOutcome>>({
          ok: () => ({ kind: 'marked' }),
          failed: ({ error }) => ({ kind: 'mark_died', diagnostic: error.message }),
        }),
      ),

    claim: (fileId) =>
      attempt(() => foreign.claimFile(fileId, holding.lock.workerId)).then(
        fold<Tried<string>, Variant<ClaimOutcome>>({
          ok: ({ value }) => ({ kind: 'claimed', c: { fileId, token: value } }),
          failed: ({ error }) => ({ kind: 'claim_died', diagnostic: error.message }),
        }),
      ),

    transfer: (c, uri, destKey) => {
      const source = foreign.sourceForUri(uri);
      return source === null ? Promise.resolve({ kind: 'unsupported_scheme' }) : moveBytes(source, c.fileId, c.token, uri, destKey);
    },

    fence: (c, bytes) =>
      underFence(c.fileId, { kind: 'measured', sizeBytes: bytes }, c.token).then(
        fold<Guarded, Variant<FenceOutcome>>({
          held: () => ({ kind: 'held', f: { fileId: c.fileId, bytes } }),
          revoked: () => ({ kind: 'fence_revoked' }),
          died: ({ diagnostic }) => ({ kind: 'fence_died', diagnostic }),
        }),
      ),

    finalize: (f) =>
      attempt(() => foreign.finalizeAfterBytes(f.fileId)).then(
        fold<Tried<Awaited<ReturnType<Foreign['finalizeAfterBytes']>>>, Variant<FinalizeOutcome>>({
          ok: ({ value }) => (value.ok ? { kind: 'finalized', z: { fileId: f.fileId, bytes: f.bytes } } : rejectedBy(value.cause)),
          failed: ({ error }) => ({ kind: 'finalize_died', diagnostic: error.message }),
        }),
      ),

    settle: (c, z) =>
      c.fileId === z.fileId ?
        underFence(c.fileId, { kind: 'settled' }, c.token).then(
          fold<Guarded, Variant<SettleOutcome>>({
            held: () => ({ kind: 'settle_done' }),
            revoked: () => ({ kind: 'settle_revoked' }),
            died: ({ diagnostic }) => ({ kind: 'settle_died', diagnostic }),
          }),
        )
      : Promise.resolve({ kind: 'settle_died', diagnostic: `settle takes the receipt for ${c.fileId}; this one is for ${z.fileId}` }),

    strand: (c, cause) =>
      underFence(c.fileId, foreign.transitionForCause(strandedCause(cause)), c.token).then(
        fold<Guarded, Variant<StrandOutcome>>({
          held: () => ({ kind: 'recorded' }),
          revoked: () => ({ kind: 'strand_revoked' }),
          died: ({ diagnostic }) => ({ kind: 'strand_died', diagnostic }),
        }),
      ),
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
