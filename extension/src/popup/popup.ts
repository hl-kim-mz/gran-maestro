import {
  DEFAULT_SERVER_ORIGIN,
  MESSAGE_TYPES,
  SERVER_ENDPOINTS,
  STORAGE_KEYS
} from '../shared/constants';
import {
  ExtensionResponse,
  InspectStatusMsg,
  OVERLAY_TOGGLE_MESSAGE,
  OverlayToggleMsg,
  Project,
  ServerStatusMsg,
  ToggleInspectMsg
} from '../shared/types';
import { sendToBackground } from '../shared/messages';

const SERVER_STATUS_POLL_MS = 3_000;
const INSPECT_ERROR_TIMEOUT_MS = 3_000;
const INSPECT_ERROR_TEXT = 'Please reload the page and try again';
const INSPECT_TEXT = 'Pick an element on the page';

const toggleButton = document.getElementById('inspectToggle') as HTMLButtonElement | null;
const inspectText = document.getElementById('inspectText') as HTMLParagraphElement | null;
const serverStatusDot = document.getElementById('serverStatusDot') as HTMLSpanElement | null;
const serverStatusText = document.getElementById('serverStatusText') as HTMLSpanElement | null;
const projectSelect = document.getElementById('projectSelect') as HTMLSelectElement | null;
const refreshProjectsButton = document.getElementById('refreshProjects') as HTMLButtonElement | null;
const overlayToggleButton = document.getElementById('overlayToggle') as HTMLButtonElement | null;
const overlayText = document.getElementById('overlayText') as HTMLParagraphElement | null;

const overlayStateStorageKey = 'gm-overlay-badge-state';
const disconnectedServerTooltip = '/mst:dashboard로 서버를 시작하세요';

let activeTabId: number | null = null;
let isOverlayEnabled = true;
let isProjectCatalogLoaded = false;
let lastServerConnected = false;
let inspectErrorTimeout: ReturnType<typeof setTimeout> | null = null;
let cachedProjects: Project[] = [];

type InspectResponse = InspectStatusMsg | ExtensionResponse;

function applyInspectModeUI(): void {
  if (toggleButton) {
    toggleButton.textContent = 'Pick Element';
  }
  if (inspectText) {
    inspectText.textContent = INSPECT_TEXT;
  }
}

function applyOverlayModeUI(enabled: boolean): void {
  isOverlayEnabled = enabled;
  if (overlayToggleButton) {
    overlayToggleButton.textContent = enabled ? 'Hide Element IDs' : 'Show Element IDs';
  }
  if (overlayText) {
    overlayText.textContent = enabled ? 'Element IDs: ON' : 'Element IDs: OFF';
  }
}

function applyServerStatusUI(connected: boolean): void {
  if (serverStatusDot) {
    serverStatusDot.classList.toggle('online', connected);
  }
  if (serverStatusText) {
    serverStatusText.textContent = connected ? 'Server: connected' : 'Server: disconnected';
    if (connected) {
      serverStatusText.removeAttribute('title');
    } else {
      serverStatusText.title = disconnectedServerTooltip;
    }
  }
}

function isStaleProjectFallback(): boolean {
  if (!projectSelect) {
    return false;
  }

  return Array.from(projectSelect.options).some((option) => option.value === 'default');
}

function clearProjectOptions(): void {
  if (!projectSelect) {
    return;
  }
  projectSelect.options.length = 0;
}

function createProjectOption(value: string, text: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = text;
  return option;
}

function renderDisconnectedProjectFallback(): void {
  if (!projectSelect) {
    return;
  }
  clearProjectOptions();
  projectSelect.disabled = false;
  const selectProjectOption = createProjectOption('', 'Select project');
  const defaultProjectOption = createProjectOption('default', 'default');
  selectProjectOption.selected = true;
  defaultProjectOption.selected = false;
  projectSelect.append(selectProjectOption, defaultProjectOption);
}

function renderConnectedNoProjectPlaceholder(): void {
  if (!projectSelect) {
    return;
  }
  clearProjectOptions();
  projectSelect.disabled = false;
  const selectProjectOption = createProjectOption('', 'Select project');
  selectProjectOption.selected = true;
  projectSelect.appendChild(selectProjectOption);
}

function populateProjectDropdown(projects: Project[]): void {
  if (!projectSelect) {
    return;
  }
  clearProjectOptions();
  for (const project of projects) {
    projectSelect.appendChild(createProjectOption(project.id, project.name));
  }
  projectSelect.disabled = false;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeProject(data: unknown): Project | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }

  const candidate = data as Partial<Project>;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.name !== 'string' ||
    typeof candidate.path !== 'string' ||
    typeof candidate.registered_at !== 'string'
  ) {
    return null;
  }

  return {
    id: candidate.id,
    name: candidate.name,
    path: candidate.path,
    registered_at: candidate.registered_at
  };
}

function showInspectErrorMessage(): void {
  if (!inspectText) {
    return;
  }

  if (inspectErrorTimeout !== null) {
    clearTimeout(inspectErrorTimeout);
  }

  inspectText.textContent = INSPECT_ERROR_TEXT;
  inspectErrorTimeout = window.setTimeout(() => {
    inspectErrorTimeout = null;
    applyInspectModeUI();
  }, INSPECT_ERROR_TIMEOUT_MS);
}

