// The standard library for pure code. A pure project is compiled with
// `"noLib": true` and this file, so these declarations are the only globals
// that exist. Anything that performs an effect is absent: no Date,
// Math.random, Promise, console, fetch, timers, process, JSON, Symbol(),
// Object.assign, or array methods that change an array in place.
//
// What pure code can reach here is held to L: no member returns undefined or
// null (so no `at` or `find`; use the library's Option-returning functions),
// and no member throws on an argument its type admits. Exhausting memory (a
// string too long to build, by + or padStart) is a resource limit of the
// machine, like the stack, and is outside what L promises.
// The utility types at the end exist for the library's own declarations;
// fp-shapes-check refuses them in pure code.

// ---------------------------------------------------------------- required by the compiler

interface Object {}
interface Function {}
interface CallableFunction extends Function {}
interface NewableFunction extends Function {}
interface IArguments {
  readonly length: number;
  readonly [index: number]: unknown;
}
interface RegExp {}
interface Boolean {}
interface Symbol {}
interface TemplateStringsArray extends ReadonlyArray<string> {
  readonly raw: ReadonlyArray<string>;
}

// ---------------------------------------------------------------- numbers and strings

// Every member is total: an argument JavaScript would reject with a
// RangeError (toFixed(200), toString(1), repeat(-1)) cannot be written.
type Digits = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20;
interface Number {
  toFixed(digits: Digits): string;
  toString(): string;
}

interface String {
  readonly length: number;
  readonly [index: number]: string;
  concat(...strings: ReadonlyArray<string>): string;
  endsWith(search: string): boolean;
  includes(search: string): boolean;
  indexOf(search: string): number;
  padEnd(length: number, fill?: string): string;
  padStart(length: number, fill?: string): string;
  replaceAll(search: string, replacement: string): string;
  slice(start?: number, end?: number): string;
  split(separator: string): string[];
  startsWith(search: string): boolean;
  toLowerCase(): string;
  toUpperCase(): string;
  trim(): string;
}

interface Math {
  abs(x: number): number;
  ceil(x: number): number;
  floor(x: number): number;
  max(...values: ReadonlyArray<number>): number;
  min(...values: ReadonlyArray<number>): number;
  pow(x: number, y: number): number;
  round(x: number): number;
  sign(x: number): number;
  sqrt(x: number): number;
  trunc(x: number): number;
}
declare const Math: Math;

// ---------------------------------------------------------------- arrays

interface ReadonlyArray<T> {
  readonly length: number;
  readonly [index: number]: T;
  concat(...items: ReadonlyArray<ReadonlyArray<T>>): T[];
  every(predicate: (value: T, index: number) => boolean): boolean;
  filter<S extends T>(predicate: (value: T, index: number) => value is S): S[];
  filter(predicate: (value: T, index: number) => boolean): T[];
  findIndex(predicate: (value: T, index: number) => boolean): number;
  flatMap<U>(f: (value: T, index: number) => U | ReadonlyArray<U>): U[];
  includes(value: T): boolean;
  indexOf(value: T): number;
  join(separator?: string): string;
  map<U>(f: (value: T, index: number) => U): U[];
  reduce<U>(f: (accumulator: U, value: T, index: number) => U, initial: U): U;
  slice(start?: number, end?: number): T[];
  some(predicate: (value: T, index: number) => boolean): boolean;
  toReversed(): T[];
  toSorted(compare: (a: T, b: T) => number): T[];
}

// An array literal has type Array<T>. It has no methods that change it, and
// its index signature is read-only, so `xs[0] = x` does not compile.
interface Array<T> extends ReadonlyArray<T> {}

// ---------------------------------------------------------------- utility types

type PropertyKey = string | number | symbol;
type Partial<T> = { [P in keyof T]?: T[P] };
type Required<T> = { [P in keyof T]-?: T[P] };
type Readonly<T> = { readonly [P in keyof T]: T[P] };
type Pick<T, K extends keyof T> = { [P in K]: T[P] };
type Record<K extends keyof any, T> = { [P in K]: T };
type Exclude<T, U> = T extends U ? never : T;
type Extract<T, U> = T extends U ? T : never;
type Omit<T, K extends keyof any> = Pick<T, Exclude<keyof T, K>>;
type NonNullable<T> = T & {};
type Parameters<T extends (...args: any) => any> = T extends (...args: infer P) => any ? P : never;
type ReturnType<T extends (...args: any) => any> = T extends (...args: any) => infer R ? R : any;
