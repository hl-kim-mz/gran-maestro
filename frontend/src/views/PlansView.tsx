import { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '@/context/AppContext';
import { apiFetch } from '@/hooks/useApi';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer';
import { EmptyState } from '@/components/shared/EmptyState';
import { ClipboardList } from 'lucide-react';
import { SessionCard } from '@/components/shared/SessionCard';
import { RefreshButton } from '@/components/shared/RefreshButton';

interface PlanMeta {
  id: string;
  title?: string;
  status?: string;
  created_at?: string;
  linked_requests?: string[];
}

interface PlanDetail {
  content?: string;
}

export function PlansView() {
  const { token, projectId, lastSseEvent, navigateTo, pendingNavigation, clearPendingNavigation } = useAppContext();
  const [plans, setPlans] = useState<PlanMeta[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<PlanMeta | null>(null);
  const [planContent, setPlanContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchPlans = useCallback(async () => {
    try {
      const data = await apiFetch<PlanMeta[]>('/api/plans', token, projectId);
      setPlans(data);
      if (data.length > 0 && !selectedPlan) {
        setSelectedPlan(data[0]);
      }
    } catch (err) {
      console.error('Failed to fetch plans:', err);
    }
  }, [token, projectId]);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchPlans().finally(() => setLoading(false));
  }, [token, projectId]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchPlans();
    setIsRefreshing(false);
  };

  useEffect(() => {
    if (!lastSseEvent || !projectId) return;
    if (lastSseEvent.type !== 'plan_update') return;

    apiFetch<PlanMeta[]>('/api/plans', token, projectId)
      .then(data => {
        setPlans(data);
        if (selectedPlan) {
          const updated = data.find(plan => plan.id === selectedPlan.id);
          if (updated) {
            setSelectedPlan(updated);
          }
        }
      })
      .catch(err => console.error('SSE re-fetch plans failed:', err));

    if (selectedPlan) {
      const eventPlanId =
        (lastSseEvent as { planId?: string }).planId ??
        (lastSseEvent as { plan_id?: string }).plan_id;
      if (!eventPlanId || eventPlanId === selectedPlan.id) {
        apiFetch<PlanDetail>(`/api/plans/${selectedPlan.id}`, token, projectId)
          .then(data => setPlanContent(data.content || null))
          .catch(() => setPlanContent(null));
      }
    }
  }, [lastSseEvent, projectId, token, selectedPlan?.id]);

  useEffect(() => {
    if (!selectedPlan || !projectId) {
      setPlanContent(null);
      return;
    }
    apiFetch<PlanDetail>(`/api/plans/${selectedPlan.id}`, token, projectId)
      .then(data => setPlanContent(data.content || null))
      .catch(() => setPlanContent(null));
  }, [selectedPlan?.id, token, projectId]);

  useEffect(() => {
    if (pendingNavigation?.tab !== 'plans' || loading) return;

    if (pendingNavigation.selectedId) {
      const target = plans.find((plan) => plan.id === pendingNavigation.selectedId);
      if (target) {
        setSelectedPlan(target);
      }
    }
    clearPendingNavigation();
  }, [pendingNavigation, loading, clearPendingNavigation, plans]);

  if (!projectId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        프로젝트를 선택하세요
      </div>
    );
  }

  if (loading) {
    return (
      <div className="grid grid-cols-12 gap-6 h-full p-6">
        <div className="col-span-4 space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
        <div className="col-span-8">
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-0 h-full overflow-hidden">
      <div className="col-span-4 border-r flex flex-col min-h-0">
        <div className="p-4 border-b bg-muted/30 flex justify-between items-center">
          <h2 className="font-semibold">Plans ({plans.length})</h2>
          <RefreshButton onClick={handleRefresh} isRefreshing={isRefreshing} />
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {plans.map((plan) => (
              <SessionCard
                key={plan.id}
                id={plan.id}
                title={plan.title || plan.id}
                status={plan.status ?? ''}
                createdAt={plan.created_at}
                extraLinks={plan.linked_requests}
                onExtraLinkClick={(reqId) => navigateTo('workflow', reqId)}
                isSelected={selectedPlan?.id === plan.id}
                onClick={() => setSelectedPlan(plan)}
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="col-span-8 flex flex-col bg-card min-h-0">
        {selectedPlan ? (
          <>
            <div className="p-4 border-b flex justify-between items-center bg-muted/10">
              <div>
                <h2 className="font-bold text-lg">{selectedPlan.title || selectedPlan.id}</h2>
                <p className="text-xs text-muted-foreground">
                  {selectedPlan.created_at?.slice(0, 10)}
                </p>
              </div>
              <StatusBadge status={selectedPlan.status ?? ''} />
            </div>
            <ScrollArea className="flex-1">
              <div className="p-8">
                <MarkdownRenderer content={planContent || '# No Content'} />
              </div>
            </ScrollArea>
          </>
        ) : (
          <EmptyState
            icon={<ClipboardList className="h-8 w-8" />}
            title="플랜을 선택하세요"
            description="왼쪽 목록에서 플랜을 클릭하면 상세 내용을 볼 수 있어요"
          />
        )}
      </div>
    </div>
  );
}
