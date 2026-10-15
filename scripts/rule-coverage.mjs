// Rule coverage. Every lint rule (a selector, a restricted global, a restricted
// import pattern) must be the rule that makes some fixture fail: a fixture
// expecting a message proves the rule whose message it is, and only when no
// other rule produces that message for the same file. A rule no fixture
// needs is a rule the fixtures do not verify, and this exits non-zero on it,
// so a rule cannot be added without the fixture that proves it fires.
//
//   node scripts/rule-coverage.mjs
//
// One lint pass: each rule's message is tagged with the rule's index, so the
// fixtures' reports say which rule produced each message.

import { ESLint } from 'eslint';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import base from '../eslint.config.js';

const sets = ['fixtures/rules', 'fixtures/rules/boundary', 'fixtures/rules/effects'];

const fixtures = (
  await Promise.all(
    sets.map(async (dir) =>
      Promise.all(
        (await readdir(dir))
          .filter((f) => f.endsWith('.ts'))
          .map(async (f) => {
            const file = join(dir, f);
            const header = (await readFile(file, 'utf8')).match(/^\/\/ expect: (.+)$/m);
            return { file: resolve(file), expect: header ? header[1].trim() : null };
          }),
      ),
    ),
  )
).flat();

// Tag every rule's message with an index, remembering what the index names.
const names = [];
const tag = (name, message) => {
  names.push(name);
  return `${message} ⟨${names.length - 1}⟩`;
};
const seen = new Map(); // the same rule object appears in several tiers; one index each
const tagged = (key, name, message) => {
  if (!seen.has(key)) seen.set(key, tag(name, message));
  return seen.get(key);
};
const config = base.map((entry) => {
  if (!entry.rules) return entry;
  const rules = { ...entry.rules };
  for (const [rule, setting] of Object.entries(rules)) {
    if (!Array.isArray(setting)) continue;
    if (rule === 'no-restricted-syntax') {
      rules[rule] = setting.map((r) => (typeof r === 'string' ? r : { selector: r.selector, message: tagged(`s:${r.selector}`, r.selector, r.message) }));
    }
    if (rule === 'no-restricted-globals') {
      rules[rule] = setting.map((r) => (typeof r === 'string' ? r : { name: r.name, message: tagged(`g:${r.name}`, `global ${r.name}`, r.message) }));
    }
    if (rule === 'no-restricted-imports') {
      rules[rule] = [
        setting[0],
        {
          patterns: setting[1].patterns.map((p) => {
            const key = `i:${JSON.stringify(p.group ?? p.regex)}:${p.importNamePattern ?? ''}`;
            return { ...p, message: tagged(key, `import ${JSON.stringify(p.group ?? p.regex)}${p.importNamePattern ? ` ${p.importNamePattern}` : ''}`, p.message) };
          }),
        },
      ];
    }
  }
  return { ...entry, rules };
});

const eslint = new ESLint({ ignore: false, overrideConfigFile: true, overrideConfig: config });
const results = await eslint.lintFiles(fixtures.map((f) => f.file));
const byFile = new Map(results.map((r) => [r.filePath, r.messages.filter((m) => m.severity === 2).map((m) => m.message)]));

const provedBy = new Map(names.map((_, i) => [i, []]));
let short = 0;
for (const fixture of fixtures) {
  const messages = byFile.get(fixture.file) ?? [];
  if (fixture.expect === null) {
    console.log(`✗ ${fixture.file}: needs a "// expect:" header`);
    short += 1;
    continue;
  }
  if (fixture.expect === 'clean') {
    if (messages.length > 0) {
      console.log(`✗ ${fixture.file}: expected clean, saw ${messages.join(' / ')}`);
      short += 1;
    }
    continue;
  }
  const matching = messages.filter((m) => m.includes(fixture.expect));
  if (matching.length === 0) {
    console.log(`✗ ${fixture.file}: no rule reports "${fixture.expect}"`);
    short += 1;
    continue;
  }
  // A message without a tag comes from a plugin rule (no-use-before-define, ban-ts-comment); the
  // fixture verifies it, and there is no rule of ours to prove.
  const producers = new Set(matching.map((m) => m.match(/⟨(\d+)⟩$/)).filter((m) => m !== null).map((m) => Number(m[1])));
  if (producers.size === 1) provedBy.get([...producers][0]).push(fixture.file.slice(process.cwd().length + 1));
}

let unproved = 0;
for (const [i, name] of names.entries()) {
  const files = provedBy.get(i);
  if (files.length === 0) {
    unproved += 1;
    console.log(`✗ ${name}: no fixture needs this rule`);
  } else {
    console.log(`✓ ${name.slice(0, 80)} ← ${files[0]}${files.length > 1 ? ` (+${files.length - 1})` : ''}`);
  }
}
console.log(`${names.length - unproved}/${names.length} rules proved by a fixture`);
process.exit(unproved === 0 && short === 0 ? 0 : 1);
