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
  ['drop the {} check from Total', edit('src/total.ts', '          {} extends T ? true // {}, object, or all-optional: open\n', '          false extends true ? true\n')],
  ['let a fact have a symbol key', edit('src/total.ts', '        : true // a symbol key: a fact\'s keys are names\n', '        : false\n')],
  ['let Immutable accept mutable arrays', edit('src/total.ts', '    : T extends unknown[] ? true // a mutable array or tuple\n', '')],
  ['make Exact ignore completeness', edit('src/total.ts', /Total<[AB]> extends true \?/g, 'true extends true ?')],
  [
    'let a partition omit a bucket',
    edit('src/variant.ts', 'empty: Partition<M>)', 'empty: Partial<Partition<M>>)'),
    edit('src/variant.ts', '[kind]: items }), empty);', '[kind]: items }), empty as Partition<M>);'),
  ],
  ['let cases share fields', edit('src/variant.ts', '& M[P] & OnlyOwn<M, P>', '& M[P]')],
  ['let Total accept a recursive type', edit('src/total.ts', "  : Among<T, Seen> extends true ? 'recursive'\n", '')],
  ['let a seal hide recursion', edit('src/total.ts', "  : T extends Sealed<symbol, infer P, Use> ? Walk<P, Seen>\n", '')],
  ['let a seal hide a hole', edit('src/total.ts', '      T extends Sealed<symbol, infer P, Use> ? HasHoles<P>\n      : T extends Primitive ? false', '      T extends Primitive ? false')],
  ['let a seal hide a mutable field', edit('src/total.ts', '    T extends Sealed<symbol, infer P, Use> ? HasMutable<P>\n    : T extends Primitive ? false', '    T extends Primitive ? false')],
  ['let a fold omit a case', edit('src/variant.ts', 'readonly [K in keyof M]: (v: Variant<M, K>) => R;', 'readonly [K in keyof M]?: (v: Variant<M, K>) => R;')],
  [
    'let occupancy accept undefined',
    edit('src/boundary/evidence.ts', '<T extends {} | null>', '<T>'),
    edit('src/boundary/evidence.ts', "head === undefined ? { kind: 'empty' } : { kind: 'some', rows: [head, ...tail] }", "xs.length === 0 ? { kind: 'empty' } : { kind: 'some', rows: [head as T, ...tail] }"),
  ],
  ['drop the readonly requirement from boundary', edit('src/boundary/boundary.ts', 'Immutable<z.output<S>> extends true ?', 'true extends true ?')],
  ['drop the total requirement from boundary', edit('src/boundary/boundary.ts', 'Total<z.output<S>> extends true ?', 'true extends true ?')],
  [
    'let a sealed payload widen',
    edit('src/sealed.ts', '  readonly #same: (x: T) => T;\n', '  readonly #same: (x: object) => object;\n'),
    edit('src/sealed.ts', /x\.#same\(x\.#value\)/g, 'x.#value'),
  ],
  ['let sealing seal a non-fact', edit('src/boundary/boundary.ts', 'seal: (fact: F) => Sealed<Tag, P, U> & Fact<P>)', 'seal: (fact: F) => Sealed<Tag, P, U>)')],
  [
    'let sealing accept an unsealed value',
    edit('src/boundary/boundary.ts', 'seal: (fact: F) => Sealed<Tag, P, U> & Fact<P>): Boundary<Sealed<Tag, P, U>>', 'seal: (fact: F) => P & Fact<P>): Boundary<P>'),
    edit('src/boundary/boundary.ts', 'fold<Parse<F>, Variant<Parse<Sealed<Tag, P, U>>>>', 'fold<Parse<F>, Variant<Parse<P>>>'),
  ],
  ['let a step be covariant in what it owes', edit('src/command.ts', 'export type Step<Ops extends Operations, S, O> = Erased<Ops, S> & { readonly [owes]: (o: O) => O };', 'export type Step<Ops extends Operations, S, O> = Erased<Ops, S> & { readonly [owes]: () => O };')],
  ['let done owe anything', edit('src/command.ts', '  readonly done: (status: S) => Step<Ops, S, {}>;', '  readonly done: <O>(status: S) => Step<Ops, S, O>;')],
  ['let an operation run without the receipt it spends', edit('src/command.ts', '  readonly suspend: <K extends keyof Ops & string, O extends Requires<Ops, K>>(', '  readonly suspend: <K extends keyof Ops & string, O>(')],
  ['let an arm keep what the operation spent', edit('src/command.ts', "type After<O, Ops extends Operations, K extends keyof Ops, C> = Omit<O, Spends<Ops, K>> & Issued<Ops, K, C>;", "type After<O, Ops extends Operations, K extends keyof Ops, C> = O & Issued<Ops, K, C>;")],
  ['let a receipt be issued while one of its name is owed', edit('src/command.ts', '(op: Fresh<O, Ops, K>, args: Ops[K][\'args\'], arms: Arms<Ops, S, K, O>) => Step<Ops, S, O>;', '(op: K, args: Ops[K][\'args\'], arms: Arms<Ops, S, K, O>) => Step<Ops, S, O>;')],
  ['let an answer issue nothing', edit('src/command.ts', "  C extends keyof Ops[K]['issues'] ? (Ops[K]['issues'][C] extends string ? { readonly [R in Ops[K]['issues'][C]]: true } : {}) : {};", '  {};')],
];
