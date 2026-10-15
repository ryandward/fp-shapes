// expect: a delay is scheduled in effects/
export const every = (f: () => void): void => { setInterval(f, 1); };
