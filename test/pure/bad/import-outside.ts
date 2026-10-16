// expect: Not in L: an import from outside
import { label } from '../outside/helper.js';
export const f = (): string => label;
