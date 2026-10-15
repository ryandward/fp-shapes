# Guarantees: what is refused, by what, and what proves it

A reviewer's map from each anti-pattern to the mechanism that refuses it
and the artifact that shows the mechanism works. `SPEC.md` states the
contract; this file says how much of it is held today and by what kind of
evidence.

## Three kinds of evidence, and what "proof" means here

There is no mechanized proof in this package. There are four kinds of
machine-checked evidence, each with a check that fails when the evidence
stops holding:

- **The core's compiler.** Since 0.6 the domain core is Koka, and its
  exhaustive matches, effect rows and nominal constructors are theorems of
  the compiler, not rules maintained against the language. Each is proved
  *necessary* by `scripts/koka-mutations.mjs`: a loosening of the core in
  a copy of the tree must be refused by the check the list names (the
  compiler, the gate, the typecheck over the regenerated FFI, or the
  tests), and a loosening refused anywhere else, or nowhere, fails the
  check. Nineteen against the ingest core. The gate's own tokens each have
  a fixture under `fixtures/koka/`.

- **Type-level facts.** `Total`, `Immutable`, `Exact`, `Equal`, the
  recursion and depth walk, and the nominal invariance of `Sealed` are
  decision procedures written in TypeScript's type system: total functions
  from a type to `true`, `false`, `Recursive<T>` or `Deep<T>`. A gate in
  `src/gates.typetest.ts` is a proposition the compiler checks
  (`Assert<…>`) or a refutation it checks (`@ts-expect-error` with a
  description). Each gate is proved *necessary* by `scripts/mutations.mjs`:
  the guarantee is removed from a copy of the library and the gate must
  fail at its line. Twenty-three loosenings against the library's gates,
  nine against the examples'; a gate that holds while its guarantee is
  gone fails the check.
- **Syntax refusals.** `eslint.config.js` refuses the constructs the type
  system leaves available, per tier. Every rule has a fixture in
  `fixtures/rules/**` that must trip it with the rule's own message, and
  `scripts/rule-coverage.mjs` credits a rule only with a fixture no other
  rule satisfies, so a rule without a fixture fails the check. Permissive
  tiers have `clean` fixtures proving what they permit.
- **Runtime laws.** `test/*.test.ts` pin what the compiler cannot see:
  laundering refused at `open`, the deep freeze through every own
  property, one read of spent evidence, the boundary's fresh exact object,
  the comparison's paths.

The theorem in `SPEC.md` §6 is stated against these and is not proved.
For the core, its first three clauses are the compiler's. The fourth,
linearity, has a runtime half and a static half: the runtime half (no
receipt spent twice, every receipt issued and not spent named at every
terminal) is the registry's and the spent set's, tested and mutated; the
static half (a core refused when a path uses a receipt twice or ends with
one live) is the pass of SPEC §4, not yet written, and is listed as open
at the end of this file together with what the shell's tiers leave open.
Nothing in this file claims the ledger establishes the static half.

## Where zod sits

The domain never calls zod. Lint refuses a `zod` import outside `boundary/`
and a `parse…` import from a boundary module into the domain, so zod's
code runs only in the boundary tier, where imperative code is permitted,
and what reaches the domain is a value, not a call. The ADT guarantees
therefore do not depend on zod being functional, any more than they depend
on `sealed.ts` being functional: both are kernel, and the question is only
what crosses out of them.

What crosses out of `boundary(schema)` is the schema's output, and the
guarantees about it rest on four properties of zod that are **assumed,
narrowed, and tested**, not proved:

| Assumed of zod | Narrowed by | Tested by |
|---|---|---|
| `z.object` builds a fresh output holding exactly the declared keys; `z.strictObject` refuses an undeclared string key; neither copies a symbol key | lint refuses `.transform`, `.overwrite`, `z.codec` and `z.custom`, the forms that construct or pass through a value no schema describes, and a `.default`/`.catch` whose argument is a binding | "the fact is a fresh object holding the declared keys", "a strict schema refuses an undeclared string key" |
| the inferred output type `z.output<S>` describes the runtime output of a descriptive schema | `TotalSchema` refuses a schema whose output type is not total, readonly, finite and shallow, at the definition (`sparse`, `mutable`, `nested` gates; two mutations) | the type-level gates, and "a preprocessed input is still parsed by its schema" |
| `.readonly()` freezes the level it is applied to | the kernel freezes the whole fact itself (`frozen`), so this is not relied on | "the kernel freezes the fact all the way down, whatever the schema froze" |
| `safeParse` returns a result for every input when the schema's own functions return | `.refine`/`.preprocess` bodies are boundary code: `throw` is refused there; a call to a throwing function is the checker's effect rule, not yet enforced | a thrown defect inside a refinement propagates and halts, which is the kernel's policy for defects (`sealed.ts`'s `defect`), not a rejection |

