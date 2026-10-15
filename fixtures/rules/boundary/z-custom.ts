// expect: a boundary parses; z.custom declares a type
import { z } from 'zod';
export const id = z.custom<{ readonly id: string }>();
