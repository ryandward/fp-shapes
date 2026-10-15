// Loosenings of the ETL example's guarantees; its gates must refuse each.
// Each entry: a name, then one or more edits (file, from, to) applied to a
// copy of the tree. The build must then fail at a line of `gates`.

export const gates = 'examples/etl/gates.typetest.ts';
export const copy = ['src', 'examples', 'test'];
const edit = (file, from, to) => ({ file, from, to });

export const mutations = [
  ['export the retry authority', edit('examples/etl/retry.ts', 'const RETRY: unique symbol', 'export const RETRY: unique symbol')],
  [
    'let load accept any stage',
    edit('examples/etl/effects/load.ts', "Staged<'transformed', Row>", 'Staged<Stage, Row>'),
    edit('examples/etl/effects/load.ts', 'import { batchOf, rowsOf, type Staged }', 'import { batchOf, rowsOf, type Stage, type Staged }'),
  ],
  ['make a fact sparse', edit('examples/etl/boundary/file-status.ts', 'stale: z.boolean().default(false)', 'stale: z.boolean().optional()')],
  [
    'let the ledger accept a bare entry',
    edit('examples/etl/ledger.ts', 'receipt: LoadReceipt): Settlement =>', 'receipt: Entry): Settlement =>'),
    edit('examples/etl/ledger.ts', 'openLoadFor(batch)(receipt)', "({ kind: 'matched' as const, written: receipt.written })"),
  ],
];
