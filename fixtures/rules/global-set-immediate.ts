// expect: a delay is scheduled in effects/
export const soon = (f: () => void): void => { setImmediate(f); };
