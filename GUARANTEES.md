# Guarantees: what is refused, by what, and what proves it

A map for review, from each anti-pattern to the mechanism that refuses it
and the artifact that shows the mechanism works. `SPEC.md` states the
contract; this file says how much of it is held and by what kind of
evidence.

## Five kinds of evidence, and what "proof" means here

There is no mechanized proof in this package. There are five kinds of
machine-checked evidence, each with a check that fails when the evidence
stops holding:

- **Type-level facts.** `Total`, `Immutable`, `Exact`, `Equal`, the
  recursion walk, the nominal invariance of `Sealed`, and the owed index
  of `Step` are decision procedures written in TypeScript's type system.
  A gate in `src/gates.typetest.ts` is a proposition the compiler checks
  (`Assert<…>`) or a refutation it checks (`@ts-expect-error` with a
  description). Each gate is proved *necessary* by `scripts/mutations.mjs`:
  the guarantee is removed from a copy of the library and the gate must
  fail at its line. Twenty-seven loosenings against the library's gates,
  five against the example's; a gate that holds while its guarantee is
  gone fails the check.
- **Syntax refusals.** `eslint.config.js` refuses the constructs the type
  system leaves available, per tier. Every rule has a fixture in
  `fixtures/rules/**` that must trip it with the rule's own message, and
  `scripts/rule-coverage.mjs` credits a rule only with a fixture no other
  rule satisfies, so a rule without a fixture fails the check. Permissive
  tiers have `clean` fixtures proving what they permit.
- **The acceptor.** `scripts/accept.mjs` walks every domain module's
  syntax tree with tsc's checker: a whitelist grammar, exactness at every
  declared type, the origin of every callee, the return of every call,
  the reach graph. It fails closed. Every fixture under `fixtures/accept/`
  is a program tsc compiles and says what it expects; a fixture is
  evidence for exactly one rule (the expected refusal is there and no
  other rule refuses it), and the run fails unless each of the seven
  rules has one; `clean` fixtures prove what the grammar admits.
  Seventy-four fixtures.
- **Runtime laws.** `test/*.test.ts` pin what the compiler cannot see:
  laundering refused at `open`, the deep freeze through every own
  property, one read of spent evidence, the boundary's fresh exact object,
  the comparison's paths, the interpreter's ledger and halt.
- **Mutations against the example.** `examples/fulfil/gates.mutations.mjs`
  loosens the example's domain (a hold dropped on a dead charge, a hold
  released after it was shipped, a ship before anything was reserved) and
  the example's gates must refuse each.

The theorem in `SPEC.md` §7 is stated against these and is not proved.
Its clauses each have a mechanism in the tables below and an artifact
that fails when the mechanism is removed; what the build does not hold is
listed at the end of this file, and nothing in between claims more.

## Where zod sits

The domain never calls zod. Lint refuses a `zod` import outside `boundary/`
and a `parse…` import from a boundary module into the domain, and the
acceptor refuses any call into a boundary module or a package, so zod's
code runs only in the boundary tier, where imperative code is permitted,
and what reaches the domain is a value, not a call. The guarantees about
facts therefore do not depend on zod being functional, any more than they
depend on `sealed.ts` being functional: both are kernel, and the question
is only what crosses out of them.

What crosses out of `boundary(schema)` is the schema's output, and the
guarantees about it rest on four properties of zod that are **assumed,
narrowed, and tested**, not proved:

