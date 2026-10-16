# fp-shapes

A small TypeScript library of functional building blocks, with the
restrictions checked by the compiler.

```
npm run check    # build, type-check (including the type tests), run the tests
```

Requires TypeScript 7.0.2 exactly. `fp-shapes-check` uses TypeScript 7's API,
which the TypeScript team marks unstable, so the version is pinned rather than
a range.

## What's in it

**Tagged unions** — `Union`, `match`

```ts
type ShapeCases = { circle: { readonly r: number }; square: { readonly side: number } };
type Shape = Union<ShapeCases>;
const area = match<ShapeCases, number>({ circle: ({ r }) => Math.PI * r * r, square: ({ side }) => side * side });
```

`match` must handle every case. A case cannot carry another case's fields.
Also: `bool` (the same for booleans), `Option` (`none`, `some`), `Result`
(`ok`, `err`), `tryCatch`, `NonEmptyArray` and `nonEmpty`.

**Opaque types** — `Opaque`

A value only the module holding its tag can create or read. Object literals,
spreads and clones are rejected by the type checker and again at runtime. A
value created with `'once'` is a single-use token: the second `consume`
throws.

**Type checks** — `IsComplete`, `IsDeepReadonly`, `Equal`, `Expect`

`Expect<IsComplete<Order>>` fails to compile if `Order` has an optional field,
`undefined`, `unknown`, `any`, a function, an index signature, a `Date`, or is
recursive (the error names the property the recursion runs through).

**Decoders** — `decoder`

Turns untrusted input into a deep-frozen typed value, or a list of issues,
using a zod schema. The schema must produce a complete, readonly type, or the
call does not compile.

**Programs with tracked resources** — `program`, `run`

Business logic written as data: each step either finishes with a value or
asks for one operation and says what to do with each possible result. An
interpreter you supply performs the operations. Operations can acquire and
release named resources, and the types check, along every path, that a
resource is released exactly once, never before it is acquired, and never
acquired twice. See the header of `src/program.ts` for a worked example.

## Checking pure code

The code that makes decisions should be pure: no I/O, no clock, no randomness,
no mutation, no hidden branches. `fp-shapes-check` enforces that on whichever
files you point it at.

```
cp node_modules/fp-shapes/pure/tsconfig.template.json tsconfig.pure.json   # set "include" to your pure files
npx fp-shapes-check tsconfig.pure.json
```

It works in three layers.

**1. The compiler, with a pure standard library.** The files are compiled with
`noLib` and `pure/lib.d.ts`, which declares only pure operations. So `fetch`,
`console`, `Date`, `Math.random`, `Promise`, `async`, timers, `process`,
`JSON`, `Object.assign` and `push`/`sort`/`splice` do not exist, and using
them is an ordinary compile error. The check sets these compiler options
itself, so editing the tsconfig cannot loosen them.

**2. The grammar of L.** Every module item, expression and type must be one of
the forms of L, the pure language defined in `PROPOSAL.md`. Nothing is banned
by name: anything that is not one of these forms is reported as "Not in L",
naming the construct.

- Module items: imports, exports, type aliases, `const` bindings, and
  `declare const NAME: unique symbol;` to name an opaque type.
- Expressions: names, literals, templates, records that list their fields,
  arrays, property reads, calls, arrow functions (an expression body, or
  `const` bindings followed by one `return`), arithmetic, unary minus,
  `as const` and `satisfies`.
- Types: `string`, `number`, `boolean`, `never`, literal types and unions of
  them, records with only `readonly` properties, `readonly` arrays and tuples,
  function types, `typeof` of a tag, and references to the project's types,
  the library's types, type parameters and `ReadonlyArray`.

Decisions use `match` and `bool`; comparisons use `compare` and `eq`; the
first element of a non-empty array is `head`.

**3. Imports** come only from `fp-shapes/pure` and the project's own files.

Pure code imports from `fp-shapes/pure`, which has everything except `run`,
`tryCatch`, `decoder` and creating `Opaque` values: it can describe effects
as a `Program` but cannot perform them. Your other code runs the program.

**Not yet checked** (see `PROPOSAL.md` §8): a value with extra keys flowing
into a narrower type through a variable; recursion; recursive types through a
function. Values passed into pure code are trusted to be plain data, as values
from `decoder` are. Every refusal has a test in `test/pure/bad/`.

## Files

| File | Contents |
|---|---|
| `src/union.ts` | `Union`, `match`, `bool`, `Option`, `Result`, `NonEmptyArray`, `head` |
| `src/order.ts` | `compare`, `eq` |
| `src/opaque.ts` | `Opaque` |
| `src/freeze.ts` | `deepFreeze` |
| `src/types.ts` | `IsComplete`, `IsDeepReadonly`, `Recursive`, `Equal`, `Expect` |
| `src/decode.ts` | `decoder` |
| `src/program.ts` | `program` |
| `src/run.ts` | `run`, `tryCatch` (these perform effects) |
| `pure/lib.d.ts` | the pure standard library |
| `pure/check.mjs` | `fp-shapes-check` |
| `pure/tsconfig.template.json` | starting tsconfig for a pure project |
| `src/pure.ts` | entry point for pure code: everything except `run`, `tryCatch`, `decoder` and creating `Opaque` values |
| `test/types.test-d.ts` | type tests: each `@ts-expect-error` line must fail to compile |
| `test/runtime.test.ts` | runtime tests |
| `test/pure.test.ts`, `test/pure/` | good pure code passes; each file in `bad/` is refused |
