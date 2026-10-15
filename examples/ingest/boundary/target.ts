// What the stored row says about this import, decided once.
//
// The row's absence, its lifecycle, its source and its destination are read
// here and nowhere else, into the target outcome the core declares. `abandoned`
// is the dead-man's switch: the upload's job was scheduled a day ahead at
// /initiate and pulled forward by /complete, so reaching the worker with no
// source or no destination means /complete never came, and the parse that
// establishes a located row is the parse that fails. `foreign_plane` is a
// mount: source, which belongs to the storage-mount plane; this worker has no
// standing to record a verdict on it.

import { z } from 'zod';
import { fold, type Variant } from '../../../src/variant.js';
import type { TargetOutcome } from './ingest.ffi.js';

const located = z
  .object({
    sourceUri: z.string(),
    destKey: z.string().min(1),
  })
  .readonly();

// The row as the ORM hands it over: every field it may leave empty, as typed.
export type TargetRow = {
  readonly sourceUri: string | null;
  readonly destKey: string | null;
  readonly lifecycle: { readonly state: string };
};

type Location = {
  absent: {};
  present: { readonly uri: string; readonly destKey: string };
};

const locate = (row: TargetRow): Variant<Location> => {
  const parsed = located.safeParse(row);
  return parsed.success ?
      { kind: 'present', uri: parsed.data.sourceUri, destKey: parsed.data.destKey }
    : { kind: 'absent' };
};

export const classifyTarget =
  (mountPrefix: string) =>
  (row: TargetRow | null): Variant<TargetOutcome> =>
    row === null ? { kind: 'gone' }
    : row.lifecycle.state !== 'arriving' ? { kind: 'settled', state: row.lifecycle.state }
    : fold<Location, Variant<TargetOutcome>>({
        absent: () => ({ kind: 'abandoned' }),
        present: ({ uri, destKey }) =>
          uri.startsWith(mountPrefix) ? { kind: 'foreign_plane', uri } : { kind: 'ready', uri, destKey },
      })(locate(row));
