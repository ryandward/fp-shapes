// expect: termination: total → total is a cycle
type Tree = { readonly v: number; readonly kids: ReadonlyArray<Tree> };
export const total = (t: Tree): number => t.kids.map(total).reduce((a, b) => a + b, t.v);
