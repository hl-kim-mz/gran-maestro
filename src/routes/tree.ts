import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { stripBasePath, resolveBaseDir } from "../config.ts";
import { dirExists, readTextFile } from "../utils.ts";

const projectTreeApi = new Hono();
projectTreeApi.get("/tree", async (c) => {
  interface TreeNode {
    name: string;
    path: string;
    type: "file" | "directory";
    children?: TreeNode[];
  }

  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  async function buildTree(dir: string, depth = 0): Promise<TreeNode[]> {
    if (depth > 5) return [];
    const nodes: TreeNode[] = [];
    try {
      for await (const entry of Deno.readDir(dir)) {
        const fullPath = `${dir}/${entry.name}`;
        const relativePath = stripBasePath(fullPath, baseDir!);
        if (entry.isDirectory) {
          const children = await buildTree(fullPath, depth + 1);
          nodes.push({
            name: entry.name,
            path: relativePath,
            type: "directory",
            children,
          });
        } else {
          nodes.push({
            name: entry.name,
            path: relativePath,
            type: "file",
          });
        }
      }
    } catch {
      // skip unreadable dirs
    }
    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  const tree = await buildTree(baseDir);
  return c.json(tree);
});

projectTreeApi.get("/file", async (c) => {
  const baseDir = resolveBaseDir(c.req.param("projectId"));
  if (!baseDir) {
    return c.json({ error: "Project not found" }, 404);
  }

  const filePath = c.req.query("path");
  if (!filePath) {
    return c.json({ error: "Missing path query parameter" }, 400);
  }

  // Prevent directory traversal
  const fullPath = `${baseDir}/${filePath}`;
  if (fullPath.includes("..")) {
    return c.json({ error: "Invalid path" }, 400);
  }

  const content = await readTextFile(fullPath);
  if (content === null) {
    return c.json({ error: "File not found" }, 404);
  }

  return c.json({ path: filePath, content });
});

export { projectTreeApi };