Beyond that, zod's brands are static only (zod's own statement); provenance
at runtime is `Sealed`, which zod cannot replace. Nothing else of zod is
load-bearing.

The FFI the generator writes is a boundary module and uses zod the same
way: a schema per type that crosses into the core, descriptive forms only
(`z.discriminatedUnion`, `z.strictObject(...).readonly()`, `z.string()`,
`z.int()`, `z.boolean()`, `z.array(...).readonly()`), through `boundary`,
so the four properties above are what every crossing rests on and the
same lint tier holds the generated module to them.

## Anti-patterns refused today

Tier abbreviations: D domain, B boundary, E effects, P primitives
(`sealed.ts`, `total.ts`, `variant.ts`), T typetests. "Gate" names a line
in `src/gates.typetest.ts`; "mutation" names an entry in
`src/gates.mutations.mjs`; "fixture" names a file under `fixtures/rules/`;
"test" names a `test()` in `test/`.

### Decisions

| Anti-pattern | Refused in | By | Evidence |
|---|---|---|---|
| a branch (`if`, `switch`, `?:`, `??`, `\|\|`, `&&`, `?.`) | D | lint | fixtures `if`, `switch`, `ternary`, `nullish`, `or`, `and`, `chain` |
| a comparison as a decision (`===`, `<`, `in`, `instanceof`, `!`, `Boolean()`, `startsWith`, `includes`, `has`, `isNaN`, …) | D | lint | fixtures `comparison`, `not`, `in-operator`, `boolean-call`, `predicate-method` |
| an annotated boolean predicate | D, B, E | lint | fixtures `predicate`, `predicate-type` |
| classification by predicate (`filter`, `find`, `some`, `every`, …) | D | lint | fixture `classify-by-method` |
| a fold that omits a case | everywhere | type: `Cases<M, R>` requires every key | gate `partial`; mutation "let a fold omit a case" |
| a case carrying another case's field | everywhere | type: `OnlyOwn` | gate `posing`; mutation "let cases share fields" |
| a hand-written union of records | D, B, E | lint | fixture `sum-of-records` |
| a partition missing a bucket | everywhere | type | gate `halved`; mutation "let a partition omit a bucket" |
| equality of facts by `===` | D | lint (comparison); `compare` is the one structural comparison | tests in `compare.test.ts` |

### Facts

| Anti-pattern | Refused in | By | Evidence |
|---|---|---|---|
| an optional key, `undefined`, `unknown`, `any`, `never`, a function, an index signature, a symbol key, `Date`, `{}`, `object` in a fact | everywhere | type: `Total` | gates `_t1`–`_t14`, `_k1`; mutations "drop the undefined check", "drop the {} check", "let a fact have a symbol key" |
| a mutable property or array in a fact | everywhere | type: `Immutable` | gates `_i1`–`_i5`; mutation "let Immutable accept mutable arrays" |
| a type that contains its own kind | everywhere | type: `Recursive<T>`, naming the property | gates `_r1`–`_r4`; mutation "let Total accept a recursive type" |
| more than four containers on a path | everywhere | type: `Deep<T>`, naming the property | gates `_r5`–`_r11`; mutations "let a fact nest past four containers", "report depth as recursion" |
| sealing a shape to hide any of the above | everywhere | type: every assertion reads through `Sealed` | gates `_s1`–`_s4`; mutations "let a seal hide depth / a hole / a mutable field" |
| `Exact` that ignores completeness | everywhere | type | gates `_e1`–`_e5`; mutation "make Exact ignore completeness" |
| keys the type does not declare entering by spread or rest | D, B, E | lint | fixtures `spread-object`, `rest-pattern` |
| a computed key, an accessor, a method in a literal | D, B | lint | fixtures `computed-key`, `accessor-get`, `literal-method` |
| `let`, `var`, assignment, `++`, `delete`, `push`/`sort`/`splice`/… | D, B, E, P | lint | fixtures `let`, `var`, `reassign`, `update`, `delete`, `mutation`, `array-push`, `array-sort` |
| `Object.assign`/`create`/`defineProperty`, `structuredClone`, `Reflect`, cloner libraries, `call`/`apply`/`bind`, any `prototype` | D, B (+E for most) | lint | fixtures `object-*`, `structured-clone`, `reflect`, `import-cloner`, `import-immer`, `call-apply`, `prototype` |
| a laundered copy of a sealed value compiling as sealed | runtime | `open`/`spend` re-check the brand | tests "Object.assign({}, sealed) … rejected at open", "structuredClone(sealed) … rejected at open" |
| a payload that is not frozen all the way down | runtime | the kernel's freeze | tests "a payload is frozen all the way down …", "the freeze reaches symbol-keyed and non-enumerable children …" |
| `as` (except `as const`), `!`, a compiler directive or `declare` outside a typetest, `any` | D, B, E, P | lint, plus a local rule for directives | fixtures `as`, `as-angle`, `non-null`, `ts-expect-error`, `ts-ignore`, `ts-nocheck`, `declare-*`, `any` |
| a derived type as a gate's subject (`Omit`, `Pick`, …) | T | lint | fixture `gate-derived-subject.typetest` |
| `JSON.parse` into a typed binding | D, B, E | lint | fixture `json-parse` |

