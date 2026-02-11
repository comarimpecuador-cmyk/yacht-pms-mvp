export enum MaintenanceTaskStatus {
  Draft = 'Draft',
  Scheduled = 'Scheduled',
  Due = 'Due',
  InProgress = 'In Progress',
  Blocked = 'Blocked',
  Completed = 'Completed',
  Verified = 'Verified',
  Archived = 'Archived',
}

export enum LogBookStatus {
  Draft = 'Draft',
  Submitted = 'Submitted',
  Locked = 'Locked',
  Corrected = 'Corrected',
}

export enum RequisitionStatus {
  Draft = 'Draft',
  Submitted = 'Submitted',
  UnderHoDReview = 'Under HoD Review',
  UnderCaptainReview = 'Under Captain Review',
  UnderManagementReview = 'Under Management Review',
  Approved = 'Approved',
  Rejected = 'Rejected',
  POIssued = 'PO Issued',
  PartiallyFulfilled = 'Partially Fulfilled',
  Closed = 'Closed',
}

export enum DocumentStatus {
  Active = 'Active',
  ExpiringSoon = 'Expiring Soon',
  Expired = 'Expired',
  RenewalInProgress = 'Renewal In Progress',
  Renewed = 'Renewed',
  Archived = 'Archived',
}

export enum ISMStatus {
  Draft = 'Draft',
  Submitted = 'Submitted',
  UnderReview = 'Under Review',
  PendingSignature = 'Pending Signature',
  Signed = 'Signed',
  VersionSuperseded = 'Version Superseded',
  Archived = 'Archived',
}

export enum ManifestStatus {
  Draft = 'Draft',
  InReview = 'In Review',
  CaptainApproved = 'Captain Approved',
  Final = 'Final',
  Exported = 'Exported',
  Archived = 'Archived',
}

export enum WorkingDayStatus {
  DraftDaily = 'Draft Daily',
  SubmittedDaily = 'Submitted Daily',
  ValidatedByHoD = 'Validated by HoD',
  MonthlyClosed = 'Monthly Closed',
  Exported = 'Exported',
}
