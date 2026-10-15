// open: the checker's rule that no boolean is produced in the domain except by reading a fact's field
// A reader in effects/ may return an inferred boolean, and the domain may call it.
import { openReady } from './effects/ready.js';
export const ready = (token: { readonly id: string }) => openReady(token);
