import { z } from 'zod';

export const CreateLogBookEntrySchema = z.object({
  yachtId: z.string().uuid(),
  entryDate: z.string(),
  watchPeriod: z.string(),
  observations: z.array(z.string()).default([]),
});

export type CreateLogBookEntryDto = z.infer<typeof CreateLogBookEntrySchema>;
