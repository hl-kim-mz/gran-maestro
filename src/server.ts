/**
 * Gran Maestro Dashboard Server
 *
 * Deno + Hono single-file web server with inline SPA.
 * Port 3847 (configurable via .gran-maestro/config.json).
 * Bearer token authentication with random UUID generated at startup.
 *
 * Usage:
 *   deno run --allow-net --allow-read --allow-write src/server.ts
 *
 * NOTE: This file is excluded from `npx tsc --noEmit` because it uses Deno URL imports.
 *       Type checking is performed via `deno check src/server.ts` instead.
 */

import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// ─── Types ──────────────────────────────────────────────────────────────────

interface GranMaestroConfig {
  dashboard_port?: number;
  dashboard_auth?: boolean;
  [key: string]: unknown;
}

interface RequestMeta {
  id: string;
  title?: string;
  status?: string;
  phase?: number;
  blockedBy?: string[];
  createdAt?: string;
  [key: string]: unknown;
}

interface TaskMeta {
  id: string;
  requestId: string;
  status?: string;
  agent?: string;
  [key: string]: unknown;
}

interface SSEEvent {
  type: string;
  requestId?: string;
  taskId?: string;
  sessionId?: string;
  projectId?: string;
  data: unknown;
}

interface IdeationSession {
  id: string;
  topic: string;
  focus?: string;
  status: string;
  created_at?: string;
  opinions?: Record<string, { status: string }>;
  [key: string]: unknown;
}

interface Project {
  id: string;
  name: string;
  path: string;
  registered_at: string;
}

interface Registry {
  projects: Project[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const BASE_DIR = ".gran-maestro";
const DEFAULT_PORT = 3847;
const HOST = "127.0.0.1";
const SSE_DEBOUNCE_MS = 100;
const HUB_MODE = Deno.args.includes("--hub");
const HUB_DIR = `${Deno.env.get("HOME")}/.gran-maestro-hub`;

// ─── Auth Token ─────────────────────────────────────────────────────────────

let AUTH_TOKEN: string = crypto.randomUUID();
let registry: Registry = { projects: [] };

// ─── Hono App ───────────────────────────────────────────────────────────────

const app = new Hono();
const projectApi = new Hono();

// ─── Utility: Safe File Read ────────────────────────────────────────────────

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const text = await Deno.readTextFile(path);
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function readTextFile(path: string): Promise<string | null> {
  try {
    return await Deno.readTextFile(path);
  } catch {
    return null;
  }
}

async function writeJsonFile(path: string, data: unknown): Promise<boolean> {
  try {
    await Deno.writeTextFile(path, JSON.stringify(data, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const stat = await Deno.stat(path);
    return stat.isDirectory;
  } catch {
    return false;
  }
}

async function listDirs(path: string): Promise<string[]> {
  const dirs: string[] = [];
  try {
    for await (const entry of Deno.readDir(path)) {
      if (entry.isDirectory) {
        dirs.push(entry.name);
      }
    }
  } catch {
    // directory may not exist
  }
  return dirs.sort();
}

// ─── Config Loader ──────────────────────────────────────────────────────────

async function loadConfig(baseDir = BASE_DIR): Promise<GranMaestroConfig> {
  return (await readJsonFile<GranMaestroConfig>(`${baseDir}/config.json`)) ?? {};
}

function stripBasePath(path: string, baseDir: string): string {
  const normalizedBase = baseDir.endsWith("/") ? baseDir.slice(0, -1) : baseDir;
  if (normalizedBase.startsWith("/") && path.startsWith(`${normalizedBase}/`)) {
    return path.replace(`${normalizedBase}/`, "");
  }
  return path.replace(`${Deno.cwd()}/`, "");
}

async function generateProjectId(path: string): Promise<string> {
  const data = new TextEncoder().encode(path);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(hash)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return hex.slice(0, 6);
}

async function loadRegistry(): Promise<Registry> {
  const loaded = await readJsonFile<Registry>(`${HUB_DIR}/registry.json`);
  if (!loaded || !Array.isArray(loaded.projects)) {
    return { projects: [] };
  }
  return {
    projects: loaded.projects.filter((project): project is Project =>
      typeof project?.id === "string" &&
      typeof project?.name === "string" &&
      typeof project?.path === "string" &&
      typeof project?.registered_at === "string"
    ),
  };
}

async function saveRegistry(): Promise<boolean> {
  return await writeJsonFile(`${HUB_DIR}/registry.json`, registry);
}

async function getOrCreateToken(): Promise<string> {
  const tokenPath = `${HUB_DIR}/hub.token`;
  const existing = await readTextFile(tokenPath);
  const trimmed = existing?.trim();
  if (trimmed) {
    return trimmed;
  }

  const token = crypto.randomUUID();
  await Deno.writeTextFile(tokenPath, `${token}\n`);
  return token;
}

function resolveBaseDir(projectId?: string): string | null {
  if (!HUB_MODE) return BASE_DIR;

  if (!projectId) {
    return registry.projects.length === 1 ? registry.projects[0]?.path ?? null : null;
  }

  return registry.projects.find((project) => project.id === projectId)?.path ?? null;
}

// ─── Auth Middleware ────────────────────────────────────────────────────────

app.use("*", async (c, next) => {
  const path = c.req.path;

  // Skip auth for favicon and static assets
  if (path === "/favicon.ico" || path.startsWith("/static/")) {
    await next();
    return;
  }

  // Check if auth is disabled via config
  const config = await loadConfig();
  if (config.dashboard_auth === false) {
    await next();
    return;
  }

  const token =
    c.req.query("token") ||
    c.req.header("Authorization")?.replace("Bearer ", "");

  if (token !== AUTH_TOKEN) {
    return c.text("Unauthorized", 401);
  }

  await next();
});

// ─── Project Registry API (legacy-compatible + hub mode) ────────────────────

app.get("/api/projects", async (c) => {
  return c.json(registry.projects);
});

app.post("/api/projects", async (c) => {
  if (!HUB_MODE) {
    return c.json({ error: "Hub mode is disabled" }, 400);
  }

  let body: { name?: string; path?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body?.path || typeof body.path !== "string") {
    return c.json({ error: "Missing required field: path" }, 400);
  }

  const projectPath = body.path.trim();
  if (!projectPath) {
    return c.json({ error: "Invalid path" }, 400);
  }

  const name = body.name && body.name.trim() ? body.name.trim() : projectPath;
  let resolvedPath = projectPath;
  try {
    resolvedPath = await Deno.realPath(projectPath);
  } catch {
    return c.json({ error: "Invalid project path" }, 400);
  }

  if (!(await dirExists(resolvedPath))) {
    return c.json({ error: "Project path not found" }, 404);
  }

  const projectId = await generateProjectId(resolvedPath);
  const existing = registry.projects.find((project) => project.id === projectId);

  if (existing) {
    existing.name = name;
    existing.path = resolvedPath;
    existing.registered_at = new Date().toISOString();
  } else {
    registry.projects.push({
      id: projectId,
      name,
      path: resolvedPath,
      registered_at: new Date().toISOString(),
    });
  }

  await saveRegistry();
  return c.json({
    id: projectId,
    name,
    path: resolvedPath,
    registered_at: existing ? existing.registered_at : new Date().toISOString(),
  });
});

app.delete("/api/projects/:projectId", async (c) => {
  if (!HUB_MODE) {
    return c.json({ error: "Hub mode is disabled" }, 400);
  }

  const projectId = c.req.param("projectId");
  const previous = registry.projects.length;
  registry.projects = registry.projects.filter((project) => project.id !== projectId);

  if (registry.projects.length === previous) {
    return c.json({ error: "Project not found" }, 404);
  }

  await saveRegistry();
  return c.json({ ok: true });
});

// ─── API: Config ────────────────────────────────────────────────────────────

projectApi.get("/config", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }
  const config = await loadConfig(baseDir);
  return c.json(config);
});

projectApi.put("/config", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  try {
    const body = await c.req.json();
    const success = await writeJsonFile(`${baseDir}/config.json`, body);
    if (!success) {
      return c.json({ error: "Failed to write config" }, 500);
    }
    return c.json({ ok: true });
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
});

// ─── API: Mode ──────────────────────────────────────────────────────────────

projectApi.get("/mode", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const mode = await readJsonFile(`${baseDir}/mode.json`);
  if (!mode) {
    return c.json({ active: false });
  }
  return c.json(mode);
});

// ─── API: Requests ──────────────────────────────────────────────────────────

projectApi.get("/requests", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const requestsDir = `${baseDir}/requests`;
  if (!(await dirExists(requestsDir))) {
    return c.json([]);
  }

  const dirs = await listDirs(requestsDir);
  const requests: RequestMeta[] = [];

  for (const dir of dirs) {
    const reqJson = await readJsonFile<RequestMeta>(
      `${requestsDir}/${dir}/request.json`
    );
    if (reqJson) {
      requests.push({ ...reqJson, id: reqJson.id || dir });
    }
  }

  return c.json(requests);
});

projectApi.get("/requests/:id", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const id = c.req.param("id");
  const reqJson = await readJsonFile<RequestMeta>(
    `${baseDir}/requests/${id}/request.json`
  );
  if (!reqJson) {
    return c.json({ error: "Request not found" }, 404);
  }
  return c.json({ ...reqJson, id: reqJson.id || id });
});

// ─── API: Tasks ─────────────────────────────────────────────────────────────