### Provenance and linearity

| Anti-pattern | Refused in | By | Evidence |
|---|---|---|---|
| a sealed value forged by literal, by another authority, by a fresh symbol | everywhere | type: nominal private fields | gates `crossed`, `fresh`, `copied`, `peeked`, `misopened`; mutation "make #value public" |
| an authority minted from the symbol registry | D, B, E, P | lint | fixture `symbol-for` |
| a wider payload sealed as a narrower type | everywhere | type: `Sealed` invariant in its payload | gate `widened`; mutation "let a sealed payload widen" |
| spent evidence read as held, or held evidence spent | everywhere | type: the use is in the nominal type | gates `relabelled`, `misspent`, `reread`; mutations "let open read spent evidence", "let the use be relabelled" |
| spent evidence read twice, by any route | runtime | the spent set | tests "evidence sealed for one read is read once …", "a second holder of the same spent evidence is refused …" |
| an owner's seal returning an unsealed value or a non-fact payload | everywhere | type: `sealing`'s signature and `Fact<P>` | gates `unsealed`, `dated`; mutations "let sealing seal a non-fact", "let sealing accept an unsealed value" |
| a receipt built, matched on or read inside the core | core | the compiler: `abstract struct` | koka mutations "mint a claim in the core", "read inside a receipt" |
| a receipt handed to an operation that did not issue it (settle with the fence receipt) | core | the compiler: nominal receipt types | koka mutation "settle with the fence receipt" |
| a receipt copied inside the core (`f(bytes = 0)`, the copy-with-update Koka derives for every constructor) | runtime | the FFI's registry: a receipt is read by identity from what the shell minted | koka mutation "hand on a copy of a receipt"; test "a registry reads back what was minted …" |
| a receipt spent twice by the core | runtime | the spent set, through `spendOnce` when the operation's step is read | koka mutation "spend a receipt twice"; test "spendOnce reads a value once …" |
| a receipt issued and dropped by the core (`Held(f) -> Succeeded(bytes)`) | runtime | the ownership audit: the registry names, per attempt, what was minted and never spent, at every terminal | koka mutation "drop a receipt"; tests "a registry answers, per owner, …", "the audit names a receipt …", and every path test's `outstanding: []` |
| a claim treated as spent, or a receipt as held | shell | the vocabulary: a claim is a held capability the core hands to any operation; a `-receipt` type is spent by the one that takes it | SPEC §4; `core/evidence.kk` |
| a step resumed twice from the shell | runtime | the spent set, through `spendOnce` on the resumption | test "a step is resumed once …" |
| a Koka value forged in the shell by literal | shell | type: every type in the generated `.d.ts` is branded | ingest gates `forgedClaim`, `forgedStatus`, `forgedStep`; mutations "let a Koka claim be a plain record", "let a Koka status be a tagged record" |

### Effects

