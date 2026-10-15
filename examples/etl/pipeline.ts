// Order. The ETL pipeline as a typestate: the transition table is a type and
// the only runtime is the step functions. A stage can be minted only here, so
// nothing can skip, repeat or reorder a stage. `begin` is importable only by
// the boundary and `step` only by the modules that define steps (see lint),
// otherwise `step('extracted')(identity)` becomes the new cheat.
//
// Every stage carries the batch it belongs to, from `begin` onward, so the
// receipt an effect issues can say which batch it settled.

import type { BatchId } from './boundary/batch.js';
import { Sealed } from '../../src/sealed.js';
import type { NonEmpty } from '../../src/variant.js';

const STAGE: unique symbol = Symbol('stage');

const next = { extracted: 'transformed', transformed: 'loaded' } as const;
type Next = typeof next;
export type Stage = keyof Next | Next[keyof Next];

type StagedValue<S extends Stage, T> = {
  readonly batch: BatchId;
  readonly stage: S;
  readonly rows: NonEmpty<T>;
};

export type Staged<S extends Stage, T> = Sealed<typeof STAGE, StagedValue<S, T>>;

export type Step<S extends keyof Next, A, B> = (input: Staged<S, A>) => Staged<Next[S], B>;

export const begin = <A>(batch: BatchId, rows: NonEmpty<A>): Staged<'extracted', A> =>
  new Sealed(STAGE, { batch, stage: 'extracted', rows }, 'open');

export const step =
  <S extends keyof Next>(from: S) =>
  <A, B>(f: (rows: NonEmpty<A>) => NonEmpty<B>): Step<S, A, B> =>
  (input) => {
    const { batch, rows } = Sealed.open(STAGE, input);
    return new Sealed(STAGE, { batch, stage: next[from], rows: f(rows) }, 'open');
  };

export const rowsOf = <S extends Stage, T>(staged: Staged<S, T>): NonEmpty<T> =>
  Sealed.open(STAGE, staged).rows;

export const batchOf = <S extends Stage, T>(staged: Staged<S, T>): BatchId =>
  Sealed.open(STAGE, staged).batch;
