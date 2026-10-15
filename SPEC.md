# The contract

What "accepted by fp-shapes" means: the rules a checker enforces and the
contracts a kernel keeps. Everything here is TypeScript. The checker is
`tsc` under the strict flags in `tsconfig.json`, the syntax tiers in
`eslint.config.js`, and the acceptor in `scripts/accept.mjs`, which walks
the domain's syntax trees with tsc's checker in hand. Where a rule is not
enforced, this document says so; nothing else is left to instruction.

An accepted program is a tree laid out by path segment, in which

1. every module compiles under the strict flags and passes its tier;
2. every domain module (not `boundary/`, not `effects/`, not `foreign.ts`,
   not a test or typetest) is accepted by the acceptor: written in the
   grammar of §11, exact at every declared type, calling nothing but the
   kernel, itself and a fact's methods, producing no boolean by a call,
   reaching nothing twice;
3. the gates compile and the mutations are refused.

The judgment this document is written against is

       Γ ; Δ ⊢ e : T ! E ; Δ′

read: under facts Γ and owed receipts Δ, expression `e` has type `T`, may
perform effects `E`, and leaves owed receipts Δ′. Γ and T are TypeScript's,
on the grammar the acceptor admits, with the acceptor's exactness rule on
top of assignability. E is empty for every domain expression: the domain
performs nothing, and names an operation by returning a step. Δ is in the
type of that step: what an attempt has been issued and has not yet spent.

## 1. Facts

A fact type `F` is total and immutable: no optional key, no `undefined`,
`unknown`, `any`, `never`, function, index signature, symbol key, `Date`
or open object; every property readonly, every array a `ReadonlyArray`;
no container that is its own ancestor. Depth is not bounded: nesting is
the model's business, recursion is not a fact. A fact's keys are names: a
symbol key is a hole, a computed key is refused in a literal, so what the
freeze walks and what the type describes are one set of properties. A
sealed value is read through to its payload. These are compile-time gates
(`Total`, `Immutable`, `Recursive` in `src/total.ts`) and hold.

A fact *value* of type `F` has exactly the keys `F` declares, at every
level. Values enter the domain from three places, and each is exact:

- **K1, a boundary parse.** `boundary(schema)` accepts a schema whose
  output is total and readonly (`TotalSchema`) and returns that output and
  nothing else. The schema language is zod as a description: objects,
  tuples, arrays, unions and discriminated unions, primitives, brands,
  coercions, `.default`/`.catch` with a literal, `.prefault`, `.refine`,
  `.preprocess` (its result is still parsed), `.pipe`. Lint refuses what
  computes a value no schema describes: `.transform`, `.overwrite`,
  `z.codec`, `z.custom`, and a `.default`/`.catch` whose argument is a
  binding. In that language every object output is built by zod with
  exactly the declared keys (`z.object` drops undeclared string keys,
  `z.strictObject` refuses them, neither copies a symbol key), and the
  kernel freezes the fact all the way down. What an owner makes of a
  parsed fact goes through `sealing(parse, seal)`, where `seal` returns a
  sealed value whose payload is a fact, and `Sealed` is invariant in its
  payload. Holds, with the runtime half tested.
- **C1, a fresh literal.** TypeScript checks a fresh object literal for
  excess keys. The check does not reach spread members, so an object
  spread or rest pattern is refused everywhere but `foreign.ts` (lint),
  and a spread into a record is outside the domain grammar. Holds.
