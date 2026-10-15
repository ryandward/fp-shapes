# fp-shapes

Shapes for an enforcement-grade functional domain in TypeScript: decisions
are data, made once at the boundary; every consumer folds; effects are
commands the domain returns and an interpreter performs; a receipt issued
is spent exactly once, and the type of every step says so; only an owner
can pronounce a verdict; possession of a value proves how it was obtained;
and every gate has a test that fails the build when the gate opens.

Three layers hold it. The kernel (`src/`) gives the shapes: `Variant` and
`fold`, `Sealed`, `Total` and `Immutable`, `boundary`, `commands` and
`drive`. The lint tiers (`eslint.config.js`) refuse, by path segment, the
syntax the type system leaves available. The acceptor (`scripts/accept.mjs`)
walks every domain module with tsc's checker in hand and admits a grammar:
exact at every declared type, calling nothing but the kernel, itself and a
fact's methods, deciding nothing by a boolean, reaching nothing twice. What
it does not name, it refuses. Each layer is proved by its own artifacts:
gates with a mutation per gate, lint rules with a fixture per rule,
acceptor rules with a fixture per rule, runtime laws with a test each.

The library is `src/`. Vendor that directory with `eslint.config.js`,
`scripts/`, `fixtures/` and `tsconfig.json`, import from `src/index.ts`,
and lay your code out by the same path segments (`boundary/`, `effects/`)
so the tiers and the acceptor apply to it unchanged. `examples/` belongs
to this repository, not to the vendor set.

## Running

```
npm ci
npm run check   # tsc, lint, rule fixtures, rule coverage, the acceptor and its fixtures, no .d.ts, mutations, tests
```

Node 22, TypeScript 5.9, zod 4, ESLint 9, from the lockfile. The tests run
under `tsx`, which opens a Unix socket under `TMPDIR`; on a deep temp path
that exceeds the socket path limit, run with a short one (`TMPDIR=/tmp`).

## The domain, in TypeScript

A plane declares its operations: per operation, the arguments the shell
needs, the closed outcome the shell answers with, which outcome cases
issue a receipt and which receipt the operation spends. The kernel derives
the step type from the declaration.

```ts
export type Fulfilment = {
  readonly reserve: { readonly args: { readonly id: string; readonly lines: ReadonlyArray<Line> }; readonly outcome: ReserveOutcome; readonly issues: { readonly reserved: 'hold' }; readonly spends: never };
  readonly charge:  { readonly args: { readonly id: string; readonly amount: number }; readonly outcome: ChargeOutcome; readonly issues: {}; readonly spends: never };
  readonly ship:    { readonly args: { readonly hold: Hold; readonly to: Address }; readonly outcome: ShipOutcome; readonly issues: {}; readonly spends: 'hold' };
  readonly release: { readonly args: { readonly hold: Hold }; readonly outcome: ReleaseOutcome; readonly issues: {}; readonly spends: 'hold' };
};
export const { done, suspend } = commands<Fulfilment, Variant<OrderStatus>>();
```

A domain function returns a step: `done` with a status, or `suspend`ed on
one operation with an arm per outcome case. The third type parameter of
`Step` is what the attempt owes — the receipts issued to it and not yet
spent — and the kernel computes it arm by arm.

```ts
type Next<O> = Step<Fulfilment, Variant<OrderStatus>, O>;

const letGo = (hold: Hold, after: Variant<OrderStatus>): Next<{ hold: true }> =>
  suspend('release', { hold }, {
    released: () => done(after),
    release_died: ({ diagnostic }) => done({ kind: 'worker_died', diagnostic }),
  });

export const fulfil = (o: Order): Next<{}> =>
  suspend('reserve', { id: o.id, lines: o.lines }, {
    reserved: ({ hold, allocations }) => settleUp(o, hold, allocations),
    short: ({ missing }) => done({ kind: 'backordered', missing }),
    reserve_died: ({ diagnostic }) => done({ kind: 'worker_died', diagnostic }),
  });
```

An arm that received a hold and returns `done` does not compile; an arm
that releases a hold already shipped does not compile; a ship before a
reservation does not compile; a hold forgotten across a charge does not
compile; a second reservation while a hold is still held does not
compile. The interpreter in `effects/` performs each operation through
an `Effects` record, resumes the chain with the outcome, and keeps the
ledger:

