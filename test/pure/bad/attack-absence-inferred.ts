// expect: Property 'at' does not exist
// Absence enters through an inferred type: no annotation to check.
export const first = (xs: ReadonlyArray<number>) => xs.at(0);
export const shown = (xs: ReadonlyArray<number>): string => `${xs.at(5)}`;
