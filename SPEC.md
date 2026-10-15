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
function, index signature, `Date`, or open object; every property
readonly, every array a `ReadonlyArray`; no container that is its own
ancestor; at most four containers on any path from the root to a leaf. A
sealed value is read through to its payload. These are compile-time gates
(`src/total.ts`) and hold today.

A fact *value* of type `F` has exactly the keys `F` declares, at every
level. Values enter the domain from three places, and each is exact:

- **K1, a boundary parse.** `boundary(schema, seal)` accepts a schema whose
  output is total and readonly (`TotalSchema`), and a `seal` whose return
  is a total, readonly fact (`Fact<F>`); zod's `strictObject` refuses keys
  the schema lacks, `.readonly()` freezes each level, and `seal` is
  boundary code checked like any other. Holds today.
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
  and per case through a `Variant`'s `kind`. A step that forgets a key is
  refused. **Not yet enforced**; `fixtures/open/widening.ts` is the program
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
the compiler). No comparison, negation, predicate, `if`, `switch`, `?:`,
`??`, `||`, `&&`, `filter`, `find`, `some` or `every` exists in the domain
(syntax tier, holds today); sameness of facts is `compare`, a boundary
decision returning a `Variant`.

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
- an allowlisted method of a built-in value has E = ∅ (`map`, `flatMap`,
  `reduce`, `concat`, `slice`, `join`, `length`, the pure `String`,
  `Number`, `Math` (not `random`) and `JSON.stringify` operations);
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

- K1 `boundary`: output exact, frozen, total, readonly; `seal` returns a
  fact.
- K2 `Sealed`: constructed only by the holder of its tag; `open` returns
  the payload of held evidence; `spend` returns the payload of spent
  evidence at most once; the payload is frozen all the way down at
  sealing; the spent set is the kernel's only runtime state.
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
