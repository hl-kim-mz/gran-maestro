import { DEFAULT_HEALTH_CHECK_MS, REQUEST_POLL_INTERVAL_MS, STORAGE_KEYS } from '../shared/constants';
import { MESSAGE_TYPES } from '../shared/constants';
import { healthCheck } from './server-client';

type StatusListener = (connected: boolean) => void;

let initialized = false;
let isConnected: boolean | null = null;
let timerId: number | null = null;
const listeners = new Set<StatusListener>();

function normalizeBoolean(value: unknown): boolean {
  return Boolean(value);
}

async function updateConnectionState(nextConnected: boolean): Promise<void> {
  const previous = isConnected;
  isConnected = nextConnected;
  await chrome.storage.local.set({ [STORAGE_KEYS.SERVER_STATUS]: nextConnected });

  if (previous !== nextConnected) {
    listeners.forEach((listener) => listener(nextConnected));

    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.SERVER_STATUS,
      payload: {
        connected: nextConnected
      }
    }).catch(() => {
      // no receiver yet — popup may not be open
    });
  }
}

async function checkHealth(): Promise<void> {
  let connected = false;
  try {
    connected = await healthCheck();
  } catch {
    connected = false;
  }
  await updateConnectionState(connected);
}

export function onConnectionChange(listener: StatusListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function getLastKnownStatus(): Promise<boolean> {
  if (isConnected === null) {
    const status = await chrome.storage.local.get(STORAGE_KEYS.SERVER_STATUS);
    return normalizeBoolean(status[STORAGE_KEYS.SERVER_STATUS]);
  }
  return isConnected;
}

export function initializeConnectionMonitor(): void {
  if (initialized) {
    return;
  }
  initialized = true;

  checkHealth().catch(() => {
    void updateConnectionState(false);
  });

  const runCheck = (): void => {
    void checkHealth();
  };

  timerId = self.setInterval(runCheck, DEFAULT_HEALTH_CHECK_MS) as unknown as number;

  if (chrome.alarms && chrome.alarms.create) {
    const alarmName = 'gm-server-health-check';
    chrome.alarms.create(alarmName, {
      periodInMinutes: Math.max(DEFAULT_HEALTH_CHECK_MS / 60000, 1 / 6)
    });

    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name !== alarmName) {
        return;
      }
      runCheck();
    });
  }

  chrome.runtime.onStartup.addListener(() => {
    runCheck();
  });

  if (REQUEST_POLL_INTERVAL_MS <= 0) {
    return;
  }
}
