// Gate checks. Each mutation loosens one guarantee in a copy of the tree and
// the build is required to fail at a line in the gates file that guards it.
// A gate that holds while its guarantee is gone is a gate that proves
// nothing; this is where that would show.
//
//   node scripts/mutations.mjs <list.mjs>... [--tsconfig tsconfig.json] [--map src=lib/fp]
//
// A list file exports `gates` (the typetest file that must fail, or a list of
// files one of which must), `copy`
// (the directories to copy into the scratch tree), and `mutations`. The
// scratch tree holds those directories, the tsconfig, and a link to
// node_modules, nothing else: a list names every directory its program reads,
// and the tsconfig stands alone (one that `extends` a file outside the copied
// directories names a file the scratch tree lacks). The library's list is
// src/gates.mutations.mjs; an application keeps its own beside its gates.
// `--map from=to` rewrites that path prefix in every path a list names, so a
// vendored copy of the library runs the library's own list against wherever
// it was vendored.

import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};
const tsconfig = option('--tsconfig', 'tsconfig.json');
const [mapFrom, mapTo] = option('--map', '=').split('=');
const taken = new Set(['--tsconfig', '--map'].flatMap((name) => {
  const at = args.indexOf(name);
  return at === -1 ? [] : [at, at + 1];
}));
const lists = args.filter((_, i) => !taken.has(i));
const mapped = (path) => (mapFrom !== '' && path.startsWith(mapFrom) ? mapTo + path.slice(mapFrom.length) : path);
if (lists.length === 0) {
  console.log('usage: node scripts/mutations.mjs <list.mjs>... [--tsconfig tsconfig.json] [--map src=lib/fp]');
  process.exit(2);
}

const root = process.cwd();
let held = 0;
let total = 0;

for (const listPath of lists) {
  const list = await import(pathToFileURL(resolve(listPath)).href);
  const gates = Array.isArray(list.gates) ? list.gates.map(mapped) : mapped(list.gates);
  const copy = list.copy.map(mapped);
  const mutations = list.mutations.map(([name, ...edits]) => [name, ...edits.map((e) => ({ ...e, file: mapped(e.file) }))]);
  console.log(`${listPath}: ${mutations.length} mutations against ${gates}`);
  for (const [name, ...edits] of mutations) {
    total += 1;
    const dir = mkdtempSync(join(tmpdir(), 'fp-shapes-mutation-'));
    for (const part of copy) cpSync(join(root, part), join(dir, part), { recursive: true });
    cpSync(join(root, tsconfig), join(dir, tsconfig));
    symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'));

    for (const { file, from, to } of edits) {
      const path = join(dir, file);
      chmodSync(path, 0o644); // the copy keeps the source's mode; a read-only checkout is still mutable here
      const source = readFileSync(path, 'utf8');
      const mutated = source.replace(from, to);
      if (mutated === source) throw new Error(`${name}: the edit to ${file} found nothing to change; the mutation needs updating`);
      writeFileSync(path, mutated);
    }

    let output = '';
    try {
      execFileSync(join(root, 'node_modules', '.bin', 'tsc'), ['-p', tsconfig], { cwd: dir, encoding: 'utf8' });
    } catch (error) {
      output = error.stdout ?? '';
    }
    rmSync(dir, { recursive: true, force: true });

    const gateLines = output.split('\n').filter((line) => (Array.isArray(gates) ? gates : [gates]).some((g) => line.startsWith(`${g}(`)));
    const ok = gateLines.length > 0;
    held += ok ? 1 : 0;
    console.log(`${ok ? '✓' : '✗'} ${name}${ok ? `: ${gateLines[0].replace(/: error .*/, '')}` : ` (the build passed, or failed elsewhere; ${gates} holds nothing against this)`}`);
  }
}

console.log(`${held}/${total} gates hold`);
process.exit(held === total ? 0 : 1);
