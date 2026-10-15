# fp-shapes

Shapes for an enforcement-grade functional TypeScript domain: decisions are
data, made once at the boundary; every consumer folds; only an owner can
pronounce a verdict; possession of a value proves how it was obtained; and
every gate has a test that fails the build when the gate opens.

The library is `src/`. Vendor that directory with `eslint.config.js`,
`scripts/`, `fixtures/` and `tsconfig.json`, import from `src/index.ts`, and
lay your code out by the same path segments (`boundary/`, `effects/`) so
the lint tiers apply to it unchanged. `eslint.examples.js` and everything
under `examples/` belong to this repository, not to the vendor set. `examples/` shows the shapes applied twice and is not
part of the library.

## Running

```
npm ci
npm run check        # tsc, lint, rule fixtures, no .d.ts, mutations, tests
```

Node 22, TypeScript 5.9, zod 4, ESLint 9, from the lockfile. The tests run
under `tsx`, which opens a Unix socket under `TMPDIR`; on a deep temp path
that exceeds the socket path limit, run with a short one (`TMPDIR=/tmp`).

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

The mutation runner takes the library's own list from wherever the library
was vendored: `node fp-shapes/scripts/mutations.mjs
fp-shapes/src/gates.mutations.mjs --map src=fp-shapes/src --tsconfig
tsconfig.strict.json`, from the host's root. `--map from=to` rewrites that
prefix in every path the list names; `--tsconfig` names a config that
carries the flags. The scratch tree holds the directories a list's `copy`
names, that tsconfig, and a link to `node_modules`, nothing else: an
application's list names every directory its staged program reads,
declarations included, and the tsconfig stands alone (one that `extends` a
file outside the copied directories names a file the scratch tree lacks).

## Adopting in an existing codebase

An integration is measured by what it deletes. The shapes change nothing in
a codebase that keeps its decisions where they were and reaches them through
adapters; that is an island, and it adds code. The order that has worked:

1. Start at the module that owns the state machine, the writes that move a
   lifecycle. Its transitions are a map, its states are sealed under its
   authority, and every write takes the sealed state as its fence.
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
the touched modules hold no `if`, `switch`, `throw`, null check, `as` or `!`
outside `boundary/` and `effects/`, their line count went down, and the
replaced symbol has no references left.

## The library

