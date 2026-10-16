#!/usr/bin/env node
// Checks a pure project.
//
//   npx fp-shapes-check tsconfig.pure.json
//
// 1. Compiles the project with only the pure standard library (lib.d.ts in
//    this folder). The compiler options that make it pure are set here and
//    override the tsconfig, so editing the tsconfig cannot loosen them.
// 2. Refuses what the compiler allows but pure code must not use. Each
//    refusal says what was found and what to do instead.
//
// Exits 1 if anything is reported.
//
// Built on TypeScript 7's API (`typescript/unstable/*`), which the TypeScript
// team marks unstable; the package pins TypeScript to an exact version so the
// API this file uses is the API that is installed.

import { API, SignatureKind, SymbolFlags, TypeFlags } from 'typescript/unstable/sync';
import { NodeFlags, SyntaxKind } from 'typescript/unstable/ast';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const pureLib = resolve(dirname(fileURLToPath(import.meta.url)), 'lib.d.ts');

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

// What each construct is refused for, by syntax kind.
const refusedSyntax = new Map([
  [SyntaxKind.AnyKeyword, '`any` turns off type checking. Use a specific type, or `unknown` and decode it in the shell.'],
  [SyntaxKind.TypeAssertionExpression, 'A type assertion overrides the compiler. Make the value the right type where it is created.'],
  [SyntaxKind.NonNullExpression, '`!` claims a value is present without checking. Decide absence with an Option and `match`.'],
  [SyntaxKind.IfStatement, '`if` is not exhaustive. Model the cases as a Union and use `match`, or use `bool` for a boolean.'],
  [SyntaxKind.SwitchStatement, '`switch` is not exhaustive. Model the cases as a Union and use `match`.'],
  [SyntaxKind.ConditionalExpression, '`?:` is not exhaustive. Use `match` on a Union, or `bool` for a boolean.'],
  [SyntaxKind.ForStatement, 'Loops need mutation. Use map, filter, reduce or recursion.'],
  [SyntaxKind.ForInStatement, 'Loops need mutation. Use map, filter, reduce or recursion.'],
  [SyntaxKind.ForOfStatement, 'Loops need mutation. Use map, filter, reduce or recursion.'],
  [SyntaxKind.WhileStatement, 'Loops need mutation. Use map, filter, reduce or recursion.'],
  [SyntaxKind.DoStatement, 'Loops need mutation. Use map, filter, reduce or recursion.'],
  [SyntaxKind.ThrowStatement, '`throw` is a hidden exit. Return a Result.'],
  [SyntaxKind.TryStatement, '`try` handles hidden exits. Return and `match` a Result.'],
  [SyntaxKind.ClassDeclaration, 'Classes carry mutable state. Use a type for the data and functions over it.'],
  [SyntaxKind.ClassExpression, 'Classes carry mutable state. Use a type for the data and functions over it.'],
  [SyntaxKind.ThisKeyword, '`this` depends on how a function is called. Pass the value as a parameter.'],
  [SyntaxKind.NewExpression, '`new` creates mutable objects. Use object literals and functions.'],
  [SyntaxKind.DeleteExpression, '`delete` mutates an object. Build a new object without the field.'],
  [SyntaxKind.YieldExpression, 'Generators are stateful. Return an array or a Program.'],
  [SyntaxKind.ImportEqualsDeclaration, 'Import with `import … from`.'],
  [SyntaxKind.TaggedTemplateExpression, 'Tagged templates call a function implicitly. Call it explicitly.'],
]);

const assignmentOperators = new Set([
  SyntaxKind.EqualsToken, SyntaxKind.PlusEqualsToken, SyntaxKind.MinusEqualsToken, SyntaxKind.AsteriskEqualsToken,
  SyntaxKind.AsteriskAsteriskEqualsToken, SyntaxKind.SlashEqualsToken, SyntaxKind.PercentEqualsToken,
  SyntaxKind.LessThanLessThanEqualsToken, SyntaxKind.GreaterThanGreaterThanEqualsToken,
  SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken, SyntaxKind.AmpersandEqualsToken, SyntaxKind.BarEqualsToken,
  SyntaxKind.CaretEqualsToken, SyntaxKind.AmpersandAmpersandEqualsToken, SyntaxKind.BarBarEqualsToken,
  SyntaxKind.QuestionQuestionEqualsToken,
]);

const branchingOperators = new Map([
  [SyntaxKind.AmpersandAmpersandToken, '`&&` branches on its left side. Use `bool`, or `match` on a Union.'],
  [SyntaxKind.BarBarToken, '`||` branches on its left side. Use `bool`, or `match` on a Union.'],
  [SyntaxKind.QuestionQuestionToken, '`??` branches on absence. Decide absence with an Option and `match`.'],
]);

