// expect: a sealed value is read by its owner
import { Sealed } from '../../src/sealed.js';
import { TAG, type Token } from './boundary/authority.js';
export const id = (t: Token): string => Sealed.open(TAG, t).id;
