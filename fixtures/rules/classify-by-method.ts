// expect: a classification is a partition
// an inferred predicate with no boolean annotation, classifying by filter
export const positive = (xs: ReadonlyArray<number>): ReadonlyArray<number> => xs.filter((n) => n > 0);
