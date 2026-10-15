// expect: decision: a boolean is a decision made elsewhere
type Line = { readonly sku: string; readonly rush: boolean };
export const anyRush = (lines: ReadonlyArray<Line>): boolean => lines.some((l) => l.rush);
