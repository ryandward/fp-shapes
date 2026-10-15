// Gates for the fulfilment example. See src/gates.typetest.ts for how a gate
// works. The linearity of the hold is the kernel's and is gated there; what
// these pin is this plane's own discipline.

import { Sealed } from '../../src/sealed.js';
import type { Assert, Immutable, Total } from '../../src/total.js';
import type { Variant } from '../../src/variant.js';
import type { Hold, Order, OrderStatus } from './plane.js';

// --- the hold's authority stays private to effects/adapt.ts -----------------

// @ts-expect-error HOLD stays private to effects/adapt.ts
import { HOLD } from './effects/adapt.js';
export const authority: symbol = HOLD; // used, so the directive answers to its import alone

// @ts-expect-error a hold is minted by the adapter that reserves; a fresh symbol is not its authority
export const forged: Hold = new Sealed(Symbol('hold'), { orderId: 'o', holdId: 'h' }, 'spend');

declare const hold: Hold;
// @ts-expect-error a hold is read by the adapter that spends it, not by the domain
export const peeked = hold.value;

// --- facts and statuses are total and immutable -------------------------------

export type _orderTotal = Assert<Total<Order>>;
export type _orderImmutable = Assert<Immutable<Order>>;
export type _statusTotal = Assert<Total<Variant<OrderStatus>>>;
export type _statusImmutable = Assert<Immutable<Variant<OrderStatus>>>;
