import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { readJsonFile, writeJsonFile } from "../utils.ts";
import { loadConfig, resolveBaseDir } from "../config.ts";

const projectConfigApi = new Hono();
projectConfigApi.get("/config", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }
  const config = await loadConfig(baseDir);
  return c.json(config);
});

projectConfigApi.put("/config", async (c) => {
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

projectConfigApi.get("/mode", async (c) => {
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

export { projectConfigApi };
