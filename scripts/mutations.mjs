// Gate checks. Each mutation loosens one guarantee in a copy of the tree and
// the build is required to fail at a line in the gates file that guards it.
// A gate that holds while its guarantee is gone is a gate that proves
// nothing; this is where that would show.
//
//   node scripts/mutations.mjs <list.mjs>... [--tsconfig tsconfig.json]
//
// A list file exports `gates` (the typetest file that must fail), `copy`
// (the directories to copy into the scratch tree), and `mutations`. The
// library's list is src/gates.mutations.mjs; an application keeps its own
// beside its gates.

import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const tsconfigAt = args.indexOf('--tsconfig');
const tsconfig = tsconfigAt === -1 ? 'tsconfig.json' : args[tsconfigAt + 1];
const lists = args.filter((a, i) => tsconfigAt === -1 || (i !== tsconfigAt && i !== tsconfigAt + 1));
if (lists.length === 0) {
  console.log('usage: node scripts/mutations.mjs <list.mjs>... [--tsconfig tsconfig.json]');
  process.exit(2);
}

const root = process.cwd();
let held = 0;
let total = 0;

for (const listPath of lists) {
  const { gates, copy, mutations } = await import(pathToFileURL(resolve(listPath)).href);
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

    const gateLines = output.split('\n').filter((line) => line.startsWith(`${gates}(`));
    const ok = gateLines.length > 0;
    held += ok ? 1 : 0;
    console.log(`${ok ? '✓' : '✗'} ${name}${ok ? `: ${gateLines[0].replace(/: error .*/, '')}` : ` (the build passed, or failed elsewhere; ${gates} holds nothing against this)`}`);
  }
}

console.log(`${held}/${total} gates hold`);
process.exit(held === total ? 0 : 1);
