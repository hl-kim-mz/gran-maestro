import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RefreshButtonProps {
  onClick: () => void;
  isRefreshing: boolean;
  className?: string;
}

export function RefreshButton({ onClick, isRefreshing, className }: RefreshButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={isRefreshing}
      className={cn('h-7 w-7', className)}
    >
      <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
    </Button>
  );
}
