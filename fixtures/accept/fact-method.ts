// expect: is not a method of a fact the domain calls
export const first = (lines: ReadonlyArray<string>): string | undefined => lines.find((l) => l.length > 0);
