// Loosenings of the ingest example's guarantees; its gates must refuse each.
// Each entry: a name, then one or more edits (file, from, to) applied to a
// copy of the tree. The build must then fail at a line of `gates`.

export const gates = 'examples/ingest/gates.typetest.ts';
export const copy = ['src', 'examples', 'test'];
const edit = (file, from, to) => ({ file, from, to });

export const mutations = [
  ['let finalize take a bare fileId', edit('examples/ingest/contract.ts', 'readonly finalize: (fenced: F) =>', 'readonly finalize: (fenced: F | { readonly fileId: string; readonly bytes: number }) =>')],
  ['let settle take the fence receipt', edit('examples/ingest/contract.ts', 'readonly settle: (claim: C, finalized: Z) =>', 'readonly settle: (claim: C, finalized: Z | F) =>')],
  ['export the claim authority', edit('examples/ingest/effects/adapt.ts', 'const CLAIM: unique symbol', 'export const CLAIM: unique symbol')],
  ['drop a case the foreign type has', edit('examples/ingest/status.ts', "  never_started: {};\n};", '};')],
  ['give the cause map a case the foreign type lacks', edit('examples/ingest/status.ts', '  never_started: {};\n};', '  never_started: {};\n  quarantined: { readonly diagnostic: string };\n};')],
];
