import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { PlanMeta } from "../types.ts";
import { dirExists, listDirs, readJsonFile, readTextFile } from "../utils.ts";
import { resolveBaseDir } from "../config.ts";

const projectPlansApi = new Hono();

// ─── API: Plans ────────────────────────────────────────────────────────────

projectPlansApi.get("/plans", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const plansDir = `${baseDir}/plans`;
  if (!(await dirExists(plansDir))) {
    return c.json([]);
  }

  const plans: PlanMeta[] = [];
  const planDirs = (await listDirs(plansDir)).filter((dir) => /^PLN-/.test(dir));
  for (const dir of planDirs) {
    const planJson = await readJsonFile<PlanMeta>(`${plansDir}/${dir}/plan.json`);
    if (planJson) {
      plans.push({ ...planJson, id: planJson.id || dir });
    }
  }
  return c.json(plans);
});

projectPlansApi.get("/plans/:planId", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const planId = c.req.param("planId");
  const planDir = `${baseDir}/plans/${planId}`;
  if (!(await dirExists(planDir))) {
    return c.json({ error: "Plan not found" }, 404);
  }

  const planJson = await readJsonFile<PlanMeta>(`${planDir}/plan.json`);
  if (!planJson) {
    return c.json({ error: "Plan not found" }, 404);
  }
  const content = await readTextFile(`${planDir}/plan.md`);
  return c.json({ ...planJson, id: planJson.id || planId, content: content ?? null });
});

export { projectPlansApi };
