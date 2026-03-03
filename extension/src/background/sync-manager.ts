import { OFFLINE_SYNC_DELAY_MS, OFFLINE_SYNC_MAX_ATTEMPTS, STORAGE_KEYS } from '../shared/constants';
import { OfflineCaptureRecord } from '../shared/types';
import { deleteOfflineCapture, getOfflineCaptures, markOfflineCaptureFailed } from './offline-store';
import { postCapture } from './server-client';

let syncing = false;

function updateSyncState(state: { syncing: boolean; syncedCount?: number; totalCount?: number }): void {
  chrome.storage.local.set({
    [STORAGE_KEYS.SYNC_STATUS]: state
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function syncOne(record: OfflineCaptureRecord): Promise<boolean> {
  try {
    await postCapture(record.payload);
    await deleteOfflineCapture(record.localId);
    return true;
  } catch (error) {
    const nextAttempts = record.syncAttempts + 1;
    await markOfflineCaptureFailed(record.localId, record.syncAttempts);

    if (nextAttempts < OFFLINE_SYNC_MAX_ATTEMPTS) {
      return false;
    }

    return false;
  }
}

export async function syncOfflineQueue(): Promise<void> {
  if (syncing) {
    return;
  }

  syncing = true;
  let totalCount = 0;
  let syncedCount = 0;
  try {
    const offlineCaptures = await getOfflineCaptures();
    totalCount = offlineCaptures.length;
    updateSyncState({ syncing: true, totalCount, syncedCount });

    for (const record of offlineCaptures) {
      const synced = await syncOne(record);
      if (synced) {
        syncedCount += 1;
      }
      if (syncedCount < totalCount) {
        await delay(OFFLINE_SYNC_DELAY_MS);
      }
      updateSyncState({ syncing: true, totalCount, syncedCount });
    }

    updateSyncState({
      syncing: false,
      totalCount,
      syncedCount
    });
  } finally {
    syncing = false;
  }
}
