// Decoders: turn untrusted input into a typed, deep-frozen value, or a list
// of issues. Built on zod.
//
//   const decodeOrder = decoder(z.strictObject({ id: z.string(), qty: z.int() }).readonly());
//   decodeOrder(json)  // Result<NonEmptyArray<Issue>, { readonly id: string; readonly qty: number }>
//
// The schema's output type must be complete and deeply readonly (see
// types.ts); if it is not, the call does not compile, and the error names
// what the schema needs. Decide each optional field with `.default()` or
// `.nullable()`, and add `.readonly()` to objects and arrays.

import type { z } from 'zod';
import { deepFreeze } from './freeze.js';
import type { IsComplete, IsDeepReadonly, Recursive } from './types.js';
import { err, ok, type NonEmptyArray, type Result } from './union.js';

export type Issue = { readonly path: string; readonly message: string };

export type Decoder<A> = (input: unknown) => Result<NonEmptyArray<Issue>, A>;

type SchemaNeeds<What extends string> = { readonly 'decoder schema needs': What };

export type CompleteSchema<S extends z.ZodType> =
  IsComplete<z.output<S>> extends true ?
    IsDeepReadonly<z.output<S>> extends true ?
      unknown
    : SchemaNeeds<'a readonly output: add .readonly() to each object and array'>
  : IsComplete<z.output<S>> extends Recursive<z.output<S>> ? SchemaNeeds<'a non-recursive output: decode the node type instead'>
  : SchemaNeeds<'a complete output: give each optional field .default() or .nullable()'>;

const toIssue = (issue: z.core.$ZodIssue): Issue => ({ path: issue.path.map(String).join('.'), message: issue.message });

export const decoder =
  <S extends z.ZodType>(schema: S & CompleteSchema<S>): Decoder<z.output<S>> =>
  (input) => {
    const parsed = schema.safeParse(input);
    if (parsed.success) return ok(deepFreeze(parsed.data));
    const [first, ...rest] = parsed.error.issues.map(toIssue);
    return err<NonEmptyArray<Issue>>(first === undefined ? [{ path: '', message: 'invalid input' }] : [first, ...rest]);
  };

