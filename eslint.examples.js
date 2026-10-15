// Rules for the examples in this repository, on top of the library's tiers.
// The ETL example's pipeline mints stages: `begin` belongs to its boundary
// and `step` to its step modules, and nothing else imports either. This file
// is not part of the vendor set; a host writes its own overlay the same way.

import base from './eslint.config.js';

const minted = (names, message) => [
  'error',
  { patterns: [{ group: ['**/pipeline', '**/pipeline.js'], importNames: names, message }] },
];

export default [
  ...base,
  {
    files: ['examples/etl/**/*.ts'],
    ignores: ['examples/etl/boundary/**', 'examples/etl/steps/**', 'examples/etl/pipeline.ts', '**/*.test.ts', '**/*.typetest.ts'],
    rules: { 'no-restricted-imports': minted(['begin', 'step'], 'a stage is minted by the boundary (begin) and by step modules (step); take a Staged input here') },
  },
  {
    files: ['examples/etl/boundary/**/*.ts'],
    rules: { 'no-restricted-imports': minted(['step'], 'a step module advances a stage; the boundary begins one') },
  },
  {
    files: ['examples/etl/steps/**/*.ts'],
    rules: { 'no-restricted-imports': minted(['begin'], 'a step module advances a stage; the boundary begins one') },
  },
];
