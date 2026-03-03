import { DEFAULT_REQUEST_TIMEOUT_MS, DEFAULT_SERVER_ORIGIN, SERVER_ENDPOINTS, STORAGE_KEYS } from '../shared/constants';
import { CapturePayload, ServerConfig } from '../shared/types';
import { getSessionToken, getStoredSessionToken, clearSessionToken } from './session-token';

interface ErrorResult {
  status?: number;
  isOffline?: boolean;
}

export class ServerRequestError extends Error {
  public readonly status?: number;
  public readonly isOffline: boolean;

  constructor(message: string, details?: ErrorResult) {
    super(message);
    this.status = details?.status;
    this.isOffline = Boolean(details?.isOffline);
  }
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

async function parseJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function readServerConfig(): Promise<ServerConfig> {
  const config = await chrome.storage.local.get(STORAGE_KEYS.SERVER_ORIGIN);
  const configured = config[STORAGE_KEYS.SERVER_ORIGIN];
  return {
    baseUrl:
      typeof configured === 'string' && configured.trim().length > 0
        ? configured
        : DEFAULT_SERVER_ORIGIN
  };
}

function buildEndpoint(baseUrl: string, path: string): string {
  return `${baseUrl}${path}`;
}

function extractCaptureId(payload: unknown): string | null {
  if (typeof payload === 'string') {
    return payload;
  }

  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const objectPayload = payload as { id?: unknown };
  if (typeof objectPayload.id === 'string') {
    return objectPayload.id;
  }

  return null;
}

async function postCaptureRaw(
  config: ServerConfig,
  capturePayload: CapturePayload,
  token?: string
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const timeout = requestTimeoutSignal(DEFAULT_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      buildEndpoint(config.baseUrl, SERVER_ENDPOINTS.CAPTURES),
      {
        method: 'POST',
        headers,
        body: JSON.stringify(capturePayload),
        signal: timeout.signal
      }
    );
    return response;
  } finally {
    timeout.cancel();
  }
}

export async function healthCheck(): Promise<boolean> {
  const config = await readServerConfig();
  const timeout = requestTimeoutSignal(DEFAULT_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      buildEndpoint(config.baseUrl, SERVER_ENDPOINTS.HEALTH),
      {
        method: 'GET',
        signal: timeout.signal
      }
    );

    return response.ok;
  } catch (error) {
    if (isAbortError(error) || error instanceof TypeError) {
      return false;
    }
    return false;
  } finally {
    timeout.cancel();
  }
}

export async function postCapture(capturePayload: CapturePayload): Promise<string> {
  const config = await readServerConfig();
  const tokenFromStorage = await getStoredSessionToken();
  let response: Response | null = null;

  try {
    response = await postCaptureRaw(config, capturePayload, tokenFromStorage ?? undefined);
  } catch (error) {
    throw new ServerRequestError('CAPTURE_SAVE failed while posting capture', {
      isOffline: true
    });
  }

  if (response.status === 401) {
    let newToken: string | undefined;
    try {
      newToken = (await getSessionToken()) ?? undefined;
    } catch {
      await clearSessionToken();
      throw new ServerRequestError('CAPTURE_SAVE unauthorized');
    }

    if (!newToken) {
      await clearSessionToken();
      throw new ServerRequestError('CAPTURE_SAVE unauthorized');
    }

    try {
      response = await postCaptureRaw(config, capturePayload, newToken);
    } catch (retryError) {
      throw new ServerRequestError('CAPTURE_SAVE failed while retrying with token', {
        isOffline: true
      });
    }

    if (response.status === 401) {
      await clearSessionToken();
      throw new ServerRequestError('CAPTURE_SAVE unauthorized after retry');
    }
  }

  if (!response.ok) {
    throw new ServerRequestError(`CAPTURE_SAVE failed with status ${response.status}`, {
      status: response.status
    });
  }

  const body = await parseJsonSafe(response);
  const captureId = extractCaptureId(body);
  if (!captureId) {
    throw new ServerRequestError('CAPTURE_SAVE response did not include id');
  }

  return captureId;
}

export async function getNextId(): Promise<string> {
  const config = await readServerConfig();
  const timeout = requestTimeoutSignal(DEFAULT_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      buildEndpoint(config.baseUrl, SERVER_ENDPOINTS.CAPTURE_COUNTER_NEXT),
      {
        method: 'GET',
        signal: timeout.signal
      }
    );

    if (!response.ok) {
      throw new ServerRequestError(`Counter request failed: ${response.status}`, {
        status: response.status
      });
    }

    const data = await parseJsonSafe(response);
    if (typeof data === 'string') {
      return data;
    }

    if (typeof data === 'object' && data !== null && 'id' in data) {
      const candidate = data.id;
      if (typeof candidate === 'string' && candidate.length > 0) {
        return candidate;
      }
    }

    throw new ServerRequestError('Counter response missing id field');
  } catch (error) {
    if (error instanceof ServerRequestError) {
      throw error;
    }
    throw new ServerRequestError('Counter request failed', { isOffline: true });
  } finally {
    timeout.cancel();
  }
}
