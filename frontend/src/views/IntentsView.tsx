import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BookOpen, Link2, Plus, SquarePen, Trash2 } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { apiFetch } from '@/hooks/useApi';
import { useResizableSidebar } from '@/hooks/useResizableSidebar';
import { ResizableHandle } from '@/components/shared/ResizableHandle';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { SessionCard } from '@/components/shared/SessionCard';
import { ListFilter, type FilterOption } from '@/components/shared/ListFilter';
import { RefreshButton } from '@/components/shared/RefreshButton';
import { EmptyState } from '@/components/shared/EmptyState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { TagInput } from '@/components/shared/TagInput';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface IntentListItem {
  id: string;
  file?: string;
  feature?: string;
  linked_req?: string | null;
  linked_plan?: string | null;
  related_intent?: string[];
  tags?: string[];
  files?: string[];
  created_at?: string;
}

interface IntentDetailResponse {
  id: string;
  body?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

interface RelatedIntentItem {
  id: string;
  depth: number;
  reasons?: string[];
  entry?: Record<string, unknown>;
}

interface RelatedIntentResponse {
  source: string;
  depth: number;
  related?: RelatedIntentItem[];
}

interface IntentSearchMatch {
  id: string;
  [key: string]: unknown;
}

interface IntentFormState {
  feature: string;
  situation: string;
  motivation: string;
  goal: string;
  linked_req: string;
  linked_plan: string;
  tags: string[];
  related_intent: string[];
}

const EMPTY_FORM: IntentFormState = {
  feature: '',
  situation: '',
  motivation: '',
  goal: '',
  linked_req: '',
  linked_plan: '',
  tags: [],
  related_intent: [],
};

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter((item) => item.length > 0)));
}

function parseJtbdBody(body: string): { situation: string; motivation: string; goal: string } {
  if (!body.trim()) {
    return { situation: '', motivation: '', goal: '' };
  }

  const lines = body.split('\n');
  const whenHeading = '## When I...';
  const wantHeading = '## I want to...';
  const goalHeading = '## So I can...';

  const whenIndex = lines.findIndex((line) => line.trim() === whenHeading);
  const wantIndex = lines.findIndex((line) => line.trim() === wantHeading);
  const goalIndex = lines.findIndex((line) => line.trim() === goalHeading);

  if (whenIndex < 0 || wantIndex < 0 || goalIndex < 0 || !(whenIndex < wantIndex && wantIndex < goalIndex)) {
    return { situation: '', motivation: '', goal: '' };
  }

  let nextHeadingIndex = lines.length;
  for (let i = goalIndex + 1; i < lines.length; i += 1) {
    if (lines[i].trim().startsWith('## ')) {
      nextHeadingIndex = i;
      break;
    }
  }

  return {
    situation: lines.slice(whenIndex + 1, wantIndex).join('\n').trim(),
    motivation: lines.slice(wantIndex + 1, goalIndex).join('\n').trim(),
    goal: lines.slice(goalIndex + 1, nextHeadingIndex).join('\n').trim(),
  };
}

function getCardStatus(intent: IntentListItem): string {
  if (intent.linked_req || intent.linked_plan) return 'linked';
  return 'pending';
}

