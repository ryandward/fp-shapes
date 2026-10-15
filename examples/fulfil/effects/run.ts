// The entry point: a parsed order is driven through the adapters. One log
// line per run from a fold over the status; a halted run (a performer threw,
// or a hold was spent twice) is logged and rethrown so the caller sees the
// attempt fail. The order is parsed by whoever calls this, in a boundary
// module; an effects module takes facts.

import { drive, type Entry } from '../../../src/command.js';
import type { Variant } from '../../../src/variant.js';
import { fulfil } from '../fulfil.js';
import type { Fulfilment, Order, OrderStatus } from '../plane.js';
import { report } from '../report.js';
import { adapt } from './adapt.js';
import type { Foreign } from './foreign.js';

export type Finished = { readonly status: Variant<OrderStatus>; readonly ledger: ReadonlyArray<Entry<Fulfilment>> };

export const fulfilOrder =
  (foreign: Foreign) =>
  (order: Order): Promise<Finished> =>
    drive(adapt(foreign), fulfil(order)).then((run) => {
      if (run.kind === 'halted') {
        foreign.log(JSON.stringify({ action: 'halted', diagnostic: run.error.message, commands: run.ledger.length }));
        throw run.error;
      }
      const { action, detail } = report(run.status);
      foreign.log(JSON.stringify({ action, detail, commands: run.ledger.length }));
      return { status: run.status, ledger: run.ledger };
    });
