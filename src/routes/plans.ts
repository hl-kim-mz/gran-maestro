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

  const planDirs = (await listDirs(plansDir)).filter((dir) => /^PLN-/.test(dir));
  const planResults = await Promise.all(
    planDirs.map(async (dir) => {
      const planJson = await readJsonFile<PlanMeta>(`${plansDir}/${dir}/plan.json`);
      if (!planJson) {
        return null;
      }

      let createdAt = planJson.created_at;
      let hasDesign = false;
      try {
        await Deno.stat(`${plansDir}/${dir}/design.md`);
        hasDesign = true;
      } catch (_error) {
        hasDesign = false;
      }
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
      return {
        ...planJson,
        id: planJson.id || dir,
        created_at: createdAt,
        has_design: hasDesign,
      };
    })
  );

  const plans = planResults.filter((plan): plan is NonNullable<typeof plan> =>
    plan !== null
  ) as (PlanMeta & { has_design: boolean })[];

  plans.sort((a, b) => {
    const aTime = a.created_at;
    const bTime = b.created_at;
    if (!aTime && !bTime) return 0;
    if (!aTime) return 1;
    if (!bTime) return -1;
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
