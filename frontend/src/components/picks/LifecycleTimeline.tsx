import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

interface TimelineCapture {
  status: 'pending' | 'selected' | 'consumed' | 'done' | 'archived';
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
  archived: 3,
};

const NODE_CLASS_BY_MODE = {
  done: 'border-green-500 bg-green-500 text-white',
  active: 'border-blue-500 bg-blue-500 text-white',
  pending: 'border-amber-500 bg-amber-500 text-white',
  inactive: 'border-muted-foreground/35 bg-background text-muted-foreground/80',
};

const TEXT_CLASS_BY_MODE = {
  done: 'text-green-600',
  active: 'text-blue-600',
  pending: 'text-amber-600',
  inactive: 'text-muted-foreground/80',
};

function getMode(status: TimelineCapture['status']): 'done' | 'active' | 'pending' {
  if (status === 'done' || status === 'archived') return 'done';
  if (status === 'pending') return 'pending';
  return 'active';
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
    { label: 'Done', link: null, timestamp: formatRelativeTime(doneTimestamp) },
  ] as const;

  return (
    <div className={`rounded-lg border p-4 ${className}`}>
      <h3 className="mb-4 text-sm font-semibold">Lifecycle Timeline</h3>
      <div className="flex items-start">
        {stages.map((stage, index) => {
          const isActive = index <= activeIndex;
          const isConnectorActive = index < activeIndex;
          const nodeClass = isActive ? NODE_CLASS_BY_MODE[mode] : NODE_CLASS_BY_MODE.inactive;
          const textClass = isActive ? TEXT_CLASS_BY_MODE[mode] : TEXT_CLASS_BY_MODE.inactive;
          const connectorClass = isConnectorActive
            ? mode === 'done'
              ? 'border-t-2 border-green-500'
              : mode === 'pending'
                ? 'border-t-2 border-amber-500'
                : 'border-t-2 border-blue-500'
            : 'border-t-2 border-dashed border-muted-foreground/40';

          return (
            <div key={stage.label} className="flex min-w-0 flex-1 items-start">
              <div className="flex w-full flex-col items-center text-center">
                <div className={`relative mx-auto h-4 w-4 rounded-full border-2 ${nodeClass}`} />
                <div className="mt-2 space-y-1">
                  <div className={`text-xs font-semibold ${textClass}`}>{stage.label}</div>
                  {stage.link && index === 1 && (
                    <button
                      type="button"
                      onClick={() => navigate(`/plans/${stage.link}`)}
                      className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-mono text-primary hover:bg-primary/10"
                    >
                      {stage.link}
                    </button>
                  )}
                  {stage.link && index === 2 && (
                    <button
                      type="button"
                      onClick={() => navigate(`/workflow/${stage.link}`)}
                      className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-mono text-primary hover:bg-primary/10"
                    >
                      {stage.link}
                    </button>
                  )}
                  {isActive && stage.timestamp && (
                    <div className="text-[11px] text-muted-foreground">{stage.timestamp}</div>
                  )}
                </div>
              </div>
              {index < stages.length - 1 && (
                <div className={`mt-2 flex-1 ${connectorClass}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
