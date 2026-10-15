// One attempt at one import, as a fold over each effect's outcome.
//
// The worker holds no conditional, no try, and no view inside a receipt. Each
// stage is a function that folds one outcome: a definitive cause is recorded
// under the claim this attempt holds, a `died` is handed back unrecorded for
// the queue to run again, a `revoked` means a replacement owns the row and
// its verdict stands. Adding a case to any outcome is a compile error here
// until this file says what it means.

import type { DestKey, SourceUri } from './boundary/target.js';
import { fold, type Variant } from '../../src/variant.js';
import type {
  ClaimOutcome,
  FenceOutcome,
  FinalizeOutcome,
  IngestArgs,
  IngestEffects,
  MarkOutcome,
  SettleOutcome,
  StrandOutcome,
  TargetOutcome,
  TransferOutcome,
} from './contract.js';
import type { Definitive, IngestStatus } from './status.js';

const done = (status: IngestStatus): Promise<IngestStatus> => Promise.resolve(status);

const transient = ({ diagnostic }: { readonly diagnostic: string }): Promise<IngestStatus> =>
  done({ kind: 'worker_died', diagnostic });

const revoked = (): Promise<IngestStatus> => done({ kind: 'claim_revoked' });

export const ingest = <L, C, F, Z>(fx: IngestEffects<L, C, F, Z>): ((args: IngestArgs<L>) => Promise<IngestStatus>) => {
  const record = (claim: C, cause: Variant<Definitive>): Promise<IngestStatus> =>
    fx.strand(claim, cause).then(
      fold<StrandOutcome, Promise<IngestStatus>>({
        recorded: () => done(cause),
        revoked,
        died: transient,
      }),
    );

  const settle = (claim: C, finalized: Z, bytes: number): Promise<IngestStatus> =>
    fx.settle(claim, finalized).then(
      fold<SettleOutcome, Promise<IngestStatus>>({
        settled: () => done({ kind: 'succeeded', bytes }),
        revoked,
        died: transient,
      }),
    );

  const finalize = (claim: C, fenced: F, bytes: number): Promise<IngestStatus> =>
    fx.finalize(fenced).then(
      fold<FinalizeOutcome<Z>, Promise<IngestStatus>>({
        finalized: ({ finalized }) => settle(claim, finalized, bytes),
        rejected: ({ cause }) => record(claim, cause),
        died: transient,
      }),
    );

  const fence = (claim: C, bytes: number): Promise<IngestStatus> =>
    fx.fence(claim, bytes).then(
      fold<FenceOutcome<F>, Promise<IngestStatus>>({
        held: ({ fenced }) => finalize(claim, fenced, bytes),
        revoked,
        died: transient,
      }),
    );

  const transfer = (args: IngestArgs<L>, claim: C, uri: SourceUri, destKey: DestKey): Promise<IngestStatus> =>
    fx.transfer({ fileId: args.fileId, lock: args.lock, signal: args.signal, claim, uri, destKey }).then(
      fold<TransferOutcome, Promise<IngestStatus>>({
        transferred: ({ bytes }) => fence(claim, bytes),
        short_read: ({ advertised, received }) =>
          transient({ diagnostic: `short read: the source advertised ${advertised} bytes and the destination holds ${received}` }),
        unsupported_scheme: () =>
          record(claim, { kind: 'format_rejected', format: 'unknown', compression: 'unknown', diagnostic: `unsupported scheme: ${uri}` }),
        refused_by_egress: ({ diagnostic }) =>
          record(claim, { kind: 'destination_refused', destination: { kind: 'network' }, diagnostic }),
        deadline: ({ afterMs, diagnostic }) => record(claim, { kind: 'deadline_exceeded', afterMs, diagnostic }),
        died: transient,
      }),
    );

  const acquire = (args: IngestArgs<L>, uri: SourceUri, destKey: DestKey): Promise<IngestStatus> =>
    fx.claim(args.fileId, args.lock).then(
      fold<ClaimOutcome<C>, Promise<IngestStatus>>({
        claimed: ({ claim }) => transfer(args, claim, uri, destKey),
        died: transient,
      }),
    );

  const abandon = (args: IngestArgs<L>): Promise<IngestStatus> =>
    fx.markNeverStarted(args.fileId).then(
      fold<MarkOutcome, Promise<IngestStatus>>({
        recorded: () => done({ kind: 'never_started' }),
        died: transient,
      }),
    );

  return (args) =>
    fx.target(args.fileId).then(
      fold<TargetOutcome, Promise<IngestStatus>>({
        gone: () => done({ kind: 'row_gone' }),
        settled: ({ state }) => done({ kind: 'already_settled', state }),
        abandoned: () => abandon(args),
        foreign_plane: ({ uri }) => done({ kind: 'not_this_plane', uri }),
        ready: ({ uri, destKey }) => acquire(args, uri, destKey),
        died: transient,
      }),
    );
};
