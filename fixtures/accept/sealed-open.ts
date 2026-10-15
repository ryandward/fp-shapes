// expect: a sealed value is read by its owner
import { Sealed } from '../../src/sealed.js';
declare const TAG: unique symbol;
type Token = Sealed<typeof TAG, { readonly id: string }>;
export const id = (t: Token): string => Sealed.open(TAG, t).id;
