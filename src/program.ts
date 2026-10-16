// Programs as data, with resources tracked in the type.
//
// You declare the operations an interpreter supports. For each one: its input,
// its possible outputs (a case map, as for `Union`), which output cases
// acquire a resource (by name), and which resource the operation releases.
//
//   type Door = {
//     readonly lock:   { readonly input: {}; readonly output: { locked: { readonly key: Key }; busy: {} };
//                        readonly acquires: { readonly locked: 'key' }; readonly releases: never };
//     readonly unlock: { readonly input: { readonly key: Key }; readonly output: { unlocked: {} };
//                        readonly acquires: {}; readonly releases: 'key' };
//   };
//
// A program is a value: either `pure(result)`, or `perform(op, input, then)`,
// where `then` has one continuation per output case. Nothing runs until an
// interpreter runs it.
//
//   const { pure, perform } = program<Door, string>();
//   const visit: Program<Door, string, {}> =
//     perform('lock', {}, {
//       locked: ({ key }) => perform('unlock', { key }, { unlocked: () => pure('done') }),
//       busy: () => pure('busy'),
//     });
//
// The third type parameter of `Program` is the set of resources held at that
// point. The types enforce, per path through the program:
//   - a program that finishes holds nothing: a `locked` continuation that
//     returns `pure(…)` without unlocking does not compile;
//   - an operation that releases a resource needs it held: unlocking twice,
//     or before locking, does not compile;
//   - an operation that could acquire a resource needs none of that name
//     held: locking again while holding the key does not compile.
// That is linear use of each named resource along every path.
//
// What the types cannot see is which runtime value is which resource. Make
// the resource value a single-use `Opaque` created by the interpreter, so
// that releasing the same value twice fails at runtime too.
//
// Programs are run by `run` in run.ts, which is kept separate so that this
// file's declarations mention nothing that performs effects.

import { match, type Union } from './union.js';

export type Operation = {
  readonly input: object;
  readonly output: object;
  readonly acquires: object;
  readonly releases: string;
};

export type Operations = { readonly [name: string]: Operation };

// ---------------------------------------------------------------- held resources

// The set of resources held at a point in a program, by name. Held<never> holds
// nothing; Held<'key'> holds the key.
export type Held<R extends string> = { readonly [K in R]: true };

type Releases<Ops extends Operations, K extends keyof Ops> = Ops[K]['releases'];

type MustHold<Ops extends Operations, K extends keyof Ops> = { readonly [R in Releases<Ops, K>]: true };

type AcquiredBy<Ops extends Operations, K extends keyof Ops, C> =
  C extends keyof Ops[K]['acquires'] ? (Ops[K]['acquires'][C] extends string ? { readonly [R in Ops[K]['acquires'][C]]: true } : {}) : {};

type MayAcquire<Ops extends Operations, K extends keyof Ops> = Extract<Ops[K]['acquires'][keyof Ops[K]['acquires']], string>;

// The operation name, if nothing it may acquire is already held; else never.
type NotHeld<Held, Ops extends Operations, K extends keyof Ops> = [Extract<keyof Held, MayAcquire<Ops, K>>] extends [never] ? K : never;

type HeldAfter<Held, Ops extends Operations, K extends keyof Ops, C> = Omit<Held, Releases<Ops, K>> & AcquiredBy<Ops, K, C>;

// ---------------------------------------------------------------- programs

const held: unique symbol = Symbol('held');
const identity = <X>(x: X): X => x;

type Perform<Ops extends Operations, A> = {
  [K in keyof Ops & string]: {
    readonly kind: 'perform';
    readonly op: K;
    readonly input: Ops[K]['input'];
    readonly resume: (output: Union<Ops[K]['output']>) => Untracked<Ops, A>;
  };
}[keyof Ops & string];

// A program without the held-resources index, as the interpreter sees it.
export type Untracked<Ops extends Operations, A> = { readonly kind: 'pure'; readonly value: A } | Perform<Ops, A>;

// The function-typed property makes Program invariant in Held.
export type Program<Ops extends Operations, A, Held> = Untracked<Ops, A> & { readonly [held]: (h: Held) => Held };

export type Continuations<Ops extends Operations, A, K extends keyof Ops, Held> = {
  readonly [C in keyof Ops[K]['output']]: (output: Union<Ops[K]['output'], C>) => Program<Ops, A, HeldAfter<Held, Ops, K, C>>;
};

export type Constructors<Ops extends Operations, A> = {
  readonly pure: (value: A) => Program<Ops, A, {}>;
  readonly perform: <K extends keyof Ops & string, Held extends MustHold<Ops, K>>(
    op: NotHeld<Held, Ops, K>,
    input: Ops[K]['input'],
    then: Continuations<Ops, A, K, Held>,
  ) => Program<Ops, A, Held>;
};

// The casts below erase the held-resources index, which exists only in types.
export const program = <Ops extends Operations, A>(): Constructors<Ops, A> => ({
  pure: (value) => Object.freeze({ kind: 'pure', value, [held]: identity }) as unknown as Program<Ops, A, {}>,
  perform: <K extends keyof Ops & string, Held extends MustHold<Ops, K>>(op: NotHeld<Held, Ops, K>, input: Ops[K]['input'], then: Continuations<Ops, A, K, Held>) => {
    const handlers = then as unknown as { readonly [C in keyof Ops[K]['output']]: (output: Union<Ops[K]['output'], C>) => Untracked<Ops, A> };
    const resume = (output: Union<Ops[K]['output']>): Untracked<Ops, A> => match(handlers)(output);
    return Object.freeze({ kind: 'perform', op, input, resume, [held]: identity }) as unknown as Program<Ops, A, Held>;
  },
});
