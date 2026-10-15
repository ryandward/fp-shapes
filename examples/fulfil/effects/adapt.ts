// The adapters: each foreign call becomes the outcome the plane declares for
// its operation, and the receipt the plane threads is minted here. The hold
// is sealed under an authority private to this module and sealed for one
// read: the adapter that ships or releases spends it, and a second spend by
// any route halts. The domain carries the hold and cannot read it.

import type { Effects } from '../../../src/command.js';
import { Sealed } from '../../../src/sealed.js';
import { attempt, type Tried } from '../../../src/effects/attempt.js';
import { fold, type Variant } from '../../../src/variant.js';
import type { Allocation, ChargeOutcome, Fulfilment, ReleaseOutcome, ReserveOutcome, ShipOutcome } from '../plane.js';
import type { Foreign, Reservation } from './foreign.js';

const HOLD: unique symbol = Symbol('hold');

export type Hold = Sealed<typeof HOLD, { readonly orderId: string; readonly holdId: string }, 'spend'>;

// A reservation that covers every line issues a hold; one that leaves lines
// missing is short and holds nothing.
const reserved = (orderId: string, r: Reservation): Variant<ReserveOutcome> =>
  r.missing.length > 0 ?
    { kind: 'short', missing: r.missing }
  : {
      kind: 'reserved',
      hold: new Sealed(HOLD, { orderId, holdId: r.holdId }, 'spend'),
      allocations: r.allocations.map(
        (a): Allocation => ({
          line: { sku: a.sku, qty: a.qty },
          from: a.warehouse !== null ? { kind: 'warehouse', code: a.warehouse } : { kind: 'dropship', vendor: a.vendor ?? 'unknown' },
        }),
      ),
    };

export const adapt = (foreign: Foreign): Effects<Fulfilment> => ({
  reserve: ({ id, lines }) =>
    attempt(() => foreign.reserve(id, lines)).then(
      fold<Tried<Reservation>, Variant<ReserveOutcome>>({
        ok: ({ value }) => reserved(id, value),
        failed: ({ error }) => ({ kind: 'reserve_died', diagnostic: error.message }),
      }),
    ),

  charge: ({ id, amount }) =>
    attempt(() => foreign.charge(id, amount)).then(
      fold<Tried<Awaited<ReturnType<Foreign['charge']>>>, Variant<ChargeOutcome>>({
        ok: ({ value }) => (value.ok ? { kind: 'charged', amount: value.amount } : { kind: 'declined', reason: value.reason }),
        failed: ({ error }) => ({ kind: 'charge_died', diagnostic: error.message }),
      }),
    ),

  ship: ({ hold, to }) => {
    const { holdId } = Sealed.spend(HOLD, hold);
    return attempt(() => foreign.ship(holdId, to)).then(
      fold<Tried<string>, Variant<ShipOutcome>>({
        ok: ({ value }) => ({ kind: 'shipped', tracking: value }),
        failed: ({ error }) => ({ kind: 'ship_died', diagnostic: error.message }),
      }),
    );
  },

  release: ({ hold }) => {
    const { holdId } = Sealed.spend(HOLD, hold);
    return attempt(() => foreign.release(holdId)).then(
      fold<Tried<void>, Variant<ReleaseOutcome>>({
        ok: () => ({ kind: 'released' }),
        failed: ({ error }) => ({ kind: 'release_died', diagnostic: error.message }),
      }),
    );
  },
});
