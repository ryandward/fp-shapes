#!/usr/bin/env node
// The membership test for L, the pure language defined in PROPOSAL.md.
//
//   npx fp-shapes-check tsconfig.pure.json
//
// A file is accepted when every module item, expression and type in it is one
// of L's forms. Nothing is banned by name: a construct that is not one of the
// forms below is reported as "Not in L", whatever it is. The checks are:
//
// 1. The compiler, with only the pure standard library (lib.d.ts in this
//    folder). The options that make it pure are forced here and override the
//    tsconfig. Effects (fetch, Date, Math.random, Promise, …) do not exist.
// 2. The grammar of L: module items, expressions and types (below).
// 3. Imports only from 'fp-shapes/pure' and the project's own files.
// 4. No directive silences the compiler, and no triple-slash reference adds a
//    library back.
//
// Exits 1 if anything is reported. Built on TypeScript 7's API
// (`typescript/unstable/*`); the package pins TypeScript exactly.

import { API, SymbolFlags, TypeFlags } from 'typescript/unstable/sync';
import { NodeFlags, SyntaxKind } from 'typescript/unstable/ast';
import { tokenToString } from 'typescript/unstable/ast/scanner';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const pureLib = resolve(dirname(fileURLToPath(import.meta.url)), 'lib.d.ts');

// The installed library's declarations. Every file compiled into a pure
// project is a project file, the pure standard library, or one of these.
const libraryDist = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const inLibrary = (file) => resolve(file).startsWith(libraryDist + '/');

const enforced = {
  noLib: true,
  types: [],
  strict: true,
  exactOptionalPropertyTypes: true,
  noUncheckedIndexedAccess: true,
  noImplicitReturns: true,
  allowJs: false,
  skipLibCheck: false,
  noEmit: true,
};

const PURE_ENTRY = 'fp-shapes/pure';

// ---------------------------------------------------------------- the grammar of L

// Expressions: e ::= x | literal | { ℓ = e, … } | e.ℓ | [e, …] | (x: τ) => e | e e
//                  | e + e | e - e | e * e | e / e | e % e | e ** e | -e | +e
//                  | e as const | e satisfies τ | (e)
const arithmetic = new Set([
  SyntaxKind.PlusToken, SyntaxKind.MinusToken, SyntaxKind.AsteriskToken,
  SyntaxKind.SlashToken, SyntaxKind.PercentToken, SyntaxKind.AsteriskAsteriskToken,
]);
const literals = new Set([
  SyntaxKind.StringLiteral, SyntaxKind.NumericLiteral, SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TrueKeyword, SyntaxKind.FalseKeyword,
]);

// Types: τ ::= string | number | boolean | never | literal | { readonly ℓ: τ, … }
//            | readonly τ[] | readonly [τ, …] | (x: τ) => τ | Name<τ, …> | typeof x
//            | literal | literal | … | (τ)
// `never` is the empty sum: no values, so nothing can flow through it.
const keywordTypes = new Set([SyntaxKind.StringKeyword, SyntaxKind.NumberKeyword, SyntaxKind.BooleanKeyword, SyntaxKind.NeverKeyword]);
const literalTypes = new Set([SyntaxKind.StringLiteral, SyntaxKind.NumericLiteral, SyntaxKind.TrueKeyword, SyntaxKind.FalseKeyword]);

const readable = (kind) =>
  SyntaxKind[kind]
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/ keyword$/, '')
    .replace(/ token$/, '');

const tokenText = (kind) => tokenToString(kind) ?? readable(kind);

// ---------------------------------------------------------------- the check

const derivedConfig = (configPath, roots) => {
  const dir = mkdtempSync(join(tmpdir(), 'fp-shapes-check-'));
  const path = join(dir, 'tsconfig.json');
  writeFileSync(path, JSON.stringify({ extends: configPath, compilerOptions: enforced, files: [pureLib, ...roots], include: [] }));
  return { path, dispose: () => rmSync(dir, { recursive: true, force: true }) };
};

export const check = ({ project, files }) => {
  const configPath = resolve(project);
  const api = new API({ cwd: dirname(configPath) });
  try {
    const roots = (files ?? api.parseConfigFile(configPath).fileNames ?? []).map((f) => resolve(f)).filter((f) => f !== pureLib);
    const derived = derivedConfig(configPath, roots);
    try {
      const snapshot = api.updateSnapshot({ openProjects: [derived.path] });
      const loaded = snapshot.getProject(derived.path);
      return loaded === undefined ? [{ file: configPath, line: 1, column: 1, message: 'The project could not be loaded.', source: 'compiler' }] : inspect(loaded, new Set(roots), configPath);
    } finally {
      derived.dispose();
    }
  } finally {
    api.close();
  }
};

