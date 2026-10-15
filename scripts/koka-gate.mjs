// The gate on a Koka core. The compiler establishes the row (every effect
// named, exhaustive matches, no divergence) and the shapes (nominal
// constructors), but the language keeps a few doors open that compile under a
// `total` row: `extern` (foreign code), `unsafe-*` and `pretend-*` (a row
// asserted, not inferred), `trace` (a print without the console effect), and
// handlers, which would let a core answer its own operations instead of the
// shell. Local state (`var`, `ref`) is masked by the compiler and is refused
// here as mutation. Each is a whole token; this gate reads the core's import
// closure token by token, outside comments and strings, and refuses them by
// name. It is not a type checker: linearity is the ledger's at runtime and a
// linearity pass over the core is planned (SPEC §9).
//
//   node scripts/koka-gate.mjs <koka.json>              gate the core the config names
//   node scripts/koka-gate.mjs --fixtures <dir>         every .kk in <dir> says what it expects:
//                                                       `// refused: <token>` or `// accepted`

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// Standard modules the core may import: pure data and its combinators. The
// std/core prelude is always loaded and re-exports from these.
const allowedStd = new Set([
  'std/core',
  ...['types', 'bool', 'int', 'char', 'string', 'list', 'vector', 'maybe', 'maybe2', 'either', 'order', 'tuple', 'show', 'sslice', 'bslice', 'bytes', 'result'].map((m) => `std/core/${m}`),
]);

const reasons = [
  [/^extern$/, 'foreign code is the shell\'s; the core performs an operation and the shell answers it'],
  [/^unsafe-/, 'a row is inferred, not asserted'],
  [/^pretend-/, 'a row is inferred, not asserted'],
  [/^trace(-any|-info|-show|-enabled)?$/, 'a line is written by the shell; return the fact to log'],
  [/^(var|ref)$/, 'a changing value is a new value; the core holds no state'],
  [/^(handler|handle|with|mask|named|scoped|override|finally|initially)$/, 'the shell handles; a core that answers its own operations is a core without a shell'],
  [/^@/, 'a compiler-internal name is not written by hand'],
];

// Tokens outside comments and literals. Koka comments nest; strings take
// escapes; a raw string is r"…" or r#"…"#; a char literal is '…' where a
// quote does not continue an identifier.
export const tokens = (source) => {
  const out = [];
  let i = 0;
  let line = 1;
  const isIdent = (c) => /[A-Za-z0-9_\-@'/]/.test(c);
  while (i < source.length) {
    const c = source[i];
    if (c === '\n') {
      line += 1;
      i += 1;
    } else if (source.startsWith('//', i)) {
      while (i < source.length && source[i] !== '\n') i += 1;
    } else if (source.startsWith('/*', i)) {
      let depth = 0;
      do {
        if (source.startsWith('/*', i)) {
          depth += 1;
          i += 2;
        } else if (source.startsWith('*/', i)) {
          depth -= 1;
          i += 2;
        } else {
          if (source[i] === '\n') line += 1;
          i += 1;
        }
      } while (depth > 0 && i < source.length);
    } else if (c === 'r' && (source[i + 1] === '"' || (source[i + 1] === '#' && source[i + 2] === '"')) && (i === 0 || !isIdent(source[i - 1]))) {
      const hashes = source[i + 1] === '#' ? 1 : 0;
      const close = `"${'#'.repeat(hashes)}`;
      const end = source.indexOf(close, i + 2 + hashes);
      const stop = end === -1 ? source.length : end + close.length;
      line += source.slice(i, stop).split('\n').length - 1;
      i = stop;
    } else if (c === '"') {
      i += 1;
      while (i < source.length && source[i] !== '"') {
        if (source[i] === '\\') i += 1;
        if (source[i] === '\n') line += 1;
        i += 1;
      }
      i += 1;
    } else if (c === "'" && (i === 0 || !isIdent(source[i - 1]))) {
      i += 1;
      while (i < source.length && source[i] !== "'") {
        if (source[i] === '\\') i += 1;
        i += 1;
      }
      i += 1;
    } else if (isIdent(c)) {
      let j = i;
      while (j < source.length && isIdent(source[j])) j += 1;
      out.push({ text: source.slice(i, j), line });
      i = j;
    } else {
      i += 1;
    }
  }
  return out;
};

const imports = (toks) => toks.flatMap((t, i) => (t.text === 'import' && toks[i + 1] !== undefined ? [toks[i + 1]] : []));

// Refusals in one file, as { line, token, reason }.
export const refusals = (source) => {
  const toks = tokens(source);
  const found = [];
  for (const t of toks) {
    for (const [pattern, reason] of reasons) {
      if (pattern.test(t.text)) found.push({ line: t.line, token: t.text, reason });
    }
  }
  for (const imp of imports(toks)) {
    if (imp.text.startsWith('std/') && !allowedStd.has(imp.text)) found.push({ line: imp.line, token: imp.text, reason: 'a standard module outside the pure prelude is not imported by a core' });
  }
  return found;
};

// The import closure of the modules a config names, each gated.
export const gate = (configPath) => {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const dir = dirname(resolve(configPath));
  const seen = new Set();
  const queue = [...config.modules];
  const report = [];
  while (queue.length > 0) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    const file = join(dir, `${name}.kk`);
    if (!existsSync(file)) {
      report.push({ file, line: 0, token: name, reason: 'a module the core imports is not in the core directory; the closure is gated whole' });
      continue;
    }
    const source = readFileSync(file, 'utf8');
    for (const r of refusals(source)) report.push({ file, ...r });
    for (const imp of imports(tokens(source))) if (!imp.text.startsWith('std/')) queue.push(imp.text);
  }
  return report;
};

const fixtures = (dir) => {
  let failed = 0;
  const files = readdirSync(dir).filter((f) => f.endsWith('.kk')).sort();
  for (const f of files) {
    const path = join(dir, f);
    const source = readFileSync(path, 'utf8');
    const expect = /^\/\/ (refused: (\S+)|accepted)/.exec(source);
    if (expect === null) {
      console.log(`✗ ${f}: the first line says what the fixture expects: "// refused: <token>" or "// accepted"`);
      failed += 1;
      continue;
    }
    const found = refusals(source);
    const want = expect[2];
    const ok = want === undefined ? found.length === 0 : found.some((r) => r.token === want) && found.every((r) => r.token === want);
    failed += ok ? 0 : 1;
    const detail = found.map((r) => `${r.token} (line ${r.line})`).join(', ');
    console.log(`${ok ? '✓' : '✗'} ${f}: ${want === undefined ? 'accepted' : `refused ${want}`}${ok ? '' : ` — the gate found: ${detail === '' ? 'nothing' : detail}`}`);
  }
  console.log(`${files.length - failed}/${files.length} koka fixtures agree`);
  return failed === 0;
};

if (process.argv[1] !== undefined && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2);
  if (args[0] === '--fixtures') {
    process.exit(fixtures(args[1]) ? 0 : 1);
  }
  if (args[0] === undefined) {
    console.log('usage: node scripts/koka-gate.mjs <koka.json> | --fixtures <dir>');
    process.exit(2);
  }
  const report = gate(args[0]);
  for (const r of report) console.log(`${r.file}:${r.line}: ${r.token}: ${r.reason}`);
  console.log(report.length === 0 ? 'the core passes the gate' : `${report.length} refusal(s)`);
  process.exit(report.length === 0 ? 0 : 1);
}