projectApi.get("/requests/:id/tasks", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const id = c.req.param("id");
  const tasksDir = `${baseDir}/requests/${id}/tasks`;
  if (!(await dirExists(tasksDir))) {
    return c.json([]);
  }

  const dirs = await listDirs(tasksDir);
  const tasks: TaskMeta[] = [];

  for (const dir of dirs) {
    const statusJson = await readJsonFile<TaskMeta>(
      `${tasksDir}/${dir}/status.json`
    );
    if (statusJson) {
      tasks.push({ ...statusJson, id: statusJson.id || dir, requestId: id });
    } else {
      tasks.push({ id: dir, requestId: id, status: "unknown" });
    }
  }

  return c.json(tasks);
});

projectApi.get("/requests/:id/tasks/:taskId", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const id = c.req.param("id");
  const taskId = c.req.param("taskId");
  const taskDir = `${baseDir}/requests/${id}/tasks/${taskId}`;

  const status = await readJsonFile<TaskMeta>(`${taskDir}/status.json`);
  const spec = await readTextFile(`${taskDir}/spec.md`);
  const review = await readTextFile(`${taskDir}/review.md`);
  const feedback = await readTextFile(`${taskDir}/feedback.md`);

  // Collect trace files
  const tracesDir = `${taskDir}/traces`;
  const traceFiles: string[] = [];
  try {
    for await (const entry of Deno.readDir(tracesDir)) {
      if (entry.isFile && entry.name.endsWith(".md")) {
        traceFiles.push(entry.name);
      }
    }
  } catch {
    // traces directory may not exist
  }
  traceFiles.sort();

  if (!status && !spec) {
    return c.json({ error: "Task not found" }, 404);
  }

  return c.json({
    id: taskId,
    requestId: id,
    status: status ?? { id: taskId, status: "unknown" },
    spec: spec ?? null,
    review: review ?? null,
    feedback: feedback ?? null,
    traces: traceFiles,
  });
});

// ─── API: Task Traces ──────────────────────────────────────────────────────

projectApi.get("/requests/:id/tasks/:taskId/traces", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const id = c.req.param("id");
  const taskId = c.req.param("taskId");
  const tracesDir = `${baseDir}/requests/${id}/tasks/${taskId}/traces`;

  if (!(await dirExists(tracesDir))) {
    return c.json([]);
  }

  const traceFiles: { name: string; agent: string; label: string; timestamp: string }[] = [];
  try {
    for await (const entry of Deno.readDir(tracesDir)) {
      if (entry.isFile && entry.name.endsWith(".md")) {
        // Parse filename: {agent}-{label}-{YYYYMMDD-HHmmss}.md
        const match = entry.name.match(/^(codex|gemini)-(.+)-(\d{8}-\d{6})\.md$/);
        if (match) {
          traceFiles.push({
            name: entry.name,
            agent: match[1],
            label: match[2],
            timestamp: match[3],
          });
        } else {
          traceFiles.push({
            name: entry.name,
            agent: "unknown",
            label: entry.name.replace(/\.md$/, ""),
            timestamp: "",
          });
        }
      }
    }
  } catch {
    // directory read error
  }

  traceFiles.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return c.json(traceFiles);
});

projectApi.get("/requests/:id/tasks/:taskId/traces/:traceFile", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const id = c.req.param("id");
  const taskId = c.req.param("taskId");
  const traceFile = c.req.param("traceFile");

  // Prevent directory traversal
  if (traceFile.includes("..") || traceFile.includes("/")) {
    return c.json({ error: "Invalid trace file name" }, 400);
  }

  const content = await readTextFile(
    `${baseDir}/requests/${id}/tasks/${taskId}/traces/${traceFile}`
  );
  if (content === null) {
    return c.json({ error: "Trace file not found" }, 404);
  }

  return c.json({ name: traceFile, content });
});

// ─── API: Ideation Sessions ─────────────────────────────────────────────────

projectApi.get("/ideation", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const ideationDir = `${baseDir}/ideation`;
  if (!(await dirExists(ideationDir))) {
    return c.json([]);
  }

  const dirs = await listDirs(ideationDir);
  const sessions: IdeationSession[] = [];

  for (const dir of dirs) {
    const sessionJson = await readJsonFile<IdeationSession>(
      `${ideationDir}/${dir}/session.json`
    );
    if (sessionJson) {
      sessions.push({ ...sessionJson, id: sessionJson.id || dir });
    }
  }

  return c.json(sessions);
});

projectApi.get("/ideation/:id", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const id = c.req.param("id");
  const sessionDir = `${baseDir}/ideation/${id}`;

  const session = await readJsonFile<IdeationSession>(
    `${sessionDir}/session.json`
  );
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  const opinionCodex = await readTextFile(`${sessionDir}/opinion-codex.md`);
  const opinionGemini = await readTextFile(`${sessionDir}/opinion-gemini.md`);
  const opinionClaude = await readTextFile(`${sessionDir}/opinion-claude.md`);
  const synthesis = await readTextFile(`${sessionDir}/synthesis.md`);
  const discussion = await readTextFile(`${sessionDir}/discussion.md`);

  return c.json({
    session: { ...session, id: session.id || id },
    opinions: {
      codex: opinionCodex,
      gemini: opinionGemini,
      claude: opinionClaude,
    },
    synthesis,
    discussion,
  });
});

// ─── API: Directory Tree (for Document Browser) ─────────────────────────────

projectApi.get("/tree", async (c) => {
  interface TreeNode {
    name: string;
    path: string;
    type: "file" | "directory";
    children?: TreeNode[];
  }

  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  async function buildTree(dir: string, depth = 0): Promise<TreeNode[]> {
    if (depth > 5) return [];
    const nodes: TreeNode[] = [];
    try {
      for await (const entry of Deno.readDir(dir)) {
        const fullPath = `${dir}/${entry.name}`;
        const relativePath = stripBasePath(fullPath, baseDir!);
        if (entry.isDirectory) {
          const children = await buildTree(fullPath, depth + 1);
          nodes.push({
            name: entry.name,
            path: relativePath,
            type: "directory",
            children,
          });
        } else {
          nodes.push({
            name: entry.name,
            path: relativePath,
            type: "file",
          });
        }
      }
    } catch {
      // skip unreadable dirs
    }
    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  const tree = await buildTree(baseDir);
  return c.json(tree);
});

projectApi.get("/file", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const filePath = c.req.query("path");
  if (!filePath) {
    return c.json({ error: "Missing path query parameter" }, 400);
  }

  // Prevent directory traversal
  const fullPath = `${baseDir}/${filePath}`;
  if (fullPath.includes("..")) {
    return c.json({ error: "Invalid path" }, 400);
  }

  const content = await readTextFile(fullPath);
  if (content === null) {
    return c.json({ error: "File not found" }, 404);
  }

  return c.json({ path: filePath, content });
});

app.route("/api/projects/:projectId", projectApi);
app.route("/api", projectApi);

// ─── SSE: Real-time Event Stream ────────────────────────────────────────────

