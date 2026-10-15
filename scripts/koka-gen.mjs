// The FFI generator. Reads the interface files (.kki) the Koka compiler wrote
// for a core and writes everything that stands between the core and the
// TypeScript shell, so that nothing hand-written touches a Koka value:
//
//   <core>-bridge.kk   a step type with one suspension per operation, each
//                      carrying that operation's arguments and a resumption
//                      that takes that operation's outcome and nothing else;
//                      `start`, which runs the core under the handler that
//                      suspends; and a fold per public type, the one way a
//                      Koka value is read
//   <module>.d.ts      the compiled module's surface: every type opaque
//                      (branded), every constructor and fold typed
//   <ffi>.ts           a boundary module: a schema per crossing type, the
//                      conversions in (parse, construct, freeze) and out
//                      (fold into a frozen Variant), receipts minted into a
//                      registry and read back by identity, steps resumed once
//   <drive>.ts         an effects module: the interpreter loop over the step
//                      Variant, performing each command through the Effects
//                      record and keeping the ledger
//
// The FFI carries string, int (a safe integer), bool, vector<T>, and the
// core's own structs, sums and abstract types; a type outside that set is
// refused by name, with what to use instead.
//
//   node scripts/koka-gen.mjs <koka.json>
//
// Run by scripts/koka-build.mjs between the two compilations.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

// ---------------------------------------------------------------- names

