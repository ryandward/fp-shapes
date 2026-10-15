// Loosenings of the fulfilment example's guarantees; the build must refuse
// each at a line of one of the files named in `gates`. The domain's own
// mutations (a hold dropped, spent twice, spent before it is issued) are
// refused in the domain file itself, by the kernel's step type.

export const gates = ['examples/fulfil/gates.typetest.ts', 'examples/fulfil/fulfil.ts'];
export const copy = ['src', 'examples', 'test'];
const edit = (file, from, to) => ({ file, from, to });
const domain = 'examples/fulfil/fulfil.ts';

export const mutations = [
  ['export the hold authority', edit('examples/fulfil/effects/adapt.ts', 'const HOLD: unique symbol', 'export const HOLD: unique symbol')],
  ['drop the hold on a dead charge', edit(domain, "    charge_died: ({ diagnostic }) => letGo(hold, { kind: 'worker_died', diagnostic }),", '    charge_died: ({ diagnostic }) => died(diagnostic),')],
  ['release a hold that was shipped', edit(domain, "    shipped: ({ tracking }) => done({ kind: 'fulfilled', tracking, allocations }),", "    shipped: ({ tracking }) => letGo(hold, { kind: 'fulfilled', tracking, allocations }),")],
  ['ship before anything is reserved', edit(domain, "export const fulfil = (o: Order): Next<{}> =>\n  suspend('reserve', { id: o.id, lines: o.lines }, {", "export const fulfil = (o: Order, hold: Hold): Next<{}> =>\n  suspend('ship', { hold, to: o.to }, { shipped: () => died('x'), ship_died: () => died('y') }) ?? suspend('reserve', { id: o.id, lines: o.lines }, {")],
  ['make a status field mutable', edit('examples/fulfil/plane.ts', 'payment_declined: { readonly reason: string };', 'payment_declined: { reason: string };')],
];
