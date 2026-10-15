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
import { frozen, type Sealed, type Use } from '../sealed.js';
import type { Deep, Immutable, Recursive, Total } from '../total.js';
import { fold, type NonEmpty, type Variant } from '../variant.js';

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

// A boundary's fact is the schema's output and nothing else: zod builds a
// fresh object holding the declared keys (string and symbol extras are never
// copied; `strictObject` refuses the string ones), and the kernel freezes it
// all the way down, so the fact is exact and frozen whatever the schema's
// form. No function of the caller's stands between the parse and the fact.
const fact = <F>(parsed: F): F => (typeof parsed === 'object' && parsed !== null ? frozen(parsed) : parsed);

export const boundary =
  <S extends z.ZodType>(schema: S & TotalSchema<S>): Boundary<z.output<S>> =>
  (raw) => {
    const result = schema.safeParse(raw);
    return result.success ?
        { kind: 'accepted', fact: fact(result.data) }
      : { kind: 'rejected', issues: issuesOf(result.error) };
  };

// What an owner makes of a parsed fact is a sealed value whose payload is a
// fact: total and readonly, checked where the seal is written. The payload
// is exactly what the owner constructed, because Sealed is invariant in it.
export type Fact<F> =
  Total<F> extends true ?
    Immutable<F> extends true ?
      unknown
    : Needs<'a readonly payload: every property readonly, every array a ReadonlyArray'>
  : Needs<'a total payload: no optional, undefined, unknown, any, function or open object'>;

export const sealing =
  <F, Tag extends symbol, P extends object, U extends Use>(parse: Boundary<F>, seal: (fact: F) => Sealed<Tag, P, U> & Fact<P>): Boundary<Sealed<Tag, P, U>> =>
  (raw) =>
    fold<Parse<F>, Variant<Parse<Sealed<Tag, P, U>>>>({
      accepted: ({ fact }) => ({ kind: 'accepted', fact: seal(fact) }),
      rejected: ({ issues }) => ({ kind: 'rejected', issues }),
    })(parse(raw));
