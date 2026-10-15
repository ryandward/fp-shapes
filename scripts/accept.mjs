// The acceptor. tsc computes the type of every expression; this walks the
// domain's syntax trees admitting a grammar, and asks the checker for types
// where a rule needs them. It is not a blacklist: a form the walk does not
// name is refused, so what is accepted is what the grammar names.
//
//   node scripts/accept.mjs [--tsconfig tsconfig.json] [--kernel src] <dir or file>...
//   node scripts/accept.mjs [--kernel src] --fixtures fixtures/accept
//
// Domain files are the .ts files under the named paths that are not boundary
// (**/boundary/**), effects (**/effects/**), foreign (foreign.ts), tests or
// typetests. The kernel (--kernel, the vendored library) is trusted and not
// walked; its own tiers and gates hold it. The rules, each named in its
// refusal:
//
//   grammar      a form outside the grammar: a branch (if, ?:, &&, ||, ??,
//                switch), a loop, a comparison, a throw or try, an assertion
//                other than `as const`, a spread into a record, a class, a
//                `new`, an await, a mutable binding, an expression statement,
//                a body that does not end in a return
//   exactness    where a value meets a declared type (a binding with a type,
//                a return, an argument), the value's type has exactly the
//                declared keys, case by case through unions, element by
//                element through arrays; tsc checks this for fresh literals
//                only, this checks it for every value
//   purity       a call's callee is an export of the kernel, a function the
//                domain declared, a method of a fact (string, number, array),
//                or a function the kernel made; never a parameter, a function
//                read from a record, a global, an import from outside the
//                domain, a call returning a Promise, nothing, or never
//   decision     no call returns a boolean: a boolean is a decision made
//                elsewhere; the domain reads a fact's field or folds a Variant
//   termination  no domain function reaches itself through calls or references
//   closed       a type the rules cannot decide (any, unknown, a type
//                parameter) is refused where it appears
//
// Fixtures: every domain .ts under --fixtures says what it expects on one
// line, `// expect: <substring of the refusal>` or `// expect: clean`; every
// fixture compiles; each rule must be the only rule refusing some fixture,
// so a rule removed is a fixture that fails.

import ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';

// ---------------------------------------------------------------- arguments

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};
const taken = new Set(
  ['--tsconfig', '--kernel', '--fixtures'].flatMap((name) => {
    const at = args.indexOf(name);
    return at === -1 ? [] : [at, at + 1];
  }),
);
const tsconfigPath = option('--tsconfig', 'tsconfig.json');
const kernelDir = resolve(option('--kernel', 'src'));
const fixturesDir = option('--fixtures', null);
const targets = args.filter((_, i) => !taken.has(i)).map((p) => resolve(p));

// ---------------------------------------------------------------- files

const listTs = (path) => {
  const stat = statSync(path);
  if (stat.isFile()) return path.endsWith('.ts') ? [path] : [];
  return readdirSync(path)
    .sort()
    .flatMap((name) => (name === 'node_modules' ? [] : listTs(join(path, name))));
};

const isDomainFile = (file) => {
  const parts = file.split(sep);
  if (parts.includes('boundary') || parts.includes('effects') || parts.includes('node_modules')) return false;
  if (file.endsWith('foreign.ts') || file.endsWith('.test.ts') || file.endsWith('.typetest.ts') || file.endsWith('.d.ts')) return false;
  return file.endsWith('.ts');
};

const inKernel = (file) => file !== undefined && resolve(file).startsWith(kernelDir + sep);

// The kernel's shell-side exports: the ledger and the attempt are the
// interpreter's, not the domain's.
const kernelShell = (file) => inKernel(file) && (basename(file) === 'ledger.ts' || file.split(sep).includes('effects'));

// ---------------------------------------------------------------- program

