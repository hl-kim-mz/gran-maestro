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

export function IdeationView() {
  const { token, projectId, lastSseEvent } = useAppContext();
  const [ideations, setIdeations] = useState<any[]>([]);
  const [discussions, setDiscussions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [sessionData, setSessionData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [idns, dscs] = await Promise.all([
        apiFetch<any[]>('/api/ideation', token, projectId),
        apiFetch<any[]>('/api/discussion', token, projectId)
      ]);
      setIdeations(idns);
      setDiscussions(dscs);

      const all = [...idns, ...dscs].sort((a, b) => {
        const aTime = a.created_at ?? '';
        const bTime = b.created_at ?? '';
        return bTime.localeCompare(aTime);
      });
      if (all.length > 0 && !selectedSession) {
        setSelectedSession(all[0]);
      }
    } catch (err) {
      console.error('Failed to fetch ideation data:', err);
    }
  }, [token, projectId]);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [token, projectId]);

  useEffect(() => {
    if (!lastSseEvent || !projectId) return;

    if (lastSseEvent.type !== 'ideation_update' && lastSseEvent.type !== 'discussion_update') return;

    Promise.all([
      apiFetch<any[]>('/api/ideation', token, projectId),
      apiFetch<any[]>('/api/discussion', token, projectId)
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
        apiFetch<Record<string, unknown>>(`/api/${type}/${selectedSession.id}`, token, projectId)
          .then((data) => setSessionData(data))
          .catch(() => {
            /* keep previous session data on refresh failure */
          });
      }
    }
  }, [lastSseEvent, token, projectId, selectedSession?.id]);

  useEffect(() => {
    if (!selectedSession || !projectId) {
      setSessionData(null);
      return;
    }
    setSessionData(null);
    const type = selectedSession.id.startsWith('IDN') ? 'ideation' : 'discussion';
    apiFetch<Record<string, unknown>>(`/api/${type}/${selectedSession.id}`, token, projectId)
      .then((data) => setSessionData(data))
      .catch(() => setSessionData(null));
  }, [selectedSession?.id, token, projectId]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchData();
    setIsRefreshing(false);
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
          <RefreshButton onClick={handleRefresh} isRefreshing={isRefreshing} />
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {allSessions.map((s) => (
              <SessionCard
                key={s.id}
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
