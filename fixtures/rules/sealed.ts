// expect: clean
// the primitives tier for sealed.ts: the one class, the one halt, the one ternary
const defect = (message: string): never => {
  throw new Error(message);
};
export class Token<T extends object> {
  readonly #value: T;
  constructor(value: T) {
    this.#value = value;
  }
  static read<T extends object>(x: Token<T>): T {
    return #value in x ? x.#value : defect('read takes a token');
  }
}
