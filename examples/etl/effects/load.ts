// An effect. It accepts only transformed rows and returns a sealed receipt:
// "the function resolved" is not evidence that rows were written; the receipt
// is, and only this module can issue one. The receipt records the batch it
// settled, and the only opener takes the batch the reader expects, so a
// receipt for another batch is a named outcome rather than a silent success.

import type { BatchId } from '../boundary/batch.js';
import { batchOf, rowsOf, type Staged } from '../pipeline.js';
import { Sealed } from '../../../src/sealed.js';
import type { NonEmpty, Variant } from '../../../src/variant.js';
import type { Row } from '../steps/transform.js';

const LOAD: unique symbol = Symbol('load');

// A receipt settles one batch once, so it is sealed for one read.
export type LoadReceipt = Sealed<typeof LOAD, { readonly batch: BatchId; readonly written: number }, 'spend'>;

// The real write goes here. Stubbed so the example runs.
const writeRows = (rows: NonEmpty<Row>): Promise<number> => Promise.resolve(rows.length);

export const load = (input: Staged<'transformed', Row>): Promise<LoadReceipt> =>
  writeRows(rowsOf(input)).then((written) => new Sealed(LOAD, { batch: batchOf(input), written }, 'spend'));

export type Settled = {
  matched: { readonly written: number };
  mismatched: { readonly expected: BatchId; readonly actual: BatchId };
};

export const spendLoadFor =
  (expected: BatchId) =>
  (receipt: LoadReceipt): Variant<Settled> => {
    const { batch, written } = Sealed.spend(LOAD, receipt);
    return batch === expected ? { kind: 'matched', written } : { kind: 'mismatched', expected, actual: batch };
  };
