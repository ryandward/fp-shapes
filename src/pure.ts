// The entry point for pure code. Everything here is free of effects, and the
// declarations it pulls in mention nothing that performs one (no Promise, no
// Date, no I/O), so a project compiled with only a pure standard library can
// import it.

export { match, none, some, ok, err, nonEmpty } from './union.js';
export type { Union, Handlers, Option, OptionCases, Result, ResultCases, NonEmptyArray } from './union.js';
export type { Opaque, Use } from './opaque.js';
export type { IsComplete, IsDeepReadonly, Recursive, Equal, Expect } from './types.js';
export { program } from './program.js';
export type { Operation, Operations, Program, Continuations, Constructors } from './program.js';
