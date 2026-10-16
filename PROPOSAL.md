# Proposal: a grounded functional dialect of TypeScript

## 1. Problem

We want code, much of it written by agents, in which bad control flow can't be
expressed: hidden failure, absence, mutable state, effects mixed into
decisions. Rules that ban patterns one at a time don't converge, because every
new spelling needs a new rule. Instead, we define a small language **L**
positively, with known mathematical properties. A file is accepted if it is
written in **L**, or if it is an *interpreter* of operations that **L**
declares. Nothing else is accepted, so a new spelling is rejected by default.

## 2. The language L

### 2.1 Types

```
τ ::= Str | Num | Int | Bool                      primitives
    | { ℓ₁: τ₁, …, ℓₙ: τₙ }                       record (product), every field required
    | Σ { k₁: τ₁, …, kₙ: τₙ }                     tagged union (sum), kᵢ distinct
    | List τ | NonEmpty τ | τ₁ × … × τₙ          sequences, tuples
    | Map τ τ | Set τ                             finite maps and sets
    | μα. τ                                       recursive (inductive) type
    | τ₁ → τ₂                                     function
    | ∀α. τ                                       parametric polymorphism
    | Opaque_t τ | Once_t τ                       nominal type; single-use resource
    | Prog_Ops⟨Δ, Δ'⟩ τ                           effect description (§2.3)
```

Derived types: `Option τ = Σ{ none: {}, some: τ }` and
`Result ε τ = Σ{ err: ε, ok: τ }`.

**Data types** are the types containing no `→` and no `Prog`.

**Absent from the grammar entirely:** `null`, `undefined`, optional fields,
`unknown`, `any`, classes, `Promise`.

### 2.2 Terms

```
e ::= x | literal | { ℓ = e, … } | e.ℓ | [e, …]
    | (x: τ) => e | e e
    | match_Σ { k₁ ↦ e₁, …, kₙ ↦ eₙ } e        exhaustive: one branch per case
    | fold_μ e e                                structural recursion
    | pure e | perform(op, e, { c ↦ e, … })    effect description
    | prim(e, …)                                total pure primitives: arithmetic, string ops, equality, ordering
```

There is no statement form: no assignment, loop, `throw`, `if`, or `?:`. A
function body is an expression.

### 2.3 Effects

A plane is a set of operations. Each operation `op` declares:

```
In(op)           a data type
Out(op) = Σ{…}   a data type: the possible outcomes
acq(op, c)       resource names acquired when outcome c happens
rel(op)          resource names released
```

Programs are indexed by the set of held resources before and after (Atkey's
parameterized monad):

```
pure : A → Prog⟨Δ, Δ⟩ A

perform(op, x, k) : Prog⟨Δ, Δ'⟩ A
  provided  x : In(op)
            rel(op) ⊆ Δ                         release only what is held
            acq(op, c) ∩ Δ = ∅  for every c     never acquire what is already held
            k_c : Out_c(op) → Prog⟨(Δ ∖ rel(op)) ∪ acq(op, c), Δ'⟩ A   for every case c

bind : Prog⟨Δ₁, Δ₂⟩ A → (A → Prog⟨Δ₂, Δ₃⟩ B) → Prog⟨Δ₁, Δ₃⟩ B
par  : Prog⟨Δ₁, Δ₁'⟩ A × Prog⟨Δ₂, Δ₂'⟩ B → Prog⟨Δ₁ ⊎ Δ₂, Δ₁' ⊎ Δ₂'⟩ (A × B)
       defined only for disjoint resource sets
```

A complete program has type `Prog⟨∅, ∅⟩ A`.

### 2.4 Interpreters

An interpreter is the only code that may perform effects:

```
I : Π op ∈ Ops.  In(op) → Async(Out(op))
```

It is written outside **L** and checked only against this signature.

## 3. Properties we want (the theorems)

For every accepted program:

- **P1 Purity.** Evaluating an **L** term is a function of its free variables
  (referential transparency).
- **P2 Coverage.** Every `match` handles every case. No value is outside its
  type.
- **P3 No absence.** Every value inhabits its declared type. There is no `null`
  and no implicit failure.
