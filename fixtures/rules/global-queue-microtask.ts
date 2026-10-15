// expect: a delay is scheduled in effects/
export const next = (f: () => void): void => queueMicrotask(f);