const config = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
if (config.error !== undefined) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, resolve(tsconfigPath, '..'));
const listed = fixturesDir === null ? targets.flatMap(listTs) : listTs(resolve(fixturesDir));
const program = ts.createProgram([...new Set([...parsed.fileNames, ...listed])], { ...parsed.options, noEmit: true });
const checker = program.getTypeChecker();
const domainFiles = listed.filter(isDomainFile).map((f) => program.getSourceFile(f)).filter((f) => f !== undefined);

// ---------------------------------------------------------------- refusals

const refusals = [];
const refuse = (node, rule, message) => {
  const file = node.getSourceFile();
  const { line, character } = file.getLineAndCharacterOfPosition(node.getStart());
  refusals.push({ file: relative(process.cwd(), file.fileName), line: line + 1, column: character + 1, rule, message });
};

// ---------------------------------------------------------------- types

const flags = (type, f) => (type.flags & f) !== 0;
const undecidable = (type) => flags(type, ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter);

const literalKind = (type) => {
  const kind = type.getProperty('kind');
  if (kind === undefined) return null;
  const t = checker.getTypeOfSymbol(kind);
  return t.isStringLiteral() ? t.value : null;
};

// The properties of a record type by key, leaving out the exclusion keys a
// Variant carries for its other cases: optional, with no value possible
// (`?: never`, which reads as undefined).
const excluded = (p) => (p.flags & ts.SymbolFlags.Optional) !== 0 && flags(checker.getTypeOfSymbol(p), ts.TypeFlags.Never | ts.TypeFlags.Undefined);
const propertiesOf = (type) => new Map(type.getProperties().filter((p) => !excluded(p)).map((p) => [String(p.escapedName), p]));
const keysOf = (type) => [...propertiesOf(type).keys()].sort();

const isRecord = (type) => flags(type, ts.TypeFlags.Object | ts.TypeFlags.Intersection) && type.getCallSignatures().length === 0 && type.getConstructSignatures().length === 0;
const isArray = (type) => checker.isArrayType(type) || checker.isTupleType(type);

// Does `value` have exactly the keys `target` declares, all the way down?
// Returns null when it does, else a sentence.
const inexact = (value, target, depth = 0) => {
  if (value === target || depth > 16) return null;
  if (undecidable(value) || undecidable(target)) return 'a type the rules cannot decide';
  if (value.isUnion()) {
    for (const member of value.types) {
      const why = inexact(member, target, depth + 1);
      if (why !== null) return why;
    }
    return null;
  }
  if (target.isUnion()) {
    const kind = literalKind(value);
    const cases = kind === null ? target.types.filter(isRecord) : target.types.filter((t) => literalKind(t) === kind);
    if (cases.length === 0) return null; // no case to hold it against: tsc's business
    if (cases.length === 1) return inexact(value, cases[0], depth + 1);
    return cases.some((c) => inexact(value, c, depth + 1) === null) ? null : `no case of the declared type has exactly the keys {${keysOf(value).join(', ')}}`;
  }
  if (isArray(target)) {
    const [t] = checker.getTypeArguments(target);
    const [v] = isArray(value) ? checker.getTypeArguments(value) : [undefined];
    return t === undefined || v === undefined ? null : inexact(v, t, depth + 1);
  }
  if (!isRecord(target) || !isRecord(value)) return null; // primitives, functions: tsc's business
  const want = keysOf(target);
  const have = keysOf(value);
  if (want.join(',') !== have.join(',')) {
    const extra = have.filter((k) => !want.includes(k));
    const missing = want.filter((k) => !have.includes(k));
    return `the declared type has keys {${want.join(', ')}} and the value has {${have.join(', ')}}${extra.length > 0 ? `: a value does not carry keys its type lacks (${extra.join(', ')})` : ''}${missing.length > 0 ? `: missing ${missing.join(', ')}` : ''}`;
  }
  const valueProps = propertiesOf(value);
  const targetProps = propertiesOf(target);
  for (const key of want) {
    const why = inexact(checker.getTypeOfSymbol(valueProps.get(key)), checker.getTypeOfSymbol(targetProps.get(key)), depth + 1);
    if (why !== null) return why;
  }
  return null;
};

