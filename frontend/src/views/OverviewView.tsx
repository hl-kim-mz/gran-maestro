import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '@/context/AppContext';
import { apiFetch } from '@/hooks/useApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshButton } from '@/components/shared/RefreshButton';
import { Skeleton } from '@/components/ui/skeleton';
import { AgentPerformance, type AgentPerformanceHandle } from '@/components/shared/AgentPerformance';

type CounterType = 'requests' | 'plans' | 'debug' | 'ideation' | 'discussion' | 'explore' | 'designs';

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

type ArcInfo = {
  path: string;
  color: string;
};

const COUNTER_COLUMNS: Array<{
  key: keyof CounterStats;
  label: string;
  color: string;
}> = [
  { key: 'total', label: 'Total', color: '#60a5fa' },
  { key: 'active', label: 'Active', color: '#34d399' },
  { key: 'archived', label: 'Archived', color: '#94a3b8' },
];

const STATUS_COLORS = ['#60a5fa', '#34d399', '#fb7185', '#a78bfa', '#fbbf24', '#38bdf8', '#f472b6'];

const COUNTER_GROUPS = [
  { key: 'requests', label: 'Requests' },
  { key: 'plans', label: 'Plans' },
  { key: 'debug', label: 'Debug' },
  { key: 'ideation', label: 'Ideation' },
  { key: 'discussion', label: 'Discussion' },
  { key: 'explore', label: 'Explore' },
  { key: 'designs', label: 'Designs' },
] as const;

const PIE_SIZE = 280;
const PIE_CENTER = PIE_SIZE / 2;
const PIE_RADIUS = 95;
const CIRCUMFERENCE = Math.PI * 2 * PIE_RADIUS;

