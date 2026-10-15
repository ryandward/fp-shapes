// expect: clean
export const fileId = (row: { readonly 'file-id': string }): string => row['file-id'];
