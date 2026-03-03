import { DEFAULT_REQUEST_TIMEOUT_MS, DEFAULT_SERVER_ORIGIN, SERVER_ENDPOINTS, STORAGE_KEYS } from '../shared/constants';

async function readServerOrigin(): Promise<string> {
  const config = await chrome.storage.local.get(STORAGE_KEYS.SERVER_ORIGIN);
  const configured = config[STORAGE_KEYS.SERVER_ORIGIN];
  if (typeof configured === 'string' && configured.trim().length > 0) {
    return configured;
  }
  return DEFAULT_SERVER_ORIGIN;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function requestTimeoutSignal(timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer)
  };
}

export async function getStoredSessionToken(): Promise<string | null> {
  const item = await chrome.storage.local.get(STORAGE_KEYS.SESSION_TOKEN);
  const raw = item[STORAGE_KEYS.SESSION_TOKEN];
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

export async function setSessionToken(token: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SESSION_TOKEN]: token });
}

export async function clearSessionToken(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.SESSION_TOKEN);
}

export async function getSessionToken(): Promise<string | null> {
  const existingToken = await getStoredSessionToken();
  if (existingToken) {
    return existingToken;
  }

  const origin = await readServerOrigin();
  const timeout = requestTimeoutSignal(DEFAULT_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${origin}${SERVER_ENDPOINTS.AUTH_TOKEN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      signal: timeout.signal
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const candidate =
      payload && typeof payload === 'object' && 'token' in payload ? payload.token : null;

    if (typeof candidate === 'string' && candidate.length > 0) {
      await setSessionToken(candidate);
      return candidate;
    }

    return null;
  } catch (error) {
    if (isAbortError(error)) {
      return null;
    }
    if (error instanceof TypeError) {
      return null;
    }
    return null;
  } finally {
    timeout.cancel();
  }
}
