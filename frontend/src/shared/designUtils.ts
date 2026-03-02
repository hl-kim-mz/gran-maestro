export interface DesignSection {
  title: string;
  imageUrl: string | null;
  stitchUrl: string | null;
  stitchLabel: string;
  description: string;
}

export function parseDesignSections(content: string): DesignSection[] {
  return content
    .split(/\r?\n---\r?\n/)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => {
      const titleMatch = block.match(/^##\s+(.+)$/m);
      const imageMatch = block.match(/!\[[^\]]*\]\(([^)]+)\)/);
      const linkMatch = block.match(/\[([^\]]+)\]\((https:\/\/stitch\.[^)]+)\)/);
      const description = block
        .replace(/^##\s+.+$/m, '')
        .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
        .replace(/\[[^\]]+\]\([^)]+\)/g, '')
        .trim();

      return {
        title: titleMatch?.[1] ?? '',
        imageUrl: imageMatch?.[1] ?? null,
        stitchUrl: linkMatch?.[2] ?? null,
        stitchLabel: linkMatch?.[1] ?? 'Stitch에서 보기',
        description,
      };
    })
    .filter(section => section.imageUrl !== null || section.stitchUrl !== null);
}