- **F1, flow.** At every site where a value of static type `S` meets a
  declared type `T` — a binding with a type, a return against the
  function's declared or contextual return type, an argument against its
  parameter, a `satisfies` — the acceptor requires `keys(S) = keys(T)`,
  recursively through properties and array elements, and per case through
  a union by the value's `kind`, where a case's exclusion keys (`k?: never`,
  the other cases' fields) are not keys of the case. A value that carries
  a key its type lacks, or lacks one it declares, is refused where it
  flows. Holds: the acceptor's exactness rule, with a fixture per site
  under `fixtures/accept/widening-*.ts`.

Trusted declarations, whose types are taken as written: the kernel
(`src/`), zod's parse outputs, and in the effects tier the foreign
surfaces. The domain calls nothing from `node_modules` or the language's
own library, so no declaration from there is relied on in the domain.

With K1, C1 and F1, static exactness implies runtime exactness in the
domain by induction on how a value was built: every entry is exact and
every step preserves it.

## 2. Sums and elimination

A sum is `Variant<M>`: a map from case name to the case's own fields, each
case refusing every other case's fields. Its only eliminator in the domain
is `fold`, whose `Cases<M, R>` requires a handler for every key (C2, the
compiler's). The domain makes no decision by a boolean. The grammar has no
`if`, `switch`, `?:`, `??`, `||`, `&&`, `!`, comparison, `in` or
`instanceof`, and the acceptor refuses every call that returns a boolean
(`some`, `includes`, `startsWith`, …); the one boolean the domain holds is
a boolean field of a fact, read by name, or a literal. Sameness of facts is
`compare`, which returns a `Variant`. Holds: lint for the forms, the
acceptor's decision rule for the calls.

A `fold` handler is domain code under the same Γ, Δ and E as the function
that contains it; it runs once on one path.

## 3. Effects

The domain performs nothing. A plane declares its operations (`Operations`:
per operation the arguments the shell needs, the closed outcome the shell
answers with, which outcome cases issue a receipt and which receipt the
operation spends), and `commands<Ops, S>()` gives the domain two
constructors: `done(status)` and `suspend(op, args, arms)`, one arm per
outcome case, each returning the next step. A domain function returns a
`Step`; the interpreter in `effects/` (`drive(fx, first)`) performs the
operation each suspension names through the `Effects` record, resumes
with the outcome, notes both in the ledger, and continues; a performer
that throws halts the run with the ledger so far.

The purity rule, the acceptor's: a call's callee is an export of the
kernel (`fold`, `partition`, `mapNonEmpty`, `occupancy`, `compare`,
`commands`, and `done`/`suspend` of an algebra), a function the domain
declared, or a method of a fact (`map`, `reduce`, `join`, `slice`,
`toUpperCase`, … — the pure, total ones; `Math` but not `Math.random`).
Never a parameter, a function read from a record, a global, a package, a
boundary or effects module, the ledger, `Sealed.open`/`Sealed.spend`
(the owner's), a step's resumption (the interpreter's), or a call that
returns a `Promise`, nothing or `never`. A parameter's type is a fact all
the way down: no function, accessor or method, nothing undecided; a step
and a sealed value are the two kernel values the domain carries without
reading. Nothing of an `effects/` module is imported by value. Holds.

So a domain function is a function of its arguments: what it returns is
a status or a step, and the step names the one operation to perform next
with the arguments to perform it with. The ledger is the event history,
every operation and its outcome, kept by the interpreter.

## 4. Linear receipts

A receipt is a value an operation's answer issues and another operation
spends: a hold to ship against or release, a lease to settle. Δ is what
the attempt owes: the receipts issued to it and not yet spent. The step
type carries Δ (`Step<Ops, S, O>`, with `O` the owed index), and the
kernel derives it from the plane's declaration:

- `done` is a step that owes nothing;
- an arm for outcome case `C` of operation `K` returns a step owing
  `After<O, Ops, K, C>` = what was owed, less what `K` spends, plus what
  `C` issues;
- `suspend` on `K` requires `O extends Requires<Ops, K>`: what `K` spends
  must be owed;
- the step type is invariant in `O` (a function-typed property), so a step
  owing nothing is not a step owing something, and the reverse.

Hence, statically, in the arm where it happens: a receipt issued and not
spent before the chain ends (an arm that owes one returns `done`) is a
type error; a receipt spent twice (the second spend finds nothing owed)
is a type error; a receipt spent before it is issued is a type error; what
is owed is carried through every operation between issue and spend. The
gates `dropped`, `twice`, `early`, `carried`, `relabelled` in
`src/gates.typetest.ts` hold each, with a mutation per gate. Holds.

What the owed index does not count: two receipts of the same name
outstanding at once (a plane that issues two names them differently), and
the identity of a receipt across attempts. The runtime half holds the
latter: a receipt is a `Sealed<_, _, 'spend'>` minted by the adapter that
performs the issuing operation, and the adapter that performs the spending
operation reads it with `Sealed.spend`, which refuses a second read of the
same value by identity, whatever route it took. The domain cannot mint
one (no `new`, no `Symbol`, no authority), read one, or spend one; it
carries it from the arm that received it to the operation that takes it.

This is linearity at the level of the chain, in the type, which is what
the domain writes; it is not variable-level move semantics, which
TypeScript does not have and the grammar does not need (a receipt is
used by being passed to an operation, and the index says which).

## 5. Termination

Every domain function terminates. The grammar has no loop; the acceptor
refuses a cycle in the reach graph of the domain's bindings, where a
binding reaches every binding it references (a function passed is a
function that may be called); the fact methods and the kernel's folds
are bounded by their input; a fact is finite (`Recursive` is refused). So
a domain function's evaluation is a finite tree of calls over finite
data. Holds: the acceptor's termination rule.

## 6. The kernel's contract

Assumed by the theorem, tested in `test/`:

- K1 `boundary`: output is the schema's output, a fresh object holding
  exactly the declared keys, frozen all the way down; `sealing` returns
  an owner's sealed value whose payload is exactly a fact.
- K2 `Sealed`: constructed only by the holder of its tag; `open` returns
  the payload of held evidence; `spend` returns the payload of spent
  evidence at most once; the payload is frozen all the way down at
  sealing, through every own property, string- or symbol-keyed,
  enumerable or not, without reading an accessor; the spent set and the
  set of objects the kernel has frozen are its two pieces of runtime
  state, each written once per value.
- K3 `fold`: dispatches on `kind` once; total by `Cases`.
- K4 `partition`, `mapNonEmpty`, `occupancy`, `compare`: pure, as tested.
- K5 `commands` and `drive`: `done` and `suspend` build frozen steps;
  the interpreter performs exactly the operation a suspension names,
  through the performer of that name, resumes with the outcome it
  returned, keeps the ledger in the kernel's append-only builder
  (`ledger.ts`, one write per operation, read as a frozen copy), and
  finishes with the status and the ledger or halts with the error and
  the ledger so far.

## 7. The theorem

For an accepted program, assuming K1–K5 and TypeScript's assignability on
the grammar of §11:

1. every value of a fact type reachable in domain code has exactly its
   type's keys, and is frozen if it crossed the kernel;
2. every `fold` is total, and no decision in the domain is a boolean;
3. a domain function is a function of its arguments: it performs no
   effect and terminates;
4. an attempt's chain spends every receipt it is issued exactly once,
   after it is issued; a receipt is read at most once at runtime;
5. 1–4 are preserved by execution.

Proof by induction on the evaluation of accepted programs, with the
kernel as the trusted base: 1 by §1 (K1, C1, F1); 2 by §2; 3 by §3 and §5;
4 by §4, the static half from the derivation of the step type and the
runtime half from K2 and K5.

## 8. What is excluded, what is not needed, what is open

The grammar excludes the constructs under which TypeScript is unsound or
structural in ways this contract cannot survive: `any`, `as` (but `as
const`), `!`, directives, ambient declarations, index signatures, spread
into a record, `new`, `this`, accessors, prototypes, cloners, `Reflect`,
`Object.assign`, `JSON.parse`, registry symbols, dynamic import. The
foreign tier is unchecked by construction; what crosses from it enters
through K1 or K2. Not excluded and not needed: `ReadonlyArray` covariance
(sound); method parameter bivariance (`Cases` uses property syntax,
checked contravariantly).

Open, and said so here and in `GUARANTEES.md`:

- two receipts of one name outstanding at once are not counted (§4);
- a receipt carried into another attempt's chain is refused at runtime,
  not statically (§4);
- a domain that is never driven: the acceptor says a module is a correct
  domain module, not that anything reaches it. An unreachable-export
  check (`knip`, `ts-prune`) and a test per entry point are the holds
  for that, and they are the host's.

## 9. Containers, planned

The fact types cover closed records, variants, tuples and arrays. A
dictionary, a tree, a graph and a document model are refused as single
facts (an index signature, a recursion) and are structures of facts:
nodes with identifiers and a separate relation. The kernel does not yet
provide the containers for that encoding, a finite map and a recursive
structure with checked constructors and folds, and until it does the
encoding is by hand.

## 10. The trusted base

Purity, totality, exactness and linear use are properties of the program
that calls the kernel, not of the kernel: they are established by
accepting or refusing programs, and a kernel is a guard only on what
crosses its API. Nor is anything in the same process un-bypassable: an
in-process guard is bypassed by not calling it. The guards that cannot be
routed around are the build, which refuses a program before it exists,
and a separate process that holds the state and refuses a bad transition.

The trusted base is: TypeScript's type checker on the grammar of §11
(the acceptor reads its types; a directive that silences it is refused);
the acceptor, which fails closed (a form it does not name is a refusal)
and whose every rule is the only rule refusing some fixture; the lint
tiers, each rule proved by a fixture; the kernel of §6, as tested; zod's
descriptive forms, as tested; the runtime. The acceptor is not a compiler
and does not claim to be one: it is a whitelist over syntax with four
questions asked of the checker (what is this expression's type; what keys
does it have; where was this callee declared; what does this call return).

## 11. The domain language

The grammar the acceptor admits. Anything else is refused by name.

**Modules.** Imports (a value import from `effects/` refused; a type
import from anywhere allowed), type aliases and interfaces, `const`
bindings, function declarations, type-only re-exports. No default export,
no value re-export, no class, enum or namespace, no `declare`.

**Functions.** Every parameter annotated or typed by its callee, and a
fact all the way down (a step or a sealed value carried, not read). No
default, no optional, no `async`, no generator. A body is an expression,
or `const` bindings and one `return` with a value.

**Expressions.** Names, literals, templates, parentheses, property reads
(no `?.`), arithmetic (`+ - * / % **`, unary `-`), records whose every key
is named with a value (no spread, no computed key, no accessor, no
method, no `__proto__`), arrays (spread allowed), arrow functions, calls
whose callee is the kernel's, the domain's or a fact's method and whose
every argument is exact against its parameter, `as const`, `satisfies`.

**Types.** Declared facts, `Variant<M>`, `Step<Ops, S, O>`, sealed values
carried opaquely. Nothing `any`, `unknown` or generic in a domain
function's signature: the kernel is generic, the domain is written in
declared types.
