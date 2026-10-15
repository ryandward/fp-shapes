// The subject of a pipeline run. A stage carries it from `begin` to `load`,
// the load receipt records it, and the ledger refuses a receipt for any other
// batch. Provenance says who sealed a receipt; the batch says what it is about.

import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const batchId = z.string().min(1).brand<'BatchId'>();

export type BatchId = z.output<typeof batchId>;

export const newBatchId = (): BatchId => batchId.parse(randomUUID());
