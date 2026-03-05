import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface TimelineCapture {
  status: 'pending' | 'selected' | 'consumed' | 'done' | 'cancelled' | 'archived';
  linked_plan: string | null;
  linked_request: string | null;
  created_at: string;
  consumed_at: string | null;
  done_at?: string | null;
}

interface LifecycleTimelineProps {
  capture: TimelineCapture;
  className?: string;
}

interface RelativeTimeInput {
  timeLabel: string | null;
}

function formatRelativeTime(iso: string | null | undefined): RelativeTimeInput['timeLabel'] {
  if (!iso) return null;

  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const delta = d.getTime() - Date.now();
  const seconds = Math.round(delta / 1000);
  const absSeconds = Math.abs(seconds);

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  if (absSeconds < 60) return formatter.format(Math.round(seconds), 'second');
  const absMinutes = Math.round(seconds / 60);
  if (Math.abs(absMinutes) < 60) return formatter.format(absMinutes, 'minute');
  const absHours = Math.round(seconds / (60 * 60));
  if (Math.abs(absHours) < 24) return formatter.format(absHours, 'hour');
  const absDays = Math.round(seconds / (60 * 60 * 24));
  if (Math.abs(absDays) < 30) return formatter.format(absDays, 'day');
  const absMonths = Math.round(seconds / (60 * 60 * 24 * 30));
  if (Math.abs(absMonths) < 12) return formatter.format(absMonths, 'month');

  return formatter.format(Math.round(seconds / (60 * 60 * 24 * 365)), 'year');
}

const STATUS_ACTIVE_INDEX: Record<TimelineCapture['status'], number> = {
  pending: 0,
  selected: 1,
  consumed: 2,
  done: 3,
  cancelled: 3,
  archived: 3,
};

const STAGE_COLORS = {
  0: {
    bg: 'bg-slate-500 dark:bg-slate-400',
    border: 'border-slate-500 dark:border-slate-400',
    text: 'text-slate-600 dark:text-slate-400',
    line: 'border-t-2 border-slate-500 dark:border-slate-400',
  },
  1: {
    bg: 'bg-blue-500 dark:bg-blue-400',
    border: 'border-blue-500 dark:border-blue-400',
    text: 'text-blue-600 dark:text-blue-400',
    line: 'border-t-2 border-blue-500 dark:border-blue-400',
  },
  2: {
    bg: 'bg-indigo-500 dark:bg-indigo-400',
    border: 'border-indigo-500 dark:border-indigo-400',
    text: 'text-indigo-600 dark:text-indigo-400',
    line: 'border-t-2 border-indigo-500 dark:border-indigo-400',
  },
  3: {
    bg: 'bg-emerald-500 dark:bg-emerald-400',
    border: 'border-emerald-500 dark:border-emerald-400',
    text: 'text-emerald-600 dark:text-emerald-400',
    line: 'border-t-2 border-emerald-500 dark:border-emerald-400',
  },
} as const;

const DONE_COLORS = {
  bg: 'bg-emerald-500 dark:bg-emerald-400',
  border: 'border-emerald-500 dark:border-emerald-400',
  text: 'text-emerald-600 dark:text-emerald-400',
  line: 'border-t-2 border-emerald-500 dark:border-emerald-400',
};

const CANCELLED_COLORS = {
  bg: 'bg-red-500 dark:bg-red-400',
  border: 'border-red-500 dark:border-red-400',
  text: 'text-red-600 dark:text-red-400',
  line: 'border-t-2 border-red-500 dark:border-red-400',
};

const INACTIVE_COLORS = {
  bg: 'bg-background',
  border: 'border-muted-foreground/35',
  text: 'text-muted-foreground/80',
  line: 'border-t-2 border-dashed border-muted-foreground/30',
};

function getMode(status: TimelineCapture['status']): 'done' | 'cancelled' | 'active' | 'pending' {
  if (status === 'done' || status === 'archived') return 'done';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'pending') return 'pending';
  return 'active';
}

function getColors(index: number, mode: ReturnType<typeof getMode>, isActive: boolean) {
  if (!isActive) return INACTIVE_COLORS;
  if (mode === 'done') return DONE_COLORS;
  if (mode === 'cancelled') return CANCELLED_COLORS;
  return STAGE_COLORS[index as keyof typeof STAGE_COLORS] ?? STAGE_COLORS[0];
}

export function LifecycleTimeline({ capture, className = '' }: LifecycleTimelineProps) {
  const navigate = useNavigate();

  const { activeIndex, mode } = useMemo(() => ({
    activeIndex: STATUS_ACTIVE_INDEX[capture.status] ?? 0,
    mode: getMode(capture.status),
  }), [capture.status]);

  const doneTimestamp = capture.done_at ?? capture.consumed_at ?? null;

  const stages = [
    { label: 'Capture', link: null, timestamp: formatRelativeTime(capture.created_at) },
    {
      label: 'Plan',
      link: capture.linked_plan,
      timestamp: formatRelativeTime(
        activeIndex >= 1 ? capture.consumed_at ?? capture.created_at : null,
      ),
    },
    {
      label: 'Request',
      link: capture.linked_request,
      timestamp: formatRelativeTime(capture.consumed_at),
    },
    {
      label: capture.status === 'cancelled' ? 'Cancelled' : 'Done',
      link: null,
      timestamp: formatRelativeTime(doneTimestamp),
    },
  ] as const;

  return (
    <Card className={className}>
      <CardContent className="p-4">
        <h3 className="mb-4 text-sm font-semibold">Lifecycle Timeline</h3>
        <div className="flex items-start">
          {stages.map((stage, index) => {
            const isActive = index <= activeIndex;
            const isConnectorActive = index < activeIndex;
            
            const nodeColors = getColors(index, mode, isActive);
            const lineColors = getColors(index, mode, isConnectorActive);

            return (
              <div key={stage.label} className="flex min-w-0 flex-1 items-start">
                <div className="flex w-full flex-col items-center text-center">
                  <div className={`relative mx-auto flex h-5 w-5 items-center justify-center rounded-full border-2 ${nodeColors.bg} ${nodeColors.border}`}>
                    {index < activeIndex && (
                      <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                    )}
                  </div>
                  <div className="mt-2 flex w-full flex-col items-center space-y-1 px-1">
                    <div className={`text-sm font-semibold ${nodeColors.text}`}>{stage.label}</div>
                    {stage.link && index === 1 && (
                      <button
                        type="button"
                        onClick={() => navigate(`/plans/${stage.link}`)}
                        className="inline-flex max-w-[100px] items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-mono text-primary hover:bg-primary/10"
                      >
                        <span className="truncate">{stage.link}</span>
                      </button>
                    )}
                    {stage.link && index === 2 && (
                      <button
                        type="button"
                        onClick={() => navigate(`/workflow/${stage.link}`)}
                        className="inline-flex max-w-[100px] items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-mono text-primary hover:bg-primary/10"
                      >
                        <span className="truncate">{stage.link}</span>
                      </button>
                    )}
                    {isActive && stage.timestamp && (
                      <div className="text-[11px] text-muted-foreground">{stage.timestamp}</div>
                    )}
                  </div>
                </div>
                {index < stages.length - 1 && (
                  <div className={`mt-2.5 flex-1 ${lineColors.line}`} />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
