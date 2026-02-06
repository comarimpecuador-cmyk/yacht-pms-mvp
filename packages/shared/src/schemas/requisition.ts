import { z } from 'zod';

export const CreateRequisitionSchema = z.object({
  yachtId: z.string().uuid(),
  departmentId: z.string().uuid(),
  justification: z.string().min(3),
  items: z.array(
    z.object({
      description: z.string().min(2),
      qty: z.number().positive(),
      unit: z.string().min(1),
    }),
  ),
});

export type CreateRequisitionDto = z.infer<typeof CreateRequisitionSchema>;
