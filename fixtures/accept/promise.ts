// expect: purity: a call that returns a Promise is an effect
import { commands, drive, type Effects, type Run } from '../../src/command.js';
import type { Variant } from '../../src/variant.js';
type Ops = { readonly ping: { readonly args: {}; readonly outcome: { pong: {} }; readonly issues: {}; readonly spends: never } };
const { done } = commands<Ops, string>();
export const go = (fx: Effects<Ops>): Promise<Variant<Run<Ops, string>>> => drive(fx, done('over'));
