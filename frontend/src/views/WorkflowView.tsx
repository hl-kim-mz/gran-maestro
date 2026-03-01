import { useState, useEffect, useRef, useCallback } from 'react';
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
import { RefreshButton } from '@/components/shared/RefreshButton';
import { EditModeToolbar } from '@/components/EditModeToolbar';

type LogStreamStatus = 'idle' | 'connecting' | 'live' | 'ended' | 'error';

export function WorkflowView() {
  const { projectId, activeTab, lastSseEvent, navigateTo, pendingNavigation, clearPendingNavigation } = useAppContext();
  const [requests, setRequests] = useState<any[]>([]);
  const [selectedReq, setSelectedReq] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<string>('');
  const [streamStatus, setStreamStatus] = useState<LogStreamStatus>('idle');
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const logScrollAreaRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortedByUserRef = useRef(false);
  const retryCountRef = useRef(0);
  const lastEventIdRef = useRef<string | null>(null);
  const isAtBottomRef = useRef(true);

  const fetchRequests = useCallback(async () => {
    try {
      const data = await apiFetch<any[]>('/api/requests', projectId);
      setRequests(data);
      setSelectedReq((prev: any) =>
        prev ? (data.find((req: any) => req.id === prev.id) ?? data[0] ?? null) : (data[0] ?? null)
      );
    } catch (err) {
      console.error('Failed to fetch requests:', err);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId || activeTab !== 'workflow') {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchRequests().finally(() => setLoading(false));
  }, [projectId, activeTab]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const data = await apiFetch<any[]>('/api/requests', projectId);
      setRequests(data);
      if (selectedReq) {
        const updatedReq = data.find(req => req.id === selectedReq.id) ?? selectedReq;
        setSelectedReq(updatedReq);
        const taskData = await apiFetch<any[]>(`/api/requests/${updatedReq.id}/tasks`, projectId);
        setTasks(taskData);
        if (selectedTask) {
          const updatedTask = taskData.find(task => task.id === selectedTask.id) ?? selectedTask;
          setSelectedTask(updatedTask);
          const detail = await apiFetch<any>(
            `/api/requests/${updatedReq.id}/tasks/${updatedTask.id}`,
            projectId
          );
          setSelectedTaskDetail(detail);
        }
      }
    } catch (err) {
      console.error('Failed to refresh workflow data:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!lastSseEvent || !projectId || activeTab !== 'workflow') return;
    if (lastSseEvent.type !== 'request_update' && lastSseEvent.type !== 'task_update') return;

    if (lastSseEvent.type === 'request_update') {
      apiFetch<any[]>('/api/requests', projectId)
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

      apiFetch<any[]>(`/api/requests/${selectedReq.id}/tasks`, projectId)
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
  }, [lastSseEvent, projectId, activeTab, selectedReq?.id, selectedTask?.id]);

  useEffect(() => {
    if (!selectedReq || !projectId || activeTab !== 'workflow') {
      setTasks([]);
      setSelectedTask(null);
      return;
    }
    apiFetch<any[]>(`/api/requests/${selectedReq.id}/tasks`, projectId)
      .then(data => {
        setTasks(data);
        if (data.length > 0) {
          setSelectedTask(data[data.length - 1]);
        } else {
          setSelectedTask(null);
        }
      })
      .catch(() => setTasks([]));
  }, [selectedReq?.id, projectId, activeTab]);

  const taskKey = selectedTask?.id ?? null;

  useEffect(() => {
    if (activeTab !== 'workflow' || !selectedReq || !selectedTask) {
      return;
    }
    if (selectedReq && selectedTask) {
      lastEventIdRef.current = null;
      startLogStream(selectedReq.id, selectedTask.id);
    }
    return () => stopLogStream();
  }, [selectedReq?.id, selectedTask?.id, activeTab]);

  useEffect(() => {
    if (!isAtBottomRef.current) return;
    const viewport = logScrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [logs]);

  useEffect(() => {
    const viewport = logScrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (!viewport) return;
    isAtBottomRef.current = true;
    const handleScroll = () => {
      isAtBottomRef.current =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 80;
    };
    viewport.addEventListener('scroll', handleScroll);
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, [selectedTask?.id]);

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
    if (!selectedReq || !selectedTask || !projectId || activeTab !== 'workflow') {
      setSelectedTaskDetail(null);
      return;
    }
    apiFetch<any>(`/api/requests/${selectedReq.id}/tasks/${selectedTask.id}`, projectId)
      .then(data => setSelectedTaskDetail(data))
      .catch(() => setSelectedTaskDetail(null));
  }, [selectedReq?.id, selectedTask?.id, projectId, activeTab]);

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
      await fetchRequests();
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

  async function startLogStream(reqId: string, taskId: string, isReconnect = false) {
    stopLogStream();
    abortedByUserRef.current = false;
    retryCountRef.current = 0;
    setLogs('');
    setStreamStatus('connecting');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const appendLogLines = (lines: string[]) => {
      if (lines.length === 0) return;
      setLogs(prev => (prev === '' ? '' : prev) + lines.join('\n') + '\n');
    };

    const handleSseChunk = (part: string) => {
      const idLine = part.split('\n').find(line => line.startsWith('id:'));
      if (idLine) {
        lastEventIdRef.current = idLine.slice(3).trim();
      }

      const eventLine = part.split('\n').find(line => line.startsWith('event:'));
      const dataLine = part.split('\n').find(line => line.startsWith('data:'));

      if (eventLine?.trim() === 'event: no_log') {
        setLogs(prev => (prev === '' ? '실행 로그가 기록되지 않은 태스크입니다' : prev));
        setStreamStatus('ended');
        return true;
      }

      if (!dataLine) return false;
      setStreamStatus('live');

      try {
        const json = JSON.parse(dataLine.slice(5).trim());
        const lines: string[] = json?.data?.lines ?? [];
        appendLogLines(lines);
      } catch {
        // ignore parse errors
      }

      return false;
    };

    try {
      const headers: HeadersInit = {};
      if (lastEventIdRef.current && isReconnect) {
        headers['Last-Event-ID'] = lastEventIdRef.current;
      }
      const response = await fetch(`/api/projects/${projectId}/requests/${reqId}/tasks/${taskId}/log-stream`, {
        signal: controller.signal,
        headers,
      });

      if (!response.ok) throw new Error('Failed to start log stream');

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) {
            const eventLine = buffer.split('\n').find(line => line.startsWith('event:'));
            const dataLine = buffer.split('\n').find(line => line.startsWith('data:'));
            if (eventLine?.trim() === 'event: no_log') {
              setLogs(prev => (prev === '' ? '실행 로그가 기록되지 않은 태스크입니다' : prev));
            } else if (dataLine) {
              setStreamStatus('live');
              try {
                const json = JSON.parse(dataLine.slice(5).trim());
                const lines: string[] = json?.data?.lines ?? [];
                appendLogLines(lines);
              } catch {
                // ignore parse errors
              }
            }
          }
          setStreamStatus('ended');
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          if (handleSseChunk(part)) return;
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setStreamStatus('idle');
        return;
      }

      console.error('Log stream error:', err);
      if (abortedByUserRef.current) {
        setStreamStatus('idle');
        return;
      }

      if (retryCountRef.current < 3) {
        const delayMs = Math.pow(2, retryCountRef.current) * 1000;
        retryCountRef.current += 1;
        setStreamStatus('connecting');

        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          if (!abortedByUserRef.current) {
            startLogStream(reqId, taskId, true);
          }
        }, delayMs);
      } else {
        setStreamStatus('error');
      }
    }
  }

  function stopLogStream() {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    abortedByUserRef.current = true;
    retryCountRef.current = 0;
    setStreamStatus('idle');
  }

  const handleLogRefresh = () => {
    if (!selectedReq || !selectedTask) return;
    startLogStream(selectedReq.id, selectedTask.id);
  };

  const streamStatusMeta = (() => {
    if (streamStatus === 'idle') return null;
    if (streamStatus === 'connecting') {
      return {
        label: 'Connecting...',
        badge: 'border-muted-foreground/30 text-muted-foreground',
        dot: 'bg-muted-foreground/70',
      };
    }
    if (streamStatus === 'live') {
      return {
        label: 'Live',
        badge: 'border-emerald-500/50 text-emerald-700 dark:text-emerald-300',
        dot: 'bg-emerald-500 animate-pulse',
      };
    }
    if (streamStatus === 'ended') {
      return {
        label: 'Ended',
        badge: 'border-muted-foreground/40 text-muted-foreground',
        dot: 'bg-muted-foreground/80',
      };
    }
    return {
      label: 'Error',
      badge: 'border-red-500/50 text-red-600 dark:text-red-300',
      dot: 'bg-red-500',
    };
  })();

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
      <div className="col-span-3 border-r flex flex-col min-h-0">
        <div className="p-4 border-b bg-muted/30 flex justify-between items-center">
          <h2 className="font-semibold">Requests</h2>
          <div className="flex items-center gap-2">
            <EditModeToolbar
              isEditMode={isEditMode}
              selectedIds={selectedIds}
              itemType="request"
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
            {requests.map((req) => (
              <div key={req.id} className="flex items-center">
                {isEditMode && (
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(req.id)}
                    onChange={(e) => {
                      setSelectedIds(prev =>
                        e.target.checked ? [...prev, req.id] : prev.filter(id => id !== req.id)
                      );
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="mr-2 h-4 w-4"
                  />
                )}
                <div className="flex-1">
                  <SessionCard
                    id={req.id}
                    title={req.title || 'No title'}
                    status={req.status ?? ''}
                    createdAt={req.created_at}
                    extraBadge={req.linked_plan ?? undefined}
                    isSelected={selectedReq?.id === req.id}
                    onClick={() => setSelectedReq(req)}
                  />
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* REQ Detail & Tasks */}
      <div className="col-span-9 flex flex-col bg-card overflow-hidden min-h-0">
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
              <div className="w-64 border-r flex flex-col bg-muted/5 min-h-0">
                <div className="p-2 border-b text-xs uppercase font-bold text-muted-foreground px-4">Tasks</div>
                <ScrollArea className="flex-1">
                  <div className="p-2 space-y-1">
                    {tasks.map((task: any, idx: number) => {
                      const isLast = idx === tasks.length - 1;
                      return (
                        <div key={task.id} className="flex gap-1">
                          <div className="flex flex-col items-center pt-1 shrink-0 w-3">
                            <div className="w-px flex-1 bg-border" style={{ minHeight: '8px' }} />
                            <div className={`w-1.5 h-1.5 rounded-full border shrink-0 ${selectedTask?.id === task.id ? 'bg-primary border-primary' : 'bg-background border-muted-foreground/40'}`} />
                            {!isLast && <div className="w-px flex-1 bg-border" />}
                          </div>
                          <div
                            onClick={() => setSelectedTask(task)}
                            className={`flex-1 p-2 rounded-md cursor-pointer text-xs mb-0.5 ${selectedTask?.id === task.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
                          >
                            <div className="flex justify-between items-start gap-1 mb-0.5">
                              <span className="font-mono text-[10px] opacity-70 shrink-0">{task.id}</span>
                              <StatusBadge status={task.status} className="px-1.5 py-0 text-[10px] h-auto shrink-0" />
                            </div>
                            {task.name && (
                              <p className="text-[11px] line-clamp-2 leading-snug">{task.name}</p>
                            )}
                            {(task.assigned_agent || task.agent) && (
                              <span className="mt-0.5 text-[10px] opacity-60 block">[{task.assigned_agent || task.agent}]</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>

              {/* Task View (Logs / Info) */}
              <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                {selectedTask ? (
                  <Tabs key={taskKey} defaultValue="info" className="flex-1 flex flex-col overflow-hidden min-h-0">
                    <div className="px-4 border-b">
                      <TabsList className="bg-transparent h-10 p-0 gap-4">
                        <TabsTrigger value="info" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-1">
                          <Activity className="h-3 w-3 mr-2" /> Details
                        </TabsTrigger>
                        <TabsTrigger value="logs" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-1">
                          <Terminal className="h-3 w-3 mr-2" /> Logs
                        </TabsTrigger>
                      </TabsList>
                    </div>
                    <TabsContent value="info" className="flex-1 m-0 p-6 overflow-auto min-h-0">
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
                    <TabsContent value="logs" className="flex-1 m-0 p-0 overflow-hidden min-h-0 flex flex-col">
                      <div className="px-4 py-2 border-b bg-muted/10 flex items-center justify-between gap-2">
                        {streamStatusMeta && (
                          <span className={`inline-flex items-center gap-1 text-[11px] h-6 px-2 rounded-full border ${streamStatusMeta.badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${streamStatusMeta.dot}`} />
                            {streamStatusMeta.label}
                          </span>
                        )}
                        <div className="ml-auto">
                          <RefreshButton onClick={handleLogRefresh} isRefreshing={streamStatus === 'connecting'} />
                        </div>
                      </div>
                      <ScrollArea ref={logScrollAreaRef} className="h-full bg-zinc-950 text-zinc-300 font-mono text-[11px]">
                        {logs === '' ? (
                          <div className="p-4 text-muted-foreground">로그 수신 대기 중...</div>
                        ) : (
                          <pre className="whitespace-pre-wrap p-4">{logs}</pre>
                        )}
                      </ScrollArea>
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
