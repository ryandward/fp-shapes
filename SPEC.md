# The contract

What "accepted by fp-shapes" means, as the rules a checker enforces and the
contracts a kernel keeps. Since 0.6 the domain core is written in Koka and
the checker of the core is the Koka compiler together with the gate in
`scripts/koka-gate.mjs`; the shell around it (the boundary, the effects, the
shell-side domain code) is TypeScript held by the syntax tiers and the
gates. Where a rule is not yet enforced, this document says so.

An accepted program is

1. a core: Koka modules that compile under the pinned compiler (JavaScript
   backend), pass the gate over their import closure, and are reached from
   the shell only through the FFI the generator writes for them (§3); and
2. a shell: a TypeScript program that compiles under the strict flags in
   `tsconfig.json` and passes the syntax tiers in `eslint.config.js`.

The judgment this document is written against is

       Γ ; Δ ⊢ e : T ! E ; Δ′

read: under facts Γ and linear evidence Δ, expression `e` has type `T`,
may perform effects `E`, and leaves linear evidence Δ′. In the core, Γ, T
and E are the compiler's: a nominal type for every fact, a closed sum for
every outcome, and an effect row that names every operation `e` may
perform, inferred and refused against the declaration. Δ is tracked at
runtime by the shell (§4). In the shell, Γ and T are TypeScript's on the
subset the tiers leave, E is the tiers' import and global discipline, and
Δ is the kernel's spent set.

Γ holds the bindings in scope whose types are facts. Δ is a multiset of the
bindings in scope whose types are spent evidence (a receipt in the core, a
`Sealed<_, _, 'spend'>` in the shell). E is the set of effect operations
`e` may perform; in the core it is exactly the plane's command effect, in
shell-side domain code it is empty. Δ′ is Δ after `e` has consumed or
transferred what it consumed or transferred.

## 1. Facts

A fact type `F` is total (`Total<F>`), immutable (`Immutable<F>`), finite and
shallow: no optional key, no `undefined`, `unknown`, `any`, `never`,
function, index signature, symbol key, `Date`, or open object; every
property readonly, every array a `ReadonlyArray`; no container that is its
own ancestor; at most four containers on any path from the root to a leaf.
A fact's keys are names: a symbol key is a hole in the type and a computed
key is refused in a literal, so what the freeze walks and what the type
describes are the same set of properties. A sealed value is read through
to its payload. These are compile-time gates (`src/total.ts`) and hold
today.

A fact *value* of type `F` has exactly the keys `F` declares, at every
level. Values enter the domain from three places, and each is exact:

- **K1, a boundary parse.** `boundary(schema)` accepts a schema whose
  output is total and readonly (`TotalSchema`) and returns that output and
  nothing else. The schema language is zod *as a description*: objects,
  tuples, arrays, unions and discriminated unions, primitives, brands,
  coercions, `.default`/`.catch` with a literal, `.prefault`, `.refine`,
  `.preprocess` (its function runs before the parse, so its result is
  still parsed), `.pipe`. Lint refuses what computes a value no schema
  describes: `.transform`, `.overwrite`, `z.codec`, `z.custom`, and a
  `.default`/`.catch` whose argument is a binding rather than a literal
  (a literal is excess-checked by the compiler; a binding may be wider).
  In that language every object output is built by zod with exactly the
  declared keys (`z.object` drops undeclared string keys, `z.strictObject`
  refuses them as a rejection, neither copies a symbol key), and the
  kernel freezes the fact all the way down. No function of the caller's
  stands between the parse and the fact. What an owner makes of a parsed
  fact goes through `sealing(parse, seal)`, where `seal` must return a
  sealed value whose payload is a fact (`Fact<P>`), and `Sealed` is
  invariant in its payload, so the payload is exactly what the owner
  constructed from the parsed fact. Holds today, with the runtime half
  tested: fresh object, declared keys only, strict rejection, frozen
  through every level, preprocessed input still parsed, sealed payload
  frozen. What remains is F1 inside the boundary: a payload built from a
  binding that was narrowed earlier (`const narrow: Small = wide; new
  Sealed(TAG, narrow, 'open')`) is the flow hole, as everywhere.
- **C1, a fresh literal.** TypeScript checks a fresh object literal for
  excess keys. The check does not reach spread members, so an object
  spread or rest pattern is refused in the domain, boundary and effects
  (syntax tier). Holds today.
