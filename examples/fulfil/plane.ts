// The fulfilment plane: the facts, the outcomes, and the declaration of the
// operations the attempt may perform. A declaration says, per operation, what
// the shell needs, what it answers with, which answers issue a receipt and
// which receipt the operation spends; the kernel derives the step type and
// the owed index from it. The hold is a receipt the adapter mints and the
// domain carries opaquely: its type is imported, its authority stays in
// effects/adapt.ts.

import { commands } from '../../src/command.js';
import type { Variant } from '../../src/variant.js';
import type { Hold } from './effects/adapt.js';

export type { Hold } from './effects/adapt.js';

export type Line = { readonly sku: string; readonly qty: number };
export type Address = { readonly name: string; readonly lines: ReadonlyArray<string>; readonly country: string };
export type Order = { readonly id: string; readonly lines: ReadonlyArray<Line>; readonly total: number; readonly to: Address };

export type Source = { warehouse: { readonly code: string }; dropship: { readonly vendor: string } };
export type Allocation = { readonly line: Line; readonly from: Variant<Source> };

export type ReserveOutcome = {
  reserved: { readonly hold: Hold; readonly allocations: ReadonlyArray<Allocation> };
  short: { readonly missing: ReadonlyArray<Line> };
  reserve_died: { readonly diagnostic: string };
};
export type ChargeOutcome = {
  charged: { readonly amount: number };
  declined: { readonly reason: string };
  charge_died: { readonly diagnostic: string };
};
export type ShipOutcome = { shipped: { readonly tracking: string }; ship_died: { readonly diagnostic: string } };
export type ReleaseOutcome = { released: {}; release_died: { readonly diagnostic: string } };

export type OrderStatus = {
  fulfilled: { readonly tracking: string; readonly allocations: ReadonlyArray<Allocation> };
  backordered: { readonly missing: ReadonlyArray<Line> };
  payment_declined: { readonly reason: string };
  worker_died: { readonly diagnostic: string };
};

export type Fulfilment = {
  readonly reserve: { readonly args: { readonly id: string; readonly lines: ReadonlyArray<Line> }; readonly outcome: ReserveOutcome; readonly issues: { readonly reserved: 'hold' }; readonly spends: never };
  readonly charge: { readonly args: { readonly id: string; readonly amount: number }; readonly outcome: ChargeOutcome; readonly issues: {}; readonly spends: never };
  readonly ship: { readonly args: { readonly hold: Hold; readonly to: Address }; readonly outcome: ShipOutcome; readonly issues: {}; readonly spends: 'hold' };
  readonly release: { readonly args: { readonly hold: Hold }; readonly outcome: ReleaseOutcome; readonly issues: {}; readonly spends: 'hold' };
};

export const { done, suspend } = commands<Fulfilment, Variant<OrderStatus>>();
