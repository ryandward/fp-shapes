# The contract

What "accepted by fp-shapes" means, as the rules a checker enforces and the
contracts a kernel keeps. The syntax tiers and the gates hold part of this
today; the rest is the target of the next releases, and the command algebra
is designed against these rules so that the checker can verify it without a
second rewrite. Where a rule is not yet enforced, this document says so.

An accepted program is a TypeScript program that

1. compiles under the strict flags in `tsconfig.json`,
2. passes the syntax tiers in `eslint.config.js`, and
3. passes the checker, whose judgment is

       Γ ; Δ ⊢ e : T ! E ; Δ′

   read: under facts Γ and linear evidence Δ, expression `e` has type `T`,
   may perform effects `E`, and leaves linear evidence Δ′.

Γ holds the bindings in scope whose types are facts. Δ is a multiset of the
bindings in scope whose types are spent evidence (`Sealed<_, _, 'spend'>`).
E is the set of effect operations `e` may perform; in the domain it is
empty. Δ′ is Δ after `e` has consumed or transferred what it consumed or
transferred.

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

E(e) is computed by inference over calls:

- a kernel combinator (`fold`, `partition`, `mapNonEmpty`, `occupancy`,
  `compare`, `Sealed.open`) has E = ∅; `Sealed.spend` has E = ∅ and the
  linear effect of §4;
- a domain function has the E of its body;
- an allowlisted operation of a built-in value has E = ∅. The allowlist
  holds only operations that are total on fact inputs: they do not throw,
  invoke no callback other than a domain function checked under this
  judgment (`map`, `flatMap`, `reduce` take one), and read no accessor
  (facts have none; the syntax tier refuses `get`, `set` and methods in a
  literal). The list is per overload, not per name: `reduce` with an
  initial value is total and `reduce` without one throws on an empty
  array, so the syntax tier refuses the one-argument form. `concat`,
  `slice`, `join`, `length`, `map`, `flatMap`, seeded `reduce`, the
  `String` and `Number` operations that return on every input, `Math`
  without `random`. `JSON.stringify` is not on it: it throws on a
  `bigint`, which is a fact leaf, and the syntax tier refuses it in the
  domain and the boundary; serialization is an edge's job;
- any other call has E = ⊤: a function-typed parameter, a method of a
  value whose type is not a fact, an import from `effects/` other than an
  `open…`/`spend…` reader, an import from `node_modules`, a `Promise`
  method, a dynamic `import`.

A domain function is accepted only if E = ∅. The syntax tier holds the
import and ambient-global half of this today; the call half (a parameter
called, a method of an unknown value) is **not yet enforced**;
`fixtures/open/parameter-call.ts` is the program it refuses.

**Commands.** A domain step performs nothing. It returns a closed
`Variant<Command>` (the plane declares the map) together with the next
state, and the interpreter in `effects/` is the only performer: a total
`Cases<Command, Promise<Variant<Outcome>>>`, one handler per command,
returning a closed outcome the next step folds. `attempt` exists only
inside the interpreter. The ingest and ETL examples are to be rewritten to
this shape (0.6); the contract types that hand performers to the domain
go away with it.

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

This is linear dataflow, not occurrence counting; it is **not yet
enforced**. What holds today is the runtime half, which stays: `spend`
refuses the second read of the same value whatever route it took, and
the interpreter's ledger (0.6) records every spent-evidence value it
issues during a run and, at the run's end, refuses success with one
unspent and reports failure or cancellation with the unspent ones named,
so nothing is dropped silently on the paths the static rule cannot see
(an alias from outside accepted source, an abort, a thrown defect).

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
- K5 the interpreter: performs exactly the command it is given, returns
  a closed outcome, keeps the ledger of §4.

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
kernel as the trusted base. The argument is written once the checker
exists, against the checker's rules.

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
