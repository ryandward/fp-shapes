// expect: a gate asserts a declared type as it is
import type { Assert, Total } from '../../src/total.js';
type Loop = { readonly next: Loop | null };
export type _bounded = Assert<Total<Omit<Loop, 'next'>>>;
