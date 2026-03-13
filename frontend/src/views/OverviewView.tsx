import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardList, Flag, PlusCircle } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { apiFetch } from '@/hooks/useApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshButton } from '@/components/shared/RefreshButton';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AgentPerformance, type AgentPerformanceHandle } from '@/components/shared/AgentPerformance';
import { StatusStackedBar } from '@/components/shared/StatusStackedBar';

type CounterType = 'requests' | 'plans' | 'debug' | 'ideation' | 'discussion' | 'explore' | 'designs';
type ActiveTab = 'all' | 'request' | 'plan';

type CounterStats = {
  total: number;
  active: number;
  archived: number;
};

type OverviewStats = {
  counters: Record<CounterType, CounterStats>;
  status_distribution: Record<string, number>;
  completion_rate: number;
};

type ActiveItem = {
  id: string;
  type: 'request' | 'plan' | string;
  title: string;
  status: string;
  last_event_at: string;
  blocked: boolean;
};

type ActiveItemsResponse = {
  items: ActiveItem[];
  next_cursor: string | null;
  has_more: boolean;
  as_of: string;
};

function normalizeCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function normalizeItemType(type: string | undefined): 'request' | 'plan' {
  return type?.toLowerCase() === 'plan' ? 'plan' : 'request';
}

