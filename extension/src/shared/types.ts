import { MESSAGE_TYPES } from './constants';

export type MessageType = typeof MESSAGE_TYPES[keyof typeof MESSAGE_TYPES];

export const OVERLAY_TOGGLE_MESSAGE = 'OVERLAY_TOGGLE' as const;
export type OverlayToggleMessageType = typeof OVERLAY_TOGGLE_MESSAGE;

export type CaptureMode = 'immediate' | 'batch';

export interface CaptureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CapturePayload {
  url: string;
  selector: string;
  css_path: string;
  rect: CaptureRect | null;
  html_snapshot: string | null;
  screenshot_data: string | null;
  memo: string;
  tags: string[];
  mode: CaptureMode;
  component_name: string | null;
  source_path: string | null;
}

export interface ServerConfig {
  baseUrl: string;
}

export type SyncStatus = 'idle' | 'syncing' | 'error';

export interface OfflineCaptureRecord {
  localId: string;
  payload: CapturePayload;
  createdAt: string;
  syncAttempts: number;
}

export interface ToggleInspectMsg {
  type: typeof MESSAGE_TYPES.TOGGLE_INSPECT;
  payload: {
    tabId: number;
    enabled: boolean;
  };
}

export interface InspectStatusMsg {
  type: typeof MESSAGE_TYPES.INSPECT_STATUS;
  payload: {
    tabId: number;
    enabled: boolean;
  };
}

export interface CaptureDataMsg {
  type: typeof MESSAGE_TYPES.CAPTURE_DATA;
  payload: {
    tabId: number;
    selectedText?: string;
    pageUrl: string;
    capturedAt: string;
    screenshotDataUrl?: string;
  };
}

export interface TakeScreenshotMsg {
  type: typeof MESSAGE_TYPES.TAKE_SCREENSHOT;
  payload: Record<string, never>;
}

export interface TakeScreenshotResponse {
  ok: boolean;
  payload?: {
    imageDataUrl: string;
  };
  error?: string;
}

export interface SaveCaptureMsg {
  type: typeof MESSAGE_TYPES.SAVE_CAPTURE;
  payload: {
    tabId: number;
    request: {
      selectedText: string;
      pageUrl: string;
      capturedAt: string;
    };
  };
}

export interface CaptureSaveMsg {
  type: typeof MESSAGE_TYPES.CAPTURE_SAVE;
  payload: {
    tabId?: number;
    capture: CapturePayload;
  };
}

export interface CaptureSaveResponse {
  ok: boolean;
  payload?: {
    captureId: string;
  };
  error?: string;
}

export interface ServerStatusMsg {
  type: typeof MESSAGE_TYPES.SERVER_STATUS;
  payload: {
    connected: boolean;
  };
}

export interface ServerStatusQueryMsg {
  type: typeof MESSAGE_TYPES.SERVER_STATUS_QUERY;
  payload: Record<string, never>;
}

export interface OverlayToggleMsg {
  type: OverlayToggleMessageType;
  payload: {
    tabId: number;
    enabled: boolean;
  };
}

export type ExtensionMessage =
  | ToggleInspectMsg
  | InspectStatusMsg
  | CaptureDataMsg
  | TakeScreenshotMsg
  | CaptureSaveMsg
  | SaveCaptureMsg
  | ServerStatusMsg
  | ServerStatusQueryMsg
  | OverlayToggleMsg;

export interface ExtensionResponse {
  ok: boolean;
  error?: string;
  payload?: {
    [key: string]: unknown;
  };
}
