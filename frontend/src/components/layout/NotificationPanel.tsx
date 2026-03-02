import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/context/AppContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';

export function NotificationPanel() {
  const navigate = useNavigate();
  const { notifications, clearNotifications, markAsRead } = useAppContext();

  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center py-4">
        <span className="text-sm text-muted-foreground">{notifications.length} messages</span>
        <Button variant="ghost" size="sm" onClick={clearNotifications}>Clear all</Button>
      </div>
      <ScrollArea className="flex-1 -mx-6 px-6">
        <div className="flex flex-col gap-4 pb-10">
          {notifications.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No notifications yet.
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className="flex items-center gap-2 border rounded-lg p-3 bg-card hover:bg-accent/50 transition-colors cursor-pointer"
                onClick={() => { navigate(n.route || '/'); markAsRead(n.id); }}
              >
                <div className={`h-2 w-2 rounded-full shrink-0 ${n.read ? 'bg-transparent' : 'bg-blue-500'}`} />
                <span className="flex-1 text-sm font-medium">{n.id} 종료</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{formatTime(n.receivedAt)}</span>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
