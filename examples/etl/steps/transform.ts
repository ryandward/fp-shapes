// A step. The only module allowed to import `step` for this transition.
// Row-level rejection belongs before `begin`, as a Classify + partition at the
// boundary, so `f` here stays total: NonEmpty in, NonEmpty out.

import type { RawRow } from '../boundary/rows.js';
import { step, type Step } from '../pipeline.js';
import { mapNonEmpty } from '../../../src/variant.js';

export type Row = {
  readonly id: string;
  readonly value: string;
};

const toRow = (raw: RawRow): Row => ({ id: raw.id, value: raw.value.trim() });

export const transform: Step<'extracted', RawRow, Row> = step('extracted')(mapNonEmpty(toRow));
