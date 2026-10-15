// Every path through the attempt, with a fake of the foreign systems that
// returns and throws the way the real ones do. The adapters mint the hold,
// the domain carries it, and the adapters spend it; the ledger says which
// operations ran and what came back.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseOrder } from './boundary/order.js';
import type { Charge, Foreign, Reservation } from './effects/foreign.js';
import { fulfilOrder } from './effects/run.js';
import type { Order } from './plane.js';
import { report } from './report.js';

const order: Order = {
  id: 'o-1',
  lines: [
    { sku: 'A', qty: 2 },
    { sku: 'B', qty: 1 },
  ],
  total: 3000,
  to: { name: 'R', lines: ['1 Main St', 'Suite 4'], country: 'US' },
};

const reservation: Reservation = {
  holdId: 'h-1',
  allocations: [
    { sku: 'A', qty: 2, warehouse: 'W1', vendor: null },
    { sku: 'B', qty: 1, warehouse: null, vendor: 'V9' },
  ],
  missing: [],
};

type World = { readonly released: string[]; readonly shipped: string[]; readonly log: string[] };

const foreignWith = (overrides: Partial<Foreign>, charge: Charge = { ok: true, amount: 3000 }): { readonly foreign: Foreign; readonly world: World } => {
  const world: World = { released: [], shipped: [], log: [] };
  const foreign: Foreign = {
    reserve: async () => reservation,
    release: async (holdId) => {
      world.released.push(holdId);
    },
    charge: async () => charge,
    ship: async (holdId) => {
      world.shipped.push(holdId);
      return `T-${holdId}`;
    },
    log: (line) => {
      world.log.push(line);
    },
    ...overrides,
  };
  return { foreign, world };
};

test('an order in stock is reserved, charged and shipped; the allocations read back whole', async () => {
  const { foreign, world } = foreignWith({});
  const run = await fulfilOrder(foreign)(order);
  assert.deepEqual(run.status, {
    kind: 'fulfilled',
    tracking: 'T-h-1',
    allocations: [
      { line: { sku: 'A', qty: 2 }, from: { kind: 'warehouse', code: 'W1' } },
      { line: { sku: 'B', qty: 1 }, from: { kind: 'dropship', vendor: 'V9' } },
    ],
  });
  assert.deepEqual(
    run.ledger.map((e) => e.kind),
    ['reserve', 'charge', 'ship'],
  );
  assert.deepEqual(world.shipped, ['h-1']);
  assert.deepEqual(world.released, []);
  assert.match(world.log[0] ?? '', /"action":"fulfilled"/);
});

test('a short reservation is a backorder naming what is missing, and nothing is held', async () => {
  const { foreign, world } = foreignWith({ reserve: async () => ({ holdId: 'h-2', allocations: [], missing: [{ sku: 'B', qty: 1 }] }) });
  const run = await fulfilOrder(foreign)(order);
  assert.deepEqual(run.status, { kind: 'backordered', missing: [{ sku: 'B', qty: 1 }] });
  assert.deepEqual(
    run.ledger.map((e) => e.kind),
    ['reserve'],
  );
  assert.deepEqual(world.released, []);
});

test('a declined charge releases the hold and reports the reason', async () => {
  const { foreign, world } = foreignWith({}, { ok: false, reason: 'insufficient funds' });
  const run = await fulfilOrder(foreign)(order);
  assert.deepEqual(run.status, { kind: 'payment_declined', reason: 'insufficient funds' });
  assert.deepEqual(
    run.ledger.map((e) => e.kind),
    ['reserve', 'charge', 'release'],
  );
  assert.deepEqual(world.released, ['h-1']);
});

test('a charge that died releases the hold and hands back the diagnostic', async () => {
  const { foreign, world } = foreignWith({
    charge: async () => {
      throw new Error('gateway timeout');
    },
  });
  const run = await fulfilOrder(foreign)(order);
  assert.deepEqual(run.status, { kind: 'worker_died', diagnostic: 'gateway timeout' });
  assert.deepEqual(world.released, ['h-1']);
});

test('a shipment that died is a dead worker; the hold was spent by shipping', async () => {
  const { foreign, world } = foreignWith({
    ship: async () => {
      throw new Error('carrier down');
    },
  });
  const run = await fulfilOrder(foreign)(order);
  assert.deepEqual(run.status, { kind: 'worker_died', diagnostic: 'carrier down' });
  assert.deepEqual(world.released, []);
});

test('a reservation that died ends the attempt before any charge', async () => {
  const { foreign } = foreignWith({
    reserve: async () => {
      throw new Error('stock service unreachable');
    },
  });
  const run = await fulfilOrder(foreign)(order);
  assert.deepEqual(run.status, { kind: 'worker_died', diagnostic: 'stock service unreachable' });
  assert.deepEqual(
    run.ledger.map((e) => e.kind),
    ['reserve'],
  );
});

test('the boundary refuses an order with a fractional quantity, an unknown key, or a bad country', () => {
  assert.equal(parseOrder({ ...order, lines: [{ sku: 'A', qty: 1.5 }] }).kind, 'rejected');
  assert.equal(parseOrder({ ...order, hidden: 1 }).kind, 'rejected');
  assert.equal(parseOrder({ ...order, to: { ...order.to, country: 'USA' } }).kind, 'rejected');
  const accepted = parseOrder(order);
  assert.equal(accepted.kind, 'accepted');
  if (accepted.kind !== 'accepted') return;
  assert.ok(Object.isFrozen(accepted.fact.to.lines));
});

test('every status has a report line', () => {
  const every = [
    report({ kind: 'fulfilled', tracking: 't', allocations: [] }),
    report({ kind: 'backordered', missing: [] }),
    report({ kind: 'payment_declined', reason: 'r' }),
    report({ kind: 'worker_died', diagnostic: 'd' }),
  ];
  every.forEach((line) => assert.ok(line.action.length > 0));
});
