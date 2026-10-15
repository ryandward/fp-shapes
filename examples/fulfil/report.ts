// What to say about a status: one fold, so a case added to the status fails
// to compile here until this file says what it means.

import { fold, type Variant } from '../../src/variant.js';
import type { OrderStatus } from './plane.js';

export type Report = { readonly action: string; readonly detail: string };

export const report: (status: Variant<OrderStatus>) => Report = fold<OrderStatus, Report>({
  fulfilled: ({ tracking, allocations }) => ({ action: 'fulfilled', detail: `${tracking}, ${allocations.length} allocations` }),
  backordered: ({ missing }) => ({ action: 'backordered', detail: missing.map((line) => `${line.sku}×${line.qty}`).join(', ') }),
  payment_declined: ({ reason }) => ({ action: 'payment_declined', detail: reason }),
  worker_died: ({ diagnostic }) => ({ action: 'attempt_failed', detail: diagnostic }),
});
