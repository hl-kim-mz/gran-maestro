import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { listDirs, readJsonFile } from "../utils.ts";
import { resolveBaseDir } from "../config.ts";

type OverviewItemType = "request" | "plan";

type CursorPayload = {
  last_event_at: string;
  id: string;
};

type OverviewItem = {
  id: string;
  type: OverviewItemType;
  title: string;
  status: string;
  last_event_at: string;
  blocked?: boolean;
};

type RequestOverviewJson = {
  id?: unknown;
  title?: unknown;
  status?: unknown;
  updated_at?: unknown;
  created_at?: unknown;
  dependencies?: {
    blockedBy?: unknown;
  };
};

type PlanOverviewJson = {
  id?: unknown;
  title?: unknown;
  status?: unknown;
  updated_at?: unknown;
  created_at?: unknown;
};

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const REQUEST_PREFIX = /^REQ-/;
const PLAN_PREFIX = /^PLN-/;
const INACTIVE_REQUEST_STATUSES = new Set(["done", "committed", "cancelled", "archived"]);
const ACTIVE_PLAN_STATUSES = new Set(["active", "in_progress"]);

const projectOverviewApi = new Hono();

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function asIsoTimestamp(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function parseLimit(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
}

function decodeCursor(raw: string | undefined): CursorPayload | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(atob(raw)) as CursorPayload;
    if (typeof parsed?.last_event_at !== "string" || typeof parsed?.id !== "string") {
      return null;
    }
    if (parsed.last_event_at.length === 0 || parsed.id.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function encodeCursor(payload: CursorPayload): string {
  return btoa(JSON.stringify(payload));
}

function compareOverviewItemsDesc(a: OverviewItem, b: OverviewItem): number {
  const byTime = b.last_event_at.localeCompare(a.last_event_at);
  if (byTime !== 0) return byTime;
  return b.id.localeCompare(a.id);
}

function isBlockedRequest(dependencies: RequestOverviewJson["dependencies"]): boolean {
  return Array.isArray(dependencies?.blockedBy) && dependencies.blockedBy.length > 0;
}

async function collectActiveRequests(baseDir: string): Promise<OverviewItem[]> {
  const requestDirs = (await listDirs(`${baseDir}/requests`)).filter((dir) => REQUEST_PREFIX.test(dir));
  const results = await Promise.all(
    requestDirs.map(async (dir): Promise<OverviewItem | null> => {
      const requestJson = await readJsonFile<RequestOverviewJson>(`${baseDir}/requests/${dir}/request.json`);
      if (!requestJson) return null;

      const id = asString(requestJson.id, dir);
      const status = asString(requestJson.status, "unknown");
      if (INACTIVE_REQUEST_STATUSES.has(status.toLowerCase())) {
        return null;
      }

      return {
        id,
        type: "request",
        title: asString(requestJson.title, id),
        status,
        last_event_at: asIsoTimestamp(requestJson.updated_at, asIsoTimestamp(requestJson.created_at, "")),
        blocked: isBlockedRequest(requestJson.dependencies),
      };
    }),
  );

  return results.filter((item): item is OverviewItem => item !== null);
}

async function collectActivePlans(baseDir: string): Promise<OverviewItem[]> {
  const planDirs = (await listDirs(`${baseDir}/plans`)).filter((dir) => PLAN_PREFIX.test(dir));
  const results = await Promise.all(
    planDirs.map(async (dir): Promise<OverviewItem | null> => {
      const planJson = await readJsonFile<PlanOverviewJson>(`${baseDir}/plans/${dir}/plan.json`);
      if (!planJson) return null;

      const id = asString(planJson.id, dir);
      const status = asString(planJson.status, "unknown");
      if (!ACTIVE_PLAN_STATUSES.has(status.toLowerCase())) {
        return null;
      }

      return {
        id,
        type: "plan",
        title: asString(planJson.title, id),
        status,
        last_event_at: asIsoTimestamp(planJson.updated_at, asIsoTimestamp(planJson.created_at, "")),
      };
    }),
  );

  return results.filter((item): item is OverviewItem => item !== null);
}

projectOverviewApi.get("/overview/active-items", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const [requests, plans] = await Promise.all([
    collectActiveRequests(baseDir),
    collectActivePlans(baseDir),
  ]);

  const allItems = [...requests, ...plans].sort(compareOverviewItemsDesc);

  const limit = parseLimit(c.req.query("limit"));
  const cursor = decodeCursor(c.req.query("cursor"));
  const startIndex = cursor
    ? (() => {
      const cursorIndex = allItems.findIndex((item) => {
        return item.last_event_at === cursor.last_event_at && item.id === cursor.id;
      });
      return cursorIndex >= 0 ? cursorIndex + 1 : 0;
    })()
    : 0;

  const items = allItems.slice(startIndex, startIndex + limit);
  const has_more = startIndex + limit < allItems.length;
  const next_cursor = has_more && items.length > 0
    ? encodeCursor({
      last_event_at: items[items.length - 1].last_event_at,
      id: items[items.length - 1].id,
    })
    : null;

  return c.json({
    items,
    next_cursor,
    has_more,
    as_of: new Date().toISOString(),
  });
});

export { projectOverviewApi };
