export type NotificationChannel = 'in_app' | 'email' | 'push_future';

export type SendNotificationInput = {
  userId: string;
  yachtId?: string;
  type: string;
  dedupeKey: string;
  severity: 'info' | 'warn' | 'critical';
  payload: Record<string, unknown>;
};

export interface NotificationChannelProvider {
  channel: NotificationChannel;
  send(input: SendNotificationInput): Promise<{ status: 'sent' | 'skipped' | 'failed'; error?: string }>;
}
