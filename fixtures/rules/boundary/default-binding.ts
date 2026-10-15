// expect: a default is written where it is declared
import { z } from 'zod';
const fallback = { id: 'none', hidden: 1 };
export const schema = z.object({ id: z.string() }).readonly().default(fallback);
