// Support for the fixtures: an authority a boundary module owns. Not a fixture.
import type { Sealed } from '../../../src/sealed.js';
export const TAG: unique symbol = Symbol('token');
export type Token = Sealed<typeof TAG, { readonly id: string }>;
