import { AUTH_REQUIRED, AUTH_TOKEN } from "./config.ts";

export async function authMiddleware(c: any, next: any) {
  const path = c.req.path;

  // Skip auth for favicon, static assets, and auth status endpoint
  if (
    path === "/favicon.ico" ||
    path.startsWith("/static/") ||
    path === "/api/auth/status"
  ) {
    await next();
    return;
  }

  if (!AUTH_REQUIRED) {
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
