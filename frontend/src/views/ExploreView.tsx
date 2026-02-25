import { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '@/context/AppContext';
import { apiFetch } from '@/hooks/useApi';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer';
import { EmptyState } from '@/components/shared/EmptyState';
import { Search } from 'lucide-react';
import { SessionCard } from '@/components/shared/SessionCard';
import { RefreshButton } from '@/components/shared/RefreshButton';
import { EditModeToolbar } from '@/components/EditModeToolbar';

interface ExploreMeta {
  id: string;
  goal?: string;
  focus?: string;
  status?: string;
  created_at?: string;
  content?: string;
}

export function ExploreView() {
  const { projectId, lastSseEvent } = useAppContext();
  const [sessions, setSessions] = useState<ExploreMeta[]>([]);
  const [selectedSession, setSelectedSession] = useState<ExploreMeta | null>(null);
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const data = await apiFetch<ExploreMeta[]>('/api/explore', projectId);
      setSessions(data);
      setSelectedSession(prev =>
        prev ? (data.find(session => session.id === prev.id) ?? data[0] ?? null) : (data[0] ?? null)
      );
    } catch (err) {
      console.error('Failed to fetch explore data:', err);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    if (!lastSseEvent || !projectId) return;
    if (lastSseEvent.type !== 'explore_update') return;

    apiFetch<ExploreMeta[]>('/api/explore', projectId)
      .then(data => {
        setSessions(data);
        if (selectedSession) {
          const updated = data.find(session => session.id === selectedSession.id);
          if (updated) {
            setSelectedSession(updated);
          }
        }
      })
      .catch(err => console.error('SSE re-fetch explore failed:', err));

    if (selectedSession) {
      const eventSessionId =
        (lastSseEvent as { sessionId?: string }).sessionId ??
        (lastSseEvent as { session_id?: string }).session_id;
      if (!eventSessionId || eventSessionId === selectedSession.id) {
        apiFetch<{ content?: string }>(`/api/explore/${selectedSession.id}`, projectId)
          .then(data => setReportContent(data.content || null))
          .catch(() => setReportContent(null));
      }
    }
  }, [lastSseEvent, projectId, selectedSession?.id]);

  useEffect(() => {
    if (!selectedSession || !projectId) {
      setReportContent(null);
      return;
    }
    apiFetch<{ content?: string }>(`/api/explore/${selectedSession.id}`, projectId)
      .then(data => setReportContent(data.content || null))
      .catch(() => setReportContent(null));
  }, [selectedSession?.id, projectId]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchData();
      if (selectedSession && projectId) {
        const data = await apiFetch<{ content?: string }>(`/api/explore/${selectedSession.id}`, projectId);
        setReportContent(data.content || null);
      }
    } catch (err) {
      console.error('Failed to refresh explore sessions:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleStatusChange = async (targetStatus: string) => {
    try {
      await apiFetch('/api/manage/status', projectId, {
        method: 'PATCH',
        body: JSON.stringify({ ids: selectedIds, targetStatus }),
      });
      setIsEditMode(false);
      setSelectedIds([]);
      await fetchData();
    } catch (err) {
      console.error('상태 변경 실패:', err);
    }
  };

  const handleBackup = async () => {
    try {
      const resolvedPath = projectId
        ? `/api/projects/${projectId}/manage/backup`
        : '/api/manage/backup';
      const response = await fetch(resolvedPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (!response.ok) throw new Error(`백업 실패: ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gran-maestro-backup-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('백업 실패:', err);
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
    return <div className="p-6"><Skeleton className="h-full w-full" /></div>;
  }

  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={<Search className="h-8 w-8" />}
        title="탐색 세션 없음"
        description="탐색 세션 없음 — /mst:explore로 코드 탐색을 시작하세요"
      />
    );
  }

  return (
    <div className="grid grid-cols-12 h-full overflow-hidden">
      <div className="col-span-4 border-r flex flex-col min-h-0">
        <div className="p-4 border-b bg-muted/30 flex justify-between items-center">
          <h2 className="font-semibold">Explore Sessions ({sessions.length})</h2>
          <div className="flex items-center gap-2">
            <EditModeToolbar
              isEditMode={isEditMode}
              selectedIds={selectedIds}
              itemType="session"
              onToggleEditMode={() => { setIsEditMode(v => !v); setSelectedIds([]); }}
              onStatusChange={handleStatusChange}
              onBackup={handleBackup}
              onCancel={() => { setIsEditMode(false); setSelectedIds([]); }}
            />
            <RefreshButton onClick={handleRefresh} isRefreshing={isRefreshing} />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-1.5">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center">
                {isEditMode && (
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(s.id)}
                    onChange={(e) => {
                      setSelectedIds(prev =>
                        e.target.checked ? [...prev, s.id] : prev.filter(id => id !== s.id)
                      );
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="mr-2 h-4 w-4"
                  />
                )}
                <div className="flex-1">
                  <SessionCard
                    id={s.id}
                    title={s.goal || s.id}
                    status={s.status ?? ''}
                    createdAt={s.created_at}
                    icon={<Search className="h-3 w-3 text-blue-500" />}
                    extraBadge={s.focus}
                    isSelected={selectedSession?.id === s.id}
                    onClick={() => setSelectedSession(s)}
                  />
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="col-span-8 flex flex-col bg-card min-h-0">
        {selectedSession ? (
          <>
            <div className="p-4 border-b flex justify-between items-center bg-muted/10">
              <div>
                <h2 className="font-bold text-lg">{selectedSession.goal || selectedSession.id}</h2>
                <p className="text-xs text-muted-foreground">{selectedSession.created_at?.slice(0, 10)}</p>
              </div>
              <StatusBadge status={selectedSession.status ?? ''} />
            </div>

            <ScrollArea className="flex-1">
              <div className="p-8">
                <div className="space-y-10">
                  <section>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Report</h3>
                    <MarkdownRenderer content={reportContent || '# No report yet'} />
                  </section>
                </div>
              </div>
            </ScrollArea>
          </>
        ) : (
          <EmptyState
            icon={<Search className="h-8 w-8" />}
            title="탐색 세션을 선택하세요"
            description="왼쪽 목록에서 탐색 세션을 클릭하면 리포트를 볼 수 있어요"
          />
        )}
      </div>
    </div>
  );
}
