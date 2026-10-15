// A boundary for one fact: the stored file row.
//
// Input is sparse and legacy-tolerant; output is total and readonly, or
// `boundary` refuses the schema. The one `?:` chain in `classify` is the only
// place that looks at the raw fields, and the result is sealed so that no
// hand-made object can pose as a parsed fact downstream.

import { z } from 'zod';
import { Sealed } from '../../../src/sealed.js';
import type { Variant } from '../../../src/variant.js';
import { boundary, type Boundary } from '../../../src/boundary/boundary.js';

const FILE_STATUS: unique symbol = Symbol('file-status');

const fileId = z.string().min(1).brand<'FileId'>();
const url = z.string().min(1).brand<'Url'>();
export type FileId = z.output<typeof fileId>;
export type Url = z.output<typeof url>;

// Every absence is decided here, once. Zod 4 note: `.default()` returns its
// value unparsed when the key is absent (`.prefault()` is the parsed form), so
// each default is written in output form, which is what a total output wants.
// `.readonly()` makes the output type readonly and freezes the value.
const stored = z
  .object({
    file: fileId.nullable().default(null),
    remote: url.nullable().default(null),
    stale: z.boolean().default(false),
  })
  .readonly();
export type StoredFile = z.output<typeof stored>;

export type Status = {
  missing: {};
  stale: { readonly file: FileId };
  remote: { readonly url: Url };
  current: { readonly file: FileId };
};

export type FileStatus = Sealed<typeof FILE_STATUS, Variant<Status>>;

const classify = (row: StoredFile): Variant<Status> =>
  row.file === null ? { kind: 'missing' }
  : row.remote !== null ? { kind: 'remote', url: row.remote }
  : row.stale ? { kind: 'stale', file: row.file }
  : { kind: 'current', file: row.file };

export const parseFileStatus: Boundary<FileStatus> = boundary(
  stored,
  (row) => new Sealed(FILE_STATUS, classify(row), 'open'),
);

// The domain reads a fact through its boundary's opener, never through a field.
export const statusOf = (fact: FileStatus): Variant<Status> => Sealed.open(FILE_STATUS, fact);
