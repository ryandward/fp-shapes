// The pure check: good code passes, and each file under pure/bad is refused
// with the message its first line expects. (Other layers may refuse it too.)

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { check } from '../pure/check.mjs';

const project = resolve('test/pure/tsconfig.json');
const good = readdirSync('test/pure/good').map((f) => resolve('test/pure/good', f));
const bad = readdirSync('test/pure/bad').filter((f) => f.endsWith('.ts')).sort();

test('good pure code passes', () => {
  assert.deepEqual(check({ project, files: good }).map((p) => `${p.file}:${p.line} ${p.message}`), []);
});

for (const name of bad) {
  test(`refused: ${name}`, () => {
    const file = join('test/pure/bad', name);
    const expected = readFileSync(file, 'utf8').match(/^\/\/ expect: (.+)$/m)?.[1];
    assert.ok(expected, `${name} needs a "// expect:" first line`);
    const messages = check({ project, files: [resolve(file)] }).map((p) => p.message);
    assert.ok(messages.length > 0, `${name} was not refused`);
    assert.ok(messages.some((m) => m.includes(expected)), `${name}: expected "${expected}", got:\n  ${messages.join('\n  ')}`);
  });
}

test('the command exits 1 on bad code and 0 on good code, also through a symlink as npx runs it', async () => {
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync, symlinkSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'fp-shapes-'));
  const link = join(dir, 'fp-shapes-check');
  symlinkSync(resolve('pure/check.mjs'), link);
  const badProject = join(dir, 'tsconfig.json');
  writeFileSync(badProject, JSON.stringify({ extends: project, include: [resolve('test/pure/bad/if.ts')] }));
  const exitCode = (config: string): number => {
    try {
      execFileSync('node', [link, config], { stdio: 'pipe' });
      return 0;
    } catch (e) {
      return (e as { status: number }).status;
    }
  };
  assert.equal(exitCode(project), 0);
  assert.equal(exitCode(badProject), 1);
});
