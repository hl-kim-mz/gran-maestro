import { useState, useEffect, useCallback, useMemo } from 'react';
import { useResizableSidebar } from '@/hooks/useResizableSidebar';
import { ResizableHandle } from '@/components/shared/ResizableHandle';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppContext } from '@/context/AppContext';
import { apiFetch } from '@/hooks/useApi';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer';
import { EmptyState } from '@/components/shared/EmptyState';
import { ClipboardList, ExternalLink, FileText, GitBranch, Palette, ShieldAlert } from 'lucide-react';
import { SessionCard } from '@/components/shared/SessionCard';
import { RefreshButton } from '@/components/shared/RefreshButton';
import { EditModeToolbar } from '@/components/EditModeToolbar';
import { ListFilter, type FilterOption } from '@/components/shared/ListFilter';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { parseDesignSections } from '@/shared/designUtils';
import { PlanDiagramTab } from '@/components/PlanDiagramTab';

interface ReviewIssue {
  severity: "CRITICAL" | "MAJOR" | "MINOR";
  title: string;
  description: string;
}

interface RoleReviewResult {
  role: string;
  no_issues: boolean;
  issues: ReviewIssue[];
}

interface PlanMeta {
  id: string;
  title?: string;
  status?: string;
  created_at?: string;
  linked_requests?: string[];
  linked_designs?: string[];
  has_design?: boolean;
  linked_debug?: string | null;
  linked_ideation?: string | null;
  linked_discussion?: string | null;
}

interface PlanDetail {
  content?: string;
}

interface LinkedDesignDetail {
  id: string;
  screen_files?: string[];
}

interface ScreenContent {
  exists: boolean;
  content: string | null;
}

