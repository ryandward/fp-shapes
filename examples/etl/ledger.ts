// The only writer. The generic merge stays private; the exported command is
// named for the fact its owner can establish, and it accepts only a sealed
// receipt for the batch being settled. A route cannot "record a load" with a
// number it made up, cannot settle one batch with another batch's receipt,
// and no module can reach the merge to write a competing entry.

import type { BatchId } from './boundary/batch.js';
import { Sealed } from '../../src/sealed.js';
import { fold, type Variant } from '../../src/variant.js';
import { spendLoadFor, type LoadReceipt, type Settled } from './effects/load.js';

const LEDGER: unique symbol = Symbol('ledger');

export type Entry = { readonly batch: BatchId; readonly written: number };

export type Ledger = Sealed<typeof LEDGER, { readonly loads: ReadonlyArray<Entry> }>;

export const emptyLedger: Ledger = new Sealed(LEDGER, { loads: [] }, 'open');

const merge = (ledger: Ledger, entry: Entry): Ledger =>
  new Sealed(LEDGER, { loads: [...Sealed.open(LEDGER, ledger).loads, entry] }, 'open');

export type Settlement = Variant<{
  settled: { readonly ledger: Ledger };
  refused: { readonly expected: BatchId; readonly actual: BatchId };
}>;

export const settle = (ledger: Ledger, batch: BatchId, receipt: LoadReceipt): Settlement =>
  fold<Settled, Settlement>({
    matched: ({ written }) => ({ kind: 'settled', ledger: merge(ledger, { batch, written }) }),
    mismatched: ({ expected, actual }) => ({ kind: 'refused', expected, actual }),
  })(spendLoadFor(batch)(receipt));

export const loadsOf = (ledger: Ledger): ReadonlyArray<Entry> => Sealed.open(LEDGER, ledger).loads;
