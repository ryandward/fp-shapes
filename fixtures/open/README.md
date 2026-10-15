# Open bypasses

Programs that pass `tsc` and every lint tier and still break a guarantee.
Each names the layer that closes it. When that layer lands, the program
moves to that layer's fixtures with an `expect:` header; until then it is
listed here so the hole is visible rather than assumed closed.

- `widening.ts`: a value with keys the type does not declare is assigned to
  the narrower type; TypeScript checks excess keys on fresh literals only.
  Closed by the type-aware tier (an assignment whose source type has keys
  the target lacks is refused).
- `parameter-call.ts`: the domain performs an effect handed to it as a
  function. Closed by effects as commands: the domain returns a command
  case and the interpreter in `effects/` performs it, so no domain code
  calls a function-typed parameter, and a scope rule refuses the call.
- `inferred-boolean.ts`: a boolean produced by an `open…` reader in
  `effects/`, where comparisons are permitted, and imported into the
  domain, which then holds a decision it did not make as a `Variant`.
  Closed by the checker: no expression of type `boolean` is produced in
  the domain except by reading a boolean field of a fact.