| Anti-pattern | Refused in | By | Evidence |
|---|---|---|---|
| a match that misses a case; a print; a recursive call; a thrown value; a field a type lacks | core | the compiler: `exn`, `console`, `div` in the inferred row; nominal constructors | koka mutations "drop a case from a match", "print from the core", "recurse", "throw instead of returning a case", "build a status with a field it lacks" |
| `extern`, `unsafe-*`, `pretend-*`, `trace`, `var`, `ref`, a handler form, an `@`-name, a standard module outside the pure prelude | core | the gate, by token over the import closure | `fixtures/koka/*`; koka mutations "import the unsafe module", "assert a row with unsafe-total", "pretend a recursion decreases", "call foreign code", "answer an operation inside the core", "keep local state", "trace from the core" |
| an operation answered with another operation's outcome | shell | type: each suspension's resumption takes its own outcome | ingest gates `misanswered`, `misanswered2`; mutation "let a fence be answered with a claim outcome" |
| the compiled core imported by value anywhere but its generated FFI (raw constructors and resumptions, outside the parse, the registry and the spent set) | D, B, E, typetests | lint: `compiled` group; the FFI tier is the one exception; a type-only import is allowed | fixtures `import-build*`, `export-build`, `export-all-build`, `import-build-dynamic`, `import-dynamic-computed`; koka mutations "import the compiled core from shell-side domain code", "import the compiled bridge from an effects module" |
| a performer or the FFI throwing with receipts issued | runtime | the interpreter halts with the error, the ledger so far and the audit | tests "a performer that throws halts the run …", "a halt after a receipt was issued …" |
| an outcome handed to the core unparsed (a field of the wrong type, an undeclared key, a kind the operation lacks, a fraction or 2^53 as an int) | runtime | the FFI: every crossing parsed by its schema; a refusal halts, naming the field | tests in `examples/ingest/ffi.test.ts` |
| a value handed to the core and changed afterwards | runtime | the FFI: the core gets a frozen copy built from the parsed value | test "a value handed in is copied …" |
| a case added in the core that the shell does not say the meaning of | shell | type: the shell's folds are total | koka mutations "add a cause the foreign vocabulary lacks", "add a status the shell does not report" |
| `try`, `throw` | D, B | lint; `attempt` is the one `try`, in effects | fixtures `try`, `throw`; test "attempt turns a rejection into a fact …" |
| importing a performer from `effects/` (anything but an `open…`/`spend…` reader), default, namespace or dynamic import, value re-export | D, B | lint | fixtures `import-effects*`, `export-effects`, `export-all-effects`, `import-dynamic` |
| an ambient effect (`fetch`, `process`, `console`, timers, `performance`, `crypto`, `globalThis`, `require`, `eval`, `Function`, `Date`, `Date.now()`, `Math.random`) | D, B (`Date` D only) | lint | fixtures `global-*`, `math-random`; boundary fixtures `date-now`, `date-new` |
| a partial operation (`JSON.stringify`, unseeded `reduce`) | D, B | lint | fixtures `json-stringify`, `reduce-no-seed` |
| a loop | D, B, E | lint | fixtures `loop-*` |
| a class other than `Sealed` | D, B, E | lint | fixtures `class`, `class-expression` |
| zod outside the boundary; a parser imported into the domain | D, E | lint | fixtures `import-zod`, `import-parser` |

### Boundary

| Anti-pattern | Refused in | By | Evidence |
|---|---|---|---|
| a schema whose output is sparse, mutable, deep or recursive | everywhere | type: `TotalSchema` reports `Needs<…>` at the definition | gates `sparse`, `mutable`, `nested`; mutations "drop the readonly / total requirement from boundary" |
| a schema that constructs or passes through a value no schema describes (`z.custom`, `.transform`, `.overwrite`, `z.codec`) | B | lint | boundary fixtures `z-custom`, `import-custom`, `transform` |
| a `.default`/`.catch` that is a binding rather than a literal | B | lint | boundary fixture `default-binding` |
| a boundary output that is not a fresh, exact, frozen object | runtime | the kernel | tests under "Where zod sits" above |
| evidence of non-emptiness built from `undefined` | everywhere | type: `occupancy`'s signature | gate `nothing`; mutation "let occupancy accept undefined" |

### Meta

| Anti-pattern | Refused by | Evidence |
|---|---|---|
| a lint rule no fixture needs | `scripts/rule-coverage.mjs` fails the check | planted rule refused (97/97 proved) |
| a gate that holds while its guarantee is gone | `scripts/mutations.mjs` fails the check | 32/32 loosenings caught |
| an ambient declaration under `src` | `check:dts` | — |
| a lint tier that matches nothing from a host's directory | tiers keyed by path segment with no fixed root | host simulation in the README |

## Open: refused by the contract, not yet by the build

Each is recorded in `fixtures/open/` with the layer that closes it.

- **Widening through a binding** (`const narrow: Small = wide`, then any
  use at `Small`, including sealing it). TypeScript checks excess keys on
  fresh literals only. Closed by the checker's flow rule F1.
- **An effect performed through a function parameter**, in shell-side
  domain code. The domain's source is branch-free; its execution can be
  effectful. Closed in the core by the effect row; open in the shell.
- **A boolean produced by a reader in `effects/`** and imported. Closed by
  the checker's rule that no `boolean` is produced in the domain except by
  reading a fact's field.
- **Exactly-once consumption, statically.** At runtime `spend` and
  `spendOnce` hold at most once and the audit names every receipt issued
  and not spent at every terminal. That a core *cannot* use a receipt
  twice or end with one live is the pass over the compiler's initial core
  planned for 0.7 (SPEC §4); until then a dropping or double-spending
  core compiles and is caught on its first run. A token gate is not that
  checker.
- **Termination**, in shell-side domain code. Loops are refused; a
  recursive domain function is not. Closed in the core by the `div` row.
- **A global bound to another name** (`const D = Date`). Visible in
  review; refused by the effect rule once the checker exists.
- **`Object.keys` is `string[]`**: a key read through it is not a fact's
  key until the boundary says so.

The distinction a reviewer should hold onto: everything in the tables
above fails a build today and has an artifact that fails when the
mechanism is removed; everything in this last list is a sentence in the
contract and a program in `fixtures/open/`, and nothing more yet.