const functionKinds = new Set([
  SyntaxKind.ArrowFunction, SyntaxKind.FunctionDeclaration, SyntaxKind.FunctionExpression, SyntaxKind.MethodDeclaration,
  SyntaxKind.Constructor, SyntaxKind.GetAccessor, SyntaxKind.SetAccessor,
]);

const dataFlags =
  TypeFlags.StringLike | TypeFlags.NumberLike | TypeFlags.BooleanLike | TypeFlags.BigIntLike | TypeFlags.ESSymbolLike |
  TypeFlags.Null | TypeFlags.Undefined | TypeFlags.Void | TypeFlags.Never | TypeFlags.Unknown;

// The project the compiler sees: the user's tsconfig, with the options that
// make it pure forced on and the file list fixed, written next to nothing the
// user owns.
const derivedConfig = (configPath, roots) => {
  const dir = mkdtempSync(join(tmpdir(), 'fp-shapes-check-'));
  const path = join(dir, 'tsconfig.json');
  writeFileSync(path, JSON.stringify({ extends: configPath, compilerOptions: enforced, files: [pureLib, ...roots], include: [] }));
  return { path, dispose: () => rmSync(dir, { recursive: true, force: true }) };
};

// The files a tsconfig names, as the compiler resolves them.
const filesOf = (api, configPath) => {
  const parsed = api.parseConfigFile(configPath);
  return parsed.fileNames ?? [];
};

