import { useState, useEffect } from 'react';
import { useAppContext } from '@/context/AppContext';
import { apiFetch } from '@/hooks/useApi';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer';
import { EmptyState } from '@/components/shared/EmptyState';
import { Bug } from 'lucide-react';

export function DebugView() {
  const { token, projectId } = useAppContext();
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    async function fetchData() {
      try {
        const data = await apiFetch<any[]>('/api/debug', token, projectId);
        setSessions(data);
        if (data.length > 0 && !selectedSession) {
          setSelectedSession(data[0]);
        }
      } catch (err) {
        console.error('Failed to fetch debug data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [token, projectId]);

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
      <div className="col-span-4 border-r flex flex-col">
        <div className="p-4 border-b bg-muted/30">
          <h2 className="font-semibold">Debug Sessions ({sessions.length})</h2>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {sessions.map((s) => (
              <Card
                key={s.id}
                className={`cursor-pointer transition-colors hover:bg-accent/50 ${selectedSession?.id === s.id ? 'border-primary ring-1 ring-primary' : ''}`}
                onClick={() => setSelectedSession(s)}
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <Bug className="h-3 w-3 text-red-500" />
                      <CardTitle className="text-xs font-bold">{s.id}</CardTitle>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {s.issue || 'Debug Session'}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="col-span-8 flex flex-col bg-card">
        {selectedSession ? (
          <>
            <div className="p-4 border-b flex justify-between items-center bg-muted/10">
              <div>
                <h2 className="font-bold text-lg">{selectedSession.id}</h2>
                <p className="text-xs text-muted-foreground">{selectedSession.issue}</p>
              </div>
              <StatusBadge status={selectedSession.status} />
            </div>

            <ScrollArea className="flex-1 p-8">
              <div className="max-w-3xl mx-auto space-y-10">
                <section>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Report</h3>
                  <MarkdownRenderer content={selectedSession.report || '# No report yet'} />
                </section>

                {selectedSession.logs && (
                  <section>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Relevant Logs</h3>
                    <pre className="p-4 rounded-lg bg-zinc-950 text-zinc-300 font-mono text-[10px] overflow-x-auto">
                      {selectedSession.logs}
                    </pre>
                  </section>
                )}
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
