import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppContext } from '@/context/AppContext';
import { apiFetch } from '@/hooks/useApi';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { RefreshButton } from '@/components/shared/RefreshButton';
import { useResizableSidebar } from '@/hooks/useResizableSidebar';
import { ResizableHandle } from '@/components/shared/ResizableHandle';
import { ClipboardList } from 'lucide-react';
import { LifecycleTimeline } from '@/components/picks/LifecycleTimeline';

interface CaptureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CaptureMeta {
  id: string;
  status: 'pending' | 'selected' | 'consumed' | 'done' | 'cancelled' | 'archived' | string;
  created_at?: string;
  selector?: string | null;
  memo?: string | null;
  tags?: string[];
  url?: string;
  rect?: CaptureRect | null;
  screenshot_path?: string | null;
  screenshot_data?: string | null;
  html_snapshot?: string | null;
  linked_plan?: string | null;
  linked_request?: string | null;
  consumed_at?: string | null;
}

interface FilterOption {
  value: 'all' | 'pending' | 'selected' | 'consumed' | 'done' | 'cancelled';
  label: string;
}

const filterOptions: FilterOption[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'selected', label: 'Selected' },
  { value: 'consumed', label: 'Consumed' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
];

const MAX_SNIPPET_LENGTH = 500;

function formatRelativeTime(iso?: string): string {
  if (!iso) return 'N/A';

  const created = new Date(iso);
  if (Number.isNaN(created.getTime())) return iso;

  const diff = Date.now() - created.getTime();
  if (diff < 0) {
    return '방금 전';
  }

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < 60 * 1000) {
    return '방금 전';
  }
  if (diff < hour) {
    return `${Math.floor(diff / minute)}분 전`;
  }
  if (diff < day) {
    return `${Math.floor(diff / hour)}시간 전`;
  }
  return `${Math.floor(diff / day)}일 전`;
}

function formatCoordinates(rect?: CaptureRect | null): string {
  if (!rect) {
    return 'N/A';
  }

  return `X: ${rect.x}, Y: ${rect.y}, W: ${rect.width}, H: ${rect.height}`;
}

