// expect: a boundary parses; z.custom declares a type
import { custom } from 'zod';
export const id = custom<{ readonly id: string }>();
