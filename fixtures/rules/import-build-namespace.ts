// expect: a compiled core is reached through its generated FFI
import * as bridge from './core/.build/ingest__bridge.js';
export const b = bridge;