app.get("/events", async (c) => {
  // Auth check is handled by middleware already

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      function send(event: SSEEvent) {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // stream closed
        }
      }

      // Send initial heartbeat
      send({ type: "connected", data: { timestamp: new Date().toISOString() } });

      // Heartbeat every 30s to keep connection alive
      const heartbeatInterval = setInterval(() => {
        send({ type: "heartbeat", data: { timestamp: new Date().toISOString() } });
      }, 30000);

      // Watch .gran-maestro/ for changes
      interface EventWatcherState {
        watcher: Deno.FsWatcher;
        debounceTimer: number | undefined;
        pendingPaths: string[];
        baseDir: string;
        projectId?: string;
      }

      const watchers = new Map<string, EventWatcherState>();

      function addWatcher(baseDir: string, projectId?: string) {
        const watcherKey = projectId ?? "legacy";
        if (watchers.has(watcherKey)) {
          return;
        }

        try {
          const watcher = Deno.watchFs(baseDir, { recursive: true });
          const state: EventWatcherState = {
            watcher,
            debounceTimer: undefined,
            pendingPaths: [],
            baseDir,
            projectId,
          };
          watchers.set(watcherKey, state);

          void (async () => {
            try {
              for await (const event of watcher) {
                if (state.debounceTimer) {
                  clearTimeout(state.debounceTimer);
                }
                state.pendingPaths.push(...event.paths);
                state.debounceTimer = setTimeout(() => {
                  const paths = state.pendingPaths.splice(0);
                  for (const p of paths) {
                    const relPath = stripBasePath(p, state.baseDir);
                    const sseEvent = classifyFsEvent(
                      relPath,
                      event.kind,
                      state.projectId
                    );
                    if (sseEvent) {
                      send(sseEvent);
                    }
                  }
                }, SSE_DEBOUNCE_MS);
              }
            } catch {
              // watcher closed or directory doesn't exist
            }
          })();
        } catch {
          // cannot watch project
        }
      }

      if (HUB_MODE) {
        for (const project of registry.projects) {
          addWatcher(project.path, project.id);
        }
      } else {
        addWatcher(BASE_DIR);
      }

      // Cleanup when client disconnects
      c.req.raw.signal.addEventListener("abort", () => {
        clearInterval(heartbeatInterval);
        for (const state of watchers.values()) {
          if (state.debounceTimer) {
            clearTimeout(state.debounceTimer);
          }
          try {
            state.watcher.close();
          } catch {
            // already closed
          }
        }
        watchers.clear();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
});

/** Classify a filesystem change into an SSE event type. */
function classifyFsEvent(
  path: string,
  kind: string,
  projectId?: string
): SSEEvent | null {
  // Pattern: .gran-maestro/requests/REQ-XXX/tasks/NN/traces/...
  // (must be checked before generic task_update to avoid being swallowed)
  const traceMatch = path.match(
    /\.gran-maestro\/requests\/([^/]+)\/tasks\/([^/]+)\/traces\/(.+)/
  );
  if (traceMatch) {
    return {
      type: "trace_update",
      projectId,
      requestId: traceMatch[1],
      taskId: traceMatch[2],
      data: { path, kind, traceFile: traceMatch[3], timestamp: new Date().toISOString() },
    };
  }

  // Pattern: .gran-maestro/requests/REQ-XXX/tasks/NN/...
  const taskMatch = path.match(
    /\.gran-maestro\/requests\/([^/]+)\/tasks\/([^/]+)/
  );
  if (taskMatch) {
    return {
      type: "task_update",
      projectId,
      requestId: taskMatch[1],
      taskId: taskMatch[2],
      data: { path, kind, timestamp: new Date().toISOString() },
    };
  }

  // Pattern: .gran-maestro/requests/REQ-XXX/...
  const reqMatch = path.match(/\.gran-maestro\/requests\/([^/]+)/);
  if (reqMatch) {
    return {
      type: "request_update",
      projectId,
      requestId: reqMatch[1],
      data: { path, kind, timestamp: new Date().toISOString() },
    };
  }

  // Pattern: .gran-maestro/config.json
  if (path.includes("config.json")) {
    return {
      type: "config_change",
      projectId,
      data: { path, kind, timestamp: new Date().toISOString() },
    };
  }

  // Pattern: .gran-maestro/mode.json
  if (path.includes("mode.json")) {
    return {
      type: "phase_change",
      projectId,
      data: { path, kind, timestamp: new Date().toISOString() },
    };
  }

  // Pattern: .gran-maestro/ideation/IDN-XXX/...
  const ideationMatch = path.match(/\.gran-maestro\/ideation\/([^/]+)/);
  if (ideationMatch) {
    return {
      type: "ideation_update",
      projectId,
      sessionId: ideationMatch[1],
      data: { path, kind, timestamp: new Date().toISOString() },
    };
  }

  // Generic agent activity for log files
  if (path.includes("exec-log") || path.includes("activity")) {
    return {
      type: "agent_activity",
      projectId,
      data: { path, kind, timestamp: new Date().toISOString() },
    };
  }

  return null;
}

// ─── Inline SPA ─────────────────────────────────────────────────────────────

function renderSPA(token: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Gran Maestro Dashboard</title>
<style>
/* ─── CSS Variables ─────────────────────────────────────────── */
:root {
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --bg-card: #0f3460;
  --bg-input: #1a1a3e;
  --text-primary: #e0e0e0;
  --text-secondary: #a0a0b0;
  --text-muted: #6a6a7a;
  --accent: #e94560;
  --accent-hover: #ff6b81;
  --blue: #0f3460;
  --blue-light: #1a4a80;
  --green: #4ecca3;
  --green-dark: #2d8a6e;
  --red: #e94560;
  --yellow: #f0c040;
  --gray: #6a6a7a;
  --border: #2a2a4e;
  --radius: 8px;
  --shadow: 0 2px 8px rgba(0,0,0,0.3);
  --font-sans: system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
}

/* ─── Reset & Base ──────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; overflow: hidden; }
body {
  font-family: var(--font-sans);
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.6;
}

/* ─── Layout ────────────────────────────────────────────────── */
#app {
  display: grid;
  grid-template-rows: auto auto auto 1fr;
  height: 100vh;
  max-height: 100vh;
}
header {
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  padding: 12px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
header h1 {
  font-size: 18px;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 1px;
}
header .status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}
header .status .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--green);
  animation: pulse-dot 2s ease-in-out infinite;
}
header .status .dot.disconnected { background: var(--red); animation: none; }
main {
  overflow-y: auto;
  padding: 16px 20px;
}
nav {
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: center;
  gap: 0;
}
nav button {
  flex: 1;
  max-width: 180px;
  background: none;
  border: none;
  color: var(--text-secondary);
  padding: 10px 16px;
  font-size: 13px;
  font-family: var(--font-sans);
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
  border-bottom: 2px solid transparent;
}
nav button:hover { color: var(--text-primary); }
nav button.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

/* ─── Cards ─────────────────────────────────────────────────── */
.card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: var(--shadow);
}
.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}
.card-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

/* ─── Workflow: Phase Nodes ─────────────────────────────────── */
.phase-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.phase-node {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 40px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  border: 2px solid var(--border);
  color: var(--text-secondary);
  background: var(--bg-primary);
  transition: all 0.3s;
}
.phase-node.done {
  border-color: var(--green);
  color: var(--green);
  background: rgba(78, 204, 163, 0.1);
}
.phase-node.active {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(233, 69, 96, 0.1);
  animation: pulse-phase 2s ease-in-out infinite;
}
.phase-node.waiting {
  border-color: var(--gray);
  color: var(--gray);
}
.phase-arrow {
  color: var(--text-muted);
  font-size: 16px;
  margin: 0 2px;
}
@keyframes pulse-phase {
  0%, 100% { box-shadow: 0 0 0 0 rgba(233, 69, 96, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(233, 69, 96, 0); }
}
@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* ─── Workflow: Task List ───────────────────────────────────── */
.task-list { margin-top: 8px; }
.task-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
  border-bottom: 1px solid rgba(42, 42, 78, 0.5);
}
.task-item:last-child { border-bottom: none; }
.task-icon { font-size: 14px; flex-shrink: 0; }
.task-icon.executing { color: var(--green); animation: pulse-dot 1s ease-in-out infinite; }
.task-icon.pending { color: var(--gray); }
.task-icon.completed { color: var(--green); }
.task-icon.failed { color: var(--red); }
.task-icon.cancelled { color: var(--gray); text-decoration: line-through; }
.task-name { flex: 1; }
.task-agent {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-primary);
  padding: 2px 6px;
  border-radius: 4px;
}
.blocked-badge {
  display: inline-block;
  font-size: 11px;
  color: var(--yellow);
  background: rgba(240, 192, 64, 0.1);
  border: 1px solid rgba(240, 192, 64, 0.3);
  border-radius: 4px;
  padding: 2px 8px;
  margin-left: 8px;
}

/* ─── Agent Activity Stream ─────────────────────────────────── */
.activity-stream {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.activity-entry {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  font-size: 13px;
}
.activity-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.activity-time {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
}
.activity-task-id {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent);
  background: rgba(233, 69, 96, 0.1);
  padding: 1px 6px;
  border-radius: 3px;
}
.activity-agent {
  font-weight: 600;
  color: var(--green);
}
.activity-detail {
  margin-left: 16px;
  padding-left: 12px;
  border-left: 2px solid var(--border);
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.8;
}
.live-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--green);
}
.live-indicator .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--green);
  animation: pulse-dot 1s ease-in-out infinite;
}
.filter-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.filter-bar input, .filter-bar select {
  background: var(--bg-input);
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 6px 10px;
  border-radius: var(--radius);
  font-size: 13px;
  font-family: var(--font-sans);
}
.filter-bar input:focus, .filter-bar select:focus {
  outline: none;
  border-color: var(--accent);
}

