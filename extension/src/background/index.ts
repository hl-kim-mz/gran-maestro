import { MESSAGE_TYPES, STORAGE_KEYS } from '../shared/constants';
import {
  CapturePayload,
  CaptureSaveMsg,
  CaptureSaveResponse,
  ExtensionResponse,
  InspectStatusMsg,
  ServerStatusMsg,
  TakeScreenshotResponse,
  ToggleInspectMsg
} from '../shared/types';
import { isExtensionMessage, sendToContent } from '../shared/messages';
import { initializeConnectionMonitor, onConnectionChange } from './connection-monitor';
import { queueOfflineCapture } from './offline-store';
import { postCapture, ServerRequestError } from './server-client';
import { syncOfflineQueue } from './sync-manager';

async function readServerStatus(): Promise<boolean> {
  const status = await chrome.storage.local.get(STORAGE_KEYS.SERVER_STATUS);
  return Boolean(status[STORAGE_KEYS.SERVER_STATUS]);
}

async function handleCaptureSave(capture: CapturePayload): Promise<CaptureSaveResponse> {
  try {
    const captureId = await postCapture(capture);
    return {
      ok: true,
      payload: {
        captureId
      }
    };
  } catch (error) {
    if (error instanceof ServerRequestError && error.isOffline) {
      const queued = await queueOfflineCapture(capture);
      return {
        ok: true,
        payload: {
          captureId: queued.localId
        }
      };
    }

    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

function setupConnectionListener(): void {
  onConnectionChange(async (connected) => {
    if (!connected) {
      return;
    }
    try {
      await syncOfflineQueue();
    } catch {
      // Non-blocking: capture should continue without waiting for sync completion.
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('Gran Maestro extension installed');
  chrome.storage.local.set({ [STORAGE_KEYS.SERVER_STATUS]: false });
});

initializeConnectionMonitor();
setupConnectionListener();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isExtensionMessage(message)) {
    return false;
  }

  (async () => {
    if (message.type === MESSAGE_TYPES.TOGGLE_INSPECT) {
      const typedMessage = message as ToggleInspectMsg;
      const responseFromContent = await sendToContent<InspectStatusMsg>(
        typedMessage.payload.tabId,
        message
      );

      if (!responseFromContent?.payload || typeof responseFromContent.payload.enabled !== 'boolean') {
        sendResponse({
          ok: false,
          error: 'Invalid inspect status response'
        } as ExtensionResponse);
        return;
      }

      sendResponse({
        ok: true,
        type: MESSAGE_TYPES.INSPECT_STATUS,
        payload: responseFromContent.payload
      });
      return;
    }

    if (message.type === MESSAGE_TYPES.SERVER_STATUS_QUERY) {
      const connected = await readServerStatus();
      const response: ServerStatusMsg = {
        type: MESSAGE_TYPES.SERVER_STATUS,
        payload: { connected }
      };
      sendResponse(response);
      return;
    }

    if (message.type === MESSAGE_TYPES.TAKE_SCREENSHOT) {
      try {
        const windowId = sender?.tab?.windowId;
        const imageDataUrl = windowId
          ? await chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
          : await chrome.tabs.captureVisibleTab({ format: 'png' });

        const response: TakeScreenshotResponse = {
          ok: true,
          payload: { imageDataUrl }
        };
        sendResponse(response);
      } catch (error) {
        console.error(
          '[GM] captureVisibleTab error:',
          error instanceof Error ? error.message : error
        );
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Screenshot capture failed'
        } as ExtensionResponse);
      }
      return;
    }

    if (message.type === MESSAGE_TYPES.CAPTURE_SAVE) {
      const typedMessage = message as CaptureSaveMsg;
      const capture = typedMessage.payload.capture;
      const tabId = typedMessage.payload.tabId ?? sender?.tab?.id ?? null;

      await chrome.storage.local.set({
        [STORAGE_KEYS.LAST_CAPTURE]: {
          tabId,
          capture
        }
      });

      const response = await handleCaptureSave(capture);
      sendResponse(response);
      return;
    }

    if (message.type === MESSAGE_TYPES.CAPTURE_DATA || message.type === MESSAGE_TYPES.SAVE_CAPTURE) {
      await chrome.storage.local.set({
        [STORAGE_KEYS.LAST_CAPTURE]: message.payload
      });
      sendResponse({ ok: true } as ExtensionResponse);
      return;
    }

    if (message.type === MESSAGE_TYPES.INSPECT_STATUS) {
      sendResponse({
        ok: true
      } as ExtensionResponse);
      return;
    }

    sendResponse({ ok: false, error: `Unhandled message type: ${message.type}` } as ExtensionResponse);
  })().catch((error) => {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    } as ExtensionResponse);
  });

  return true;
});
