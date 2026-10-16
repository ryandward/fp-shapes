// The entry point for pure code. Everything here is free of effects, and the
// declarations it pulls in mention nothing that performs one (no Promise, no
// Date, no I/O), so a project compiled with only a pure standard library can
// import it.

export { match, bool, none, some, ok, err, nonEmpty, head } from './union.js';
export { compare, eq } from './order.js';
export type { Ordering, OrderingCases } from './order.js';
export type { Union, Handlers, BoolHandlers, Option, OptionCases, Result, ResultCases, NonEmptyArray } from './union.js';
export type { Opaque, Use } from './opaque.js';
export type { IsComplete, IsDeepReadonly, Recursive, Equal, Expect } from './types.js';
export { program } from './program.js';
export type { Operation, Operations, Program, Continuations, Constructors, Held } from './program.js';
