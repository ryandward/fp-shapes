// Lint carries the rules the type system describes but the language keeps
// available. Every message says what the code here is, or what this construct
// needs, so a hit reads as a direction rather than a verdict. The directory is
// the permission, by path segment: every .ts file is domain unless a segment
// of its path says otherwise, so the tiers apply from any working directory
// and to any tree laid out the same way:
//
//   domain      everything not listed below: data, folds, owner-issued values
//   boundary    **/boundary/**        decides; uses ??, ?., unknown, and zod
//   effects     **/effects/**         try/throw/branch around I/O; name unknown
//   foreign     **/effects/**/foreign.ts   describe other code as it is
//   primitives  **/sealed.ts (the one class, the one brand check, the one halt)
//               **/total.ts (type-level utilities; names `unknown`, `undefined`)
//   typetests   **/*.typetest.ts      hold the compiler directives, each with a description
//
// Recommended on top of this, not verified here: typescript-eslint's
// recommendedTypeChecked (the no-unsafe-* rules that track `any`),
// eslint-plugin-functional, and eslint-plugin-eslint-comments so that an
// eslint-disable comment is itself subject to a rule.

import tseslint from 'typescript-eslint';

const rule = (selector, message) => ({ selector, message });

const rules = {
  conditionals: [
    rule('IfStatement', 'a branch is a Variant: classify at the boundary, fold here'),
    rule('ConditionalExpression', 'a branch is a Variant: classify at the boundary, fold here'),
    rule('SwitchStatement', 'a branch is a Variant: classify at the boundary, fold here'),
    rule("LogicalExpression[operator='??']", 'values here are total; absence is decided at the boundary'),
    rule("LogicalExpression[operator='||']", 'values here are total; absence is decided at the boundary'),
    rule("LogicalExpression[operator='&&']", 'combine facts as a Variant and fold it; absence is decided at the boundary'),
    rule('ChainExpression', 'values here are total; read the field directly'),
  ],
  loops: [
    rule('ForStatement', 'iterate by mapping a NonEmpty; a stopping condition is a Variant to fold'),
    rule('ForInStatement', 'iterate by mapping a NonEmpty; a stopping condition is a Variant to fold'),
    rule('ForOfStatement', 'iterate by mapping a NonEmpty; a stopping condition is a Variant to fold'),
    rule('WhileStatement', 'iterate by mapping a NonEmpty; a stopping condition is a Variant to fold'),
    rule('DoWhileStatement', 'iterate by mapping a NonEmpty; a stopping condition is a Variant to fold'),
  ],
  exceptions: [
    rule('TryStatement', 'failure is a case: return an Outcome through attempt (src/effects); a defect halts in sealed.ts'),
    rule('ThrowStatement', 'failure is a case: return an Outcome through attempt (src/effects); a defect halts in sealed.ts'),
  ],
  assertions: [
    rule('TSNonNullExpression', 'the value is total once parsed at the boundary; read it directly'),
    rule("TSAsExpression:not([typeAnnotation.typeName.name='const'])", 'the type comes from the parser or the owner; `as const` is the one assertion'),
    rule('TSTypeAssertion', 'the type comes from the parser or the owner; `as const` is the one assertion'),
    rule('VariableDeclaration[declare=true]', 'a value comes from a parser or an owner; an ambient declaration belongs in a *.typetest.ts'),
    rule('TSDeclareFunction', 'a value comes from a parser or an owner; an ambient declaration belongs in a *.typetest.ts'),
    rule('TSModuleDeclaration', 'a module declares its own exports; a type belongs in the module that owns it'),
  ],
  holes: [
    rule('TSIndexSignature', 'a fact is a closed record: name every key'),
    rule('TSPropertySignature[optional=true]', 'every key is present: give it a default or make it nullable at the boundary'),
    rule('TSAnyKeyword', 'give this a type; input is parsed into one at the boundary'),
  ],
  absence: [rule('TSUndefinedKeyword', 'absence is nullable or defaulted at the boundary; types here are total')],
  unknown: [rule('TSUnknownKeyword', 'unknown enters through a Boundary (src/boundary) and leaves as a fact')],
  sums: [
    rule('TSUnionType > TSTypeLiteral:has(TSPropertySignature)', 'a sum of records is a Variant over a map: name the cases as keys and fold them'),
  ],
  predicates: [
    rule(':function > TSTypeAnnotation > TSBooleanKeyword', 'return a Variant for the caller to fold'),
    rule('TSFunctionType > TSTypeAnnotation > TSBooleanKeyword', 'return a Variant for the caller to fold'),
  ],
  classes: [
    rule('ClassDeclaration', 'Sealed is the class; everything else is data and functions'),
    rule('ClassExpression', 'Sealed is the class; everything else is data and functions'),
  ],
  mutation: [
    rule("VariableDeclaration[kind='let']", 'bind with const; a changing value is a new value'),
    rule("VariableDeclaration[kind='var']", 'bind with const; a changing value is a new value'),
    rule("AssignmentExpression[left.type='Identifier']", 'bind with const; a changing value is a new value'),
    rule("AssignmentExpression[left.type='MemberExpression']", 'values are frozen; build the new value with spread'),
    rule('UpdateExpression', 'values are frozen; build the new value with spread'),
    rule("UnaryExpression[operator='delete']", 'values are frozen; build the new value with spread'),
  ],
  laundering: [
    rule(
      "MemberExpression[object.name='Object'][property.name=/^(assign|create|defineProperty|defineProperties|setPrototypeOf)$/]",
      'copy with spread; a Sealed value comes only from its owner',
    ),
    rule("MemberExpression[object.name='Reflect']", 'read fields through the type; a sealed payload is read through its opener'),
    rule("CallExpression[callee.name='structuredClone']", 'copy with spread; a Sealed value comes only from its owner'),
  ],
};

