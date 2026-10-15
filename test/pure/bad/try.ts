// expect: `try` handles hidden exits
export const f = (): number => { try { return 1; } catch { return 2; } };
