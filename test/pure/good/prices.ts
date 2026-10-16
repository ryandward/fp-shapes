// Data and arithmetic: records, arrays, Option, ordering.
import { compare, head, match, nonEmpty, type NonEmptyArray, type OptionCases, type OrderingCases } from 'fp-shapes/pure';

export type Line = { readonly sku: string; readonly cents: number; readonly qty: number };

export const subtotal = (lines: ReadonlyArray<Line>): number => lines.map((l) => l.cents * l.qty).reduce((a, b) => a + b, 0);

export const format = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

export const shipping = (cents: number): string =>
  match<OrderingCases, string>({ lt: () => 'shipping applies', eq: () => 'free shipping', gt: () => 'free shipping' })(compare(cents, 5000));

export const firstSku = (lines: ReadonlyArray<Line>): string =>
  match<OptionCases<NonEmptyArray<Line>>, string>({ none: () => 'empty', some: ({ value }) => head(value).sku })(nonEmpty(lines));

export const sorted = (lines: ReadonlyArray<Line>): ReadonlyArray<Line> => lines.toSorted((a, b) => a.cents - b.cents);