export function PlansView() {
  const { projectId, lastSseEvent, navigateTo } = useAppContext();
  const { planId } = useParams();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PlanMeta[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<PlanMeta | null>(null);
  const [planContent, setPlanContent] = useState<string | null>(null);
  const [designContent, setDesignContent] = useState<string | null>(null);
  const [designSections, setDesignSections] = useState<ReturnType<typeof parseDesignSections>>([]);
  const [linkedDesignScreenFiles, setLinkedDesignScreenFiles] = useState<string[]>([]);
  const [linkedDesignId, setLinkedDesignId] = useState<string | null>(null);
  const [selectedLinkedScreenFile, setSelectedLinkedScreenFile] = useState<string | null>(null);
  const [linkedScreenContent, setLinkedScreenContent] = useState<string | null>(null);
  const [reviewRoles, setReviewRoles] = useState<RoleReviewResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { sidebarWidth, isResizing, startResizing, sidebarRef } = useResizableSidebar({
    defaultWidth: 300,
    minWidth: 250,
    maxWidth: 600,
    storageKey: 'plans-sidebar-width',
  });

  const [searchValue, setSearchValue] = useState('');
  const [filterValue, setFilterValue] = useState('all');
  const [sortValue, setSortValue] = useState('newest');

  const statusFilterOptions: FilterOption[] = [
    { value: 'all', label: 'All Status' },
    { value: 'draft', label: 'Draft' },
    { value: 'approved', label: 'Approved' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'done', label: 'Done' },
  ];

  const sortOptions: FilterOption[] = [
    { value: 'newest', label: 'Newest First' },
    { value: 'oldest', label: 'Oldest First' },
  ];

  const filteredPlans = useMemo(() => {
    let result = [...plans];

    // text search
    if (searchValue.trim()) {
      const query = searchValue.trim().toLowerCase();
      result = result.filter(
        (p) =>
          p.id?.toLowerCase().includes(query) ||
          p.title?.toLowerCase().includes(query)
      );
    }

    // status filter
    if (filterValue && filterValue !== 'all') {
      result = result.filter((p) => p.status === filterValue);
    }

    // sort
    if (sortValue === 'oldest') {
      result.sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
    } else {
      result.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
    }

    return result;
  }, [plans, searchValue, filterValue, sortValue]);

  const fetchPlans = useCallback(async () => {
    try {
      const data = await apiFetch<PlanMeta[]>('/api/plans', projectId);
      setPlans(data);
      
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
        const [planData, designData] = await Promise.all([
          apiFetch<PlanDetail>(`/api/plans/${selectedPlan.id}`, projectId),
          apiFetch<{ exists: boolean; content: string | null }>(`/api/plans/${selectedPlan.id}/design`, projectId),
        ]);
        setPlanContent(planData.content || null);
        setDesignContent(designData.exists ? designData.content : null);
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
        apiFetch<{ exists: boolean; content: string | null }>(`/api/plans/${selectedPlan.id}/design`, projectId)
          .then(data => setDesignContent(data.exists ? data.content : null))
          .catch(() => setDesignContent(null));
        apiFetch<{ roles: RoleReviewResult[] }>(`/api/plans/${selectedPlan.id}/review`, projectId)
          .then(data => setReviewRoles(data.roles || []))
          .catch(() => setReviewRoles([]));
      }
    }
  }, [lastSseEvent, projectId, selectedPlan?.id]);

  useEffect(() => {
    if (!selectedPlan || !projectId) {
      setPlanContent(null);
      setDesignContent(null);
      setDesignSections([]);
      setLinkedDesignScreenFiles([]);
      setLinkedDesignId(null);
      setSelectedLinkedScreenFile(null);
      setLinkedScreenContent(null);
      setReviewRoles([]);
      return;
    }
    apiFetch<PlanDetail>(`/api/plans/${selectedPlan.id}`, projectId)
      .then(data => setPlanContent(data.content || null))
      .catch(() => setPlanContent(null));
    apiFetch<{ exists: boolean; content: string | null }>(`/api/plans/${selectedPlan.id}/design`, projectId)
      .then(data => setDesignContent(data.exists ? data.content : null))
      .catch(() => setDesignContent(null));
    apiFetch<{ roles: RoleReviewResult[] }>(`/api/plans/${selectedPlan.id}/review`, projectId)
      .then(data => setReviewRoles(data.roles || []))
      .catch(() => setReviewRoles([]));

    // linked_designs의 첫 번째 DES-NNN 로드
    const firstLinked = selectedPlan.linked_designs?.[0] ?? null;
    setLinkedDesignId(firstLinked);
    if (firstLinked) {
      apiFetch<LinkedDesignDetail>(`/api/designs/${firstLinked}`, projectId)
        .then(data => {
          const files = data.screen_files ?? [];
          setLinkedDesignScreenFiles(files);
          setSelectedLinkedScreenFile(files[0] ?? null);
        })
        .catch(() => {
          setLinkedDesignScreenFiles([]);
          setSelectedLinkedScreenFile(null);
        });
    } else {
      setLinkedDesignScreenFiles([]);
      setSelectedLinkedScreenFile(null);
    }
  }, [selectedPlan?.id, projectId]);

  useEffect(() => {
    setDesignSections(designContent ? parseDesignSections(designContent) : []);
  }, [designContent]);

  useEffect(() => {
    if (!linkedDesignId || !selectedLinkedScreenFile || !projectId) {
      setLinkedScreenContent(null);
      return;
    }
    apiFetch<ScreenContent>(
      `/api/designs/${linkedDesignId}/screens/${selectedLinkedScreenFile}`,
      projectId
    )
      .then(data => setLinkedScreenContent(data.exists ? data.content : null))
      .catch(() => setLinkedScreenContent(null));
  }, [linkedDesignId, selectedLinkedScreenFile, projectId]);

  useEffect(() => {
    if (plans.length === 0) return;
    if (planId) {
      const target = plans.find((plan) => plan.id === planId);
      setSelectedPlan(target || plans[0]);
    } else {
      setSelectedPlan(plans[0]);
    }
  }, [planId, plans]);

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

  const hasDesignContent = designSections.length > 0 || linkedDesignScreenFiles.length > 0;
  const hasReviewContent = reviewRoles.length > 0;
  const showDiagram = !!(
    (selectedPlan?.linked_requests?.length ?? 0) > 0 ||
    selectedPlan?.linked_debug ||
    selectedPlan?.linked_ideation ||
    selectedPlan?.linked_discussion
  );

  // linked DES 스크린 파싱 (parseScreenContent 인라인)
  function parseScreenContent(content: string) {
    const titleMatch = content.match(/^##\s+(.+)$/m);
    const imageMatch = content.match(/!\[[^\]]*\]\(([^)]+)\)/);
    const linkMatch = content.match(/\[([^\]]+)\]\((https:\/\/stitch\.[^)]+)\)/);
    const description = content
      .replace(/^##\s+.+$/m, '')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/\[[^\]]+\]\([^)]+\)/g, '')
      .trim();
    return {
      title: titleMatch?.[1] ?? '',
      imageUrl: imageMatch?.[1] ?? null,
      stitchUrl: linkMatch?.[2] ?? null,
      stitchLabel: linkMatch?.[1] ?? 'Stitch에서 보기',
      description,
    };
  }

  const parsedLinkedScreen = linkedScreenContent ? parseScreenContent(linkedScreenContent) : null;

  return (
    <div className="flex h-full overflow-hidden">
      <div ref={sidebarRef} style={{ width: sidebarWidth }} className="border-r flex flex-col min-h-0 shrink-0">
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
            {filteredPlans.map((plan) => (
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
                    hasDesign={plan.has_design}
                    extraLinks={plan.linked_requests}
                    onExtraLinkClick={(reqId) => navigateTo('workflow', reqId)}
                    isSelected={selectedPlan?.id === plan.id}
                    onClick={() => navigate('/plans/' + plan.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
      <ResizableHandle isResizing={isResizing} onMouseDown={startResizing} />
      <div className="flex-1 flex flex-col bg-card min-h-0 overflow-hidden">
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
                  {hasDesignContent && (
                    <TabsTrigger
                      value="design"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1"
                    >
                      <Palette className="h-3 w-3 mr-2" />
                      Design {designSections.length > 0 && `(${designSections.length})`}
                    </TabsTrigger>
                  )}
                  {hasReviewContent && (
                    <TabsTrigger value="review" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1">
                      <ShieldAlert className="h-3 w-3 mr-2" />
                      Review ({reviewRoles.length})
                    </TabsTrigger>
                  )}
                  {showDiagram && (
                    <TabsTrigger value="diagram" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1">
                      <GitBranch className="h-3 w-3 mr-2" />
                      Diagram
                    </TabsTrigger>
                  )}
                </TabsList>
              </div>
              <TabsContent value="overview" className="flex-1 overflow-auto m-0">
                <ScrollArea className="h-full">
                  <div className="p-8">
                    {(selectedPlan?.linked_debug || selectedPlan?.linked_ideation || selectedPlan?.linked_discussion) && (
                      <div className="flex gap-2 flex-wrap mb-4">
                        {selectedPlan.linked_debug && (
                          <button
                            type="button"
                            onClick={() => navigateTo('debug', selectedPlan.linked_debug!)}
                            className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 hover:underline font-mono"
                          >
                            DBG: {selectedPlan.linked_debug} →
                          </button>
                        )}
                        {selectedPlan.linked_ideation && (
                          <button
                            type="button"
                            onClick={() => navigateTo('ideation', selectedPlan.linked_ideation!)}
                            className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-600 hover:bg-green-100 hover:underline font-mono"
                          >
                            IDN: {selectedPlan.linked_ideation} →
                          </button>
                        )}
                        {selectedPlan.linked_discussion && (
                          <button
                            type="button"
                            onClick={() => navigateTo('discussion', selectedPlan.linked_discussion!)}
                            className="text-xs px-2 py-0.5 rounded bg-orange-50 text-orange-600 hover:bg-orange-100 hover:underline font-mono"
                          >
                            DSC: {selectedPlan.linked_discussion} →
                          </button>
                        )}
                      </div>
                    )}
                    {planContent ? (
                      <MarkdownRenderer content={planContent} />
                    ) : (
                      <div className="text-muted-foreground text-sm">plan.md 없음</div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
              {hasDesignContent && (
                <TabsContent value="design" className="flex-1 overflow-auto m-0">
                  <ScrollArea className="h-full">
                    <div className="p-8 space-y-6">
                      {designSections.map((section, index) => (
                        <Card key={`${section.title}-${index}`} className="overflow-hidden">
                          {section.imageUrl && (
                            <a
                              href={section.stitchUrl ?? section.imageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <img
                                src={section.imageUrl}
                                alt={section.title || 'design image'}
                                className="max-w-[85%] block mx-auto"
                              />
                            </a>
                          )}
                          <CardContent className="p-4">
                            {section.title && (
                              <h3 className="font-semibold text-base mb-2">
                                {section.title}
                              </h3>
                            )}
                            {section.description && (
                              <MarkdownRenderer content={section.description} />
                            )}
                            {section.stitchUrl && (
                              <a
                                href={section.stitchUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" /> {section.stitchLabel}
                              </a>
                            )}
                          </CardContent>
                        </Card>
                      ))}

                      {linkedDesignScreenFiles.length > 0 && (
                        <div>
                          {designSections.length > 0 && (
                            <div className="border-t pt-6 mb-4">
                              <p className="text-xs text-muted-foreground mb-3">
                                연결된 DES 세션 ({linkedDesignId})
                              </p>
                            </div>
                          )}
                          <Tabs
                            value={selectedLinkedScreenFile ?? ''}
                            onValueChange={setSelectedLinkedScreenFile}
                            className="w-full"
                          >
                            <TabsList className="bg-transparent h-10 p-0 gap-4 overflow-x-auto border-b w-full justify-start rounded-none">
                              {linkedDesignScreenFiles.map((file) => (
                                <TabsTrigger
                                  key={file}
                                  value={file}
                                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1"
                                >
                                  {file}
                                </TabsTrigger>
                              ))}
                            </TabsList>
                            {linkedDesignScreenFiles.map((file) => (
                              <TabsContent key={file} value={file} className="mt-4">
                                {file === selectedLinkedScreenFile && parsedLinkedScreen ? (
                                  <Card className="overflow-hidden">
                                    {parsedLinkedScreen.imageUrl && (
                                      <a
                                        href={parsedLinkedScreen.stitchUrl ?? parsedLinkedScreen.imageUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        <img
                                          src={parsedLinkedScreen.imageUrl}
                                          alt={parsedLinkedScreen.title}
                                          className="max-w-[85%] block mx-auto"
                                        />
                                      </a>
                                    )}
                                    <CardContent className="p-4">
                                      {parsedLinkedScreen.title && (
                                        <h3 className="font-semibold text-base mb-2">
                                          {parsedLinkedScreen.title}
                                        </h3>
                                      )}
                                      {parsedLinkedScreen.description && (
                                        <MarkdownRenderer content={parsedLinkedScreen.description} />
                                      )}
                                      {parsedLinkedScreen.stitchUrl && (
                                        <a
                                          href={parsedLinkedScreen.stitchUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                        >
                                          <ExternalLink className="h-3 w-3" /> {parsedLinkedScreen.stitchLabel}
                                        </a>
                                      )}
                                    </CardContent>
                                  </Card>
                                ) : (
                                  <div className="text-sm text-muted-foreground">화면을 불러오는 중입니다</div>
                                )}
                              </TabsContent>
                            ))}
                          </Tabs>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              )}
              {hasReviewContent && (
                <TabsContent value="review" className="flex-1 overflow-auto m-0">
                  <ScrollArea className="h-full">
                    <div className="p-8 space-y-4">
                      {reviewRoles.map((r) => (
                        <Card key={r.role}>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-3">
                              <h3 className="font-semibold capitalize">{r.role.replace(/_/g, ' ')}</h3>
                              {r.no_issues
                                ? <span className="text-xs text-green-600 font-medium">NO_ISSUES</span>
                                : <span className="text-xs text-red-600 font-medium">
                                    {r.issues.filter(i => i.severity === 'CRITICAL').length} CRITICAL
                                  </span>
                              }
                            </div>
                            {!r.no_issues && (
                              <div className="space-y-2">
                                {r.issues.map((issue, idx) => (
                                  <div key={idx} className="flex gap-2 text-sm">
                                    <span className={`shrink-0 text-xs font-bold ${
                                      issue.severity === 'CRITICAL' ? 'text-red-600' :
                                      issue.severity === 'MAJOR' ? 'text-orange-500' : 'text-gray-500'
                                    }`}>{issue.severity}</span>
                                    <span><strong>{issue.title}</strong> — {issue.description}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
              )}
              {showDiagram && (
                <TabsContent value="diagram" className="flex-1 overflow-auto m-0">
                  <PlanDiagramTab planId={selectedPlan.id} projectId={projectId} />
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
