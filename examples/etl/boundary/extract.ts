// Extraction. Raw records are classified by the row boundary, partitioned so
// that every rejection is kept as a fact, and the accepted rows become a stage
// of this batch only if there are any. Nothing here is a predicate; nothing
// downstream re-checks emptiness.

import { begin, type Staged } from '../pipeline.js';
import { fold, partition, type NonEmpty, type Variant } from '../../../src/variant.js';
import type { BatchId } from './batch.js';
import type { Issue } from '../../../src/boundary/boundary.js';
import { occupancy, type Occupancy } from '../../../src/boundary/evidence.js';
import { parseRawRow, type RawRow } from './rows.js';

export type Extraction = Variant<{
  started: {
    readonly staged: Staged<'extracted', RawRow>;
    readonly rejected: ReadonlyArray<NonEmpty<Issue>>;
  };
  nothing: { readonly rejected: ReadonlyArray<NonEmpty<Issue>> };
}>;

export const extract = (batch: BatchId, raws: ReadonlyArray<unknown>): Extraction => {
  const parsed = partition(parseRawRow, { accepted: [], rejected: [] })(raws);
  const rejected = parsed.rejected.map((r) => r.issues);
  return fold<Occupancy<RawRow>, Extraction>({
    some: ({ rows }) => ({ kind: 'started', staged: begin(batch, rows), rejected }),
    empty: () => ({ kind: 'nothing', rejected }),
  })(occupancy(parsed.accepted.map((a) => a.fact)));
};
