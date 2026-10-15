// A program that locks a door, then unlocks it, and a description of the result.
import { match, program, type Opaque, type Program, type Union } from 'fp-shapes/pure';

declare const KEY: unique symbol;
export type Key = Opaque<typeof KEY, { readonly id: string }, 'once'>;

export type Door = {
  readonly lock: { readonly input: { readonly who: string }; readonly output: { locked: { readonly key: Key }; busy: {} }; readonly acquires: { readonly locked: 'key' }; readonly releases: never };
  readonly unlock: { readonly input: { readonly key: Key }; readonly output: { unlocked: {} }; readonly acquires: {}; readonly releases: 'key' };
};

type VisitCases = { visited: { readonly who: string }; turnedAway: {} };
export type Visit = Union<VisitCases>;

const { pure, perform } = program<Door, Visit>();

const leave = (who: string, key: Key): Program<Door, Visit, { key: true }> =>
  perform('unlock', { key }, { unlocked: () => pure({ kind: 'visited', who }) });

export const visit = (who: string): Program<Door, Visit, {}> =>
  perform('lock', { who: who.trim() }, {
    locked: ({ key }) => leave(who, key),
    busy: () => pure({ kind: 'turnedAway' }),
  });

export const describe = match<VisitCases, string>({
  visited: ({ who }) => `${who.toUpperCase()} came in`,
  turnedAway: () => 'nobody came in',
});
