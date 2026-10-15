// Builds a Koka core into the shell's build directory, in order:
//
//   1. the gate over the core's import closure (scripts/koka-gate.mjs)
//   2. the core compiled as a library (JavaScript backend, -O2)
//   3. the bridge generated from the interface files and compiled
//   4. the compiled modules renamed .mjs → .js (the shell's imports name
//      their file as .js), and the surface written: .d.ts per module, the
//      FFI boundary module and the interpreter (scripts/koka-gen.mjs)
//
//   node scripts/koka-build.mjs <koka.json>...
//
// koka.json, beside the core:
//   { "koka": "3.2.9", "core": "ingest", "entry": "ingest", "modules": ["evidence", "ingest"],
//     "build": ".build", "ffi": "../boundary/ingest.ffi.ts", "drive": "../effects/ingest.drive.ts", "lib": "../../../src" }
//
// The compiler is $KOKA, else .koka-prefix/bin/koka under the working
// directory (scripts/koka-install.sh puts it there), else `koka` on the PATH;
// its version is the one the config pins, and nothing else runs. A refusal at
// the gate fails with a message beginning `gate:`, a compiler error with one
// beginning `compile:`, so a mutation run can tell which held.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { gate } from './koka-gate.mjs';
import { generate } from './koka-gen.mjs';

const env = { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' };

export const findKoka = (pinned, root = process.cwd()) => {
  const candidates = [process.env.KOKA, join(root, '.koka-prefix', 'bin', 'koka'), 'koka'].filter((c) => c !== undefined && c !== '');
  for (const candidate of candidates) {
    try {
      const version = execFileSync(candidate, ['--version'], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'ignore'] });
      const found = /Koka (\S+),/.exec(version);
      if (found === null) continue;
      if (found[1] !== pinned) throw new Error(`koka ${found[1]} at ${candidate}; the core is built with ${pinned} and nothing else (scripts/koka-install.sh installs it)`);
      return candidate;
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
  }
  throw new Error(`no koka compiler: set KOKA, or run scripts/koka-install.sh to put ${pinned} under .koka-prefix/`);
};

const compile = (koka, includes, outputdir, file) => {
  try {
    execFileSync(koka, ['--target=jsnode', '-l', '-O2', `--include=${includes.join(';')}`, `--outputdir=${outputdir}`, file], {
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const said = `${error.stdout ?? ''}${error.stderr ?? ''}`
      .split('\n')
      .filter((line) => /error|warning/.test(line))
      .join('\n');
    throw new Error(`compile: ${file}\n${said}`);
  }
};

export const build = (configPath) => {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const dir = dirname(resolve(configPath));
  const out = resolve(dir, config.build);
  const koka = findKoka(config.koka);

  const refused = gate(configPath);
  if (refused.length > 0) throw new Error(`gate: ${config.core}\n${refused.map((r) => `${r.file}:${r.line}: ${r.token}: ${r.reason}`).join('\n')}`);

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  compile(koka, [dir], out, join(dir, `${config.core}.kk`));
  const { bridge } = generate(configPath, 'bridge');
  compile(koka, [dir, out], out, join(out, `${bridge}.kk`));

  for (const f of readdirSync(out)) {
    if (!f.endsWith('.mjs')) continue;
    const text = readFileSync(join(out, f), 'utf8').replace(/from '\.\/([^']+)\.mjs'/g, "from './$1.js'");
    writeFileSync(join(out, f), text);
    renameSync(join(out, f), join(out, f.replace(/\.mjs$/, '.js')));
  }
  const written = generate(configPath, 'shell');
  return { core: config.core, build: config.build, ...written };
};

if (process.argv[1] !== undefined && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const configs = process.argv.slice(2);
  if (configs.length === 0) {
    console.log('usage: node scripts/koka-build.mjs <koka.json>...');
    process.exit(2);
  }
  for (const c of configs) {
    if (!existsSync(c)) throw new Error(`${c}: no such config`);
    const result = build(c);
    console.log(`${result.core}: built into ${result.build}; ${result.ffi} and ${result.drive} written`);
  }
}
