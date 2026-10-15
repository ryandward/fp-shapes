// expect: `??` branches on absence
export const f = (a: string | undefined): string => a ?? 'none';
