import { MESSAGE_TYPES, STORAGE_KEYS } from '../shared/constants';
import { InspectStatusMsg, OVERLAY_TOGGLE_MESSAGE, OverlayToggleMsg, ServerStatusMsg, ToggleInspectMsg } from '../shared/types';
import { sendToBackground } from '../shared/messages';

const SERVER_STATUS_POLL_MS = 3_000;

const toggleButton = document.getElementById('inspectToggle') as HTMLButtonElement | null;
const inspectText = document.getElementById('inspectText') as HTMLParagraphElement | null;
const serverStatusDot = document.getElementById('serverStatusDot') as HTMLSpanElement | null;
const serverStatusText = document.getElementById('serverStatusText') as HTMLSpanElement | null;
const projectSelect = document.getElementById('projectSelect') as HTMLSelectElement | null;
const overlayToggleButton = document.getElementById('overlayToggle') as HTMLButtonElement | null;
const overlayText = document.getElementById('overlayText') as HTMLParagraphElement | null;

const inspectStateStorageKey = (tabId: number) => `popup-inspect-state-${tabId}`;
const overlayStateStorageKey = 'gm-overlay-badge-state';
let activeTabId: number | null = null;
let isInspectMode = false;
let isOverlayEnabled = true;

function applyInspectModeUI(enabled: boolean): void {
  isInspectMode = enabled;
  if (toggleButton) {
    toggleButton.textContent = enabled ? 'Disable Inspect' : 'Enable Inspect';
  }
  if (inspectText) {
    inspectText.textContent = enabled ? 'Inspect mode is ON' : 'Inspect mode is OFF';
  }
}

function applyOverlayModeUI(enabled: boolean): void {
  isOverlayEnabled = enabled;
  if (overlayToggleButton) {
    overlayToggleButton.textContent = enabled ? 'Disable Overlay IDs' : 'Enable Overlay IDs';
  }
  if (overlayText) {
    overlayText.textContent = enabled ? 'Overlay IDs are ON' : 'Overlay IDs are OFF';
  }
}

function applyServerStatusUI(connected: boolean): void {
  if (serverStatusDot) {
    serverStatusDot.classList.toggle('online', connected);
  }
  if (serverStatusText) {
    serverStatusText.textContent = connected ? 'Server: connected' : 'Server: disconnected';
  }
}

function ensureProjectOptions(): void {
  if (!projectSelect) {
    return;
  }

  if (projectSelect.options.length > 0) {
    return;
  }

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Select project';
  projectSelect.appendChild(defaultOption);

  const projectOption = document.createElement('option');
  projectOption.value = 'default';
  projectOption.textContent = 'default';
  projectSelect.appendChild(projectOption);
}

function applyProjectState(projectId: string): void {
  if (!projectSelect) {
    return;
  }
  projectSelect.value = projectId;
}

async function refreshServerStatus(): Promise<void> {
  const serverStatus = await sendToBackground<ServerStatusMsg>({
    type: MESSAGE_TYPES.SERVER_STATUS_QUERY,
    payload: {}
  });
  applyServerStatusUI(serverStatus.payload.connected);
}

async function queryActiveTabId(): Promise<number> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];
  if (!activeTab?.id) {
    throw new Error('Active tab not found');
  }
  return activeTab.id;
}

async function hydrateInspectUI(tabId: number): Promise<void> {
  const key = inspectStateStorageKey(tabId);
  const state = await chrome.storage.local.get(key);
  applyInspectModeUI(Boolean(state[key]));
}

async function hydrateOverlayUI(): Promise<void> {
  const overlayState = await chrome.storage.local.get(overlayStateStorageKey);
  const hasStoredOverlayState = Object.prototype.hasOwnProperty.call(
    overlayState,
    overlayStateStorageKey
  );
  const overlayStateValue = hasStoredOverlayState
    ? Boolean(overlayState[overlayStateStorageKey])
    : true;
  applyOverlayModeUI(overlayStateValue);
}

async function hydrateProjectUI(): Promise<void> {
  ensureProjectOptions();
  const state = await chrome.storage.local.get(STORAGE_KEYS.SELECTED_PROJECT);
  const savedProject =
    typeof state[STORAGE_KEYS.SELECTED_PROJECT] === 'string'
      ? state[STORAGE_KEYS.SELECTED_PROJECT]
      : '';
  applyProjectState(savedProject);
}

async function setupConnectionPolling(): Promise<void> {
  await refreshServerStatus();
  window.setInterval(() => {
    void refreshServerStatus();
  }, SERVER_STATUS_POLL_MS);
}

function setupListeners(): void {
  if (toggleButton) {
    toggleButton.addEventListener('click', async () => {
      if (activeTabId === null) {
        return;
      }

      const nextState = !isInspectMode;
      const message: ToggleInspectMsg = {
        type: MESSAGE_TYPES.TOGGLE_INSPECT,
        payload: {
          tabId: activeTabId,
          enabled: nextState
        }
      };

      const response = await sendToBackground<InspectStatusMsg>(message);
      if (response?.payload?.enabled !== undefined) {
        applyInspectModeUI(response.payload.enabled);
        await chrome.storage.local.set({ [inspectStateStorageKey(activeTabId)]: response.payload.enabled });
      }
    });
  }

  if (projectSelect) {
    projectSelect.addEventListener('change', async () => {
      await chrome.storage.local.set({
        [STORAGE_KEYS.SELECTED_PROJECT]: projectSelect.value
      });
    });
  }

  if (overlayToggleButton) {
    overlayToggleButton.addEventListener('click', async () => {
      if (activeTabId === null) {
        return;
      }

      const nextState = !isOverlayEnabled;
      const message: OverlayToggleMsg = {
        type: OVERLAY_TOGGLE_MESSAGE,
        payload: {
          tabId: activeTabId,
          enabled: nextState
        }
      };

      try {
        await chrome.tabs.sendMessage(activeTabId, message);
        await chrome.storage.local.set({ [overlayStateStorageKey]: nextState });
        applyOverlayModeUI(nextState);
      } catch {
        applyOverlayModeUI(isOverlayEnabled);
      }
    });
  }
}

async function bootstrap(): Promise<void> {
  try {
    activeTabId = await queryActiveTabId();
    await hydrateInspectUI(activeTabId);
    await hydrateOverlayUI();
    await hydrateProjectUI();
    await setupConnectionPolling();
  } catch {
    applyInspectModeUI(false);
    applyServerStatusUI(false);
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === MESSAGE_TYPES.SERVER_STATUS) {
    const statusMessage = message as ServerStatusMsg;
    applyServerStatusUI(statusMessage.payload.connected);
  }
  if (message?.type === MESSAGE_TYPES.INSPECT_STATUS) {
    const inspectMessage = message as InspectStatusMsg;
    applyInspectModeUI(inspectMessage.payload.enabled);
  }
});

bootstrap().catch(() => {
  applyInspectModeUI(false);
  applyServerStatusUI(false);
});

setupListeners();