export function IntentsView() {
  const { projectId, lastSseEvent, navigateTo } = useAppContext();
  const { intentId } = useParams();
  const navigate = useNavigate();

  const [intents, setIntents] = useState<IntentListItem[]>([]);
  const [intentDetail, setIntentDetail] = useState<IntentDetailResponse | null>(null);
  const [relatedIntents, setRelatedIntents] = useState<RelatedIntentItem[]>([]);
  const [searchMatches, setSearchMatches] = useState<IntentSearchMatch[] | null>(null);

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [searchValue, setSearchValue] = useState('');
  const [sortValue, setSortValue] = useState('newest');

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingIntentId, setEditingIntentId] = useState<string | null>(null);
  const [form, setForm] = useState<IntentFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const { sidebarWidth, isResizing, startResizing, sidebarRef } = useResizableSidebar({
    defaultWidth: 320,
    minWidth: 260,
    maxWidth: 620,
    storageKey: 'intents-sidebar-width',
  });

  const sortOptions: FilterOption[] = [
    { value: 'newest', label: 'Newest First' },
    { value: 'oldest', label: 'Oldest First' },
  ];

  const selectedIntentId = useMemo(() => {
    if (intentId) return intentId;
    return intents[0]?.id ?? null;
  }, [intentId, intents]);

  const selectedIntent = useMemo(() => {
    if (!selectedIntentId) return null;
    return intents.find((intent) => intent.id === selectedIntentId) ?? null;
  }, [intents, selectedIntentId]);

  const detailMeta = useMemo(() => {
    const metadata = intentDetail?.metadata;
    if (!metadata || typeof metadata !== 'object') {
      return {};
    }
    return metadata;
  }, [intentDetail]);

  const jtbd = useMemo(() => parseJtbdBody(asTrimmedString(intentDetail?.body)), [intentDetail?.body]);

  const filteredIntents = useMemo(() => {
    let result = [...intents];

    if (sortValue === 'oldest') {
      result.sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
    } else {
      result.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
    }

    if (!searchValue.trim()) {
      return result;
    }

    if (!searchMatches) {
      return [];
    }

    const mapById = new Map(result.map((intent) => [intent.id, intent]));
    const orderedIds = Array.from(
      new Set(
        searchMatches
          .map((match) => asTrimmedString(match.id))
          .filter((id) => id.length > 0)
      )
    );

    return orderedIds
      .map((id) => mapById.get(id))
      .filter((intent): intent is IntentListItem => Boolean(intent));
  }, [intents, searchMatches, searchValue, sortValue]);

  const fetchIntents = useCallback(async () => {
    const data = await apiFetch<IntentListItem[]>('/api/intents', projectId);
    setIntents(Array.isArray(data) ? data : []);
  }, [projectId]);

  const fetchIntentDetail = useCallback(async (id: string) => {
    const [detail, related] = await Promise.all([
      apiFetch<IntentDetailResponse>(`/api/intents/${id}`, projectId),
      apiFetch<RelatedIntentResponse>(`/api/intents/${id}/related`, projectId).catch(() => ({ source: id, depth: 1, related: [] })),
    ]);

    setIntentDetail(detail);
    setRelatedIntents(Array.isArray(related.related) ? related.related : []);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      setIntents([]);
      return;
    }

    setLoading(true);
    fetchIntents()
      .catch((error: unknown) => {
        setStatusMessage(error instanceof Error ? error.message : 'Intent 목록을 불러오지 못했습니다');
      })
      .finally(() => setLoading(false));
  }, [fetchIntents, projectId]);

  useEffect(() => {
    const query = searchValue.trim();
    if (!query || !projectId) {
      setSearchMatches(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      apiFetch<IntentSearchMatch[]>(`/api/intents/search?q=${encodeURIComponent(query)}`, projectId)
        .then((data) => {
          if (!cancelled) {
            setSearchMatches(Array.isArray(data) ? data : []);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSearchMatches([]);
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [projectId, searchValue]);

  useEffect(() => {
    if (!selectedIntentId || !projectId) {
      setIntentDetail(null);
      setRelatedIntents([]);
      return;
    }

    setIsDetailLoading(true);
    fetchIntentDetail(selectedIntentId)
      .catch(() => {
        setIntentDetail(null);
        setRelatedIntents([]);
      })
      .finally(() => setIsDetailLoading(false));
  }, [fetchIntentDetail, projectId, selectedIntentId]);

  useEffect(() => {
    if (!lastSseEvent || !projectId) return;
    if (lastSseEvent.type !== 'intent_update') return;

    fetchIntents().catch(() => undefined);

    if (selectedIntentId) {
      fetchIntentDetail(selectedIntentId).catch(() => undefined);
    }
  }, [fetchIntentDetail, fetchIntents, lastSseEvent, projectId, selectedIntentId]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setStatusMessage(null);
    try {
      await fetchIntents();
      if (selectedIntentId) {
        await fetchIntentDetail(selectedIntentId);
      }
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : '새로고침에 실패했습니다');
    } finally {
      setIsRefreshing(false);
    }
  };

  const openCreateSheet = () => {
    setEditingIntentId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setIsSheetOpen(true);
  };

  const openEditSheet = () => {
    if (!selectedIntentId) return;

    setEditingIntentId(selectedIntentId);
    setForm({
      feature: asTrimmedString(detailMeta.feature) || asTrimmedString(selectedIntent?.feature),
      situation: jtbd.situation,
      motivation: jtbd.motivation,
      goal: jtbd.goal,
      linked_req: asTrimmedString(detailMeta.linked_req),
      linked_plan: asTrimmedString(detailMeta.linked_plan),
      tags: asStringList(detailMeta.tags),
      related_intent: asStringList(detailMeta.related_intent),
    });
    setFormError(null);
    setIsSheetOpen(true);
  };

  const handleSave = async () => {
    const payload = {
      feature: form.feature.trim(),
      situation: form.situation.trim(),
      motivation: form.motivation.trim(),
      goal: form.goal.trim(),
      linked_req: form.linked_req.trim(),
      linked_plan: form.linked_plan.trim(),
      tags: dedupe(form.tags),
      related_intent: dedupe(form.related_intent),
    };

    if (!payload.feature || !payload.situation || !payload.motivation || !payload.goal) {
      setFormError('feature, situation, motivation, goal 필드는 필수입니다.');
      return;
    }

    setIsSaving(true);
    setFormError(null);
    setStatusMessage(null);

    try {
      let saved: IntentListItem;
      if (editingIntentId) {
        saved = await apiFetch<IntentListItem>(`/api/intents/${editingIntentId}`, projectId, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        saved = await apiFetch<IntentListItem>('/api/intents', projectId, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      await fetchIntents();
      setIsSheetOpen(false);
      setEditingIntentId(null);

      if (saved.id) {
        navigate(`/memory/intents/${saved.id}`);
      }
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : '저장에 실패했습니다');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedIntentId) return;
    const confirmed = window.confirm(`Intent ${selectedIntentId}를 삭제하시겠습니까?`);
    if (!confirmed) return;

    setStatusMessage(null);

    try {
      await apiFetch<{ success: boolean; message?: string }>(`/api/intents/${selectedIntentId}`, projectId, {
        method: 'DELETE',
      });

      await fetchIntents();
      const remaining = intents.filter((intent) => intent.id !== selectedIntentId);

      if (remaining.length === 0) {
        navigate('/memory/intents');
      } else {
        navigate(`/memory/intents/${remaining[0].id}`);
      }
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : '삭제에 실패했습니다');
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
          {[1, 2, 3].map((index) => <Skeleton key={index} className="h-24 w-full" />)}
        </div>
        <div className="col-span-8">
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full overflow-hidden">
        <div ref={sidebarRef} style={{ width: sidebarWidth }} className="border-r flex flex-col min-h-0 shrink-0">
          <div className="p-4 border-b bg-muted/30 flex justify-between items-center gap-2">
            <h2 className="font-semibold">Intents ({intents.length})</h2>
            <TooltipProvider>
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      className="h-7 w-7"
                      onClick={openCreateSheet}
                      aria-label="추가 : 새 Intent를 생성합니다"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>추가 : 새 Intent를 생성합니다</p>
                  </TooltipContent>
                </Tooltip>
                <RefreshButton onClick={handleRefresh} isRefreshing={isRefreshing} />
              </div>
            </TooltipProvider>
          </div>

          <ListFilter
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            searchPlaceholder="Search intents (FTS5)..."
            sortOptions={sortOptions}
            sortValue={sortValue}
            onSortChange={setSortValue}
            sortPlaceholder="Sort"
          />

          {statusMessage && (
            <div className="px-3 py-2 border-b text-xs text-destructive bg-destructive/5">
              {statusMessage}
            </div>
          )}

          <ScrollArea className="flex-1">
            <div className="p-3 space-y-1.5">
              {filteredIntents.map((intent) => (
                <SessionCard
                  key={intent.id}
                  id={intent.id}
                  title={intent.feature || intent.id}
                  status={getCardStatus(intent)}
                  createdAt={intent.created_at}
                  icon={<BookOpen className="h-3.5 w-3.5 text-muted-foreground" />}
                  extraBadge={intent.tags && intent.tags.length > 0 ? `tags ${intent.tags.length}` : undefined}
                  isSelected={selectedIntentId === intent.id}
                  onClick={() => navigate(`/memory/intents/${intent.id}`)}
                />
              ))}

              {filteredIntents.length === 0 && (
                <div className="pt-8">
                  <EmptyState
                    icon={<BookOpen className="h-8 w-8" />}
                    title={searchValue.trim() ? '검색 결과 없음' : 'Intent 없음'}
                    description={searchValue.trim() ? 'FTS5 검색 결과가 없습니다.' : '새 Intent를 추가해 시작하세요.'}
                  />
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <ResizableHandle isResizing={isResizing} onMouseDown={startResizing} />

        <div className="flex-1 flex flex-col bg-card min-h-0 overflow-hidden">
          {!selectedIntentId ? (
            <EmptyState
              icon={<BookOpen className="h-8 w-8" />}
              title="Intent 없음"
              description="Intent를 생성하면 상세 정보가 여기에 표시됩니다."
            />
          ) : isDetailLoading ? (
            <div className="p-6 h-full">
              <Skeleton className="h-full w-full" />
            </div>
          ) : intentDetail ? (
            <>
              <div className="p-4 border-b flex justify-between items-center bg-muted/10">
                <div>
                  <h2 className="font-bold text-lg">{asTrimmedString(detailMeta.feature) || selectedIntent?.feature || selectedIntentId}</h2>
                  <p className="text-xs text-muted-foreground">
                    {selectedIntentId}
                    {asTrimmedString(detailMeta.created_at || selectedIntent?.created_at) && ` · ${asTrimmedString(detailMeta.created_at || selectedIntent?.created_at).slice(0, 10)}`}
                  </p>
                </div>
                <TooltipProvider>
                  <div className="flex items-center gap-2">
                    <StatusBadge status="active" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          onClick={openEditSheet}
                          aria-label="수정 : 선택한 Intent를 편집합니다"
                        >
                          <SquarePen className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>수정 : 선택한 Intent를 편집합니다</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="destructive"
                          className="h-8 w-8"
                          onClick={handleDelete}
                          aria-label="삭제 : 선택한 Intent를 삭제합니다"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>삭제 : 선택한 Intent를 삭제합니다</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-6 space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">JTBD</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-md border p-3 space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground">When I...</p>
                        <p className="text-sm whitespace-pre-wrap">{jtbd.situation || '-'}</p>
                      </div>
                      <div className="rounded-md border p-3 space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground">I want to...</p>
                        <p className="text-sm whitespace-pre-wrap">{jtbd.motivation || '-'}</p>
                      </div>
                      <div className="rounded-md border p-3 space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground">So I can...</p>
                        <p className="text-sm whitespace-pre-wrap">{jtbd.goal || '-'}</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Metadata</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Badge variant="outline">ID: {selectedIntentId}</Badge>
                        {asTrimmedString(detailMeta.linked_req) && (
                          <button
                            type="button"
                            className="inline-flex"
                            onClick={() => navigateTo('workflow', asTrimmedString(detailMeta.linked_req))}
                          >
                            <Badge variant="secondary" className="cursor-pointer hover:opacity-90">
                              REQ: {asTrimmedString(detailMeta.linked_req)}
                            </Badge>
                          </button>
                        )}
                        {asTrimmedString(detailMeta.linked_plan) && (
                          <button
                            type="button"
                            className="inline-flex"
                            onClick={() => navigateTo('plans', asTrimmedString(detailMeta.linked_plan))}
                          >
                            <Badge variant="secondary" className="cursor-pointer hover:opacity-90">
                              PLN: {asTrimmedString(detailMeta.linked_plan)}
                            </Badge>
                          </button>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-muted-foreground">Tags</p>
                        <div className="flex flex-wrap gap-1.5">
                          {asStringList(detailMeta.tags).length > 0 ? (
                            asStringList(detailMeta.tags).map((tag) => (
                              <Badge key={tag} variant="outline" className="font-mono text-xs">
                                {tag}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">태그 없음</span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">연관 Intent 탐색</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {relatedIntents.length > 0 ? (
                        relatedIntents.map((related) => {
                          const relatedFeature = asTrimmedString(related.entry?.feature);
                          return (
                            <button
                              key={`${related.id}-${related.depth}`}
                              type="button"
                              onClick={() => navigate(`/memory/intents/${related.id}`)}
                              className="w-full rounded-md border p-3 text-left hover:bg-muted/40 transition-colors"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{relatedFeature || related.id}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {related.id} · depth {related.depth}
                                  </p>
                                </div>
                                <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                                  <Link2 className="h-3.5 w-3.5" />
                                  {(related.reasons ?? []).join(', ') || 'related'}
                                </div>
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <p className="text-sm text-muted-foreground">연관 Intent가 없습니다.</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            </>
          ) : (
            <EmptyState
              icon={<BookOpen className="h-8 w-8" />}
              title="Intent를 찾을 수 없음"
              description="목록에서 다른 Intent를 선택하세요."
            />
          )}
        </div>
      </div>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent side="right" className="w-[760px] max-w-[95vw] sm:max-w-[760px] p-0 flex flex-col">
          <SheetHeader className="p-6 pb-4 border-b">
            <SheetTitle>{editingIntentId ? 'Intent 수정' : 'Intent 추가'}</SheetTitle>
            <SheetDescription>
              JTBD 필수 필드(feature, situation, motivation, goal)와 선택 메타데이터를 입력하세요.
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="intent-feature" className="text-xs font-medium text-muted-foreground">feature *</label>
                <Input
                  id="intent-feature"
                  value={form.feature}
                  onChange={(e) => setForm((prev) => ({ ...prev, feature: e.target.value }))}
                  placeholder="예: 자동 리뷰 요약"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1.5">
                  <label htmlFor="intent-situation" className="text-xs font-medium text-muted-foreground">When I... *</label>
                  <textarea
                    id="intent-situation"
                    value={form.situation}
                    onChange={(e) => setForm((prev) => ({ ...prev, situation: e.target.value }))}
                    className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="intent-motivation" className="text-xs font-medium text-muted-foreground">I want to... *</label>
                  <textarea
                    id="intent-motivation"
                    value={form.motivation}
                    onChange={(e) => setForm((prev) => ({ ...prev, motivation: e.target.value }))}
                    className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="intent-goal" className="text-xs font-medium text-muted-foreground">So I can... *</label>
                  <textarea
                    id="intent-goal"
                    value={form.goal}
                    onChange={(e) => setForm((prev) => ({ ...prev, goal: e.target.value }))}
                    className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="intent-linked-req" className="text-xs font-medium text-muted-foreground">linked_req</label>
                  <Input
                    id="intent-linked-req"
                    value={form.linked_req}
                    onChange={(e) => setForm((prev) => ({ ...prev, linked_req: e.target.value }))}
                    placeholder="REQ-123"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="intent-linked-plan" className="text-xs font-medium text-muted-foreground">linked_plan</label>
                  <Input
                    id="intent-linked-plan"
                    value={form.linked_plan}
                    onChange={(e) => setForm((prev) => ({ ...prev, linked_plan: e.target.value }))}
                    placeholder="PLN-456"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">tags</label>
                <TagInput
                  tags={form.tags}
                  onChange={(tags) => setForm((prev) => ({ ...prev, tags }))}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">related_intent</label>
                <TagInput
                  tags={form.related_intent}
                  onChange={(related) => setForm((prev) => ({ ...prev, related_intent: related }))}
                />
                <p className="text-xs text-muted-foreground">예: INTENT-001 형태로 입력 후 Enter</p>
              </div>

              {formError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {formError}
                </div>
              )}
            </div>
          </ScrollArea>

          <SheetFooter className="border-t p-4">
            <Button variant="outline" onClick={() => setIsSheetOpen(false)} disabled={isSaving}>취소</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? '저장 중...' : '저장'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
