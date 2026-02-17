import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { IdeationSession } from "../types.ts";
import { dirExists, listDirs, readJsonFile, readTextFile } from "../utils.ts";
import { resolveBaseDir } from "../config.ts";

const projectIdeationApi = new Hono();
projectIdeationApi.get("/ideation", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const ideationDir = `${baseDir}/ideation`;
  if (!(await dirExists(ideationDir))) {
    return c.json([]);
  }

  const dirs = await listDirs(ideationDir);
  const sessions: IdeationSession[] = [];

  for (const dir of dirs) {
    const sessionJson = await readJsonFile<IdeationSession>(
      `${ideationDir}/${dir}/session.json`
    );
    if (sessionJson) {
      sessions.push({ ...sessionJson, id: sessionJson.id || dir });
    }
  }

  return c.json(sessions);
});

projectIdeationApi.get("/ideation/:id", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const id = c.req.param("id");
  const sessionDir = `${baseDir}/ideation/${id}`;

  const session = await readJsonFile<IdeationSession>(
    `${sessionDir}/session.json`
  );
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  const opinionCodex = await readTextFile(`${sessionDir}/opinion-codex.md`);
  const opinionGemini = await readTextFile(`${sessionDir}/opinion-gemini.md`);
  const opinionClaude = await readTextFile(`${sessionDir}/opinion-claude.md`);
  const critiqueClaude = await readTextFile(`${sessionDir}/critique-claude.md`);
  const critiqueCodex = await readTextFile(`${sessionDir}/critique-codex.md`);
  const synthesis = await readTextFile(`${sessionDir}/synthesis.md`);
  const discussion = await readTextFile(`${sessionDir}/discussion.md`);

  return c.json({
    session: { ...session, id: session.id || id },
    opinions: {
      codex: opinionCodex,
      gemini: opinionGemini,
      claude: opinionClaude,
    },
    critiques: {
      claude: critiqueClaude,
      codex: critiqueCodex,
    },
    synthesis,
    discussion,
  });
});

export { projectIdeationApi };
