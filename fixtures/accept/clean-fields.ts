// expect: clean
type Line = { readonly sku: string; readonly rush: boolean };
export const rush = (l: Line): boolean => l.rush;
export const tag = (l: Line): { readonly sku: string; readonly rush: boolean } => ({ sku: l.sku.toUpperCase(), rush: l.rush });
export const constant = { unit: 'kg' } as const;
