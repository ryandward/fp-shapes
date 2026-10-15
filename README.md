# fp-shapes

A small TypeScript library of functional building blocks, with the
restrictions checked by the compiler.

```
npm run check    # type-check (including the type tests) and run the tests
```

## What's in it

**Tagged unions** — `Union`, `match`

```ts
type ShapeCases = { circle: { readonly r: number }; square: { readonly side: number } };
type Shape = Union<ShapeCases>;
const area = match<ShapeCases, number>({ circle: ({ r }) => Math.PI * r * r, square: ({ side }) => side * side });
```

`match` must handle every case. A case cannot carry another case's fields.
Also: `Option` (`none`, `some`), `Result` (`ok`, `err`), `tryCatch`,
`NonEmptyArray` and `nonEmpty`.

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

## Files

| File | Contents |
|---|---|
| `src/union.ts` | `Union`, `match`, `Option`, `Result`, `NonEmptyArray` |
| `src/opaque.ts` | `Opaque` |
| `src/freeze.ts` | `deepFreeze` |
| `src/types.ts` | `IsComplete`, `IsDeepReadonly`, `Recursive`, `Equal`, `Expect` |
| `src/decode.ts` | `decoder` |
| `src/program.ts` | `program` |
| `src/run.ts` | `run`, `tryCatch` (these perform effects) |
| `src/pure.ts` | entry point for pure code: everything except `run`, `tryCatch`, `decoder` and creating `Opaque` values |
| `test/types.test-d.ts` | type tests: each `@ts-expect-error` line must fail to compile |
| `test/runtime.test.ts` | runtime tests |
