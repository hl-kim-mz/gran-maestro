import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/shared/StatusBadge';

interface SessionCardProps {
  id: string;
  title: string;
  status: string;
  createdAt?: string;
  icon?: React.ReactNode;
  hasDesign?: boolean;
  extraBadge?: string;
  reviewBadge?: string;
  extraLinks?: string[];
  isSelected: boolean;
  onClick: () => void;
  onExtraLinkClick?: (id: string) => void;
}

function formatDateTime(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 16);
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

export function SessionCard({
  id,
  title,
  status,
  createdAt,
  icon,
  hasDesign,
  extraBadge,
  reviewBadge,
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
      <CardContent className="p-2">
        <div className="flex justify-between items-start mb-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {icon}
            <Badge variant="outline" className="text-[10px] font-mono">{id}</Badge>
            {hasDesign && <span className="text-[11px]" title="Design 시안 있음">🎨</span>}
          </div>
          <StatusBadge status={status} />
        </div>
        <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{title}</p>
        {(extraBadge || reviewBadge || (extraLinks && extraLinks.length > 0) || dateTime) && (
          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground flex-wrap">
            {extraBadge && <Badge variant="secondary" className="text-[10px]">{extraBadge}</Badge>}
            {reviewBadge && <Badge variant="outline" className="text-[10px] text-purple-600 border-purple-400">{reviewBadge}</Badge>}
            {extraLinks && extraLinks.length > 0 && (
              <span className="inline-flex items-center gap-1 flex-wrap">
                {extraLinks.slice(0, 10).map((link) =>
                  onExtraLinkClick ? (
                    <button key={link} type="button"
                      onClick={(e) => { e.stopPropagation(); onExtraLinkClick(link); }}
                      className="inline-flex items-center gap-1 text-primary/90 hover:underline"
                    >
                      🔗 <Badge variant="secondary" className="text-[10px]">{link}</Badge>
                    </button>
                  ) : (
                    <span key={link}>🔗 {link}</span>
                  )
                )}
                {extraLinks.length > 10 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{extraLinks.length - 10}개 더
                  </span>
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
