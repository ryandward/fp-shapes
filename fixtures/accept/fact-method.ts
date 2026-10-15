// expect: is not a method of a fact the domain calls
type Line = { readonly rush: boolean };
export const first = (lines: ReadonlyArray<Line>): Line | undefined => lines.find((l) => l.rush);
