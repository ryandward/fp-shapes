// Loosenings of the ingest core's guarantees; each names the check that must
// refuse it. See scripts/koka-mutations.mjs.

export const config = 'examples/ingest/core/koka.json';
export const copy = ['src', 'examples', 'test', 'scripts', 'tsconfig.json', 'eslint.config.js', 'eslint.examples.js'];
export const tests = ['examples/ingest/drive.test.ts', 'examples/ingest/ffi.test.ts'];
export const lint = ['node_modules/.bin/eslint', '-c', 'eslint.examples.js', '--ignore-pattern', '**/fixtures/**', '--ignore-pattern', '**/.build/**', 'examples/ingest'];
const edit = (file, from, to) => ({ file, from, to });
const core = 'examples/ingest/core/ingest.kk';

export const mutations = [
  // the compiler: the row, the matches, the shapes
  ['drop a case from a match', 'compile', edit(core, '    FenceRevoked -> ClaimRevoked\n', '')],
  ['print from the core', 'compile', edit(core, 'fun abandon(file-id: string): shell ingest-status\n  match', 'fun abandon(file-id: string): shell ingest-status\n  println("abandon")\n  match')],
  ['recurse', 'compile', edit(core, '    TargetDied(d) -> WorkerDied(d)', '    TargetDied(d) -> ingest(file-id)')],
  ['settle with the fence receipt', 'compile', edit(core, '    Held(f) -> finalize-stage(c, f, bytes)', '    Held(f) -> settle-stage(c, f, bytes)')],
  ['mint a claim in the core', 'compile', edit(core, '    ClaimDied(d) -> WorkerDied(d)', '    ClaimDied(d) -> transfer-stage(Claim(file-id, d), uri, dest-key)')],
  ['read inside a receipt', 'compile', edit(core, '    Held(f) -> finalize-stage(c, f, bytes)', '    Held(f) -> finalize-stage(c, f, f.bytes)')],
  ['build a status with a field it lacks', 'compile', edit(core, '    SettleDone -> Succeeded(bytes)', '    SettleDone -> Succeeded(bytes, "extra")')],
  ['throw instead of returning a case', 'compile', edit(core, '    MarkDied(d) -> WorkerDied(d)', '    MarkDied(d) -> throw(d)')],
  // the gate: doors the compiler leaves open under a total row
  ['import the unsafe module', 'gate', edit(core, 'import evidence\n', 'import evidence\nimport std/core/unsafe\n')],
  ['assert a row with unsafe-total', 'gate', edit(core, '    Gone -> RowGone', '    Gone -> unsafe-total { RowGone }')],
  ['pretend a recursion decreases', 'gate', edit(core, '    TargetDied(d) -> WorkerDied(d)', '    TargetDied(d) -> pretend-decreasing(ingest(file-id))')],
  ['call foreign code', 'gate', edit(core, 'pub fun ingest(file-id: string)', 'extern js-anything(x: int): total int\n  js inline "(#1)"\npub fun ingest(file-id: string)')],
  ['answer an operation inside the core', 'gate', edit(core, 'pub fun ingest(file-id: string): shell ingest-status\n  match target(file-id)', 'pub fun ingest(file-id: string): shell ingest-status\n  with handler\n    ctl claim(id) resume(ClaimDied("forged"))\n  match target(file-id)')],
  ['keep local state', 'gate', edit(core, 'fun abandon(file-id: string): shell ingest-status\n  match', 'fun abandon(file-id: string): shell ingest-status\n  var n := 0\n  match')],
  ['trace from the core', 'gate', edit(core, 'fun abandon(file-id: string): shell ingest-status\n  match', 'fun abandon(file-id: string): shell ingest-status\n  trace("abandon")\n  match')],
  // the typecheck: the shell says what every case means
  ['add a cause the foreign vocabulary lacks', 'typecheck', edit(core, '  NeverStarted\n', '  NeverStarted\n  Quarantined(diagnostic: string)\n')],
  ['add a status the shell does not report', 'typecheck', edit(core, '  Stranded(cause: definitive)\n', '  Stranded(cause: definitive)\n  Quarantined(diagnostic: string)\n')],
  // the lint: the shell reaches the core only through the generated FFI
  ['import the compiled core from shell-side domain code', 'lint', edit('examples/ingest/report.ts', "import { fold, type Variant } from '../../src/variant.js';", "import { fold, type Variant } from '../../src/variant.js';\nimport { RowGone } from './core/.build/ingest.js';\nexport const gone = RowGone;")],
  ['import the compiled bridge from an effects module', 'lint', edit('examples/ingest/effects/run.ts', "import { adapt } from './adapt.js';", "import { adapt } from './adapt.js';\nimport { start } from '../core/.build/ingest__bridge.js';\nexport const raw = start;")],
  // the tests: what the FFI keeps at runtime
  ['spend a receipt twice', 'test', edit(core, '    Finalized(z) -> settle-stage(c, z, bytes)', '    Finalized(z) -> match finalize(f) { Finalized(z2) -> settle-stage(c, z2, bytes); Rejected(cause) -> record(c, cause); FinalizeDied(d) -> WorkerDied(d) }')],
  ['hand on a copy of a receipt', 'test', edit(core, '    Held(f) -> finalize-stage(c, f, bytes)', '    Held(f) -> finalize-stage(c, f(bytes = 0), bytes)')],
  ['drop a receipt', 'test', edit(core, '    Held(f) -> finalize-stage(c, f, bytes)', '    Held(f) -> Succeeded(bytes)')],
];
