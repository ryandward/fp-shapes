// expect: a delay is scheduled in effects/
export const later = (f: () => void): void => { setTimeout(f, 1); };
