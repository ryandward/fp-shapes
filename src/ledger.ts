// The one append-only builder. An interpreter notes every command it
// performs and the outcome it was answered with, in order, and reads the
// whole record at the end, or when the attempt halts. Appending to a frozen
// array copies it, so a run of n commands would copy n arrays; this holds
// the entries in one private array, written once each, and hands out a
// frozen copy on every read. Nothing reads the array by reference.

export type Ledger<T> = {
  readonly note: (entry: T) => T;
  readonly entries: () => ReadonlyArray<T>;
};

export const ledger = <T>(): Ledger<T> => {
  const noted: T[] = [];
  return {
    note: (entry) => {
      noted.push(entry);
      return entry;
    },
    entries: () => Object.freeze([...noted]),
  };
};
