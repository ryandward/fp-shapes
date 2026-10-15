// expect: is the shell's
import { ledger } from '../../src/ledger.js';
export const kept = (s: string): ReadonlyArray<string> => {
  const noted = ledger<string>();
  const first = noted.note(s);
  return [first];
};