/* ─── Document Browser ──────────────────────────────────────── */
.doc-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 16px;
  height: calc(100vh - 130px);
}
@media (max-width: 768px) {
  .doc-layout { grid-template-columns: 1fr; }
  .doc-tree { max-height: 200px; overflow-y: auto; }
}
.doc-tree {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  overflow-y: auto;
  font-size: 13px;
}
.tree-item {
  padding: 3px 0;
  cursor: pointer;
  color: var(--text-secondary);
  transition: color 0.2s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tree-item:hover { color: var(--text-primary); }
.tree-item.active { color: var(--accent); font-weight: 600; }
.tree-dir {
  color: var(--text-primary);
  font-weight: 600;
  padding: 3px 0;
  cursor: pointer;
  user-select: none;
}
.tree-dir::before { content: '\\25B6 '; font-size: 10px; }
.tree-dir.open::before { content: '\\25BC '; font-size: 10px; }
.tree-children { margin-left: 16px; }
.tree-children.collapsed { display: none; }
.doc-content {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  overflow-y: auto;
  font-size: 14px;
  line-height: 1.7;
}
.doc-content pre {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
}
.doc-content code {
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--bg-primary);
  padding: 1px 4px;
  border-radius: 3px;
}
.doc-content h1 { font-size: 22px; color: var(--accent); margin: 16px 0 8px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
.doc-content h2 { font-size: 18px; color: var(--text-primary); margin: 14px 0 6px; }
.doc-content h3 { font-size: 15px; color: var(--text-secondary); margin: 12px 0 4px; }
.doc-content ul, .doc-content ol { margin-left: 20px; margin-bottom: 8px; }
.doc-content blockquote {
  border-left: 3px solid var(--accent);
  margin: 8px 0;
  padding: 4px 12px;
  color: var(--text-secondary);
  background: rgba(233, 69, 96, 0.05);
}
.doc-content table { border-collapse: collapse; width: 100%; margin: 8px 0; }
.doc-content th, .doc-content td {
  border: 1px solid var(--border);
  padding: 6px 10px;
  text-align: left;
  font-size: 13px;
}
.doc-content th { background: var(--bg-primary); font-weight: 600; }
.json-key { color: #f08d49; }
.json-string { color: #7ec699; }
.json-number { color: #f08d49; }
.json-bool { color: #cc99cd; }
.json-null { color: #cc99cd; }

/* ─── Settings ──────────────────────────────────────────────── */
.settings-form { max-width: 600px; }
.form-group {
  margin-bottom: 16px;
}
.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.form-group input, .form-group textarea, .form-group select {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 8px 12px;
  border-radius: var(--radius);
  font-size: 14px;
  font-family: var(--font-sans);
}
.form-group textarea {
  font-family: var(--font-mono);
  resize: vertical;
  min-height: 200px;
}
.form-group input:focus, .form-group textarea:focus {
  outline: none;
  border-color: var(--accent);
}
.btn {
  background: var(--accent);
  color: white;
  border: none;
  padding: 8px 20px;
  border-radius: var(--radius);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}
.btn:hover { background: var(--accent-hover); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary {
  background: var(--blue-light);
}
.btn-secondary:hover { background: var(--blue); }
.mode-status {
  margin-top: 20px;
  padding: 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.mode-status h3 {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}
/* ─── Approval Banner ──────────────────────────────────────── */
.approval-banner {
  background: linear-gradient(90deg, rgba(240,192,64,0.15), rgba(233,69,96,0.10));
  border-bottom: 1px solid rgba(240,192,64,0.3);
  padding: 8px 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--yellow);
  animation: banner-pulse 3s ease-in-out infinite;
}
.approval-icon { font-size: 16px; }
@keyframes banner-pulse {
  0%, 100% { background: linear-gradient(90deg, rgba(240,192,64,0.15), rgba(233,69,96,0.10)); }
  50% { background: linear-gradient(90deg, rgba(240,192,64,0.25), rgba(233,69,96,0.18)); }
}

.toast {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--green-dark);
  color: white;
  padding: 8px 20px;
  border-radius: var(--radius);
  font-size: 13px;
  z-index: 100;
  opacity: 0;
  transition: opacity 0.3s;
  pointer-events: none;
}
.toast.show { opacity: 1; }

/* ─── Empty State ───────────────────────────────────────────── */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
}
.empty-state .icon { font-size: 48px; margin-bottom: 16px; }
.empty-state h2 { font-size: 18px; color: var(--text-secondary); margin-bottom: 8px; }
.empty-state p { font-size: 13px; max-width: 400px; margin: 0 auto; }

/* ─── Log View ─────────────────────────────────────────────── */
.log-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  align-items: center;
}
.log-toolbar select {
  background: var(--bg-input);
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 6px 10px;
  border-radius: var(--radius);
  font-size: 13px;
  font-family: var(--font-sans);
  min-width: 200px;
}
.log-toolbar select:focus {
  outline: none;
  border-color: var(--accent);
}
.log-content {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-y: auto;
  height: calc(100vh - 200px);
  color: var(--text-secondary);
}

/* ─── Dependencies View ────────────────────────────────────── */
.dep-graph {
  position: relative;
  overflow: auto;
  height: calc(100vh - 160px);
}
.dep-graph svg {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}
.dep-node {
  position: absolute;
  background: var(--bg-secondary);
  border: 2px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 14px;
  min-width: 160px;
  cursor: default;
  z-index: 1;
}
.dep-node .dep-id {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent);
  margin-bottom: 4px;
}
.dep-node .dep-title {
  font-size: 13px;
  color: var(--text-primary);
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}
.dep-node .dep-status {
  display: inline-block;
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 4px;
  font-weight: 600;
}
.dep-node.status-done { border-color: var(--green); opacity: 0.65; }
.dep-node.status-done .dep-status { background: rgba(78,204,163,0.15); color: var(--green); }
.dep-node.status-active { border-color: var(--accent); box-shadow: 0 0 8px rgba(233,69,96,0.3); }
.dep-node.status-active .dep-status { background: rgba(233,69,96,0.15); color: var(--accent); }
.dep-node.status-blocked { border-color: var(--red); }
.dep-node.status-blocked .dep-status { background: rgba(233,69,96,0.15); color: var(--red); }
.dep-node.status-pending .dep-status { background: rgba(106,106,122,0.15); color: var(--gray); }

/* ─── Notification Bell ────────────────────────────────────── */
.notif-bell {
  position: relative;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  margin-left: 12px;
  user-select: none;
}
.notif-badge {
  position: absolute;
  top: -6px;
  right: -8px;
  background: var(--red);
  color: white;
  font-size: 10px;
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}
.notif-panel {
  position: absolute;
  top: 50px;
  right: 12px;
  width: 360px;
  max-height: 440px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  z-index: 200;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.notif-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  font-weight: 600;
}
.notif-header button {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 12px;
  cursor: pointer;
  font-family: var(--font-sans);
}
.notif-header button:hover { text-decoration: underline; }
.notif-list {
  overflow-y: auto;
  flex: 1;
}
.notif-item {
  padding: 10px 14px;
  border-bottom: 1px solid rgba(42,42,78,0.5);
  font-size: 13px;
  cursor: default;
}
.notif-item:last-child { border-bottom: none; }
.notif-item.unread { background: rgba(233,69,96,0.05); }
.notif-item .notif-time {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  margin-bottom: 2px;
}
.notif-item .notif-msg {
  color: var(--text-secondary);
}
.notif-item.unread .notif-msg { color: var(--text-primary); }
.notif-empty {
  text-align: center;
  padding: 30px 14px;
  color: var(--text-muted);
  font-size: 13px;
}

/* ─── Ideation View ────────────────────────────────────────── */
.ideation-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 12px;
}
.ideation-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.ideation-card:hover {
  border-color: var(--accent);
  box-shadow: 0 0 12px rgba(233, 69, 96, 0.15);
}
.ideation-card.active {
  border-color: var(--accent);
}
.ideation-status {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
}
.ideation-status.collecting {
  background: rgba(240, 192, 64, 0.15);
  color: var(--yellow);
}
.ideation-status.synthesized {
  background: rgba(26, 74, 128, 0.3);
  color: var(--blue-light);
}
.ideation-status.discussing {
  background: rgba(78, 204, 163, 0.15);
  color: var(--green);
}
.ideation-status.completed {
  background: rgba(106, 106, 122, 0.15);
  color: var(--gray);
}
.opinion-progress {
  display: flex;
  gap: 12px;
  margin-top: 10px;
}
.opinion-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
}
.opinion-chip .op-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.opinion-chip .op-dot.pending {
  background: var(--gray);
}
.opinion-chip .op-dot.done {
  background: var(--green);
}
.opinion-chip .op-dot.failed {
  background: var(--red);
}
.opinion-chip .op-dot.collecting {
  background: var(--yellow);
  animation: pulse-dot 1s ease-in-out infinite;
}
.ideation-detail {
  margin-top: 16px;
}
.opinions-columns {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 12px;
}
@media (max-width: 900px) {
  .opinions-columns { grid-template-columns: 1fr; }
}
.opinion-panel {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  max-height: 400px;
  overflow-y: auto;
}
.opinion-panel h4 {
  font-size: 13px;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
.opinion-panel.codex h4 { color: var(--accent); }
.opinion-panel.gemini h4 { color: var(--yellow); }
.opinion-panel.claude h4 { color: var(--green); }
.synthesis-panel, .discussion-panel {
  margin-top: 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  max-height: 500px;
  overflow-y: auto;
}
.synthesis-panel h4 { color: var(--green); font-size: 14px; margin-bottom: 10px; }
.discussion-panel h4 { color: var(--blue-light); font-size: 14px; margin-bottom: 10px; }
.ideation-back {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  padding: 6px 14px;
  border-radius: var(--radius);
  font-size: 13px;
  cursor: pointer;
  margin-bottom: 12px;
  font-family: var(--font-sans);
  transition: color 0.2s, border-color 0.2s;
}
.ideation-back:hover { color: var(--text-primary); border-color: var(--accent); }

/* ─── Scrollbar ─────────────────────────────────────────────── */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: var(--bg-primary); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--gray); }
</style>
<script src="https://cdn.jsdelivr.net/npm/marked@15/marked.min.js"></script>
</head>
<body>
<div id="app">
  <header>
    <h1>Gran Maestro</h1>
    <div id="project-selector" style="display:none;margin:0 12px">
      <select id="project-select" onchange="switchProject(this.value)" style="background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border);border-radius:4px;padding:4px 8px;font-size:13px;cursor:pointer"></select>
    </div>
    <div class="status">
      <span id="connection-status">Connecting...</span>
      <div class="dot" id="connection-dot"></div>
      <span class="notif-bell" onclick="toggleNotifPanel()" id="notif-bell">&#128276;<span class="notif-badge" id="notif-badge" style="display:none">0</span></span>
    </div>
  </header>
  <div class="notif-panel" id="notif-panel" style="display:none">
    <div class="notif-header">
      <span>Notifications</span>
      <button onclick="markAllRead()">Mark all read</button>
    </div>
    <div class="notif-list" id="notif-list"></div>
  </div>
  <nav>
    <button class="active" data-view="workflow" onclick="switchView('workflow')">Workflow</button>
    <button data-view="agents" onclick="switchView('agents')">Agents</button>
    <button data-view="documents" onclick="switchView('documents')">Documents</button>
    <button data-view="log" onclick="switchView('log')">Log</button>
    <button data-view="ideation" onclick="switchView('ideation')">Ideation</button>
    <button data-view="dependencies" onclick="switchView('dependencies')">Dependencies</button>
    <button data-view="settings" onclick="switchView('settings')">Settings</button>
  </nav>
  <div class="approval-banner" id="approval-banner" style="display:none">
    <span class="approval-icon">&#9888;</span>
    <span id="approval-msg">Approval needed</span>
  </div>
  <main id="main-content"></main>
