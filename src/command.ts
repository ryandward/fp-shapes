// The command algebra: effects as data, with linearity in the type.
//
// A plane declares its operations. For each: the arguments the shell needs to
// perform it, the closed outcome the shell answers with, which outcome cases
// issue a receipt (by name), and which receipt the operation spends. From
// that declaration the kernel derives the step type. A domain function
// returns a step: `done` with a status, or `suspend`ed on one operation with
// a resumption per outcome case. The interpreter in effects/ performs the
// operation, answers the resumption, and keeps the ledger; the domain never
// performs anything.
//
// A step's type carries what the attempt owes: the receipts issued and not
// yet spent. `done` is a step that owes nothing. An operation's arms are
// typed with what each answer leaves owed, and an operation that spends a
// receipt requires it owed. So a receipt dropped (an arm that owes one
// returns `done`), spent twice (the second spend finds nothing owed) or spent
// out of order (the receipt is not owed yet) is a type error in the arm where
// it happens; the step type is invariant in what is owed, through a
// function-typed property, so a step owing nothing is not a step owing
// something and the reverse. Nothing is read from that property at runtime:
// it holds the shared identity. The runtime half stays with `Sealed`: a
// receipt is a sealed value spent once by identity, so a receipt carried
// into another attempt's chain is refused where it is spent.
//
// What the owed index does not count: two receipts of the same name
// outstanding at once. A plane that issues two names them differently.

import { ledger } from './ledger.js';
import { fold, type Cases, type Variant } from './variant.js';

// ---------------------------------------------------------------- declaration

// One operation of a plane. `outcome` is a Cases map, whose Variant is the
// shell's answer. `issues` names, per outcome case, the receipt that answer
// hands the attempt; `spends` names the receipt the operation consumes, or
// never.
export type Operation = {
  readonly args: object;
  readonly outcome: object;
  readonly issues: object;
  readonly spends: string;
};

export type Operations = { readonly [op: string]: Operation };

// ---------------------------------------------------------------- the owed index

type Spends<Ops extends Operations, K extends keyof Ops> = Ops[K]['spends'];

// What must be owed before the operation runs.
type Requires<Ops extends Operations, K extends keyof Ops> = { readonly [R in Spends<Ops, K>]: true };

// What one answer issues.
type Issued<Ops extends Operations, K extends keyof Ops, C> =
  C extends keyof Ops[K]['issues'] ? (Ops[K]['issues'][C] extends string ? { readonly [R in Ops[K]['issues'][C]]: true } : {}) : {};

// What is owed after the operation answered with case C: what was owed, less
// what the operation spent, plus what the answer issued.
type After<O, Ops extends Operations, K extends keyof Ops, C> = Omit<O, Spends<Ops, K>> & Issued<Ops, K, C>;

// ---------------------------------------------------------------- the step

const owes: unique symbol = Symbol('owes');

const same = <X>(x: X): X => x;

// The step as the interpreter sees it: done, or suspended on one operation
// with its arguments and a resumption that takes that operation's outcome.
// A plain union rather than a Variant: the domain never folds a step (the
// interpreter does, by its kind), it only returns one.
type Suspended<Ops extends Operations, S> = {
  readonly [K in keyof Ops & string]: {
    readonly kind: `await_${K}`;
    readonly args: Ops[K]['args'];
    readonly resume: (outcome: Variant<Ops[K]['outcome']>) => Erased<Ops, S>;
  };
}[keyof Ops & string];

export type Erased<Ops extends Operations, S> = { readonly kind: 'done'; readonly status: S } | Suspended<Ops, S>;

// The step as the domain writes it: the same value, with what it owes in
// its type. Invariant in O.
export type Step<Ops extends Operations, S, O> = Erased<Ops, S> & { readonly [owes]: (o: O) => O };

// The arms of a suspension: one per outcome case, each returning a step that
// owes what that answer leaves owed.
export type Arms<Ops extends Operations, S, K extends keyof Ops, O> = {
  readonly [C in keyof Ops[K]['outcome']]: (answer: Variant<Ops[K]['outcome'], C>) => Step<Ops, S, After<O, Ops, K, C>>;
};

