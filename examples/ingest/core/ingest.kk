// One attempt at one import. The core: what the worker asks of the world, every
// way each request can end, and the fold over each answer.
//
// The row `shell` on `ingest` names every operation the attempt may perform
// and nothing else. A match that misses a case puts `exn` in the inferred
// row, a print puts `console` there, a recursive call puts `div` there, and
// each is refused against the declared row before anything runs. A value
// with a field the type lacks is refused by the constructor. The shell
// (TypeScript) answers each operation with a closed outcome, validated and
// frozen on its way in; the core never sees a raw value.
module ingest

import evidence

// What the stored row says about this import, decided by the shell once.
pub type target-outcome
  Gone
  Settled(state: string)
  Abandoned
  ForeignPlane(uri: string)
  Ready(uri: string, dest-key: string)
  TargetDied(diagnostic: string)

pub type mark-outcome
  Marked
  MarkDied(diagnostic: string)

pub type claim-outcome
  Claimed(c: claim)
  ClaimDied(diagnostic: string)

pub type transfer-outcome
  Transferred(bytes: int)
  UnsupportedScheme
  ShortRead(advertised: int, received: int)
  RefusedByEgress(diagnostic: string)
  Deadline(after-ms: int, diagnostic: string)
  TransferDied(diagnostic: string)

pub type fence-outcome
  Held(f: fenced-receipt)
  FenceRevoked
  FenceDied(diagnostic: string)

pub type finalize-outcome
  Finalized(z: finalized-receipt)
  Rejected(cause: definitive)
  FinalizeDied(diagnostic: string)

pub type settle-outcome
  SettleDone
  SettleRevoked
  SettleDied(diagnostic: string)

pub type strand-outcome
  Recorded
  StrandRevoked
  StrandDied(diagnostic: string)

// A cause a holder records on the row. Transience is a property of a cause:
// the one the queue clears by running again is WorkerDied, a status of its own.
pub type definitive
  DeadlineExceeded(after-ms: int, diagnostic: string)
  DestinationRefused(diagnostic: string)
  FormatRejected(format: string, compression: string, diagnostic: string)
  NeverStarted

// How one attempt ended.
pub type ingest-status
  Succeeded(bytes: int)
  RowGone
  AlreadySettled(state: string)
  NotThisPlane(uri: string)
  ClaimRevoked
  WorkerDied(diagnostic: string)
  Stranded(cause: definitive)

// The command algebra: one operation per request, each answered by the shell
// with that request's outcome. An operation that takes a receipt spends it.
pub effect shell
  ctl target(file-id: string): target-outcome
  ctl mark-never-started(file-id: string): mark-outcome
  ctl claim(file-id: string): claim-outcome
  ctl transfer(c: claim, uri: string, dest-key: string): transfer-outcome
  ctl fence(c: claim, bytes: int): fence-outcome
  ctl finalize(f: fenced-receipt): finalize-outcome
  ctl settle(c: claim, z: finalized-receipt): settle-outcome
  ctl strand(c: claim, cause: definitive): strand-outcome

// A definitive cause is recorded under the claim this attempt holds; a
// replacement that took the row leaves its verdict standing.
fun record(c: claim, cause: definitive): shell ingest-status
  match strand(c, cause)
    Recorded -> Stranded(cause)
    StrandRevoked -> ClaimRevoked
    StrandDied(d) -> WorkerDied(d)

fun settle-stage(c: claim, z: finalized-receipt, bytes: int): shell ingest-status
  match settle(c, z)
    SettleDone -> Succeeded(bytes)
    SettleRevoked -> ClaimRevoked
    SettleDied(d) -> WorkerDied(d)

fun finalize-stage(c: claim, f: fenced-receipt, bytes: int): shell ingest-status
  match finalize(f)
    Finalized(z) -> settle-stage(c, z, bytes)
    Rejected(cause) -> record(c, cause)
    FinalizeDied(d) -> WorkerDied(d)

fun fence-stage(c: claim, bytes: int): shell ingest-status
  match fence(c, bytes)
    Held(f) -> finalize-stage(c, f, bytes)
    FenceRevoked -> ClaimRevoked
    FenceDied(d) -> WorkerDied(d)

fun transfer-stage(c: claim, uri: string, dest-key: string): shell ingest-status
  match transfer(c, uri, dest-key)
    Transferred(bytes) -> fence-stage(c, bytes)
    ShortRead(advertised, received) ->
      WorkerDied("short read: the source advertised " ++ advertised.show ++ " bytes and the destination holds " ++ received.show)
    UnsupportedScheme -> record(c, FormatRejected("unknown", "unknown", "unsupported scheme: " ++ uri))
    RefusedByEgress(d) -> record(c, DestinationRefused(d))
    Deadline(after-ms, d) -> record(c, DeadlineExceeded(after-ms, d))
    TransferDied(d) -> WorkerDied(d)

fun acquire(file-id: string, uri: string, dest-key: string): shell ingest-status
  match claim(file-id)
    Claimed(c) -> transfer-stage(c, uri, dest-key)
    ClaimDied(d) -> WorkerDied(d)

fun abandon(file-id: string): shell ingest-status
  match mark-never-started(file-id)
    Marked -> Stranded(NeverStarted)
    MarkDied(d) -> WorkerDied(d)

pub fun ingest(file-id: string): shell ingest-status
  match target(file-id)
    Gone -> RowGone
    Settled(state) -> AlreadySettled(state)
    Abandoned -> abandon(file-id)
    ForeignPlane(uri) -> NotThisPlane(uri)
    Ready(uri, dest-key) -> acquire(file-id, uri, dest-key)
    TargetDied(d) -> WorkerDied(d)
