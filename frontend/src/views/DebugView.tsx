import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppContext } from '@/context/AppContext';
import { apiFetch } from '@/hooks/useApi';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer';
import { EmptyState } from '@/components/shared/EmptyState';
import { Bug, ClipboardList, ArrowRight } from 'lucide-react';
import { SessionCard } from '@/components/shared/SessionCard';
import { RefreshButton } from '@/components/shared/RefreshButton';
import { EditModeToolbar } from '@/components/EditModeToolbar';
import { useResizableSidebar } from '@/hooks/useResizableSidebar';
import { ResizableHandle } from '@/components/shared/ResizableHandle';
import { ListFilter, type FilterOption } from '@/components/shared/ListFilter';

interface DebugMeta {
  id: string;
  issue?: string;
  focus?: string;
  status?: string;
  created_at?: string;
  logs?: string;
  linked_plan?: string;
}

interface DebugDetail {
  content?: string;
  logs?: string;
}

export function DebugView() {
  const { projectId, lastSseEvent, navigateTo } = useAppContext();
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<DebugMeta[]>([]);
  const [selectedSession, setSelectedSession] = useState<DebugMeta | null>(null);
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { sidebarWidth, isResizing, startResizing, sidebarRef } = useResizableSidebar({
    defaultWidth: 300,
    minWidth: 250,
    maxWidth: 600,
    storageKey: 'debug-sidebar-width',
  });

  const [searchValue, setSearchValue] = useState('');
  const [filterValue, setFilterValue] = useState('all');
  const [sortValue, setSortValue] = useState('newest');

  const statusFilterOptions: FilterOption[] = [
    { value: 'all', label: 'All Status' },
    { value: 'open', label: 'Open' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'done', label: 'Done' },
  ];

  const sortOptions: FilterOption[] = [
    { value: 'newest', label: 'Newest First' },
    { value: 'oldest', label: 'Oldest First' },
  ];

  const filteredSessions = useMemo(() => {
    let result = [...sessions];

    // text search
    if (searchValue.trim()) {
      const query = searchValue.trim().toLowerCase();
      result = result.filter(
        (s) =>
          s.id?.toLowerCase().includes(query) ||
          s.issue?.toLowerCase().includes(query) ||
          s.focus?.toLowerCase().includes(query)
      );
    }

    // status filter
    if (filterValue && filterValue !== 'all') {
      result = result.filter((s) => s.status === filterValue);
    }

    // sort
    if (sortValue === 'oldest') {
      result.sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
    } else {
      result.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
    }

    return result;
  }, [sessions, searchValue, filterValue, sortValue]);

  const fetchData = useCallback(async () => {
    try {
      const data = await apiFetch<DebugMeta[]>('/api/debug', projectId);
      setSessions(data);
      setSelectedSession(prev =>
        prev ? (data.find(session => session.id === prev.id) ?? data[0] ?? null) : (data[0] ?? null)
      );
    } catch (err) {
      console.error('Failed to fetch debug data:', err);
    }
  }, [projectId]);

  useEffect(() => {
    if (sessions.length === 0) return;
    if (sessionId) {
      const target = sessions.find((s: any) => s.id === sessionId);
      setSelectedSession(target || sessions[0]);
    } else {
      setSelectedSession(sessions[0]);
    }
  }, [sessionId, sessions]);

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
    if (lastSseEvent.type !== 'debug_update') return;

    apiFetch<DebugMeta[]>('/api/debug', projectId)
      .then(data => {
        setSessions(data);
        if (selectedSession) {
          const updated = data.find(session => session.id === selectedSession.id);
          if (updated) {
            setSelectedSession(updated);
          }
        }
      })
      .catch(err => console.error('SSE re-fetch debug failed:', err));

    if (selectedSession) {
      const eventSessionId =
        (lastSseEvent as { sessionId?: string }).sessionId ??
        (lastSseEvent as { session_id?: string }).session_id;
      if (!eventSessionId || eventSessionId === selectedSession.id) {
        apiFetch<DebugDetail>(`/api/debug/${selectedSession.id}`, projectId)
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
    apiFetch<DebugDetail>(`/api/debug/${selectedSession.id}`, projectId)
      .then(data => setReportContent(data.content || null))
      .catch(() => setReportContent(null));
  }, [selectedSession?.id, projectId]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchData();
      if (selectedSession && projectId) {
        const data = await apiFetch<DebugDetail>(`/api/debug/${selectedSession.id}`, projectId);
        setReportContent(data.content || null);
      }
    } catch (err) {
      console.error('Failed to refresh debug sessions:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleStatusChange = async (targetStatus: string) => {
    try {
      const resolvedPath = projectId
        ? `/api/projects/${projectId}/manage/status`
        : '/api/manage/status';
      const response = await fetch(resolvedPath, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, targetStatus }),
      });
      const result = await response.json() as {
        succeeded: string[];
        skipped: string[];
        errors: string[];
      };

      if (!response.ok) {
        throw new Error(`상태 변경 실패: ${response.status}`);
      }

      if (result.errors.length > 0) {
        alert(`상태 변경 실패: ${result.errors.join(', ')}`);
      }

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

  return (
    <div className="flex h-full overflow-hidden">
      <div ref={sidebarRef} style={{ width: sidebarWidth }} className="border-r flex flex-col min-h-0 shrink-0">
        <div className="p-4 border-b bg-muted/30 flex justify-between items-center">
          <h2 className="font-semibold">Debug Sessions ({sessions.length})</h2>
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
        <ListFilter
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          searchPlaceholder="Search by issue or ID..."
          filterOptions={statusFilterOptions}
          filterValue={filterValue}
          onFilterChange={setFilterValue}
          filterPlaceholder="Status"
          sortOptions={sortOptions}
          sortValue={sortValue}
          onSortChange={setSortValue}
          sortPlaceholder="Sort"
        />
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-1.5">
            {filteredSessions.map((s) => (
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
                    title={s.issue || s.id}
                    status={s.status ?? ''}
                    createdAt={s.created_at}
                    icon={<Bug className="h-3 w-3 text-red-500" />}
                    extraBadge={s.focus}
                    isSelected={selectedSession?.id === s.id}
                    onClick={() => navigate('/debug/' + s.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      <ResizableHandle isResizing={isResizing} onMouseDown={startResizing} />

      <div className="flex-1 flex flex-col bg-card min-h-0 overflow-hidden">
        {selectedSession ? (
          <>
            <div className="p-4 border-b flex justify-between items-center bg-muted/10">
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="font-bold text-lg">{selectedSession.issue || selectedSession.id}</h2>
                  <p className="text-xs text-muted-foreground">{selectedSession.created_at?.slice(0, 10)}</p>
                </div>
                {selectedSession.linked_plan && (
                  <button
                    type="button"
                    onClick={() => navigateTo('plans', selectedSession.linked_plan)}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-muted hover:bg-accent transition-colors font-mono"
                  >
                    <ClipboardList className="h-3 w-3" />
                    {selectedSession.linked_plan}
                    <ArrowRight className="h-3 w-3" />
                  </button>
                )}
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

                  {selectedSession.logs && (
                    <section>
                      <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Relevant Logs</h3>
                      <pre className="p-4 rounded-lg bg-zinc-100 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-300 font-mono text-[10px] overflow-x-auto">
                        {selectedSession.logs}
                      </pre>
                    </section>
                  )}
                </div>
              </div>
            </ScrollArea>
          </>
        ) : (
          <EmptyState
            icon={<Bug className="h-8 w-8" />}
            title="디버그 세션을 선택하세요"
            description="왼쪽 목록에서 디버그 세션을 클릭하면 리포트를 볼 수 있어요"
          />
        )}
      </div>
    </div>
  );
}
