// Every form of L in one place: bindings, patterns, templates, spreads,
// arithmetic, satisfies, as const, literal unions, tuples, function types,
// generics, block bodies, and higher-order functions.
export type Size = 'small' | 'large';
export type Pair = readonly [number, number];
export type Point = { readonly x: number; readonly y: number; readonly size: Size };
export type Transform = (p: Point) => Point;

export const origin = { x: 0, y: 0, size: 'small' } satisfies Point;
export const sizes = ['small', 'large'] as const;

export const moved = (p: Point, d: Pair): Point => {
  const [dx, dy] = d;
  const x = p.x + dx;
  return { x, y: p.y - -dy, size: p.size };
};

export const area = (p: Point): number => (p.x * p.y) % 7 + 2 ** 3;
export const label = ({ x, y }: Point): string => `(${x}, ${y})`;
export const both = (xs: ReadonlyArray<number>, ys: ReadonlyArray<number>): ReadonlyArray<number> => [...xs, ...ys];

// Higher-order functions: a function passed in is a term of L, so it is pure.
export const twice = <A>(f: (a: A) => A, a: A): A => f(f(a));
export const apply = (t: { readonly run: Transform }, p: Point): Point => t.run(p);
export const all = (fs: ReadonlyArray<Transform>, p: Point): Point => fs.reduce((q, f) => f(q), p);
