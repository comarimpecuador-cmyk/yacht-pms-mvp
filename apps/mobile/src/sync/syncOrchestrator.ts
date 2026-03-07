import { SyncSummary } from './syncTypes';

export async function runSyncOnce(): Promise<SyncSummary> {
  // Phase 1 intentionally keeps sync implementation as a stub.
  return {
    pushed: 0,
    pulled: 0,
    failed: 0,
  };
}

