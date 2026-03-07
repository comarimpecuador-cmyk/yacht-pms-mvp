export interface SyncSummary {
  pushed: number;
  pulled: number;
  failed: number;
}

export interface OutboxItem {
  id: string;
  module: string;
  payload: string;
  createdAt: string;
}