const stripLoc = (s) => s.replace(/\[[\d,]+\]/g, '');
const jsName = (name) => name.replace(/-/g, '_').replace(/@/g, '_');
// The compiler's file name for a module: `_` doubles, `-` becomes _dash_, `/` becomes `_`.
const fileName = (module) => module.replace(/_/g, '__').replace(/-/g, '_dash_').replace(/\//g, '_');
const camel = (name) => name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const pascal = (name) => name.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
const snakeOfCon = (con) => con.replace(/-/g, '_').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
const kebabOfCon = (con) => snakeOfCon(con).replace(/_/g, '-');
const reservedJs = new Set(['default', 'delete', 'new', 'class', 'function', 'return', 'var', 'let', 'const', 'in', 'of', 'this', 'null', 'true', 'false', 'void', 'typeof', 'with', 'yield', 'await', 'enum', 'export', 'import', 'super', 'switch', 'case', 'break', 'continue', 'do', 'while', 'for', 'if', 'else', 'try', 'catch', 'finally', 'throw', 'extends', 'static', 'instanceof']);

const refuse = (message) => {
  throw new Error(`koka-gen: ${message}`);
};

// ---------------------------------------------------------------- types

const tokenize = (text) => {
  const tokens = [];
  const re = /\s*(::|->|[()<>,]|[^\s()<>,:]+(?::(?!:)[^\s()<>,:]+)*)/y;
  let at = 0;
  while (at < text.length) {
    re.lastIndex = at;
    const m = re.exec(text);
    if (m === null) refuse(`cannot read the type text: ${text}`);
    tokens.push(m[1]);
    at = re.lastIndex;
    if (/^\s*$/.test(text.slice(at))) break;
  }
  return tokens;
};

const skipBalanced = (tokens, i) => {
  // tokens[i] is '(' ; return index after the matching ')'
  let depth = 0;
  for (let j = i; j < tokens.length; j += 1) {
    if (tokens[j] === '(') depth += 1;
    if (tokens[j] === ')') depth -= 1;
    if (depth === 0) return j + 1;
  }
  return refuse(`unbalanced parentheses in a type: ${tokens.join(' ')}`);
};

// A type expression as the .kki writes it, to the FFI's view of it.
const parseType = (text, currentModule) => {
  const tokens = tokenize(text);
  let i = 0;
  const parse = () => {
    const t = tokens[i];
    if (t === '(') {
      if (tokens[i + 1] === ')') {
        i += 2;
        return { k: 'unit' };
      }
      if (tokens[i + 2] === '::') {
        const head = tokens[i + 1];
        i = skipBalanced(tokens, i);
        const args = [];
        if (tokens[i] === '<') {
          i += 1;
          while (tokens[i] !== '>') {
            args.push(parse());
            if (tokens[i] === ',') i += 1;
          }
          i += 1;
        }
        return { k: 'app', head, args };
      }
      return refuse(`a tuple or function type does not cross the FFI; name a struct: ${text}`);
    }
    i += 1;
    return { k: 'ref', name: t };
  };
  const type = parse();
  if (i !== tokens.length) refuse(`unread type text: ${text}`);
  const classify = (t) => {
    if (t.k === 'unit') return { k: 'unit' };
    if (t.k === 'ref') {
      if (t.name === 'std/core/types/string') return { k: 'string' };
      if (t.name === 'std/core/types/int') return { k: 'int' };
      if (t.name === 'std/core/types/bool') return { k: 'bool' };
      if (t.name.startsWith('std/')) refuse(`${t.name} does not cross the FFI; the FFI carries string, int, bool, vector<T> and the core's own types`);
      const slash = t.name.lastIndexOf('/');
      return slash === -1 ? { k: 'ref', module: currentModule, name: t.name } : { k: 'ref', module: t.name.slice(0, slash), name: t.name.slice(slash + 1) };
    }
    if (t.head === 'std/core/types/vector' && t.args.length === 1) return { k: 'vector', of: classify(t.args[0]) };
    if (t.head === 'std/core/types/list') refuse('list<T> does not cross the FFI; the core takes and returns vector<T>');
    if (t.head === 'std/core/types/maybe') refuse('maybe<T> does not cross the FFI; absence is a case of a sum the core declares');
    return refuse(`${t.head} does not cross the FFI; the FFI carries string, int, bool, vector<T> and the core's own types`);
  };
  return classify(type);
};

const splitTop = (text) => {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '-' && text[i + 1] === '>') {
      i += 1; // an arrow, not a closing angle
      continue;
    }
    if (c === '(' || c === '<') depth += 1;
    if (c === ')' || c === '>') depth -= 1;
    if (c === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  const last = text.slice(start);
  if (last.trim() !== '') parts.push(last);
  return parts.map((p) => p.trim());
};

const parseFields = (text, currentModule) =>
  splitTop(text).map((field) => {
    const m = /^\^?\s*([^:]+?)\s*:\s*(.+)$/.exec(field);
    if (m === null) refuse(`cannot read a field: ${field}`);
    return { name: m[1].trim(), type: parseType(m[2], currentModule) };
  });

// ---------------------------------------------------------------- .kki

const parseKki = (text) => {
  const lines = text.split('\n');
  const header = lines.find((l) => l.startsWith('module interface '));
  if (header === undefined) refuse('not an interface file');
  const module = header.slice('module interface '.length).trim();
  const imports = lines.filter((l) => /^import \S+ = \S+/.test(l)).map((l) => /^import (\S+)/.exec(l)[1]);
  const types = new Map();
  const ops = [];
  const funs = [];
  const selects = new Set();
  let current = null;
  for (const raw of lines) {
    const line = stripLoc(raw);
    const open = /^pub (value\{[\d,]+\} )?type (\S+) \{/.exec(line);
    if (open !== null) {
      current = { name: open[2], module, cons: [], unboxed: open[1] !== undefined };
      continue;
    }
    if (current !== null && /^\};/.test(line)) {
      if (!current.cons.some((c) => c.name.startsWith('@'))) types.set(current.name, current);
      current = null;
      continue;
    }
    if (current !== null) {
      const con = /^\s+(pub )?con (\S+?)(\(|\{)/.exec(line);
      if (con === null) continue;
      const name = con[2];
      let fields = [];
      if (con[3] === '(') {
        const from = line.indexOf('(', line.indexOf(` con ${name}`));
        let depth = 0;
        let to = from;
        for (; to < line.length; to += 1) {
          if (line[to] === '(') depth += 1;
          if (line[to] === ')') depth -= 1;
          if (depth === 0) break;
        }
        fields = parseFields(line.slice(from + 1, to), module);
      }
      const tag = /= (\d+);\s*$/.exec(line);
      current.cons.push({ name, pub: con[1] !== undefined, fields, tag: tag === null ? null : Number(tag[1]) });
      continue;
    }
    const sel = /^pub fun (\S+)\/@select : /.exec(line);
    if (sel !== null) {
      selects.add(sel[1]);
      continue;
    }
    const fn = /^pub fun ([^\s/@]+) : (.+);\s*$/.exec(line);
    if (fn === null) continue;
    const name = fn[1];
    const sig = fn[2];
    if (sig.startsWith('forall')) continue; // generic: not an FFI surface
    const arrow = sig.indexOf(') -> ');
    if (!sig.startsWith('(') || arrow === -1) continue;
    const params = sig.slice(1, arrow);
    const rest = sig.slice(arrow + ') -> '.length);
    const handled = /^<\(std\/core\/types\/handled :: \(\(E, V\) -> V\) -> X\)<\((\S+) :: \(E, V\) -> V\)>> (.+)$/.exec(rest);
    const entry = { name, params: params.trim() === '' ? [] : parseFields(params, module) };
    if (handled !== null) {
      ops.push({ ...entry, effect: handled[1], result: parseType(handled[2], module) });
    } else if (!rest.startsWith('<')) {
      funs.push({ ...entry, result: rest });
    }
  }
  return { module, imports, types, ops: ops.filter((op) => selects.has(op.name)), entries: ops.filter((op) => !selects.has(op.name)), funs };
};

// ---------------------------------------------------------------- model

const load = (config) => {
  const build = resolve(config.dir, config.build);
  const modules = new Map();
  for (const name of config.modules) {
    const kki = parseKki(readFileSync(join(build, `${fileName(name)}.kki`), 'utf8'));
    modules.set(kki.module, kki);
  }
  const core = modules.get(config.core);
  if (core === undefined) refuse(`the core module ${config.core} is not among the modules built`);
  const entry = core.entries.find((e) => e.name === config.entry);
  if (entry === undefined) refuse(`the entry ${config.entry} is not a public function of ${config.core} with the core's effect row`);
  const ops = core.ops.filter((op) => op.effect === entry.effect);
  if (ops.length === 0) refuse(`the entry's effect ${entry.effect} declares no operations`);
  const findType = (ref) => {
    const m = modules.get(ref.module);
    const t = m === undefined ? undefined : m.types.get(ref.name);
    if (t === undefined) refuse(`the type ${ref.module}/${ref.name} is not among the modules built; list its module in koka.json`);
    return t;
  };
  // Every type reachable from the entry and the operations, in dependency order.
  const ordered = [];
  const seen = new Set();
  const visiting = new Set();
  const visit = (t) => {
    if (t.k === 'vector') return visit(t.of);
    if (t.k !== 'ref') return undefined;
    const key = `${t.module}/${t.name}`;
    if (seen.has(key)) return undefined;
    if (visiting.has(key)) refuse(`${key} contains its own kind; a recursive type does not cross the FFI (SPEC §7)`);
    visiting.add(key);
    const type = findType(t);
    for (const con of type.cons) for (const f of con.fields) visit(f.type);
    visiting.delete(key);
    seen.add(key);
    ordered.push({ key, ...type, abstract: !type.cons.some((c) => c.pub) });
    return undefined;
  };
  for (const p of entry.params) visit(p.type);
  visit(entry.result);
  for (const op of ops) {
    for (const p of op.params) visit(p.type);
    visit(op.result);
  }
  for (const t of ordered) {
    if (t.abstract && t.cons.length !== 1) refuse(`${t.key}: an abstract type crossing the FFI has one constructor; its fields are what the shell mints`);
    if (t.abstract && t.unboxed) refuse(`${t.key}: a receipt carries at least two fields; the compiled module represents a one-field struct as the field itself, which has no identity for the registry to keep`);
    for (const c of t.cons) {
      if (reservedJs.has(jsName(c.name))) refuse(`${t.key}: the constructor ${c.name} is a JavaScript reserved word in the compiled module`);
      if (c.fields.some((f) => f.type.k === 'unit')) refuse(`${t.key}: a field of type () carries nothing; drop it`);
    }
  }
  const receipt = (t) => t.k === 'ref' && t.name.endsWith('-receipt');
  // Which way each type crosses: in (the shell builds it for the core) or out
  // (the core hands it to the shell), transitively through fields.
  const closure = (roots) => {
    const keys = new Set();
    const walk = (t) => {
      if (t.k === 'vector') return walk(t.of);
      if (t.k !== 'ref') return undefined;
      const key = `${t.module}/${t.name}`;
      if (keys.has(key)) return undefined;
      keys.add(key);
      for (const c of findType(t).cons) for (const f of c.fields) walk(f.type);
      return undefined;
    };
    roots.forEach(walk);
    return keys;
  };
  const inbound = closure([...entry.params.map((p) => p.type), ...ops.map((op) => op.result)]);
  const outbound = closure([entry.result, ...ops.flatMap((op) => op.params.map((p) => p.type))]);
  return { config, modules, core, entry, ops, types: ordered, findType, receipt, inbound, outbound };
};

// ---------------------------------------------------------------- bridge.kk

const kokaType = (t, from) => {
  if (t.k === 'string') return 'string';
  if (t.k === 'int') return 'int';
  if (t.k === 'bool') return 'bool';
  if (t.k === 'unit') return '()';
  if (t.k === 'vector') return `vector<${kokaType(t.of, from)}>`;
  return t.module === from ? t.name : `${t.module}/${t.name}`;
};

const bridgeKk = (model) => {
  const { config, entry, ops, types, core } = model;
  const name = `${config.core}_bridge`;
  const imported = [...new Set([core.module, ...types.map((t) => t.module)])];
  const lines = [];
  lines.push(`// Generated by scripts/koka-gen.mjs from ${config.core}.kki (Koka ${config.koka}). Do not edit: the core is the source.`);
  lines.push(`//`);
  lines.push(`// The bridge. Each operation of \`${entry.effect}\` suspends the attempt in a step of its own,`);
  lines.push(`// carrying the operation's arguments and a resumption that takes that operation's`);
  lines.push(`// outcome and nothing else; a wrong-kind answer has no constructor to arrive in.`);
  lines.push(`// The folds are the one way the shell reads a value of the core's.`);
  lines.push(`module ${name}`);
  lines.push('');
  for (const m of imported) lines.push(`import ${m}`);
  lines.push('');
  lines.push('pub type step');
  lines.push(`  Done(status: ${kokaType(entry.result, name)})`);
  for (const op of ops) {
    const params = op.params.map((p) => `${p.name}: ${kokaType(p.type, name)}`);
    lines.push(`  Await-${op.name}(${[...params, `resume: (${kokaType(op.result, name)}) -> step`].join(', ')})`);
  }
  lines.push('');
  lines.push(`pub fun start(${entry.params.map((p) => `${p.name}: ${kokaType(p.type, name)}`).join(', ')}): step`);
  lines.push('  with handler');
  lines.push('    return(s) Done(s)');
  for (const op of ops) {
    const names = op.params.map((p) => p.name);
    lines.push(`    ctl ${op.name}(${names.join(', ')}) Await-${op.name}(${[...names, 'fn(o) resume(o)'].join(', ')})`);
  }
  lines.push(`  ${entry.name}(${entry.params.map((p) => p.name).join(', ')})`);
  const foldOf = (typeName, qualified, cons) => {
    lines.push('');
    const params = cons.map((c) => `on-${kebabOfCon(c.name)}: (${c.fields.map((f) => kokaType(f.type, name)).join(', ')}) -> e a`);
    lines.push(`pub fun fold-${typeName}(x: ${qualified}, ${params.join(', ')}): e a`);
    lines.push('  match x');
    for (const c of cons) {
      const vars = c.fields.map((_, i) => `f${i + 1}`);
      const pattern = vars.length === 0 ? c.name : `${c.name}(${vars.join(', ')})`;
      lines.push(`    ${pattern} -> on-${kebabOfCon(c.name)}(${vars.join(', ')})`);
    }
  };
  for (const t of types) if (!t.abstract) foldOf(t.name, kokaType({ k: 'ref', module: t.module, name: t.name }, name), t.cons);
  const stepCons = [
    { name: 'Done', fields: [{ name: 'status', type: entry.result }] },
    ...ops.map((op) => ({ name: `Await-${op.name}`, fields: [...op.params, { name: 'resume', type: { k: 'resume', of: op.result } }] })),
  ];
  lines.push('');
  const stepParams = stepCons.map(
    (c) => `on-${kebabOfCon(c.name)}: (${c.fields.map((f) => (f.type.k === 'resume' ? `(${kokaType(f.type.of, name)}) -> step` : kokaType(f.type, name))).join(', ')}) -> e a`,
  );
  lines.push(`pub fun fold-step(x: step, ${stepParams.join(', ')}): e a`);
  lines.push('  match x');
  for (const c of stepCons) {
    const vars = c.fields.map((_, i) => `f${i + 1}`);
    lines.push(`    ${c.name}(${vars.join(', ')}) -> on-${kebabOfCon(c.name)}(${vars.join(', ')})`);
  }
  lines.push('');
  return { name, text: lines.join('\n') };
};

// ---------------------------------------------------------------- .d.ts

const tsOpaque = (t, here) => {
  if (t.k === 'string') return 'string';
  if (t.k === 'int') return 'number';
  if (t.k === 'bool') return 'boolean';
  if (t.k === 'unit') return 'void';
  if (t.k === 'vector') return `ReadonlyArray<${tsOpaque(t.of, here)}>`;
  return t.module === here ? pascal(t.name) : `${jsName(t.module)}.${pascal(t.name)}`;
};

const dtsOf = (model, moduleName, bridge) => {
  const { config, types, entry, ops } = model;
  const own = types.filter((t) => t.module === moduleName);
  const others = [...new Set(types.filter((t) => t.module !== moduleName).map((t) => t.module))];
  const lines = [];
  lines.push(`// Generated by scripts/koka-gen.mjs from ${moduleName}.kki (Koka ${config.koka}): the compiled module's surface. Do not edit.`);
  lines.push(`// Every type is opaque: a value of it comes from a constructor here or from the core, never from a literal.`);
  for (const m of others) lines.push(`import type * as ${jsName(m)} from './${fileName(m)}.js';`);
  lines.push('declare const brand: unique symbol;');
  for (const t of own) {
    lines.push('');
    lines.push(`export type ${pascal(t.name)} = { readonly [brand]: '${t.module}/${t.name}' };`);
    for (const c of t.cons) {
      const note = c.pub ? '' : ' // hidden from the core (abstract); the shell mints it and keeps its identity';
      if (c.fields.length === 0) lines.push(`export const ${jsName(c.name)}: ${pascal(t.name)};${note}`);
      else lines.push(`export function ${jsName(c.name)}(${c.fields.map((f) => `${camel(f.name)}: ${tsOpaque(f.type, moduleName)}`).join(', ')}): ${pascal(t.name)};${note}`);
    }
  }
  if (bridge !== null) {
    const here = bridge.name;
    const T = (t) => tsOpaque(t, here);
    lines.push('');
    lines.push(`export type Step = { readonly [brand]: '${here}/step' };`);
    lines.push(`export function start(${entry.params.map((p) => `${camel(p.name)}: ${T(p.type)}`).join(', ')}): Step;`);
    for (const t of types) {
      if (t.abstract) continue;
      const cbs = t.cons.map((c) => `on${pascal(kebabOfCon(c.name))}: (${c.fields.map((f) => `${camel(f.name)}: ${T(f.type)}`).join(', ')}) => A`);
      lines.push(`export function ${jsName(`fold-${t.name}`)}<A>(x: ${T({ k: 'ref', module: t.module, name: t.name })}, ${cbs.join(', ')}): A;`);
    }
    const stepCbs = [
      `onDone: (status: ${T(entry.result)}) => A`,
      ...ops.map((op) => `on${pascal(`await-${op.name}`)}: (${[...op.params.map((p) => `${camel(p.name)}: ${T(p.type)}`), `resume: (outcome: ${T(op.result)}) => Step`].join(', ')}) => A`),
    ];
    lines.push(`export function fold_step<A>(x: Step, ${stepCbs.join(', ')}): A;`);
  }
  lines.push('');
  return lines.join('\n');
};

// ---------------------------------------------------------------- ffi.ts

const rawType = (t) => {
  if (t.k === 'string') return 'string';
  if (t.k === 'int') return 'number';
  if (t.k === 'bool') return 'boolean';
  if (t.k === 'vector') return `ReadonlyArray<${rawType(t.of)}>`;
  return pascal(t.name);
};

const ffiTs = (model, bridge, outPath) => {
  const { config, types, entry, ops, findType, receipt, inbound, outbound } = model;
  const goesIn = (t) => inbound.has(`${t.module}/${t.name}`);
  const goesOut = (t) => outbound.has(`${t.module}/${t.name}`);
  const dir = dirname(outPath);
  const rel = (p) => {
    const r = relative(dir, p).replace(/\\/g, '/');
    return r.startsWith('.') ? r : `./${r}`;
  };
  const build = resolve(config.dir, config.build);
  const lib = resolve(config.dir, config.lib);
  const moduleAlias = (m) => `K_${jsName(m)}`;
  const modules = [...new Set([config.core, ...types.map((t) => t.module)])];
  const isSum = (t) => !t.abstract && t.cons.length > 1;
  const isStruct = (t) => !t.abstract && t.cons.length === 1;
  const schemaName = (t) => `${camel(t.name)}Schema`;
  const parseName = (t) => `parse${pascal(t.name)}`;
  const intoName = (t) => `into${pascal(t.name)}`;
  const fromName = (t) => `from${pascal(t.name)}`;
  const registryName = (t) => `${camel(t.name)}Registry`;
  const K = (t) => `${moduleAlias(t.module)}.${pascal(t.name)}`;
  const valueType = (t) => (t.k === 'ref' ? (isSum(findType(t)) ? `Variant<${pascal(t.name)}>` : pascal(t.name)) : rawType(t));
  const schemaOf = (t) => {
    if (t.k === 'string') return 'z.string()';
    if (t.k === 'int') return 'z.int()';
    if (t.k === 'bool') return 'z.boolean()';
    if (t.k === 'vector') return `z.array(${schemaOf(t.of)}).readonly()`;
    return schemaName(findType(t));
  };
  // A value that carries a minted value (a claim, a receipt) anywhere inside
  // it is built for an owner: the attempt it is issued to, which the registry
  // audits at the end for the receipts among them.
  const holdsReceipt = (t, seen = new Set()) => {
    if (t.k === 'vector') return holdsReceipt(t.of, seen);
    if (t.k !== 'ref') return false;
    const type = findType(t);
    if (!type.cons.some((c) => c.pub)) return true; // abstract: minted into a registry
    const key = `${t.module}/${t.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return type.cons.some((c) => c.fields.some((f) => holdsReceipt(f.type, seen)));
  };
  const owned = (t) => (holdsReceipt(t) ? ', owner' : '');
  const intoOf = (t, expr) => {
    if (t.k === 'vector') return `${expr}.map((item) => ${intoOf(t.of, 'item')})`;
    if (t.k === 'ref') return `${intoName(findType(t))}(${expr}${owned(t)})`;
    return expr;
  };
  const fromOf = (t, expr) => {
    if (t.k === 'vector') return `${expr}.map((item) => ${fromOf(t.of, 'item')})`;
    if (t.k === 'ref') return `${fromName(findType(t))}(${expr})`;
    return expr;
  };
  const fields = (fs) => fs.map((f) => `readonly ${camel(f.name)}: ${valueType(f.type)}`).join('; ');
  const lines = [];
  lines.push(`// Generated by scripts/koka-gen.mjs from ${relative(process.cwd(), config.dir)} (Koka ${config.koka}). Do not edit: the core is the source.`);
  lines.push('//');
  lines.push('// The FFI. Every value crossing into the core is parsed by a boundary schema,');
  lines.push('// built with the compiled module\'s constructors and frozen; every value crossing');
  lines.push('// out is read through a generated fold into a frozen Variant. A receipt is');
  lines.push('// minted here and read back from a registry by identity, so a value the shell');
  lines.push('// did not mint halts the attempt; a step is resumed once. The core never sees a');
  lines.push('// raw value, and the shell never sees a Koka one.');
  lines.push('');
  lines.push("import { z } from 'zod';");
  for (const m of modules) lines.push(`import * as ${moduleAlias(m)} from '${rel(join(build, `${fileName(m)}.js`))}';`);
  lines.push(`import * as ${moduleAlias(bridge.name)} from '${rel(join(build, `${fileName(bridge.name)}.js`))}';`);
  lines.push(`import { boundary, type Boundary, type Parse } from '${rel(join(lib, 'boundary/boundary.js'))}';`);
  lines.push(`import { defect, frozen, registry, spendOnce } from '${rel(join(lib, 'sealed.js'))}';`);
  lines.push(`import { fold, type Variant } from '${rel(join(lib, 'variant.js'))}';`);
  lines.push('');
  lines.push('// The shell\'s forms of the core\'s types: a struct is a record, a sum is a Cases');
  lines.push('// map whose Variant is the value, a receipt is the record of what the shell minted.');
  for (const t of types) {
    if (isSum(t)) {
      lines.push(`export type ${pascal(t.name)} = {`);
      for (const c of t.cons) lines.push(`  ${snakeOfCon(c.name)}: {${c.fields.length === 0 ? '' : ` ${fields(c.fields)} `}};`);
      lines.push('};');
    } else {
      lines.push(`export type ${pascal(t.name)} = { ${fields(t.cons[0].fields)} };`);
    }
  }
  lines.push('');
  lines.push('// A schema per type that crosses in, so a value is parsed every time it does.');
  for (const t of types) {
    if (!goesIn(t)) continue;
    if (isSum(t)) {
      lines.push(`const ${schemaName(t)} = z.discriminatedUnion('kind', [`);
      for (const c of t.cons) lines.push(`  z.strictObject({ kind: z.literal('${snakeOfCon(c.name)}')${c.fields.map((f) => `, ${camel(f.name)}: ${schemaOf(f.type)}`).join('')} }).readonly(),`);
      lines.push(']);');
    } else {
      lines.push(`const ${schemaName(t)} = z.strictObject({ ${t.cons[0].fields.map((f) => `${camel(f.name)}: ${schemaOf(f.type)}`).join(', ')} }).readonly();`);
    }
    lines.push(`export const ${parseName(t)}: Boundary<${valueType({ k: 'ref', module: t.module, name: t.name })}> = boundary(${schemaName(t)});`);
  }
  lines.push('');
  lines.push('// A value the shell hands the core that its schema refuses is a defect of the');
  lines.push('// shell: the attempt halts naming the issue, as a wrong-kind answer would have.');
  lines.push('const accepted =');
  lines.push('  <F>(what: string) =>');
  lines.push('  (parsed: Variant<Parse<F>>): F =>');
  lines.push('    fold<Parse<F>, F>({');
  lines.push('      accepted: ({ fact }) => fact,');
  lines.push("      rejected: ({ issues }) => defect(`${what}: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`),");
  lines.push('    })(parsed);');
  lines.push('');
  lines.push("// A constructed Koka value is frozen before the core sees it; a nullary case is");
  lines.push("// a shared constant the compiled module may represent as null.");
  lines.push("const freezeKoka = <T>(value: T): T => (typeof value === 'object' && value !== null ? frozen(value) : value);");
  lines.push('');
  lines.push('// In: the shell\'s form to the core\'s, by constructor.');
  for (const t of types) {
    if (!goesIn(t)) continue;
    const ref = { k: 'ref', module: t.module, name: t.name };
    const ownerParam = holdsReceipt(ref) ? ', owner: object' : '';
    if (t.abstract) {
      lines.push(`const ${registryName(t)} = registry<${pascal(t.name)}>('${t.name}');`);
      lines.push(`const ${intoName(t)} = (raw: ${pascal(t.name)}, owner: object): ${K(t)} =>`);
      lines.push(`  ${registryName(t)}.mint(freezeKoka(${moduleAlias(t.module)}.${jsName(t.cons[0].name)}(${t.cons[0].fields.map((f) => `raw.${camel(f.name)}`).join(', ')})), raw, owner);`);
    } else if (isSum(t)) {
      lines.push(`const ${intoName(t)} = (raw: Variant<${pascal(t.name)}>${ownerParam}): ${K(t)} =>`);
      lines.push(`  freezeKoka(`);
      lines.push(`    fold<${pascal(t.name)}, ${K(t)}>({`);
      for (const c of t.cons) {
        const args = c.fields.map((f) => intoOf(f.type, camel(f.name))).join(', ');
        const pat = c.fields.length === 0 ? '()' : `({ ${c.fields.map((f) => camel(f.name)).join(', ')} })`;
        const call = c.fields.length === 0 ? `${moduleAlias(t.module)}.${jsName(c.name)}` : `${moduleAlias(t.module)}.${jsName(c.name)}(${args})`;
        lines.push(`      ${snakeOfCon(c.name)}: ${pat} => ${call},`);
      }
      lines.push(`    })(raw),`);
      lines.push(`  );`);
    } else {
      const c = t.cons[0];
      lines.push(`const ${intoName(t)} = (raw: ${pascal(t.name)}${ownerParam}): ${K(t)} =>`);
      lines.push(`  freezeKoka(${moduleAlias(t.module)}.${jsName(c.name)}(${c.fields.map((f) => intoOf(f.type, `raw.${camel(f.name)}`)).join(', ')}));`);
    }
  }
  lines.push('');
  lines.push('// Out: the core\'s form to the shell\'s, by fold; a receipt by the registry.');
  const Bm = moduleAlias(bridge.name);
  for (const t of types) {
    if (!goesOut(t)) continue;
    if (t.abstract) {
      if (!goesIn(t)) lines.push(`const ${registryName(t)} = registry<${pascal(t.name)}>('${t.name}');`);
      lines.push(`const ${fromName(t)} = (value: ${K(t)}): ${pascal(t.name)} => ${registryName(t)}.read(value);`);
    } else {
      const result = isSum(t) ? `Variant<${pascal(t.name)}>` : pascal(t.name);
      lines.push(`const ${fromName(t)} = (value: ${K(t)}): ${result} =>`);
      lines.push(`  frozen(`);
      lines.push(`    ${Bm}.${jsName(`fold-${t.name}`)}<${result}>(`);
      lines.push(`      value,`);
      for (const c of t.cons) {
        const params = c.fields.map((f) => camel(f.name)).join(', ');
        const body = c.fields.map((f) => {
          const read = fromOf(f.type, camel(f.name));
          return read === camel(f.name) ? read : `${camel(f.name)}: ${read}`;
        });
        const record = isSum(t) ? `{ kind: '${snakeOfCon(c.name)}'${body.map((b) => `, ${b}`).join('')} }` : `{ ${body.join(', ')} }`;
        lines.push(`      (${params}) => (${record}),`);
      }
      lines.push(`    ),`);
      lines.push(`  );`);
    }
  }
  lines.push('');
  const receiptTypes = types.filter((t) => t.abstract && t.name.endsWith('-receipt'));
  lines.push('// The ownership audit: every receipt minted for an attempt and never spent,');
  lines.push('// read at every terminal, whether the attempt finished or halted.');
  lines.push('export type Outstanding = {');
  for (const t of receiptTypes) lines.push(`  ${snakeOfCon(pascal(t.name))}: { readonly receipt: ${pascal(t.name)} };`);
  lines.push('};');
  lines.push('');
  lines.push('const outstandingOf = (owner: object): ReadonlyArray<Variant<Outstanding>> =>');
  lines.push('  frozen([');
  for (const t of receiptTypes) lines.push(`    ...${registryName(t)}.outstanding(owner).map((receipt): Variant<Outstanding> => ({ kind: '${snakeOfCon(pascal(t.name))}', receipt })),`);
  lines.push('  ]);');
  lines.push('');
  lines.push('// A step: the attempt is done, or suspended on one command with a resumption');
  lines.push('// that takes that command\'s outcome. The resumption parses the outcome, is');
  lines.push('// spent once, and a receipt an operation takes is spent with it. A done step');
  lines.push('// carries the audit.');
  lines.push('export type Step = {');
  lines.push(`  done: { readonly status: ${valueType(entry.result)}; readonly outstanding: ReadonlyArray<Variant<Outstanding>> };`);
  for (const op of ops) {
    const fs = op.params.map((p) => `readonly ${camel(p.name)}: ${valueType(p.type)}`);
    lines.push(`  ${snakeOfCon(`Await-${op.name}`)}: {`);
    for (const f of fs) lines.push(`    ${f};`);
    lines.push(`    readonly resume: (outcome: ${valueType(op.result)}) => Variant<Step>;`);
    lines.push('  };');
  }
  lines.push('};');
  lines.push('');
  lines.push(`const fromStep = (step: ${Bm}.Step, owner: object): Variant<Step> =>`);
  lines.push(`  ${Bm}.fold_step<Variant<Step>>(`);
  lines.push(`    step,`);
  lines.push(`    (status) => frozen({ kind: 'done', status: ${fromOf(entry.result, 'status')}, outstanding: outstandingOf(owner) }),`);
  for (const op of ops) {
    const params = [...op.params.map((p) => camel(p.name)), 'resume'].join(', ');
    const reads = op.params.map((p) => {
      const read = fromOf(p.type, receipt(p.type) ? `spendOnce(${camel(p.name)})` : camel(p.name));
      return read === camel(p.name) ? read : `${camel(p.name)}: ${read}`;
    });
    const resultType = valueType(op.result);
    const resultRef = op.result.k === 'ref' ? findType(op.result) : null;
    const parsed = resultRef === null ? 'outcome' : `${intoName(resultRef)}(accepted<${resultType}>('${op.name}')(${parseName(resultRef)}(outcome))${owned(op.result)})`;
    lines.push(`    (${params}) =>`);
    lines.push(`      frozen({`);
    lines.push(`        kind: '${snakeOfCon(`Await-${op.name}`)}',`);
    for (const r of reads) lines.push(`        ${r},`);
    lines.push(`        resume: (outcome: ${resultType}): Variant<Step> => fromStep(spendOnce(resume)(${parsed}), owner),`);
    lines.push(`      }),`);
  }
  lines.push(`  );`);
  lines.push('');
  lines.push('// An attempt: its first step, and its audit, readable at any time by the');
  lines.push('// interpreter, so a halt reports what was outstanding as a finish does. The');
  lines.push('// owner is a fresh identity per attempt; the arguments are parsed on the way');
  lines.push('// in like any other value.');
  lines.push('export type Attempt = {');
  lines.push('  readonly first: Variant<Step>;');
  lines.push('  readonly outstanding: () => ReadonlyArray<Variant<Outstanding>>;');
  lines.push('};');
  lines.push('');
  const entryArgs = entry.params.map((p) => {
    const ref = p.type.k === 'ref' ? findType(p.type) : null;
    if (ref !== null) return `${intoName(ref)}(accepted<${valueType(p.type)}>('${p.name}')(${parseName(ref)}(${camel(p.name)}))${owned(p.type)})`;
    return `accepted<${valueType(p.type)}>('${p.name}')(boundary(${schemaOf(p.type)})(${camel(p.name)}))`;
  });
  lines.push(`export const begin = (${entry.params.map((p) => `${camel(p.name)}: ${valueType(p.type)}`).join(', ')}): Attempt => {`);
  lines.push('  const owner = {};');
  lines.push(`  return frozen({ first: fromStep(${Bm}.start(${entryArgs.join(', ')}), owner), outstanding: () => outstandingOf(owner) });`);
  lines.push('};');
  lines.push('');
  return lines.join('\n');
};

// ---------------------------------------------------------------- drive.ts

const driveTs = (model, ffiPath, outPath) => {
  const { config, types, entry, ops, findType } = model;
  const dir = dirname(outPath);
  const rel = (p) => {
    const r = relative(dir, p).replace(/\\/g, '/');
    return r.startsWith('.') ? r : `./${r}`;
  };
  const lib = resolve(config.dir, config.lib);
  const isSum = (t) => !t.abstract && t.cons.length > 1;
  const valueType = (t) => (t.k === 'ref' ? (isSum(findType(t)) ? `Variant<${pascal(t.name)}>` : pascal(t.name)) : rawType(t));
  const used = new Set();
  const mention = (t) => {
    if (t.k === 'vector') mention(t.of);
    if (t.k === 'ref') used.add(pascal(t.name));
  };
  for (const p of entry.params) mention(p.type);
  mention(entry.result);
  for (const op of ops) {
    for (const p of op.params) mention(p.type);
    mention(op.result);
  }
  const typeNames = types.map((t) => pascal(t.name)).filter((n) => used.has(n));
  const lines = [];
  lines.push(`// Generated by scripts/koka-gen.mjs from ${relative(process.cwd(), config.dir)} (Koka ${config.koka}). Do not edit: the core is the source.`);
  lines.push('//');
  lines.push('// The interpreter. It performs each command the core suspends on, in order,');
  lines.push('// through the Effects record, resumes the core with the outcome, and keeps the');
  lines.push('// ledger: every command and its outcome, as data, in the order they happened.');
  lines.push('// A run finishes with the status and the ownership audit, or halts, when a');
  lines.push('// performer or the FFI threw, with the ledger so far and the audit at that');
  lines.push('// point; either way nothing issued is dropped silently.');
  lines.push('');
  lines.push(`import { ledger } from '${rel(join(lib, 'ledger.js'))}';`);
  lines.push(`import { frozen } from '${rel(join(lib, 'sealed.js'))}';`);
  lines.push(`import { fold, type Variant } from '${rel(join(lib, 'variant.js'))}';`);
  lines.push(`import { begin, type Outstanding, type Step, ${typeNames.map((n) => `type ${n}`).join(', ')} } from '${rel(ffiPath).replace(/\.ts$/, '.js')}';`);
  lines.push('');
  lines.push('// What the shell does for each command. Each returns that command\'s outcome.');
  lines.push('export type Effects = {');
  for (const op of ops) lines.push(`  readonly ${camel(op.name)}: (${op.params.map((p) => `${camel(p.name)}: ${valueType(p.type)}`).join(', ')}) => Promise<${valueType(op.result)}>;`);
  lines.push('};');
  lines.push('');
  lines.push('// A ledger entry: one command, its arguments, its outcome, frozen as it is recorded.');
  lines.push('export type Entry = {');
  for (const op of ops) lines.push(`  ${snakeOfCon(op.name)}: { ${[...op.params.map((p) => `readonly ${camel(p.name)}: ${valueType(p.type)}`), `readonly outcome: ${valueType(op.result)}`].join('; ')} };`);
  lines.push('};');
  lines.push('');
  lines.push('export type Run = {');
  lines.push(`  finished: { readonly status: ${valueType(entry.result)}; readonly ledger: ReadonlyArray<Variant<Entry>>; readonly outstanding: ReadonlyArray<Variant<Outstanding>> };`);
  lines.push('  halted: { readonly error: Error; readonly ledger: ReadonlyArray<Variant<Entry>>; readonly outstanding: ReadonlyArray<Variant<Outstanding>> };');
  lines.push('};');
  lines.push('');
  lines.push(`export const drive =`);
  lines.push(`  (fx: Effects) =>`);
  lines.push(`  (${entry.params.map((p) => `${camel(p.name)}: ${valueType(p.type)}`).join(', ')}): Promise<Variant<Run>> => {`);
  lines.push(`    const noted = ledger<Variant<Entry>>();`);
  lines.push(`    const halted = (thrown: unknown, outstanding: ReadonlyArray<Variant<Outstanding>>): Variant<Run> => ({`);
  lines.push(`      kind: 'halted',`);
  lines.push(`      error: thrown instanceof Error ? thrown : new Error(String(thrown)),`);
  lines.push(`      ledger: noted.entries(),`);
  lines.push(`      outstanding,`);
  lines.push(`    });`);
  lines.push(`    const loop = (step: Variant<Step>): Promise<Variant<Run>> =>`);
  lines.push(`      fold<Step, Promise<Variant<Run>>>({`);
  lines.push(`        done: ({ status, outstanding }) => Promise.resolve({ kind: 'finished', status, ledger: noted.entries(), outstanding }),`);
  for (const op of ops) {
    const names = op.params.map((p) => camel(p.name));
    const key = snakeOfCon(`Await-${op.name}`);
    lines.push(`        ${key}: ({ ${[...names, 'resume'].join(', ')} }) =>`);
    lines.push(`          fx.${camel(op.name)}(${names.join(', ')}).then((outcome) => {`);
    lines.push(`            const next = resume(outcome);`);
    lines.push(`            noted.note(frozen({ kind: '${snakeOfCon(op.name)}'${names.map((n) => `, ${n}`).join('')}, outcome }));`);
    lines.push(`            return loop(next);`);
    lines.push(`          }),`);
  }
  lines.push(`      })(step);`);
  lines.push(`    // An argument the schema refuses halts before anything is issued; a throw`);
  lines.push(`    // later halts with what was issued and not spent at that point.`);
  lines.push(`    return Promise.resolve()`);
  lines.push(`      .then(() => {`);
  lines.push(`        const attempt = begin(${entry.params.map((p) => camel(p.name)).join(', ')});`);
  lines.push(`        return loop(attempt.first).catch((thrown: unknown) => halted(thrown, attempt.outstanding()));`);
  lines.push(`      })`);
  lines.push(`      .catch((thrown: unknown) => halted(thrown, []));`);
  lines.push(`  };`);
  lines.push('');
  return lines.join('\n');
};

// ---------------------------------------------------------------- main

export const generate = (configPath, phase) => {
  const config = { ...JSON.parse(readFileSync(configPath, 'utf8')), dir: dirname(resolve(configPath)) };
  const model = load(config);
  const bridge = bridgeKk(model);
  const build = resolve(config.dir, config.build);
  if (phase === 'bridge') {
    writeFileSync(join(build, `${bridge.name}.kk`), bridge.text);
    return { bridge: bridge.name };
  }
  for (const m of [...new Set([config.core, ...model.types.map((t) => t.module)])]) writeFileSync(join(build, `${fileName(m)}.d.ts`), dtsOf(model, m, null));
  writeFileSync(join(build, `${fileName(bridge.name)}.d.ts`), dtsOf(model, bridge.name, bridge));
  const ffiPath = resolve(config.dir, config.ffi);
  const drivePath = resolve(config.dir, config.drive);
  mkdirSync(dirname(ffiPath), { recursive: true });
  mkdirSync(dirname(drivePath), { recursive: true });
  writeFileSync(ffiPath, ffiTs(model, bridge, ffiPath));
  writeFileSync(drivePath, driveTs(model, ffiPath, drivePath));
  return { bridge: bridge.name, ffi: ffiPath, drive: drivePath };
};

if (process.argv[1] !== undefined && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const [configPath, phase] = process.argv.slice(2);
  if (configPath === undefined) {
    console.log('usage: node scripts/koka-gen.mjs <koka.json> [bridge|shell]');
    process.exit(2);
  }
  console.log(JSON.stringify(generate(configPath, phase ?? 'shell')));
}
