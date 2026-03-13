import { useMemo } from 'react';

type StatusStackedBarProps = {
  distribution: Record<string, number>;
};

const STATUS_COLOR_MAP: Record<string, string> = {
  done: '#22c55e',
  completed: '#22c55e',
  success: '#22c55e',
  active: '#3b82f6',
  running: '#3b82f6',
  executing: '#3b82f6',
  pending: '#f59e0b',
  queued: '#a855f7',
  review: '#8b5cf6',
  feedback: '#f97316',
  blocked: '#ef4444',
  failed: '#ef4444',
  error: '#ef4444',
  cancelled: '#64748b',
};

const FALLBACK_COLORS = ['#0ea5e9', '#14b8a6', '#f43f5e', '#eab308', '#6366f1', '#f97316', '#84cc16'];

function normalizeCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function toLabel(status: string): string {
  if (!status) return 'unknown';
  return status.replace(/_/g, ' ');
}

function resolveColor(status: string, index: number): string {
  return STATUS_COLOR_MAP[status.toLowerCase()] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

export function StatusStackedBar({ distribution }: StatusStackedBarProps) {
  const entries = useMemo(
    () => Object.entries(distribution ?? {})
      .map(([status, count]) => ({ status, count: normalizeCount(count) }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count),
    [distribution],
  );

  const total = useMemo(
    () => entries.reduce((sum, entry) => sum + entry.count, 0),
    [entries],
  );

  if (entries.length === 0 || total === 0) {
    return <p className="text-sm text-muted-foreground">요청 상태 데이터가 없습니다.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-muted">
        {entries.map((entry, index) => {
          const width = (entry.count / total) * 100;
          return (
            <div
              key={entry.status}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{
                width: `${width}%`,
                backgroundColor: resolveColor(entry.status, index),
              }}
            />
          );
        })}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {entries.map((entry, index) => {
          const ratio = (entry.count / total) * 100;
          return (
            <div key={`${entry.status}-legend`} className="flex items-center justify-between gap-3 text-sm">
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: resolveColor(entry.status, index) }}
                />
                {toLabel(entry.status)}
              </span>
              <span className="font-medium text-foreground">
                {entry.count} ({ratio.toFixed(1)}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