- **P4 Termination.** Every **L** term terminates. Structural recursion over
  finite data is strongly normalizing (Gödel's System T plus folds). Unbounded
  repetition exists only inside `Prog`, as bounded retry or interpreter-driven
  loops.
- **P5 Linear resources.** On every path through a complete program, each
  resource is acquired at most once while held, released only while held, and
  held by nobody at the end. This is the sequence rule

  ```
  L([], Δ)              = (Δ = ∅)
  L(acquire(i) :: p, Δ) = i ∉ Δ ∧ L(p, Δ ∪ {i})
  L(release(i) :: p, Δ) = i ∈ Δ ∧ L(p, Δ ∖ {i})
  ```

  generalized from sequences to trees and composition.
- **P6 Boundary.** Values enter **L** only as interpreter outcomes or decoder
  results, and both are data types.

P6 is what makes higher-order functions safe. If everything that enters **L**
is first-order data, then every function in scope is an **L** term, and by P1
it is pure. The ad hoc "no function parameters" rule goes away; the boundary
condition replaces it.

## 4. The shapes, formally, with current status

| # | Shape | Definition | Status |
|---|---|---|---|
| 1 | Primitives | Str, Num, Int, Bool | Int not distinguished |
| 2 | Record | {ℓᵢ : τᵢ}, every field required | have |
| 3 | Tagged union + match | Σ{kᵢ : τᵢ}; `match` total | have |
| 4 | Option | Σ{none, some τ} | have |
| 5 | Result | Σ{err ε, ok τ} | have |
| 6 | Lists, non-empty lists, tuples | List τ, τ × List τ | have |
| 7 | Finite map, set | K ⇀ V with finite domain; lookup : Map K V → K → Option V | **missing; conflicts with `IsComplete`** |
| 8 | Inductive type + fold | μα.F(α); fold : (F R → R) → μF → R | **missing; conflicts with `IsComplete`** |
| 9 | Opaque / newtype | Opaque_t τ ≇ τ (nominal) | have |
| 10 | Single-use resource | Once_t τ, read at most once at runtime | have |
| 11 | Time as data | Instant ≅ Int (ms), Duration ≅ Int | missing |
| 12 | Higher-order functions | τ₁ → τ₂ as a value | **conflicts with the parameter rule; resolved by P6** |
| 13 | Polymorphism | ∀α. τ | have, via TS generics |
| 14 | Structural recursion | fold over μ and List | **missing; conflicts with no-recursion** |
| 15 | Equality, ordering | eq_τ, compare_τ : τ × τ → Σ{lt, eq, gt}, for data types τ | missing |
| 16 | Decoding | Dec τ = Unknown → Result(NonEmpty Issue, τ) | have |
| 17 | Encoding | Enc τ = τ → Json | missing |
| 18 | Effects as data | `pure`, `perform` | have |
| 19 | Sequencing | `bind` (§2.3) | **missing** |
| 20 | Parallel composition | `par`, with disjoint resources | missing |
| 21 | Repetition | retry : Nat → Prog A → Prog A (bounded) | missing |
| 22 | Cancellation, deadlines | every Out(op) contains `cancelled`; resources released on that path | missing |
| 23 | Streams of observations | `emit` operations, or νX. Step(A, X) | missing |
| 24 | Acquire / release | bracket with release on every outcome, including `cancelled` | partial |
| 25 | Ambient capabilities | now : Unit → Instant, uuid : Unit → Str, log : Line → Unit, as operations | missing |
| 26 | Errors vs defects | expected failure ∈ Out(op); defect = ⊥, only inside an interpreter | partial |
| 27 | State machines (typestate) | S = Σ{sᵢ : Fᵢ}; transition δ only for allowed pairs (i, j) | missing |
| 28 | Interpreter | I : Π op. In(op) → Async(Out(op)) | have |
| 29 | Modules, capabilities | records of operations, passed explicitly | partial |

## 5. Method: what we prove for each shape

For each shape `s` with type `τ`, we look for an encoding `⟦τ⟧` into
TypeScript and establish exactly one of three outcomes:

- **(R+E) Representable and enforceable.** The values of `τ` correspond
  one-to-one with the values of `⟦τ⟧`, and for every TypeScript program `p` in
  the accepted subset, if `tsc` accepts `p`, then **L** accepts `p`. In words:
  the compiler rejects every misuse.
- **(R only) Representable, not enforceable by tsc.** The encoding exists, but
  some misuse type-checks. We state the counterexample program, and the
  residual check that closes it (syntax or flow).
- **(I) Impossible.** A proof that no encoding exists.

**What counts as proof.** TypeScript has no official formal semantics. Its
checker is defined by its implementation, and it is deliberately unsound in
known places. Proofs are therefore relative to two things:

1. **A model of the checker.** We use the published core calculus (Bierman,
   Abadi and Torgersen, *Understanding TypeScript*, ECOOP 2014), extended with
   the features we rely on: conditional types, `unique symbol`, private fields.
2. **A pinned compiler version, tested against the model.** Every claimed
   property is backed by type tests that tsc must reject, with mutation testing
   to show each test is necessary.

An impossibility proof is a counterexample, plus an argument that every
encoding admits it. Example: TypeScript variables cannot be linear, because the
checker never records consumption. Inspection of the checker is evidence for
this, not a proof; the proof would be an argument over the model. Anything we
can neither construct nor refute is recorded as **open**.

## 6. Acceptance criterion for the checker

A file `f` is accepted if and only if one of these holds:

```
(a) f ∈ L     every type is in the τ grammar, every expression is in the e grammar,
              and tsc checks it under the pure standard library
(b) f is an interpreter: its exports have type Π op. In(op) → Async(Out(op)) for a declared plane
```

Anything else gets a single diagnosis: "outside **L**, and not an
interpreter", pointing at the first construct outside the grammar. The checker
is a membership test, not a list of bans.

## 7. Deliverables, in order

1. Approve or amend §2–§4. That's the definition.
2. A determination of R+E, R only, or I for each shape, with the encoding, the
   type tests, and the counterexamples or proofs. Start with the four conflicts
   (7, 8, 12, 14) and with `bind` (19), since each forces a change to the
   definition or the library.
3. Rebuild the checker as the membership test of §6. The current rules are
   kept only where they follow from the definition.
4. Run a blind test on a real package.
