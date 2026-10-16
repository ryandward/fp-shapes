// expect: is not assignable to type 'Program<Door, string, HeldAfter<{}, Door, "lock", "locked">>'
import { program, type Opaque, type Program } from 'fp-shapes/pure';
declare const KEY: unique symbol;
type Key = Opaque<typeof KEY, { readonly id: string }, 'once'>;
type Door = {
  readonly lock: { readonly input: {}; readonly output: { locked: { readonly key: Key } }; readonly acquires: { readonly locked: 'key' }; readonly releases: never };
  readonly unlock: { readonly input: { readonly key: Key }; readonly output: { unlocked: {} }; readonly acquires: {}; readonly releases: 'key' };
};
const { pure, perform } = program<Door, string>();
export const f = (): Program<Door, string, {}> => perform('lock', {}, { locked: () => pure('forgot to unlock') });
