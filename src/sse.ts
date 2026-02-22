import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SSEEvent } from "./types.ts";
import {
  BASE_DIR,
  HUB_MODE,
  SSE_DEBOUNCE_MS,
  registry,
  stripBasePath,
} from "./config.ts";

const sseApi = new Hono();
sseApi.get("/events", async (c) => {
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
export function classifyFsEvent(
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

  // Pattern: .gran-maestro/plans/PLN-***
  const planMatch = path.match(/\.gran-maestro\/plans\/(PLN-[^/]+)/);
  if (planMatch) {
    return {
      type: "plan_update",
      projectId,
      planId: planMatch[1],
      data: { path, kind, timestamp: new Date().toISOString() },
    };
  }

  // Pattern: .gran-maestro/debug/DBG-***
  const debugMatch = path.match(/\.gran-maestro\/debug\/(DBG-[^/]+)/);
  if (debugMatch) {
    return {
      type: "debug_update",
      projectId,
      sessionId: debugMatch[1],
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

  // Pattern: .gran-maestro/discussion/DSC-XXX/...
  const discussionMatch = path.match(/\.gran-maestro\/discussion\/([^/]+)/);
  if (discussionMatch) {
    return {
      type: "discussion_update",
      projectId,
      sessionId: discussionMatch[1],
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

export { sseApi };
