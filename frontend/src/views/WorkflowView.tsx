import { useState, useEffect, useRef } from 'react';
import { useAppContext } from '@/context/AppContext';
import { apiFetch } from '@/hooks/useApi';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Terminal, Activity, GitBranch } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer';

export function WorkflowView() {
  const { token, projectId } = useAppContext();
  const [requests, setRequests] = useState<any[]>([]);
  const [selectedReq, setSelectedReq] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<string>('');
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<any>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    async function fetchRequests() {
      try {
        const data = await apiFetch<any[]>('/api/requests', token, projectId);
        setRequests(data);
        if (data.length > 0 && !selectedReq) {
          setSelectedReq(data[0]);
        }
      } catch (err) {
        console.error('Failed to fetch requests:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchRequests();
  }, [token, projectId]);

  useEffect(() => {
    if (!selectedReq || !projectId) {
      setTasks([]);
      setSelectedTask(null);
      return;
    }
    apiFetch<any[]>(`/api/requests/${selectedReq.id}/tasks`, token, projectId)
      .then(data => {
        setTasks(data);
        if (data.length > 0) {
          setSelectedTask(data[data.length - 1]);
        } else {
          setSelectedTask(null);
        }
      })
      .catch(() => setTasks([]));
  }, [selectedReq?.id, token, projectId]);

  const taskKey = selectedReq && selectedTask
    ? `${selectedReq.id}/${selectedTask.id}`
    : null;

  useEffect(() => {
    if (selectedReq && selectedTask) {
      startLogStream(selectedReq.id, selectedTask.id);
    }
    return () => stopLogStream();
  }, [selectedReq, selectedTask]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    if (!selectedReq || !selectedTask || !projectId) {
      setSelectedTaskDetail(null);
      return;
    }
    apiFetch<any>(`/api/requests/${selectedReq.id}/tasks/${selectedTask.id}`, token, projectId)
      .then(data => setSelectedTaskDetail(data))
      .catch(() => setSelectedTaskDetail(null));
  }, [selectedReq?.id, selectedTask?.id, token, projectId]);

  async function startLogStream(reqId: string, taskId: string) {
    stopLogStream();
    setLogs('로그 수신 대기 중...');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`/api/projects/${projectId}/requests/${reqId}/tasks/${taskId}/log-stream`, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: controller.signal
      });

      if (!response.ok) throw new Error('Failed to start log stream');

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const dataLine = part.split('\n').find(l => l.startsWith('data:'));
          if (!dataLine) continue;
          try {
            const json = JSON.parse(dataLine.slice(5).trim());
            const lines: string[] = json?.data?.lines ?? [];
            if (lines.length > 0) {
              setLogs(prev => prev + lines.join('\n') + '\n');
            }
          } catch {
            // ignore parse errors
          }
        }
      }
      setLogs(prev => prev || '이 태스크의 로그가 없습니다');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Log stream error:', err);
        setLogs(prev => prev + '\n[Stream Error]');
      }
    }
  }

  function stopLogStream() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }

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
      {/* REQ List */}
      <div className="col-span-3 border-r flex flex-col">
        <div className="p-4 border-b bg-muted/30 flex justify-between items-center">
          <h2 className="font-semibold">Requests</h2>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {requests.map((req) => (
              <Card
                key={req.id}
                className={`cursor-pointer transition-colors hover:bg-accent/50 ${selectedReq?.id === req.id ? 'border-primary ring-1 ring-primary' : ''}`}
                onClick={() => setSelectedReq(req)}
              >
                <CardContent className="p-3">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-bold text-xs">{req.id}</span>
                    <StatusBadge status={req.status} />
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-1">{req.title || 'No title'}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* REQ Detail & Tasks */}
      <div className="col-span-9 flex flex-col bg-card">
        {selectedReq ? (
          <>
            <div className="p-4 border-b flex justify-between items-center bg-muted/10">
              <div className="flex items-center gap-3">
                <h2 className="font-bold text-lg">{selectedReq.id}</h2>
                <Badge variant="outline">{selectedReq.type}</Badge>
              </div>
              <div className="flex gap-2">
                <StatusBadge status={selectedReq.status} />
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Task list for selected REQ */}
              <div className="w-64 border-r flex flex-col bg-muted/5">
                <div className="p-2 border-b text-[10px] uppercase font-bold text-muted-foreground px-4">Tasks</div>
                <ScrollArea className="flex-1">
                  <div className="p-2 space-y-1">
                    {tasks.map((task: any) => (
                      <div
                        key={task.id}
                        onClick={() => setSelectedTask(task)}
                        className={`p-2 px-3 rounded-md cursor-pointer text-xs flex justify-between items-center ${selectedTask?.id === task.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
                      >
                        <span className="truncate mr-2">{task.name || task.id}</span>
                        <StatusBadge status={task.status} className="scale-75 origin-right" />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Task View (Logs / Info) */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {selectedTask ? (
                  <Tabs key={`${selectedReq?.id}-${selectedTask?.id}`} defaultValue="logs" className="flex-1 flex flex-col">
                    <div className="px-4 border-b">
                      <TabsList className="bg-transparent h-10 p-0 gap-4">
                        <TabsTrigger value="logs" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-1">
                          <Terminal className="h-3 w-3 mr-2" /> Logs
                        </TabsTrigger>
                        <TabsTrigger value="info" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-1">
                          <Activity className="h-3 w-3 mr-2" /> Details
                        </TabsTrigger>
                      </TabsList>
                    </div>
                    <TabsContent value="logs" className="flex-1 m-0 p-0 overflow-hidden relative">
                      <ScrollArea className="h-full bg-zinc-950 text-zinc-300 font-mono text-[11px] p-4">
                        <pre className="whitespace-pre-wrap">{logs}</pre>
                        <div ref={logEndRef} />
                      </ScrollArea>
                    </TabsContent>
                    <TabsContent value="info" className="flex-1 m-0 p-6 overflow-auto">
                      <div className="space-y-4">
                        <div>
                          <h3 className="text-sm font-bold mb-1">Task Info</h3>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="text-muted-foreground">ID:</div>
                            <div>{selectedTask.id}</div>
                            <div className="text-muted-foreground">Status:</div>
                            <div>{selectedTask.status}</div>
                            <div className="text-muted-foreground">Started:</div>
                            <div>{selectedTask.startedAt || 'N/A'}</div>
                          </div>
                        </div>
                        {selectedTask.error && (
                          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                            <h3 className="text-xs font-bold text-destructive mb-1">Error</h3>
                            <pre className="text-[10px] text-destructive overflow-auto">{selectedTask.error}</pre>
                          </div>
                        )}
                        {selectedTaskDetail?.spec && (
                          <div className="mt-4">
                            <h3 className="text-sm font-bold mb-2">Spec</h3>
                            <div className="prose prose-sm max-w-none text-xs">
                              <MarkdownRenderer content={selectedTaskDetail.spec} />
                            </div>
                          </div>
                        )}
                        {selectedTaskDetail?.review && (
                          <div className="mt-4">
                            <h3 className="text-sm font-bold mb-2">Review</h3>
                            <div className="prose prose-sm max-w-none text-xs">
                              <MarkdownRenderer content={selectedTaskDetail.review} />
                            </div>
                          </div>
                        )}
                        {selectedTaskDetail?.feedback && (
                          <div className="mt-4">
                            <h3 className="text-sm font-bold mb-2">Feedback</h3>
                            <div className="prose prose-sm max-w-none text-xs">
                              <MarkdownRenderer content={selectedTaskDetail.feedback} />
                            </div>
                          </div>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                ) : (
                  <EmptyState
                    icon={<Terminal className="h-8 w-8" />}
                    title="태스크를 선택하세요"
                    description="왼쪽 태스크 목록에서 항목을 클릭하면 실행 로그를 볼 수 있어요"
                  />
                )}
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            icon={<GitBranch className="h-8 w-8" />}
            title="요청을 선택하세요"
            description="왼쪽 목록에서 요청을 클릭하면 워크플로우를 확인할 수 있어요"
          />
        )}
      </div>
    </div>
  );
}
