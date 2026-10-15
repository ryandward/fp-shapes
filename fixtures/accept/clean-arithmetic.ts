// expect: clean
type Line = { readonly sku: string; readonly qty: number; readonly unit: number };
export const total = (lines: ReadonlyArray<Line>): number => lines.map((l) => l.qty * l.unit).reduce((a, b) => a + b, 0);
export const label = (l: Line): string => `${l.sku} × ${l.qty} at ${l.unit.toFixed(2)}`;
export const negated = (n: number): number => -n;
