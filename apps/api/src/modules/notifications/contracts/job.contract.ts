import { NotificationChannel, NotificationModule } from './notification-rule.contract';

export type JobScheduleType = 'cron' | 'interval_hours' | 'interval_days';

export interface JobSchedule {
  type: JobScheduleType;
  expression?: string;
  everyHours?: number;
  everyDays?: number;
  timezone?: string;
}

export type JobAssignmentMode = 'roles' | 'users' | 'entity_owner' | 'yacht_captain';

export interface JobAssignmentPolicy {
  mode: JobAssignmentMode;
  roles?: string[];
  userIds?: string[];
}

export interface JobReminderPolicy {
  offsetHours: number;
  channels: NotificationChannel[];
}

export type JobStatus = 'active' | 'paused' | 'archived';

export interface JobDefinitionContract {
  id: string;
  title: string;
  module: NotificationModule;
  yachtId?: string;
  instructionsTemplate: string;
  schedule: JobSchedule;
  assignmentPolicy: JobAssignmentPolicy;
  reminders: JobReminderPolicy[];
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateJobDefinitionRequest {
  title: string;
  module: NotificationModule;
  yachtId?: string;
  instructionsTemplate: string;
  schedule: JobSchedule;
  assignmentPolicy: JobAssignmentPolicy;
  reminders?: JobReminderPolicy[];
  status?: JobStatus;
}

export interface UpdateJobDefinitionRequest {
  title?: string;
  instructionsTemplate?: string;
  schedule?: JobSchedule;
  assignmentPolicy?: JobAssignmentPolicy;
  reminders?: JobReminderPolicy[];
  status?: JobStatus;
}

export type JobRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface JobRunContract {
  id: string;
  jobDefinitionId: string;
  scheduledAt: string;
  startedAt?: string;
  finishedAt?: string;
  status: JobRunStatus;
  summary?: Record<string, unknown>;
}
