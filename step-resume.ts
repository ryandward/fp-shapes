// expect: resume is the kernel's own
import { commands, type Step } from '../../src/command.js';
import type { Variant } from '../../src/variant.js';
type Ops = { readonly ping: { readonly args: {}; readonly outcome: { pong: {} }; readonly issues: {}; readonly spends: never } };
type Status = { over: {} };
const { done } = commands<Ops, Variant<Status>>();
export const poke = (s: Step<Ops, Variant<Status>, {}>): string => s.kind;
export const driven = (s: Step<Ops, Variant<Status>, {}>): string => `${done({ kind: 'over' }).kind}${s.kind}`;
