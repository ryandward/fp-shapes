# Changelog

## 0.5.11

- `GUARANTEES.md`: the reviewer's map. The three kinds of evidence and
  what "proof" means here; where zod sits (four properties assumed,
  narrowed by lint, tested at runtime); every anti-pattern refused today
  with the tier, the mechanism and the artifact; and the list of what the
  contract refuses that the build does not yet.

## 0.5.10

K1 and K2 made true as implemented, not as described.

- The boundary's schema language is zod as a description. Lint refuses
  `.transform`, `.overwrite` and `z.codec`, which compute a value no schema
  describes and were a way to widen inside the schema (0.5.9 claimed every
  schema output was fresh and exact; a transform's was neither), and a
  `.default`/`.catch` whose argument is a binding rather than a literal.
  `.preprocess` stays: its result is parsed by the schema. A derived field
  is computed in the domain from the parsed fact.
- The kernel's freeze walks every own property through its descriptor:
  symbol-keyed and non-enumerable children are frozen, accessors are not
  read. `Object.values` had skipped both. Objects the kernel has frozen
  are remembered, so a value built from frozen parts is not walked again.
- A fact's keys are names: a symbol key is a hole in `Total`, and a
  computed key in a literal is refused in domain and boundary, so the type
  and the freeze describe the same properties.
- Totality is per overload: `reduce` without an initial value is refused
  in domain and boundary (it throws on an empty array); `JSON.stringify`
  is refused in the boundary as well as the domain.
- `partition` is linear: a Map builder appends each item to its bucket once
  and one record update sets the grown buckets; 200,000 items partition in
  about 50 ms. `variant.ts` holds the one builder.
- `Sealed`'s invariance witness is a function-typed private property
  filled by one shared identity, so it allocates nothing per instance; a
  private method would have been compared bivariantly and proved nothing.
- Gates and mutations for the symbol-key hole and the builder; runtime
  laws for the freeze (symbol, non-enumerable, accessor unread, remembered
  set), strict rejection, preprocess, and freezing through every level.
- `SPEC.md`: K1 and K2 restated as implemented; exclusion keys named in the
  flow rule; a section on the containers to come after the command
  algebra.

## 0.5.9

K1 established: a boundary's fact is the schema's output and nothing else.

- `boundary(schema)` no longer takes a `seal`. The one function of the
  caller's that stood between the parse and the fact could return a value
  with keys the declared fact type lacks, unfrozen, and TypeScript accepted
  it. The fact is now the schema's output: a fresh object with exactly the
  declared keys (`z.object` drops undeclared string keys, `z.strictObject`
  refuses them, neither copies a symbol key), frozen by the kernel all the
  way down whatever the schema's form, a `transform`'s output included.
- `sealing(parse, seal)` composes an owner's seal over a boundary; `seal`
  must return a sealed value whose payload is a fact (`Fact<P>`).
- `Sealed` is invariant in its payload: a sealed value of a wider payload
  is not a sealed value of the narrower type, so a value cannot widen by
  being sealed, and a payload is exactly what its owner constructed.
  Owners build payloads at their declared types (the ETL ledger's `loads`).
- Lint: `z.custom` and its import are refused (it declares a type and
  returns the input unparsed); the domain refuses `in`, `instanceof`,
  `Boolean(…)` and the yes-or-no methods of built-ins (`startsWith`,
  `includes`, `has`, `test`, `isNaN`, `isArray`, `hasOwn`, …), since an
  inferred boolean from one is a decision the predicate rule could not
  see; `JSON.stringify` is refused in the domain (it throws on a `bigint`,
  a fact leaf) and removed from the spec's allowlist, which now admits only
  operations total on fact inputs; accessors and methods in an object
  literal are refused in domain and boundary.
- Gates: a wider payload refused where a sealed type is declared; `sealing`
  refuses an unsealed return and a non-fact payload; three mutations.
  Tests: fresh object with declared keys only, strict rejection, frozen
  through a transform, sealed payload exact and frozen.
- `fixtures/open/inferred-boolean.ts`: the boolean the syntax tier cannot
  see, produced by a reader in `effects/`; the checker's rule is stated.

## 0.5.8

- `SPEC.md`: the contract. The checker's judgment (facts Γ, linear
  evidence Δ, effects E), exactness as a flow rule, `fold` as the one
  eliminator, effects as commands with the interpreter as the one
  performer, linear evidence as dataflow with the interpreter's ledger on
  the paths the static rule cannot see, the kernel's contract, and the
  intended theorem; each rule marked held today or not yet enforced.
- `boundary`: the `seal` callback's return is checked as a fact
  (`Fact<F>`: total and readonly, plain or sealed) at the definition; an
  unconstrained return was the one place a boundary could hand the domain
  something that was not one. Two gates and a mutation; the schema gates
  now pin the schema checks alone.

## 0.5.7

Two bypass programs closed; two recorded as open.

- Domain tier: a comparison operator or `!` is refused (a comparison is a
  decision; sameness is `compare`), and so are `filter`, `find`,
  `findIndex`, `findLast`, `findLastIndex`, `some` and `every` (a
  classification is a `partition`). An inferred-boolean predicate inside
  `filter` passed the predicate rule, which reads annotations.
- Domain and boundary tiers: `call`, `apply`, `bind` and any `prototype`
  access are refused; `Array.prototype.push.call(xs, 1)` reached the
  mutator with its name hidden from the method rule. Effects keep `call`
  for foreign methods bound to their receiver.
- `fixtures/open/`: the two programs no syntax tier can refuse, each with
  the layer that closes it (the type-aware tier; effects as commands).

## 0.5.6

Every rule is proved by a fixture, and the check says so.

- `scripts/rule-coverage.mjs`, run by `npm run check`: each rule's message
  is tagged and the fixtures are linted once; a rule is proved by a fixture
  whose expected message only that rule produces, and a rule no fixture
  needs fails the check. It found seven unproved rules: `ClassExpression`,
  the two re-export forms of the `.js` rule, and two pairs (`Reflect`,
  `structuredClone`) where a selector and a global each covered the other.
  The selectors are gone (the globals are stronger) and the primitives
  tiers now carry the launder globals; the rest have fixtures.
- Fixtures that prove each tier's permissions: `sealed.ts`, `total.ts`,
  `variant.ts`, `effects/foreign.ts` and a typetest, each `clean`.

## 0.5.5

A fact is built by naming every key.

- Lint: an object spread and an object rest pattern are refused in every
  tier but foreign. A fresh literal is checked for excess keys and a spread
  member is not, so a spread is the construction through which keys a type
  does not declare enter a fact, and the way an old shape travels under a
  new label. Array spread stays: an array has no keys, and `[...xs, y]`
  keeps a `NonEmpty` tuple's type where `concat` does not.
- Lint: the mutating array methods (`push`, `pop`, `shift`, `unshift`,
  `splice`, `sort`, `reverse`, `fill`, `copyWithin`) are refused in every
  tier but foreign; a fresh array is typed mutable, so the compiler allowed
  them.
- The messages that said "copy with spread" and "build the new value with
  spread" now say "naming every key"; the previous wording taught the move
  the rule refuses. The 0.5.3 rule on key order is subsumed.
- `**/variant.ts` is a primitives tier: the combinators hold the one
  generic record update (`partition`'s bucket under a type-parameter key).
- The ingest example's one spread names its fields.

## 0.5.4

- README: what forces an adoption. Tiers over the whole tree with ESLint's
  bulk suppressions as the ratchet, replaced modules under
  `no-restricted-imports`, and red gates written before the seam.

## 0.5.3

- Lint: a key written before a spread in the same object literal is refused
  in every tier but foreign; the spread overrides it. Spread first, then the
  keys the value sets. Spread remains the one copy: it cannot produce a
  sealed value (the `copied` gate), and a plain record is data.

## 0.5.2

- `Total`, `Immutable`, `Recursive` and `Deep` read a sealed value through
  to its payload. A sealed payload is total, readonly and shallow like any
  fact, and the envelope is not a container, so sealing a deep or sparse
  shape does not hide it from the assertions. Four gates and three
  mutations pin it.

## 0.5.1

- README: "Adopting in an existing codebase". An integration is measured by
  what it deletes; the order of seams; a module of the repository is not a
  foreign surface.

## 0.5.0

Evidence is held or spent, and facts compare structurally.

- `Sealed<Tag, T, Use>`: the owner declares at sealing time whether the
  value is held (`'open'`, read any number of times) or spent (`'spend'`,
  read once by the reader that consumes it). The declaration is the third
  constructor argument and is required, so every seal says what it is.
  `Sealed.open` takes held evidence and `Sealed.spend` takes spent evidence,
  by type; both re-check the brand; `spend` refuses the second read of the
  same value at runtime through a `WeakSet` of consumed values, the library's
  one piece of runtime state, so an alias through a collection, a closure or
  a record is caught where the type cannot see it. `Decide` returns held
  evidence.
- `compare(a, b)` in `src/boundary/compare.ts`: the one structural
  comparison, a decision (`same` or `differs { at }`) with the path to the
  first differing leaf. `===` on records is identity.
- Lint: a `spend…` export of an effects module is a reader, like `open…`.
- Examples: a load receipt, a fence receipt and a finalized receipt are
  spent; claims, stages, statuses and the ledger are held. A test settles a
  receipt twice and sees the defect.
- Gates for held/spent (a relabel, `open` on spent, `spend` on held) and
  two mutations (let `open` read spent evidence; erase the declaration).

## 0.4.9

- Lint: `Symbol.for` and `Symbol.keyFor` are refused in every tier but
  foreign. A `unique symbol` declared from the registry is an authority
  anyone can look up by its string; an authority is minted with `Symbol(…)`.

## 0.4.8

A fact is shallow.

- `Total` and `Immutable` refuse a type that nests through more than four
  containers (objects and arrays, along one path from the root to a leaf)
  with `Deep<T>`, naming the property the depth runs through. The previous
  bound of sixteen was set for the compiler's instantiation limit and
  admitted models no fact should have; four admits a record, its
  sub-records, a collection and the collection's element, which is the
  deepest shape in either example, and refuses one entity's structure
  embedded in another's.
- Recursion is detected as such: the walk answers `Recursive<T>` when a
  container is its own ancestor and `Deep<T>` when the bound is reached
  first, so the two refusals no longer share a message.
- `boundary` reports a recursive or deep schema output as `Needs<'a finite
  output: …'>` or `Needs<'a shallow output: …'>` rather than as an absence
  to decide.
- Gates for the bound (four passes, five is `Deep`, width is not depth, a
  five-deep schema is refused) and three mutations (drop the ancestor check,
  widen the bound, report depth as recursion).

## 0.4.7

The domain performs no effect, by lint rather than by layout.

- Domain and boundary tiers: an import from an `effects/` module is refused
  unless it is type-only or a reader named `open…`, and so are default and
  namespace imports from one, value re-exports of one, and dynamic
  `import()`. A performer reaches the domain as a parameter; a reader of an
  effect's evidence is pinned to the issuer that owns its authority.
- Domain and boundary tiers: the effects the language offers without an
  import are globals the tiers refuse (`fetch`, `XMLHttpRequest`,
  `WebSocket`, `process`, `console`, `setTimeout`, `setInterval`,
  `setImmediate`, `queueMicrotask`, `performance`, `crypto`, `globalThis`,
  `window`, `global`, `self`, `require`, `module`, `eval`, `Function`), as
  are `Date.now()`, `new Date()` and `Math.random`. The domain refuses
  `Date` altogether; time is a number or an ISO string there, and the
  boundary converts.
- `JSON.parse` joins the laundering group: its `any` lands in a typed
  binding with no assertion. Text is decoded in `effects/` under `attempt`.
- Domain tier: a key is read by name, not by `['key']`; a template-literal
  key is refused in every tier but foreign.
- `attempt` is no longer re-exported by `src/index.ts`; effects modules
  import it from `src/effects/attempt.ts` (also the package's
  `./effects/attempt` export), so the path rule covers it.
- Boundary tier: `boundaryImports` (cloners refused; zod and parsers
  allowed). Globals per tier: `globals` (domain), `boundaryGlobals`,
  `effectsGlobals`.
- `eslint.examples.js` composed its import rules over the library's instead
  of replacing them; a zod import in an ETL domain file passed before.
- Fixtures for the boundary tier (`fixtures/rules/boundary`) and the effects
  tier (`fixtures/rules/effects`), run by `lint:fixtures`; 105 in all.

## 0.4.6

Findings from vendoring the lint config and the mutation runner into a host
that has rules of its own.

- `eslint.config.js` exports its pieces (`rules`, `syntax`, `everything`,
  `except`, `imports`, `globals`). Flat config replaces a rule's setting
  per config object, so a tier placed over a host's own
  `no-restricted-syntax` or `no-restricted-imports` entry silently dropped
  the host's list; a host composes one list from both.
- `scripts/lint-fixtures.mjs` lints the files it is given regardless of the
  config's `ignores`, so the fixtures run through a host config that ignores
  the fixtures directory, as a host's lint must.
- `scripts/mutations.mjs --map from=to` rewrites a path prefix in every
  path a list names, so the library's own list runs against a vendored
  copy; the library's list copies `src` alone, which is what a host
  vendors.
- README: composing the lint lists, running the fixtures and the mutations
  from a host, and what the mutation runner's scratch tree holds.

## 0.4.5

Findings from the first vendoring into an application.

- Lint tiers are relocatable: every `.ts` file is domain unless a path
  segment says otherwise, and the primitives tiers match `**/sealed.ts` and
  `**/total.ts`. The previous `src/**` globs matched nothing when the config
  was run from another directory.
- `@typescript-eslint/no-unused-vars` in the base tier, with the usual `_`
  escape; the core gates' type-only authority is `_A`.
- `KindsOf<U>`: one gate pins a domain map to a foreign union in both
  directions. The ingest example gates it, and adds import gates for its
  three authorities; the forged-symbol gate alone did not pin that they stay
  private.
- Ingest example: `head` is called on its source; `Verdict.again` carries
  the transient cause rather than a string; the tests earn branded values
  through the real boundary instead of casting, hold a sample of every case,
  and fake the fence statefully.
- Verified on TypeScript 6.0.3 as well as 5.9.3 (compile and mutation gates).
- README: the three details that make the staged declaration check hold.

## 0.4.4

Example knowledge removed from the vendor set.

- `eslint.config.js` no longer knows the ETL example's pipeline (`begin`,
  `step`, a `steps/` tier); those rules live in `eslint.examples.js`, which
  this repository uses for `examples/` and a host does not copy. The two
  fixtures for them moved to `examples/etl/fixtures/rules/`.
- `scripts/mutations.mjs` takes mutation lists as arguments instead of
  holding them; the library's list is `src/gates.mutations.mjs`, each
  example's is beside its gates. The runner prints each list's name and
  count, so a list that is skipped shows.
- `scripts/lint-fixtures.mjs` takes a fixtures directory and a config.

## 0.4.3

- Lint: a union of record literals (`{ kind: 'a'; … } | { kind: 'b'; … }`)
  is a `Variant` over a map; the domain, boundary and effects tiers refuse
  the hand-written form. Foreign surfaces, which describe other code, keep
  it.
- Lint: a relative import without `.js` is refused in every tier, so the
  NodeNext finding cannot recur by hand.

## 0.4.2

Findings from vendoring into a `NodeNext` codebase.

- Relative imports carry `.js`; the library's tsconfig checks under
  `NodeNext`. Without the extension, `tsc` under `NodeNext` refused every
  relative import (TS2835) and the gates reported their directives unused.
- `@typescript-eslint/no-use-before-define` in the base tier; `boundary.ts`
  declared its helpers after the function that used them.
- README: "Vendoring", including how to check new code under the strict
  flags against a codebase that was not written for them (emit its
  declarations, check the new sources over them).

## 0.4.1

- Every file in the archive is mode 644. Thirteen files were 444, and
  `scripts/mutations.mjs` copies the tree with the modes it finds, so for a
  user other than root the harness failed with EACCES before proving
  anything. The harness now makes each file it edits writable in the copy,
  so a read-only checkout is still checkable.

## 0.4.0

Tightenings from a first adoption attempt, in which an adopter bounded a
completeness proof by hand to make it pass on a recursive cause type.

- `Total<T>` and `Immutable<T>` answer `Recursive<T>` for a type that
  contains its own kind, naming the property the recursion runs through, so
  `Assert` fails as "a fact is finite; this one contains its own kind
  through: 'last'". The bound is sixteen levels.
- `Sealed` freezes its payload all the way down, however the payload was
  built; sealing `{ status }` freezes `status` too.
- Gate tier: a derived subject in a gate (`Total<Omit<T, 'k'>>`, `Pick`,
  `Partial`, `Required`, `Exclude`, `Extract`, `NonNullable`) is a lint error.
- README: "When a check fails", what each failure says about the model and
  which moves are not available.
- Verified: 51 rule fixtures, 19 mutations, 43 tests.

## 0.3.0

- Library and examples separated. `src/` is the library alone and imports
  nothing outside itself; `examples/etl/` and `examples/ingest/` each carry
  their own gates and tests. Lint tiers key on path segments (`boundary/`,
  `effects/`, `steps/`, `effects/**/foreign.ts`) so they apply to any tree
  laid out the same way.
- Every lint message, type-level refusal, gate description and runtime
  defect states what the code here is or what the construct needs.
- The compiler directives outside a typetest are reported by a local rule;
  type assertions are a selector with the same voice.
- `scripts/mutations.mjs` shipped and run by `npm run check`; each mutation
  names the gates file it must trip.
- The ingest worker example added (`examples/ingest/`), with the foreign
  surface tier.
- `attempt.ts` exports `Tried<T>`, the case map behind `Outcome<T>`.
- The `FP_PROFILE` lint switch removed; the domain tier is unconditional.

Moved:

| From | To |
|---|---|
| `src/pipeline.ts` | `examples/etl/pipeline.ts` |
| `src/retry.ts` | `examples/etl/retry.ts` |
| `src/example/ledger.ts` | `examples/etl/ledger.ts` |
| `src/example/transform.ts` | `examples/etl/steps/transform.ts` |
| `src/example/load.ts` | `examples/etl/effects/load.ts` |
| `src/boundary/batch.ts`, `file-status.ts`, `rows.ts`, `extract.ts` | `examples/etl/boundary/` |
| `src/ingest/status.ts`, `worker.ts`, `report.ts` | `examples/ingest/` |
| `src/ingest/effects.ts` | `examples/ingest/contract.ts` |
| `src/boundary/ingest/target.ts`, `env.ts` | `examples/ingest/boundary/` |
| `src/effects/ingest/foreign.ts`, `adapt.ts`, `run.ts` | `examples/ingest/effects/` |
| `src/gates.typetest.ts` (ETL and ingest sections) | `examples/etl/gates.typetest.ts`, `examples/ingest/gates.typetest.ts` |
| `test/laundering.test.ts` | `test/sealed.test.ts` (library), `examples/etl/etl.test.ts` (pipeline) |
| `test/ingest.test.ts`, `test/ingest-adapt.test.ts` | `examples/ingest/worker.test.ts`, `examples/ingest/adapt.test.ts` |
| `fixtures/must-fail/*.ts` | `fixtures/rules/*.ts` |

## 0.2.0

- `Total` rejects `{}`, `object`, and open records; exclusion keys are not
  holes. `Exact` requires both sides total. `Immutable` added.
- `Variant` cases forbid every other case's fields.
- `Sealed` moves the payload behind `#value`; `Sealed.open` is the only read
  and re-checks the brand at runtime; the payload is frozen.
- `boundary` refuses a schema whose output is not total and readonly, at
  the definition (`TotalSchema`, reported as `Needs<…>`).
- `occupancy` refuses `undefined` elements at the signature.
- Receipts carry their subject (`BatchId`); the ledger refuses another
  batch's receipt as a named outcome.
- Lint fixtures: one file per rule, in `fixtures/must-fail/`, replacing the
  single `fixtures/must-fail.ts`.

## 0.1.0

First cut: `Variant`/`Cases`/`fold`, `Sealed` (public `value`), `Total`,
`Exact`, `Staged`/`Step`, `Boundary`, gates, laundering tests, one combined
lint fixture.
