// expect: a fact names every key
export const relabelled = (row: { readonly id: string }): { readonly id: string; readonly state: 'landed' } => ({ ...row, state: 'landed' });
