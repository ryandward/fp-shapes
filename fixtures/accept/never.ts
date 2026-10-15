// expect: purity: a call that returns never halts
import { defect } from '../../src/sealed.js';
export const halt = (s: string): string => defect(s);