| Shape | File | Pins | Stands in for |
|---|---|---|---|
| `Variant<M>` | `src/variant.ts` | which case, from a map; each case carries its own fields only | hand-written discriminated unions; `XOR`-style exclusive unions |
| `Cases<M, R>` + `fold` | `src/variant.ts` | exhaustive handling; the only eliminator | `if`, `switch`, `?:`; handler maps keyed by a union |
| `Classify<A, M>` | `src/variant.ts` | the signature of a decision | `(a: A) => boolean` |
| `KindsOf<U>` | `src/variant.ts` | the cases a foreign union names; `Assert<Equal<keyof M, KindsOf<U>>>` pins a domain map to it in both directions | one-way assignability gates |
| `NonEmpty<T>` + `mapNonEmpty` | `src/variant.ts` | evidence as a value | `array[0]` + `if (!head)` |
| `Partition<M>` + `partition` | `src/variant.ts` | one classification, every case kept, every bucket named | `filter`, `find`, `some`, `every` |
| `Occupancy<T>` + `occupancy` | `src/boundary/evidence.ts` | the one look at `.length`; elements are defined values, by the signature | `if (xs.length === 0)` downstream |
| `Sealed<Tag, T, Use>` + `Sealed.open` / `Sealed.spend` | `src/sealed.ts` | who sealed it, and whether it is held (`'open'`: read any number of times) or spent (`'spend'`: read once, by the reader that consumes it); the reads re-check the brand at runtime, `spend` halts on a second read, and the payload is frozen at seal time, all the way down | symbol-branded objects; a receipt or token used twice |
| `Decide<F, A, M>` | `src/sealed.ts` | an owner's decision: facts in, sealed verdict out | decision functions returning plain objects |
| `compare` + `Comparison` | `src/boundary/compare.ts` | the one structural comparison: two facts are the same when every leaf is, by `Object.is`; a difference carries the path to the first leaf that differs; sealed values compare by identity | `===` on records, which is identity; `JSON.stringify(a) === JSON.stringify(b)` |
| `Total<T>` | `src/total.ts` | completeness: no `?:`, `undefined`, `unknown`, `any`, `never`, function, index signature, `Date`, or open object (`{}`, `object`); exclusion keys (`k?: never`) are not holes; a type that contains its own kind answers `Recursive<T>` and one that nests past four containers answers `Deep<T>`, each naming the property; a sealed value is read through to its payload, so sealing a shape does not hide it | trusting `z.output` to be complete |
| `Immutable<T>` | `src/total.ts` | every property readonly, every array a `ReadonlyArray`, all the way down; recursion answers `Recursive<T>`, depth `Deep<T>` | mutable schema outputs |
| `Exact<A, B>` | `src/total.ts` | correspondence: both total, same keys, mutually assignable | a key-set comparison at one level |
| `Boundary<F>`, `Parse<F>`, `boundary`, `TotalSchema` | `src/boundary/boundary.ts` | the only shape that accepts `unknown`; a boundary schema has a total, readonly output, checked at the definition | ad-hoc parsing; `JSON.parse as T`; per-schema assertions |
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
carry the design: `.brand()` for identifiers, `.default()` / `.nullable()`
to decide every absence once (Zod 4: `.default()` returns its value unparsed
when the key is absent, so write defaults in output form; `.prefault()`
parses them), and `.readonly()`, which both types the output readonly and
freezes it at runtime. `strictObject` on external sources turns schema drift
into a `rejected` fact with an issue; for persisted rows, choose
deliberately whether retired fields are drift or history.

## Enforcement

Four kinds of check, because the guarantees are of different kinds.

- **Compile** (`src/gates.typetest.ts`): `@ts-expect-error` lines are the
  inverse of a test. Every binding is exported, so the only error a line can
  produce is the one its guarantee describes; each line can fail in exactly
  one way; the assertion utilities are gated like everything else.
