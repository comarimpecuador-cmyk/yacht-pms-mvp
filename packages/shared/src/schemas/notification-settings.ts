import { z } from 'zod';

export const NotificationSettingsSchema = z.object({
  timezone: z.string().min(3),
  inAppEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  pushFuture: z.boolean(),
  windowStart: z.string().regex(/^\d{2}:\d{2}$/),
  windowEnd: z.string().regex(/^\d{2}:\d{2}$/),
  minSeverity: z.enum(['info', 'warn', 'critical']),
  yachtsScope: z.array(z.string().uuid()),
});

export type NotificationSettingsDto = z.infer<typeof NotificationSettingsSchema>;
