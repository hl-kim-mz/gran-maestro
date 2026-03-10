import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { DesignSession } from "../types.ts";
import { dirExists, listDirs, readJsonFile, readTextFile } from "../utils.ts";
import { resolveBaseDir } from "../config.ts";

const projectDesignsApi = new Hono();
const SAFE_PATH_SEGMENT_PATTERN = /^[a-z0-9-]+$/;
const SCREEN_MD_FILE_PATTERN = /^screen-\d+\.md$/;
const SCREEN_MD_OR_HTML_FILE_PATTERN = /^screen-\d+\.(md|html)$/;

function isSafePathSegment(value: string): boolean {
  return SAFE_PATH_SEGMENT_PATTERN.test(value);
}

async function listScreenMdFiles(dirPath: string): Promise<string[]> {
  const screenFiles: string[] = [];
  try {
    for await (const entry of Deno.readDir(dirPath)) {
      if (entry.isFile && SCREEN_MD_FILE_PATTERN.test(entry.name)) {
        screenFiles.push(entry.name);
      }
    }
  } catch (_error) {
    // ignore
  }
  screenFiles.sort();
  return screenFiles;
}

projectDesignsApi.get("/designs", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const designsDir = `${baseDir}/designs`;
  const plansDir = `${baseDir}/plans`;
  if (!(await dirExists(designsDir)) && !(await dirExists(plansDir))) {
    return c.json([]);
  }

  const desDirs = (await listDirs(designsDir)).filter((d) => /^DES-/.test(d));
  const results = await Promise.all(
    desDirs.map(async (dir) => {
      const json = await readJsonFile<DesignSession>(`${designsDir}/${dir}/design.json`);
      if (!json) {
        return null;
      }
      return { ...json, id: json.id || dir };
    }),
  );

  const sessions = results.filter((s): s is NonNullable<typeof s> => s !== null);
  const planDirs = (await listDirs(plansDir)).filter((d) => /^PLN-/.test(d));
  const legacyPlans = await Promise.all(
    planDirs.map(async (dir) => {
      const json = await readJsonFile<{ title?: string; created_at?: string; linked_designs?: unknown }>(
        `${plansDir}/${dir}/plan.json`,
      );
      if (!json) return null;
      if (Array.isArray(json.linked_designs) && json.linked_designs.length > 0) return null;

      try {
        const stat = await Deno.stat(`${plansDir}/${dir}/design.md`);
        if (!stat.isFile) return null;
      } catch (_error) {
        return null;
      }

      return {
        id: dir,
        title: json.title,
        status: "plan_design",
        created_at: json.created_at,
        linked_plan: dir,
        source: "plan_design",
      };
    }),
  );

  const planSessions = legacyPlans.filter((s): s is NonNullable<typeof s> => s !== null);

  const merged = [...sessions, ...planSessions];
  merged.sort((a, b) => {
    const aTime = a.created_at;
    const bTime = b.created_at;
    if (!aTime && !bTime) return 0;
    if (!aTime) return 1;
    if (!bTime) return -1;
    return bTime.localeCompare(aTime);
  });

  return c.json(merged);
});

