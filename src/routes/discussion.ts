import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { DiscussionSession } from "../types.ts";
import { listDirs, readJsonFile, readTextFile, dirExists } from "../utils.ts";
import { resolveBaseDir } from "../config.ts";

const projectDiscussionApi = new Hono();
projectDiscussionApi.get("/discussion", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const discussionDir = `${baseDir}/discussion`;
  if (!(await dirExists(discussionDir))) {
    return c.json([]);
  }

  const dirs = await listDirs(discussionDir);
  const sessions: DiscussionSession[] = [];

  for (const dir of dirs) {
    const sessionJson = await readJsonFile<DiscussionSession>(
      `${discussionDir}/${dir}/session.json`
    );
    if (sessionJson) {
      sessions.push({ ...sessionJson, id: sessionJson.id || dir });
    }
  }

  return c.json(sessions);
});

projectDiscussionApi.get("/discussion/:id", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const id = c.req.param("id");
  const sessionDir = `${baseDir}/discussion/${id}`;

  const session = await readJsonFile<DiscussionSession>(
    `${sessionDir}/session.json`
  );
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  // Read rounds
  const rounds: Array<{
    round: number;
    responses: Record<string, string | null>;
    critiques: Record<string, string | null>;
    synthesis: string | null;
  }> = [];

  const roundsDir = `${sessionDir}/rounds`;
  if (await dirExists(roundsDir)) {
    const roundDirs = (await listDirs(roundsDir)).sort();
    const roleKeys = Object.keys(session.roles || {});
    const responseKeys = roleKeys.length > 0 ? roleKeys : ['codex', 'gemini', 'claude'];
    const critics = session.critics || {};
    const criticKeys = Object.keys(critics);
    for (const rd of roundDirs) {
      const roundPath = `${roundsDir}/${rd}`;
      const responses: Record<string, string | null> = {};
      for (const key of responseKeys) {
        responses[key] = await readTextFile(`${roundPath}/${key}.md`);
      }
      const roundCritiques: Record<string, string | null> = {};
      for (const key of criticKeys) {
        roundCritiques[key] = await readTextFile(
          `${roundPath}/critique-${key}.md`
        );
      }
      rounds.push({
        round: parseInt(rd, 10),
        responses,
        critiques: roundCritiques,
        synthesis: await readTextFile(`${roundPath}/synthesis.md`),
      });
    }
  }

  const consensus = await readTextFile(`${sessionDir}/consensus.md`);

  return c.json({
    session: { ...session, id: session.id || id },
    rounds,
    consensus,
  });
});

export { projectDiscussionApi };
