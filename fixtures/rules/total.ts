// expect: clean
// the primitives tier for total.ts: names the holes it tests for
export type Hole<T> = undefined extends T ? true : unknown extends T ? true : false;