| Assumed of zod | Narrowed by | Tested by |
|---|---|---|
| `z.object` builds a fresh output holding exactly the declared keys; `z.strictObject` refuses an undeclared string key; neither copies a symbol key | lint refuses `.transform`, `.overwrite`, `z.codec` and `z.custom`, the forms that construct or pass through a value no schema describes, and a `.default`/`.catch` whose argument is a binding | "the fact is a fresh object holding the declared keys", "a strict schema refuses an undeclared string key" |
| the inferred output type `z.output<S>` describes the runtime output of a descriptive schema | `TotalSchema` refuses a schema whose output type is not total, readonly and finite, at the definition (`sparse`, `mutable` gates; two mutations) | the type-level gates, and "a preprocessed input is still parsed by its schema" |
| `.readonly()` freezes the level it is applied to | the kernel freezes the whole fact itself (`frozen`), so this is not relied on | "the kernel freezes the fact all the way down, whatever the schema froze" |
| `safeParse` returns a result for every input when the schema's own functions return | `.refine`/`.preprocess` bodies are boundary code: `throw` is refused there | a thrown defect inside a refinement propagates and halts, which is the kernel's policy for defects (`sealed.ts`'s `defect`), not a rejection |

Beyond that, zod's brands are static only (zod's own statement); provenance
at runtime is `Sealed`, which zod cannot replace. Nothing else of zod is
load-bearing.

## Anti-patterns refused

Tier abbreviations: D domain, B boundary, E effects, P primitives
(`sealed.ts`, `command.ts`, `ledger.ts`, `total.ts`, `variant.ts`), T
typetests. "Gate" names a line in `src/gates.typetest.ts`; "mutation"
names an entry in `src/gates.mutations.mjs`; "fixture" names a file under
`fixtures/rules/`; "accept" names a file under `fixtures/accept/`; "test"
names a `test()` in `test/`.

### Decisions

| Anti-pattern | Refused in | By | Evidence |
|---|---|---|---|
| a branch (`if`, `switch`, `?:`, `??`, `\|\|`, `&&`, `?.`) | D | lint; the acceptor's grammar | fixtures `if`, `switch`, `ternary`, `nullish`, `or`, `and`, `chain`; accept `grammar-if`, `grammar-switch`, `grammar-ternary`, `grammar-logical`, `grammar-optional` |
| a comparison as a decision (`===`, `<`, `in`, `instanceof`, `!`, `Boolean()`, …) | D | lint; the acceptor's grammar | fixtures `comparison`, `not`, `in-operator`, `boolean-call`; accept `grammar-comparison`, `grammar-not` |
| a boolean produced by a call (`some`, `includes`, `startsWith`, a predicate method of anything) | D | the acceptor's decision rule, on the call's type | accept `decision`, `decision-string` |
| an annotated boolean predicate | D, B, E | lint | fixtures `predicate`, `predicate-type` |
| classification by predicate (`filter`, `find`, `some`, `every`, …) | D | lint; the acceptor's fact-method allowlist | fixture `classify-by-method`; accept `fact-method` |
| a fold that omits a case | everywhere | type: `Cases<M, R>` requires every key | gate `partial`; mutation "let a fold omit a case" |
| a case carrying another case's field | everywhere | type: `OnlyOwn` | gate `posing`; mutation "let cases share fields" |
| a hand-written union of records | D, B, E | lint | fixture `sum-of-records` |
| a partition missing a bucket | everywhere | type | gate `halved`; mutation "let a partition omit a bucket" |
| equality of facts by `===` | D | the grammar has no comparison; `compare` is the one structural comparison | accept `grammar-comparison`; tests in `compare.test.ts` |

### Facts

