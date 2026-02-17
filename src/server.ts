/**
 * Gran Maestro Dashboard Server
 *
 * Deno + Hono single-file web server with inline SPA.
 * Port 3847 (configurable via .gran-maestro/config.json).
 * Bearer token authentication with random UUID generated at startup.
 *
 * Usage:
 *   deno run --allow-net --allow-read --allow-write src/server.ts
 *
 * NOTE: This file is excluded from `npx tsc --noEmit` because it uses Deno URL imports.
 *       Type checking is performed via `deno check src/server.ts` instead.
 */

import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import { authMiddleware } from "./middleware.ts";
import { sseApi } from "./sse.ts";
import { renderSPA } from "./spa.ts";
import { projectConfigApi } from "./routes/config.ts";
import { projectDiscussionApi } from "./routes/discussion.ts";
import { projectIdeationApi } from "./routes/ideation.ts";
import { projectRequestsApi } from "./routes/requests.ts";
import { projectTreeApi } from "./routes/tree.ts";
import { projectRegistryApi } from "./routes/projects.ts";

import {
  AUTH_TOKEN,
  BASE_DIR,
  DEFAULT_PORT,
  HOST,
  HUB_DIR,
  HUB_MODE,
  getOrCreateToken,
  loadConfig,
  loadRegistry,
  registry,
  setAuthToken,
  setRegistry,
} from "./config.ts";

const app = new Hono();
const projectApi = new Hono();

projectApi.route("/", projectConfigApi);
projectApi.route("/", projectRequestsApi);
projectApi.route("/", projectIdeationApi);
projectApi.route("/", projectDiscussionApi);
projectApi.route("/", projectTreeApi);

app.use("*", authMiddleware);

app.route("/api/projects", projectRegistryApi);
app.route("/api/projects/:projectId", projectApi);
app.route("/api", projectApi);
app.route("/", sseApi);

app.get("/", (c) => {
  return c.html(renderSPA(AUTH_TOKEN));
});

app.get("/favicon.ico", (c) => {
  return new Response(null, { status: 204 });
});

const BANNER = `
  ╔═══════════════════════════════════════════╗
  ║                                           ║
  ║      ██████╗ ██████╗  █████╗ ███╗   ██╗   ║
  ║     ██╔════╝ ██╔══██╗██╔══██╗████╗  ██║   ║
  ║     ██║  ███╗██████╔╝███████║██╔██╗ ██║   ║
  ║     ██║   ██║██╔══██╗██╔══██║██║╚██╗██║   ║
  ║     ╚██████╔╝██║  ██║██║  ██║██║ ╚████║   ║
  ║      ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝ ║
  ║                                           ║
  ║     ███╗   ███╗ █████╗ ███████╗███████╗   ║
  ║     ████╗ ████║██╔══██╗██╔════╝██╔════╝   ║
  ║     ██╔████╔██║███████║█████╗  ███████╗   ║
  ║     ██║╚██╔╝██║██╔══██║██╔══╝  ╚════██║   ║
  ║     ██║ ╚═╝ ██║██║  ██║███████╗███████║   ║
  ║     ╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝  ║
  ║                                           ║
  ║    ████████╗██████╗  ██████╗               ║
  ║    ╚══██╔══╝██╔══██╗██╔═══██╗              ║
  ║       ██║   ██████╔╝██║   ██║              ║
  ║       ██║   ██╔══██╗██║   ██║              ║
  ║       ██║   ██║  ██║╚██████╔╝              ║
  ║       ╚═╝   ╚═╝  ╚═╝ ╚═════╝              ║
  ║                                           ║
  ╚═══════════════════════════════════════════╝
`;

async function main() {
  if (HUB_MODE) {
    await Deno.mkdir(HUB_DIR, { recursive: true });
    setRegistry(await loadRegistry());
    setAuthToken(await getOrCreateToken());
    const hubPidPath = `${HUB_DIR}/hub.pid`;
    await Deno.writeTextFile(hubPidPath, `${Deno.pid}`);

    const removeHubPid = async () => {
      try {
        await Deno.remove(hubPidPath);
      } catch {
        // ignore
      }
    };

    const shutdown = async () => {
      await removeHubPid();
      Deno.exit(0);
    };

    Deno.addSignalListener("SIGINT", () => {
      void shutdown();
    });
    Deno.addSignalListener("SIGTERM", () => {
      void shutdown();
    });
  }

  const config = await loadConfig();
  const port = config.dashboard_port ?? DEFAULT_PORT;

  console.log(BANNER);
  console.log(`  Dashboard: http://localhost:${port}?token=${AUTH_TOKEN}`);
  console.log(`  Host:      ${HOST}`);
  console.log(`  Port:      ${port}`);
  console.log(`  Auth:      ${config.dashboard_auth === false ? "disabled" : "enabled"}`);
  console.log(`  Hub dir:   ${HUB_DIR}`);
  console.log(`  Projects:  ${registry.projects.length}`);
  console.log("");

  // Ensure base directory exists
  try {
    await Deno.mkdir(BASE_DIR, { recursive: true });
  } catch {
    // already exists
  }

  serve(app.fetch, {
    hostname: HOST,
    port: port,
  });
}

main();
