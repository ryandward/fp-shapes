// expect: clean
import { commands, type Step } from '../../src/command.js';
import type { Variant } from '../../src/variant.js';
type Token = { readonly id: string };
type Gate = {
  readonly open: { readonly args: {}; readonly outcome: { opened: { readonly token: Token }; shut: {} }; readonly issues: { readonly opened: 'token' }; readonly spends: never };
  readonly close: { readonly args: { readonly token: Token }; readonly outcome: { closed: {} }; readonly issues: {}; readonly spends: 'token' };
};
type Status = { over: {} };
const { done, suspend } = commands<Gate, Variant<Status>>();
type Next<O> = Step<Gate, Variant<Status>, O>;
const over: Variant<Status> = { kind: 'over' };
const shut = (token: Token): Next<{ token: true }> => suspend('close', { token }, { closed: () => done(over) });
export const whole = (): Next<{}> => suspend('open', {}, { opened: ({ token }) => shut(token), shut: () => done(over) });
