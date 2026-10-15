// Every path through the fulfilment core, with scripted effects. What this
// example is for: the nested values (an order's lines and address on the
// way in, allocations holding a line and a source on the way out) round
// trip through the FFI exactly, and the hold is spent by ship or by release
// on every path.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Allocation, ChargeOutcome, Order, OrderStatus, ReleaseOutcome, ReserveOutcome, ShipOutcome } from './boundary/fulfil.ffi.js';
import { drive, type Effects } from './effects/fulfil.drive.js';
import { defect } from '../../src/sealed.js';
import type { Variant } from '../../src/variant.js';

const order: Order = {
  id: 'o-1',
  lines: [
    { sku: 'A', qty: 2 },
    { sku: 'B', qty: 1 },
  ],
  total: 3000,
  to: { name: 'R', lines: ['1 Main St', 'Suite 4'], country: 'US' },
};

const allocations: ReadonlyArray<Allocation> = [
  { line: { sku: 'A', qty: 2 }, from: { kind: 'warehouse', code: 'W1' } },
  { line: { sku: 'B', qty: 1 }, from: { kind: 'dropship', vendor: 'V9' } },
];

type Script = {
  readonly reserve: Variant<ReserveOutcome>;
  readonly charge: Variant<ChargeOutcome>;
  readonly ship: Variant<ShipOutcome>;
  readonly release: Variant<ReleaseOutcome>;
};

const happy: Script = {
  reserve: { kind: 'reserved', hold: { orderId: 'o-1', holdId: 'h-1' }, allocations },
  charge: { kind: 'charged', amount: 3000 },
  ship: { kind: 'shipped', tracking: 'T-1' },
  release: { kind: 'released' },
};

const scripted = (overrides: Partial<Script>) => {
  const script = { ...happy, ...overrides };
  const answer = <T>(outcome: T) => async (): Promise<T> => outcome;
  const fx: Effects = { reserve: answer(script.reserve), charge: answer(script.charge), ship: answer(script.ship), release: answer(script.release) };
  return async () => {
    const run = await drive(fx)(order);
    if (run.kind !== 'finished') throw new Error(`the attempt halted: ${run.error.message}`);
    assert.deepEqual(run.outstanding, []); // the hold was spent on this path
    return { status: run.status, commands: run.ledger.map((e) => e.kind), ledger: run.ledger };
  };
};

test('an order in stock is reserved, charged and shipped; the nested values round trip exactly', async () => {
  const run = await scripted({})();
  assert.deepEqual(run.status, { kind: 'fulfilled', tracking: 'T-1', allocations });
  assert.deepEqual(run.commands, ['reserve', 'charge', 'ship']);
  const [reserve, charge, ship] = run.ledger;
  assert.deepEqual(reserve, { kind: 'reserve', id: 'o-1', lines: order.lines, outcome: happy.reserve });
  assert.deepEqual(charge, { kind: 'charge', id: 'o-1', amount: 3000, outcome: happy.charge });
  assert.deepEqual(ship, { kind: 'ship', hold: { orderId: 'o-1', holdId: 'h-1' }, to: order.to, outcome: happy.ship });
  if (ship?.kind !== 'ship') throw new Error('unreached');
  assert.ok(Object.isFrozen(ship.to.lines)); // a vector that crossed out is frozen
  assert.ok(Object.isFrozen(ship.hold));
});

test('a short reservation is a backorder naming what is missing; no hold is issued', async () => {
  const run = await scripted({ reserve: { kind: 'short', missing: [{ sku: 'B', qty: 1 }] } })();
  assert.deepEqual(run.status, { kind: 'backordered', missing: [{ sku: 'B', qty: 1 }] });
  assert.deepEqual(run.commands, ['reserve']);
});

test('a declined charge releases the hold and reports the reason', async () => {
  const run = await scripted({ charge: { kind: 'declined', reason: 'insufficient funds' } })();
  assert.deepEqual(run.status, { kind: 'payment_declined', reason: 'insufficient funds' });
  assert.deepEqual(run.commands, ['reserve', 'charge', 'release']);
});

test('a charge that died releases the hold and hands back the diagnostic', async () => {
  const run = await scripted({ charge: { kind: 'charge_died', diagnostic: 'gateway timeout' } })();
  assert.deepEqual(run.status, { kind: 'worker_died', diagnostic: 'gateway timeout' });
  assert.deepEqual(run.commands, ['reserve', 'charge', 'release']);
});

test('a release that died after a declined charge is a dead worker, with the hold spent', async () => {
  const run = await scripted({ charge: { kind: 'declined', reason: 'x' }, release: { kind: 'release_died', diagnostic: 'db down' } })();
  assert.deepEqual(run.status, { kind: 'worker_died', diagnostic: 'db down' });
});

test('a shipment that died is a dead worker, with the hold spent by the ship command', async () => {
  const run = await scripted({ ship: { kind: 'ship_died', diagnostic: 'carrier down' } })();
  assert.deepEqual(run.status, { kind: 'worker_died', diagnostic: 'carrier down' });
  assert.deepEqual(run.commands, ['reserve', 'charge', 'ship']);
});

test('an order the schema refuses halts before any command, naming the field', async () => {
  const fx: Effects = { reserve: async () => defect('unreached'), charge: async () => defect('unreached'), ship: async () => defect('unreached'), release: async () => defect('unreached') };
  const bad = { ...order, lines: [{ sku: 'A', qty: 1.5 }] } as unknown as Order;
  const run = await drive(fx)(bad);
  if (run.kind !== 'halted') throw new Error('the run must halt');
  assert.match(run.error.message, /o: lines\.0\.qty: /);
  assert.deepEqual(run.ledger, []);
});

test('a hold issued and then a performer throwing: the halt names the hold as outstanding', async () => {
  const fx: Effects = {
    reserve: async () => happy.reserve,
    charge: async () => defect('the gateway hung'),
    ship: async () => defect('unreached'),
    release: async () => defect('unreached'),
  };
  const run = await drive(fx)(order);
  if (run.kind !== 'halted') throw new Error('the run must halt');
  assert.equal(run.error.message, 'the gateway hung');
  assert.deepEqual(run.outstanding, [{ kind: 'hold_receipt', receipt: { orderId: 'o-1', holdId: 'h-1' } }]);
  assert.deepEqual(
    run.ledger.map((e) => e.kind),
    ['reserve'],
  );
});

// One sample per status, keyed by the status's kinds, so a case added in the
// core fails to compile here until it has a sample.
const every: { readonly [K in keyof OrderStatus]: Variant<OrderStatus, K> } = {
  fulfilled: { kind: 'fulfilled', tracking: 't', allocations: [] },
  backordered: { kind: 'backordered', missing: [] },
  payment_declined: { kind: 'payment_declined', reason: 'r' },
  worker_died: { kind: 'worker_died', diagnostic: 'd' },
};

test('every status has a sample', () => {
  assert.equal(Object.keys(every).length, 4);
});
