import { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '@/context/AppContext';
import { apiFetch } from '@/hooks/useApi';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer';
import { EmptyState } from '@/components/shared/EmptyState';
import { ClipboardList, FileText, Palette } from 'lucide-react';
import { SessionCard } from '@/components/shared/SessionCard';
import { RefreshButton } from '@/components/shared/RefreshButton';
import { EditModeToolbar } from '@/components/EditModeToolbar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

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
  const { projectId, lastSseEvent, navigateTo, pendingNavigation, clearPendingNavigation } = useAppContext();
  const [plans, setPlans] = useState<PlanMeta[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<PlanMeta | null>(null);
  const [planContent, setPlanContent] = useState<string | null>(null);
  const [designContent, setDesignContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchPlans = useCallback(async () => {
    try {
      const data = await apiFetch<PlanMeta[]>('/api/plans', projectId);
      setPlans(data);
      setSelectedPlan(prev =>
        prev ? (data.find(plan => plan.id === prev.id) ?? data[0] ?? null) : (data[0] ?? null)
      );
    } catch (err) {
      console.error('Failed to fetch plans:', err);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchPlans().finally(() => setLoading(false));
  }, [projectId]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchPlans();
      if (selectedPlan && projectId) {
        const data = await apiFetch<PlanDetail>(`/api/plans/${selectedPlan.id}`, projectId);
        setPlanContent(data.content || null);
      }
    } catch (err) {
      console.error('Failed to refresh plans:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!lastSseEvent || !projectId) return;
    if (lastSseEvent.type !== 'plan_update') return;

    apiFetch<PlanMeta[]>('/api/plans', projectId)
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
        apiFetch<PlanDetail>(`/api/plans/${selectedPlan.id}`, projectId)
          .then(data => setPlanContent(data.content || null))
          .catch(() => setPlanContent(null));
      }
    }
  }, [lastSseEvent, projectId, selectedPlan?.id]);

  useEffect(() => {
    if (!selectedPlan || !projectId) {
      setPlanContent(null);
      setDesignContent(null);
      return;
    }
    apiFetch<PlanDetail>(`/api/plans/${selectedPlan.id}`, projectId)
      .then(data => setPlanContent(data.content || null))
      .catch(() => setPlanContent(null));
    apiFetch<{ exists: boolean; content: string | null }>(`/api/plans/${selectedPlan.id}/design`, projectId)
      .then(data => setDesignContent(data.exists ? data.content : null))
      .catch(() => setDesignContent(null));
  }, [selectedPlan?.id, projectId]);

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

  const handleStatusChange = async (targetStatus: string) => {
    try {
      await apiFetch('/api/manage/status', projectId, {
        method: 'PATCH',
        body: JSON.stringify({ ids: selectedIds, targetStatus }),
      });
      setIsEditMode(false);
      setSelectedIds([]);
      await fetchPlans();
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
          <div className="flex items-center gap-2">
            <EditModeToolbar
              isEditMode={isEditMode}
              selectedIds={selectedIds}
              itemType="plan"
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
            {plans.map((plan) => (
              <div key={plan.id} className="flex items-center">
                {isEditMode && (
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(plan.id)}
                    onChange={(e) => {
                      setSelectedIds(prev =>
                        e.target.checked ? [...prev, plan.id] : prev.filter(id => id !== plan.id)
                      );
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="mr-2 h-4 w-4"
                  />
                )}
                <div className="flex-1">
                  <SessionCard
                    id={plan.id}
                    title={plan.title || plan.id}
                    status={plan.status ?? ''}
                    createdAt={plan.created_at}
                    extraLinks={plan.linked_requests}
                    onExtraLinkClick={(reqId) => navigateTo('workflow', reqId)}
                    isSelected={selectedPlan?.id === plan.id}
                    onClick={() => setSelectedPlan(plan)}
                  />
                </div>
              </div>
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
            <Tabs defaultValue="overview" className="flex flex-col flex-1 overflow-hidden">
              <div className="px-4 border-b">
                <TabsList className="bg-transparent h-10 p-0 gap-4">
                  <TabsTrigger
                    value="overview"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1"
                  >
                    <FileText className="h-3 w-3 mr-2" />
                    Overview
                  </TabsTrigger>
                  {designContent && (
                    <TabsTrigger
                      value="design"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1"
                    >
                      <Palette className="h-3 w-3 mr-2" />
                      Design
                    </TabsTrigger>
                  )}
                </TabsList>
              </div>
              <TabsContent value="overview" className="flex-1 overflow-auto m-0">
                <ScrollArea className="h-full">
                  <div className="p-8">
                    {planContent ? (
                      <MarkdownRenderer content={planContent} />
                    ) : (
                      <div className="text-muted-foreground text-sm">plan.md 없음</div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
              {designContent && (
                <TabsContent value="design" className="flex-1 overflow-auto m-0">
                  <ScrollArea className="h-full">
                    <div className="p-8">
                      <MarkdownRenderer content={designContent} />
                    </div>
                  </ScrollArea>
                </TabsContent>
              )}
            </Tabs>
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
