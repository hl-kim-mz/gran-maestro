import { useState, useEffect, useRef } from 'react';
import { useAppContext } from '@/context/AppContext';
import { apiFetch } from '@/hooks/useApi';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Terminal, Activity, GitBranch, ClipboardList, ArrowRight } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer';
import { SessionCard } from '@/components/shared/SessionCard';

export function WorkflowView() {
  const { token, projectId, lastSseEvent, navigateTo, pendingNavigation, clearPendingNavigation } = useAppContext();
  const [requests, setRequests] = useState<any[]>([]);
  const [selectedReq, setSelectedReq] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<string>('');
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<any>(null);
  const logScrollAreaRef = useRef<HTMLDivElement>(null);
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
    if (!lastSseEvent || !projectId) return;
    if (lastSseEvent.type !== 'request_update' && lastSseEvent.type !== 'task_update') return;

    if (lastSseEvent.type === 'request_update') {
      apiFetch<any[]>('/api/requests', token, projectId)
        .then((data) => {
          setRequests(data);
          if (selectedReq) {
            const updatedReq = data.find((req) => req.id === selectedReq.id);
            if (updatedReq) {
              setSelectedReq(updatedReq);
            }
          }
        })
        .catch((err) => console.error('SSE re-fetch requests failed:', err));
      return;
    }

    if (lastSseEvent.type === 'task_update' && selectedReq) {
      const eventReqId = lastSseEvent.requestId || lastSseEvent.req_id;
      if (eventReqId && eventReqId !== selectedReq.id) return;

      apiFetch<any[]>(`/api/requests/${selectedReq.id}/tasks`, token, projectId)
        .then((data) => {
          setTasks(data);
          if (selectedTask) {
            const updatedTask = data.find((task) => task.id === selectedTask.id);
            if (updatedTask) {
              setSelectedTask(updatedTask);
            }
          }
        })
        .catch((err) => console.error('SSE re-fetch tasks failed:', err));
    }
  }, [lastSseEvent, projectId, token, selectedReq?.id, selectedTask?.id]);

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
    const viewport = logScrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (pendingNavigation?.tab !== 'workflow' || loading) return;

    if (pendingNavigation.selectedId) {
      const target = requests.find((req) => req.id === pendingNavigation.selectedId);
      if (target) {
        setSelectedReq(target);
      }
    }
    clearPendingNavigation();
  }, [pendingNavigation, loading, clearPendingNavigation, requests]);

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
      setLogs(prev => (prev === '로그 수신 대기 중...' ? '이 태스크의 로그가 없습니다' : prev));
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
              <SessionCard
                key={req.id}
                id={req.id}
                title={req.title || 'No title'}
                status={req.status ?? ''}
                createdAt={req.created_at}
                extraBadge={req.linked_plan ?? undefined}
                isSelected={selectedReq?.id === req.id}
                onClick={() => setSelectedReq(req)}
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* REQ Detail & Tasks */}
      <div className="col-span-9 flex flex-col bg-card overflow-hidden">
        {selectedReq ? (
          <>
            <div className="p-4 border-b flex justify-between items-center bg-muted/10">
              <div className="flex items-center gap-3">
                <h2 className="font-bold text-lg">{selectedReq.id}</h2>
                <Badge variant="outline">{selectedReq.type}</Badge>
                {selectedReq?.linked_plan && (
                  <button
                    type="button"
                    onClick={() => navigateTo('plans', selectedReq.linked_plan)}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-muted hover:bg-accent transition-colors font-mono"
                  >
                    <ClipboardList className="h-3 w-3" />
                    {selectedReq.linked_plan}
                    <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <StatusBadge status={selectedReq.status} />
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Task list for selected REQ */}
              <div className="w-64 border-r flex flex-col bg-muted/5">
                <div className="p-2 border-b text-xs uppercase font-bold text-muted-foreground px-4">Tasks</div>
                <ScrollArea className="flex-1">
                  <div className="p-2 space-y-1">
                    {tasks.map((task: any) => (
                      <div
                        key={task.id}
                        onClick={() => setSelectedTask(task)}
                        className={`p-2 px-3 rounded-md cursor-pointer text-xs flex justify-between items-center ${selectedTask?.id === task.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
                      >
                        <span className="truncate mr-2">{task.name || task.id}</span>
                        <StatusBadge status={task.status} className="px-1.5 py-0 text-[10px] h-auto shrink-0" />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Task View (Logs / Info) */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {selectedTask ? (
                  <Tabs key={`${selectedReq?.id}-${selectedTask?.id}`} defaultValue="info" className="flex-1 flex flex-col">
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
                      <ScrollArea ref={logScrollAreaRef} className="absolute inset-0 bg-zinc-950 text-zinc-300 font-mono text-[11px] p-4">
                        <pre className="whitespace-pre-wrap">{logs}</pre>
                      </ScrollArea>
                    </TabsContent>
                    <TabsContent value="info" className="flex-1 m-0 p-6 overflow-auto">
                      <div className="space-y-4">
                        {selectedReq?.linked_plan && (
                          <div className="mb-4 p-3 bg-muted/30 border rounded-md">
                            <h3 className="text-xs font-bold mb-1 text-muted-foreground uppercase">연결된 Plan</h3>
                            <button
                              type="button"
                              onClick={() => navigateTo('plans', selectedReq.linked_plan)}
                              className="text-xs font-mono text-primary hover:underline"
                            >
                              {selectedReq.linked_plan} →
                            </button>
                          </div>
                        )}
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
