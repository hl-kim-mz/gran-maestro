import { useState, useEffect } from 'react';
import { useAppContext } from '@/context/AppContext';
import { apiFetch } from '@/hooks/useApi';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer';
import { EmptyState } from '@/components/shared/EmptyState';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, Lightbulb, Users } from 'lucide-react';

export function IdeationView() {
  const { token, projectId } = useAppContext();
  const [ideations, setIdeations] = useState<any[]>([]);
  const [discussions, setDiscussions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [sessionContent, setSessionContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    async function fetchData() {
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
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [token, projectId]);

  useEffect(() => {
    if (!selectedSession || !projectId) {
      setSessionContent(null);
      return;
    }
    const type = selectedSession.id.startsWith('IDN') ? 'ideation' : 'discussion';
    apiFetch<any>(`/api/${type}/${selectedSession.id}`, token, projectId)
      .then(data => setSessionContent(data.synthesis || data.consensus || null))
      .catch(() => setSessionContent(null));
  }, [selectedSession?.id, token, projectId]);

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
        <div className="p-4 border-b bg-muted/30">
          <h2 className="font-semibold">Sessions ({allSessions.length})</h2>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {allSessions.map((s) => (
              <Card
                key={s.id}
                className={`cursor-pointer transition-colors hover:bg-accent/50 ${selectedSession?.id === s.id ? 'border-primary ring-1 ring-primary' : ''}`}
                onClick={() => setSelectedSession(s)}
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      {s.id.startsWith('IDN') ? <Lightbulb className="h-3 w-3 text-yellow-500" /> : <MessageSquare className="h-3 w-3 text-blue-500" />}
                      <CardTitle className="text-xs font-bold">{s.id}</CardTitle>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {s.objective || s.topic || 'Ideation Session'}
                  </p>
                </CardContent>
              </Card>
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

            <Tabs defaultValue="result" className="flex-1 flex flex-col overflow-hidden min-h-0">
              <div className="px-6 border-b">
                <TabsList className="bg-transparent h-12 p-0 gap-6">
                  <TabsTrigger value="result" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-1">
                    Synthesis / Consensus
                  </TabsTrigger>
                  <TabsTrigger value="participants" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-1">
                    <Users className="h-4 w-4 mr-2" /> Participants
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="result" className="flex-1 m-0 p-0 overflow-hidden min-h-0">
                <ScrollArea className="h-full">
                  <div className="p-8">
                    <MarkdownRenderer content={sessionContent || '# No result yet'} />
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
