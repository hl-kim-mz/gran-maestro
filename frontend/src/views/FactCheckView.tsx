import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle, ExternalLink, Search } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { apiFetch } from '@/hooks/useApi';
import { useResizableSidebar } from '@/hooks/useResizableSidebar';
import { ResizableHandle } from '@/components/shared/ResizableHandle';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { SessionCard } from '@/components/shared/SessionCard';
import { RefreshButton } from '@/components/shared/RefreshButton';
import { EmptyState } from '@/components/shared/EmptyState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Evidence {
  type: string;
  url: string;
  snippet: string;
  accessed_at: string;
}

interface Claim {
  id: string;
  text: string;
  source_reliability: string;
  status: string;
  tags: string[];
  evidence: Evidence[];
}

interface ClaimsSummary {
  total: number;
  verified: number;
  failed: number;
  unverified: number;
}

interface FactCheckListItem {
  id: string;
  linked_plan?: string | null;
  status: string;
  created_at?: string;
  claims?: Claim[];
  summary?: ClaimsSummary;
  claims_summary?: ClaimsSummary;
}

type FactCheckStatusFilter = 'all' | 'verified' | 'failed' | 'unverified';

function isSafeEvidenceUrl(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith('https://') || normalized.startsWith('http://');
}

export function FactCheckView() {
  const { projectId, navigateTo } = useAppContext();
  const { fcId } = useParams();
  const navigate = useNavigate();

  const [factChecks, setFactChecks] = useState<FactCheckListItem[]>([]);
  const [factCheckDetail, setFactCheckDetail] = useState<FactCheckListItem | null>(null);

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [searchValue, setSearchValue] = useState('');
  const [tagValue, setTagValue] = useState('');
  const [statusFilter, setStatusFilter] = useState<FactCheckStatusFilter>('all');
  const [sortValue, setSortValue] = useState('newest');

  const { sidebarWidth, isResizing, startResizing, sidebarRef } = useResizableSidebar({
    defaultWidth: 320,
    minWidth: 260,
    maxWidth: 620,
    storageKey: 'fact-checks-sidebar-width',
  });

  const selectedFcId = useMemo(() => {
    if (fcId) return fcId;
    return factChecks[0]?.id ?? null;
  }, [fcId, factChecks]);

  const filteredFactChecks = useMemo(() => {
    let result = [...factChecks];

    if (statusFilter !== 'all' && !searchValue.trim() && !tagValue.trim()) {
      result = result.filter((fc) => {
        const summary = fc.claims_summary ?? fc.summary;
        const value = summary?.[statusFilter];
        return typeof value === 'number' ? value > 0 : false;
      });
    }

    if (sortValue === 'oldest') {
      result.sort((a, b) => (a.created_at ?? a.id).localeCompare(b.created_at ?? b.id));
    } else {
      result.sort((a, b) => (b.created_at ?? b.id).localeCompare(a.created_at ?? a.id));
    }
    return result;
  }, [factChecks, searchValue, sortValue, statusFilter, tagValue]);

  const fetchFactChecks = useCallback(async (filters?: {
    query?: string;
    tag?: string;
    status?: FactCheckStatusFilter;
  }) => {
    const params = new URLSearchParams();
    const query = filters?.query?.trim();
    const tag = filters?.tag?.trim();
    const status = filters?.status && filters.status !== 'all' ? filters.status : '';
    const shouldUseSearchParams = Boolean(query) || Boolean(tag);

    if (query) params.set('q', query);
    if (tag) params.set('tag', tag);
    if (status && shouldUseSearchParams) params.set('status', status);

    let url = '/api/fact-checks';
    const queryString = params.toString();
    if (queryString) url += `?${queryString}`;

    const data = await apiFetch<FactCheckListItem[]>(url, projectId);
    const normalized = Array.isArray(data)
      ? data.map((item) => ({
        ...item,
        summary: item.summary ?? item.claims_summary,
      }))
      : [];
    setFactChecks(normalized);
  }, [projectId]);

  const fetchFactCheckDetail = useCallback(async (id: string) => {
    const detail = await apiFetch<FactCheckListItem>(`/api/fact-checks/${id}`, projectId);
    setFactCheckDetail(detail);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      setFactChecks([]);
      return;
    }

    setLoading(true);
    fetchFactChecks()
      .catch((error: unknown) => {
        setStatusMessage(error instanceof Error ? error.message : 'Fact-Check 목록을 불러오지 못했습니다');
      })
      .finally(() => setLoading(false));
  }, [fetchFactChecks, projectId]);

  useEffect(() => {
    const query = searchValue.trim();
    if (!projectId) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      fetchFactChecks({
        query,
        tag: tagValue.trim(),
        status: statusFilter,
      }).catch(() => {
        if (!cancelled) setFactChecks([]);
      });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fetchFactChecks, projectId, searchValue, statusFilter, tagValue]);

  useEffect(() => {
    if (!selectedFcId || !projectId) {
      setFactCheckDetail(null);
      return;
    }

    setIsDetailLoading(true);
    fetchFactCheckDetail(selectedFcId)
      .catch(() => {
        setFactCheckDetail(null);
      })
      .finally(() => setIsDetailLoading(false));
  }, [fetchFactCheckDetail, projectId, selectedFcId]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setStatusMessage(null);
    try {
      await fetchFactChecks({
        query: searchValue.trim(),
        tag: tagValue.trim(),
        status: statusFilter,
      });
      if (selectedFcId) {
        await fetchFactCheckDetail(selectedFcId);
      }
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : '새로고침에 실패했습니다');
    } finally {
      setIsRefreshing(false);
    }
  };
  const hasActiveFilters = Boolean(searchValue.trim() || tagValue.trim() || statusFilter !== 'all');

  const handleStatusChange = async (claimId: string, newStatus: string) => {
    if (!selectedFcId || !projectId) return;
    try {
      await apiFetch<{ ok: boolean }>(`/api/fact-checks/${selectedFcId}/claims/${claimId}`, projectId, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      await fetchFactCheckDetail(selectedFcId);
    } catch (error: unknown) {
      console.error('Failed to update status', error);
      alert('상태 업데이트에 실패했습니다.');
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
    <div className="flex h-full overflow-hidden">
      <div ref={sidebarRef} style={{ width: sidebarWidth }} className="border-r flex flex-col min-h-0 shrink-0">
        <div className="p-4 border-b bg-muted/30 flex justify-between items-center gap-2">
          <h2 className="font-semibold">Fact-Checks ({factChecks.length})</h2>
          <div className="flex items-center gap-2">
            <RefreshButton onClick={handleRefresh} isRefreshing={isRefreshing} />
          </div>
        </div>

        <div className="p-3 border-b space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="Search fact-checks..."
                className="h-8 pl-8 text-xs"
              />
            </div>
            <Input
              value={tagValue}
              onChange={(e) => setTagValue(e.target.value)}
              placeholder="Tag"
              className="h-8 text-xs w-28"
            />
          </div>
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as FactCheckStatusFilter)}>
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All</SelectItem>
                <SelectItem value="verified" className="text-xs">Verified</SelectItem>
                <SelectItem value="failed" className="text-xs">Failed</SelectItem>
                <SelectItem value="unverified" className="text-xs">Unverified</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortValue} onValueChange={setSortValue}>
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest" className="text-xs">Newest First</SelectItem>
                <SelectItem value="oldest" className="text-xs">Oldest First</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {statusMessage && (
          <div className="px-3 py-2 border-b text-xs text-destructive bg-destructive/5">
            {statusMessage}
          </div>
        )}

        <ScrollArea className="flex-1">
          <div className="p-3 space-y-1.5">
            {filteredFactChecks.map((fc) => (
              <SessionCard
                key={fc.id}
                id={fc.id}
                title={fc.id}
                status={fc.status === 'completed' ? 'active' : fc.status === 'failed' ? 'closed' : 'pending'}
                createdAt={fc.created_at}
                icon={<CheckCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                extraBadge={fc.linked_plan ? `PLN: ${fc.linked_plan}` : undefined}
                isSelected={selectedFcId === fc.id}
                onClick={() => navigate(`/memory/fact-checks/${fc.id}`)}
              />
            ))}

            {filteredFactChecks.length === 0 && (
              <div className="pt-8">
                <EmptyState
                  icon={<CheckCircle className="h-8 w-8" />}
                  title={hasActiveFilters ? '검색 결과 없음' : 'Fact-Check 없음'}
                  description={hasActiveFilters ? '조건에 맞는 결과가 없습니다.' : '수집된 팩트체크가 없습니다.'}
                />
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <ResizableHandle isResizing={isResizing} onMouseDown={startResizing} />

      <div className="flex-1 flex flex-col bg-card min-h-0 overflow-hidden">
        {!selectedFcId ? (
          <EmptyState
            icon={<CheckCircle className="h-8 w-8" />}
            title="Fact-Check 없음"
            description="목록에서 Fact-Check를 선택하세요."
          />
        ) : isDetailLoading ? (
          <div className="p-6 h-full">
            <Skeleton className="h-full w-full" />
          </div>
        ) : factCheckDetail ? (
          <>
            <div className="p-4 border-b flex justify-between items-center bg-muted/10">
              <div>
                <h2 className="font-bold text-lg">{factCheckDetail.id}</h2>
                <p className="text-xs text-muted-foreground">
                  {factCheckDetail.created_at && `생성: ${factCheckDetail.created_at.slice(0, 10)}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={factCheckDetail.status === 'completed' ? 'active' : factCheckDetail.status === 'failed' ? 'closed' : 'pending'} />
                {factCheckDetail.linked_plan && (
                  <button
                    type="button"
                    className="inline-flex"
                    onClick={() => navigateTo('plans', factCheckDetail.linked_plan!)}
                  >
                    <Badge variant="secondary" className="cursor-pointer hover:opacity-90">
                      {factCheckDetail.linked_plan}
                    </Badge>
                  </button>
                )}
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-6 space-y-4">
                {factCheckDetail.summary && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-4 text-sm">
                        <div>Total: <strong>{factCheckDetail.summary.total}</strong></div>
                        <div className="text-green-600">Verified: <strong>{factCheckDetail.summary.verified}</strong></div>
                        <div className="text-red-600">Failed: <strong>{factCheckDetail.summary.failed}</strong></div>
                        <div className="text-amber-600">Unverified: <strong>{factCheckDetail.summary.unverified}</strong></div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <h3 className="font-semibold text-lg mt-6 mb-2">Claims</h3>
                <div className="space-y-4">
                  {(factCheckDetail.claims || []).length > 0 ? (
                    factCheckDetail.claims!.map(claim => (
                      <Card key={claim.id}>
                        <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
                          <div>
                            <CardTitle className="text-base font-medium flex items-center gap-2">
                              {claim.id}
                              <Badge variant="outline" className="text-xs font-normal">
                                Source: {claim.source_reliability || 'Unknown'}
                              </Badge>
                            </CardTitle>
                          </div>
                          <div className="flex items-center gap-2">
                            <Select value={claim.status} onValueChange={(val) => handleStatusChange(claim.id, val)}>
                              <SelectTrigger className="h-8 w-32 text-xs">
                                <SelectValue placeholder="Status" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="verified">Verified</SelectItem>
                                <SelectItem value="failed">Failed</SelectItem>
                                <SelectItem value="unverified">Unverified</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="text-sm bg-muted/30 p-3 rounded-md border">
                            {claim.text}
                          </div>
                          
                          {claim.tags && claim.tags.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                              {claim.tags.map(tag => (
                                <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                              ))}
                            </div>
                          )}

                          {claim.evidence && claim.evidence.length > 0 && (
                            <div className="space-y-2 mt-4">
                              <p className="text-xs font-semibold text-muted-foreground">Evidence</p>
                              {claim.evidence.map((ev, idx) => (
                                <div key={idx} className="text-sm border rounded-md p-3 space-y-2">
                                  {(() => {
                                    const url = typeof ev.url === 'string' ? ev.url.trim() : '';
                                    const isSafeUrl = isSafeEvidenceUrl(url);
                                    return (
                                      <div className="flex justify-between items-center gap-2">
                                        <Badge variant="outline" className="text-[10px] uppercase">{ev.type}</Badge>
                                        {isSafeUrl ? (
                                          <a href={url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline flex items-center gap-1 text-xs">
                                            <ExternalLink className="h-3 w-3" /> URL
                                          </a>
                                        ) : (
                                          <span className="text-[11px] text-muted-foreground break-all">{url || 'Invalid URL'}</span>
                                        )}
                                      </div>
                                    );
                                  })()}
                                  {ev.snippet && (
                                    <div className="bg-background border px-2 py-1.5 rounded text-xs whitespace-pre-wrap text-muted-foreground">
                                      {ev.snippet}
                                    </div>
                                  )}
                                  {ev.accessed_at && (
                                    <p className="text-[10px] text-muted-foreground text-right mt-1">
                                      Accessed: {ev.accessed_at}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Claim이 없습니다.</p>
                  )}
                </div>
              </div>
            </ScrollArea>
          </>
        ) : (
          <EmptyState
            icon={<CheckCircle className="h-8 w-8" />}
            title="Fact-Check를 찾을 수 없음"
            description="목록에서 다른 항목을 선택하세요."
          />
        )}
      </div>
    </div>
  );
}