async function readServerOrigin(): Promise<string> {
  const serverConfig = await chrome.storage.local.get(STORAGE_KEYS.SERVER_ORIGIN);
  const configured = serverConfig[STORAGE_KEYS.SERVER_ORIGIN];
  return typeof configured === 'string' && configured.trim().length > 0
    ? configured
    : DEFAULT_SERVER_ORIGIN;
}

async function fetchProjects(): Promise<Project[]> {
  const serverOrigin = await readServerOrigin();
  const endpoint = `${serverOrigin}${SERVER_ENDPOINTS.PROJECTS}`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      console.warn(
        `[Gran Maestro] fetchProjects failed: HTTP ${response.status} ${response.statusText}`
      );
      return [];
    }

    const body = await response.json();
    if (!Array.isArray(body)) {
      console.warn(
        '[Gran Maestro] fetchProjects failed: unexpected response structure',
        body
      );
      return [];
    }

    const projects = body
      .map((entry) => normalizeProject(entry))
      .filter((project): project is Project => project !== null);

    return projects;
  } catch (error) {
    console.warn('[Gran Maestro] fetchProjects failed:', error);
    return [];
  }
}

function getSavedProjectId(state: { [key: string]: unknown }): string {
  const savedProject = state[STORAGE_KEYS.SELECTED_PROJECT];
  return isNonEmptyString(savedProject) ? savedProject : '';
}

async function applyProjectState(projects: Project[]): Promise<void> {
  if (!projectSelect) {
    return;
  }

  const state = await chrome.storage.local.get(STORAGE_KEYS.SELECTED_PROJECT);
  const savedProject = getSavedProjectId(state);
  const hasSavedProject = savedProject.length > 0 && projects.some((project) => project.id === savedProject);

  if (hasSavedProject) {
    projectSelect.value = savedProject;
    return;
  }

  const fallbackProjectId = projects[0]?.id;
  if (!fallbackProjectId) {
    return;
  }
  projectSelect.value = fallbackProjectId;
  await chrome.storage.local.set({ [STORAGE_KEYS.SELECTED_PROJECT]: fallbackProjectId });
}

async function hydrateProjectUI(): Promise<void> {
  if (!projectSelect) {
    return;
  }

  const projects = await fetchProjects();
  cachedProjects = projects;
  isProjectCatalogLoaded = true;

  if (projects.length === 0) {
    renderConnectedNoProjectPlaceholder();
    return;
  }

  populateProjectDropdown(projects);
  await applyProjectState(projects);
}

async function handleServerStatusChange(connected: boolean): Promise<void> {
  const previousConnection = lastServerConnected;
  applyServerStatusUI(connected);

  if (connected === previousConnection) {
    if (!connected) {
      if (!isProjectCatalogLoaded) {
        renderDisconnectedProjectFallback();
      }
      return;
    }

    if (isStaleProjectFallback()) {
      await hydrateProjectUI();
    }
    return;
  }

  lastServerConnected = connected;

  if (connected) {
    await hydrateProjectUI();
    return;
  }

  if (previousConnection && isProjectCatalogLoaded) {
    if (cachedProjects.length > 0) {
      if (projectSelect) {
        projectSelect.disabled = true;
      }
      return;
    }
    renderDisconnectedProjectFallback();
    return;
  }

  renderDisconnectedProjectFallback();
}

async function refreshServerStatus(): Promise<boolean> {
  const serverStatus = await sendToBackground<ServerStatusMsg>({
    type: MESSAGE_TYPES.SERVER_STATUS_QUERY,
    payload: {}
  });
  await handleServerStatusChange(serverStatus.payload.connected);
  return serverStatus.payload.connected;
}

async function queryActiveTabId(): Promise<number> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];
  if (!activeTab?.id) {
    throw new Error('Active tab not found');
  }
  return activeTab.id;
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

      const message: ToggleInspectMsg = {
        type: MESSAGE_TYPES.TOGGLE_INSPECT,
        payload: {
          tabId: activeTabId,
          enabled: true
        }
      };

      try {
        const response = await sendToBackground<InspectResponse>(message);
        if (
          !response ||
          !('payload' in response) ||
          ('ok' in response && response.ok === false)
        ) {
          throw new Error(INSPECT_ERROR_TEXT);
        }

        const inspectPayload = response.payload as { enabled?: unknown } | undefined;
        if (!inspectPayload || typeof inspectPayload.enabled !== 'boolean') {
          throw new Error(INSPECT_ERROR_TEXT);
        }

        applyInspectModeUI();
      } catch {
        showInspectErrorMessage();
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

  if (refreshProjectsButton) {
    refreshProjectsButton.addEventListener('click', () => {
      void hydrateProjectUI();
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
    await hydrateOverlayUI();
    applyServerStatusUI(false);
    renderDisconnectedProjectFallback();
    await setupConnectionPolling();
    if (lastServerConnected) {
      await hydrateProjectUI();
    }
  } catch {
    applyInspectModeUI();
    applyServerStatusUI(false);
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === MESSAGE_TYPES.SERVER_STATUS) {
    const statusMessage = message as ServerStatusMsg;
    void handleServerStatusChange(statusMessage.payload.connected);
  }
  if (message?.type === MESSAGE_TYPES.INSPECT_STATUS) {
    return;
  }
  if (message?.type === MESSAGE_TYPES.PROJECTS_REFRESH) {
    void hydrateProjectUI();
  }
});

bootstrap().catch(() => {
  applyInspectModeUI();
  applyServerStatusUI(false);
});

setupListeners();
