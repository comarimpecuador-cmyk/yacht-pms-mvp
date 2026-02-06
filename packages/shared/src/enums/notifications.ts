export enum AlertSeverity {
  Info = 'info',
  Warn = 'warn',
  Critical = 'critical',
}

export enum NotificationChannel {
  InApp = 'in_app',
  Email = 'email',
  PushFuture = 'push_future',
}

export enum NotificationEventStatus {
  Pending = 'pending',
  Sent = 'sent',
  Failed = 'failed',
  Read = 'read',
  Skipped = 'skipped',
}
