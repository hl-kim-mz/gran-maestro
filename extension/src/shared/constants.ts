export const DEFAULT_SERVER_ORIGIN = 'http://127.0.0.1:3847';
export const DEFAULT_HEALTH_CHECK_MS = 10_000;
export const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
export const REQUEST_POLL_INTERVAL_MS = 10_000;
export const OFFLINE_SYNC_DELAY_MS = 1_000;
export const OFFLINE_SYNC_MAX_ATTEMPTS = 3;

export const SERVER_ENDPOINTS = {
  CAPTURES: '/api/captures',
  CAPTURE_COUNTER_NEXT: '/api/captures/counter/next',
  HEALTH: '/api/health',
  AUTH_TOKEN: '/api/auth/token',
  PROJECTS: '/api/projects'
} as const;

export const SERVER_DB = {
  NAME: 'gran-maestro-extension',
  OFFLINE_STORE: 'gm-offline-captures',
  KEY_PATH: 'localId',
  CREATED_AT_INDEX: 'createdAt'
} as const;

export const MESSAGE_TYPES = {
  TOGGLE_INSPECT: 'TOGGLE_INSPECT',
  INSPECT_STATUS: 'INSPECT_STATUS',
  CAPTURE_DATA: 'CAPTURE_DATA',
  SAVE_CAPTURE: 'SAVE_CAPTURE',
  TAKE_SCREENSHOT: 'TAKE_SCREENSHOT',
  CAPTURE_SAVE: 'CAPTURE_SAVE',
  SERVER_STATUS: 'SERVER_STATUS',
  SERVER_STATUS_QUERY: 'SERVER_STATUS_QUERY',
  PROJECTS_REFRESH: 'PROJECTS_REFRESH'
} as const;

export const STORAGE_KEYS = {
  INSPECT_PREFIX: 'inspect-enabled-tab-',
  SERVER_STATUS: 'server-status-connected',
  LAST_CAPTURE: 'last-capture',
  SYNC_STATUS: 'sync-status',
  SERVER_ORIGIN: 'server-origin-override',
  SESSION_TOKEN: 'server-session-token',
  SELECTED_PROJECT: 'selected-project'
} as const;

export const EXTENSION_PORT = 3847;