| Anti-pattern | Refused in | By | Evidence |
|---|---|---|---|
| an optional key, `undefined`, `unknown`, `any`, `never`, a function, an index signature, a symbol key, `Date`, `{}`, `object` in a fact | everywhere | type: `Total` | gates `_t1`–`_t14`, `_k1`; mutations "drop the undefined check", "drop the {} check", "let a fact have a symbol key" |
| a mutable property or array in a fact | everywhere | type: `Immutable` | gates `_i1`–`_i5`; mutation "let Immutable accept mutable arrays" |
| a type that contains its own kind | everywhere | type: `Recursive<T>`, naming the property | gates `_r1`–`_r4`; mutation "let Total accept a recursive type" |
| sealing a shape to hide any of the above | everywhere | type: every assertion reads through `Sealed` | gates `_s1`–`_s4`; mutations "let a seal hide recursion / a hole / a mutable field" |
| `Exact` that ignores completeness | everywhere | type | gates `_e1`–`_e5`; mutation "make Exact ignore completeness" |
| a value with keys its type lacks, or lacking keys it declares, flowing through a binding, a return, an argument, an array element, a case of a Variant, a handler's return, a `satisfies` | D | the acceptor's exactness rule | accept `widening`, `widening-return`, `widening-argument`, `widening-element`, `widening-nested`, `widening-case`, `widening-handler`, `widening-satisfies` |
| keys the type does not declare entering by spread or rest | D, B, E | lint; the acceptor's grammar | fixtures `spread-object`, `rest-pattern`; accept `grammar-spread` |
| a computed key, an accessor, a method, `__proto__` in a literal | D, B | lint; the acceptor's grammar | fixtures `computed-key`, `accessor-get`, `literal-method`; accept `grammar-proto` |
| `let`, `var`, assignment, `++`, `delete`, `push`/`sort`/`splice`/… | D, B, E, P | lint; the acceptor's grammar | fixtures `let`, `var`, `reassign`, `update`, `delete`, `mutation`, `array-push`, `array-sort`; accept `grammar-let`, `grammar-mutation` |
| `Object.assign`/`create`/`defineProperty`, `structuredClone`, `Reflect`, cloner libraries, `call`/`apply`/`bind`, any `prototype` | D, B (+E for most) | lint; the acceptor refuses every global | fixtures `object-*`, `structured-clone`, `reflect`, `import-cloner`, `import-immer`, `call-apply`, `prototype`; accept `global-call` |
| a laundered copy of a sealed value compiling as sealed | runtime | `open`/`spend` re-check the brand | tests "Object.assign({}, sealed) … rejected at open", "structuredClone(sealed) … rejected at open" |
| a payload that is not frozen all the way down | runtime | the kernel's freeze | tests "a payload is frozen all the way down …", "the freeze reaches symbol-keyed and non-enumerable children …" |
| `as` (except `as const`), `!`, a compiler directive or `declare` outside a typetest, `any` | D, B, E, P | lint, plus a local rule for directives; the acceptor's grammar and closed rule | fixtures `as`, `as-angle`, `non-null`, `ts-expect-error`, `ts-ignore`, `ts-nocheck`, `declare-*`, `any`; accept `grammar-as`, `grammar-nonnull`, `directive`, `any-parameter`, `unknown-parameter`, `parameter-nested-any`, `generic` |
| a derived type as a gate's subject (`Omit`, `Pick`, …) | T | lint | fixture `gate-derived-subject.typetest` |
| `JSON.parse` into a typed binding | D, B, E | lint; the acceptor refuses every global | fixture `json-parse` |

### Provenance and linearity