const imports_name_their_file = [
  rule("ImportDeclaration[source.value=/^\\.\\.?\\//]:not([source.value=/\\.js$/])", 'a relative import names its file: add .js'),
  rule("ExportNamedDeclaration[source.value=/^\\.\\.?\\//]:not([source.value=/\\.js$/])", 'a relative import names its file: add .js'),
  rule("ExportAllDeclaration[source.value=/^\\.\\.?\\//]:not([source.value=/\\.js$/])", 'a relative import names its file: add .js'),
];

const syntax = (...groups) => ['error', ...imports_name_their_file, ...groups.flatMap((g) => rules[g])];

const everything = Object.keys(rules);
const except = (...omit) => everything.filter((g) => !omit.includes(g));

// Libraries whose functions are typed `<T>(x: T) => T` or `T & U` and copy at
// runtime, so their result carries a type its value did not earn.
const cloners = ['lodash', 'lodash/*', 'lodash-es', 'lodash-es/*', 'immer', 'rfdc', 'clone', 'clone-deep', 'deepmerge', 'klona', 'klona/*', 'just-clone', 'ramda', 'ramda/*'];

const imports = [
  'error',
  {
    patterns: [
      { group: ['zod', 'zod/*'], message: 'parse in a boundary module; import the fact type here' },
      { group: cloners, message: 'copy with spread; a Sealed value comes only from its owner' },
      { group: ['**/boundary/*', '**/boundary/**'], importNamePattern: '^parse', message: 'take the parsed fact as a parameter; parsing happens in a boundary module' },
    ],
  },
];

const globals = ['error', { name: 'structuredClone', message: 'copy with spread; a Sealed value comes only from its owner' }, { name: 'Reflect', message: 'read fields through the type; a sealed payload is read through its opener' }];

