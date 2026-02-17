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
    codex: string | null;
    gemini: string | null;
    claude: string | null;
    critiques: { claude: string | null; codex: string | null };
    synthesis: string | null;
  }> = [];

  const roundsDir = `${sessionDir}/rounds`;
  if (await dirExists(roundsDir)) {
    const roundDirs = (await listDirs(roundsDir)).sort();
    for (const rd of roundDirs) {
      const roundPath = `${roundsDir}/${rd}`;
      rounds.push({
        round: parseInt(rd, 10),
        codex: await readTextFile(`${roundPath}/codex.md`),
        gemini: await readTextFile(`${roundPath}/gemini.md`),
        claude: await readTextFile(`${roundPath}/claude.md`),
        critiques: {
          claude: await readTextFile(`${roundPath}/critique-claude.md`),
          codex: await readTextFile(`${roundPath}/critique-codex.md`),
        },
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
