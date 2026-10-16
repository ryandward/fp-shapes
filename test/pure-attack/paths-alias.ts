// Imports 'fp-shapes/pure', which the attacker's tsconfig maps to their own file.
import { evil } from 'fp-shapes/pure';
export const run = (): number => evil();
