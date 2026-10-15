// expect: purity: nothing of an effects module is imported by value
import { openReady } from './effects/ready.js';
export const ready = (token: { readonly id: string }): number => openReady(token);
