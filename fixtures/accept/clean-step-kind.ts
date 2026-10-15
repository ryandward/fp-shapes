// expect: clean
// A step is carried, and its kind read; nothing of it is called.
import { commands, type Step } from '../../src/command.js';
import type { Variant } from '../../src/variant.js';
type Ops = { readonly ping: { readonly args: {}; readonly outcome: { pong: {} }; readonly issues: {}; readonly spends: never } };
type Status = { over: {} };
const { done } = commands<Ops, Variant<Status>>();
export const named = (s: Step<Ops, Variant<Status>, {}>): string => s.kind;
export const made = (): string => named(done({ kind: 'over' }));
