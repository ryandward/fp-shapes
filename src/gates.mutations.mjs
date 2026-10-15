// Loosenings of the library's guarantees; src/gates.typetest.ts must refuse each.
// Each entry: a name, then one or more edits (file, from, to) applied to a
// copy of the tree. The build must then fail at a line of `gates`.

// `copy` names what the gates need and nothing a host does not vendor, so
// `--map src=<where the library lives>` runs this list from a host's root.
export const gates = 'src/gates.typetest.ts';
export const copy = ['src'];
const edit = (file, from, to) => ({ file, from, to });

export const mutations = [
  ['make #value public', edit('src/sealed.ts', /#value/g, 'value')],
  ['let open read spent evidence', edit('src/sealed.ts', "x: Sealed<Tag, T, 'open'>): T {", 'x: Sealed<Tag, T, Use>): T {')],
  ['let the use be relabelled', edit('src/sealed.ts', '  readonly #use: U;\n', '  readonly #use: Use;\n')],
  ['drop the undefined check from Total', edit('src/total.ts', '  : undefined extends T ? true\n', '')],
  ['drop the {} check from Total', edit('src/total.ts', '        : {} extends T ? true // {}, object, or all-optional: open\n', '')],
  ['let Immutable accept mutable arrays', edit('src/total.ts', '    : T extends unknown[] ? true // a mutable array or tuple\n', '')],
  ['make Exact ignore completeness', edit('src/total.ts', /Total<[AB]> extends true \?/g, 'true extends true ?')],
  [
    'let a partition omit a bucket',
    edit('src/variant.ts', 'empty: Partition<M>)', 'empty: Partial<Partition<M>>)'),
    edit('src/variant.ts', 'reduce(into, empty)', 'reduce(into, empty as Partition<M>)'),
  ],
  ['let cases share fields', edit('src/variant.ts', '& M[P] & OnlyOwn<M, P>', '& M[P]')],
  ['let Total accept a recursive type', edit('src/total.ts', "  : Among<T, Seen> extends true ? 'recursive'\n", '')],
  ['let a fact nest past four containers', edit('src/total.ts', 'type Depth = readonly [0, 0, 0, 0];', 'type Depth = readonly [0, 0, 0, 0, 0, 0, 0, 0];')],
  ['report depth as recursion', edit('src/total.ts', "  : Seen['length'] extends Depth['length'] ? 'deep'\n", "  : Seen['length'] extends Depth['length'] ? 'recursive'\n")],
  ['let a fold omit a case', edit('src/variant.ts', 'readonly [K in keyof M]: (v: Variant<M, K>) => R;', 'readonly [K in keyof M]?: (v: Variant<M, K>) => R;')],
  [
    'let occupancy accept undefined',
    edit('src/boundary/evidence.ts', '<T extends {} | null>', '<T>'),
    edit('src/boundary/evidence.ts', "head === undefined ? { kind: 'empty' } : { kind: 'some', rows: [head, ...tail] }", "xs.length === 0 ? { kind: 'empty' } : { kind: 'some', rows: [head as T, ...tail] }"),
  ],
  ['drop the readonly requirement from boundary', edit('src/boundary/boundary.ts', 'Immutable<z.output<S>> extends true ?', 'true extends true ?')],
  ['drop the total requirement from boundary', edit('src/boundary/boundary.ts', 'Total<z.output<S>> extends true ?', 'true extends true ?')],
];
