import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { fromFileUrl, dirname, join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { readJsonFile, writeJsonFile } from "../utils.ts";
import { loadConfig, resolveBaseDir } from "../config.ts";

const projectConfigApi = new Hono();
const PLUGIN_ROOT = join(dirname(fromFileUrl(import.meta.url)), "..", "..");
const DEFAULTS_PATH = join(PLUGIN_ROOT, "templates", "defaults", "config.json");

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

projectConfigApi.get("/config/defaults", async (c) => {
  const defaults = await readJsonFile(DEFAULTS_PATH);
  if (!defaults) {
    return c.json({ error: "Defaults not found" }, 404);
  }
  return c.json(defaults);
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
