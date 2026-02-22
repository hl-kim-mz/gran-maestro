import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type StatusType = 'pending' | 'active' | 'done' | 'failed' | 'cancelled' | string;

export function StatusBadge({ status, className }: { status: StatusType; className?: string }) {
  const getVariant = (s: string) => {
    switch (s.toLowerCase()) {
      case 'done':
      case 'completed':
      case 'success':
        return 'default'; // In shadcn default is often blue or primary
      case 'active':
      case 'running':
      case 'processing':
        return 'secondary';
      case 'failed':
      case 'error':
        return 'destructive';
      case 'pending':
      case 'waiting':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const colors: Record<string, string> = {
    done: 'bg-green-500 hover:bg-green-600 text-white border-none',
    completed: 'bg-green-500 hover:bg-green-600 text-white border-none',
    active: 'bg-blue-500 hover:bg-blue-600 text-white border-none',
    failed: 'bg-red-500 hover:bg-red-600 text-white border-none',
    pending: 'text-muted-foreground',
  };

  const statusKey = status.toLowerCase();
  const colorClass = colors[statusKey] || '';

  return (
    <Badge variant={getVariant(status) as any} className={cn(colorClass, className)}>
      {status}
    </Badge>
  );
}
