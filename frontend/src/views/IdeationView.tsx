import { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '@/context/AppContext';
import { apiFetch } from '@/hooks/useApi';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, Lightbulb, Users } from 'lucide-react';
import { IdeationFlow } from '@/components/ideation/IdeationFlow';
import { DiscussionFlow } from '@/components/ideation/DiscussionFlow';
import { SessionCard } from '@/components/shared/SessionCard';
import { RefreshButton } from '@/components/shared/RefreshButton';
import { EditModeToolbar } from '@/components/EditModeToolbar';

export function IdeationView() {
  const { projectId, activeTab, lastSseEvent } = useAppContext();
  const [ideations, setIdeations] = useState<any[]>([]);
  const [discussions, setDiscussions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [sessionData, setSessionData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [idns, dscs] = await Promise.all([
        apiFetch<any[]>('/api/ideation', projectId),
        apiFetch<any[]>('/api/discussion', projectId)
      ]);
      setIdeations(idns);
      setDiscussions(dscs);

      const all = [...idns, ...dscs].sort((a, b) => {
        const aTime = a.created_at ?? '';
        const bTime = b.created_at ?? '';
        return bTime.localeCompare(aTime);
      });
      setSelectedSession((prev: any) => {
        if (all.length === 0) return null;
        if (!prev) return all[0];
        return all.find((session: any) => session.id === prev.id) ?? prev;
      });
    } catch (err) {
      console.error('Failed to fetch ideation data:', err);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId || activeTab !== 'ideation') {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [projectId, activeTab]);

  useEffect(() => {
    if (!lastSseEvent || !projectId || activeTab !== 'ideation') return;

    if (lastSseEvent.type !== 'ideation_update' && lastSseEvent.type !== 'discussion_update') return;

    Promise.all([
      apiFetch<any[]>('/api/ideation', projectId),
      apiFetch<any[]>('/api/discussion', projectId)
    ])
      .then(([idns, dscs]) => {
        setIdeations(idns);
        setDiscussions(dscs);

        if (selectedSession) {
          const all = [...idns, ...dscs];
          const updated = all.find((s) => s.id === selectedSession.id);
          if (updated) {
            setSelectedSession(updated);
          }
        }
      })
      .catch((err) => {
        console.error('Failed to refresh ideation/discussion lists:', err);
      });

    if (selectedSession) {
      const eventSessionId = (lastSseEvent as { sessionId?: string; session_id?: string }).sessionId
        ?? (lastSseEvent as { sessionId?: string; session_id?: string }).session_id;

      if (!eventSessionId || eventSessionId === selectedSession.id) {
        const type = selectedSession.id.startsWith('IDN') ? 'ideation' : 'discussion';
        apiFetch<Record<string, unknown>>(`/api/${type}/${selectedSession.id}`, projectId)
          .then((data) => setSessionData(data))
          .catch(() => {
            /* keep previous session data on refresh failure */
          });
      }
    }
  }, [lastSseEvent, projectId, activeTab, selectedSession?.id]);

  useEffect(() => {
    if (!selectedSession || !projectId || activeTab !== 'ideation') {
      setSessionData(null);
      return;
    }
    setSessionData(null);
    const type = selectedSession.id.startsWith('IDN') ? 'ideation' : 'discussion';
    apiFetch<Record<string, unknown>>(`/api/${type}/${selectedSession.id}`, projectId)
      .then((data) => setSessionData(data))
      .catch(() => setSessionData(null));
  }, [selectedSession?.id, projectId, activeTab]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchData();
      if (selectedSession && projectId) {
        const type = selectedSession.id.startsWith('IDN') ? 'ideation' : 'discussion';
        const data = await apiFetch<Record<string, unknown>>(`/api/${type}/${selectedSession.id}`, projectId);
        setSessionData(data);
      }
    } catch (err) {
      console.error('Failed to refresh ideation sessions:', err);
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

  const allSessions = [...ideations, ...discussions].sort((a, b) => {
    const aTime = a.created_at ?? '';
    const bTime = b.created_at ?? '';
    return bTime.localeCompare(aTime);
  });

  return (
    <div className="grid grid-cols-12 h-full overflow-hidden">
      <div className="col-span-4 border-r flex flex-col min-h-0">
        <div className="p-4 border-b bg-muted/30 flex justify-between items-center">
          <h2 className="font-semibold">Sessions ({allSessions.length})</h2>
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
            {allSessions.map((s) => (
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
                    title={s.objective || s.topic || 'Ideation Session'}
                    status={s.status}
                    createdAt={s.created_at}
                    icon={
                      s.id.startsWith('IDN')
                        ? <Lightbulb className="h-3 w-3 text-yellow-500" />
                        : <MessageSquare className="h-3 w-3 text-blue-500" />
                    }
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
                <h2 className="font-bold text-lg">{selectedSession.id}</h2>
                <p className="text-xs text-muted-foreground">{selectedSession.objective || selectedSession.topic}</p>
              </div>
              <StatusBadge status={selectedSession.status} />
            </div>

            <Tabs defaultValue="flow" className="flex-1 flex flex-col overflow-hidden min-h-0">
              <div className="px-6 border-b">
                <TabsList className="bg-transparent h-12 p-0 gap-6">
                  <TabsTrigger value="flow" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-1">
                    Flow
                  </TabsTrigger>
                  <TabsTrigger value="participants" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-1">
                    <Users className="h-4 w-4 mr-2" /> Participants
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="flow" className="flex-1 m-0 p-0 overflow-hidden min-h-0">
                <ScrollArea className="h-full">
                  <div className="p-8">
                    {selectedSession.id.startsWith('IDN') ? (
                      sessionData ? <IdeationFlow sessionData={sessionData} /> : <div className="text-sm text-muted-foreground">아직 결과 없음</div>
                    ) : (
                      sessionData ? <DiscussionFlow sessionData={sessionData} /> : <div className="text-sm text-muted-foreground">아직 결과 없음</div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="participants" className="flex-1 m-0 p-6 overflow-auto">
                <div className="space-y-6">
                  {(selectedSession.participants || []).map((p: any, i: number) => (
                    <div key={i} className="border rounded-lg p-4 bg-muted/20">
                      <div className="flex justify-between items-center mb-3">
                        <div>
                          <h3 className="font-bold text-sm">{p.key || p.role}</h3>
                          {p.provider && p.provider !== p.key && (
                            <p className="text-xs text-muted-foreground">{p.provider}</p>
                          )}
                        </div>
                        <StatusBadge status={p.status} />
                      </div>
                      {p.perspective && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {p.perspective}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <EmptyState
            icon={<Lightbulb className="h-8 w-8" />}
            title="세션을 선택하세요"
            description="왼쪽 목록에서 아이디에이션 또는 토론 세션을 클릭하세요"
          />
        )}
      </div>
    </div>
  );
}
