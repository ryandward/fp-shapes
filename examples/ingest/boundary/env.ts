// Configuration enters as unknown and leaves as a number. `Number(x ?? 5)`
// turns an unset variable into 5 and a mistyped one into NaN; this turns the
// first into 5 and the second into a rejected fact with the issue attached.

import { z } from 'zod';
import { boundary, type Boundary } from '../../../src/boundary/boundary.js';

export const parseMaxConcurrentImports: Boundary<number> = boundary(z.coerce.number().int().positive().default(5));