</div>
<div class="toast" id="toast"></div>
<script>
// ─── State ──────────────────────────────────────────────────────────────────
const TOKEN = '${token}';
let currentProjectId = new URLSearchParams(window.location.search).get('project') || '';
let projects = [];
function getApiBase() {
  return currentProjectId ? '/api/projects/' + encodeURIComponent(currentProjectId) : '';
}
let currentView = 'workflow';
let requests = [];
let agentActivities = [];
let docTree = [];
let docContent = '';
let docActivePath = '';
let config = {};
let modeStatus = {};
let sseConnected = false;
let logContent = '';
let logSelectedTask = '';
let notifications = [];
let notificationUnread = 0;
let showNotificationPanel = false;
let ideationSessions = [];
let ideationActiveSession = null;
let openDirs = new Set();
let treeInitialized = false;
let prevTreeJson = '';

// ─── API Helpers ────────────────────────────────────────────────────────────
function apiHeaders() {
  return { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };
}

async function apiFetch(path, options = {}) {
  const url = getApiBase() + path + (path.includes('?') ? '&' : '?') + 'token=' + TOKEN;
  const res = await fetch(url, { ...options, headers: { ...apiHeaders(), ...(options.headers || {}) } });
  if (!res.ok) throw new Error('API error: ' + res.status);
  return res.json();
}

// ─── Markdown Renderer (marked.js with fallback) ────────────────────────────
function renderMarkdown(md) {
  if (!md) return '';
  // Use marked library if loaded from CDN
  if (typeof marked !== 'undefined' && marked.parse) {
    try {
      return marked.parse(md, { gfm: true, breaks: true });
    } catch(e) { /* fall through to fallback */ }
  }
  // Fallback: escape and show as preformatted text
  return '<pre style="white-space:pre-wrap">' + escapeHtml(md) + '</pre>';
}

// ─── JSON Syntax Highlighting ───────────────────────────────────────────────
function highlightJson(json) {
  if (typeof json === 'string') {
    try { json = JSON.parse(json); } catch { return escapeHtml(json); }
  }
  const str = JSON.stringify(json, null, 2);
  return str.replace(
    /("(\\\\u[a-zA-Z0-9]{4}|\\\\[^u]|[^\\\\"])*"(\\s*:)?|\\b(true|false|null)\\b|-?\\d+(?:\\.\\d*)?(?:[eE][+\\-]?\\d+)?)/g,
    function(match) {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
          match = match.replace(/:$/, '') + ':';
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-bool';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return '<span class="' + cls + '">' + match + '</span>';
    }
  );
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Task Status Helpers ────────────────────────────────────────────────────
function taskStatusIcon(status) {
  switch ((status || '').toLowerCase()) {
    case 'executing': case 'running': case 'in_progress':
      return '<span class="task-icon executing" title="Executing">&#9673;</span>';
    case 'pending': case 'queued': case 'waiting':
      return '<span class="task-icon pending" title="Pending">&#9675;</span>';
    case 'completed': case 'done': case 'success':
      return '<span class="task-icon completed" title="Completed">&#9679;</span>';
    case 'failed': case 'error':
      return '<span class="task-icon failed" title="Failed">&#10005;</span>';
    case 'cancelled': case 'skipped':
      return '<span class="task-icon cancelled" title="Cancelled">&#8856;</span>';
    default:
      return '<span class="task-icon pending" title="Unknown">&#9675;</span>';
  }
}

function phaseClass(phase, activePhase, reqStatus) {
  if (!activePhase) return '';
  const p = typeof phase === 'number' ? phase : parseInt(phase);
  const ap = typeof activePhase === 'number' ? activePhase : parseInt(activePhase);
  const st = (reqStatus || '').toLowerCase();
  // All phases done when request is completed
  if (st === 'completed' || st === 'done' || st === 'success') return 'done';
  if (p < ap) return 'done';
  if (p === ap) return 'active';
  return 'waiting';
}

// ─── View Renderers ─────────────────────────────────────────────────────────

function renderWorkflow() {
  if (requests.length === 0) {
    return '<div class="empty-state"><div class="icon">&#9878;</div>' +
      '<h2>No Active Requests</h2>' +
      '<p>Requests will appear here when Gran Maestro processes them. ' +
      'Check that the .gran-maestro/requests/ directory exists.</p></div>';
  }

  return requests.map(req => {
    const phases = [1, 2, 3, 4, 5];
    const activePhase = req.current_phase || req.phase || 1;
    const reqStatus = req.status || 'unknown';
    const phaseNodes = phases.map((p, i) => {
      const cls = phaseClass(p, activePhase, reqStatus);
      const node = '<div class="phase-node ' + cls + '">Phase ' + p + '</div>';
      const arrow = i < phases.length - 1 ? '<span class="phase-arrow">&#9654;</span>' : '';
      return node + arrow;
    }).join('');

    const blockedBadge = req.blockedBy && req.blockedBy.length > 0
      ? '<span class="blocked-badge">blocked by: ' + req.blockedBy.join(', ') + '</span>'
      : '';

    const isCompleted = ['completed','done','success'].includes(reqStatus.toLowerCase());
    const completedBadge = isCompleted
      ? '<span style="display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;background:rgba(78,204,163,0.15);color:var(--green);margin-left:8px">COMPLETED</span>'
      : '';

    const tasksHtml = (req._tasks || []).map(t => {
      return '<div class="task-item">' +
        taskStatusIcon(t.status) +
        '<span class="task-name">' + escapeHtml(t.id) + '</span>' +
        (t.agent ? '<span class="task-agent">' + escapeHtml(t.agent) + '</span>' : '') +
        '</div>';
    }).join('');

    return '<div class="card" style="' + (isCompleted ? 'opacity:0.75;border-color:var(--green)' : '') + '">' +
      '<div class="card-title">' + escapeHtml(req.id) + ': ' + escapeHtml(req.title || 'Untitled') + completedBadge + blockedBadge + '</div>' +
      '<div class="card-subtitle">Status: ' + escapeHtml(reqStatus) +
      ' | Phase: ' + activePhase + (req.completed_at ? ' | Completed: ' + new Date(req.completed_at).toLocaleString() : '') + '</div>' +
      '<div class="phase-row">' + phaseNodes + '</div>' +
      (tasksHtml ? '<div class="task-list">' + tasksHtml + '</div>' : '') +
      '</div>';
  }).join('');
}

function renderAgents() {
  const filterHtml = '<div class="filter-bar">' +
    '<input type="text" id="agent-filter-req" placeholder="Filter by Request ID..." oninput="filterAgents()">' +
    '<input type="text" id="agent-filter-agent" placeholder="Filter by Agent..." oninput="filterAgents()">' +
    '<div style="flex:1"></div>' +
    '<div class="live-indicator"><div class="dot"></div> LIVE</div>' +
    '</div>';

  if (agentActivities.length === 0) {
    return filterHtml +
      '<div class="empty-state"><div class="icon">&#9881;</div>' +
      '<h2>No Agent Activity</h2>' +
      '<p>Agent activity will appear here in real-time as tasks are executed.</p></div>';
  }

  const entries = agentActivities.slice().reverse().map(a => {
    const time = a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : '--:--:--';
    return '<div class="activity-entry" data-req="' + escapeHtml(a.requestId || '') + '" data-agent="' + escapeHtml(a.agent || '') + '">' +
      '<div class="activity-header">' +
        '<span class="activity-time">' + time + '</span>' +
        (a.taskId ? '<span class="activity-task-id">[' + escapeHtml(a.requestId || '?') + '-' + escapeHtml(a.taskId) + ']</span>' : '') +
        '<span class="activity-agent">' + escapeHtml(a.agent || a.type || 'system') + '</span>' +
      '</div>' +
      '<div class="activity-detail">' +
        (a.status ? 'STATUS: ' + escapeHtml(a.status) + '<br>' : '') +
        (a.path ? 'FILE: ' + escapeHtml(a.path) + '<br>' : '') +
        (a.message ? escapeHtml(a.message) : '') +
      '</div>' +
    '</div>';
  }).join('');

  return filterHtml + '<div class="activity-stream" id="activity-stream">' + entries + '</div>';
}

function filterAgents() {
  const reqFilter = (document.getElementById('agent-filter-req')?.value || '').toLowerCase();
  const agentFilter = (document.getElementById('agent-filter-agent')?.value || '').toLowerCase();
  document.querySelectorAll('.activity-entry').forEach(el => {
    const req = (el.getAttribute('data-req') || '').toLowerCase();
    const agent = (el.getAttribute('data-agent') || '').toLowerCase();
    const show = (!reqFilter || req.includes(reqFilter)) && (!agentFilter || agent.includes(agentFilter));
    el.style.display = show ? '' : 'none';
  });
}

function renderDocuments() {
  const treeHtml = renderTree(docTree, 0, '');
  treeInitialized = true;
  const contentHtml = docContent || '<div class="empty-state" style="padding:40px"><p>Select a file from the tree to view its contents.</p></div>';
  return '<div class="doc-layout">' +
    '<div class="doc-tree">' + treeHtml + '</div>' +
    '<div class="doc-content" id="doc-content">' + contentHtml + '</div>' +
    '</div>';
}

function renderTree(nodes, depth, parentPath) {
  if (!nodes || nodes.length === 0) return '';
  return nodes.map(n => {
    const nodePath = parentPath ? parentPath + '/' + n.name : n.name;
    if (n.type === 'directory') {
      // On first render, default-open dirs at depth < 2
      if (!treeInitialized && depth < 2) openDirs.add(nodePath);
      const isOpen = openDirs.has(nodePath);
      return '<div class="tree-dir ' + (isOpen ? 'open' : '') + '" data-path="' + escapeHtml(nodePath) + '" onclick="toggleTreeDir(this)">' +
        escapeHtml(n.name) + '</div>' +
        '<div class="tree-children ' + (isOpen ? '' : 'collapsed') + '">' +
        renderTree(n.children || [], depth + 1, nodePath) +
        '</div>';
    }
    const activeClass = docActivePath === n.path ? 'active' : '';
    return '<div class="tree-item ' + activeClass + '" onclick="loadFile(\\'' + escapeHtml(n.path).replace(/'/g, "\\\\'") + '\\')">' +
      escapeHtml(n.name) + '</div>';
  }).join('');
}

