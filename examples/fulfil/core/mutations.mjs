// Loosenings of the fulfilment core; each names the check that must refuse it.

export const config = 'examples/fulfil/core/koka.json';
export const copy = ['src', 'examples', 'test', 'scripts', 'tsconfig.json', 'eslint.config.js', 'eslint.examples.js'];
export const tests = ['examples/fulfil/drive.test.ts'];
export const lint = ['node_modules/.bin/eslint', '-c', 'eslint.examples.js', '--ignore-pattern', '**/fixtures/**', '--ignore-pattern', '**/.build/**', 'examples/fulfil'];
const edit = (file, from, to) => ({ file, from, to });
const core = 'examples/fulfil/core/fulfil.kk';

export const mutations = [
  ['ship without a hold', 'compile', edit(core, '  match ship(hold, to)', '  match ship(to, to)')],
  ['drop a case from the charge match', 'compile', edit(core, '    ChargeDied(d) -> let-go(hold, WorkerDied(d))\n', '')],
  ['add a status the shell has no sample of', 'typecheck', edit(core, '  WorkerDied(diagnostic: string)\n', '  WorkerDied(diagnostic: string)\n  Quarantined(reason: string)\n')],
  ['keep the hold on a dead charge', 'test', edit(core, '    ChargeDied(d) -> let-go(hold, WorkerDied(d))', '    ChargeDied(d) -> WorkerDied(d)')],
  ['release a hold that was shipped', 'test', edit(core, '    Shipped(tracking) -> Fulfilled(tracking, allocations)', '    Shipped(tracking) -> let-go(hold, Fulfilled(tracking, allocations))')],
  ['hand on a copy of the hold', 'test', edit(core, '    Charged(_) -> dispatch(hold, o.to, allocations)', '    Charged(_) -> dispatch(hold(hold-id = "forged"), o.to, allocations)')],
];
