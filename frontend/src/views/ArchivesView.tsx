import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, ChevronRight, RefreshCw } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { apiFetch } from '@/hooks/useApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { RefreshButton } from '@/components/shared/RefreshButton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

type ArchiveType =
  | 'requests'
  | 'plans'
  | 'designs'
  | 'ideation'
  | 'discussion'
  | 'debug'
  | 'explore'
  | 'unknown';

interface ArchiveItem {
  id: string;
  filename: string;
  type: ArchiveType;
  size_bytes: number;
  archived_at: string;
}

interface ArchiveSummary {
  total_count: number;
  total_size_bytes: number;
  by_type: Record<ArchiveType, number>;
}

interface ArchiveResponse {
  archives: ArchiveItem[];
  summary: ArchiveSummary;
}

function formatArchiveSize(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

const EMPTY_SUMMARY: ArchiveSummary = {
  total_count: 0,
  total_size_bytes: 0,
  by_type: { requests: 0, plans: 0, designs: 0, ideation: 0, discussion: 0, debug: 0, explore: 0, unknown: 0 },
};

const ARCHIVE_TYPE_ORDER: ArchiveType[] = [
  'requests',
  'plans',
  'designs',
  'ideation',
  'discussion',
  'debug',
  'explore',
  'unknown',
];

export function ArchivesView() {
  const { projectId } = useAppContext();
  const [archives, setArchives] = useState<ArchiveItem[]>([]);
  const [summary, setSummary] = useState<ArchiveSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [targetArchive, setTargetArchive] = useState<ArchiveItem | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const loadArchives = useCallback(async () => {
    try {
      const data = await apiFetch<ArchiveResponse>('/api/archives', projectId);
      setArchives(Array.isArray(data.archives) ? data.archives : []);
      setSummary(data.summary ?? EMPTY_SUMMARY);
    } catch (err) {
      setArchives([]);
      setSummary(EMPTY_SUMMARY);
      setStatusMessage(err instanceof Error ? err.message : '목록을 불러오지 못했습니다');
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      setArchives([]);
      setSummary(EMPTY_SUMMARY);
      return;
    }

    setLoading(true);
    loadArchives().finally(() => setLoading(false));
  }, [projectId, loadArchives]);

  const handleRefresh = async () => {
    if (!projectId) return;
    setIsRefreshing(true);
    setStatusMessage(null);
    try {
      await loadArchives();
    } finally {
      setIsRefreshing(false);
    }
  };

  const groupedArchives = useMemo(() => {
    const grouped: Record<string, ArchiveItem[]> = {};
    for (const archive of archives) {
      if (!grouped[archive.type]) grouped[archive.type] = [];
      grouped[archive.type].push(archive);
    }
    return ARCHIVE_TYPE_ORDER.filter((type) => grouped[type]?.length > 0).map((type) => ({
      type,
      items: grouped[type],
    }));
  }, [archives]);

  const handleRestore = async () => {
    if (!targetArchive || !projectId) {
      return;
    }

    setRestoringId(targetArchive.id);
    setStatusMessage(null);
    try {
      await apiFetch(`/api/archives/${targetArchive.id}/restore`, projectId, { method: 'POST' });
      await loadArchives();
      setStatusMessage(`복원 완료: ${targetArchive.filename}`);
      setTargetArchive(null);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : '복원 요청에 실패했습니다');
    } finally {
      setRestoringId(null);
    }
  };

  if (!projectId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        프로젝트를 선택하세요
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  const maxDistribution = Math.max(summary.total_count, 1);

  return (
    <div className="h-full flex flex-col gap-4 p-6 overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Archives</h2>
          <p className="text-sm text-muted-foreground">타입별 아카이브 목록 및 복원 관리</p>
        </div>
        <RefreshButton onClick={handleRefresh} isRefreshing={isRefreshing} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
          <CardDescription>총 건수/용량과 타입 분포를 한 번에 확인합니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="rounded-md border bg-muted/40 p-3">
              <div className="text-muted-foreground mb-1">총 건수</div>
              <div className="text-xl font-semibold">{summary.total_count}</div>
            </div>
            <div className="rounded-md border bg-muted/40 p-3">
              <div className="text-muted-foreground mb-1">총 용량</div>
              <div className="text-xl font-semibold">{formatArchiveSize(summary.total_size_bytes)}</div>
            </div>
            <div className="rounded-md border bg-muted/40 p-3">
              <div className="text-muted-foreground mb-1">총 타입 수</div>
              <div className="text-xl font-semibold">
                {Object.values(summary.by_type).filter((v) => v > 0).length}개
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {ARCHIVE_TYPE_ORDER.map((type) => {
              const count = summary.by_type[type] ?? 0;
              const ratio = (count / maxDistribution) * 100;
              return (
                <div key={type} className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{type}</span>
                    <span>{count}</span>
                  </div>
                  <div className="h-2 rounded bg-muted">
                    <div
                      className="h-full rounded bg-primary"
                      style={{ width: `${ratio}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {statusMessage ? (
        <div className="rounded-md border border-muted bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
          {statusMessage}
        </div>
      ) : null}

      <Card className="flex-1 min-h-0">
        <CardContent className="h-full p-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-2">
              {groupedArchives.length === 0 ? (
                <EmptyState
                  icon={<Archive className="h-8 w-8" />}
                  title="아카이브 없음"
                  description="아카이브가 없습니다"
                />
              ) : (
                groupedArchives.map((group) => (
                  <div key={group.type} className="space-y-2">
                    <Collapsible defaultOpen>
                      <CollapsibleTrigger asChild>
                        <button type="button" className="w-full rounded-md border bg-muted/20 px-3 py-2 flex items-center justify-between text-left">
                          <div className="flex items-center gap-2">
                            <ChevronRight className="h-4 w-4" />
                            <span className="font-medium">{group.type}</span>
                            <Badge variant="secondary">{group.items.length}개</Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">열기/닫기</span>
                        </button>
                      </CollapsibleTrigger>

                      <CollapsibleContent className="pt-2 pl-4 space-y-2">
                        {group.items.map((archive) => (
                          <div
                            key={archive.id}
                            className="rounded-md border p-3 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="font-medium text-sm truncate">{archive.filename}</div>
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span>{formatArchiveSize(archive.size_bytes)}</span>
                                <span>{formatDateTime(archive.archived_at)}</span>
                                <span>type: {archive.type}</span>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setTargetArchive(archive)}
                              disabled={restoringId === archive.id}
                            >
                              <Archive className="h-3.5 w-3.5 mr-1.5" />
                              복원
                            </Button>
                          </div>
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(targetArchive)}
        onOpenChange={(open) => {
          if (!open && !restoringId) setTargetArchive(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>아카이브 복원</DialogTitle>
            <DialogDescription>
              {targetArchive ? `${targetArchive.filename}를 복원하시겠습니까?` : '선택한 아카이브를 복원합니다.'}
            </DialogDescription>
          </DialogHeader>
          <div className="text-xs text-muted-foreground">
            복원 후 동일 타입 폴더에 내용이 생성됩니다.
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setTargetArchive(null);
              }}
              disabled={Boolean(restoringId)}
            >
              취소
            </Button>
            <Button onClick={handleRestore} disabled={Boolean(restoringId)} className="gap-1">
              <RefreshCw className={restoringId ? 'animate-spin h-3.5 w-3.5' : 'h-3.5 w-3.5'} />
              {restoringId ? '복원 중...' : '복원'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
