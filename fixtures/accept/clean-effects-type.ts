// expect: clean
// A type from an effects module is a shape, not an effect.
import { type Ready } from './effects/ready.js';
export const id = (r: Ready): string => r.id;