const checkExact = (node, valueType, targetType, what) => {
  const why = inexact(valueType, targetType);
  if (why !== null) refuse(node, why.startsWith('a type the rules') ? 'closed' : 'exactness', `${what}: ${why}`);
};

// ---------------------------------------------------------------- callees

// Methods of a fact: pure, total on their input, returning a fact. The ones
// that return a boolean are here too; the decision rule refuses them, so
// that refusal names the reason. Not here: the ones that throw on some
// input (`with`, `repeat`, `normalize`, `at` and `find`, which answer an
// absence).
const factMethods = new Set([
  'map', 'flatMap', 'filter', 'reduce', 'concat', 'slice', 'join', 'flat', 'toSorted', 'toReversed', 'entries', 'keys', 'values',
  'some', 'every', 'includes', 'startsWith', 'endsWith',
  'toUpperCase', 'toLowerCase', 'trim', 'trimStart', 'trimEnd', 'padStart', 'padEnd', 'split', 'toString', 'toFixed', 'localeCompare',
]);

// Methods of a kernel-made record the domain calls, by the record's type.
// Not here: `Sealed.open` and `Sealed.spend`, since a sealed value is read
// by its owner and the domain carries it; a step's `resume`, which the
// interpreter calls; the ledger.
const kernelMethods = { Algebra: new Set(['done', 'suspend']) };

const aliased = (symbol) => (symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol);

const declarationOf = (symbol) => symbol?.valueDeclaration ?? symbol?.declarations?.[0];
const fileOf = (symbol) => declarationOf(symbol)?.getSourceFile().fileName;

const isFact = (type) => isArray(type) || flags(type, ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BigIntLike);

// The name a type was declared under in the kernel, through a domain alias
// of it (`type Hold = Sealed<…>` is a Sealed), or null.
const kernelName = (type) => {
  const owner = [type.aliasSymbol, type.symbol].find((s) => s !== undefined && inKernel(fileOf(s)));
  return owner === undefined ? null : owner.getName();
};

// A fact has no functions: a parameter's type, all the way down, holds no
// call or construct signature, no accessor, and nothing undecided. A step
// and a sealed value are the kernel values the domain holds without
// reading; each keeps a function inside (the step's resumption, the
// seal's invariance witness) that the domain cannot call.
const carried = new Set(['Step', 'Erased', 'Sealed']);
const improper = (type, seen = new Set()) => {
  if (seen.has(type)) return null;
  seen.add(type);
  if (undecidable(type)) return 'is not decided (any, unknown, or a type parameter)';
  if (carried.has(kernelName(type))) return null;
  if (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0) return 'holds a function';
  if (type.isUnion() || type.isIntersection()) {
    for (const member of type.types) {
      const why = improper(member, seen);
      if (why !== null) return why;
    }
    return null;
  }
  if (isArray(type)) {
    for (const element of checker.getTypeArguments(type)) {
      const why = improper(element, seen);
      if (why !== null) return why;
    }
    return null;
  }
  if (!flags(type, ts.TypeFlags.Object)) return null;
  for (const property of type.getProperties()) {
    if ((property.flags & (ts.SymbolFlags.GetAccessor | ts.SymbolFlags.SetAccessor)) !== 0) return `holds an accessor (${property.getName()}), which runs when read`;
    if ((property.flags & ts.SymbolFlags.Method) !== 0) return `holds a method (${property.getName()})`;
    const why = improper(checker.getTypeOfSymbol(property), seen);
    if (why !== null) return why;
  }
  return null;
};

// Declared by the language, the runtime or a package: not a fact, not the
// kernel, not the domain.
const foreign = (symbol) => {
  const decl = declarationOf(symbol);
  if (decl === undefined) return false;
  const file = decl.getSourceFile();
  return program.isSourceFileDefaultLibrary(file) || file.fileName.includes(`${sep}node_modules${sep}`);
};

