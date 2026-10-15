// expect: a fact names every key
export const relabelled = (row: { readonly id: string; readonly n: number }): { readonly id: string; readonly n: number; readonly state: 'landed' } => ({ ...row, state: 'landed' });