const inspect = (project, roots, configPath) => {
  const { program, checker } = project;
  const problems = [];

  // Each problem says where it came from: 'syntax' (the file does not parse),
  // 'compiler' (the type checker, under the pure standard library) or 'L'.
  const at = (fileName, pos, message, source = 'L') => {
    const sourceFile = fileName === undefined ? undefined : program.getSourceFile(fileName);
    if (sourceFile === undefined) return problems.push({ file: configPath, line: 1, column: 1, message, source });
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(pos);
    problems.push({ file: sourceFile.fileName, line: line + 1, column: character + 1, message, source });
  };
  const report = (node, message) => {
    const sourceFile = node.getSourceFile();
    at(sourceFile.fileName, node.getStart(sourceFile), message);
  };
  const notInL = (node, what = readable(node.kind)) => report(node, `Not in L: ${what}.`);

  // 1. The compiler's own errors.
  for (const d of program.getSyntacticDiagnostics()) at(d.fileName, d.pos, d.text, 'syntax');
  for (const d of [...program.getProgramDiagnostics(), ...program.getSemanticDiagnostics()]) at(d.fileName, d.pos, d.text, 'compiler');

  // The program is closed: every file the compiler loaded is a project file,
  // the pure standard library, or the installed library. A file loaded any
  // other way (a `paths` alias, a module suffix, a types entry) was never
  // checked, so it is refused rather than trusted.
  for (const fileName of program.getSourceFileNames()) {
    const file = resolve(fileName);
    if (!roots.has(file) && file !== pureLib && !inLibrary(file))
      problems.push({ file: configPath, line: 1, column: 1, message: `Not in L: ${file} is compiled into the project but is neither one of its files nor fp-shapes.`, source: 'L' });
  }

  // Imports come from the pure entry of the installed library or from the project.
  const allowedImport = (specifier) => {
    if (specifier.kind !== SyntaxKind.StringLiteral) return false;
    const declaration = checker.getSymbolAtLocation(specifier)?.declarations?.[0];
    if (declaration === undefined) return false;
    if (specifier.text === PURE_ENTRY) return inLibrary(declaration.path);
    return roots.has(resolve(declaration.path));
  };
  const moduleSpecifier = (node) => {
    if (node.moduleSpecifier !== undefined && !allowedImport(node.moduleSpecifier))
      report(node.moduleSpecifier, `Not in L: an import from outside '${PURE_ENTRY}' and this project.`);
  };

  // A type name refers to the project's own types, the library's types, a type
  // parameter, or ReadonlyArray. The pure standard library's other types
  // (Partial, Record, Omit, …) exist for the library's declarations; in pure
  // code they produce optional fields and index signatures, which L excludes.
  const fromPureLib = new Set(['ReadonlyArray']);
  const allowedTypeName = (name) => {
    const symbol = checker.getSymbolAtLocation(name);
    const declaration = symbol?.declarations?.[0];
    if (declaration === undefined) return false;
    const file = resolve(declaration.path);
    if (file === pureLib) return fromPureLib.has(symbol.name);
    return true;
  };

  // ------------------------------------------------------------ semantic helpers

  const members = (t) => (t.flags & (TypeFlags.Union | TypeFlags.Intersection) ? t.getTypes() : [t]);
  const mayBeAbsent = (t) => members(t).some((m) => (m.flags & (TypeFlags.Undefined | TypeFlags.Null | TypeFlags.Void)) !== 0);
  const isPrimitive = (t) => members(t).every((m) => (m.flags & (TypeFlags.StringLike | TypeFlags.NumberLike | TypeFlags.BooleanLike)) !== 0);

  // Deeply readonly data: what a module may hold, since a module-level value is
  // shared by every caller. A property is readonly when declared so or when it
  // came from `as const` (checkFlags bit 8). Functions are values, not state.
  const READONLY_CHECK_FLAG = 8;
  const readonlyProperty = (p) =>
    (p.checkFlags & READONLY_CHECK_FLAG) !== 0 ||
    p.declarations.some((h) => h.resolve(project)?.modifiers?.some((m) => m.kind === SyntaxKind.ReadonlyKeyword) === true);
  const isDeepReadonly = (t, seen = new Set()) => {
    if (seen.has(t.id)) return true;
    seen.add(t.id);
    if (t.flags & (TypeFlags.Union | TypeFlags.Intersection)) return t.getTypes().every((m) => isDeepReadonly(m, seen));
    if (!(t.flags & TypeFlags.Object)) return true;
    if (checker.isArrayType(t) || checker.isTupleType(t))
      return checker.typeToString(t).startsWith('readonly ') && checker.getTypeArguments(t).every((m) => isDeepReadonly(m, seen));
    if (checker.getSignaturesOfType(t, 0).length > 0) return true;
    return checker.getPropertiesOfType(t).every((p) => readonlyProperty(p) && isDeepReadonly(checker.getTypeOfSymbol(p), seen));
  };

  // The bindings of the project and what each one refers to, for the recursion
  // check: nothing in L reaches itself.
  const functions = new Map(); // symbol id -> { name, node, refers: Set<symbol id> }
  let within = undefined; // the function binding whose body is being walked
  const target = (symbol) => (symbol !== undefined && (symbol.flags & SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol);
  const refer = (symbol) => {
    const resolved = target(symbol);
    if (within !== undefined && resolved !== undefined) within.refers.add(resolved.id);
  };

  const modifiersOnly = (node, allowed) => node.modifiers?.forEach((m) => allowed.has(m.kind) || notInL(m, `the ${readable(m.kind)} modifier`));

  // `declare const NAME: unique symbol;` names a type and creates no value.
  const isTag = (node) =>
    node.kind === SyntaxKind.VariableStatement &&
    node.modifiers?.some((m) => m.kind === SyntaxKind.DeclareKeyword) === true &&
    (node.declarationList.flags & NodeFlags.Const) !== 0 &&
    node.declarationList.declarations.every((d) => d.initializer === undefined && d.type?.kind === SyntaxKind.TypeOperator && d.type.operator === SyntaxKind.UniqueKeyword);
  const isTagSymbol = (symbol) => {
    const declaration = symbol?.valueDeclaration?.resolve(project);
    return declaration !== undefined && declaration.kind === SyntaxKind.VariableDeclaration && isTag(declaration.parent.parent);
  };
  const inTypeQuery = (node) => node.parent !== undefined && (node.parent.kind === SyntaxKind.TypeQuery || (node.parent.kind === SyntaxKind.QualifiedName && inTypeQuery(node.parent)));

  // ------------------------------------------------------------ types

  const type = (node) => {
    if (keywordTypes.has(node.kind)) return;
    switch (node.kind) {
      case SyntaxKind.LiteralType:
        return literalTypes.has(node.literal.kind) || notInL(node, `the type ${readable(node.literal.kind)}`);
      case SyntaxKind.ParenthesizedType:
        return type(node.type);
      case SyntaxKind.TypeLiteral:
        // `{}` is not a type in L; an empty record is allowed only as a case's
        // payload, the type of a property, where Union tags it.
        if (node.members.length === 0 && node.parent.kind !== SyntaxKind.PropertySignature) return notInL(node, 'the empty type {}; a unit is a tagged record');
        return node.members.forEach(member);
      case SyntaxKind.TypeOperator:
        if (node.operator === SyntaxKind.ReadonlyKeyword && (node.type.kind === SyntaxKind.ArrayType || node.type.kind === SyntaxKind.TupleType)) return sequence(node.type);
        return notInL(node, node.operator === SyntaxKind.ReadonlyKeyword ? 'readonly on anything but an array or tuple' : `the ${readable(node.operator)} type operator`);
      case SyntaxKind.ArrayType:
      case SyntaxKind.TupleType:
        return node.parent.kind === SyntaxKind.RestType ? sequence(node) : notInL(node, `a mutable ${node.kind === SyntaxKind.ArrayType ? 'array' : 'tuple'}; write readonly`);
      case SyntaxKind.FunctionType:
        node.typeParameters?.forEach(typeParameter);
        node.parameters.forEach(parameter);
        return type(node.type);
      case SyntaxKind.TypeReference:
        if (!allowedTypeName(node.typeName)) return notInL(node, `the type ${node.typeName.getText()}`);
        return node.typeArguments?.forEach(type);
      case SyntaxKind.TypeQuery:
        return;
      case SyntaxKind.UnionType:
        // A union of literal types, such as 'a' | 'b'. Unions of records are written Union<…>.
        return node.types.forEach((t) => t.kind === SyntaxKind.LiteralType ? type(t) : notInL(t, 'a union member that is not a literal; use Union<…> for cases'));
      default:
        return notInL(node, `the type ${readable(node.kind)}`);
    }
  };
  const sequence = (node) => {
    if (node.kind === SyntaxKind.ArrayType) return type(node.elementType);
    return node.elements.forEach((e) => {
      if (e.kind === SyntaxKind.RestType) return type(e.type);
      if (e.kind === SyntaxKind.NamedTupleMember) return e.questionToken === undefined && e.dotDotDotToken === undefined ? type(e.type) : notInL(e, 'an optional or rest tuple member');
      if (e.kind === SyntaxKind.OptionalType) return notInL(e, 'an optional tuple element');
      return type(e);
    });
  };
  const member = (m) => {
    if (m.kind !== SyntaxKind.PropertySignature) return notInL(m, `${readable(m.kind)}; a record has only readonly properties, functions in property syntax`);
    if (m.name.kind === SyntaxKind.ComputedPropertyName) return notInL(m.name, 'a computed property name');
    if (m.postfixToken !== undefined) return notInL(m, 'an optional property');
    if (m.modifiers?.some((x) => x.kind === SyntaxKind.ReadonlyKeyword) !== true) return notInL(m, 'a mutable property; write readonly');
    return m.type === undefined ? notInL(m, 'a property without a type') : type(m.type);
  };
  const typeParameter = (p) => {
    if (p.constraint !== undefined) type(p.constraint);
    if (p.defaultType !== undefined) type(p.defaultType);
  };

  // ------------------------------------------------------------ expressions

  const parameter = (p) => {
    if (p.dotDotDotToken !== undefined) return notInL(p, 'a rest parameter');
    if (p.questionToken !== undefined) return notInL(p, 'an optional parameter');
    if (p.initializer !== undefined) return notInL(p, 'a default parameter value');
    binding(p.name);
    if (p.type !== undefined) type(p.type);
  };
  const binding = (name, inArray = false) => {
    if (name.kind === SyntaxKind.Identifier) {
      // An array element past the known length is undefined at runtime.
      if (inArray && mayBeAbsent(checker.getTypeAtLocation(name))) notInL(name, 'a destructured element that may be absent; destructure a tuple of known length');
      return;
    }
    if (name.kind === SyntaxKind.ObjectBindingPattern || name.kind === SyntaxKind.ArrayBindingPattern)
      return name.elements.forEach((e) => {
        if (e.kind === SyntaxKind.OmittedExpression) return;
        if (e.initializer !== undefined) return notInL(e, 'a default value in a pattern');
        if (e.propertyName?.kind === SyntaxKind.ComputedPropertyName) return notInL(e.propertyName, 'a computed property name');
        binding(e.name, name.kind === SyntaxKind.ArrayBindingPattern);
      });
    notInL(name);
  };

  const expression = (node) => {
    if (literals.has(node.kind)) return;
    switch (node.kind) {
      case SyntaxKind.Identifier: {
        if (node.text === 'undefined') return notInL(node, 'undefined');
        const symbol = checker.getSymbolAtLocation(node);
        if (isTagSymbol(symbol)) return notInL(node, 'a declared tag used as a value; use typeof');
        return refer(symbol);
      }
      case SyntaxKind.TemplateExpression:
        // A template calls toString on what it holds; only strings, numbers and
        // booleans have no toString of the program's own.
        return node.templateSpans.forEach((s) => {
          if (!isPrimitive(checker.getTypeAtLocation(s.expression))) notInL(s.expression, 'a template part that is not a string, number or boolean');
          expression(s.expression);
        });
      case SyntaxKind.ParenthesizedExpression:
        return expression(node.expression);
      case SyntaxKind.ObjectLiteralExpression:
        return node.properties.forEach((p) => {
          if (p.kind === SyntaxKind.ShorthandPropertyAssignment) {
            if (p.objectAssignmentInitializer !== undefined) return notInL(p, 'a default value');
            return refer(checker.getShorthandAssignmentValueSymbol(p));
          }
          if (p.kind !== SyntaxKind.PropertyAssignment) return notInL(p, `${readable(p.kind)} in a record; a record lists its fields`);
          if (p.name.kind === SyntaxKind.ComputedPropertyName) return notInL(p.name, 'a computed property name');
          if (p.name.kind === SyntaxKind.Identifier && p.name.text === '__proto__') return notInL(p.name, '__proto__');
          return expression(p.initializer);
        });
      case SyntaxKind.ArrayLiteralExpression:
        return node.elements.forEach((e) => (e.kind === SyntaxKind.SpreadElement ? expression(e.expression) : expression(e)));
      case SyntaxKind.PropertyAccessExpression:
        if (node.questionDotToken !== undefined) return notInL(node, 'optional chaining (?.)');
        if (node.name.kind === SyntaxKind.PrivateIdentifier) return notInL(node.name, 'a private name');
        return expression(node.expression);
      case SyntaxKind.CallExpression:
        if (node.questionDotToken !== undefined) return notInL(node, 'optional chaining (?.)');
        if (node.expression.kind === SyntaxKind.ImportKeyword) return notInL(node, 'a dynamic import');
        expression(node.expression);
        node.typeArguments?.forEach(type);
        return node.arguments.forEach((a) => (a.kind === SyntaxKind.SpreadElement ? expression(a.expression) : expression(a)));
      case SyntaxKind.ArrowFunction:
        return arrow(node);
      case SyntaxKind.AsExpression:
        if (node.type.kind === SyntaxKind.TypeReference && node.type.typeName.kind === SyntaxKind.Identifier && node.type.typeName.text === 'const') return expression(node.expression);
        return notInL(node, 'a type assertion (as); only `as const`');
      case SyntaxKind.SatisfiesExpression:
        type(node.type);
        return expression(node.expression);
      case SyntaxKind.BinaryExpression:
        if (!arithmetic.has(node.operatorToken.kind)) return notInL(node.operatorToken, `the operator ${tokenText(node.operatorToken.kind)}`);
        expression(node.left);
        return expression(node.right);
      case SyntaxKind.PrefixUnaryExpression:
        if (node.operator !== SyntaxKind.MinusToken && node.operator !== SyntaxKind.PlusToken) return notInL(node, `the operator ${tokenText(node.operator)}`);
        return expression(node.operand);
      default:
        return notInL(node);
    }
  };

  const arrow = (node) => {
    if (node.modifiers?.some((m) => m.kind === SyntaxKind.AsyncKeyword)) return notInL(node, 'an async function');
    node.typeParameters?.forEach(typeParameter);
    node.parameters.forEach(parameter);
    if (node.type !== undefined) {
      if (node.type.kind === SyntaxKind.TypePredicate) notInL(node.type, 'a type predicate');
      else type(node.type);
    }
    if (node.body.kind !== SyntaxKind.Block) return expression(node.body);
    // A block body is local const bindings followed by one return: let x = e in e.
    const statements = node.body.statements;
    statements.forEach((s, i) => {
      const last = i === statements.length - 1;
      if (last && s.kind === SyntaxKind.ReturnStatement) return s.expression === undefined ? notInL(s, 'a return without a value') : expression(s.expression);
      if (!last && s.kind === SyntaxKind.VariableStatement) return variables(s, new Set());
      return notInL(s, last ? `${readable(s.kind)} at the end of a body; a body ends in return` : readable(s.kind));
    });
    if (statements.length === 0) notInL(node.body, 'an empty body; a function returns a value');
  };

  const variables = (statement, allowedModifiers, atTop = false) => {
    modifiersOnly(statement, allowedModifiers);
    const list = statement.declarationList;
    if ((list.flags & (NodeFlags.Let | NodeFlags.Const)) !== NodeFlags.Const) return notInL(list, `${(list.flags & NodeFlags.Let) !== 0 ? 'let' : 'var'}; bindings are const`);
    list.declarations.forEach((d) => {
      binding(d.name);
      if (d.exclamationToken !== undefined) notInL(d, 'a definite-assignment assertion (!)');
      if (d.type !== undefined) type(d.type);
      if (d.initializer === undefined) return notInL(d, 'a binding without a value');
      // A module-level value is shared by every caller, so it is deeply readonly.
      if (atTop && !isDeepReadonly(checker.getTypeAtLocation(d.name))) notInL(d.name, 'a module-level value that is not deeply readonly');
      // Every named binding is a node of the reference graph, whatever its value:
      // a function can reach itself through a record field or an array as well.
      const bound = d.name.kind === SyntaxKind.Identifier ? checker.getSymbolAtLocation(d.name) : undefined;
      if (bound === undefined) return expression(d.initializer);
      const entry = { name: d.name.text, node: d.name, refers: new Set() };
      functions.set(bound.id, entry);
      const outer = within;
      within = entry;
      expression(d.initializer);
      within = outer;
    });
  };

  // ------------------------------------------------------------ module items

  const exportModifier = new Set([SyntaxKind.ExportKeyword]);
  const item = (node) => {
    switch (node.kind) {
      case SyntaxKind.ImportDeclaration:
        return moduleSpecifier(node);
      case SyntaxKind.ExportDeclaration:
        return moduleSpecifier(node);
      case SyntaxKind.TypeAliasDeclaration:
        modifiersOnly(node, exportModifier);
        node.typeParameters?.forEach(typeParameter);
        return type(node.type);
      case SyntaxKind.VariableStatement:
        if (isTag(node)) return modifiersOnly(node, new Set([SyntaxKind.DeclareKeyword, SyntaxKind.ExportKeyword]));
        return variables(node, exportModifier, true);
      case SyntaxKind.EmptyStatement:
        return;
      default:
        return notInL(node, `${readable(node.kind)} at the top of a module`);
    }
  };

  for (const fileName of roots) {
    const sourceFile = program.getSourceFile(fileName);
    if (sourceFile === undefined) continue;
    if (sourceFile.referencedFiles.length + sourceFile.typeReferenceDirectives.length + sourceFile.libReferenceDirectives.length > 0)
      problems.push({ file: sourceFile.fileName, line: 1, column: 1, message: 'Not in L: a triple-slash reference.', source: 'L' });
    for (const found of sourceFile.text.matchAll(/@ts-(ignore|expect-error|nocheck)/g)) at(sourceFile.fileName, found.index, `Not in L: a @ts-${found[1]} directive.`);
    sourceFile.statements.forEach(item);
  }

  // Recursion: no function binding reaches itself through the bindings it refers to.
  const reported = new Set();
  const reach = (id, path) => {
    const entry = functions.get(id);
    if (entry === undefined) return;
    if (path.includes(id)) {
      const cycle = path.slice(path.indexOf(id));
      if (!cycle.some((c) => reported.has(c))) {
        cycle.forEach((c) => reported.add(c));
        notInL(entry.node, `recursion (${[...cycle, id].map((c) => functions.get(c).name).join(' → ')})`);
      }
      return;
    }
    entry.refers.forEach((next) => reach(next, [...path, id]));
  };
  [...functions.keys()].forEach((id) => reach(id, []));

  // Recursive types: a type alias may refer to itself only through data, never
  // through a function type (μα. τ requires τ to be strictly positive).
  const aliases = new Map(); // symbol id -> { name, node, edges: [{ to, viaFunction }] }
  const aliasEdges = (node, viaFunction, edges) => {
    if (node.kind === SyntaxKind.TypeReference) {
      const symbol = target(checker.getSymbolAtLocation(node.typeName));
      if (symbol !== undefined && (symbol.flags & SymbolFlags.TypeAlias) !== 0) edges.push({ to: symbol.id, viaFunction });
    }
    const inner = viaFunction || node.kind === SyntaxKind.FunctionType;
    node.forEachChild((child) => {
      aliasEdges(child, inner, edges);
    });
  };
  for (const fileName of roots) {
    const sourceFile = program.getSourceFile(fileName);
    sourceFile?.statements.forEach((st) => {
      if (st.kind !== SyntaxKind.TypeAliasDeclaration) return;
      const symbol = checker.getSymbolAtLocation(st.name);
      if (symbol === undefined) return;
      const edges = [];
      aliasEdges(st.type, false, edges);
      aliases.set(symbol.id, { name: st.name.text, node: st.name, edges });
    });
  }
  const negative = (start) => {
    const visit = (id, crossed, seen) =>
      (aliases.get(id)?.edges ?? []).some((e) => (e.to === start ? crossed || e.viaFunction : !seen.has(e.to) && visit(e.to, crossed || e.viaFunction, new Set([...seen, e.to]))));
    return visit(start, false, new Set([start]));
  };
  aliases.forEach((a, id) => negative(id) && notInL(a.node, `a type that contains itself through a function (${a.name}); recursive types recur only through data`));

  return problems;
};

// Run as a command (directly, or through the npx/bin symlink).
if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const project = process.argv[2] ?? 'tsconfig.json';
  const problems = check({ project });
  for (const p of problems) console.log(`${relative(process.cwd(), p.file)}:${p.line}:${p.column}  ${p.message}`);
  console.log(problems.length === 0 ? 'Pure check passed.' : `${problems.length} problem(s).`);
  process.exit(problems.length === 0 ? 0 : 1);
}
