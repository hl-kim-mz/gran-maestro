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
      let createdAt = planJson.created_at;
      if (!createdAt || createdAt.includes("T00:00:00")) {
        try {
          const stat = await Deno.stat(`${plansDir}/${dir}/plan.json`);
          if (stat.mtime) {
            createdAt = stat.mtime.toISOString();
          }
        } catch (_error) {
          // ignore fallback failure
        }
      }
      plans.push({ ...planJson, id: planJson.id || dir, created_at: createdAt });
    }
  }
  plans.sort((a, b) => {
    const aTime = a.created_at ?? "";
    const bTime = b.created_at ?? "";
    return bTime.localeCompare(aTime);
  });

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

projectPlansApi.get("/plans/:planId/design", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const planId = c.req.param("planId");
  const designPath = `${baseDir}/plans/${planId}/design.md`;
  const content = await readTextFile(designPath);
  if (content !== null) {
    return c.json({ exists: true, content });
  }
  return c.json({ exists: false, content: null });
});

export { projectPlansApi };