| Anti-pattern | Refused in | By | Evidence |
|---|---|---|---|
| a sealed value forged by literal, by another authority, by a fresh symbol | everywhere | type: nominal private fields | gates `crossed`, `fresh`, `copied`, `peeked`, `misopened`; mutation "make #value public" |
| an authority minted from the symbol registry | D, B, E, P | lint | fixture `symbol-for` |
| a wider payload sealed as a narrower type | everywhere | type: `Sealed` invariant in its payload | gate `widened`; mutation "let a sealed payload widen" |
| spent evidence read as held, or held evidence spent | everywhere | type: the use is in the nominal type | gates `relabelled`, `misspent`, `reread`; mutations "let open read spent evidence", "let the use be relabelled" |
| spent evidence read twice, by any route | runtime | the spent set | tests "evidence sealed for one read is read once …", "a second holder of the same spent evidence is refused …" |
| an owner's seal returning an unsealed value or a non-fact payload | everywhere | type: `sealing`'s signature and `Fact<P>` | gates `unsealed`, `dated`; mutations "let sealing seal a non-fact", "let sealing accept an unsealed value" |
| a sealed value read in the domain (`Sealed.open`, `Sealed.spend`) | D | the acceptor's purity rule: a sealed value is read by its owner | accept `sealed-open` |
| a receipt issued and not spent before the chain ends | everywhere | type: an arm that owes a receipt cannot return `done` | gate `dropped`; mutation "let done owe anything"; example mutation "drop the hold on a dead charge" |
| a receipt spent twice | everywhere | type: the second spend finds nothing owed | gate `twice`; mutation "let an arm keep what the operation spent"; example mutation "release a hold that was shipped" |
| a receipt spent before it is issued | everywhere | type: `suspend` requires what the operation spends to be owed | gate `early`; mutation "let an operation run without the receipt it spends"; example mutation "ship before anything is reserved" |
| a receipt forgotten across an operation that does not spend it | everywhere | type: what is owed is carried through every arm | gate `carried`; mutation "let an answer issue nothing" |
| a receipt issued while one of its name is still owed (two holds at once, which the index would fold into one) | everywhere | type: `suspend` requires that nothing the operation could issue is already owed | gate `reissued`; mutation "let a receipt be issued while one of its name is owed" |
| a step owing something passed off as a step owing nothing, or the reverse | everywhere | type: `Step` is invariant in what it owes | gate `relabelled` (linearity); mutation "let a step be covariant in what it owes" |
| a receipt minted or read anywhere but its adapter | everywhere | type: the authority is a private symbol of the adapter module; the domain has no `new`, no `Symbol`, no authority | example gates `authority`, `forged`, `peeked`; example mutation "export the hold authority" |

### Effects

| Anti-pattern | Refused in | By | Evidence |
|---|---|---|---|
| an effect performed through a function parameter, or a function held in a parameter's type anywhere | D | the acceptor's purity rule: a parameter's type is a fact all the way down | accept `parameter-call`, `parameter-function-field`, `parameter-function-passed`, `parameter-accessor`, `parameter-method` |
| a function read from a record and called | D | the acceptor's purity rule | accept `record-function`, `record-function-bound` |
| a call into a global, a package, a boundary or effects module, including through a rebinding (`const D = Date`) | D | the acceptor's purity rule, on the callee's declaration | accept `global-call`, `global-rebound`, `random` |
| a call returning a `Promise`, nothing, or `never` | D | the acceptor's purity rule, on the call's type | accept `promise`, `void`, `never` |
| the ledger or the attempt reached from the domain | D | the acceptor: the shell's exports of the kernel | accept `shell-call`, `shell-method` |
| anything of an `effects/` module imported by value | D, B | lint; the acceptor | fixtures `import-effects*`, `export-effects`, `export-all-effects`, `import-dynamic`; accept `effects-import` |
| an ambient effect (`fetch`, `process`, `console`, timers, `performance`, `crypto`, `globalThis`, `require`, `eval`, `Function`, `Date`, `Date.now()`, `Math.random`) | D, B (`Date` D only) | lint; the acceptor refuses every global | fixtures `global-*`, `math-random`; boundary fixtures `date-now`, `date-new`; accept `global-call`, `random` |
| a partial operation (`JSON.stringify`, unseeded `reduce`, `with`, `repeat`, `at`) | D, B | lint; the acceptor's fact-method allowlist | fixtures `json-stringify`, `reduce-no-seed`; accept `fact-method` |
| a loop; a recursive function; a function that reaches itself through a reference | D (loops also B, E) | lint; the acceptor's grammar and termination rule | fixtures `loop-*`; accept `grammar-loop`, `self`, `cycle`, `cycle-reference`, `cycle-shorthand` |
| an island: a domain binding nothing in `effects/` or `boundary/` reaches, by any path | D | the acceptor's reach rule, on the same graph termination walks | accept `island`; the fixtures' own shell (`fixtures/accept/effects/shell.ts`) is what reaches the rest |
| `try`, `throw` | D, B | lint; the acceptor's grammar; `attempt` is the one `try`, in effects | fixtures `try`, `throw`; accept `grammar-try`, `grammar-throw`; test "attempt turns a rejection into a fact …" |
| `new`, `await`, `async`, a generator, `typeof`, an expression statement, a body without a return, a default or optional parameter | D | the acceptor's grammar | accept `grammar-new`, `grammar-await`, `grammar-async`, `grammar-typeof`, `grammar-mutation`, `grammar-no-return`, `parameter-default`, `parameter-optional` |
| a class | D, B, E | lint; the acceptor's grammar | fixtures `class`, `class-expression`; accept `grammar-class` |
| a value re-export, a default export | D | the acceptor's grammar | accept `grammar-reexport`, `grammar-default` |
| zod outside the boundary; a parser imported into the domain | D, E | lint; the acceptor refuses the call | fixtures `import-zod`, `import-parser` |
| an operation answered with another operation's outcome | everywhere | type: each arm takes its own case's answer | `Arms<…>` is keyed by the operation's outcome; test "a run performs each operation …" |
| a performer that throws | runtime | the interpreter halts with the error and the ledger so far | tests "a performer that throws halts the run …", "a performer that throws a non-error halts with it wrapped" |
| a case added to a status that a report does not say the meaning of | everywhere | type: the folds are total | the example's `report.ts` |

