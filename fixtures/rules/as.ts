// expect: the type comes from the parser or the owner
export const f = (x: string | null): string => x as string;
