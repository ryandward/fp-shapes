// Loosenings of the ingest shell's guarantees; its gates must refuse each.
// Each entry: a name, then one or more edits (file, from, to) applied to a
// copy of the tree. The build must then fail at a line of `gates`. The core's
// own loosenings are in core/mutations.mjs, against the compiler, the gate,
// the regenerated surface and the tests.

export const gates = 'examples/ingest/gates.typetest.ts';
export const copy = ['src', 'examples', 'test'];
const edit = (file, from, to) => ({ file, from, to });
const ffi = 'examples/ingest/boundary/ingest.ffi.ts';

export const mutations = [
  // the generated surface, were the generator to loosen it
  ['let a fence be answered with a claim outcome', edit(ffi, 'readonly resume: (outcome: Variant<FenceOutcome>) => Variant<Step>;', 'readonly resume: (outcome: Variant<FenceOutcome> | Variant<ClaimOutcome>) => Variant<Step>;')],
  ['let a receipt be half', edit(ffi, 'export type FencedReceipt = { readonly fileId: string; readonly bytes: number };', 'export type FencedReceipt = { readonly fileId: string; readonly bytes?: number };')],
  ['let a Koka claim be a plain record', edit('examples/ingest/core/.build/evidence.d.ts', "export type Claim = { readonly [brand]: 'evidence/claim' };", 'export type Claim = { readonly fileId: string; readonly token: string };')],
  ['let a Koka status be a tagged record', edit('examples/ingest/core/.build/ingest.d.ts', "export type IngestStatus = { readonly [brand]: 'ingest/ingest-status' };", 'export type IngestStatus = { readonly _tag: number; readonly bytes: number };')],
  // the foreign vocabulary and the core's causes
  ['drop a case the core has from the foreign vocabulary', edit('examples/ingest/effects/foreign.ts', "  | { readonly kind: 'never_started' };", ';')],
  ['give the foreign vocabulary a case the core lacks', edit('examples/ingest/effects/foreign.ts', "  | { readonly kind: 'never_started' };", "  | { readonly kind: 'never_started' }\n  | { readonly kind: 'quarantined'; readonly diagnostic: string };")],
];
