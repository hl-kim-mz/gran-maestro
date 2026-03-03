import { OFFLINE_SYNC_MAX_ATTEMPTS, SERVER_DB } from '../shared/constants';
import { CapturePayload, OfflineCaptureRecord } from '../shared/types';

let dbPromise: Promise<IDBDatabase> | null = null;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB request failed'));
    };
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    };
  });
}

export async function openOfflineDatabase(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(SERVER_DB.NAME);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SERVER_DB.OFFLINE_STORE)) {
        const store = db.createObjectStore(SERVER_DB.OFFLINE_STORE, {
          keyPath: SERVER_DB.KEY_PATH
        });
        store.createIndex(SERVER_DB.CREATED_AT_INDEX, 'createdAt', {
          unique: false
        });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open IndexedDB'));
      dbPromise = null;
    };
  });

  return dbPromise;
}

function createLocalCaptureId(): string {
  const randomValue =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(16).slice(2, 10);

  return `LOCAL-${randomValue.slice(0, 8).toUpperCase()}`;
}

export async function queueOfflineCapture(capturePayload: CapturePayload): Promise<OfflineCaptureRecord> {
  const db = await openOfflineDatabase();
  const record: OfflineCaptureRecord = {
    localId: createLocalCaptureId(),
    payload: capturePayload,
    createdAt: new Date().toISOString(),
    syncAttempts: 0
  };

  const tx = db.transaction(SERVER_DB.OFFLINE_STORE, 'readwrite');
  const store = tx.objectStore(SERVER_DB.OFFLINE_STORE);
  requestToPromise(store.put(record));
  await transactionToPromise(tx);

  return record;
}

export async function getOfflineCaptures(): Promise<OfflineCaptureRecord[]> {
  const db = await openOfflineDatabase();
  const tx = db.transaction(SERVER_DB.OFFLINE_STORE, 'readonly');
  const store = tx.objectStore(SERVER_DB.OFFLINE_STORE);
  const index = store.index(SERVER_DB.CREATED_AT_INDEX);
  const rows: OfflineCaptureRecord[] = [];

  const cursorRequest = index.openCursor();
  await new Promise<void>((resolve, reject) => {
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) {
        rows.push(cursor.value as OfflineCaptureRecord);
        cursor.continue();
        return;
      }
      resolve();
    };

    cursorRequest.onerror = () => {
      reject(cursorRequest.error ?? new Error('Failed to read offline queue'));
    };
  });

  await transactionToPromise(tx);
  return rows;
}

export async function deleteOfflineCapture(localId: string): Promise<void> {
  const db = await openOfflineDatabase();
  const tx = db.transaction(SERVER_DB.OFFLINE_STORE, 'readwrite');
  requestToPromise(tx.objectStore(SERVER_DB.OFFLINE_STORE).delete(localId));
  await transactionToPromise(tx);
}

export async function markOfflineCaptureFailed(
  localId: string,
  existingAttempts: number
): Promise<void> {
  const db = await openOfflineDatabase();
  const tx = db.transaction(SERVER_DB.OFFLINE_STORE, 'readonly');
  const request = tx.objectStore(SERVER_DB.OFFLINE_STORE).get(localId);

  const existing = await requestToPromise(request);
  await transactionToPromise(tx);

  if (!existing) {
    return;
  }

  const record = existing as OfflineCaptureRecord;
  const attempts = existingAttempts + 1;
  const nextRecord: OfflineCaptureRecord = {
    ...record,
    syncAttempts:
      attempts > OFFLINE_SYNC_MAX_ATTEMPTS ? OFFLINE_SYNC_MAX_ATTEMPTS : attempts
  };

  const writeTx = db.transaction(SERVER_DB.OFFLINE_STORE, 'readwrite');
  requestToPromise(writeTx.objectStore(SERVER_DB.OFFLINE_STORE).put(nextRecord));
  await transactionToPromise(writeTx);
}