// The symbol an expression's object comes from, through parentheses,
// property reads and const bindings: `D.now` where `const D = Date` is Date.
const rootOf = (expression, seen = new Set()) => {
  if (ts.isParenthesizedExpression(expression) || ts.isPropertyAccessExpression(expression)) return rootOf(expression.expression, seen);
  if (!ts.isIdentifier(expression)) return undefined;
  const symbol = aliased(checker.getSymbolAtLocation(expression));
  if (symbol === undefined || seen.has(symbol)) return symbol;
  seen.add(symbol);
  const decl = declarationOf(symbol);
  if (decl !== undefined && ts.isVariableDeclaration(decl) && decl.initializer !== undefined && !ts.isCallExpression(decl.initializer)) return rootOf(decl.initializer, seen) ?? symbol;
  return symbol;
};

// Where a callee comes from: 'kernel', 'domain', 'parameter', or a sentence
// saying why the call is refused.
const origin = (callee, seen = new Set()) => {
  if (ts.isParenthesizedExpression(callee)) return origin(callee.expression, seen);
  if (ts.isCallExpression(callee)) return origin(callee.expression, seen); // f(x)(y) comes from f
  if (ts.isPropertyAccessExpression(callee)) {
    const objectType = checker.getTypeAtLocation(callee.expression);
    const property = aliased(checker.getSymbolAtLocation(callee.name));
    const file = fileOf(property);
    const name = callee.name.text;
    if (kernelShell(file)) return `${name} is the shell's: the ledger and the attempt belong to effects/`;
    if (inKernel(file)) {
      if (kernelMethods[kernelName(objectType) ?? '']?.has(name)) return 'kernel';
      if (objectType.symbol?.getName() === 'Sealed') return `a sealed value is read by its owner; the domain carries it, and the payload it needs arrives beside it as a fact`;
      return `${name} is the kernel's own: not a method the domain calls`;
    }
    if (checker.typeToString(objectType) === 'Math') return name === 'random' ? 'Math.random is an effect' : 'kernel';
    if (isFact(objectType)) return factMethods.has(name) ? 'kernel' : `${name} is not a method of a fact the domain calls`;
    const root = rootOf(callee.expression);
    if (foreign(root)) return `${callee.expression.getText()} is a global or a package, not a fact, the kernel or the domain`;
    // a record of functions the domain declared, called by name: a namespace
    const declaration = declarationOf(property);
    if (declaration !== undefined && ts.isPropertyAssignment(declaration) && isDomainFile(declaration.getSourceFile().fileName) && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) return 'domain';
    return `a function read from a value (${checker.typeToString(objectType)}) is not called: a fact has no functions, and a record with one is an effect`;
  }
  if (!ts.isIdentifier(callee)) return 'a callee is a name, a method of a fact, or the result of a kernel call';
  const symbol = aliased(checker.getSymbolAtLocation(callee));
  if (symbol === undefined) return `${callee.text} cannot be resolved`;
  if (seen.has(symbol)) return 'domain';
  seen.add(symbol);
  const decl = declarationOf(symbol);
  if (decl === undefined) return `${callee.text} has no declaration`;
  if (ts.isParameter(decl) || (ts.isBindingElement(decl) && ts.isParameter(decl.parent.parent))) return 'parameter';
  const file = decl.getSourceFile().fileName;
  if (kernelShell(file)) return `${callee.text} is the shell's: the ledger and the attempt belong to effects/`;
  if (inKernel(file)) return 'kernel';
  if (foreign(symbol)) return `${callee.text} is a global or a package, not a fact, the kernel or the domain`;
  if (!isDomainFile(file)) return `${callee.text} is declared in ${relative(process.cwd(), file)}, which is not a domain module`;
  if (ts.isFunctionDeclaration(decl)) return 'domain';
  if (ts.isVariableDeclaration(decl)) {
    const init = decl.initializer;
    if (init === undefined) return `${callee.text} has no value`;
    if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return 'domain';
    if (ts.isCallExpression(init) || ts.isIdentifier(init) || ts.isPropertyAccessExpression(init) || ts.isParenthesizedExpression(init)) return origin(init, seen);
    return `${callee.text} is bound to a value the rules cannot follow`;
  }
  if (ts.isBindingElement(decl)) {
    const declaration = decl.parent.parent;
    if (ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined) return origin(declaration.initializer, seen);
    return `${callee.text} is bound by a pattern the rules cannot follow`;
  }
  return `${callee.text} is declared as a ${ts.SyntaxKind[decl.kind]}, which the grammar does not name`;
};

