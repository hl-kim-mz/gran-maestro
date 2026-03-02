import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { useAppContext } from '@/context/AppContext';
import { apiFetch } from '@/hooks/useApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshButton } from '@/components/shared/RefreshButton';
import { Skeleton } from '@/components/ui/skeleton';

type AgentStat = {
  agent: string;
  tasks_assigned: number;
  tasks_completed: number;
  tasks_failed: number;
  retry_total: number;
};

function getSuccessRate(assigned: number, completed: number): number {
  if (!Number.isFinite(assigned) || assigned <= 0) return 0;
  return Math.max(0, Math.min(1, completed / assigned));
}

export interface AgentPerformanceHandle {
  refresh: () => Promise<void>;
}

interface AgentPerformanceProps {
  onRefresh?: () => Promise<void>;
}

export const AgentPerformance = forwardRef<AgentPerformanceHandle, AgentPerformanceProps>(
  function AgentPerformance({ onRefresh }, ref) {
  const { projectId } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentStat[]>([]);

  const fetchAgents = useCallback(async () => {
    const data = await apiFetch<AgentStat[]>('/api/stats/agents', projectId);
    setAgents(Array.isArray(data) ? data : []);
    setError(null);
  }, [projectId]);

  const loadAgents = useCallback(async (isRefresh = false) => {
    if (!projectId) return;
    if (!isRefresh) {
      setLoading(true);
    }
    setError(null);

    try {
      await fetchAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : '에이전트 성과 데이터를 불러오지 못했습니다');
    } finally {
      if (!isRefresh) {
        setLoading(false);
      }
    }
  }, [projectId, fetchAgents]);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      setAgents([]);
      return;
    }
    loadAgents();
  }, [projectId, loadAgents]);

  useImperativeHandle(ref, () => ({
    refresh: () => loadAgents(true),
  }), [loadAgents]);

  const handleRefresh = async () => {
    if (!projectId) return;
    setIsRefreshing(true);
    try {
      await Promise.all([loadAgents(true), onRefresh?.().catch(() => {})]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '새로고침 실패');
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!projectId) return null;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>에이전트 성과</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>에이전트 성과</CardTitle>
        <RefreshButton onClick={handleRefresh} isRefreshing={isRefreshing} />
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <div className="text-sm text-red-500">{error}</div>}

        {agents.length === 0 ? (
          <div className="text-sm text-muted-foreground">에이전트 성과 데이터가 없습니다.</div>
        ) : (
          <div className="space-y-4">
            {agents.map((agent) => {
              const successRate = getSuccessRate(agent.tasks_assigned, agent.tasks_completed) * 100;
              return (
                <div key={agent.agent} className="rounded-md border border-border/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{agent.agent}</div>
                    <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
                      <span className="inline-flex items-center rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-600 dark:text-red-300">
                        실패 {agent.tasks_failed}
                      </span>
                      {agent.retry_total > 0 && (
                        <span className="inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                          재시도 {agent.retry_total}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 text-xs text-muted-foreground">
                    <span>할당 {agent.tasks_assigned}</span>
                    <span>완료 {agent.tasks_completed}</span>
                    <span>실패 {agent.tasks_failed}</span>
                  </div>
                  <div className="mt-2">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span>성공률</span>
                      <span className="font-medium">{successRate.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded bg-muted">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${successRate}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
  }
);
