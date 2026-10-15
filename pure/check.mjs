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

import ts from 'typescript';
import { realpathSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
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
  [ts.SyntaxKind.AnyKeyword, '`any` turns off type checking. Use a specific type, or `unknown` and decode it in the shell.'],
  [ts.SyntaxKind.TypeAssertionExpression, 'A type assertion overrides the compiler. Make the value the right type where it is created.'],
  [ts.SyntaxKind.NonNullExpression, '`!` claims a value is present without checking. Decide absence with an Option and `match`.'],
  [ts.SyntaxKind.IfStatement, '`if` is not exhaustive. Model the cases as a Union and use `match`, or use `bool` for a boolean.'],
  [ts.SyntaxKind.SwitchStatement, '`switch` is not exhaustive. Model the cases as a Union and use `match`.'],
  [ts.SyntaxKind.ConditionalExpression, '`?:` is not exhaustive. Use `match` on a Union, or `bool` for a boolean.'],
  [ts.SyntaxKind.ForStatement, 'Loops need mutation. Use map, filter, reduce or recursion.'],
  [ts.SyntaxKind.ForInStatement, 'Loops need mutation. Use map, filter, reduce or recursion.'],
  [ts.SyntaxKind.ForOfStatement, 'Loops need mutation. Use map, filter, reduce or recursion.'],
  [ts.SyntaxKind.WhileStatement, 'Loops need mutation. Use map, filter, reduce or recursion.'],
  [ts.SyntaxKind.DoStatement, 'Loops need mutation. Use map, filter, reduce or recursion.'],
  [ts.SyntaxKind.ThrowStatement, '`throw` is a hidden exit. Return a Result.'],
  [ts.SyntaxKind.TryStatement, '`try` handles hidden exits. Return and `match` a Result.'],
  [ts.SyntaxKind.ClassDeclaration, 'Classes carry mutable state. Use a type for the data and functions over it.'],
  [ts.SyntaxKind.ClassExpression, 'Classes carry mutable state. Use a type for the data and functions over it.'],
  [ts.SyntaxKind.ThisKeyword, '`this` depends on how a function is called. Pass the value as a parameter.'],
  [ts.SyntaxKind.NewExpression, '`new` creates mutable objects. Use object literals and functions.'],
  [ts.SyntaxKind.DeleteExpression, '`delete` mutates an object. Build a new object without the field.'],
  [ts.SyntaxKind.YieldExpression, 'Generators are stateful. Return an array or a Program.'],
  [ts.SyntaxKind.ImportEqualsDeclaration, 'Import with `import … from`.'],
  [ts.SyntaxKind.TaggedTemplateExpression, 'Tagged templates call a function implicitly. Call it explicitly.'],
]);

