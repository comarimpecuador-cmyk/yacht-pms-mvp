import type {
  V2Category,
  V2EventSubType,
  V2EventType,
  V2Severity,
} from './classification';

export type WorkflowStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'closed' | 'cancelled';
export type ApprovalLevel = 'none' | 'captain' | 'chief_engineer' | 'management_office' | 'system_admin';
export type WatchPeriod =
  | '0000-0400'
  | '0400-0800'
  | '0800-1200'
  | '1200-1600'
  | '1600-2000'
  | '2000-0000'
  | 'custom';

export type LogbookV2EventPayload = {
  eventId: string;
  legacyRefs?: {
    legacyEntryId?: string;
    legacyObservationId?: string;
    legacySource?: 'json' | 'csv' | 'database' | 'manual';
  };
  yacht: {
    yachtId: string;
    name: string;
    registrationNo: string;
    imo?: string;
    mmsi?: string;
    callsign?: string;
    yachtType: 'motor_yacht' | 'sailing_yacht' | 'catamaran' | 'support_vessel' | 'other';
    homePort: string;
    flag?: string;
  };
  chronology: {
    occurredAt: string;
    loggedAt: string;
    timezone: string;
    watchPeriod?: WatchPeriod;
    sequenceNo: number;
  };
  classification: {
    eventType: V2EventType;
    eventSubType: V2EventSubType;
    category: V2Category;
    severity: V2Severity;
    tags?: string[];
  };
  workflow: {
    status: WorkflowStatus;
    approvalRequired: boolean;
    approvalLevel?: ApprovalLevel;
    statusReason?: string;
  };
  responsibility: {
    reportedByUserId: string;
    reportedByName: string;
    reportedByRole?: string;
    assignedToUserId?: string | null;
    approvedByUserId?: string | null;
    acknowledgedByUserIds?: string[];
  };
  location?: {
    source: 'gps' | 'manual' | 'port_reference';
    latitude: number;
    longitude: number;
    portName?: string;
    area?: string;
    countryCode?: string;
    accuracyMeters?: number;
  };
  details: {
    title: string;
    description: string;
    engineReadings?: Array<{
      engineId: string;
      engineName: string;
      hours: number;
      rpm?: number;
      temperatureC?: number;
    }>;
    maintenanceRef?: {
      taskId?: string;
      priority?: 'Low' | 'Medium' | 'High' | 'Critical';
      dueDate?: string;
    };
    incidentRef?: {
      injuries?: number;
      pollutionRisk?: boolean;
      reportableToAuthority?: boolean;
    };
    serviceRef?: {
      charterId?: string;
      guestCount?: number;
      serviceArea?: string;
    };
  };
  evidence?: Array<{
    evidenceId: string;
    fileUrl: string;
    fileName: string;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' | 'text/plain' | 'video/mp4';
    checksumSha256?: string;
    uploadedAt: string;
    uploadedByUserId: string;
    caption?: string;
  }>;
  audit: {
    createdAt: string;
    createdByUserId: string;
    updatedAt: string;
    updatedByUserId: string;
    lastChangeReason?: string;
    changeHistory: Array<{
      changedAt: string;
      changedByUserId: string;
      changeType: 'create' | 'update' | 'status_change' | 'approval' | 'delete';
      changedFields?: string[];
      reason: string;
    }>;
  };
};

