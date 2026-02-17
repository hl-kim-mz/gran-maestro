/**
 * Gran Maestro Dashboard Configuration and mutable server state.
 */

import { readJsonFile, readTextFile, writeJsonFile } from "./utils.ts";
import type { GranMaestroConfig, Project, Registry } from "./types.ts";

export const BASE_DIR = ".gran-maestro";
export const DEFAULT_PORT = 3847;
export const HOST = "127.0.0.1";
export const SSE_DEBOUNCE_MS = 100;
export const HUB_MODE = true; // Always hub mode — multi-project by default
export const HUB_DIR = `${Deno.env.get("HOME")}/.gran-maestro-hub`;

export let AUTH_TOKEN: string = crypto.randomUUID();
export let registry: Registry = { projects: [] };

export function setAuthToken(token: string): void {
  AUTH_TOKEN = token;
}

export function setRegistry(nextRegistry: Registry): void {
  registry = nextRegistry;
}

export async function loadConfig(baseDir = BASE_DIR): Promise<GranMaestroConfig> {
  return (await readJsonFile<GranMaestroConfig>(`${baseDir}/config.json`)) ?? {};
}

export function stripBasePath(path: string, baseDir: string): string {
  const normalizedBase = baseDir.endsWith("/") ? baseDir.slice(0, -1) : baseDir;
  if (normalizedBase.startsWith("/") && path.startsWith(`${normalizedBase}/`)) {
    return path.replace(`${normalizedBase}/`, "");
  }
  return path.replace(`${Deno.cwd()}/`, "");
}

export async function generateProjectId(path: string): Promise<string> {
  const data = new TextEncoder().encode(path);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(hash)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return hex.slice(0, 6);
}

export async function loadRegistry(): Promise<Registry> {
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

export async function saveRegistry(): Promise<boolean> {
  return await writeJsonFile(`${HUB_DIR}/registry.json`, registry);
}

export async function getOrCreateToken(): Promise<string> {
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

export function resolveBaseDir(projectId?: string): string | null {
  if (!HUB_MODE) return BASE_DIR;

  if (!projectId) {
    return registry.projects.length === 1 ? registry.projects[0]?.path ?? null : null;
  }

  return registry.projects.find((project) => project.id === projectId)?.path ?? null;
}