export type Algebra<Ops extends Operations, S> = {
  readonly done: (status: S) => Step<Ops, S, {}>;
  readonly suspend: <K extends keyof Ops & string, O extends Requires<Ops, K>>(op: K, args: Ops[K]['args'], arms: Arms<Ops, S, K, O>) => Step<Ops, S, O>;
};

// A plane's constructors. The assertions in this file are where a value is
// typed by a parameter the compiler cannot see through: a step's `kind` is
// computed from the operation's name, which the union names per operation
// and a literal cannot; the arms return steps owing different things, which
// the resumption erases. The gates in gates.typetest.ts and the mutations
// hold what the assertions could otherwise hide.
export const commands = <Ops extends Operations, S>(): Algebra<Ops, S> => ({
  done: (status) => Object.freeze({ kind: 'done', status, [owes]: same }) as unknown as Step<Ops, S, {}>,
  suspend: <K extends keyof Ops & string, O extends Requires<Ops, K>>(op: K, args: Ops[K]['args'], arms: Arms<Ops, S, K, O>): Step<Ops, S, O> => {
    const erased = arms as unknown as Cases<Ops[K]['outcome'], Erased<Ops, S>>;
    const resume = (outcome: Variant<Ops[K]['outcome']>): Erased<Ops, S> => fold<Ops[K]['outcome'], Erased<Ops, S>>(erased)(outcome);
    return Object.freeze({ kind: `await_${op}`, args, resume, [owes]: same }) as unknown as Step<Ops, S, O>;
  },
});

// ---------------------------------------------------------------- the interpreter

// What the shell does for each operation.
export type Effects<Ops extends Operations> = {
  readonly [K in keyof Ops]: (args: Ops[K]['args']) => Promise<Variant<Ops[K]['outcome']>>;
};

// One ledger entry: an operation, its arguments, its outcome.
export type Entry<Ops extends Operations> = Variant<{
  readonly [K in keyof Ops & string]: { readonly args: Ops[K]['args']; readonly outcome: Variant<Ops[K]['outcome']> };
}>;

export type Run<Ops extends Operations, S> = {
  finished: { readonly status: S; readonly ledger: ReadonlyArray<Entry<Ops>> };
  halted: { readonly error: Error; readonly ledger: ReadonlyArray<Entry<Ops>> };
};

// A suspension as the interpreter reads it, any operation.
type Waiting<Ops extends Operations, S> = {
  readonly kind: string;
  readonly args: Ops[keyof Ops]['args'];
  readonly resume: (outcome: Variant<Ops[keyof Ops]['outcome']>) => Erased<Ops, S>;
};

// Drives a step to its end: performs the operation each suspension names,
// resumes with the outcome, and notes both in the ledger; a performer that
// throws halts the run with the ledger so far. The entry owes nothing, so a
// domain function's first step is what is driven.
export const drive = <Ops extends Operations, S>(fx: Effects<Ops>, first: Step<Ops, S, {}>): Promise<Variant<Run<Ops, S>>> => {
  const noted = ledger<Entry<Ops>>();
  const loop = (step: Erased<Ops, S>): Promise<Variant<Run<Ops, S>>> => {
    if (step.kind === 'done') return Promise.resolve({ kind: 'finished', status: (step as unknown as { readonly status: S }).status, ledger: noted.entries() });
    const waiting = step as unknown as Waiting<Ops, S>;
    const op = waiting.kind.slice('await_'.length) as keyof Ops & string;
    return fx[op](waiting.args).then((outcome) => {
      const next = waiting.resume(outcome);
      noted.note(Object.freeze({ kind: op, args: waiting.args, outcome }) as unknown as Entry<Ops>);
      return loop(next);
    });
  };
  return loop(first).catch((thrown: unknown) => ({
    kind: 'halted',
    error: thrown instanceof Error ? thrown : new Error(String(thrown)),
    ledger: noted.entries(),
  }));
};
