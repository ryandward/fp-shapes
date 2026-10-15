// expect: clean
import { z } from 'zod';
export const schema = z.object({ id: z.string() }).readonly().default({ id: 'none' });
export const count = z.coerce.number().int().default(5);