// ---------------------------------------------------------------- the walk

const domainFunctions = new Map(); // symbol -> { name, node, reaches: Set<symbol> }
let current = null; // the domain binding being walked

const declare = (symbol, name, node) => {
  const entry = { name, node, reaches: new Set() };
  domainFunctions.set(symbol, entry);
  return entry;
};

// A reference to a domain binding from inside another is an edge: a function
// passed is a function that may be called.
const reach = (symbol) => {
  const target = aliased(symbol);
  if (current !== null && target !== undefined && isDomainFile(fileOf(target) ?? '')) current.reaches.add(target);
};

const within = (entry, walk) => {
  const outer = current;
  current = entry ?? outer;
  walk();
  current = outer;
};

const isAsConst = (node) => ts.isTypeReferenceNode(node.type) && ts.isIdentifier(node.type.typeName) && node.type.typeName.text === 'const';

const arithmetic = new Set([ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.SlashToken, ts.SyntaxKind.PercentToken, ts.SyntaxKind.AsteriskAsteriskToken]);

const walkExpression = (node) => {
  switch (node.kind) {
    case ts.SyntaxKind.Identifier:
      reach(checker.getSymbolAtLocation(node));
      return;
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NumericLiteral:
    case ts.SyntaxKind.BigIntLiteral:
    case ts.SyntaxKind.TrueKeyword:
    case ts.SyntaxKind.FalseKeyword:
    case ts.SyntaxKind.NullKeyword:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
      return;
    case ts.SyntaxKind.TemplateExpression:
      node.templateSpans.forEach((span) => walkExpression(span.expression));
      return;
    case ts.SyntaxKind.ParenthesizedExpression:
      walkExpression(node.expression);
      return;
    case ts.SyntaxKind.PropertyAccessExpression:
      if (node.questionDotToken !== undefined) refuse(node, 'grammar', 'an optional access reads an absence; a fact is total');
      walkExpression(node.expression);
      return;
    case ts.SyntaxKind.PrefixUnaryExpression:
      if (node.operator === ts.SyntaxKind.MinusToken) walkExpression(node.operand);
      else refuse(node, 'grammar', `${ts.tokenToString(node.operator)} is not a form of the domain: a not is a branch, a count is a new value`);
      return;
    case ts.SyntaxKind.BinaryExpression:
      if (arithmetic.has(node.operatorToken.kind)) {
        walkExpression(node.left);
        walkExpression(node.right);
        return;
      }
      refuse(node, 'grammar', `${ts.tokenToString(node.operatorToken.kind)} is not a form of the domain: a comparison or a logical operator is a decision, which a fold makes case by case`);
      return;
    case ts.SyntaxKind.AsExpression:
      if (isAsConst(node)) {
        walkExpression(node.expression);
        return;
      }
      refuse(node, 'grammar', 'an assertion is not a form of the domain; a type comes from the parser or the owner, never from a claim');
      return;
    case ts.SyntaxKind.SatisfiesExpression:
      checkExact(node.expression, checker.getTypeAtLocation(node.expression), checker.getTypeFromTypeNode(node.type), 'the value under satisfies');
      walkExpression(node.expression);
      return;
    case ts.SyntaxKind.ObjectLiteralExpression:
      for (const property of node.properties) {
        if (ts.isPropertyAssignment(property) && !ts.isComputedPropertyName(property.name)) {
          if (property.name.getText().replace(/^['"]|['"]$/g, '') === '__proto__') refuse(property, 'grammar', 'a record has no prototype to set; a fact is its keys');
          walkExpression(property.initializer);
        } else if (ts.isShorthandPropertyAssignment(property)) reach(checker.getShorthandAssignmentValueSymbol(property));
        else refuse(property, 'grammar', `${ts.SyntaxKind[property.kind]} in a record is not a form of the domain; a fact names every key with a value`);
      }
      return;
    case ts.SyntaxKind.ArrayLiteralExpression:
      for (const element of node.elements) walkExpression(ts.isSpreadElement(element) ? element.expression : element);
      return;
    case ts.SyntaxKind.ArrowFunction:
      walkFunction(node);
      return;
    case ts.SyntaxKind.CallExpression:
      walkCall(node);
      return;
    default:
      refuse(node, 'grammar', `${ts.SyntaxKind[node.kind]} is not a form of the domain`);
  }
};

const walkCall = (call) => {
  if (call.questionDotToken !== undefined) refuse(call, 'grammar', 'an optional call reads an absence; a fact is total');
  const from = origin(call.expression);
  if (from === 'parameter') refuse(call, 'purity', 'a function parameter is not called: an effect reaches the domain as data; a function as a fact does not exist');
  else if (from !== 'kernel' && from !== 'domain') refuse(call, 'purity', from);
  const resultType = checker.getTypeAtLocation(call);
  if (resultType.symbol?.getName() === 'Promise') refuse(call, 'purity', 'a call that returns a Promise is an effect; the domain returns a step and the interpreter performs it');
  else if (flags(resultType, ts.TypeFlags.Void)) refuse(call, 'purity', 'a call that returns nothing is performed for its effect');
  else if (flags(resultType, ts.TypeFlags.Never)) refuse(call, 'purity', 'a call that returns never halts; the domain returns a status');
  else if (flags(resultType, ts.TypeFlags.BooleanLike) && from !== 'domain') refuse(call, 'decision', "a boolean is a decision made elsewhere; the domain reads a fact's field or folds a Variant");
  // every argument given is exact against its parameter
  const signature = checker.getResolvedSignature(call);
  if (signature !== undefined) {
    signature.getParameters().forEach((param, i) => {
      const argument = call.arguments[i];
      if (argument === undefined) return;
      checkExact(argument, checker.getTypeAtLocation(argument), checker.getTypeOfSymbolAtLocation(param, call), `argument ${i + 1} of ${call.expression.getText()}`);
    });
  }
  walkExpression(call.expression);
  for (const argument of call.arguments) walkExpression(argument);
};

// The return type an unannotated function is held to: the one its context
// declares (a handler's, an arm's), when that is decided. A callee's own
// inference variable is not a declared type; the value is checked where
// it next meets one.
const contextualReturn = (fn) => {
  const contextual = checker.getContextualType(fn);
  if (contextual === undefined) return null;
  const signatures = contextual.getCallSignatures();
  if (signatures.length !== 1) return null;
  const returned = signatures[0].getReturnType();
  return undecidable(returned) ? null : returned;
};

const walkFunction = (fn) => {
  const modifiers = ts.canHaveModifiers(fn) ? (ts.getModifiers(fn) ?? []) : [];
  if (modifiers.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) || fn.asteriskToken !== undefined) refuse(fn, 'grammar', 'an async or generator function is a process; the domain returns a step and the interpreter runs it');
  for (const param of fn.parameters) {
    if (param.initializer !== undefined) refuse(param, 'grammar', 'a parameter has no default; an absence is decided at the boundary');
    if (param.questionToken !== undefined) refuse(param, 'grammar', 'a parameter is not optional; an absence is decided at the boundary');
    // Annotated, or typed by the callee it is passed to; either way decided,
    // and a fact all the way down.
    const why = improper(checker.getTypeAtLocation(param.name));
    if (why !== null) refuse(param, why.startsWith('is not decided') ? 'closed' : 'purity', `the type of ${param.name.getText()} ${why}; a fact has no functions, and an effect reaches the domain as data`);
  }
  const returnType = fn.type === undefined ? contextualReturn(fn) : checker.getTypeFromTypeNode(fn.type);
  const body = fn.body;
  if (body === undefined) return;
  if (!ts.isBlock(body)) {
    if (returnType !== null) checkExact(body, checker.getTypeAtLocation(body), returnType, 'the returned value');
    walkExpression(body);
    return;
  }
  const last = body.statements[body.statements.length - 1];
  if (last === undefined || !ts.isReturnStatement(last)) refuse(last ?? body, 'grammar', 'a body ends in a return; a function is its value');
  for (const statement of body.statements) {
    if (ts.isVariableStatement(statement)) walkVariables(statement);
    else if (ts.isReturnStatement(statement)) {
      if (statement.expression === undefined) refuse(statement, 'grammar', 'a return carries a value');
      else {
        if (returnType !== null) checkExact(statement.expression, checker.getTypeAtLocation(statement.expression), returnType, 'the returned value');
        walkExpression(statement.expression);
      }
    } else refuse(statement, 'grammar', `${ts.SyntaxKind[statement.kind]} is not a form of the domain; a body is const bindings and one return`);
  }
};

const walkVariables = (statement) => {
  if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0) refuse(statement, 'grammar', 'a binding is const; a changing value is a new value');
  for (const declaration of statement.declarationList.declarations) {
    const init = declaration.initializer;
    if (init === undefined) {
      refuse(declaration, 'grammar', 'a binding has a value');
      continue;
    }
    if (declaration.type !== undefined) checkExact(init, checker.getTypeAtLocation(init), checker.getTypeFromTypeNode(declaration.type), `the value bound to ${declaration.name.getText()}`);
    const symbol = ts.isIdentifier(declaration.name) ? checker.getSymbolAtLocation(declaration.name) : undefined;
    const entry = symbol === undefined ? null : declare(symbol, declaration.name.text, declaration);
    within(entry, () => walkExpression(init));
  }
};

const walkFile = (file) => {
  // tsc's types are what the rules read; a directive that silences tsc
  // silences them.
  const directive = file.text.match(/@ts-(ignore|expect-error|nocheck)/);
  if (directive !== null) refuse(file, 'closed', `a ${directive[0]} directive silences the checker the rules read; a gate belongs in a typetest`);
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement)) {
      const source = statement.moduleSpecifier.getText().slice(1, -1);
      const clause = statement.importClause;
      const bindings = clause?.namedBindings;
      const byValue =
        clause !== undefined &&
        clause.isTypeOnly !== true &&
        (clause.name !== undefined || (bindings !== undefined && (ts.isNamespaceImport(bindings) || bindings.elements.some((e) => e.isTypeOnly !== true))));
      if (byValue && /(^|\/)effects\//.test(source)) refuse(statement, 'purity', 'nothing of an effects module is imported by value; an effect reaches the domain as data');
      continue;
    }
    if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) continue;
    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly !== true) refuse(statement, 'grammar', 'a module exports its own bindings; a value re-exported is a value the module did not make');
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      walkVariables(statement);
      continue;
    }
    if (ts.isFunctionDeclaration(statement)) {
      const symbol = statement.name === undefined ? undefined : checker.getSymbolAtLocation(statement.name);
      const entry = symbol === undefined ? null : declare(symbol, statement.name.text, statement);
      within(entry, () => walkFunction(statement));
      continue;
    }
    refuse(statement, 'grammar', `${ts.SyntaxKind[statement.kind]} is not a form of the domain at the top of a module`);
  }
};

