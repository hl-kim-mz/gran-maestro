import { useAppContext } from '@/context/AppContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';

export function NotificationPanel() {
  const { notifications, clearNotifications } = useAppContext();

  const formatTaskUpdatePath = (path?: string) => {
    if (!path) return '';
    const fileName = path.split('/').filter(Boolean).pop() || '';
    const tmpIndex = fileName.indexOf('.tmp.');
    return tmpIndex >= 0 ? fileName.slice(0, tmpIndex) : fileName;
  };

  const getTaskUpdateKindLabel = (kind?: string) => {
    switch (kind) {
      case 'create':
        return '생성됨';
      case 'remove':
        return '삭제됨';
      case 'access':
        return '접근됨';
      case 'modify':
      case 'any':
        return '수정됨';
      default:
        return '변경됨';
    }
  };

  const getEventTypeLabel = (type: string) => {
    switch (type) {
      case 'request_update': return '요청 업데이트';
      case 'task_update': return '태스크 업데이트';
      case 'trace_update': return '트레이스';
      case 'plan_update': return '플랜 업데이트';
      case 'debug_update': return '디버그';
      case 'ideation_update': return '아이디에이션';
      case 'discussion_update': return '토론';
      case 'config_change': return '설정 변경';
      case 'phase_change': return '모드 변경';
      case 'agent_activity': return '에이전트 활동';
      default: return type || 'Event';
    }
  };

  const getNotificationTitle = (n: any) => {
    if (n.type === 'task_update' && n.requestId && n.taskId) {
      return `${n.requestId} / Task ${n.taskId}`;
    }
    if (n.type === 'trace_update' && n.requestId && n.taskId) {
      return `${n.requestId} / Task ${n.taskId}`;
    }
    if (n.type === 'plan_update' && n.planId) return n.planId;
    if (n.type === 'request_update' && n.requestId) return n.requestId;
    if ((n.type === 'debug_update' || n.type === 'ideation_update' || n.type === 'discussion_update') && n.sessionId) {
      return n.sessionId;
    }
    return getEventTypeLabel(n.type);
  };

  const renderNotification = (n: any) => {
    const fileName = formatTaskUpdatePath(n.data?.path);
    const kind = getTaskUpdateKindLabel(n.data?.kind);

    switch (n.type) {
      case 'task_update':
        if (n.requestId && n.taskId) return `${fileName} ${kind}`.trim();
        break;
      case 'trace_update':
        if (n.requestId && n.taskId) {
          const traceFile = formatTaskUpdatePath(n.data?.traceFile) || fileName;
          return `trace: ${traceFile} ${kind}`.trim();
        }
        break;
      case 'request_update':
        return `요청 · ${fileName} ${kind}`.trim();
      case 'plan_update':
        return `${fileName} ${kind}`.trim();
      case 'debug_update':
      case 'ideation_update':
      case 'discussion_update':
        return `${fileName} ${kind}`.trim();
      case 'config_change':
        return `설정 파일 ${kind}`;
      case 'phase_change':
        return '모드 상태 변경됨';
      case 'agent_activity':
        return `에이전트 활동 · ${fileName}`.trim();
    }

    return typeof n.data === 'string' ? n.data : JSON.stringify(n.data);
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
            notifications.map((n, i) => (
              <div key={i} className="border rounded-lg p-3 bg-card hover:bg-accent/50 transition-colors overflow-hidden">
                <div className="flex justify-between items-start mb-1 gap-2">
                  <span className="font-semibold text-xs uppercase tracking-wider text-primary truncate">
                    {getNotificationTitle(n)}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {new Date().toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-sm truncate">
                  {renderNotification(n)}
                </p>
                {n.projectId && (
                  <div className="mt-2 text-[10px] text-muted-foreground font-mono truncate">
                    Project: {n.projectId}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
