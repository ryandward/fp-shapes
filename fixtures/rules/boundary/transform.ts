// expect: a boundary describes
import { z } from 'zod';
type Small = { readonly id: string };
export const schema = z
  .strictObject({ id: z.string() })
  .readonly()
  .transform((p): Small => {
    const wide = { id: p.id, hidden: 1 } as const;
    return wide;
  });