function toggleTreeDir(el) {
  const path = el.getAttribute('data-path');
  if (path) {
    if (openDirs.has(path)) { openDirs.delete(path); } else { openDirs.add(path); }
  }
  el.classList.toggle('open');
  const children = el.nextElementSibling;
  if (children) children.classList.toggle('collapsed');
}

async function loadFile(path) {
  try {
    const data = await apiFetch('/api/file?path=' + encodeURIComponent(path));
    docActivePath = path;
    const ext = path.split('.').pop().toLowerCase();
    if (ext === 'json') {
      docContent = '<pre>' + highlightJson(data.content) + '</pre>';
    } else if (ext === 'md') {
      docContent = renderMarkdown(data.content);
    } else {
      docContent = '<pre>' + escapeHtml(data.content) + '</pre>';
    }
    document.getElementById('doc-content').innerHTML = docContent;
    // Update active item
    document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tree-item').forEach(el => {
      if (el.textContent === path.split('/').pop()) el.classList.add('active');
    });
  } catch (e) {
    docContent = '<div class="empty-state"><p>Error loading file: ' + escapeHtml(e.message) + '</p></div>';
    document.getElementById('doc-content').innerHTML = docContent;
  }
}

// ─── Log View ────────────────────────────────────────────────────────────────

function renderLog() {
  let options = '<option value="">-- Select a file --</option>';

  // Request-level files
  requests.forEach(req => {
    const reqFiles = ['request.json', 'design/spec.md', 'discussion/feedback.md'];
    options += '<optgroup label="' + escapeHtml(req.id) + ' (' + escapeHtml(req.status || '?') + ')">';
    reqFiles.forEach(f => {
      const val = 'req:' + req.id + '/' + f;
      options += '<option value="' + escapeHtml(val) + '"' +
        (logSelectedTask === val ? ' selected' : '') + '>' +
        escapeHtml(f) + '</option>';
    });
    // Task exec-logs
    (req._tasks || []).forEach(t => {
      const val = 'task:' + req.id + '/' + t.id;
      options += '<option value="' + escapeHtml(val) + '"' +
        (logSelectedTask === val ? ' selected' : '') + '>' +
        'tasks/' + escapeHtml(t.id) + '/exec-log.md' +
        (t.status ? ' (' + escapeHtml(t.status) + ')' : '') +
        '</option>';
    });
    options += '</optgroup>';
  });

  const toolbar = '<div class="log-toolbar">' +
    '<select onchange="selectLogTask(this.value)" style="min-width:320px">' + options + '</select>' +
    '</div>';

  if (!logSelectedTask) {
    return toolbar +
      '<div class="empty-state"><div class="icon">&#128220;</div>' +
      '<h2>Execution Log</h2>' +
      '<p>Select a request file or task log to view</p></div>';
  }

  const isMarkdown = logSelectedTask.endsWith('.md');
  const contentHtml = isMarkdown
    ? '<div class="doc-content" id="log-content" style="height:calc(100vh - 200px);overflow-y:auto">' + renderMarkdown(logContent || 'Loading...') + '</div>'
    : '<div class="log-content" id="log-content">' + (logContent.startsWith('{') ? highlightJson(logContent) : escapeHtml(logContent || 'Loading...')) + '</div>';

  return toolbar + contentHtml;
}

async function selectLogTask(val) {
  logSelectedTask = val;
  logContent = '';
  if (!val) {
    renderCurrentView();
    return;
  }
  let filePath = '';
  if (val.startsWith('req:')) {
    // Request-level file: req:REQ-001/design/spec.md
    filePath = 'requests/' + val.substring(4);
  } else if (val.startsWith('task:')) {
    // Task exec-log: task:REQ-001/01
    const parts = val.substring(5).split('/');
    filePath = 'requests/' + parts[0] + '/tasks/' + parts[1] + '/exec-log.md';
  }
  try {
    const data = await apiFetch('/api/file?path=' + encodeURIComponent(filePath));
    logContent = data.content || '';
  } catch {
    logContent = '(File not found: ' + filePath + ')';
  }
  renderCurrentView();
  scrollLogToBottom();
}

function scrollLogToBottom() {
  const el = document.getElementById('log-content');
  if (el) el.scrollTop = el.scrollHeight;
}

// ─── Dependencies View ───────────────────────────────────────────────────────

function renderDependencies() {
  // Collect requests that have blockedBy or blocks relationships
  const hasRelation = requests.filter(r =>
    (r.blockedBy && r.blockedBy.length > 0) || (r.blocks && r.blocks.length > 0)
  );

  // Build adjacency: blockedBy means an edge from blocker -> blocked
  const edges = [];
  const nodeIds = new Set();
  requests.forEach(r => {
    if (r.blockedBy && r.blockedBy.length > 0) {
      r.blockedBy.forEach(dep => {
        edges.push({ from: dep, to: r.id });
        nodeIds.add(dep);
        nodeIds.add(r.id);
      });
    }
  });

  if (edges.length === 0) {
    return '<div class="empty-state"><div class="icon">&#128279;</div>' +
      '<h2>No Dependencies</h2>' +
      '<p>No dependency relationships found between requests</p></div>';
  }

  // Build lookup
  const reqMap = {};
  requests.forEach(r => { reqMap[r.id] = r; });

  // Topological layering (Kahn-style BFS)
  const inDeg = {};
  const adj = {};
  nodeIds.forEach(id => { inDeg[id] = 0; adj[id] = []; });
  edges.forEach(e => {
    adj[e.from].push(e.to);
    inDeg[e.to] = (inDeg[e.to] || 0) + 1;
  });
  const layers = [];
  let queue = [];
  nodeIds.forEach(id => { if (inDeg[id] === 0) queue.push(id); });
  const assigned = new Set();
  while (queue.length > 0) {
    layers.push([...queue]);
    queue.forEach(id => assigned.add(id));
    const next = [];
    queue.forEach(id => {
      (adj[id] || []).forEach(to => {
        inDeg[to]--;
        if (inDeg[to] === 0 && !assigned.has(to)) next.push(to);
      });
    });
    queue = next;
  }
  // Orphans (cycles): put remaining in last layer
  nodeIds.forEach(id => { if (!assigned.has(id)) { layers.push([id]); assigned.add(id); } });

  // Position nodes: left-to-right layers
  const COL_W = 220;
  const ROW_H = 90;
  const PAD_X = 40;
  const PAD_Y = 30;
  const nodePos = {};
  layers.forEach((layer, li) => {
    layer.forEach((id, ri) => {
      nodePos[id] = { x: PAD_X + li * COL_W, y: PAD_Y + ri * ROW_H };
    });
  });

  const totalW = PAD_X * 2 + layers.length * COL_W;
  const maxRows = Math.max(...layers.map(l => l.length));
  const totalH = PAD_Y * 2 + maxRows * ROW_H;

  // Render SVG arrows
  let svgLines = '';
  edges.forEach(e => {
    const f = nodePos[e.from];
    const t = nodePos[e.to];
    if (!f || !t) return;
    const x1 = f.x + 160;
    const y1 = f.y + 30;
    const x2 = t.x;
    const y2 = t.y + 30;
    svgLines += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + 'var(--text-muted)' + '" stroke-width="2" marker-end="url(#arrow)"/>';
  });

  const svg = '<svg width="' + totalW + '" height="' + totalH + '" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><marker id="arrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">' +
    '<polygon points="0 0, 10 3.5, 0 7" fill="var(--text-muted)"/></marker></defs>' +
    svgLines + '</svg>';

  // Render nodes
  let nodesHtml = '';
  nodeIds.forEach(id => {
    const r = reqMap[id] || { id: id, title: id, status: 'unknown' };
    const pos = nodePos[id];
    if (!pos) return;
    const st = (r.status || '').toLowerCase();
    let statusCls = 'status-pending';
    if (['completed','done','success'].includes(st)) statusCls = 'status-done';
    else if (['executing','running','in_progress','active'].includes(st)) statusCls = 'status-active';
    else if (r.blockedBy && r.blockedBy.length > 0) statusCls = 'status-blocked';

    nodesHtml += '<div class="dep-node ' + statusCls + '" style="left:' + pos.x + 'px;top:' + pos.y + 'px">' +
      '<div class="dep-id">' + escapeHtml(r.id) + '</div>' +
      '<div class="dep-title">' + escapeHtml(r.title || r.id) + '</div>' +
      '<span class="dep-status">' + escapeHtml(r.status || 'pending') + '</span>' +
      '</div>';
  });

  return '<div class="dep-graph" style="min-width:' + totalW + 'px;min-height:' + totalH + 'px">' +
    svg + nodesHtml + '</div>';
}

// ─── Notification Helpers ────────────────────────────────────────────────────

function addNotification(msg) {
  notifications.unshift({ message: msg, time: new Date().toISOString(), read: false });
  if (notifications.length > 50) notifications = notifications.slice(0, 50);
  notificationUnread = notifications.filter(n => !n.read).length;
  updateNotifBadge();
}

function updateNotifBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  if (notificationUnread > 0) {
    badge.style.display = 'flex';
    badge.textContent = notificationUnread > 99 ? '99+' : String(notificationUnread);
  } else {
    badge.style.display = 'none';
  }
}

function toggleNotifPanel() {
  showNotificationPanel = !showNotificationPanel;
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  panel.style.display = showNotificationPanel ? 'flex' : 'none';
  if (showNotificationPanel) renderNotifList();
}

