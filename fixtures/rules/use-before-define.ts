// expect: was used before it was defined
export const later = (): number => helper();
const helper = (): number => 1;