function clampRate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function normalizeValue(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function buildPieArcs(entries: [string, number][], total: number): ArcInfo[] {
  if (total <= 0) return [];

  let currentAngle = -Math.PI / 2;
  return entries.map(([status, count], index) => {
    const countValue = normalizeValue(count);
    const nextAngle = currentAngle + (countValue / total) * Math.PI * 2;

    const x1 = PIE_CENTER + PIE_RADIUS * Math.cos(currentAngle);
    const y1 = PIE_CENTER + PIE_RADIUS * Math.sin(currentAngle);
    const x2 = PIE_CENTER + PIE_RADIUS * Math.cos(nextAngle);
    const y2 = PIE_CENTER + PIE_RADIUS * Math.sin(nextAngle);
    const largeArc = nextAngle - currentAngle > Math.PI ? 1 : 0;

    const path = [
      `M ${PIE_CENTER} ${PIE_CENTER}`,
      `L ${x1.toFixed(2)} ${y1.toFixed(2)}`,
      `A ${PIE_RADIUS} ${PIE_RADIUS} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
      `Z`,
    ].join(' ');

    currentAngle = nextAngle;

    return {
      path,
      color: STATUS_COLORS[index % STATUS_COLORS.length],
    };
  });
}

export function OverviewView() {
  const { projectId } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const agentRef = useRef<AgentPerformanceHandle>(null);

  const fetchStats = useCallback(async () => {
    const data = await apiFetch<OverviewStats>('/api/stats', projectId);
    setStats(data);
    setError(null);
  }, [projectId]);

  const loadStats = useCallback(async (isRefresh = false) => {
    if (!projectId) return;
    if (!isRefresh) {
      setLoading(true);
    }
    setError(null);
    try {
      await fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : '통계를 불러오지 못했습니다');
    } finally {
      if (!isRefresh) setLoading(false);
    }
  }, [projectId, fetchStats]);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      setStats(null);
      return;
    }
    loadStats();
  }, [projectId, loadStats]);

  const handleRefresh = async () => {
    if (!projectId) return;
    setIsRefreshing(true);
    try {
      await Promise.all([loadStats(true), agentRef.current?.refresh()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const completionRate = useMemo(
    () => clampRate(stats?.completion_rate ?? 0) * 100,
    [stats?.completion_rate],
  );
  const completionOffset = useMemo(
    () => CIRCUMFERENCE * (1 - completionRate / 100),
    [completionRate],
  );

  const counterRows = useMemo(
    () => COUNTER_GROUPS.map(({ key, label }) => ({
      key,
      label,
      values: COUNTER_COLUMNS.map(({ key: metricKey, color }) => ({
        metric: metricKey,
        value: normalizeValue(stats?.counters?.[key]?.[metricKey] ?? 0),
        color,
      })),
    })),
    [stats],
  );

  const maxCounterValue = useMemo(
    () => Math.max(1, ...counterRows.flatMap((row) => row.values.map(v => v.value))),
    [counterRows],
  );

  const statusEntries = useMemo(
    () => Object.entries(stats?.status_distribution ?? {})
      .map(([status, count]) => ({ status, count: normalizeValue(count) }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count),
    [stats?.status_distribution],
  );

  const statusTotal = useMemo(
    () => statusEntries.reduce((acc, item) => acc + item.count, 0),
    [statusEntries],
  );
  const maxStatusCount = useMemo(
    () => Math.max(1, ...statusEntries.map((item) => item.count)),
    [statusEntries],
  );
  const statusPie = useMemo(
    () => buildPieArcs(
      statusEntries.map(({ status, count }) => [status, count] as [string, number]),
      statusTotal,
    ),
    [statusEntries, statusTotal],
  );
  const statusArcs = useMemo(
    () => statusEntries.map((entry, index) => ({
      ...entry,
      color: STATUS_COLORS[index % STATUS_COLORS.length],
    })),
    [statusEntries],
  );

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        프로젝트를 선택하세요
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-40" />
        <div className="grid gap-4 xl:grid-cols-2">
          <Skeleton className="h-[300px]" />
          <Skeleton className="h-[300px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Overview</h1>
          <p className="text-sm text-muted-foreground">실시간 프로젝트 통계</p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onClick={handleRefresh} isRefreshing={isRefreshing} />
        </div>
      </div>

      {error && (
        <Card>
          <CardContent className="py-4 text-sm text-red-500">
            {error}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>요청/요건 카운터</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <svg viewBox="0 0 720 320" className="w-full h-72">
                {counterRows.map((row, rowIndex) => {
                  const baseY = 280;
                  const startX = 24 + rowIndex * 95;
                  return (
                    <g key={row.key}>
                      <text x={startX + 2} y={20} fill="currentColor" className="text-xs opacity-70">
                        {row.label}
                      </text>
                      {row.values.map((value, valueIndex) => {
                        const barHeight = (value.value / maxCounterValue) * 220;
                        const barY = baseY - barHeight;
                        const barX = startX + valueIndex * 22;
                        return (
                          <rect
                            key={`${row.key}-${value.metric}`}
                            x={barX}
                            y={barY}
                            width={16}
                            height={barHeight}
                            rx={4}
                            fill={value.color}
                          />
                        );
                      })}
                      {row.values.map((value, valueIndex) => {
                        const barHeight = (value.value / maxCounterValue) * 220;
                        const barY = baseY - barHeight;
                        return (
                          <text
                            key={`${row.key}-${value.metric}-label`}
                            x={startX + valueIndex * 22 + 1}
                            y={Math.max(barY - 6, 15)}
                            fill="currentColor"
                            className="text-[10px] opacity-70"
                          >
                            {value.value}
                          </text>
                        );
                      })}
                    </g>
                  );
                })}

                {[0, 1, 2, 3, 4].map((line) => {
                  const y = 80 + line * 45;
                  return (
                    <line
                      key={`grid-${line}`}
                      x1={12}
                      x2={706}
                      y1={y}
                      y2={y}
                      stroke="currentColor"
                      strokeWidth="1"
                      className="opacity-10"
                    />
                  );
                })}
                {COUNTER_COLUMNS.map((metric, index) => (
                  <text
                    key={metric.key}
                    x={42 + index * 22 - 8}
                    y={308}
                    fill="currentColor"
                    className="text-[11px] opacity-70"
                  >
                    {metric.label}
                  </text>
                ))}
              </svg>
              <div className="flex flex-wrap gap-3 text-xs">
                {COUNTER_COLUMNS.map((metric) => (
                  <span key={metric.key} className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: metric.color }} />
                    {metric.label}
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>완료율</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center">
                <svg width={160} height={160} viewBox={`0 0 ${PIE_SIZE} ${PIE_SIZE}`} className="max-w-full h-auto">
                  <circle
                    cx={PIE_CENTER}
                    cy={PIE_CENTER}
                    r={PIE_RADIUS}
                    stroke="currentColor"
                    strokeWidth="16"
                    fill="none"
                    className="opacity-10"
                  />
                  <circle
                    cx={PIE_CENTER}
                    cy={PIE_CENTER}
                    r={PIE_RADIUS}
                    stroke="#60a5fa"
                    strokeWidth="16"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
                    strokeDashoffset={completionOffset}
                    transform={`rotate(-90 ${PIE_CENTER} ${PIE_CENTER})`}
                    className="transition-all"
                  />
                  <text x={PIE_CENTER} y={PIE_CENTER - 4} textAnchor="middle" className="text-2xl font-bold fill-current">
                    {completionRate.toFixed(1)}%
                  </text>
                  <text x={PIE_CENTER} y={PIE_CENTER + 18} textAnchor="middle" className="text-xs fill-muted-foreground">
                    Done / Total Requests
                  </text>
                </svg>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>요청 상태 분포</CardTitle>
            </CardHeader>
            <CardContent>
              {statusEntries.length === 0 ? (
                <div className="text-sm text-muted-foreground">요청 데이터가 없습니다.</div>
              ) : (
                <div className="grid gap-5 lg:grid-cols-[1fr_220px] items-center">
                  <div>
                    <svg viewBox={`0 0 ${PIE_SIZE} ${PIE_SIZE}`} className="w-full h-auto">
                      {statusPie.map((arc, index) => (
                        <path
                          key={`status-arc-${index}`}
                          d={arc.path}
                          fill={statusArcs[index]?.color}
                        />
                      ))}
                      <circle cx={PIE_CENTER} cy={PIE_CENTER} r={55} className="fill-background" />
                      <text x={PIE_CENTER} y={PIE_CENTER - 6} textAnchor="middle" className="text-xs font-semibold fill-current">
                        total
                      </text>
                      <text x={PIE_CENTER} y={PIE_CENTER + 10} textAnchor="middle" className="text-[10px] fill-muted-foreground">
                        {statusTotal}
                      </text>
                    </svg>
                  </div>
                  <div className="space-y-2">
                    {statusArcs.map((entry, index) => (
                      <div key={entry.status} className="text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                            <span>{entry.status}</span>
                          </span>
                          <span className="font-medium">{entry.count}</span>
                        </div>
                        <div className="mt-1 h-2 rounded bg-muted overflow-hidden">
                          <div
                            className="h-full transition-all"
                            style={{
                              width: `${(entry.count / maxStatusCount) * 100}%`,
                              backgroundColor: entry.color,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AgentPerformance ref={agentRef} onRefresh={fetchStats} />
    </div>
  );
}