// Termination: no domain binding reaches itself.
const checkTermination = () => {
  const visiting = new Set();
  const settled = new Set();
  const visit = (symbol, path) => {
    if (settled.has(symbol)) return;
    if (visiting.has(symbol)) {
      const cycle = [...path.slice(path.indexOf(symbol)), symbol].map((s) => domainFunctions.get(s).name).join(' → ');
      refuse(domainFunctions.get(symbol).node, 'termination', `${cycle} is a cycle; a fact is finite, so a computation over it is a fold or a map, not a function that reaches itself`);
      settled.add(symbol);
      return;
    }
    visiting.add(symbol);
    for (const next of domainFunctions.get(symbol).reaches) if (domainFunctions.has(next)) visit(next, [...path, symbol]);
    visiting.delete(symbol);
    settled.add(symbol);
  };
  for (const symbol of domainFunctions.keys()) visit(symbol, []);
};

// ---------------------------------------------------------------- run

for (const file of domainFiles) walkFile(file);
checkTermination();

if (fixturesDir === null) {
  for (const r of refusals) console.log(`${r.file}:${r.line}:${r.column}  refused  ${r.rule}: ${r.message}`);
  console.log(refusals.length === 0 ? `${domainFiles.length} domain file(s) accepted` : `${refusals.length} refusal(s) in ${domainFiles.length} domain file(s)`);
  process.exit(refusals.length === 0 ? 0 : 1);
}