- **F1, flow.** Exactness is preserved through every step that moves a
  value: a binding, a parameter, a return, a call argument including a
  generic instantiation, an array element, a property of a literal, an
  import from inside the checked closure. At each site where a value of
  static type `S` is accepted at a declared type `T`, the checker requires
  `keys(S) = keys(T)` recursively through properties and array elements,
  and per case through a `Variant`'s `kind`, where a case's exclusion keys
  (`k?: never`, the other cases' fields) are not keys of the case. A step
  that forgets a key is refused. **Not yet enforced**; `fixtures/open/widening.ts` is the program
  it refuses.

Trusted declarations, whose types are taken as written: the kernel
(`src/sealed.ts`, `src/total.ts`, `src/variant.ts`, `src/boundary/*`), zod's
parse outputs, and in the effects tier the foreign surfaces. A declaration
from `node_modules` reached from the domain is refused by the effect rule
below, so its exactness is never assumed there.

With K1, C1 and F1, static exactness implies runtime exactness in the
domain by induction on how a value was built, because every entry is
exact and every step preserves it.

## 2. Sums and elimination

A sum is `Variant<M>`: a map from case name to the case's own fields, each
case refusing every other case's fields. Its only eliminator in the domain
is `fold`, whose `Cases<M, R>` requires a handler for every key (C2, held by
the compiler). The domain produces no boolean as a decision. The syntax
tier refuses the forms that produce one: `if`, `switch`, `?:`, `??`, `||`,
`&&`, `!`, every comparison operator including `in` and `instanceof`,
`Boolean(…)`, the yes-or-no methods of built-ins (`startsWith`, `includes`,
`has`, `test`, `isNaN`, `isArray`, `hasOwn`, …), an annotated boolean
return, and `filter`, `find`, `some`, `every`. What it cannot see is a
boolean produced by a reader in `effects/` and imported, or by a
function whose return is inferred through such a call; the checker's rule
is that no expression of type `boolean` is produced in the domain except
by reading a boolean field of a fact (**not yet enforced**;
`fixtures/open/inferred-boolean.ts`). Sameness of facts is `compare`, a
boundary decision returning a `Variant`.

A `fold` handler is checked under the same Γ, Δ and E as the function that
contains it: it is domain code, and it runs exactly once on exactly one
path, which is what makes it the one place a linear binding may be used
inside a callback (§4).

## 3. Effects

**In the core.** A core function declares its effect row, and the compiler
infers the row of its body and refuses the function when the inferred row
is not covered by the declared one. The plane's command algebra is one
effect declaration, one `ctl` operation per command, each returning that
command's closed outcome. An attempt is a function whose row is exactly
that effect: a match that misses a case puts `exn` in the inferred row, a
print puts `console` there, a recursive call puts `div` there, a read of a
reference puts `st` there, and each is refused before anything runs. A
value with a field its type lacks is refused by the constructor; a
constructor hidden by `abstract` cannot be written outside its module, nor
matched on, nor its fields read. `examples/ingest/core/mutations.mjs` holds
one loosening per refusal, and the compiler must refuse each.

The compiler leaves a few doors open under a `total` row, and the gate
closes them by token over the core's whole import closure: `extern`
(foreign code), `unsafe-*` and `pretend-*` (a row asserted), `trace` (a
print without the console effect), `var` and `ref` (local state the
compiler masks), `handler`, `with`, `mask` and the other handler forms (a
core that answers its own operations is a core without a shell), any
`@`-name, and any standard module outside the pure prelude. The gate reads
tokens outside comments and literals; `fixtures/koka/` holds one fixture
per refusal and the accepted forms, and `check:koka` runs them.

**The bridge.** The generator (`scripts/koka-gen.mjs`) reads the compiler's
interface files and writes, per core, a bridge module in Koka: a `step`
type with `Done(status)` and one `Await-<op>(args…, resume)` per operation,
whose `resume` takes that operation's outcome and no other, so an answer of
the wrong kind has no constructor to arrive in; `start`, which runs the
attempt under the handler that suspends at each operation; and a fold per
public type, the one way the shell reads a value of the core's.

**The FFI.** The generator also writes the shell's side: a `.d.ts` per
compiled module in which every type is opaque (branded) and every
constructor and fold is typed, so a literal is not a value of a core type;
a boundary module holding a schema per type that crosses in, the
conversions in (parse, construct through the compiled constructors,
freeze) and out (fold into a frozen Variant), the receipts' registries and
the step Variant; and an effects module holding the interpreter. What the
FFI carries is `string`, `int` as a safe integer, `bool`, `vector<T>` and
the core's own structs, sums and abstract types; anything else is refused
by name at generation, as is a recursive type, with what to use instead.

**The interpreter.** `drive(fx)` folds the step Variant: a suspension's
arguments go to the matching performer in the `Effects` record, the
outcome comes back, the resumption is called with it, and the loop
continues; `done` returns the status with the ledger, every command and
its outcome frozen in the order they happened. `attempt` exists only in
the performers. The ingest example is written to this shape; the ETL
example remains TypeScript domain code under the tiers.

## 4. Linear evidence

A binding enters Δ when it is bound to spent evidence: a parameter, a
case field in a `fold` handler, a field of a command outcome.

- `Sealed.spend(tag, r)` consumes `r`: Δ′ = Δ − {r}.
- Passing `r` to a function whose parameter is spent evidence transfers
  it: the callee's judgment must consume or return it.
- Placing `r` in a returned value (a command, a next state) transfers it
  to that value, which is then linear in the caller's Δ.
- Two uses of `r` on one path are refused. A use inside a callback is
  refused unless the callback is a `fold` handler, since `map` runs its
  callback any number of times and a `spend` written there is an
  occurrence with no definite consumption.
- Dropping is refused: at a terminal step (the plane declares which
  command cases end a run) Δ′ must be ∅.

This is linear dataflow, not occurrence counting. Koka's type system
does not track it: a core may hand the same receipt to two operations, or
drop one, and compile (`fip` ownership reports both, as warnings, for
functions that may not allocate; it cannot host an attempt). So Δ is
**enforced at runtime, in the shell, and not yet statically.** What holds:
a receipt an operation takes is spent when the step for that operation is
read, through the same spent set `Sealed.spend` keeps, and a second
operation on the same receipt halts the attempt; a step's resumption is
spent when it is called, so a suspension resumed twice halts; a receipt's
fields are read from the registry the shell minted it into, by identity,
so a value the core produced by any route other than an outcome (Koka
derives a copy-with-update for every constructor, hidden or not) halts
as a value the shell did not mint; and the ledger records every command
and outcome. Dropping is not yet refused: a run that ends with a receipt
issued and never spent is not reported, which is the next piece of the
ledger. A static pass over the core for the rule above, with a receipt's
flow through matches as paths and the attempt's returns as the points
where Δ′ = ∅ is required, is 0.7; it reads the compiler's core output, not
the source, and it is the one checker left to write.

## 5. The kernel's contract

Assumed by the theorem, tested in `test/`:

- K1 `boundary`: output is the schema's output, a fresh object holding
  exactly the declared keys, frozen by the kernel all the way down;
  `sealing` returns an owner's sealed value whose payload is exactly a
  fact.
- K2 `Sealed`: constructed only by the holder of its tag; `open` returns
  the payload of held evidence; `spend` returns the payload of spent
  evidence at most once; the payload is frozen all the way down at
  sealing, through every own property, string- or symbol-keyed, enumerable
  or not, without reading an accessor; the spent set and the set of
  objects the kernel has frozen are its two pieces of runtime state, each
  written once per value.
- K3 `fold`: dispatches on `kind` once; total by `Cases`.
- K4 `partition`, `mapNonEmpty`, `occupancy`, `compare`: pure, as tested.
- K5 the interpreter: performs exactly the command the core suspended
  on, through the performer of that name, resumes the core with the
  outcome it returned, and keeps the ledger of §4.
- K6 the FFI: every value crossing into the core is parsed by its schema
  (a defect of the shell halts, naming the field), built through the
  compiled module's constructors from the parsed copy, and frozen; every
  value crossing out is read through a generated fold into a frozen
  Variant, or, for a receipt, from the registry by identity; a
  resumption is called at most once; a receipt is spent at most once.
  `examples/ingest/ffi.test.ts` holds each of these; the generator's
  output is itself linted under the boundary and effects tiers.

## 6. The intended theorem

For an accepted program, assuming K1–K5 and TypeScript's assignability on
the constructs the tiers leave available:

1. every value of a fact type reachable in domain code has exactly its
   type's keys, and is frozen if it crossed the kernel;
2. every `fold` is total;
3. evaluation of a domain function is a function of its arguments: it
   performs no effect;
4. a run that ends in success has consumed every piece of spent evidence
   issued to it exactly once, and a run that ends otherwise names what it
   left unspent;
5. 1–4 are preserved by execution.

Proof by induction on the evaluation of accepted programs, with the
kernel as the trusted base. For the core, 1–3 are the compiler's theorems
(nominal types, exhaustive matches and effect rows), restricted to what
the gate leaves; 4 is the ledger's, at runtime, until the pass of §4.
For the shell, the argument is against the tiers and K1–K6.

## 7. What is excluded, and what is not

The tiers exclude the constructs under which TypeScript is unsound or
structural in ways this contract cannot survive: `any`, `as`, `!`,
compiler directives and ambient declarations outside typetests, index
signatures, spread, cloners, `Reflect`, `Object.assign`, prototypes and
`call`/`apply`/`bind`, `JSON.parse`, registry symbols. The foreign tier is
unchecked by construction; what crosses from it enters through K1 or K2.
Not excluded and not needed: `ReadonlyArray` covariance (sound), method
parameter bivariance (`Cases` uses property syntax, which is checked
contravariantly). Known and open: a global bound to another name
(`const D = Date`) passes the syntax tier and is refused by the effect
rule once the checker exists; `Object.keys` returns `string[]`, so a key
read through it is not a fact's key until the boundary says so.

## 8. Containers, planned

The fact types cover closed records, variants, tuples and arrays. A
dictionary, a tree, a graph and a document model are refused as single
facts (an index signature, a recursion, a depth) and are to be structures
of facts: nodes with identifiers and a separate relation. The kernel does
not yet provide the containers for that encoding, a finite map and a
recursive structure with checked constructors and folds, and until it
does the encoding is by hand. They come after the command algebra, since
their folds are the domain's and their constructors the kernel's, and
both are checked under the same judgment.

## 9. The trusted base, and where rigor goes

Purity, totality and linear use are properties of the program that calls
the kernel, not of the kernel: they are established by accepting or
refusing programs, and a kernel is a guard only on what crosses its API.
Nor is anything in the same process un-bypassable: an in-process guard is
bypassed by not calling it. The guards that cannot be routed around are
the build, which refuses a program before it exists, and a separate
process that holds the state and refuses a bad transition.

The core's checker is the Koka compiler, which refuses the programs of §3
by construction rather than by a list of forbidden spellings; the gate is
the list that remains, seven tokens and an import whitelist, and it is a
gate, not a type checker. The trusted base is therefore: the pinned Koka
compiler and its JavaScript backend, on the subset the gate leaves; the
generator, whose output is linted under the shell's tiers and whose
guarantees are tested in `examples/ingest/ffi.test.ts`; TypeScript's type
checker on the subset the tiers leave for the shell; the kernel in §5, as
tested; zod's descriptive forms, as tested in `GUARANTEES.md`; the
runtime. The compiler's representation of a value is not part of the
contract: a nullary constructor may be `null`, a one-field struct is its
field, and the shell never reads a `_tag`; every read is a generated fold
and every write a generated constructor call, which is why a one-field
abstract type is refused at generation (a bare field has no identity for
the registry to keep).

What the move to Koka bought is the checker over a TypeScript subset that
§10 of 0.5 planned: exactness, totality and effect purity are now the
language's, not a list of refusals maintained against the language. What
it did not buy is linearity (§4), the island risk (a host can still fail
to call the core, which the shell's tiers and the import refusals remain
for), or a second opinion on the compiler itself. Rigor, where it goes
next, goes into the linearity pass of §4 and into a proof of preservation
for the FFI's conversions, which are the one unverified piece of the
bridge and are kept small enough to review.

## 10. The core language

The core is the subset of Koka the gate leaves. The grammar of 0.5 §10, an
acceptor over TypeScript syntax, is withdrawn: its three guarantees are
the compiler's here, and the one it did not reach either, linearity, is
§4's runtime rule and the pass planned for 0.7.

**Modules.** A core directory holds a module per file; `koka.json` beside
it names the core module, the entry function, the modules the FFI reads,
and where the generated shell goes. Imports are the core's own modules
and the pure prelude (`std/core` and the data modules under it); nothing
else, and nothing from `std/os`, `std/sys` or the handler, debug, unsafe
and undiv modules.

**Types.** `struct` for a fact, `type` with constructors for a sum,
`abstract struct` for evidence (a receipt type ends in `-receipt` and is
spent by the operation that takes it). Fields are `string`, `int`,
`bool`, `vector<T>` or another of the core's types; no functions, tuples,
`maybe` or `list` across the FFI, no type parameters, no recursion.

**Effects.** One `effect` per plane, `ctl` operations only, each returning
a closed outcome. The attempt's row is that effect and nothing else.

**Terms.** Matches, constructor applications, calls to the core's own
functions and to the prelude, string and integer arithmetic. No handlers,
no local state, no `extern`, no row assertions, no recursion (the row
would say `div`), no exceptions (the row would say `exn`).

**The perimeter.** The FFI of §3 is the one bridge from the
Turing-complete shell into the core: zod is the dynamic parser at the
perimeter, every value is parsed every time it crosses in, and the shell
(`boundary/`, `effects/`, the interpreter, the shell-side domain code)
stays TypeScript held by the tiers, the kernel, the tests and the process
boundary.
