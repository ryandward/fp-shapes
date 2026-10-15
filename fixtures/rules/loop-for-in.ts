// expect: iterate by mapping a NonEmpty
export const f = (o: { readonly a: number }): string => { for (const k in o) { return k; } return ""; };
