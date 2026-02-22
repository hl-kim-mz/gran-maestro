import { useState, useEffect } from 'react';
import { useAppContext } from '@/context/AppContext';
import { apiFetch } from '@/hooks/useApi';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer';
import { JsonViewer } from '@/components/shared/JsonViewer';
import { EmptyState } from '@/components/shared/EmptyState';
import {
  Folder,
  File,
  ChevronRight,
  FileText,
  FileJson,
  FileCode,
  FolderOpen
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

export function DocumentsView() {
  const { token, projectId } = useAppContext();
  const [tree, setTree] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    async function fetchTree() {
      try {
        const data = await apiFetch<FileNode[]>('/api/tree', token, projectId);
        setTree(data);
      } catch (err) {
        console.error('Failed to fetch tree:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchTree();
  }, [token, projectId]);

  useEffect(() => {
    if (selectedFile) {
      fetchFileContent(selectedFile);
    }
  }, [selectedFile, token]);

  async function fetchFileContent(path: string) {
    setContentLoading(true);
    try {
      const data = await apiFetch<{ path: string; content: string }>(
        `/api/file?path=${encodeURIComponent(path)}`,
        token,
        projectId
      );
      setFileContent(data.content);
    } catch (err) {
      console.error('Failed to fetch file:', err);
      setFileContent('Error loading file content');
    } finally {
      setContentLoading(false);
    }
  }

  const renderTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map((node) => {
      const isSelected = selectedFile === node.path;

      if (node.type === 'directory') {
        return (
          <Collapsible key={node.path} defaultOpen={depth < 1}>
            <CollapsibleTrigger className="flex items-center gap-1 w-full py-1 hover:bg-accent rounded px-2 group">
              <ChevronRight className="h-3 w-3 group-data-[state=open]:rotate-90 transition-transform" />
              <Folder className="h-4 w-4 text-blue-500 fill-blue-500/20" />
              <span className="text-xs truncate">{node.name}</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-4">
              {node.children && renderTree(node.children, depth + 1)}
            </CollapsibleContent>
          </Collapsible>
        );
      }

      const getIcon = (name: string) => {
        if (name.endsWith('.md')) return <FileText className="h-4 w-4 text-orange-500" />;
        if (name.endsWith('.json')) return <FileJson className="h-4 w-4 text-yellow-500" />;
        if (name.endsWith('.ts') || name.endsWith('.js') || name.endsWith('.tsx')) return <FileCode className="h-4 w-4 text-blue-400" />;
        return <File className="h-4 w-4 text-muted-foreground" />;
      };

      return (
        <div
          key={node.path}
          onClick={() => setSelectedFile(node.path)}
          className={`flex items-center gap-2 py-1 px-2 cursor-pointer rounded text-xs ml-4 hover:bg-accent ${isSelected ? 'bg-primary/10 text-primary font-medium' : ''}`}
        >
          {getIcon(node.name)}
          <span className="truncate">{node.name}</span>
        </div>
      );
    });
  };

  if (!projectId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        프로젝트를 선택하세요
      </div>
    );
  }

  if (loading) {
    return <div className="p-6"><Skeleton className="h-full w-full" /></div>;
  }

  return (
    <div className="grid grid-cols-12 h-full overflow-hidden">
      <div className="col-span-3 border-r flex flex-col min-h-0">
        <div className="p-4 border-b bg-muted/30">
          <h2 className="font-semibold text-sm">Workspace</h2>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2">
            {renderTree(tree)}
          </div>
        </ScrollArea>
      </div>

      <div className="col-span-9 flex flex-col bg-card overflow-hidden min-h-0">
        {selectedFile ? (
          <>
            <div className="p-3 border-b flex justify-between items-center bg-muted/10">
              <div className="flex items-center gap-2">
                <File className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-mono">{selectedFile}</span>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-8">
                {contentLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-5/6" />
                  </div>
                ) : (
                  <div className="max-w-4xl mx-auto">
                    {selectedFile.endsWith('.md') ? (
                      <MarkdownRenderer content={fileContent || ''} />
                    ) : selectedFile.endsWith('.json') ? (
                      <JsonViewer data={fileContent || ''} />
                    ) : (
                      <pre className="p-4 rounded-lg bg-muted overflow-x-auto font-mono text-xs">
                        <code>{fileContent}</code>
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        ) : (
          <EmptyState
            icon={<FolderOpen className="h-8 w-8" />}
            title="파일을 선택하세요"
            description="왼쪽 파일 트리에서 파일을 클릭하면 내용을 볼 수 있어요"
          />
        )}
      </div>
    </div>
  );
}
