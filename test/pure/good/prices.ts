// Data and arithmetic: arrays, strings, Option, bool.
import { bool, match, nonEmpty, type NonEmptyArray, type OptionCases } from 'fp-shapes/pure';

export type Line = { readonly sku: string; readonly cents: number; readonly qty: number };

export const subtotal = (lines: ReadonlyArray<Line>): number => lines.map((l) => l.cents * l.qty).reduce((a, b) => a + b, 0);

export const format = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

export const freeShipping = (cents: number): string => bool({ true: () => 'free shipping', false: () => 'shipping applies' })(cents >= 5000);

export const firstSku = (lines: ReadonlyArray<Line>): string =>
  match<OptionCases<NonEmptyArray<Line>>, string>({ none: () => 'empty', some: ({ value }) => value[0].sku })(nonEmpty(lines));

export const sorted = (lines: ReadonlyArray<Line>): ReadonlyArray<Line> => lines.toSorted((a, b) => a.cents - b.cents);