// Fixtures: each compiles and says what it expects; each rule is the only
// rule refusing some fixture.
const rules = ['grammar', 'exactness', 'purity', 'decision', 'termination', 'closed'];
const provedBy = new Map(rules.map((r) => [r, []]));
let short = 0;
for (const file of domainFiles) {
  const name = relative(resolve(fixturesDir), file.fileName);
  const header = readFileSync(file.fileName, 'utf8').match(/^\/\/ expect: (.+)$/m);
  const mine = refusals.filter((r) => resolve(r.file) === resolve(file.fileName)).map((r) => `${r.rule}: ${r.message}`);
  const diagnostics = ts.getPreEmitDiagnostics(program, file).filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (header === null) {
    console.log(`✗ ${name}: needs a "// expect:" header`);
    short += 1;
    continue;
  }
  if (diagnostics.length > 0) {
    console.log(`✗ ${name}: does not compile; a fixture is a program tsc accepts — ${ts.flattenDiagnosticMessageText(diagnostics[0].messageText, ' ')}`);
    short += 1;
    continue;
  }
  const expected = header[1].trim();
  if (expected === 'clean') {
    const ok = mine.length === 0;
    console.log(`${ok ? '✓' : '✗'} ${name}: clean${ok ? '' : ` — saw ${mine.join(' / ')}`}`);
    short += ok ? 0 : 1;
    continue;
  }
  const matching = mine.filter((m) => m.includes(expected));
  const ok = matching.length > 0;
  console.log(`${ok ? '✓' : '✗'} ${name}: ${expected}${ok ? '' : ` — saw ${mine.length === 0 ? 'nothing' : mine.join(' / ')}`}`);
  short += ok ? 0 : 1;
  const producers = new Set(mine.map((m) => m.slice(0, m.indexOf(':'))));
  if (ok && producers.size === 1) provedBy.get([...producers][0]).push(name);
}
let unproved = 0;
for (const rule of rules) {
  if (provedBy.get(rule).length === 0) {
    unproved += 1;
    console.log(`✗ ${rule}: no fixture is refused by this rule alone`);
  }
}
console.log(`${domainFiles.length - short}/${domainFiles.length} acceptor fixtures agree; ${rules.length - unproved}/${rules.length} rules proved`);
process.exit(short === 0 && unproved === 0 ? 0 : 1);