```ts
const run = await drive(adapt(foreign), fulfil(order));
// { kind: 'finished', status, ledger } | { kind: 'halted', error, ledger }
```

The hold is a `Sealed<_, _, 'spend'>` minted by the adapter that reserves
and spent by the adapter that ships or releases; the domain carries it and
cannot mint, read or spend it. `examples/fulfil/` is the whole of this,
with its boundary, its adapters, its tests, its gates and its mutations.

## Vendoring

Relative imports carry `.js`, so the library resolves under `NodeNext` (the
loader Node runs) and under `Bundler` alike; its own tsconfig checks it
under `NodeNext`. The tests use `node:test` and `node:assert` with no
framework, so they port to any runner by swapping the assertion calls.

The library's guarantees hold under `strict`, `exactOptionalPropertyTypes`
and `noUncheckedIndexedAccess`, on TypeScript 5.9 and 6.0. TypeScript
applies flags to a whole program, so a strict tsconfig over new code also
checks every module the new code imports, and an existing codebase that was
not written for those flags fails them in files the new code never touches.
The check that works without touching those files is staged: emit the
codebase's declarations, place the new sources over them, and run the
strict tsconfig there. The declarations carry the real signatures, so a
wrong call is still refused, and under `skipLibCheck` they are not
themselves re-checked. Three details decide whether it holds:

- Emit declarations for the new sources' import closure only (`files:` set
  to the new sources, `include: []`), not the whole codebase. Declaration
  emit requires a nameable type for every export, which `tsc --noEmit` does
  not, so emitting everything holds unrelated files (test helpers, say) to
  a rule only the imports need.
- Write the emit config beside the codebase's own tsconfig, so `types` and
  `@types/*` resolve as its build resolves them.
- List the program (`--listFilesOnly`) and fail if a source outside the new
  directories got in, or one inside them is missing; "exactly the new
  files" is a claim to check on every run.

Project references do not serve here when the imports run both ways at
cutover.

`tsconfig.json` is in the vendor set as the record of the flags; a host
whose staged config already carries them does not need a second one.

The lint tiers are keyed by path segment with no fixed root (`**/boundary/**`,
`**/effects/**`, `**/sealed.ts`, `**/total.ts`, `**/*.typetest.ts`), so they
apply from any working directory; a host prefixes them with its own
directory only to limit their reach. ESLint's flat config replaces a rule's
setting per config object; it does not merge. Where a host entry and a tier
match the same file and name the same rule (`no-restricted-syntax`,
`no-restricted-imports`, `no-restricted-globals`), the later entry's list
is the only one in force, so a host's own restrictions and the tier's
restrictions reach a file together only when one list is composed from
both. The config exports its pieces for that: `rules` (the groups), `syntax`
(`'error'` plus the import rule plus the named groups), `everything`,
`except`, and per tier `imports` / `boundaryImports` and `globals` /
`boundaryGlobals` / `effectsGlobals`.

```js
import fp, { syntax, everything, imports, globals } from './fp-shapes/eslint.config.js';
const mine = [{ selector: '…', message: '…' }];
export default [
  { ignores: ['fp-shapes/fixtures/**'] },
  ...fp,
  { files: ['lib/**/*.ts'], ignores: ['**/boundary/**', '**/effects/**', '**/*.typetest.ts'],
    rules: { 'no-restricted-syntax': [...syntax(...everything), ...mine], 'no-restricted-imports': imports, 'no-restricted-globals': globals } },
];
```