export function PicksView() {
  const { projectId, lastSseEvent, navigateTo } = useAppContext();
  const { captureId: paramCaptureId } = useParams();
  const navigate = useNavigate();

  const { sidebarWidth, isResizing, startResizing, sidebarRef } = useResizableSidebar({
    defaultWidth: 320,
    minWidth: 260,
    maxWidth: 640,
    storageKey: 'picks-sidebar-width',
  });

  const [captures, setCaptures] = useState<CaptureMeta[]>([]);
  const [selectedCapture, setSelectedCapture] = useState<CaptureMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filterValue, setFilterValue] = useState<FilterOption['value']>('all');
  const [isSnippetExpanded, setIsSnippetExpanded] = useState(false);
  const [screenshotError, setScreenshotError] = useState(false);

  const filteredCaptures = useMemo(() => {
    if (filterValue === 'all') {
      return captures.filter(
        (capture) => !['consumed', 'done', 'archived'].includes(capture.status),
      );
    }
    return captures.filter((capture) => capture.status === filterValue);
  }, [captures, filterValue]);

  const selectedCaptureIds = useMemo(() => {
    const selected = selectedIds.length > 0 ? selectedIds : selectedCapture ? [selectedCapture.id] : [];
    return selected;
  }, [selectedIds, selectedCapture]);

  const copyText = useMemo(() => {
    if (selectedCaptureIds.length === 0) {
      return '';
    }
    return `/mst:plan ${selectedCaptureIds.map((id) => `[${id}]`).join(' ')}`;
  }, [selectedCaptureIds]);

  const statusCounts = useMemo(() => {
    const base = {
      all: captures.length,
      pending: 0,
      selected: 0,
      consumed: 0,
      done: 0,
      cancelled: 0,
      archived: 0,
    };

    for (const capture of captures) {
      if (capture.status === 'pending') base.pending += 1;
      else if (capture.status === 'selected') base.selected += 1;
      else if (capture.status === 'consumed') base.consumed += 1;
      else if (capture.status === 'done') base.done += 1;
      else if (capture.status === 'cancelled') base.cancelled += 1;
      else if (capture.status === 'archived') base.archived += 1;
    }

    return base;
  }, [captures]);

  const fetchCaptures = useCallback(async () => {
    try {
      const data = await apiFetch<CaptureMeta[]>('/api/captures', projectId);
      setCaptures(data);
    } catch (err) {
      console.error('Failed to fetch captures:', err);
      setCaptures([]);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      setCaptures([]);
      setSelectedCapture(null);
      return;
    }

    setLoading(true);
    fetchCaptures().finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    if (!lastSseEvent || !projectId) return;
    if (lastSseEvent.type !== 'capture_update') return;

    fetchCaptures();
  }, [lastSseEvent, fetchCaptures, projectId]);

  useEffect(() => {
    if (captures.length === 0) {
      setSelectedCapture(null);
      return;
    }

    if (paramCaptureId) {
      const target = captures.find((capture) => capture.id === paramCaptureId);

      if (target) {
        const isVisibleInCurrentFilter = filteredCaptures.some(
          (capture) => capture.id === target.id,
        );

        if (!isVisibleInCurrentFilter) {
          if (target.status === 'consumed' && filterValue !== 'consumed') {
            setFilterValue('consumed');
            return;
          }
          if (target.status === 'done' && filterValue !== 'done') {
            setFilterValue('done');
            return;
          }
          if (target.status === 'archived' && filterValue !== 'all') {
            setFilterValue('all');
            return;
          }
        }

        setSelectedCapture(target);
        return;
      }

      setSelectedCapture(filteredCaptures[0] ?? null);
      return;
    }

    setSelectedCapture((prev) => {
      if (prev && filteredCaptures.some((capture) => capture.id === prev.id)) {
        return prev;
      }
      return filteredCaptures[0] ?? null;
    });
  }, [captures, filteredCaptures, filterValue, paramCaptureId]);

  useEffect(() => {
    const nextIds = new Set(captures.map((capture) => capture.id));
    setSelectedIds((prev) => prev.filter((id) => nextIds.has(id)));
  }, [captures]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchCaptures();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSelectionToggle = (captureId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) {
        return prev.includes(captureId) ? prev : [...prev, captureId];
      }
      return prev.filter((id) => id !== captureId);
    });
  };

  const handleCopy = async () => {
    if (selectedCaptureIds.length === 0) {
      alert('캡처를 먼저 선택하세요.');
      return;
    }

    if (!navigator.clipboard?.writeText) {
      alert('이 브라우저는 클립보드 API를 지원하지 않습니다.');
      return;
    }

    try {
      await navigator.clipboard.writeText(copyText);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
      alert('클립보드 복사에 실패했습니다.');
    }
  };

  const screenshotSrc = selectedCapture?.screenshot_data ?? selectedCapture?.screenshot_path;

  useEffect(() => {
    setScreenshotError(false);
    setIsSnippetExpanded(false);
  }, [selectedCapture?.id]);

  if (!projectId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        프로젝트를 선택하세요
      </div>
    );
  }

  if (loading) {
    return (
      <div className="grid grid-cols-12 gap-0 h-full p-6">
        <div className="col-span-4 space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
        <div className="col-span-8 space-y-4">
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    );
  }

  const selectedCaptureSnippet = selectedCapture?.html_snapshot ?? '';
  const shouldTruncateSnippet = selectedCaptureSnippet.length > MAX_SNIPPET_LENGTH;
  const displayedSnippet = isSnippetExpanded || !shouldTruncateSnippet
    ? selectedCaptureSnippet
    : selectedCaptureSnippet.slice(0, MAX_SNIPPET_LENGTH);

  return (
    <div className="flex h-full overflow-hidden">
      <div ref={sidebarRef} style={{ width: sidebarWidth }} className="border-r flex flex-col min-h-0 shrink-0">
        <div className="p-4 border-b bg-muted/30 flex justify-between items-center">
          <h2 className="font-semibold">Picks ({filteredCaptures.length})</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsSelectionMode((prev) => !prev);
                setSelectedIds([]);
              }}
              className="px-2 py-1 text-xs rounded-md border bg-background hover:bg-accent"
            >
              {isSelectionMode ? '선택 취소' : '선택 모드'}
            </button>
            <button
              type="button"
              onClick={handleCopy}
              disabled={selectedCaptureIds.length === 0}
              className="px-2 py-1 text-xs rounded-md border bg-background hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Copy Plan
            </button>
            <RefreshButton onClick={handleRefresh} isRefreshing={isRefreshing} />
          </div>
        </div>
        <div className="p-2 border-b bg-muted/10">
          <div className="flex gap-1.5 overflow-x-auto">
            {filterOptions.map((option) => {
              const isActive = filterValue === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilterValue(option.value)}
                  className={`px-2.5 py-1 text-[11px] rounded-full whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background border border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-1.5">
            {captures.length === 0 ? (
              <EmptyState
                icon={<ClipboardList className="h-8 w-8" />}
                title="캡처가 없습니다"
                description="캡처가 없습니다. Chrome Extension으로 UI 요소를 캡처하세요."
              />
            ) : filteredCaptures.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">해당 상태의 캡처가 없습니다.</div>
            ) : (
              filteredCaptures.map((capture) => (
                <div key={capture.id} className="flex items-start gap-2">
                  {isSelectionMode && (
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(capture.id)}
                      onChange={(e) => handleSelectionToggle(capture.id, e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-2 h-4 w-4"
                    />
                  )}
                  <div
                    className="flex-1"
                    onClick={() => navigate('/picks/' + capture.id)}
                  >
                    <Card
                      className={`cursor-pointer transition-colors hover:bg-accent/50 ${
                        selectedCapture?.id === capture.id ? 'ring-1 ring-primary' : ''
                      }`}
                    >
                      <CardContent className="p-2">
                        <div className="flex justify-between items-start gap-2 mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Badge variant="outline" className="text-[10px] font-mono">{capture.id}</Badge>
                            <StatusBadge status={capture.status} />
                          </div>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {formatRelativeTime(capture.created_at)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {capture.selector || capture.url || 'Selector 없음'}
                        </p>
                        {capture.memo && (
                          <p className="text-[11px] text-muted-foreground/90 mt-1 line-clamp-2">
                            {capture.memo}
                          </p>
                        )}
                        {capture.tags && capture.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {capture.tags.map((tag) => (
                              <Badge key={`${capture.id}-${tag}`} variant="secondary" className="text-[10px]">
                                #{tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      <ResizableHandle isResizing={isResizing} onMouseDown={startResizing} />

      <div className="flex-1 flex flex-col bg-card min-h-0 overflow-hidden">
        {selectedCapture ? (
          <>
            <div className="p-4 border-b flex justify-between items-center bg-muted/10">
              <div className="min-w-0">
                <h2 className="font-bold text-lg truncate">{selectedCapture.id}</h2>
                <p className="text-xs text-muted-foreground truncate">
                  {formatRelativeTime(selectedCapture.created_at)} · {selectedCapture.status}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedCapture.linked_plan && (
                  <button
                    type="button"
                    onClick={() => navigateTo('plans', selectedCapture.linked_plan!)}
                    className="text-xs px-2 py-1 rounded-md bg-muted hover:bg-accent transition-colors font-mono"
                  >
                    {selectedCapture.linked_plan}
                  </button>
                )}
                {selectedCapture.linked_request && (
                  <button
                    type="button"
                    onClick={() => navigateTo('workflow', selectedCapture.linked_request!)}
                    className="text-xs px-2 py-1 rounded-md bg-muted hover:bg-accent transition-colors font-mono"
                  >
                    {selectedCapture.linked_request}
                  </button>
                )}
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6">
                <section>
                  <h3 className="text-xs font-bold uppercase text-muted-foreground mb-2">CSS Selector</h3>
                  <pre className="text-xs bg-muted p-3 rounded-md overflow-auto whitespace-pre-wrap break-all">
                    {selectedCapture.selector || 'N/A'}
                  </pre>
                </section>

                <section>
                  <h3 className="text-xs font-bold uppercase text-muted-foreground mb-2">Coordinates</h3>
                  <p className="text-sm text-muted-foreground font-mono">
                    {formatCoordinates(selectedCapture.rect)}
                  </p>
                </section>

                <LifecycleTimeline capture={{
                  status: selectedCapture.status as 'pending' | 'selected' | 'consumed' | 'done' | 'cancelled' | 'archived',
                  linked_plan: selectedCapture.linked_plan ?? null,
                  linked_request: selectedCapture.linked_request ?? null,
                  created_at: selectedCapture.created_at ?? new Date().toISOString(),
                  consumed_at: selectedCapture.consumed_at ?? null,
                }} />

                <section>
                  <h3 className="text-xs font-bold uppercase text-muted-foreground mb-2">HTML Snippet</h3>
                  <pre className="text-xs bg-muted p-3 rounded-md overflow-auto whitespace-pre-wrap break-all max-h-[280px]">
                    {displayedSnippet || 'N/A'}
                  </pre>
                  {shouldTruncateSnippet && (
                    <button
                      type="button"
                      onClick={() => setIsSnippetExpanded((prev) => !prev)}
                      className="mt-2 text-xs text-primary hover:underline"
                    >
                      {isSnippetExpanded ? '접기' : '더보기'}
                    </button>
                  )}
                </section>

                <section>
                  <h3 className="text-xs font-bold uppercase text-muted-foreground mb-2">Screenshot</h3>
                  {screenshotSrc && !screenshotError ? (
                    <img
                      src={screenshotSrc}
                      alt={selectedCapture.id}
                      className="max-h-[340px] w-full object-contain bg-black/5 rounded-md border"
                      onError={() => setScreenshotError(true)}
                    />
                  ) : (
                    <div className="text-xs text-muted-foreground border rounded-md p-8 text-center">
                      스크린샷을 캡처하지 못했습니다
                    </div>
                  )}
                </section>

                <section>
                  <h3 className="text-xs font-bold uppercase text-muted-foreground mb-2">Summary</h3>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Linked Plan: {selectedCapture.linked_plan || '-'}</p>
                    <p>Linked Request: {selectedCapture.linked_request || '-'}</p>
                    <p>Memo: {selectedCapture.memo || '-'}</p>
                    <p>URL: {selectedCapture.url || '-'}</p>
                  </div>
                </section>
              </div>
            </ScrollArea>

            <div className="border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground mb-1">Capture Stats</p>
              <div className="flex flex-wrap gap-2">
                <span>Total: {statusCounts.all}</span>
                <span>Pending: {statusCounts.pending}</span>
                <span>Selected: {statusCounts.selected}</span>
                <span>Consumed: {statusCounts.consumed}</span>
                <span>Done: {statusCounts.done}</span>
                <span>Cancelled: {statusCounts.cancelled}</span>
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            icon={<ClipboardList className="h-8 w-8" />}
            title="캡처를 선택하세요"
            description="왼쪽 목록에서 캡처를 클릭하면 상세 정보를 확인할 수 있어요"
          />
        )}
      </div>
    </div>
  );
}
