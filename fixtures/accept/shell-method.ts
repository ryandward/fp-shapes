// expect: note is the shell's
import type { Ledger } from '../../src/ledger.js';
export const kept = (noted: Ledger<string>, s: string): string => noted.note(s);
