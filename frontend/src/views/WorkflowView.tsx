import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppContext } from '@/context/AppContext';
import { apiFetch } from '@/hooks/useApi';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Terminal, Activity, GitBranch, ClipboardList, ArrowRight, Image as ImageIcon } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer';
import { SessionCard } from '@/components/shared/SessionCard';
import { RefreshButton } from '@/components/shared/RefreshButton';
import { EditModeToolbar } from '@/components/EditModeToolbar';
import { useResizableSidebar } from '@/hooks/useResizableSidebar';
import { ResizableHandle } from '@/components/shared/ResizableHandle';
import { ListFilter, type FilterOption } from '@/components/shared/ListFilter';

type LogStreamStatus = 'idle' | 'connecting' | 'live' | 'ended' | 'error';

interface ReviewSummary {
  iteration: number;
  status: "reviewing" | "gap_fixing" | "passed" | "limit_reached";
}

interface BrowserTestSummary {
  pass?: number;
  fail?: number;
  skip?: number;
}

interface BrowserTestResult {
  ac_id?: string;
  status?: string;
  reason?: string;
  screenshot?: string;
}

interface BrowserTestItem {
  id: string;
  rv_id: string;
  created_at: string | null;
  tool?: string;
  summary?: BrowserTestSummary;
  results?: BrowserTestResult[];
  screenshots: string[];
  screenshot_urls: string[];
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function getBrowserResultStatusClass(status: string): string {
  const upper = status.toUpperCase();
  if (upper === 'PASS') return 'bg-green-500 hover:bg-green-600 text-white border-none';
  if (upper === 'FAIL') return 'bg-red-500 hover:bg-red-600 text-white border-none';
  if (upper === 'SKIP') return 'text-amber-600 border-amber-400 dark:text-amber-400 dark:border-amber-500';
  return '';
}

function resolveBrowserScreenshotUrl(
  browserTest: BrowserTestItem,
  screenshotPath: string | undefined,
): string | null {
  if (!screenshotPath) return null;
  const normalized = screenshotPath.replace(/^screenshots[\\/]/, '');
  const directIndex = browserTest.screenshots.findIndex((name) =>
    name === normalized || name === screenshotPath
  );
  if (directIndex >= 0 && browserTest.screenshot_urls[directIndex]) {
    return browserTest.screenshot_urls[directIndex];
  }
  const encoded = encodeURIComponent(normalized);
  return browserTest.screenshot_urls.find((url) => url.endsWith(`/${encoded}`)) ?? null;
}

function getReviewBadge(summary: ReviewSummary | null | undefined): string | undefined {
  if (!summary) return undefined;
  if (summary.status === "reviewing" && summary.iteration >= 2)
    return `🔍 ${summary.iteration}회차 리뷰 중`;
  if (summary.status === "gap_fixing")
    return `🔄 갭 수정 중 (${summary.iteration}회차)`;
  if (summary.status === "limit_reached")
    return "⚠️ 리뷰 한계 도달";
  return undefined;
}

export function WorkflowView() {
  const { projectId, lastSseEvent, navigateTo } = useAppContext();
  const { reqId, taskId: paramTaskId } = useParams();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<any[]>([]);
  const [selectedReq, setSelectedReq] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<string>('');
  const [streamStatus, setStreamStatus] = useState<LogStreamStatus>('idle');
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<any>(null);
  const [browserTests, setBrowserTests] = useState<BrowserTestItem[]>([]);
  const [browserTestsLoading, setBrowserTestsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [traceContent, setTraceContent] = useState<string | null>(null);
  const logScrollAreaRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortedByUserRef = useRef(false);
  const retryCountRef = useRef(0);
  const lastEventIdRef = useRef<string | null>(null);
  const isAtBottomRef = useRef(true);

  const { sidebarWidth, isResizing, startResizing, sidebarRef } = useResizableSidebar({
    defaultWidth: 300,
    minWidth: 250,
    maxWidth: 500,
    storageKey: 'workflow-sidebar-width',
  });

  const [searchValue, setSearchValue] = useState('');
  const [filterValue, setFilterValue] = useState('all');
  const [sortValue, setSortValue] = useState('newest');

  const statusFilterOptions: FilterOption[] = [
    { value: 'all', label: 'All Status' },
    { value: 'open', label: 'Open' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'done', label: 'Done' },
    { value: 'failed', label: 'Failed' },
  ];

  const sortOptions: FilterOption[] = [
    { value: 'newest', label: 'Newest First' },
    { value: 'oldest', label: 'Oldest First' },
  ];

  const filteredRequests = useMemo(() => {
    let result = [...requests];

    // text search by title or ID
    if (searchValue.trim()) {
      const query = searchValue.trim().toLowerCase();
      result = result.filter(
        (req) =>
          req.id?.toLowerCase().includes(query) ||
          req.title?.toLowerCase().includes(query)
      );
    }

    // status filter
    if (filterValue && filterValue !== 'all') {
      result = result.filter((req) => req.status === filterValue);
    }

    // sort
    if (sortValue === 'oldest') {
      result.sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
    } else {
      result.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
    }

    return result;
  }, [requests, searchValue, filterValue, sortValue]);

  const groupedBrowserTests = useMemo(() => {
    const grouped = new Map<string, BrowserTestItem[]>();
    for (const browserTest of browserTests) {
      const key = browserTest.rv_id || 'UNKNOWN';
      const items = grouped.get(key);
      if (items) {
        items.push(browserTest);
      } else {
        grouped.set(key, [browserTest]);
      }
    }
    return Array.from(grouped.entries()).map(([rvId, items]) => ({ rvId, items }));
  }, [browserTests]);

  const fetchRequests = useCallback(async () => {
    try {
      const data = await apiFetch<any[]>('/api/requests', projectId);
      setRequests(data);
      
    } catch (err) {
      console.error('Failed to fetch requests:', err);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchRequests().finally(() => setLoading(false));
  }, [projectId]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const data = await apiFetch<any[]>('/api/requests', projectId);
      setRequests(data);
      if (selectedReq) {
        const updatedReq = data.find(req => req.id === selectedReq.id) ?? selectedReq;
        setSelectedReq(updatedReq);
        const browserTestsData = await apiFetch<BrowserTestItem[]>(
          `/api/requests/${updatedReq.id}/browser-tests`,
          projectId
        );
        setBrowserTests(browserTestsData);
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
    if (!lastSseEvent || !projectId) return;
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
  }, [lastSseEvent, projectId, selectedReq?.id, selectedTask?.id]);

  useEffect(() => {
    if (!selectedReq || !projectId) {
      setTasks([]);
      setSelectedTask(null);
      return;
    }
    apiFetch<any[]>(`/api/requests/${selectedReq.id}/tasks`, projectId)
      .then(data => {
        setTasks(data);
        if (data.length > 0) {
          if (paramTaskId) {
            const foundTask = data.find((t: any) => t.id === paramTaskId);
            setSelectedTask(foundTask || data[data.length - 1]);
          } else {
            setSelectedTask(data[data.length - 1]);
          }
        } else {
          setSelectedTask(null);
        }
      })
      .catch(() => setTasks([]));
  }, [selectedReq?.id, projectId]);

  useEffect(() => {
    if (!selectedReq || !projectId) {
      setBrowserTests([]);
      setBrowserTestsLoading(false);
      return;
    }

    setBrowserTestsLoading(true);
    apiFetch<BrowserTestItem[]>(`/api/requests/${selectedReq.id}/browser-tests`, projectId)
      .then((data) => setBrowserTests(data))
      .catch((err) => {
        console.error('Failed to fetch browser tests:', err);
        setBrowserTests([]);
      })
      .finally(() => setBrowserTestsLoading(false));
  }, [selectedReq?.id, projectId]);

  // URL의 paramTaskId 변경 시 이미 로드된 tasks에서 선택
  useEffect(() => {
    if (!paramTaskId || tasks.length === 0) return;
    const foundTask = tasks.find((t: any) => t.id === paramTaskId);
    if (foundTask) {
      setSelectedTask(foundTask);
    }
  }, [paramTaskId, tasks]);

  const taskKey = selectedTask?.id ?? null;

  useEffect(() => {
    if (!selectedReq || !selectedTask) {
      return;
    }
    if (selectedReq && selectedTask) {
      lastEventIdRef.current = null;
      startLogStream(selectedReq.id, selectedTask.id);
    }
    return () => stopLogStream();
  }, [selectedReq?.id, selectedTask?.id]);

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
    if (requests.length === 0) return;
    if (reqId) {
      const target = requests.find((req) => req.id === reqId);
      setSelectedReq(target || requests[0]);
    } else {
      setSelectedReq(requests[0]);
    }
  }, [reqId, requests]);

  useEffect(() => {
    if (!selectedReq || !selectedTask || !projectId) {
      setSelectedTaskDetail(null);
      return;
    }
    setTraceContent(null);
    apiFetch<any>(`/api/requests/${selectedReq.id}/tasks/${selectedTask.id}`, projectId)
      .then(data => setSelectedTaskDetail(data))
      .catch(() => setSelectedTaskDetail(null));
  }, [selectedReq?.id, selectedTask?.id, projectId]);

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
    if (isBackingUp) return;
    setIsBackingUp(true);
    try {
      const resolvedPath = projectId
        ? `/api/projects/${projectId}/manage/backup`
        : '/api/manage/backup';
      const response = await fetch(resolvedPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (!response.ok) {
        let errorMessage = `백업 실패: ${response.status}`;
        try {
          const errorBody = await response.json() as { error?: string; detail?: string };
          if (errorBody.error) {
            errorMessage = errorBody.detail
              ? `백업 실패: ${errorBody.error} (${errorBody.detail})`
              : `백업 실패: ${errorBody.error}`;
          }
        } catch {
          // ignore non-JSON error body
        }
        throw new Error(errorMessage);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gran-maestro-backup-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('백업 실패:', err);
      alert(err instanceof Error ? err.message : '백업 실패');
    } finally {
      setIsBackingUp(false);
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

  function worktreeStateColor(state: string): string {
    if (state === 'active') return 'bg-green-100 text-green-700';
    if (state === 'merged') return 'bg-blue-100 text-blue-700';
    if (state === 'stale' || state === 'conflict' || state === 'error') return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-600';
  }

  async function loadTrace(filename: string) {
    if (!selectedReq || !selectedTask || !projectId) return;
    try {
      const response = await fetch(
        `/api/projects/${projectId}/requests/${selectedReq.id}/tasks/${selectedTask.id}/traces/${filename}`
      );
      if (!response.ok) throw new Error('Failed to load trace');
      const text = await response.text();
      setTraceContent(text);
    } catch (err) {
      console.error('Failed to load trace:', err);
      setTraceContent('트레이스 파일을 불러오지 못했습니다.');
    }
  }

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
    <div className="flex h-full overflow-hidden">
      {/* REQ List */}
      <div ref={sidebarRef} style={{ width: sidebarWidth }} className="border-r flex flex-col min-h-0 shrink-0">
        <div className="p-4 border-b bg-muted/30 flex justify-between items-center">
          <h2 className="font-semibold">Requests</h2>
          <div className="flex items-center gap-2">
            <EditModeToolbar
              isEditMode={isEditMode}
              selectedIds={selectedIds}
              itemType="request"
              onToggleEditMode={() => { setIsEditMode(v => !v); setSelectedIds([]); }}
              onStatusChange={handleStatusChange}
              isBackingUp={isBackingUp}
              onBackup={handleBackup}
              onCancel={() => { setIsEditMode(false); setSelectedIds([]); }}
            />
            <RefreshButton onClick={handleRefresh} isRefreshing={isRefreshing} />
          </div>
        </div>
        <ListFilter
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          searchPlaceholder="Search by title or ID..."
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
            {filteredRequests.map((req) => (
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
                    reviewBadge={getReviewBadge(req.review_summary)}
                    isSelected={selectedReq?.id === req.id}
                    onClick={() => navigate('/workflow/' + req.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      <ResizableHandle isResizing={isResizing} onMouseDown={startResizing} />

      {/* REQ Detail & Tasks */}
      <div className="flex-1 flex flex-col bg-card overflow-hidden min-h-0">
        {selectedReq ? (
          <>
            <div className="p-4 border-b bg-muted/10 flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <h2 className="font-bold text-lg whitespace-nowrap">{selectedReq.id}</h2>
                    <span className="text-muted-foreground text-sm truncate max-w-md" title={selectedReq.title || '제목 없음'}>
                      {selectedReq.title || '제목 없음'}
                    </span>
                    {selectedReq.type && <Badge variant="outline" className="whitespace-nowrap">{selectedReq.type}</Badge>}
                    {selectedReq?.linked_plan && (
                      <button
                        type="button"
                        onClick={() => navigateTo('plans', selectedReq.linked_plan)}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-muted hover:bg-accent transition-colors font-mono whitespace-nowrap"
                      >
                        <ClipboardList className="h-3 w-3" />
                        {selectedReq.linked_plan}
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <StatusBadge status={selectedReq.status} />
                </div>
              </div>
              
              {/* Phase Stepper */}
              {(() => {
                const phase = selectedReq.current_phase ?? selectedReq.phase;
                if (typeof phase !== 'number' || phase < 1 || phase > 5) return null;
                const phases = ["분석", "구현", "리뷰", "피드백", "완료"];
                return (
                  <div className="flex items-center gap-2 mt-2">
                    {phases.map((name, i) => {
                      const stepNumber = i + 1;
                      const status = stepNumber < phase ? 'completed' : stepNumber === phase ? 'current' : 'upcoming';
                      
                      return (
                        <div key={name} className="flex items-center">
                          <div className={`flex items-center justify-center text-[10px] font-bold px-2 py-1 rounded-full border ${
                            status === 'completed' ? 'bg-green-100 text-green-700 border-green-200' :
                            status === 'current' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                            'bg-gray-100 text-gray-400 border-gray-200'
                          }`}>
                            {status === 'completed' ? '✓ ' : ''}{name}
                          </div>
                          {i < phases.length - 1 && (
                            <div className={`w-4 h-px mx-1 ${stepNumber < phase ? 'bg-green-200' : 'bg-gray-200'}`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
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
                            onClick={() => navigate('/workflow/' + selectedReq.id + '/tasks/' + task.id)}
                            className={`flex-1 p-2 rounded-md cursor-pointer text-xs mb-0.5 ${selectedTask?.id === task.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
                          >
                            <div className="flex justify-between items-start gap-1 mb-0.5">
                              <span className="font-mono text-[10px] opacity-70 shrink-0">{task.id}</span>
                              <StatusBadge status={task.status} className="px-1.5 py-0 text-[10px] h-auto shrink-0" />
                            </div>
                            {task.name && (
                              <p className="text-[11px] line-clamp-2 leading-snug">{task.name}</p>
                            )}
                            {(() => {
                              const coversAc = selectedReq?.tasks?.find((t: any) => t.id === task.id)?.covers_ac || task.covers_ac;
                              if (!Array.isArray(coversAc) || coversAc.length === 0) return null;
                              return (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {coversAc.map((acId: string) => (
                                    <span key={acId} className="px-1 py-0.5 rounded text-[9px] bg-muted border text-muted-foreground font-mono">
                                      {acId}
                                    </span>
                                  ))}
                                </div>
                              );
                            })()}
                            {(task.assigned_agent || task.agent) && (
                              <span className="mt-1 text-[10px] opacity-60 block">[{task.assigned_agent || task.agent}]</span>
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
                        <TabsTrigger value="traces" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-1">
                          <Activity className="h-3 w-3 mr-2" /> Traces
                        </TabsTrigger>
                        <TabsTrigger value="browser-tests" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-1">
                          <ImageIcon className="h-3 w-3 mr-2" /> Browser Tests
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
                        {selectedReq?.dependencies && (
                          (selectedReq.dependencies.blockedBy?.length > 0 || selectedReq.dependencies.blocks?.length > 0) && (
                            <div className="mb-4 p-3 bg-muted/30 border rounded-md">
                              <h3 className="text-xs font-bold mb-2 text-muted-foreground uppercase">Dependencies</h3>
                              <div className="space-y-1">
                                {selectedReq.dependencies.blockedBy?.map((depId: string) => (
                                  <div key={`blocked-by-${depId}`} className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">선행:</span>
                                    <button
                                      type="button"
                                      onClick={() => navigate('/workflow/' + depId)}
                                      className="text-xs font-mono text-primary hover:underline"
                                    >
                                      {depId}
                                    </button>
                                  </div>
                                ))}
                                {selectedReq.dependencies.blocks?.map((depId: string) => (
                                  <div key={`blocks-${depId}`} className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">후행:</span>
                                    <button
                                      type="button"
                                      onClick={() => navigate('/workflow/' + depId)}
                                      className="text-xs font-mono text-primary hover:underline"
                                    >
                                      {depId}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
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
                            {selectedTask.duration != null && (
                              <>
                                <div className="text-muted-foreground">Duration:</div>
                                <div>{Math.floor(selectedTask.duration / 60000)}m {Math.floor((selectedTask.duration % 60000) / 1000)}s</div>
                              </>
                            )}
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
                        {selectedTaskDetail?.worktree && (
                          <div className="mt-4">
                            <h3 className="text-sm font-medium text-gray-600 mb-1">Worktree</h3>
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${worktreeStateColor(selectedTaskDetail.worktree.state)}`}>
                                {selectedTaskDetail.worktree.state}
                              </span>
                              {selectedTaskDetail.worktree.branch && (
                                <span className="text-xs font-mono text-gray-600">{selectedTaskDetail.worktree.branch}</span>
                              )}
                            </div>
                          </div>
                        )}
                        {(() => {
                          const retryCount =
                            selectedReq?.tasks?.find((t: any) => t.id === selectedTask?.id)?.retry_count ??
                            selectedTaskDetail?.status?.retry_count ??
                            0;
                          return retryCount > 0 ? (
                            <div className="mt-4">
                              <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-700">
                                재시도 {retryCount}회
                              </span>
                            </div>
                          ) : null;
                        })()}
                        {selectedReq?.linked_design && (
                          <div className="mt-4">
                            <h3 className="text-sm font-medium text-gray-600 mb-1">연결된 Design</h3>
                            <button
                              type="button"
                              onClick={() => navigateTo('designs', selectedReq.linked_design)}
                              className="text-blue-600 hover:underline text-sm"
                            >
                              {selectedReq.linked_design} →
                            </button>
                          </div>
                        )}
                        {(() => {
                          const iterations = selectedReq?.review_iterations;
                          if (!Array.isArray(iterations) || iterations.length === 0) return null;
                          const sorted = [...iterations].reverse();
                          return (
                            <div className="mt-6 border-t pt-4">
                              <h3 className="text-sm font-bold mb-3">Review Iterations</h3>
                              <div className="space-y-3">
                                {sorted.map((it: any, i: number) => (
                                  <div key={it.rv_id || i} className="border rounded-md p-3 text-xs bg-muted/5">
                                    <div className="flex justify-between items-center mb-2">
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono font-bold text-primary">{it.rv_id}</span>
                                        <span className="text-muted-foreground">{it.status}</span>
                                      </div>
                                      <div className="text-muted-foreground">
                                        {formatTimestamp(it.created_at)}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Badge variant="outline" className="bg-background">
                                        Gaps: {it.gaps_found ?? 0}
                                      </Badge>
                                      {it.review_issues_summary && (
                                        <>
                                          {it.review_issues_summary.critical > 0 && (
                                            <Badge variant="destructive" className="bg-red-100 text-red-700 hover:bg-red-100">
                                              CRITICAL {it.review_issues_summary.critical}
                                            </Badge>
                                          )}
                                          {it.review_issues_summary.major > 0 && (
                                            <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-200">
                                              MAJOR {it.review_issues_summary.major}
                                            </Badge>
                                          )}
                                          {it.review_issues_summary.minor > 0 && (
                                            <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200">
                                              MINOR {it.review_issues_summary.minor}
                                            </Badge>
                                          )}
                                        </>
                                      )}
                                    </div>
                                    {it.review_issues_summary?.auto_fixed?.length > 0 && (
                                      <details className="mt-2 group">
                                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground list-none flex items-center gap-1">
                                          <span className="group-open:rotate-90 transition-transform">▶</span>
                                          Auto Fixed ({it.review_issues_summary.auto_fixed.length})
                                        </summary>
                                        <div className="mt-1 pl-4 space-y-1">
                                          {it.review_issues_summary.auto_fixed.map((fix: any, idx: number) => (
                                            <div key={idx} className="flex gap-2 items-start bg-background p-1.5 rounded border">
                                              <span className={`px-1 py-0.5 rounded text-[9px] font-bold ${
                                                fix.severity === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                                                fix.severity === 'MAJOR' ? 'bg-orange-100 text-orange-700' :
                                                'bg-blue-100 text-blue-700'
                                              }`}>
                                                {fix.severity}
                                              </span>
                                              <span className="flex-1">{fix.description}</span>
                                              {fix.task_id && <span className="font-mono text-[9px] text-muted-foreground shrink-0">{fix.task_id}</span>}
                                            </div>
                                          ))}
                                        </div>
                                      </details>
                                    )}
                                    {it.review_issues_summary?.skipped?.length > 0 && (
                                      <details className="mt-1 group">
                                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground list-none flex items-center gap-1">
                                          <span className="group-open:rotate-90 transition-transform">▶</span>
                                          Skipped ({it.review_issues_summary.skipped.length})
                                        </summary>
                                        <div className="mt-1 pl-4 space-y-1">
                                          {it.review_issues_summary.skipped.map((skip: any, idx: number) => (
                                            <div key={idx} className="flex gap-2 items-start bg-background p-1.5 rounded border">
                                              <span className={`px-1 py-0.5 rounded text-[9px] font-bold ${
                                                skip.severity === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                                                skip.severity === 'MAJOR' ? 'bg-orange-100 text-orange-700' :
                                                'bg-blue-100 text-blue-700'
                                              }`}>
                                                {skip.severity}
                                              </span>
                                              <span className="flex-1">{skip.description}</span>
                                              {skip.reason && <span className="text-[10px] text-muted-foreground italic block mt-0.5">사유: {skip.reason}</span>}
                                            </div>
                                          ))}
                                        </div>
                                      </details>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </TabsContent>
                    <TabsContent value="logs" className="flex-1 m-0 p-0 overflow-hidden min-h-0">
                      <div className="h-full flex flex-col">
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
                      </div>
                    </TabsContent>
                    <TabsContent value="traces" className="flex-1 m-0 p-4 overflow-auto min-h-0">
                      <div>
                        {!selectedTaskDetail?.traces || selectedTaskDetail.traces.length === 0 ? (
                          <p className="text-gray-500 text-sm">트레이스 없음</p>
                        ) : (
                          <div className="space-y-1">
                            {selectedTaskDetail.traces.map((filename: string) => (
                              <div
                                key={filename}
                                className="cursor-pointer hover:bg-gray-100 p-2 rounded text-xs font-mono"
                                onClick={() => loadTrace(filename)}
                              >
                                {filename}
                              </div>
                            ))}
                          </div>
                        )}
                        {traceContent && (
                          <pre className="mt-4 text-xs bg-gray-50 p-3 rounded overflow-auto whitespace-pre-wrap">{traceContent}</pre>
                        )}
                      </div>
                    </TabsContent>
                    <TabsContent value="browser-tests" className="flex-1 m-0 p-4 overflow-auto min-h-0">
                      {browserTestsLoading ? (
                        <div className="space-y-3">
                          <Skeleton className="h-24 w-full" />
                          <Skeleton className="h-24 w-full" />
                        </div>
                      ) : browserTests.length === 0 ? (
                        <EmptyState
                          icon={<ImageIcon className="h-8 w-8" />}
                          title="브라우저 테스트가 실행되지 않았습니다"
                          description="review 단계에서 browser-test AC가 실행되면 결과가 여기에 표시됩니다"
                        />
                      ) : (
                        <div className="space-y-4">
                          {groupedBrowserTests.map(({ rvId, items }) => (
                            <section key={rvId} className="border rounded-md bg-muted/10 overflow-hidden">
                              <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between gap-2">
                                <div className="text-xs font-mono font-semibold">{rvId}</div>
                                <div className="text-xs text-muted-foreground">
                                  {formatTimestamp(items[0]?.created_at)}
                                </div>
                              </div>
                              <div className="p-4 space-y-4">
                                {items.map((browserTest) => (
                                  <article key={browserTest.id} className="border rounded-md bg-background p-3 space-y-3">
                                    <div className="flex flex-wrap items-center gap-2 text-xs">
                                      <span className="font-mono text-muted-foreground">{browserTest.id}</span>
                                      <Badge variant="outline">{browserTest.tool ?? 'unknown'}</Badge>
                                      <Badge variant="outline">PASS {browserTest.summary?.pass ?? 0}</Badge>
                                      <Badge variant="outline">FAIL {browserTest.summary?.fail ?? 0}</Badge>
                                      <Badge variant="outline">SKIP {browserTest.summary?.skip ?? 0}</Badge>
                                    </div>
                                    {!browserTest.results || browserTest.results.length === 0 ? (
                                      <p className="text-xs text-muted-foreground">표시할 AC 결과가 없습니다.</p>
                                    ) : (
                                      <div className="space-y-3">
                                        {browserTest.results.map((result, index) => {
                                          const acId = result.ac_id || `AC-${index + 1}`;
                                          const status = (result.status || 'UNKNOWN').toUpperCase();
                                          const screenshotUrl = resolveBrowserScreenshotUrl(browserTest, result.screenshot);
                                          return (
                                            <div key={`${browserTest.id}-${acId}-${index}`} className="border rounded-md p-3 space-y-2">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-xs font-mono">{acId}</span>
                                                <Badge variant="outline" className={getBrowserResultStatusClass(status)}>
                                                  {status}
                                                </Badge>
                                              </div>
                                              {screenshotUrl ? (
                                                <img
                                                  src={screenshotUrl}
                                                  alt={`${acId} screenshot`}
                                                  className="max-h-80 w-auto rounded border"
                                                  loading="lazy"
                                                />
                                              ) : (
                                                <p className="text-xs text-muted-foreground">스크린샷 없음</p>
                                              )}
                                              {result.reason && (
                                                <details className="rounded border bg-muted/20 p-2">
                                                  <summary className="text-xs cursor-pointer text-muted-foreground">
                                                    에러/사유 보기
                                                  </summary>
                                                  <pre className="mt-2 text-[11px] whitespace-pre-wrap">
                                                    {result.reason}
                                                  </pre>
                                                </details>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </article>
                                ))}
                              </div>
                            </section>
                          ))}
                        </div>
                      )}
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