- **Lint** (`eslint.config.js`, `fixtures/rules/*.ts`): the rules the type
  system describes but the language keeps available, one fixture per rule,
  each declaring the message lint gives for it. Every message states what
  the code here is or what the construct needs ("a branch is a Variant:
  classify at the boundary, fold here"; "copy with spread; a Sealed value
  comes only from its owner"), and the type-level check on `boundary`
  reports as `Needs<"a total output: …">`.
- **Runtime** (`test/*.test.ts`): what the compiler leaves to the running
  program. `Object.assign({}, sealed)` and `structuredClone(sealed)` compile
  as sealed; `Sealed.open` and `Sealed.spend` reject them, and `spend`
  refuses the second read of evidence sealed for one, whatever route the
  value took to arrive twice (the spent set is the library's one piece of
  runtime state, a `WeakSet` written once per value). Two patterns the examples use: a
  record keyed by a union's kinds holding one sample of every case, which
  fails to compile until a new case has a sample, so a fold can be checked
  over all of them; and a fake of the foreign modules that models the one
  piece of state the guarantees turn on (a claim mints a fresh token and
  takes the row; a fenced write lands only under the holder's token), so an
  end-to-end path runs without a database and a replacement taking the
  claim can be staged.
- **Mutation** (`scripts/mutations.mjs`, lists in `src/gates.mutations.mjs`
  and beside each example's gates): each loosening is applied alone to a
  copy of the tree and required to fail `tsc` at a line in the gates file
  that guards it, so a gate that holds while its guarantee is gone shows up.
  An application keeps its own list beside its own gates and passes it to
  the same runner.

The tiers, by path segment. The domain is data, folds, and owner-issued
values, and performs no effect: an effect reaches it as a parameter or as
the fact it produced. What a domain module imports from an `effects/`
module is a reader of the evidence that module issues, named `open…` or `spend…`, so
the reading is pinned to the issuer; the performers are not importable, and
neither are the effects the language offers without an import (`fetch`,
`process`, `console`, timers, `Date`, `Math.random`, `crypto`, `JSON.parse`,
dynamic `import`, the global object). A fact is a closed record, read by
name, not by `['key']`. `boundary/` decides: conditionals, `unknown`, zod
and time conversion live there, and it performs no effect either. `effects/`
perform: try, throw, branch, read the clock and the environment, and name
`unknown` for what came back; a foreign surface (`effects/**/foreign.ts`)
describes other code as it is, predicates and optional methods included.
`src/sealed.ts` holds the one class, the one brand check, and the one halt;
`src/total.ts` names the holes it tests for. Typetests hold the compiler
directives, each with a description of the gate it pins.

Not verified here but recommended on top: typescript-eslint
`recommendedTypeChecked` (the `no-unsafe-*` rules that track `any` out of
`JSON.parse` and ORM entities), `eslint-plugin-functional`, and
`eslint-plugin-eslint-comments` so an `eslint-disable` comment is itself
subject to a rule.

`npm run check` runs all four on TypeScript 5.9.3, zod 4.6, ESLint 9, Node
22: strict `tsc` (plus `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`, `noUnusedLocals`) over the library, the examples
and the tests; lint; 107 rule fixtures (86 for the domain tier, 11 for the
boundary tier, 8 for the effects tier, 2 for the ETL example); no `.d.ts`
under `src`; 28 mutations (19 against the library's gates, 9 against the
examples'); 56 runtime tests.

## Examples

Not part of the library; each has its own gates and tests.

**`examples/etl/`**: a two-stage pipeline. A sealed fact and a sealed
decision (`boundary/file-status.ts`, `retry.ts`); extraction that keeps
every rejection and stages the rest only if there are any
(`boundary/extract.ts`); stages that carry their batch and advance only in
the order of a transition table (`pipeline.ts`, `steps/transform.ts`); an
effect that returns a sealed receipt rather than `void` (`effects/load.ts`);
a writer that is private and takes nothing but that receipt, for that batch
(`ledger.ts`).

```
unknown ──boundary──▶ FileStatus (Sealed fact) ──retryOf──▶ RetryDecision (Sealed verdict) ──openRetry + fold──▶ effect
unknown[] ──extract(batch)──▶ Staged<'extracted'> ──transform──▶ Staged<'transformed'> ──load──▶ LoadReceipt{batch} ──settle(batch)──▶ Ledger | refused
```

**`examples/ingest/`**: a queue worker that fetches a file, fences its
claim, finalizes and settles it, rewritten from code that decided
everything after erasing its evidence (a failure's type thrown away and
recovered with `instanceof` and a message match; a finalizer's cause
travelling through `ok: boolean` and a re-throw; a lost fence as a caught
class; the row's state as four early returns).

- `worker.ts` is the domain: one fold per effect outcome, no conditional,
  no `try`, no view inside a receipt. It is parametric in the lock and the
  three receipts (claim, fenced write, finalized file), so it threads them
  and cannot inspect or mint them; the order of the pipeline is in the
  signatures of `contract.ts` (`finalize` takes what only `fence` issues,
  `settle` what only `finalize` issues).
- `status.ts` splits the causes into the one the queue clears by running
  again and the ones a holder records; transience is a property of a case,
  decided where the case is produced, so no consumer asks a predicate.
- `boundary/target.ts` reads the stored row once: gone, settled, abandoned
  (the dead-man's switch is the parse that establishes a located row
  failing), foreign plane, or ready with branded `uri` and `destKey`.
- `effects/adapt.ts` turns each foreign call into an effect that settles to
  a case and mints the sealed receipts. The reflection lives here, once per
  foreign API: a guard class is the `revoked` case, a deadline class is the
  `deadline` case, the egress proxy's message is read from the fetch error
  only, a finalizer's `ok: false` carries its cause whole.
  `effects/foreign.ts` describes the foreign modules as they are;
  `effects/run.ts` is the entry point: real effects, one log line from a
  fold, the transfer cleared in `finally`.
- `worker.test.ts` runs every path with a scripted fake of the effects (16
  paths, no database, no rclone); `adapt.test.ts` hands the adapters a fake
  of the foreign modules that throws and returns the way the real ones do.

Making the cases explicit surfaced three behaviours of the original worth a
decision: a failed cause-record threw to the caller although the contract
said nothing throws; a lost fence at the final `settled` write was reported
as a dead worker, so the queue retried a row a replacement owned; and the
egress-refusal match ran on every error message, including a database
error's. The rewrite returns `worker_died`, `claim_revoked`, and reads the
match from the fetch error only, and the tests pin each.

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
- `Total` or `Immutable` answers `Deep<T>`, naming a property. The type
  nests through more than four containers on one path: a record inside a
  collection element inside a sub-record inside a record is the most a fact
  carries, and the fifth level is another entity's structure embedded where
  its identifier belongs, or a decision folded into the data it was made
  about. Give the inner shape its own name and its own gate, and hold a
  reference or the decided case here. The number is not a compiler limit;
  it is the model's. Sealing the deep value does not answer it: every
  assertion reads a sealed value through to its payload, and the envelope
  is not a container.
- `Total` answers `false`. Some key is optional, undefined, unknown, open, or
  a function. Decide the absence at the boundary (`.default()`,
  `.nullable()`); replace the open record with named keys; move the function
  out of the fact.
- `boundary` reports `Needs<…>`. Its text is the change to make to the schema.
- A `fold` reports a missing key. A case was added and this consumer has not
  said what it means. Say it; the handler is the decision.
- A gate's `@ts-expect-error` is reported unused. The guarantee the line
  describes has weakened somewhere else; the fix is there, not on the line.

The moves that are not available, because each one keeps the check green
while the property it checked is gone: asserting a derived subject
(`Total<Omit<T, 'k'>>` proves a different type, and the gate tier reports
it); bounding or unrolling a recursive type by hand; widening a type (making
it less precise so that more values pass) as opposed to extending a map (a
new case, which every fold must then handle); a directive outside a
typetest; an `as` anywhere but `as const`; a `declare` outside a typetest.

## What runtime and review hold

- An observation of a remote system and a fact about it are different types.
  An observation is a `Variant` with a case for every way a poll can end,
  including the ones that learn nothing (unreachable, timed out, pending), and
  only its `seen` case is sealed as a fact by the observer's authority. The
  shapes make this expressible; declaring the two types is a modeling choice.
- A `Variant` case excludes the fields of every other case; a field that
  belongs to no case is checked on fresh literals (including every handler's
  return) and passes structurally on a stored value, as in any structural
  type system.
- A decision about raw fields belongs to the boundary module for that fact,
  and a decision about facts belongs to its owner. Lint sees the directory;
  review sees which it is. One boundary module per fact, exporting parsers
  and openers, keeps the two apart.
- `Sealed.open` proves who sealed a value, not what it is about: put the
  subject (batch id, row id) inside the sealed payload and have the owner's
  opener take the expected id. Single consumption of evidence is held at
  runtime by `'spend'`: the type keeps `open` off it and the spent set
  refuses a second `spend`, so a receipt settles once and a fence is
  finalized once. What it does not hold is the effect behind the evidence:
  a load performed twice issues two receipts, and the idempotency key at
  the load effect is what makes the second a no-op. Which values are spent
  and which are held is the owner's declaration, and review sees whether
  it matches what the value is for.
- Facts are compared with `compare`, never with `===`, which is identity on
  records. Lint cannot see the type of an operand, so a domain `===` on two
  records is review-held until the type-aware rule exists.
- Lint reads syntax. The rules on `Math.random`, `JSON.parse` and the
  `open…` names of evidence readers hold for the forms code takes when it is
  written directly; a global bound to another name (`const D = Date`) or a
  performer named `open…` or `spend…` is visible for what it is in review, and
  typescript-eslint's type-aware rules are the next hold (`recommendedTypeChecked`
  refuses the `any` that `JSON.parse` returns wherever it lands).
