// A boundary for extracted rows. Strict: an unrecognized source field is
// schema drift, and drift surfaces as a `rejected` fact with an issue, not as
// a silent strip. Readonly: the parsed row is frozen, so a stage can hand it
// out by reference.

import { z } from 'zod';
import { boundary, type Boundary } from '../../../src/boundary/boundary.js';

const rawRow = z
  .strictObject({
    id: z.string().min(1),
    value: z.string(),
  })
  .readonly();

export type RawRow = z.output<typeof rawRow>;

export const parseRawRow: Boundary<RawRow> = boundary(rawRow, (row) => row);
