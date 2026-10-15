// Gate checks for a Koka core. Each mutation loosens one guarantee in a copy
// of the tree and says which check must refuse it: the gate (a token the
// core may not use), the compiler (a row, a match, a shape), the typecheck
// (a gate in a *.typetest.ts over the regenerated surface), or the tests (a
// guarantee the FFI keeps at runtime, such as a receipt's identity or its
// single spend). A mutation that is refused anywhere else, or nowhere, is
// reported as such: a check that holds while its guarantee is gone proves
// nothing, and this is where that would show.
//
//   node scripts/koka-mutations.mjs <list.mjs>... [--tsconfig tsconfig.json]
//
// A list file exports `config` (the koka.json of the core, relative to the
// working directory), `copy` (the directories and files to copy into the
// scratch tree), `tests` (the test files to run), `runner` (optional: the
// command that runs them, relative to the working directory, default
// `node_modules/.bin/tsx --test`), and `mutations`: [name, expected,
// ...edits], expected one of 'gate', 'compile', 'typecheck', 'test', each
// edit { file, from, to }. `--tsconfig` names the config the typecheck
// uses inside the scratch tree, as scripts/mutations.mjs takes it.

import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findKoka } from './koka-build.mjs';

const args = process.argv.slice(2);
const tsconfigAt = args.indexOf('--tsconfig');
const tsconfig = tsconfigAt === -1 ? 'tsconfig.json' : args[tsconfigAt + 1];
const lists = args.filter((_, i) => tsconfigAt === -1 || (i !== tsconfigAt && i !== tsconfigAt + 1));
if (lists.length === 0) {
  console.log('usage: node scripts/koka-mutations.mjs <list.mjs>... [--tsconfig tsconfig.json]');
  process.exit(2);
}

const root = process.cwd();
const scripts = dirname(new URL(import.meta.url).pathname);
let held = 0;
let total = 0;

// Which check refused the mutated tree: the first of gate, compile, typecheck, lint, test.
const refusedBy = (dir, config, tests, runner, lint) => {
  const built = spawnSync(process.execPath, [join(scripts, 'koka-build.mjs'), config], { cwd: dir, encoding: 'utf8', env: process.env });
  if (built.status !== 0) {
    const said = `${built.stdout}${built.stderr}`;
    return /Error: gate:/.test(said) ? 'gate' : /Error: compile:/.test(said) ? 'compile' : `build (${said.split('\n').find((l) => /Error/.test(l)) ?? 'unknown'})`;
  }
  const typed = spawnSync(join(root, 'node_modules', '.bin', 'tsc'), ['-p', tsconfig], { cwd: dir, encoding: 'utf8' });
  if (typed.status !== 0) return 'typecheck';
  if (lint !== undefined) {
    const [linter, ...lintFlags] = lint;
    const linted = spawnSync(join(root, linter), lintFlags, { cwd: dir, encoding: 'utf8' });
    if (linted.status !== 0) return 'lint';
  }
  const [command, ...flags] = runner;
  const tested = spawnSync(join(root, command), [...flags, ...tests], { cwd: dir, encoding: 'utf8' });
  if (tested.status !== 0) return 'test';
  return 'nothing';
};

for (const listPath of lists) {
  const list = await import(pathToFileURL(resolve(listPath)).href);
  const pinned = JSON.parse(readFileSync(list.config, 'utf8')).koka;
  process.env.KOKA = findKoka(pinned, root); // the scratch tree has no .koka-prefix of its own
  console.log(`${listPath}: ${list.mutations.length} mutations against ${list.config}`);
  for (const [name, expected, ...edits] of list.mutations) {
    total += 1;
    const dir = mkdtempSync(join(tmpdir(), 'fp-shapes-koka-mutation-'));
    for (const part of list.copy) cpSync(join(root, part), join(dir, part), { recursive: true });
    symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'));
    for (const { file, from, to } of edits) {
      const path = join(dir, file);
      chmodSync(path, 0o644);
      const source = readFileSync(path, 'utf8');
      const mutated = source.replace(from, to);
      if (mutated === source) throw new Error(`${name}: the edit to ${file} found nothing to change; the mutation needs updating`);
      writeFileSync(path, mutated);
    }
    const by = refusedBy(dir, list.config, list.tests, list.runner ?? ['node_modules/.bin/tsx', '--test'], list.lint);
    rmSync(dir, { recursive: true, force: true });
    const ok = by === expected;
    held += ok ? 1 : 0;
    console.log(`${ok ? '✓' : '✗'} ${name}: refused by the ${by}${ok ? '' : ` (the list expects the ${expected})`}`);
  }
}

console.log(`${held}/${total} koka gates hold`);
process.exit(held === total ? 0 : 1);
