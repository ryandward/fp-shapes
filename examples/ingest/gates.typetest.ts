// Gates for the ingest example. See src/gates.typetest.ts for how a gate works.
// The core is Koka; what these pin is the surface the FFI generates for it.

import type * as evidence from './core/.build/evidence.js';
import type * as core from './core/.build/ingest.js';
import type * as bridge from './core/.build/ingest__bridge.js';
import type { Definitive, IngestStatus, Step } from './boundary/ingest.ffi.js';
import type { Transient } from './report.js';
import type { StrandedCause } from './effects/foreign.js';
import type { Assert, Equal, Immutable, Total } from '../../src/total.js';
import type { KindsOf, Variant } from '../../src/variant.js';

// --- a Koka value comes from a constructor, never from a literal -------------

// @ts-expect-error a claim is minted through the compiled module's constructor; a record is not one
export const forgedClaim: evidence.Claim = { fileId: 'f', token: 't' };

// @ts-expect-error a status is the core's; a literal with the right fields is not a value of its type
export const forgedStatus: core.IngestStatus = { _tag: 1, bytes: 1 };

// @ts-expect-error a step comes from start or a resumption
export const forgedStep: bridge.Step = { _tag: 1, status: core.RowGone };

// --- each suspension's resumption takes that operation's outcome and no other -

declare const fenceStep: Variant<Step, 'await_fence'>;
declare const claimStep: Variant<Step, 'await_claim'>;

// @ts-expect-error a fence is answered with a fence outcome, not a claim's
export const misanswered = fenceStep.resume({ kind: 'claimed', c: { fileId: 'f', token: 't' } });

// @ts-expect-error a claim is answered with a claim outcome, not a fence's
export const misanswered2 = claimStep.resume({ kind: 'held', f: { fileId: 'f', bytes: 1 } });

// @ts-expect-error a receipt names every field the core declares
export const halfReceipt = fenceStep.resume({ kind: 'held', f: { fileId: 'f' } });

// --- the cause map and the foreign StrandedCause describe the same cases -----

export type _sameCases = Assert<Equal<keyof (Definitive & Transient), KindsOf<StrandedCause>>>; // neither side names a case the other lacks

// --- a status is total and immutable ------------------------------------------

export type _ingestTotal = Assert<Total<Variant<IngestStatus>>>;
export type _ingestImmutable = Assert<Immutable<Variant<IngestStatus>>>;
export type _stepTotal = Assert<Total<Variant<Step, 'done'>>>;
