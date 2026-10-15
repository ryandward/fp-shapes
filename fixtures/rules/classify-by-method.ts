// expect: a classification is a partition
// a reviewer's bypass: an inferred predicate, no boolean annotation, classification by filter
export const positive = (xs: ReadonlyArray<number>): ReadonlyArray<number> => xs.filter((n) => n > 0);