function renderNotifList() {
  const list = document.getElementById('notif-list');
  if (!list) return;
  if (notifications.length === 0) {
    list.innerHTML = '<div class="notif-empty">No notifications</div>';
    return;
  }
  list.innerHTML = notifications.map((n, i) => {
    const t = new Date(n.time).toLocaleTimeString();
    return '<div class="notif-item ' + (n.read ? '' : 'unread') + '" onclick="markNotifRead(' + i + ')">' +
      '<div class="notif-time">' + t + '</div>' +
      '<div class="notif-msg">' + escapeHtml(n.message) + '</div>' +
      '</div>';
  }).join('');
}

function markNotifRead(idx) {
  if (notifications[idx]) {
    notifications[idx].read = true;
    notificationUnread = notifications.filter(n => !n.read).length;
    updateNotifBadge();
    renderNotifList();
  }
}

function markAllRead() {
  notifications.forEach(n => { n.read = true; });
  notificationUnread = 0;
  updateNotifBadge();
  renderNotifList();
}

// ─── Settings ────────────────────────────────────────────────────────────────

function renderSettings() {
  const configStr = JSON.stringify(config, null, 2);
  return '<div class="settings-form">' +
    '<h2 style="margin-bottom:16px;font-size:18px">Configuration</h2>' +
    '<div class="form-group">' +
      '<label>config.json</label>' +
      '<textarea id="config-editor">' + escapeHtml(configStr) + '</textarea>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-bottom:20px">' +
      '<button class="btn" onclick="saveConfig()">Save Configuration</button>' +
      '<button class="btn btn-secondary" onclick="refreshConfig()">Reload</button>' +
    '</div>' +
    '<div class="mode-status">' +
      '<h3>Maestro Mode Status</h3>' +
      '<pre style="margin-top:8px">' + highlightJson(modeStatus) + '</pre>' +
    '</div>' +
  '</div>';
}

async function saveConfig() {
  try {
    const editor = document.getElementById('config-editor');
    const newConfig = JSON.parse(editor.value);
    await apiFetch('/api/config', {
      method: 'PUT',
      body: JSON.stringify(newConfig)
    });
    config = newConfig;
    showToast('Configuration saved');
  } catch (e) {
    showToast('Error: ' + e.message);
  }
}

async function refreshConfig() {
  try {
    config = await apiFetch('/api/config');
    const editor = document.getElementById('config-editor');
    if (editor) editor.value = JSON.stringify(config, null, 2);
    showToast('Configuration reloaded');
  } catch (e) {
    showToast('Error: ' + e.message);
  }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ─── Ideation View ──────────────────────────────────────────────────────────

function renderIdeation() {
  // Detail view for a specific session
  if (ideationActiveSession) {
    const s = ideationActiveSession.session;
    const ops = ideationActiveSession.opinions || {};
    const statusCls = (s.status || 'collecting').toLowerCase();

    let html = '<button class="ideation-back" onclick="closeIdeationDetail()">&larr; Back to sessions</button>';
    html += '<div class="card"><div class="card-title">' + escapeHtml(s.id) + ': ' + escapeHtml(s.topic) + '</div>';
    html += '<div class="card-subtitle"><span class="ideation-status ' + statusCls + '">' + escapeHtml(s.status || 'collecting') + '</span>';
    if (s.focus) html += ' &middot; Focus: ' + escapeHtml(s.focus);
    if (s.created_at) html += ' &middot; ' + new Date(s.created_at).toLocaleString();
    html += '</div>';

    // Opinion progress chips
    html += '<div class="opinion-progress">';
    ['codex', 'gemini', 'claude'].forEach(function(ai) {
      const opData = (s.opinions || {})[ai] || {};
      const st = opData.status || 'pending';
      const dotCls = st === 'done' ? 'done' : st === 'failed' ? 'failed' : st === 'pending' && statusCls === 'collecting' ? 'collecting' : 'pending';
      html += '<div class="opinion-chip"><div class="op-dot ' + dotCls + '"></div>' + ai + '</div>';
    });
    html += '</div></div>';

    // Three-column opinions
    const hasAnyOpinion = ops.codex || ops.gemini || ops.claude;
    if (hasAnyOpinion) {
      html += '<div class="opinions-columns">';
      [['codex', 'Codex (Technical)', ops.codex],
       ['gemini', 'Gemini (Strategic)', ops.gemini],
       ['claude', 'Claude (Critical)', ops.claude]
      ].forEach(function(arr) {
        const cls = arr[0], label = arr[1], content = arr[2];
        html += '<div class="opinion-panel ' + cls + '"><h4>' + label + '</h4>';
        if (content) {
          html += '<div class="doc-content" style="background:transparent;border:none;padding:0">' + renderMarkdown(content) + '</div>';
        } else {
          html += '<div style="color:var(--text-muted);font-size:13px">Waiting for response...</div>';
        }
        html += '</div>';
      });
      html += '</div>';
    }

    // Synthesis
    if (ideationActiveSession.synthesis) {
      html += '<div class="synthesis-panel"><h4>PM Synthesis</h4>';
      html += '<div class="doc-content" style="background:transparent;border:none;padding:0">' + renderMarkdown(ideationActiveSession.synthesis) + '</div>';
      html += '</div>';
    }

    // Discussion
    if (ideationActiveSession.discussion) {
      html += '<div class="discussion-panel"><h4>Discussion</h4>';
      html += '<div class="doc-content" style="background:transparent;border:none;padding:0">' + renderMarkdown(ideationActiveSession.discussion) + '</div>';
      html += '</div>';
    }

    return html;
  }

  // List view
  if (ideationSessions.length === 0) {
    return '<div class="empty-state"><div class="icon">&#128161;</div>' +
      '<h2>No Ideation Sessions</h2>' +
      '<p>Run /mst:ideation to start a multi-AI brainstorming session.</p></div>';
  }

  let html = '<div class="ideation-grid">';
  ideationSessions.forEach(function(s) {
    const statusCls = (s.status || 'collecting').toLowerCase();

    html += '<div class="ideation-card" onclick="loadIdeationSession(\\'' + escapeHtml(s.id) + '\\')">';
    html += '<div class="card-title">' + escapeHtml(s.id) + '</div>';
    html += '<div style="font-size:13px;color:var(--text-primary);margin-bottom:8px">' + escapeHtml(s.topic || '') + '</div>';
    html += '<div class="card-subtitle"><span class="ideation-status ' + statusCls + '">' + escapeHtml(s.status || 'collecting') + '</span>';
    if (s.focus) html += ' &middot; ' + escapeHtml(s.focus);
    if (s.created_at) html += ' &middot; ' + new Date(s.created_at).toLocaleDateString();
    html += '</div>';

    // Opinion progress
    html += '<div class="opinion-progress">';
    ['codex', 'gemini', 'claude'].forEach(function(ai) {
      const opData = (s.opinions || {})[ai] || {};
      const st = opData.status || 'pending';
      const dotCls = st === 'done' ? 'done' : st === 'failed' ? 'failed' : st === 'pending' && statusCls === 'collecting' ? 'collecting' : 'pending';
      html += '<div class="opinion-chip"><div class="op-dot ' + dotCls + '"></div>' + ai + '</div>';
    });
    html += '</div></div>';
  });
  html += '</div>';
  return html;
}

async function loadIdeationSession(id) {
  try {
    ideationActiveSession = await apiFetch('/api/ideation/' + encodeURIComponent(id));
    renderCurrentView();
  } catch (e) {
    showToast('Error loading session: ' + e.message);
  }
}

function closeIdeationDetail() {
  ideationActiveSession = null;
  renderCurrentView();
}

// ─── Approval Banner Logic ───────────────────────────────────────────────────
let approvalNotified = new Set();

function updateApprovalBanner() {
  const banner = document.getElementById('approval-banner');
  const msg = document.getElementById('approval-msg');
  if (!banner || !msg) return;
  const pending = requests.filter(r => {
    const st = (r.status || '').toLowerCase();
    return st.includes('approve') || st.includes('review') || st === 'phase2_spec_review';
  });
  if (pending.length > 0) {
    const labels = pending.map(r => r.id).join(', ');
    msg.textContent = labels + ': Approval needed - run /mst:approve to proceed';
    banner.style.display = 'flex';
    // Browser notification (once per request)
    pending.forEach(r => {
      if (!approvalNotified.has(r.id)) {
        approvalNotified.add(r.id);
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Gran Maestro', { body: r.id + ': Spec ready for approval' });
        } else if ('Notification' in window && Notification.permission !== 'denied') {
          Notification.requestPermission();
        }
      }
    });
  } else {
    banner.style.display = 'none';
  }
}

// ─── View Switching ─────────────────────────────────────────────────────────
function switchView(view) {
  ideationActiveSession = null;
  currentView = view;
  document.querySelectorAll('nav button').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-view') === view);
  });
  renderCurrentView();
}

function renderCurrentView() {
  const main = document.getElementById('main-content');
  switch (currentView) {
    case 'workflow': main.innerHTML = renderWorkflow(); break;
    case 'agents': main.innerHTML = renderAgents(); break;
    case 'documents': main.innerHTML = renderDocuments(); break;
    case 'log': main.innerHTML = renderLog(); break;
    case 'ideation': main.innerHTML = renderIdeation(); break;
    case 'dependencies': main.innerHTML = renderDependencies(); break;
    case 'settings': main.innerHTML = renderSettings(); break;
  }
  updateApprovalBanner();
}