### Boundary

| Anti-pattern | Refused in | By | Evidence |
|---|---|---|---|
| a schema whose output is sparse, mutable or recursive | everywhere | type: `TotalSchema` reports `Needs<…>` at the definition | gates `sparse`, `mutable`; mutations "drop the readonly / total requirement from boundary" |
| a schema that constructs or passes through a value no schema describes (`z.custom`, `.transform`, `.overwrite`, `z.codec`) | B | lint | boundary fixtures `z-custom`, `import-custom`, `transform` |
| a `.default`/`.catch` that is a binding rather than a literal | B | lint | boundary fixture `default-binding` |
| a boundary output that is not a fresh, exact, frozen object | runtime | the kernel | tests under "Where zod sits" above |
| evidence of non-emptiness built from `undefined` | everywhere | type: `occupancy`'s signature | gate `nothing`; mutation "let occupancy accept undefined" |

### Meta

| Anti-pattern | Refused by | Evidence |
|---|---|---|
| a lint rule no fixture needs | `scripts/rule-coverage.mjs` fails the check | 97/97 proved |
| an acceptor rule no fixture needs, a fixture that does not compile, or a fixture two rules refuse | the fixture run fails | 74/74 agree, 7/7 rules proved |
| a gate that holds while its guarantee is gone | `scripts/mutations.mjs` fails the check | 32/32 loosenings caught |
| an ambient declaration under `src` | `check:dts` | — |
| a lint tier that matches nothing from a host's directory | tiers keyed by path segment with no fixed root | host composition in the README |

## Open: said by the contract, not held by the build

- **A receipt carried into another attempt's chain.** Statically each
  chain's index balances; that a receipt spent in one chain was issued in
  that chain is the spent set's at runtime, by identity.
- **A shell that is never called.** The reach rule refuses a domain
  binding nothing in `effects/` or `boundary/` reaches; whether the host's
  program calls the shell is outside the tree, and a test per entry point
  is the hold for that.
- **`Object.keys` is `string[]`**: a key read through it is not a fact's
  key until the boundary says so (the domain cannot call it; the boundary
  can).
- **The subject of a sealed value.** `Sealed.open` proves who sealed a
  value, not what it is about: put the subject (an order id, a row id)
  inside the payload and have the owner's opener take the expected id.
  The shapes make this expressible; declaring it is a modeling choice.

The distinction review should hold onto: everything in the tables
above fails a build today and has an artifact that fails when the
mechanism is removed; everything in this last list is a sentence, and
nothing more.
