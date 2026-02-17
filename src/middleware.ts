import { AUTH_TOKEN, loadConfig } from "./config.ts";

export async function authMiddleware(c: any, next: any) {
  const path = c.req.path;

  // Skip auth for favicon and static assets
  if (path === "/favicon.ico" || path.startsWith("/static/")) {
    await next();
    return;
  }

  // Check if auth is disabled via config
  const config = await loadConfig();
  if (config.dashboard_auth === false) {
    await next();
    return;
  }

  const token =
    c.req.query("token") ||
    c.req.header("Authorization")?.replace("Bearer ", "");

  if (token !== AUTH_TOKEN) {
    return c.text("Unauthorized", 401);
  }

  await next();
}