// A compiler directive lives in a typetest, where it is a gate with a description.
const local = {
  rules: {
    'directives-are-gates': {
      meta: { type: 'problem', messages: { place: 'a compiler directive is a gate: it belongs in a *.typetest.ts, with a description of what it pins' } },
      create: (context) => ({
        Program: () => {
          for (const comment of context.sourceCode.getAllComments()) {
            if (/^\s*@ts-(expect-error|ignore|nocheck)/.test(comment.value)) context.report({ loc: comment.loc, messageId: 'place' });
          }
        },
      }),
    },
  },
};

const base = {
  files: ['**/*.ts'],
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
  plugins: { '@typescript-eslint': tseslint.plugin, local },
  rules: {
    // a module reads top to bottom: a binding is declared before it is used
    '@typescript-eslint/no-use-before-define': ['error', { functions: true, classes: true, variables: true, typedefs: false, ignoreTypeReferences: true }],
    // every binding is used; one that exists only for its type is named with a leading underscore
    '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_', caughtErrors: 'all', caughtErrorsIgnorePattern: '^_' }],
    // a relative import names its file, so the module resolves under NodeNext as well as a bundler
    'no-restricted-syntax': ['error', ...imports_name_their_file],
  },
};

export default [
  { ignores: ['node_modules/**', 'dist/**'] },
  base,
  {
    // domain
    files: ['**/*.ts'],
    ignores: ['**/boundary/**', '**/effects/**', '**/sealed.ts', '**/total.ts', '**/*.typetest.ts', '**/*.test.ts'],
    rules: {
      'no-restricted-syntax': syntax(...everything),
      'no-restricted-imports': imports,
      'no-restricted-globals': globals,
      'local/directives-are-gates': 'error',
    },
  },
  {
    // boundary: decides, and is where unknown and zod live
    files: ['**/boundary/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-syntax': syntax(...except('conditionals', 'unknown', 'predicates')),
      'no-restricted-globals': globals,
      'local/directives-are-gates': 'error',
    },
  },
  {
    // primitives: the one class has its constructor, its ternary and its halt
    files: ['**/sealed.ts'],
    rules: {
      'no-restricted-syntax': syntax(...except('conditionals', 'exceptions', 'classes', 'mutation')),
      'local/directives-are-gates': 'error',
    },
  },
  {
    // primitives: type-level utilities name the holes they test for
    files: ['**/total.ts'],
    rules: {
      'no-restricted-syntax': syntax(...except('unknown', 'absence')),
      'local/directives-are-gates': 'error',
    },
  },
  {
    // foreign surfaces: describe other code as it is, so the adapters can read
    // its predicates, optional methods and thrown classes once each
    files: ['**/effects/**/foreign.ts'],
    rules: {
      'no-restricted-syntax': syntax(...except('conditionals', 'exceptions', 'loops', 'unknown', 'predicates', 'holes', 'absence', 'sums')),
      'local/directives-are-gates': 'error',
    },
  },
  {
    // effects: try/throw/branch around I/O, and name `unknown` for what came back
    files: ['**/effects/**/*.ts'],
    ignores: ['**/effects/**/foreign.ts', '**/*.test.ts'],
    rules: {
      'no-restricted-syntax': syntax(...except('conditionals', 'exceptions', 'loops', 'unknown')),
      'no-restricted-imports': imports,
      'no-restricted-globals': globals,
      'local/directives-are-gates': 'error',
    },
  },
  {
    // typetests: each directive is a gate and says what it pins, and a gate
    // asserts a declared type as it is
    files: ['**/*.typetest.ts'],
    rules: {
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-expect-error': 'allow-with-description', minimumDescriptionLength: 10 }],
      'no-restricted-syntax': [
        ...syntax('assertions').filter((r) => typeof r === 'string' || !/declare/i.test(r.selector)),
        rule(
          "TSTypeReference[typeName.name=/^(Omit|Pick|Partial|Required|Exclude|Extract|NonNullable)$/]",
          'a gate asserts a declared type as it is; a derived subject proves a different type, so the declared type is what changes',
        ),
      ],
    },
  },
];
