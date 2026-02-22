import { useState, useEffect } from 'react';
import { useAppContext } from '@/context/AppContext';
import { apiFetch } from '@/hooks/useApi';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer';
import { EmptyState } from '@/components/shared/EmptyState';
import { Badge } from '@/components/ui/badge';
import { ClipboardList } from 'lucide-react';

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
  const { token, projectId } = useAppContext();
  const [plans, setPlans] = useState<PlanMeta[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<PlanMeta | null>(null);
  const [planContent, setPlanContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    async function fetchPlans() {
      try {
        const data = await apiFetch<PlanMeta[]>('/api/plans', token, projectId);
        setPlans(data);
        if (data.length > 0 && !selectedPlan) {
          setSelectedPlan(data[0]);
        }
      } catch (err) {
        console.error('Failed to fetch plans:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchPlans();
  }, [token, projectId]);

  useEffect(() => {
    if (!selectedPlan || !projectId) {
      setPlanContent(null);
      return;
    }
    apiFetch<PlanDetail>(`/api/plans/${selectedPlan.id}`, token, projectId)
      .then(data => setPlanContent(data.content || null))
      .catch(() => setPlanContent(null));
  }, [selectedPlan?.id, token, projectId]);

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
        <div className="p-4 border-b bg-muted/30">
          <h2 className="font-semibold">Plans ({plans.length})</h2>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {plans.map((plan) => (
              <Card
                key={plan.id}
                className={`cursor-pointer transition-colors hover:bg-accent/50 ${selectedPlan?.id === plan.id ? 'border-primary ring-1 ring-primary' : ''}`}
                onClick={() => setSelectedPlan(plan)}
              >
                <CardContent className="p-3">
                  <div className="flex justify-between items-start mb-1">
                    <p className="text-sm font-semibold line-clamp-2 flex-1 mr-2">
                      {plan.title || plan.id}
                    </p>
                    <StatusBadge status={plan.status ?? ''} />
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="text-[10px] font-mono">{plan.id}</Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                    {(() => {
                      const reqs = plan.linked_requests || [];
                      if (reqs.length === 0) return null;
                      if (reqs.length === 1) return <span>🔗 {reqs[0]}</span>;
                      return <span>🔗 {reqs.length}개 요청</span>;
                    })()}
                    {(plan.linked_requests?.length ?? 0) > 0 && plan.created_at && <span>·</span>}
                    {plan.created_at && <span>{plan.created_at.slice(0, 10)}</span>}
                  </div>
                </CardContent>
              </Card>
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
