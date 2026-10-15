// The boundary. The only shape that accepts `unknown`, and this directory is
// the only one that imports zod. A parse decides every absence once and returns
// a Variant; the domain never sees `unknown`, zod, or a raw row again.
//
// A boundary schema has a total, readonly output. Sparse input is the schema's
// business (`.default()`, `.nullable()`), and the output's completeness is
// checked here, at the definition, so it is a property of being a boundary
// rather than a gate someone writes per schema. `.readonly()` also freezes the
// parsed value at runtime, which is what lets `Sealed.open` hand out payloads
// by reference.

import type { z } from 'zod';
import type { Deep, Immutable, Recursive, Total } from '../total.js';
import type { NonEmpty, Variant } from '../variant.js';

export type Issue = {
  readonly path: string;
  readonly message: string;
};

export type Parse<F> = {
  accepted: { readonly fact: F };
  rejected: { readonly issues: NonEmpty<Issue> };
};

export type Boundary<F> = (raw: unknown) => Variant<Parse<F>>;

// When a schema falls short, the type error names what it needs; the compiler's
// own wording reports the key as a property the schema lacks, and the key and
// value read together as the instruction.
type Needs<What extends string> = { readonly 'to be a boundary schema, this needs': What };

export type TotalSchema<S extends z.ZodType> =
  Total<z.output<S>> extends true ?
    Immutable<z.output<S>> extends true ?
      unknown
    : Needs<'a readonly output: add .readonly() to the schema'>
  : Total<z.output<S>> extends Recursive<z.output<S>> ?
    Needs<'a finite output: a fact that contains its own kind is a structure of facts; parse the node'>
  : Total<z.output<S>> extends Deep<z.output<S>> ?
    Needs<'a shallow output: a fact nests through at most four containers; parse the rest as facts of their own'>
  : Needs<'a total output: decide each absence with .default() or .nullable()'>;

const toIssue = (issue: z.ZodError['issues'][number]): Issue => ({
  path: issue.path.map(String).join('.'),
  message: issue.message,
});

const issuesOf = (error: z.ZodError): NonEmpty<Issue> => {
  const [first, ...rest] = error.issues.map(toIssue);
  return first === undefined ? [{ path: '', message: 'invalid input' }] : [first, ...rest];
};

// What the owner makes of the parsed value is a fact too: total and readonly,
// plain or sealed. The callback's return is checked where it is written.
export type Fact<F> =
  Total<F> extends true ?
    Immutable<F> extends true ?
      unknown
    : Needs<'a readonly fact from seal: every property readonly, every array a ReadonlyArray'>
  : Needs<'a total fact from seal: no optional, undefined, unknown, any, function or open object'>;

export const boundary =
  <S extends z.ZodType, F>(schema: S & TotalSchema<S>, seal: (parsed: z.output<S>) => F & Fact<F>): Boundary<F> =>
  (raw) => {
    const result = schema.safeParse(raw);
    return result.success ?
        { kind: 'accepted', fact: seal(result.data) }
      : { kind: 'rejected', issues: issuesOf(result.error) };
  };
