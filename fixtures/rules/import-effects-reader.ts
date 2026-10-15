// expect: an effect runs in effects/
import { openLoadFor } from './effects/load.js';
export const read = openLoadFor;
