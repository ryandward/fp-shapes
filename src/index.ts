// The library. Vendor src/ and import from here; eslint.config.js and
// tsconfig.json carry the enforcement that makes the shapes hold.

export { fold, mapNonEmpty, partition } from './variant.js';
export type { Cases, Classify, KindsOf, NonEmpty, Partition, Variant } from './variant.js';
export { Sealed } from './sealed.js';
export type { Decide } from './sealed.js';
export type { Assert, Equal, Exact, Immutable, Total } from './total.js';
export { boundary } from './boundary/boundary.js';
export type { Boundary, Issue, Parse, TotalSchema } from './boundary/boundary.js';
export { occupancy } from './boundary/evidence.js';
export type { Occupancy } from './boundary/evidence.js';
export { attempt } from './effects/attempt.js';
export type { Outcome, Tried } from './effects/attempt.js';
