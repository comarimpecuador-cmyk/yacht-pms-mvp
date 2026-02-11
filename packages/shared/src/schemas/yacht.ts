import { z } from 'zod';

export const CreateYachtSchema = z.object({
  name: z.string().min(2),
  flag: z.string().min(2),
  imoOptional: z.string().optional(),
});

export type CreateYachtDto = z.infer<typeof CreateYachtSchema>;
