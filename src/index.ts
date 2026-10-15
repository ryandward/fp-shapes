// The library. Vendor src/ and import from here; eslint.config.js and
// tsconfig.json carry the enforcement that makes the shapes hold.

export { fold, mapNonEmpty, partition } from './variant.js';
export type { Cases, Classify, KindsOf, NonEmpty, Partition, Variant } from './variant.js';
export { Sealed } from './sealed.js';
export type { Decide, Use } from './sealed.js';
export type { Assert, Deep, Equal, Exact, Immutable, Recursive, Total } from './total.js';
export { boundary, sealing } from './boundary/boundary.js';
export type { Boundary, Fact, Issue, Parse, TotalSchema } from './boundary/boundary.js';
export { occupancy } from './boundary/evidence.js';
export type { Occupancy } from './boundary/evidence.js';
export { compare } from './boundary/compare.js';
export type { Comparison } from './boundary/compare.js';
// `attempt` is imported from './effects/attempt.js' by effects modules; the
// index carries shapes, and the domain tier refuses an import from effects/.
export type { Outcome, Tried } from './effects/attempt.js';
