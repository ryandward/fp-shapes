export type Problem = { readonly file: string; readonly line: number; readonly column: number; readonly message: string; readonly source: 'syntax' | 'compiler' | 'L' };
export declare const pureLib: string;
export declare const check: (options: { readonly project: string; readonly files?: ReadonlyArray<string> }) => Problem[];
