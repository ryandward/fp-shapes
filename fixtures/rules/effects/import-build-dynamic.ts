// expect: a compiled core is reached through its generated FFI
export const load = () => import('../core/.build/ingest__bridge.js');
