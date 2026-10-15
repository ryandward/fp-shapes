// Lint fixtures, one rule per file. Each fixture's first line is
// `// expect: <substring>`: the fixture passes when lint reports an error whose
// message contains it. `// expect: clean` marks a fixture that lint accepts as
// written. One file per rule means the check names the rule that stopped
// firing, rather than passing while any rule at all still fires.

import { ESLint } from 'eslint';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// node scripts/lint-fixtures.mjs [fixtures dir] [eslint config]
const dir = process.argv[2] ?? 'fixtures/rules';
const overrideConfigFile = process.argv[3];
const files = (await readdir(dir)).filter((f) => f.endsWith('.ts')).sort();
const results = await new ESLint({ ignore: false, ...(overrideConfigFile ? { overrideConfigFile } : {}) }).lintFiles(files.map((f) => join(dir, f)));

let short = 0;
for (const result of results) {
  const source = await readFile(result.filePath, 'utf8');
  const header = source.match(/^\/\/ expect: (.+)$/m);
  const name = result.filePath.slice(result.filePath.lastIndexOf('/') + 1);
  if (!header) {
    console.log(`✗ ${name}: needs a "// expect:" header`);
    short += 1;
    continue;
  }
  const expected = header[1].trim();
  const errors = result.messages.filter((m) => m.severity === 2);
  const ok = expected === 'clean' ? errors.length === 0 : errors.some((m) => m.message.includes(expected));
  console.log(`${ok ? '✓' : '✗'} ${name}: ${expected}`);
  if (!ok) {
    short += 1;
    for (const m of errors) console.log(`    saw: ${m.ruleId ?? 'parse'}: ${m.message}`);
  }
}

console.log(`${results.length - short}/${results.length} rules verified`);
process.exit(short === 0 ? 0 : 1);