function formatLastEvent(value: string): string {
  if (!value) return '업데이트 시각 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

export function OverviewView() {
  const { projectId, navigateTo } = useAppContext();
  const [statsLoading, setStatsLoading] = useState(true);
  const [activeLoading, setActiveLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [activeError, setActiveError] = useState<string | null>(null);
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [activeItems, setActiveItems] = useState<ActiveItem[]>([]);
  const [activeCursor, setActiveCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('all');
  const agentRef = useRef<AgentPerformanceHandle>(null);

  const fetchStats = useCallback(async () => {
    const data = await apiFetch<OverviewStats>('/api/stats', projectId);
    setStats(data);
    setStatsError(null);
  }, [projectId]);

  const fetchActiveItems = useCallback(async (cursor?: string | null) => {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    return apiFetch<ActiveItemsResponse>(`/api/overview/active-items${query}`, projectId);
  }, [projectId]);

  const loadStats = useCallback(async (isRefresh = false) => {
    if (!projectId) return;
    if (!isRefresh) setStatsLoading(true);

    try {
      await fetchStats();
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : '통계를 불러오지 못했습니다');
    } finally {
      if (!isRefresh) setStatsLoading(false);
    }
  }, [projectId, fetchStats]);

  const loadActiveItems = useCallback(async (isRefresh = false) => {
    if (!projectId) return;
    if (!isRefresh) setActiveLoading(true);

    try {
      const data = await fetchActiveItems();
      setActiveItems(Array.isArray(data.items) ? data.items : []);
      setActiveCursor(data.next_cursor ?? null);
      setHasMore(Boolean(data.has_more));
      setActiveError(null);
    } catch (err) {
      setActiveError(err instanceof Error ? err.message : '활성 항목을 불러오지 못했습니다');
      if (!isRefresh) {
        setActiveItems([]);
        setActiveCursor(null);
        setHasMore(false);
      }
    } finally {
      if (!isRefresh) setActiveLoading(false);
    }
  }, [projectId, fetchActiveItems]);

  const loadMoreActiveItems = useCallback(async () => {
    if (!projectId || !hasMore || !activeCursor || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const data = await fetchActiveItems(activeCursor);
      const nextItems = Array.isArray(data.items) ? data.items : [];
      setActiveItems((prev) => [...prev, ...nextItems]);
      setActiveCursor(data.next_cursor ?? null);
      setHasMore(Boolean(data.has_more));
      setActiveError(null);
    } catch (err) {
      setActiveError(err instanceof Error ? err.message : '추가 항목을 불러오지 못했습니다');
    } finally {
      setIsLoadingMore(false);
    }
  }, [projectId, hasMore, activeCursor, isLoadingMore, fetchActiveItems]);

  useEffect(() => {
    if (!projectId) {
      setStatsLoading(false);
      setActiveLoading(false);
      setStats(null);
      setActiveItems([]);
      setActiveCursor(null);
      setHasMore(false);
      return;
    }

    loadStats();
    loadActiveItems();
  }, [projectId, loadStats, loadActiveItems]);

  const handleRefresh = async () => {
    if (!projectId) return;
    setIsRefreshing(true);
    try {
      await Promise.all([
        loadStats(true),
        loadActiveItems(true),
        agentRef.current?.refresh(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const filteredActiveItems = useMemo(() => {
    if (activeTab === 'all') return activeItems;
    return activeItems.filter((item) => normalizeItemType(item.type) === activeTab);
  }, [activeItems, activeTab]);

  const topPriorityItem = activeItems[0];

  const blockedCount = useMemo(
    () => activeItems.reduce((count, item) => count + (item.blocked ? 1 : 0), 0),
    [activeItems],
  );

  const blockedCountLabel = activeLoading && activeItems.length === 0 ? '—' : String(blockedCount);

  const heroStats = useMemo(
    () => [
      {
        title: 'Active Requests',
        value: normalizeCount(stats?.counters?.requests?.active ?? 0),
      },
      {
        title: 'Active Plans',
        value: normalizeCount(stats?.counters?.plans?.active ?? 0),
      },
      {
        title: 'Blocked',
        value: blockedCountLabel,
      },
    ],
    [stats?.counters?.requests?.active, stats?.counters?.plans?.active, blockedCountLabel],
  );

  const isInitialLoading = statsLoading && activeLoading && !stats;

  const navigateToItem = useCallback((item: ActiveItem) => {
    const itemType = normalizeItemType(item.type);
    if (itemType === 'plan') {
      navigateTo('plans', item.id);
      return;
    }
    navigateTo('workflow', item.id);
  }, [navigateTo]);

  const handleContinueTopPriority = useCallback(() => {
    if (!topPriorityItem) return;
    navigateToItem(topPriorityItem);
  }, [topPriorityItem, navigateToItem]);

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        프로젝트를 선택하세요
      </div>
    );
  }

  if (isInitialLoading) {
    return (
      <div className="h-full overflow-auto bg-[#F8FAFC] p-6 dark:bg-background">
        <div className="space-y-4">
          <Skeleton className="h-10 w-40" />
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
          <Skeleton className="h-[340px]" />
          <Skeleton className="h-[180px]" />
          <Skeleton className="h-[260px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-[#F8FAFC] p-6 dark:bg-background">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-foreground">Overview</h1>
            <p className="text-sm text-slate-500 dark:text-muted-foreground">실시간 프로젝트 요약</p>
          </div>
          <RefreshButton onClick={handleRefresh} isRefreshing={isRefreshing} />
        </div>

        {(statsError || activeError) && (
          <Card className="bg-white dark:bg-card">
            <CardContent className="space-y-1 py-4 text-sm text-red-500">
              {statsError && <p>{statsError}</p>}
              {activeError && <p>{activeError}</p>}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          {heroStats.map((item) => (
            <Card key={item.title} className="bg-white dark:bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500 dark:text-muted-foreground">
                  {item.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold tracking-tight text-slate-900 dark:text-foreground">
                  {item.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card className="bg-white dark:bg-card">
            <CardHeader className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">Active Items</CardTitle>
                <span className="text-xs text-muted-foreground">{filteredActiveItems.length} items</span>
              </div>
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ActiveTab)}>
                <TabsList className="h-10 bg-slate-100 dark:bg-muted">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="request">Requests</TabsTrigger>
                  <TabsTrigger value="plan">Plans</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeLoading && activeItems.length === 0 ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : filteredActiveItems.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-border dark:text-muted-foreground">
                  표시할 활성 항목이 없습니다.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredActiveItems.map((item) => {
                    const itemType = normalizeItemType(item.type);
                    return (
                      <button
                        type="button"
                        key={`${item.id}-${itemType}`}
                        onClick={() => navigateToItem(item)}
                        className="w-full rounded-xl border border-slate-200 p-4 text-left transition-colors hover:bg-slate-50 dark:border-border dark:hover:bg-muted/60"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-slate-900 dark:text-foreground">{item.title}</p>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 font-medium text-blue-700 dark:border-blue-900/50 dark:bg-blue-900/30 dark:text-blue-200">
                                {itemType === 'plan' ? 'Plan' : 'Request'}
                              </span>
                              <StatusBadge status={item.status} className="text-[11px]" />
                              {item.blocked && (
                                <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:border-red-900/50 dark:bg-red-900/30 dark:text-red-200">
                                  Blocked
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="shrink-0 text-xs text-muted-foreground">{formatLastEvent(item.last_event_at)}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {hasMore && (
                <div className="pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={loadMoreActiveItems}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore ? '불러오는 중...' : '더보기'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-card">
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                type="button"
                variant="default"
                className="w-full justify-start gap-2"
                onClick={handleContinueTopPriority}
                disabled={!topPriorityItem}
              >
                <ClipboardList className="h-4 w-4" />
                Continue Top Priority
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => navigateTo('workflow')}
              >
                <Flag className="h-4 w-4" />
                Unblock Now
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => navigateTo('workflow')}
              >
                <PlusCircle className="h-4 w-4" />
                New Request
              </Button>
              <p className="text-xs text-muted-foreground">
                새 요청 생성은 Workflow에서 `mst:request` 명령으로 시작합니다.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-white dark:bg-card">
          <CardHeader>
            <CardTitle className="text-base">Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusStackedBar distribution={stats?.status_distribution ?? {}} />
          </CardContent>
        </Card>

        <AgentPerformance ref={agentRef} onRefresh={() => loadStats(true)} />
      </div>
    </div>
  );
}
