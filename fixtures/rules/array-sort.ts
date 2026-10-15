// expect: values are frozen; a new array comes from
export const ordered = (xs: ReadonlyArray<number>): ReadonlyArray<number> => xs.map((x) => x).sort();
