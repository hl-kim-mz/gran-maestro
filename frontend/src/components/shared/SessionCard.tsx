import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/shared/StatusBadge';

interface SessionCardProps {
  id: string;
  title: string;
  status: string;
  createdAt?: string;
  icon?: React.ReactNode;
  extraBadge?: string;
  extraLinks?: string[];
  isSelected: boolean;
  onClick: () => void;
  onExtraLinkClick?: (id: string) => void;
}

function formatDateTime(iso?: string): string | null {
  if (!iso) return null;
  return iso.replace('T', ' ').slice(0, 16);
}

export function SessionCard({
  id,
  title,
  status,
  createdAt,
  icon,
  extraBadge,
  extraLinks,
  isSelected,
  onClick,
  onExtraLinkClick,
}: SessionCardProps) {
  const dateTime = formatDateTime(createdAt);

  return (
    <Card
      className={`cursor-pointer transition-colors hover:bg-accent/50 ${isSelected ? 'border-primary ring-1 ring-primary' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex justify-between items-start mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {icon}
            <Badge variant="outline" className="text-[10px] font-mono">{id}</Badge>
          </div>
          <StatusBadge status={status} />
        </div>
        <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1">{title}</p>
        {(extraBadge || (extraLinks && extraLinks.length > 0) || dateTime) && (
          <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-muted-foreground flex-wrap">
            {extraBadge && <Badge variant="secondary" className="text-[10px]">{extraBadge}</Badge>}
            {extraLinks && extraLinks.length > 0 && (
              <span>
                {extraLinks.length === 1 ? (
                  onExtraLinkClick ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onExtraLinkClick(extraLinks[0]);
                      }}
                      className="inline-flex items-center gap-1 text-primary/90 hover:underline"
                    >
                      🔗
                      <Badge variant="secondary" className="text-[10px]">{extraLinks[0]}</Badge>
                    </button>
                  ) : (
                    <span>🔗 {extraLinks[0]}</span>
                  )
                ) : (
                  `🔗 ${extraLinks.length}개 요청`
                )}
              </span>
            )}
            {dateTime && <span>{dateTime}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