A host entry placed after the tiers replaces them in every directory it
matches, so it carves the tiered directories out (as above), comes before
them, or composes each tier's own list (`syntax(...except('conditionals',
'unknown', 'predicates'))` for `boundary/`). The host's lint ignores the
vendored `fixtures/`, which break one rule each on purpose; `node
fp-shapes/scripts/lint-fixtures.mjs fp-shapes/fixtures/rules eslint.config.js`
lints them through the host's config regardless of that ignore and fails
when a rule no longer fires there, which is the check that the composition
and the host's ESLint version kept every rule; `fixtures/rules/boundary`
and `fixtures/rules/effects` do the same for those tiers.

The acceptor takes the kernel's location and the domain's: `node
fp-shapes/scripts/accept.mjs --kernel fp-shapes/src --tsconfig
tsconfig.strict.json lib` walks every domain module under `lib/`, and
`node fp-shapes/scripts/accept.mjs --kernel fp-shapes/src --fixtures
fp-shapes/fixtures/accept` proves its rules still fire under the host's
TypeScript. A module is domain unless a segment of its path says
otherwise, so a host that keeps its own code under the same segments is
walked in full.

The mutation runner takes the library's own list from wherever the library
was vendored: `node fp-shapes/scripts/mutations.mjs
fp-shapes/src/gates.mutations.mjs --map src=fp-shapes/src --tsconfig
tsconfig.strict.json`, from the host's root. `--map from=to` rewrites that
prefix in every path the list names; `--tsconfig` names a config that
carries the flags. The scratch tree holds the directories a list's `copy`
names, that tsconfig, and a link to `node_modules`, nothing else: an
application's list names every directory its staged program reads,
declarations included, and the tsconfig stands alone.

## The contract, and what holds it

`SPEC.md` states what "accepted by fp-shapes" means as the rules a checker
enforces (exact facts preserved through every step, `fold` as the one
eliminator, domain functions with no effects and no recursion, receipts
spent exactly once in the type of the chain) and the contracts the kernel
keeps, and says what holds and what is open. `GUARANTEES.md` is the
map for review: each anti-pattern, the mechanism that refuses it, the
gate, mutation, fixture or test that shows the mechanism works, where zod
sits in the trusted base, and what is still open.

## Adopting in an existing codebase

An integration is measured by what it deletes. The shapes change nothing in
a codebase that keeps its decisions where they were and reaches them through
adapters; that is an island, and it adds code. The order that has worked:

1. Start at the module that owns the state machine, the writes that move a
   lifecycle. Its operations are a plane, its transitions a chain of
   steps, its receipts named in the declaration.
2. Parse every row that module reads with `boundary()`, ORM entities
   included. An entity type is a declaration, not evidence; what the
   database returns is `unknown`.
3. Gate every fact (`Assert<Total<F>>`, `Assert<Immutable<F>>`) and every map
   that mirrors a shared union (`KindsOf`), with a mutation per gate.
4. Make each owner's decision a `Decide` under an authority private to its
   module, and have the writer take the sealed verdict and nothing else.
5. Delete the function the seam replaced and the wrapper that translated to
   it in the same seam, not at the end.

A module of the repository is not a foreign surface. Foreign is
`node_modules`, the database driver, the queue: code described as it is
because it cannot change. A module of your own that decides is rewritten in
the shapes or deleted; wrapped, it keeps its decisions. A seam is done when
the touched modules pass the acceptor, their line count went down, and the
replaced symbol has no references left.

None of that holds by instruction; an instruction is satisfied by its
cheapest reading. It holds when the build is red until it is true. Three
settings make it so, with the tools already in the tree:

- The tiers and the acceptor cover the whole tree, not the new
  directories, and the existing violations are recorded once: `eslint
  --suppress-all` writes `eslint-suppressions.json`, which is committed.
  From then on a new violation anywhere fails the lint, and a fixed
  violation whose entry was not pruned (`eslint --prune-suppressions`)
  fails it too, so the file can only shrink and every shrink is in the
  diff. The acceptor has no suppressions: it is run over the directories
  that are done, and a directory is done when it passes.
- The modules a seam replaces go into `no-restricted-imports` when the seam
  starts, with the message naming the replacement. Every importer is red
  until it moves; the module is deleted when the rule has nothing left to
  refuse.
- The seam's gates are written first and red: the `Assert` lines on its
  facts, the `KindsOf` pin, the mutation list. The task is to make them
  green, and a red gate cannot be satisfied by a wrapper.

An island, a correct domain module that nothing drives, is refused by the
acceptor's reach rule: every domain binding must be reached, by some path
of references, from a module in `effects/` or `boundary/`. A test reaching
it does not count, since a test is how an island looks alive. What that
rule cannot see is whether the shell's own entry is called by the host's
program, which is outside the tree; a test per entry point that drives
the chain through a fake of the foreign modules is the hold for that.

## The library

| Shape | File | Pins | Stands in for |
|---|---|---|---|
| `Variant<M>` | `src/variant.ts` | which case, from a map; each case carries its own fields only | hand-written discriminated unions; `XOR`-style exclusive unions |
| `Cases<M, R>` + `fold` | `src/variant.ts` | exhaustive handling; the only eliminator | `if`, `switch`, `?:`; handler maps keyed by a union |
| `Classify<A, M>` | `src/variant.ts` | the signature of a decision | `(a: A) => boolean` |
| `KindsOf<U>` | `src/variant.ts` | the cases a foreign union names; `Assert<Equal<keyof M, KindsOf<U>>>` pins a domain map to it in both directions | one-way assignability gates |
| `NonEmpty<T>` + `mapNonEmpty` | `src/variant.ts` | evidence as a value | `array[0]` + `if (!head)` |
| `Partition<M>` + `partition` | `src/variant.ts` | one classification, every case kept, every bucket named; linear in the input | `filter`, `find`, `some`, `every` |
| `Occupancy<T>` + `occupancy` | `src/boundary/evidence.ts` | the one look at `.length`; elements are defined values, by the signature | `if (xs.length === 0)` downstream |
| `Operations`, `Step<Ops, S, O>`, `commands` | `src/command.ts` | a plane's declaration; a step that owes what the chain has been issued and not spent, invariant in it; `done` and `suspend` | effect handlers passed as functions; receipts tracked by discipline |
| `Effects<Ops>`, `Entry<Ops>`, `Run<Ops, S>`, `drive` | `src/command.ts` | the interpreter: one performer per operation, the ledger, a run finished or halted | an orchestrator that performs and decides |
| `Ledger<T>` + `ledger` | `src/ledger.ts` | the one append-only builder; read as a frozen copy | a growing array copied per hop |
| `Sealed<Tag, T, Use>` + `Sealed.open` / `Sealed.spend` | `src/sealed.ts` | who sealed it, and whether it is held (`'open'`: read any number of times) or spent (`'spend'`: read once, by the reader that consumes it); the payload type is exactly what the owner sealed (invariant), the reads re-check the brand at runtime, `spend` halts on a second read, and the payload is frozen at seal time, all the way down | symbol-branded objects; a receipt or token used twice; a wider value sealed as a narrower type |
| `Decide<F, A, M>` | `src/sealed.ts` | an owner's decision: facts in, sealed verdict out | decision functions returning plain objects |
| `compare` + `Comparison` | `src/boundary/compare.ts` | the one structural comparison: two facts are the same when every leaf is, by `Object.is`; a difference carries the path to the first leaf that differs; sealed values compare by identity | `===` on records, which is identity; `JSON.stringify(a) === JSON.stringify(b)` |
| `Total<T>` | `src/total.ts` | completeness: no `?:`, `undefined`, `unknown`, `any`, `never`, function, index signature, `Date`, or open object (`{}`, `object`); exclusion keys (`k?: never`) are not holes; a type that contains its own kind answers `Recursive<T>`, naming the property; a sealed value is read through to its payload, so sealing a shape does not hide it | trusting `z.output` to be complete |
| `Immutable<T>` | `src/total.ts` | every property readonly, every array a `ReadonlyArray`, all the way down; recursion answers `Recursive<T>` | mutable schema outputs |
| `Exact<A, B>` | `src/total.ts` | correspondence: both total, same keys, mutually assignable | a key-set comparison at one level |
| `Boundary<F>`, `Parse<F>`, `boundary`, `sealing`, `TotalSchema`, `Fact` | `src/boundary/boundary.ts` | the only shape that accepts `unknown`; a boundary's fact is the schema's output and nothing else, checked total and readonly at the definition and frozen by the kernel at runtime; `sealing` composes an owner's seal whose payload is exactly a fact | ad-hoc parsing; `JSON.parse as T`; per-schema assertions; `z.custom` |
| `Outcome<T>`, `Tried<T>`, `attempt` | `src/effects/attempt.ts` | the one `try`; a thrown value becomes a case at the effect boundary. `attempt` is imported from this file by effects modules; the index carries the types | `try` in the domain; `void` effects |
| `Assert`, `Equal` | `src/total.ts` | compile-time assertions | — |

Common utilities the library does without, and why. `StrictOmit` and
`RequireAtLeastOne` constrain shapes without saying who may produce them. A
`Brand<T, Name>` intersection is right for primitives and is what zod's
`.brand()` produces at the boundary; on objects, a branded or symbol-keyed
property survives spread and `Object.assign` and so proves nothing about
origin, which is why object provenance is `Sealed`. A hand-declared model
beside a schema has no job once `boundary` checks the schema's output at the
definition; `Exact` stays for a repo that keeps one.

## zod, and where it lives

A `boundary/` directory is the only place that imports it. Three features
carry the design: `.brand()` for identifiers (a static brand only; zod
says so, and provenance at runtime is `Sealed`), `.default()` /
`.nullable()` to decide every absence once (Zod 4: `.default()` returns its
value unparsed when the key is absent, so write defaults in output form;
`.prefault()` parses them), and `.readonly()`, which types the output
readonly; the kernel freezes the fact at runtime whatever the schema did.
`z.object` drops undeclared string keys and `z.strictObject` refuses them
as a rejection with an issue; neither copies a symbol key; use
`strictObject` on external sources so drift is a fact, and for persisted
rows choose deliberately whether retired fields are drift or history.
`z.discriminatedUnion` parses a tagged outcome straight into a `Variant`.
The schema is a description: `z.custom` declares a type and parses
nothing, and `.transform` computes a value no schema describes, so lint
refuses both; a derived field is computed in the domain from the parsed
fact, and `.preprocess` normalizes an input that the schema then parses.
A `.default` or `.catch` is a literal, which the compiler checks for
excess keys where a binding might carry them.

## Enforcement

Five kinds of check, because the guarantees are of different kinds.

- **Compile** (`src/gates.typetest.ts`): `@ts-expect-error` lines are the
  inverse of a test. Every binding is exported, so the only error a line can
  produce is the one its guarantee describes; each line can fail in exactly
  one way; the assertion utilities are gated like everything else. The
  linearity gates hold a chain that drops, double-spends, spends early,
  forgets across an operation, issues a second receipt of a name still
  owed, or relabels what it owes.
- **Lint** (`eslint.config.js`, `fixtures/rules/**/*.ts`): the rules the
  type system describes but the language keeps available, one fixture per
  rule, each declaring the message lint gives for it, in a directory per
  tier so each tier's permissions are verified as well as its refusals.
  `scripts/rule-coverage.mjs` then tags every rule's message and lints the
  fixtures once: a rule is proved by a fixture that no other rule
  satisfies, and a rule no fixture needs fails the check. Every message
  states what the code here is or what the construct needs ("a branch is a
  Variant: classify at the boundary, fold here"), and the type-level check
  on `boundary` reports as `Needs<"a total output: …">`.
- **The acceptor** (`scripts/accept.mjs`, `fixtures/accept/*.ts`): lint
  reads syntax; the acceptor reads types. It builds the program with
  `tsc`'s API and walks every domain module admitting a grammar (§11 of
  `SPEC.md`); a form it does not name is refused. Seven rules, each named in
  its refusal: *grammar*; *exactness*, where a value meets a declared
  type its keys are exactly the declared keys, case by case through a
  union and element by element through an array, which tsc checks for
  fresh literals only; *purity*, every callee is the kernel's, the
  domain's or a fact's method, never a parameter, a function read from a
  record, a global, a package, a boundary or effects module, a `Promise`,
  `void` or `never`, and every parameter is a fact all the way down;
  *decision*, no call returns a boolean; *termination*, no binding reaches
  itself; *reach*, every binding is reached from the shell, so an island
  is refused; *closed*, nothing `any`, `unknown`, generic or under a
  directive. Every fixture is a program tsc compiles and the acceptor
  refuses with the expected sentence and no other rule (or accepts, for
  `clean`), so each fixture is evidence for one rule, and the run fails
  unless every rule has one.
- **Runtime** (`test/*.test.ts`): what the compiler leaves to the running
  program. `Object.assign({}, sealed)` and `structuredClone(sealed)` compile
  as sealed; `Sealed.open` and `Sealed.spend` reject them, and `spend`
  refuses the second read of evidence sealed for one, whatever route the
  value took to arrive twice (the spent set is the library's one piece of
  runtime state, a `WeakSet` written once per value). The interpreter's
  run, ledger and halt are tested the same way. Two patterns the example
  uses: a record keyed by a union's kinds holding one sample of every
  case, which fails to compile until a new case has a sample, so a fold
  can be checked over all of them; and a fake of the foreign modules that
  models the one piece of state the guarantees turn on, so an end-to-end
  path runs without a database.
- **Mutation** (`scripts/mutations.mjs`, lists in `src/gates.mutations.mjs`
  and beside the example's gates): each loosening is applied alone to a
  copy of the tree and required to fail `tsc` at a line in a gates file
  that guards it, so a gate that holds while its guarantee is gone shows
  up. An application keeps its own list beside its own gates and passes it
  to the same runner; the example's list loosens its domain (a hold
  dropped, released twice, shipped before it was reserved) and names
  `fulfil.ts` as a file where the error may land.

The tiers, by path segment. The domain is data, folds, steps and
owner-issued values, and performs no effect: an effect is an operation
the domain names in a step, and its outcome arrives as the answer the arm
folds. Nothing of an `effects/` module is imported by value (a type may
be), and neither are the effects the language offers without an import
(`fetch`, `process`, `console`, timers, `Date`, `Math.random`, `crypto`,
`JSON.parse`, dynamic `import`, the global object). A fact is a closed
record, read by name, not by `['key']`, and built by naming every key: an
object spread or rest pattern is refused, since a fresh literal is checked
for excess keys and a spread member is not. Array spread stays; the
mutating array methods are refused, and so are `call`, `apply`, `bind`
and any `prototype`. A comparison (`===`, `<`, `!`) is a decision and
`filter`, `find`, `some`, `every` classify by a predicate, so the domain
has neither; sameness is `compare`, and a classification is a
`partition`. `boundary/` decides: conditionals, `unknown`, zod and time
conversion live there, and it performs no effect either. `effects/`
perform: try, throw, branch, read the clock and the environment, and name
`unknown` for what came back; a foreign surface (`effects/**/foreign.ts`)
describes other code as it is, predicates and optional methods included.
`src/sealed.ts` holds the one class, the one brand check, and the one
halt; `src/command.ts` the step type, its two constructors and the
interpreter; `src/ledger.ts` the one append-only builder; `src/total.ts`
names the holes it tests for; `src/variant.ts` holds the combinators and
the one builder. Typetests hold the compiler directives, each with a
description of the gate it pins.

Not verified here but recommended on top: typescript-eslint
`recommendedTypeChecked` (the `no-unsafe-*` rules that track `any` out of
`JSON.parse` and ORM entities in the shell, where the acceptor does not
look), `eslint-plugin-functional`, and `eslint-plugin-eslint-comments` so
an `eslint-disable` comment is itself subject to a rule.

`npm run check` runs all five on TypeScript 5.9.3, zod 4.6, ESLint 9, Node
22: strict `tsc` (plus `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`, `noUnusedLocals`) over the library, the example
and the tests; lint; 150 rule fixtures (113 for the domain and primitives
tiers, 23 for the boundary tier, 14 for the effects and foreign tiers),
every one of the 97 rules proved by one; the acceptor over the example and
its 74 fixtures, every one of its 6 rules proved; no `.d.ts` under `src`;
32 mutations (27 against the library's gates, 5 against the example's);
44 runtime tests.

## The example

Not part of the library; it has its own gates, mutations and tests.

**`examples/fulfil/`**: an order is reserved, charged and shipped, or
backordered, declined, or died along the way. `plane.ts` declares the
facts, the outcomes and the four operations (`reserve` issues a hold;
`ship` and `release` spend it). `fulfil.ts` is the attempt: five
functions, every arm typed with what it owes, so the hold is spent on
every path and the compiler says where it is not. `boundary/order.ts`
parses an order. `effects/foreign.ts` describes the inventory, payment,
carrier and log as they are; `effects/adapt.ts` turns each foreign call
into the outcome the plane declares, mints the hold under an authority
private to that module and spends it; `effects/run.ts` drives the attempt
and logs the status. `report.ts` folds the status into a line, so a case
added to the status fails to compile until this file says what it means.
`fulfil.test.ts` runs every path through a fake of the foreign modules
and reads the ledger back; `gates.typetest.ts` pins the authority private,
a forged hold refused, a peeked hold refused, the facts total and
immutable; `gates.mutations.mjs` loosens the domain three ways and the
gates two, and each must be refused.

## When a check fails

A failing check is a statement about the model, and the model is what
changes. The moves below are the ones that keep the check meaning what it
says; the ones after them are the ones that make it stop.

- `Total` or `Immutable` answers `Recursive<T>`, naming a property. The type
  contains its own kind: a cause whose payload is a cause, a status that
  carries a status. That is two facts folded into one, and the property
  named is where they fold. Separate them. A retry budget is a fact about
  the queue, not a case of the failure it counted; a "last cause" that could
  itself be an exhaustion is a doll that nests forever. Genuinely recursive
  data (a tree, a document) is a structure of facts: assert the node type,
  and build the structure from asserted nodes.
- `Total` answers `false`. Some key is optional, undefined, unknown, open, or
  a function. Decide the absence at the boundary (`.default()`,
  `.nullable()`); replace the open record with named keys; move the function
  out of the fact.
- `boundary` reports `Needs<…>`. Its text is the change to make to the schema.
- A `fold` reports a missing key. A case was added and this consumer has not
  said what it means. Say it; the handler is the decision.
- An arm does not compile against `Step<…, { hold: true }>` (or `{}`).
  The arm owes a receipt and ends, spends one that was spent, or spends
  one not yet issued. The chain is wrong, not the type: spend the receipt
  on this path, or move the spend to the operation that should take it.
- A gate's `@ts-expect-error` is reported unused. The guarantee the line
  describes has weakened somewhere else; the fix is there, not on the line.
- The acceptor refuses with *exactness*: a value carries a key its type
  lacks (or lacks one). Build the fact with exactly its keys where it is
  made; the wider value is a different fact. With *purity*: the domain is
  calling something that is not the kernel, itself or a fact's method.
  Make it an operation of the plane and fold its outcome. With
  *decision*: a call returned a boolean. Classify at the boundary, or
  `partition`. With *termination*: a binding reaches itself. Map over
  the finite fact instead. With *closed*: a type the rules cannot decide.
  Declare it. With *grammar*: the refusal names the form and what the
  domain has instead.

The moves that are not available, because each one keeps the check green
while the property it checked is gone: asserting a derived subject
(`Total<Omit<T, 'k'>>` proves a different type, and the gate tier reports
it); unrolling a recursive type by hand; widening a type (making it less
precise so that more values pass) as opposed to extending a map (a new
case, which every fold must then handle); a directive outside a typetest;
an `as` anywhere but `as const`; a `declare` outside a typetest; moving a
module out of the domain's path segments so the acceptor does not walk it.

## What review holds

- An observation of a remote system and a fact about it are different types.
  An observation is a `Variant` with a case for every way a poll can end,
  including the ones that learn nothing (unreachable, timed out, pending), and
  only its `seen` case is sealed as a fact by the observer's authority. The
  shapes make this expressible; declaring the two types is a modeling choice.
- A decision about raw fields belongs to the boundary module for that fact,
  and a decision about facts belongs to its owner. Lint sees the directory;
  review sees which it is. One boundary module per fact, exporting parsers
  and openers, keeps the two apart.
- `Sealed.open` proves who sealed a value, not what it is about: put the
  subject (an order id, a row id) inside the sealed payload and have the
  owner's opener take the expected id. What the kernel does not hold is
  the effect behind the evidence: a load performed twice issues two
  receipts, and the idempotency key at the load effect is what makes the
  second a no-op. Which values are spent and which are held is the
  owner's declaration, and review sees whether it matches what the value
  is for.
- A receipt carried from one attempt's chain into another is refused at
  runtime, by identity, not statically.
- The reach rule says every domain binding is reached from the shell. It
  does not say the shell is reached from the host's program; a test per
  entry point holds that.
