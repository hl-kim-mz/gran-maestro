import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type StatusType = 'pending' | 'active' | 'done' | 'failed' | 'cancelled' | string;

export function StatusBadge({ status, className }: { status: StatusType; className?: string }) {
  const getVariant = (s: string) => {
    switch (s.toLowerCase()) {
      case 'done':
      case 'completed':
      case 'success':
        return 'default';
      case 'active':
      case 'running':
      case 'processing':
      case 'executing':
      case 'merging':
        return 'secondary';
      case 'failed':
      case 'error':
      case 'pre_check_failed':
      case 'merge_conflict':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const colors: Record<string, string> = {
    done: 'bg-green-500 hover:bg-green-600 text-white border-none',
    completed: 'bg-green-500 hover:bg-green-600 text-white border-none',
    active: 'bg-blue-500 hover:bg-blue-600 text-white border-none',
    executing: 'bg-blue-500 hover:bg-blue-600 text-white border-none',
    running: 'bg-blue-500 hover:bg-blue-600 text-white border-none',
    merging: 'bg-teal-500 hover:bg-teal-600 text-white border-none',
    failed: 'bg-red-500 hover:bg-red-600 text-white border-none',
    pre_check_failed: 'bg-red-500 hover:bg-red-600 text-white border-none',
    merge_conflict: 'bg-orange-500 hover:bg-orange-600 text-white border-none',
    pending: 'text-amber-600 border-amber-400 dark:text-amber-400 dark:border-amber-500',
    queued: 'text-violet-600 border-violet-400 dark:text-violet-400 dark:border-violet-500',
    pre_check: 'text-yellow-600 border-yellow-400 dark:text-yellow-400 dark:border-yellow-500',
    review: 'text-purple-600 border-purple-400 dark:text-purple-400 dark:border-purple-500',
    feedback: 'text-orange-600 border-orange-400 dark:text-orange-400 dark:border-orange-500',
    cancelled: 'text-muted-foreground border-muted-foreground/40',
  };

  const statusKey = status.toLowerCase();
  const colorClass = colors[statusKey] || '';

  return (
    <Badge variant={getVariant(status) as any} className={cn(colorClass, className)}>
      {status}
    </Badge>
  );
}
