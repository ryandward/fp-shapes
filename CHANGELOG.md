# Changelog

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