projectDesignsApi.get("/designs/:desId", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const desId = c.req.param("desId");
  if (/^PLN-/.test(desId)) {
    const planJson = await readJsonFile<{ title?: string; created_at?: string }>(
      `${baseDir}/plans/${desId}/plan.json`,
    );
    if (!planJson) {
      return c.json({ error: "Design not found" }, 404);
    }

    const content = await readTextFile(`${baseDir}/plans/${desId}/design.md`);
    if (content === null) {
      return c.json({ error: "Design not found" }, 404);
    }

    return c.json({
      id: desId,
      title: planJson.title,
      status: "plan_design",
      plan_design: true,
      design_content: content,
      created_at: planJson.created_at,
    });
  }

  const desDir = `${baseDir}/designs/${desId}`;
  if (!(await dirExists(desDir))) {
    return c.json({ error: "Design not found" }, 404);
  }

  const json = await readJsonFile<DesignSession>(`${desDir}/design.json`);
  if (!json) {
    return c.json({ error: "Design not found" }, 404);
  }

  const screenFiles = await listScreenMdFiles(desDir);

  const screenFilesSet = new Set(screenFiles);
  const resolveScreenMdFile = (screenId: string): string | null => {
    if (SCREEN_MD_FILE_PATTERN.test(screenId)) {
      return screenId;
    }
    if (/^screen-\d+\.html$/.test(screenId)) {
      return screenId.replace(/\.html$/, ".md");
    }
    if (/^screen-\d+$/.test(screenId)) {
      return `${screenId}.md`;
    }
    return null;
  };

  const screenHtmlFiles: Record<string, string> = {};
  for (const mdFile of screenFiles) {
    const htmlFile = mdFile.replace(/\.md$/, ".html");
    try {
      const stat = await Deno.stat(`${desDir}/${htmlFile}`);
      if (stat.isFile) {
        screenHtmlFiles[mdFile] = htmlFile;
      }
    } catch (_error) {
      // ignore missing .html files
    }
  }

  const screens = Array.isArray(json.screens)
    ? json.screens.map((screen) => {
      const existingHtmlFile = typeof screen.html_file === "string" && screen.html_file.length > 0
        ? screen.html_file
        : null;
      const screenMdFile = resolveScreenMdFile(screen.id);

      if (existingHtmlFile) {
        if (screenMdFile && screenFilesSet.has(screenMdFile)) {
          screenHtmlFiles[screenMdFile] = existingHtmlFile;
        }
        return screen;
      }

      if (screenMdFile) {
        const detectedHtmlFile = screenHtmlFiles[screenMdFile];
        if (detectedHtmlFile) {
          return { ...screen, html_file: detectedHtmlFile };
        }
      }

      return screen;
    })
    : json.screens;

  const response = {
    ...json,
    id: json.id || desId,
    screens,
    screen_files: screenFiles,
    screen_html_files: screenHtmlFiles,
  };

  const stylesDir = `${desDir}/styles`;
  const hasStyles = await dirExists(stylesDir);
  if (hasStyles) {
    const styleDirs = (await listDirs(stylesDir)).filter((dir) => isSafePathSegment(dir));
    const normalizedScreens = Array.isArray(response.screens)
      ? await Promise.all(response.screens.map(async (screen) => {
        const currentStyle = typeof screen.style === "string" ? screen.style : null;
        const htmlFile = typeof screen.html_file === "string" ? screen.html_file : null;

        if (!htmlFile && typeof currentStyle === "string" && isSafePathSegment(currentStyle)) {
          const screenId = (screen.id as string).replace(/\.md$/, "");
          if (isSafePathSegment(screenId)) {
            const candidatePath = `${stylesDir}/${currentStyle}/${screenId}.html`;
            try {
              const stat = await Deno.stat(candidatePath);
              if (stat.isFile) {
                return { ...screen, html_file: `styles/${currentStyle}/${screenId}.html` };
              }
            } catch (_error) {
              // ignore missing fallback html file
            }
          }
        }

        if (!currentStyle || isSafePathSegment(currentStyle)) {
          return screen;
        }

        if (!htmlFile) {
          return screen;
        }

        const styleMatch = `/${htmlFile}`.match(/\/styles\/([^/]+)\//);
        const extractedStyle = styleMatch?.[1];
        if (!extractedStyle || !isSafePathSegment(extractedStyle)) {
          return screen;
        }

        return {
          ...screen,
          style: extractedStyle,
        };
      }))
      : response.screens;

    return c.json({
      ...response,
      screens: normalizedScreens,
      has_styles: true,
      style_dirs: styleDirs,
    });
  }

  return c.json(response);
});

