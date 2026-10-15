// Gates for the ingest example. See src/gates.typetest.ts for how a gate works.

import { Sealed } from '../../src/sealed.js';
import type { Assert, Equal, Immutable, Total } from '../../src/total.js';
import type { KindsOf, Variant } from '../../src/variant.js';
import type { Claim, Effects, Fenced, Finalized } from './effects/adapt.js';
import type { StrandedCause } from './effects/foreign.js';
import type { IngestStatus, Stranded } from './status.js';

// --- the receipts' authorities stay private to effects/adapt.ts --------------

// @ts-expect-error CLAIM stays private to effects/adapt.ts
import { CLAIM } from './effects/adapt.js';
// @ts-expect-error FENCE stays private to effects/adapt.ts
import { FENCE } from './effects/adapt.js';
// @ts-expect-error FINAL stays private to effects/adapt.ts
import { FINAL } from './effects/adapt.js';
export const authorities: readonly symbol[] = [CLAIM, FENCE, FINAL]; // used, so each directive answers to its import alone

// --- the worker threads receipts it can neither mint nor read ----------------

declare const fx: Effects;
declare const claim: Claim;
declare const fenced: Fenced;

// @ts-expect-error finalize takes the receipt the fence effect issues
export const unfenced = fx.finalize({ fileId: 'f', bytes: 1 });

// @ts-expect-error settle takes the receipt the finalize effect issues
export const unfinalized = fx.settle(claim, fenced);

// @ts-expect-error a claim is issued by the adapter's claim effect
export const forgedClaim: Claim = new Sealed(Symbol('claim'), { fileId: 'f', token: 't' });

// @ts-expect-error a finalized receipt is issued by the adapter's finalize effect
export const forgedFinal: Finalized = new Sealed(Symbol('finalized'), { fileId: 'f' });

// @ts-expect-error a claim comes from the claim effect; a spread is plain data
export const copiedClaim: Claim = { ...claim };

// @ts-expect-error a receipt is read by the adapter that issued it
export const peekedClaim = claim.value;

// --- the cause map and the foreign StrandedCause describe the same values ----

declare const ours: Variant<Stranded>;
declare const theirs: StrandedCause;
export const toTheirs: StrandedCause = ours;
export const toOurs: Variant<Stranded> = theirs;
export type _sameCases = Assert<Equal<keyof Stranded, KindsOf<StrandedCause>>>; // neither side names a case the other lacks

// --- a status is total and immutable ------------------------------------------

export type _ingestTotal = Assert<Total<IngestStatus>>;
export type _ingestImmutable = Assert<Immutable<IngestStatus>>;
