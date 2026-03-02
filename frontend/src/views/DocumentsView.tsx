import { useState, useEffect, useCallback, useMemo } from 'react';
import { useResizableSidebar } from '@/hooks/useResizableSidebar';
import { ResizableHandle } from '@/components/shared/ResizableHandle';
import { useAppContext } from '@/context/AppContext';
import { apiFetch } from '@/hooks/useApi';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer';
import { JsonViewer } from '@/components/shared/JsonViewer';
import { EmptyState } from '@/components/shared/EmptyState';
import { RefreshButton } from '@/components/shared/RefreshButton';
import {
  Folder,
  File,
  ChevronRight,
  FileText,
  FileJson,
  FileCode,
  FolderOpen,
  Search,
  X,
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
  const { projectId } = useAppContext();
  const [tree, setTree] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { sidebarWidth, isResizing, startResizing, sidebarRef } = useResizableSidebar({
    defaultWidth: 300,
    minWidth: 250,
    maxWidth: 500,
    storageKey: 'documents-sidebar-width',
  });

  const fetchTree = useCallback(async () => {
    try {
      const data = await apiFetch<FileNode[]>('/api/tree', projectId);
      setTree(data);
    } catch (err) {
      console.error('Failed to fetch tree:', err);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchTree().finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    if (!selectedFile) {
      return;
    }
    if (selectedFile) {
      fetchFileContent(selectedFile);
    }
  }, [selectedFile]);

  async function fetchFileContent(path: string) {
    setContentLoading(true);
    try {
      const data = await apiFetch<{ path: string; content: string }>(
        `/api/file?path=${encodeURIComponent(path)}`,
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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchTree();
      if (selectedFile) {
        await fetchFileContent(selectedFile);
      }
    } catch (err) {
      console.error('Failed to refresh documents:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return tree;
    const query = searchQuery.toLowerCase();

    function filterNodes(nodes: FileNode[]): FileNode[] {
      const result: FileNode[] = [];
      for (const node of nodes) {
        if (node.type === 'file') {
          if (node.name.toLowerCase().includes(query)) {
            result.push(node);
          }
        } else {
          // Directory: include if any descendant matches
          const filteredChildren = filterNodes(node.children || []);
          if (filteredChildren.length > 0) {
            result.push({ ...node, children: filteredChildren });
          }
        }
      }
      return result;
    }

    return filterNodes(tree);
  }, [tree, searchQuery]);

  const renderTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map((node) => {
      const isSelected = selectedFile === node.path;

      if (node.type === 'directory') {
        return (
          <Collapsible key={node.path} defaultOpen={depth < 1} open={searchQuery.trim() ? true : undefined}>
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
    <div className="flex h-full overflow-hidden">
      <div ref={sidebarRef} style={{ width: sidebarWidth }} className="border-r flex flex-col min-h-0 shrink-0">
        <div className="p-4 border-b bg-muted/30 flex justify-between items-center">
          <h2 className="font-semibold text-sm">Workspace</h2>
          <RefreshButton onClick={handleRefresh} isRefreshing={isRefreshing} />
        </div>
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="파일 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-7 pr-7 text-xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2">
            {filteredTree.length > 0 ? renderTree(filteredTree) : (
              searchQuery.trim() ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  검색 결과가 없습니다
                </p>
              ) : null
            )}
          </div>
        </ScrollArea>
      </div>

      <ResizableHandle isResizing={isResizing} onMouseDown={startResizing} />

      <div className="flex-1 flex flex-col bg-card overflow-hidden min-h-0">
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
