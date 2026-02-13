export type NotificationModule =
  | 'inventory'
  | 'maintenance'
  | 'documents'
  | 'jobs'
  | 'hrm'
  | 'purchase_orders'
  | 'logbook';

export type NotificationChannel = 'in_app' | 'email' | 'push';

export type SeverityLevel = 'info' | 'warn' | 'critical';

export type CadenceMode = 'once' | 'hourly' | 'daily' | 'every_n_hours' | 'every_n_days';

export interface CadencePolicy {
  mode: CadenceMode;
  value?: number;
}

export type RuleScopeType = 'fleet' | 'yacht' | 'entity';

export interface RuleScope {
  type: RuleScopeType;
  yachtId?: string;
  entityType?: string;
  entityId?: string;
}

export type RecipientPolicyMode = 'roles' | 'users' | 'assignee' | 'role_then_escalate';

export interface RecipientPolicy {
  mode: RecipientPolicyMode;
  roles?: string[];
  userIds?: string[];
  escalationRoles?: string[];
}

export interface MessageTemplate {
  title: string;
  message: string;
}

export interface NotificationRuleContract {
  id: string;
  name: string;
  module: NotificationModule;
  eventType: string;
  scope: RuleScope;
  conditions: Record<string, unknown>;
  cadence: CadencePolicy;
  channels: NotificationChannel[];
  minSeverity: SeverityLevel;
  template: MessageTemplate;
  recipientPolicy: RecipientPolicy;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNotificationRuleRequest {
  name: string;
  module: NotificationModule;
  eventType: string;
  scope: RuleScope;
  conditions?: Record<string, unknown>;
  cadence?: CadencePolicy;
  channels: NotificationChannel[];
  minSeverity?: SeverityLevel;
  template: MessageTemplate;
  recipientPolicy: RecipientPolicy;
  active?: boolean;
}

export interface UpdateNotificationRuleRequest {
  name?: string;
  scope?: RuleScope;
  conditions?: Record<string, unknown>;
  cadence?: CadencePolicy;
  channels?: NotificationChannel[];
  minSeverity?: SeverityLevel;
  template?: MessageTemplate;
  recipientPolicy?: RecipientPolicy;
  active?: boolean;
}

export interface TestNotificationRuleRequest {
  samplePayload: Record<string, unknown>;
  context?: {
    yachtId?: string;
    entityId?: string;
    entityType?: string;
  };
}

export interface TestNotificationRuleResponse {
  rendered: MessageTemplate;
  recipients: string[];
}