export const check = ({ project, files }) => {
  const configPath = resolve(project);
  const api = new API({ cwd: dirname(configPath) });
  try {
    const roots = (files ?? filesOf(api, configPath)).map((f) => resolve(f)).filter((f) => f !== pureLib);
    const rootSet = new Set(roots);
    const derived = derivedConfig(configPath, roots);
    try {
      const snapshot = api.updateSnapshot({ openProjects: [derived.path] });
      const loaded = snapshot.getProject(derived.path);
      return loaded === undefined ? [{ file: configPath, line: 1, column: 1, message: 'The project could not be loaded.' }] : inspect(loaded, rootSet, configPath);
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

  const at = (fileName, pos, message) => {
    const sourceFile = fileName === undefined ? undefined : program.getSourceFile(fileName);
    if (sourceFile === undefined) return problems.push({ file: configPath, line: 1, column: 1, message });
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(pos);
    problems.push({ file: sourceFile.fileName, line: line + 1, column: character + 1, message });
  };
  const report = (node, message) => {
    const sourceFile = node.getSourceFile();
    at(sourceFile.fileName, node.getStart(sourceFile), message);
  };

  // 1. The compiler's own errors.
  const diagnostics = [...program.getProgramDiagnostics(), ...program.getSyntacticDiagnostics(), ...program.getSemanticDiagnostics()];
  for (const d of diagnostics) at(d.fileName, d.pos, d.text);

  // Does any part of this type have a call signature, a construct signature or
  // a getter? Such a value could perform an effect when the pure code uses it.
  const holdsFunction = (type, seen = new Set()) => {
    if (type === undefined || seen.has(type.id)) return false;
    seen.add(type.id);
    if (type.flags & dataFlags) return false;
    if (type.flags & (TypeFlags.Union | TypeFlags.Intersection)) return type.getTypes().some((t) => holdsFunction(t, seen));
    if (type.flags & TypeFlags.TypeParameter) return holdsFunction(checker.getBaseConstraintOfType(type), seen);
    if (checker.isArrayType(type) || checker.isTupleType(type)) return checker.getTypeArguments(type).some((t) => holdsFunction(t, seen));
    if (checker.getSignaturesOfType(type, SignatureKind.Call).length > 0 || checker.getSignaturesOfType(type, SignatureKind.Construct).length > 0) return true;
    return checker.getPropertiesOfType(type).some((p) => (p.flags & SymbolFlags.GetAccessor) !== 0 || holdsFunction(checker.getTypeOfSymbol(p), seen));
  };

  // Is this module specifier allowed? The pure entry of the library, or a
  // file of this project.
  const allowedImport = (specifier) => {
    if (specifier.kind !== SyntaxKind.StringLiteral) return false;
    if (specifier.text === PURE_ENTRY) return true;
    const declaration = checker.getSymbolAtLocation(specifier)?.declarations?.[0];
    return declaration !== undefined && roots.has(resolve(declaration.path));
  };

  // `declare const NAME: unique symbol;` names a type and creates no value.
  const isTagDeclaration = (node) =>
    node.kind === SyntaxKind.VariableStatement &&
    (node.declarationList.flags & NodeFlags.Const) !== 0 &&
    node.declarationList.declarations.every(
      (d) => d.initializer === undefined && d.type !== undefined && d.type.kind === SyntaxKind.TypeOperator && d.type.operator === SyntaxKind.UniqueKeyword,
    );
  const isDeclaredTag = (symbol) => {
    const declaration = symbol?.valueDeclaration?.resolve(project);
    return declaration !== undefined && declaration.kind === SyntaxKind.VariableDeclaration && isTagDeclaration(declaration.parent.parent);
  };
  const insideTypeQuery = (node) =>
    node.parent === undefined ? false : node.parent.kind === SyntaxKind.TypeQuery || (node.parent.kind === SyntaxKind.QualifiedName && insideTypeQuery(node.parent));
  const isDeclare = (node) => node.modifiers?.some((m) => m.kind === SyntaxKind.DeclareKeyword) === true;

  const visit = (node) => {
    const refused = refusedSyntax.get(node.kind);
    if (refused !== undefined) report(node, refused);

    if (node.kind === SyntaxKind.AsExpression && !(node.type.kind === SyntaxKind.TypeReference && node.type.typeName.text === 'const'))
      report(node, '`as` overrides the compiler. Make the value the right type where it is created. (`as const` is allowed.)');

    if (node.kind === SyntaxKind.VariableDeclarationList && (node.flags & (NodeFlags.Let | NodeFlags.Const)) !== NodeFlags.Const)
      report(node, '`let` and `var` allow reassignment. Use `const` and compute a new value.');

    if (node.kind === SyntaxKind.BinaryExpression) {
      if (assignmentOperators.has(node.operatorToken.kind)) report(node, 'Assignment mutates. Compute a new value and bind it with `const`.');
      const branching = branchingOperators.get(node.operatorToken.kind);
      if (branching !== undefined) report(node, branching);
    }

    if ((node.kind === SyntaxKind.PrefixUnaryExpression || node.kind === SyntaxKind.PostfixUnaryExpression) && (node.operator === SyntaxKind.PlusPlusToken || node.operator === SyntaxKind.MinusMinusToken))
      report(node, '`++` and `--` mutate. Compute a new value.');

    if ((node.kind === SyntaxKind.PropertyAccessExpression || node.kind === SyntaxKind.ElementAccessExpression || node.kind === SyntaxKind.CallExpression) && node.questionDotToken !== undefined)
      report(node, '`?.` branches on absence. Decide absence with an Option and `match`.');

    if (isDeclare(node) && !isTagDeclaration(node))
      report(node, '`declare` asserts a value exists without providing it. Import it or define it. (`declare const NAME: unique symbol;` is allowed, to name an Opaque type.)');

    if (node.kind === SyntaxKind.Identifier && node.parent.kind !== SyntaxKind.VariableDeclaration && !insideTypeQuery(node) && isDeclaredTag(checker.getSymbolAtLocation(node)))
      report(node, 'A declared tag has no runtime value. Use it only as `typeof NAME`.');

    if ((node.kind === SyntaxKind.ImportDeclaration || node.kind === SyntaxKind.ExportDeclaration) && node.moduleSpecifier !== undefined && !allowedImport(node.moduleSpecifier))
      report(node.moduleSpecifier, `Pure code imports only from '${PURE_ENTRY}' and from other files of this project.`);

    if (node.kind === SyntaxKind.CallExpression && (node.expression.kind === SyntaxKind.ImportKeyword || (node.expression.kind === SyntaxKind.Identifier && node.expression.text === 'require')))
      report(node, `Pure code imports only from '${PURE_ENTRY}' and from other files of this project, with \`import … from\`.`);

    if (node.kind === SyntaxKind.Parameter && functionKinds.has(node.parent.kind) && node.parent.body !== undefined && holdsFunction(checker.getTypeAtLocation(node)))
      report(node, 'A parameter cannot hold a function, method or getter: the caller could pass one that performs an effect. Pass data, or return a Program describing the effect.');

    node.forEachChild((child) => {
      visit(child);
    });
  };

  for (const fileName of roots) {
    const sourceFile = program.getSourceFile(fileName);
    if (sourceFile === undefined) continue;
    if (sourceFile.referencedFiles.length + sourceFile.typeReferenceDirectives.length + sourceFile.libReferenceDirectives.length > 0)
      problems.push({ file: sourceFile.fileName, line: 1, column: 1, message: 'Triple-slash references can add libraries back. Remove them.' });
    for (const found of sourceFile.text.matchAll(/@ts-(ignore|expect-error|nocheck)/g)) at(sourceFile.fileName, found.index, `\`@ts-${found[1]}\` silences the compiler. Fix the error instead.`);
    visit(sourceFile);
  }

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
