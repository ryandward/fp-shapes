// An order enters as unknown and leaves as a fact: every line named, every
// quantity a positive integer, the address complete.

import { z } from 'zod';
import { boundary, type Boundary } from '../../../src/boundary/boundary.js';
import type { Order } from '../plane.js';

const line = z.strictObject({ sku: z.string().min(1), qty: z.int().positive() }).readonly();
const address = z.strictObject({ name: z.string().min(1), lines: z.array(z.string()).readonly(), country: z.string().length(2) }).readonly();
const order = z.strictObject({ id: z.string().min(1), lines: z.array(line).readonly(), total: z.int().nonnegative(), to: address }).readonly();

export const parseOrder: Boundary<Order> = boundary(order);
