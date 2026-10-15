// Gates for the ETL example. See src/gates.typetest.ts for how a gate works.

import type { Assert, Immutable, Total } from '../../src/total.js';
import { Sealed } from '../../src/sealed.js';
import type { NonEmpty, Variant } from '../../src/variant.js';
import type { FileId, Status, StoredFile } from './boundary/file-status.js';
import type { RawRow } from './boundary/rows.js';
import { load, type LoadReceipt } from './effects/load.js';
import { emptyLedger, settle, type Ledger, type Settlement } from './ledger.js';
import { step, type Staged, type Step } from './pipeline.js';
import type { Retry, RetryDecision } from './retry.js';
import type { Row } from './steps/transform.js';
import type { BatchId } from './boundary/batch.js';

// --- authority stays private --------------------------------------------------

// @ts-expect-error RETRY stays private to retry.ts
import { RETRY } from './retry.js';
export const probe: symbol = RETRY; // used, so the directive answers to the import alone

declare const genuine: RetryDecision;

// @ts-expect-error a decision comes from retryOf; a spread is plain data
export const copied: RetryDecision = { ...genuine };

// @ts-expect-error a verdict is read through openRetry
export const peeked = genuine.value;

// @ts-expect-error a decision is issued by retry.ts
export const forged: RetryDecision = new Sealed(Symbol('retry'), { kind: 'none' });

// --- stages advance in order; writers take receipts ---------------------------

declare const extracted: Staged<'extracted', RawRow>;
declare const toRows: (rows: NonEmpty<RawRow>) => NonEmpty<Row>;
declare const batch: BatchId;

// @ts-expect-error a step advances exactly one stage, per the transition table
export const skipped: Step<'extracted', RawRow, Row> = step('transformed')(toRows);

// @ts-expect-error load takes transformed rows
export const loaded: Promise<LoadReceipt> = load(extracted);

// @ts-expect-error the ledger settles a receipt issued by load
export const claimed: Settlement = settle(emptyLedger, batch, { batch, written: 3 });

declare const ledger: Ledger;

// @ts-expect-error a ledger is read through loadsOf
export const peekedLedger = ledger.value;

// --- facts and verdicts are total and immutable --------------------------------

export type _storedTotal = Assert<Total<StoredFile>>;
export type _storedImmutable = Assert<Immutable<StoredFile>>;
export type _statusTotal = Assert<Total<Variant<Status>>>;
export type _statusImmutable = Assert<Immutable<Variant<Status>>>;
export type _retryTotal = Assert<Total<Variant<Retry>>>;
export type _brandIsLeaf = Assert<Total<{ id: FileId }>>;