const assignmentOperators = new Set([
  ts.SyntaxKind.EqualsToken, ts.SyntaxKind.PlusEqualsToken, ts.SyntaxKind.MinusEqualsToken, ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.AsteriskAsteriskEqualsToken, ts.SyntaxKind.SlashEqualsToken, ts.SyntaxKind.PercentEqualsToken,
  ts.SyntaxKind.LessThanLessThanEqualsToken, ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken, ts.SyntaxKind.AmpersandEqualsToken, ts.SyntaxKind.BarEqualsToken,
  ts.SyntaxKind.CaretEqualsToken, ts.SyntaxKind.AmpersandAmpersandEqualsToken, ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

const branchingOperators = new Map([
  [ts.SyntaxKind.AmpersandAmpersandToken, '`&&` branches on its left side. Use `bool`, or `match` on a Union.'],
  [ts.SyntaxKind.BarBarToken, '`||` branches on its left side. Use `bool`, or `match` on a Union.'],
  [ts.SyntaxKind.QuestionQuestionToken, '`??` branches on absence. Decide absence with an Option and `match`.'],
]);

export const check = ({ project, files }) => {
  const problems = [];
  const report = (node, message) => {
    const sourceFile = node.getSourceFile();
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    problems.push({ file: sourceFile.fileName, line: line + 1, column: character + 1, message });
  };

  const configPath = resolve(project);
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) return [{ file: configPath, line: 1, column: 1, message: ts.flattenDiagnosticMessageText(config.error.messageText, ' ') }];
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath));
  const options = { ...parsed.options, ...enforced };
  delete options.lib;

  const roots = new Set((files ?? parsed.fileNames).map((f) => resolve(f)).filter((f) => f !== pureLib));
  const program = ts.createProgram([pureLib, ...roots], options);
  const checker = program.getTypeChecker();

  // 1. The compiler's own errors.
  for (const d of ts.getPreEmitDiagnostics(program)) {
    const message = ts.flattenDiagnosticMessageText(d.messageText, ' ');
    if (d.file === undefined || d.start === undefined) problems.push({ file: configPath, line: 1, column: 1, message });
    else {
      const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
      problems.push({ file: d.file.fileName, line: line + 1, column: character + 1, message });
    }
  }

  // Does any part of this type have a call signature, a construct signature or
  // a getter? Such a value could perform an effect when the pure code uses it.
  const holdsFunction = (type, seen = new Set()) => {
    if (seen.has(type)) return false;
    seen.add(type);
    const flags = type.getFlags();
    if (flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.BigIntLike | ts.TypeFlags.ESSymbolLike | ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void | ts.TypeFlags.Never | ts.TypeFlags.Unknown)) return false;
    if (type.isUnionOrIntersection()) return type.types.some((t) => holdsFunction(t, seen));
    if (flags & ts.TypeFlags.TypeParameter) {
      const constraint = checker.getBaseConstraintOfType(type);
      return constraint !== undefined && holdsFunction(constraint, seen);
    }
    if (checker.isArrayType(type) || checker.isTupleType(type)) return checker.getTypeArguments(type).some((t) => holdsFunction(t, seen));
    if (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0) return true;
    return checker.getPropertiesOfType(type).some((p) => (p.getFlags() & ts.SymbolFlags.GetAccessor) !== 0 || holdsFunction(checker.getTypeOfSymbol(p), seen));
  };

  // Is this module specifier allowed? The pure entry of the library, or a
  // file of this project.
  const allowedImport = (specifier) => {
    if (!ts.isStringLiteral(specifier)) return false;
    if (specifier.text === PURE_ENTRY) return true;
    const symbol = checker.getSymbolAtLocation(specifier);
    const declaration = symbol?.declarations?.[0];
    return declaration !== undefined && roots.has(resolve(declaration.getSourceFile().fileName));
  };

  // `declare const NAME: unique symbol;` names a type and creates no value.
  const isTagDeclaration = (node) =>
    ts.isVariableStatement(node) &&
    (node.declarationList.flags & ts.NodeFlags.Const) !== 0 &&
    node.declarationList.declarations.every((d) => d.initializer === undefined && d.type !== undefined && ts.isTypeOperatorNode(d.type) && d.type.operator === ts.SyntaxKind.UniqueKeyword);
  const isDeclaredTag = (symbol) => {
    const declaration = symbol?.valueDeclaration;
    return declaration !== undefined && ts.isVariableDeclaration(declaration) && isTagDeclaration(declaration.parent.parent);
  };
  const insideTypeQuery = (node) => (node.parent === undefined ? false : ts.isTypeQueryNode(node.parent) || (ts.isQualifiedName(node.parent) && insideTypeQuery(node.parent)));

  const visit = (node) => {
    const refused = refusedSyntax.get(node.kind);
    if (refused !== undefined) report(node, refused);

    if (ts.isAsExpression(node) && !(ts.isTypeReferenceNode(node.type) && node.type.typeName.getText() === 'const'))
      report(node, '`as` overrides the compiler. Make the value the right type where it is created. (`as const` is allowed.)');

    if (ts.isVariableDeclarationList(node) && (node.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) !== ts.NodeFlags.Const)
      report(node, '`let` and `var` allow reassignment. Use `const` and compute a new value.');

    if (ts.isBinaryExpression(node)) {
      if (assignmentOperators.has(node.operatorToken.kind)) report(node, 'Assignment mutates. Compute a new value and bind it with `const`.');
      const branching = branchingOperators.get(node.operatorToken.kind);
      if (branching !== undefined) report(node, branching);
    }

    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken))
      report(node, '`++` and `--` mutate. Compute a new value.');

    if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) || ts.isCallExpression(node)) && node.questionDotToken !== undefined)
      report(node, '`?.` branches on absence. Decide absence with an Option and `match`.');

    if (ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword) && !isTagDeclaration(node))
      report(node, '`declare` asserts a value exists without providing it. Import it or define it. (`declare const NAME: unique symbol;` is allowed, to name an Opaque type.)');

    if (ts.isIdentifier(node) && !ts.isVariableDeclaration(node.parent) && isDeclaredTag(checker.getSymbolAtLocation(node)) && !insideTypeQuery(node))
      report(node, 'A declared tag has no runtime value. Use it only as `typeof NAME`.');

    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined && !allowedImport(node.moduleSpecifier))
      report(node.moduleSpecifier, `Pure code imports only from '${PURE_ENTRY}' and from other files of this project.`);

    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require')))
      report(node, `Pure code imports only from '${PURE_ENTRY}' and from other files of this project, with \`import … from\`.`);

    if (ts.isParameter(node) && ts.isFunctionLike(node.parent) && 'body' in node.parent && node.parent.body !== undefined && holdsFunction(checker.getTypeAtLocation(node)))
      report(node, 'A parameter cannot hold a function, method or getter: the caller could pass one that performs an effect. Pass data, or return a Program describing the effect.');

    ts.forEachChild(node, visit);
  };

  for (const sourceFile of program.getSourceFiles()) {
    if (!roots.has(resolve(sourceFile.fileName))) continue;
    if (sourceFile.referencedFiles.length + sourceFile.typeReferenceDirectives.length + sourceFile.libReferenceDirectives.length > 0)
      problems.push({ file: sourceFile.fileName, line: 1, column: 1, message: 'Triple-slash references can add libraries back. Remove them.' });
    for (const match of sourceFile.text.matchAll(/@ts-(ignore|expect-error|nocheck)/g)) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(match.index);
      problems.push({ file: sourceFile.fileName, line: line + 1, column: character + 1, message: `\`@ts-${match[1]}\` silences the compiler. Fix the error instead.` });
    }
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