// ─── Project Selector ───────────────────────────────────────────────────────
async function loadProjects() {
  try {
    const res = await fetch('/api/projects?token=' + TOKEN, { headers: apiHeaders() });
    if (res.ok) {
      projects = await res.json();
      const selector = document.getElementById('project-selector');
      const select = document.getElementById('project-select');
      if (projects.length > 0 && selector && select) {
        selector.style.display = '';
        select.innerHTML = projects.map(p =>
          '<option value="' + p.id + '"' + (p.id === currentProjectId ? ' selected' : '') + '>' + escapeHtml(p.name) + '</option>'
        ).join('');
        if (!currentProjectId && projects.length > 0) {
          currentProjectId = projects[0].id;
        }
      }
    }
  } catch { /* not in hub mode or no projects */ }
}

function switchProject(projectId) {
  currentProjectId = projectId;
  const url = new URL(window.location);
  url.searchParams.set('project', projectId);
  window.history.replaceState({}, '', url);
  loadData();
}

// ─── Data Loading ───────────────────────────────────────────────────────────
async function loadData() {
  await loadProjects();
  try {
    // Load requests and their tasks
    requests = await apiFetch('/api/requests');
    for (const req of requests) {
      try {
        req._tasks = await apiFetch('/api/requests/' + encodeURIComponent(req.id) + '/tasks');
      } catch { req._tasks = []; }
    }
  } catch { requests = []; }

  try { config = await apiFetch('/api/config'); } catch { config = {}; }
  try { modeStatus = await apiFetch('/api/mode'); } catch { modeStatus = {}; }
  try { docTree = await apiFetch('/api/tree'); } catch { docTree = []; }
  try { ideationSessions = await apiFetch('/api/ideation'); } catch { ideationSessions = []; }

  // Auto-refresh active ideation detail
  if (ideationActiveSession && currentView === 'ideation') {
    try {
      ideationActiveSession = await apiFetch('/api/ideation/' + encodeURIComponent(ideationActiveSession.session.id));
    } catch { /* keep stale data */ }
  }

  // Check for phase transitions requiring approval (deduplicated)
  requests.forEach(req => {
    const st = (req.status || '').toLowerCase();
    if (st.includes('approve') || st.includes('review') || st === 'phase2_spec_review') {
      if (!approvalNotified.has(req.id)) {
        addNotification(req.id + ': Approval needed');
      }
    }
  });

  // Smart render: skip documents view re-render if tree structure unchanged
  const newTreeJson = JSON.stringify(docTree);
  if (currentView === 'documents' && newTreeJson === prevTreeJson) {
    prevTreeJson = newTreeJson;
    updateApprovalBanner();
    return; // tree unchanged, preserve DOM state
  }
  prevTreeJson = newTreeJson;
  renderCurrentView();
}

// ─── SSE Connection ─────────────────────────────────────────────────────────
function connectSSE() {
  const url = '/events?token=' + TOKEN;
  const es = new EventSource(url);

  es.onopen = () => {
    sseConnected = true;
    document.getElementById('connection-status').textContent = 'Connected';
    document.getElementById('connection-dot').classList.remove('disconnected');
  };

  es.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);

      // Filter by current project in hub mode
      if (currentProjectId && event.projectId && event.projectId !== currentProjectId) return;

      // Track agent activities
      if (event.type === 'agent_activity' || event.type === 'task_update' || event.type === 'request_update') {
        agentActivities.push({
          type: event.type,
          requestId: event.requestId,
          taskId: event.taskId,
          timestamp: (event.data && event.data.timestamp) || new Date().toISOString(),
          path: event.data && event.data.path,
          status: event.data && event.data.kind,
          agent: event.type,
          message: event.data && event.data.path ? 'File ' + event.data.kind + ': ' + event.data.path : ''
        });
        // Keep last 200 entries
        if (agentActivities.length > 200) agentActivities = agentActivities.slice(-200);
      }

      // ─── Notification collection ───
      if (event.type === 'phase_change') {
        const reqId = event.requestId || '?';
        addNotification(reqId + ': Phase changed');
      }
      if (event.type === 'task_update') {
        const st = (event.data && event.data.kind) || '';
        const taskLabel = (event.requestId || '?') + '-' + (event.taskId || '?');
        if (st === 'done' || st === 'completed') {
          addNotification(taskLabel + ': Completed');
        } else if (st === 'failed' || st === 'error') {
          addNotification(taskLabel + ': Failed');
        } else if (st === 'cancelled') {
          addNotification(taskLabel + ': Cancelled');
        }
      }
      if (event.type === 'config_change') {
        addNotification('Settings changed');
      }

      // ─── Log view: refresh if viewing exec-log and relevant event ───
      if (event.type === 'agent_activity' && event.data && event.data.path &&
          event.data.path.includes('exec-log') && logSelectedTask && currentView === 'log') {
        const parts = logSelectedTask.split('/');
        if (event.data.path.includes(parts[0]) && event.data.path.includes(parts[1])) {
          selectLogTask(logSelectedTask);
        }
      }

      // Ideation updates
      if (event.type === 'ideation_update') {
        addNotification('Ideation ' + (event.sessionId || '?') + ' updated');
      }

      // Trace updates
      if (event.type === 'trace_update') {
        const traceLabel = (event.requestId || '?') + '-' + (event.taskId || '?');
        const traceFile = (event.data && event.data.traceFile) || '';
        addNotification(traceLabel + ': AI trace saved (' + traceFile + ')');
      }

      // Refresh data on meaningful events
      if (['task_update', 'request_update', 'phase_change', 'config_change', 'ideation_update', 'trace_update'].includes(event.type)) {
        loadData();
      }
    } catch { /* ignore parse errors */ }
  };

  es.onerror = () => {
    sseConnected = false;
    document.getElementById('connection-status').textContent = 'Disconnected';
    document.getElementById('connection-dot').classList.add('disconnected');
    es.close();
    // Reconnect after 3s
    setTimeout(connectSSE, 3000);
  };
}

// ─── Init ───────────────────────────────────────────────────────────────────
loadData();
connectSSE();
// Periodic refresh every 10s as fallback
setInterval(loadData, 10000);
</script>
</body>
</html>`;
}

// ─── Root Route: Serve SPA ──────────────────────────────────────────────────

app.get("/", (c) => {
  return c.html(renderSPA(AUTH_TOKEN));
});

// ─── Favicon (empty, avoids 401) ────────────────────────────────────────────

app.get("/favicon.ico", (c) => {
  return new Response(null, { status: 204 });
});

// ─── Startup ────────────────────────────────────────────────────────────────

const BANNER = `
  ╔═══════════════════════════════════════════╗
  ║                                           ║
  ║      ██████╗ ██████╗  █████╗ ███╗   ██╗   ║
  ║     ██╔════╝ ██╔══██╗██╔══██╗████╗  ██║   ║
  ║     ██║  ███╗██████╔╝███████║██╔██╗ ██║   ║
  ║     ██║   ██║██╔══██╗██╔══██║██║╚██╗██║   ║
  ║     ╚██████╔╝██║  ██║██║  ██║██║ ╚████║   ║
  ║      ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝ ║
  ║                                           ║
  ║     ███╗   ███╗ █████╗ ███████╗███████╗   ║
  ║     ████╗ ████║██╔══██╗██╔════╝██╔════╝   ║
  ║     ██╔████╔██║███████║█████╗  ███████╗   ║
  ║     ██║╚██╔╝██║██╔══██║██╔══╝  ╚════██║   ║
  ║     ██║ ╚═╝ ██║██║  ██║███████╗███████║   ║
  ║     ╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝  ║
  ║                                           ║
  ║    ████████╗██████╗  ██████╗               ║
  ║    ╚══██╔══╝██╔══██╗██╔═══██╗              ║
  ║       ██║   ██████╔╝██║   ██║              ║
  ║       ██║   ██╔══██╗██║   ██║              ║
  ║       ██║   ██║  ██║╚██████╔╝              ║
  ║       ╚═╝   ╚═╝  ╚═╝ ╚═════╝              ║
  ║                                           ║
  ╚═══════════════════════════════════════════╝
`;

async function main() {
  if (HUB_MODE) {
    await Deno.mkdir(HUB_DIR, { recursive: true });
    registry = await loadRegistry();
    AUTH_TOKEN = await getOrCreateToken();
    const hubPidPath = `${HUB_DIR}/hub.pid`;
    await Deno.writeTextFile(hubPidPath, `${Deno.pid}`);

    const removeHubPid = async () => {
      try {
        await Deno.remove(hubPidPath);
      } catch {
        // ignore
      }
    };

    const shutdown = async () => {
      await removeHubPid();
      Deno.exit(0);
    };

    Deno.addSignalListener("SIGINT", () => {
      void shutdown();
    });
    Deno.addSignalListener("SIGTERM", () => {
      void shutdown();
    });
  }

  const config = await loadConfig();
  const port = config.dashboard_port ?? DEFAULT_PORT;

  console.log(BANNER);
  console.log(`  Dashboard: http://localhost:${port}?token=${AUTH_TOKEN}`);
  console.log(`  Host:      ${HOST}`);
  console.log(`  Port:      ${port}`);
  console.log(`  Auth:      ${config.dashboard_auth === false ? "disabled" : "enabled"}`);
  if (HUB_MODE) {
    console.log(`  Hub mode:  enabled`);
    console.log(`  Hub dir:   ${HUB_DIR}`);
    console.log(`  Projects:  ${registry.projects.length}`);
  } else {
    console.log(`  Watching:  ./${BASE_DIR}/`);
  }
  console.log("");

  // Ensure base directory exists
  try {
    await Deno.mkdir(BASE_DIR, { recursive: true });
  } catch {
    // already exists
  }

  serve(app.fetch, {
    hostname: HOST,
    port: port,
  });
}

main();
