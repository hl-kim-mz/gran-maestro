import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { DebugMeta } from "../types.ts";
import { dirExists, listDirs, readJsonFile, readTextFile } from "../utils.ts";
import { resolveBaseDir } from "../config.ts";

const projectDebugApi = new Hono();

// ─── API: Debug ────────────────────────────────────────────────────────────

projectDebugApi.get("/debug", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const debugDir = `${baseDir}/debug`;
  if (!(await dirExists(debugDir))) {
    return c.json([]);
  }

  const sessions: DebugMeta[] = [];
  const debugDirs = (await listDirs(debugDir)).filter((dir) => /^DBG-/.test(dir));
  for (const dir of debugDirs) {
    const sessionJson = await readJsonFile<DebugMeta>(`${debugDir}/${dir}/session.json`);
    if (sessionJson) {
      sessions.push({ ...sessionJson, id: sessionJson.id || dir });
    }
  }
  sessions.sort((a, b) => {
    const aTime = a.created_at ?? "";
    const bTime = b.created_at ?? "";
    return bTime.localeCompare(aTime);
  });

  return c.json(sessions);
});

projectDebugApi.get("/debug/:debugId", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const debugId = c.req.param("debugId");
  const sessionDir = `${baseDir}/debug/${debugId}`;
  if (!(await dirExists(sessionDir))) {
    return c.json({ error: "Debug session not found" }, 404);
  }

  const sessionJson = await readJsonFile<DebugMeta>(`${sessionDir}/session.json`);
  if (!sessionJson) {
    return c.json({ error: "Debug session not found" }, 404);
  }
  const content = await readTextFile(`${sessionDir}/debug-report.md`);
  return c.json({ ...sessionJson, id: sessionJson.id || debugId, content: content ?? null });
});

export { projectDebugApi };
