// One attempt at fulfilling one order: the decisions, as a chain of steps.
// The hold is owed from `reserved` until `ship` or `release` spends it; the
// type of every arm says so, and an arm that forgets does not compile.

import type { Step } from '../../src/command.js';
import type { Variant } from '../../src/variant.js';
import { done, suspend, type Allocation, type Fulfilment, type Hold, type Order, type OrderStatus } from './plane.js';

type Next<O> = Step<Fulfilment, Variant<OrderStatus>, O>;

const died = (diagnostic: string): Next<{}> => done({ kind: 'worker_died', diagnostic });

const letGo = (hold: Hold, after: Variant<OrderStatus>): Next<{ hold: true }> =>
  suspend('release', { hold }, {
    released: () => done(after),
    release_died: ({ diagnostic }) => died(diagnostic),
  });

const dispatch = (o: Order, hold: Hold, allocations: ReadonlyArray<Allocation>): Next<{ hold: true }> =>
  suspend('ship', { hold, to: o.to }, {
    shipped: ({ tracking }) => done({ kind: 'fulfilled', tracking, allocations }),
    ship_died: ({ diagnostic }) => died(diagnostic),
  });

const settleUp = (o: Order, hold: Hold, allocations: ReadonlyArray<Allocation>): Next<{ hold: true }> =>
  suspend('charge', { id: o.id, amount: o.total }, {
    charged: () => dispatch(o, hold, allocations),
    declined: ({ reason }) => letGo(hold, { kind: 'payment_declined', reason }),
    charge_died: ({ diagnostic }) => letGo(hold, { kind: 'worker_died', diagnostic }),
  });

export const fulfil = (o: Order): Next<{}> =>
  suspend('reserve', { id: o.id, lines: o.lines }, {
    reserved: ({ hold, allocations }) => settleUp(o, hold, allocations),
    short: ({ missing }) => done({ kind: 'backordered', missing }),
    reserve_died: ({ diagnostic }) => died(diagnostic),
  });