projectDesignsApi.get("/designs/:desId/styles/:styleName/screens", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const desId = c.req.param("desId");
  if (!/^(DES-\d+|PLN-\d+)$/.test(desId)) {
    return c.json({ error: "Invalid design ID" }, 400);
  }

  const styleName = c.req.param("styleName");
  if (!isSafePathSegment(styleName)) {
    return c.json({ error: "Invalid style name" }, 400);
  }

  const styleDir = `${baseDir}/designs/${desId}/styles/${styleName}`;
  if (!(await dirExists(styleDir))) {
    return c.json({ error: "Style not found" }, 404);
  }

  const screenFiles = await listScreenMdFiles(styleDir);
  return c.json({ screen_files: screenFiles });
});

projectDesignsApi.get("/designs/:desId/styles/:styleName/screens/:screenFile", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const desId = c.req.param("desId");
  if (!/^(DES-\d+|PLN-\d+)$/.test(desId)) {
    return c.json({ error: "Invalid design ID" }, 400);
  }

  const styleName = c.req.param("styleName");
  if (!isSafePathSegment(styleName)) {
    return c.json({ error: "Invalid style name" }, 400);
  }

  const screenFile = c.req.param("screenFile");
  if (!SCREEN_MD_FILE_PATTERN.test(screenFile)) {
    return c.json({ error: "Invalid screen file" }, 400);
  }

  const content = await readTextFile(`${baseDir}/designs/${desId}/styles/${styleName}/${screenFile}`);
  if (content === null) {
    return c.json({ exists: false, content: null });
  }
  return c.json({ exists: true, content });
});

projectDesignsApi.get("/designs/:desId/styles/:styleName/screens/:screenFile/html", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const desId = c.req.param("desId");
  if (!/^(DES-\d+|PLN-\d+)$/.test(desId)) {
    return c.json({ error: "Invalid design ID" }, 400);
  }

  const styleName = c.req.param("styleName");
  if (!isSafePathSegment(styleName)) {
    return c.json({ error: "Invalid style name" }, 400);
  }

  const screenFile = c.req.param("screenFile");
  if (!SCREEN_MD_OR_HTML_FILE_PATTERN.test(screenFile)) {
    return c.json({ error: "Invalid screen file" }, 400);
  }

  const htmlFile = screenFile.endsWith(".md")
    ? screenFile.replace(/\.md$/, ".html")
    : screenFile;
  const content = await readTextFile(`${baseDir}/designs/${desId}/styles/${styleName}/${htmlFile}`);
  if (content === null) {
    return c.html("<html><body></body></html>", 404);
  }
  return c.html(content);
});

projectDesignsApi.get("/designs/:desId/screens/:screenFile", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const desId = c.req.param("desId");
  const screenFile = c.req.param("screenFile");
  if (!SCREEN_MD_FILE_PATTERN.test(screenFile)) {
    return c.json({ error: "Invalid screen file" }, 400);
  }

  const content = await readTextFile(`${baseDir}/designs/${desId}/${screenFile}`);
  if (content === null) {
    return c.json({ exists: false, content: null });
  }
  return c.json({ exists: true, content });
});

projectDesignsApi.get("/designs/:desId/screens/:screenFile/html", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const desId = c.req.param("desId");
  if (!/^(DES-\d+|PLN-\d+)$/.test(desId)) {
    return c.json({ error: "Invalid design ID" }, 400);
  }

  const screenFile = c.req.param("screenFile");
  if (!SCREEN_MD_OR_HTML_FILE_PATTERN.test(screenFile)) {
    return c.json({ error: "Invalid screen file" }, 400);
  }

  const htmlFile = screenFile.endsWith(".md")
    ? screenFile.replace(/\.md$/, ".html")
    : screenFile;
  const content = await readTextFile(`${baseDir}/designs/${desId}/${htmlFile}`);
  if (content === null) {
    return c.html("<html><body></body></html>", 404);
  }
  return c.html(content);
});

export { projectDesignsApi };
