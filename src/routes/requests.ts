import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { RequestMeta, TaskMeta } from "../types.ts";
import { dirExists, listDirs, readJsonFile, readTextFile } from "../utils.ts";
import { resolveBaseDir } from "../config.ts";

const projectRequestsApi = new Hono();
projectRequestsApi.get("/requests", async (c) => {
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

projectRequestsApi.get("/requests/:id", async (c) => {
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

projectRequestsApi.get("/requests/:id/tasks", async (c) => {
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

projectRequestsApi.get("/requests/:id/tasks/:taskId", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const id = c.req.param("id");
  const taskId = c.req.param("taskId");
  const taskDir = `${baseDir}/requests/${id}/tasks/${taskId}`;

  const status = await readJsonFile<TaskMeta>(`${taskDir}/status.json`);
  const spec = await readTextFile(`${taskDir}/spec.md`);
  const feedback = await readTextFile(`${taskDir}/feedback.md`);

  // Find review: try review.md first, then latest review-*.md
  let review = await readTextFile(`${taskDir}/review.md`);
  if (!review) {
    const reviewFiles: string[] = [];
    try {
      for await (const entry of Deno.readDir(taskDir)) {
        if (entry.isFile && entry.name.startsWith("review-") && entry.name.endsWith(".md")) {
          reviewFiles.push(entry.name);
        }
      }
    } catch { /* ignore */ }
    reviewFiles.sort();
    if (reviewFiles.length > 0) {
      review = await readTextFile(`${taskDir}/${reviewFiles[reviewFiles.length - 1]}`);
    }
  }

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

projectRequestsApi.get("/requests/:id/tasks/:taskId/traces", async (c) => {
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

projectRequestsApi.get("/requests/:id/tasks/:taskId/traces/:traceFile", async (c) => {
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

export { projectRequestsApi };
