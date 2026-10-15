// Running programs, and other functions that perform effects. Kept apart
// from the pure modules so that their declarations never mention Promise.

import type { Operations, Program, Untracked } from './program.js';
import { err, ok, type Result, type Union } from './union.js';

// Run an async function and capture a thrown value as an `err`.
export const tryCatch = async <A>(f: () => Promise<A>): Promise<Result<Error, A>> => {
  try {
    return ok(await f());
  } catch (thrown) {
    return err(thrown instanceof Error ? thrown : new Error(String(thrown)));
  }
};

export type Interpreter<Ops extends Operations> = {
  readonly [K in keyof Ops]: (input: Ops[K]['input']) => Promise<Union<Ops[K]['output']>>;
};

export type LogEntry<Ops extends Operations> = Union<{
  readonly [K in keyof Ops & string]: { readonly input: Ops[K]['input']; readonly output: Union<Ops[K]['output']> };
}>;

export type Outcome<Ops extends Operations, A> = Union<{
  completed: { readonly value: A; readonly log: ReadonlyArray<LogEntry<Ops>> };
  failed: { readonly error: Error; readonly log: ReadonlyArray<LogEntry<Ops>> };
}>;

type AnyPerform<Ops extends Operations, A> = {
  readonly op: keyof Ops & string;
  readonly input: Ops[keyof Ops]['input'];
  readonly resume: (output: Union<Ops[keyof Ops]['output']>) => Untracked<Ops, A>;
};

// Performs each operation, feeds the output to the matching continuation,
// and returns the final value with a log of every operation performed. If an
// interpreter function throws, returns the error with the log so far. Only a
// complete program, one that starts holding nothing, can be run.
export const run = async <Ops extends Operations, A>(interpreter: Interpreter<Ops>, start: Program<Ops, A, {}>): Promise<Outcome<Ops, A>> => {
  const log: LogEntry<Ops>[] = [];
  let current: Untracked<Ops, A> = start;
  try {
    while (current.kind === 'perform') {
      const step = current as unknown as AnyPerform<Ops, A>;
      const output = await interpreter[step.op](step.input);
      log.push(Object.freeze({ kind: step.op, input: step.input, output }) as unknown as LogEntry<Ops>);
      current = step.resume(output);
    }
    return { kind: 'completed', value: current.value, log: Object.freeze([...log]) };
  } catch (thrown) {
    return { kind: 'failed', error: thrown instanceof Error ? thrown : new Error(String(thrown)), log: Object.freeze([...log]) };
  }
};
