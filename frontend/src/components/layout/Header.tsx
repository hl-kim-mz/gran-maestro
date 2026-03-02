import { useState } from 'react';
import { useAppContext } from '@/context/AppContext';
import { SseStatusDot } from '@/components/shared/SseStatusDot';
import { Button } from '@/components/ui/button';
import { Moon, Sun, Bell, Terminal, HelpCircle, Archive, Zap } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NotificationPanel } from './NotificationPanel';
import { Badge } from '@/components/ui/badge';

export function Header({ onShowShortcuts }: { onShowShortcuts: () => void }) {
  const { sseStatus, theme, setTheme, notifications, projectId, setProjectId, projects, modeStatus } = useAppContext();
  const unreadCount = notifications.filter(n => !n.read).length;

  const [isArchiving, setIsArchiving] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleArchiveAll = async () => {
    setIsArchiving(true);
    try {
      const path = projectId
        ? `/api/projects/${projectId}/manage/archive-all`
        : '/api/manage/archive-all';
      const response = await fetch(path, { method: 'POST' });
      const result = await response.json() as { success: boolean; message?: string; error?: string };
      if (result.success) {
        alert(result.message ?? '[Archive] 정리 완료');
      } else {
        alert(`정리 실패: ${result.error ?? '알 수 없는 오류'}`);
      }
    } catch (err) {
      alert(`정리 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <header className="flex items-center justify-between px-6 py-3 border-bottom bg-background sticky top-0 z-40">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-primary font-bold text-lg">
          <Terminal className="h-6 w-6" />
          <span>Gran Maestro</span>
        </div>
        <div className="h-4 w-[1px] bg-border mx-2" />
        <SseStatusDot status={sseStatus} />
        {projects.length > 0 && (
          <>
            <div className="h-4 w-[1px] bg-border mx-2" />
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-48 h-8 text-sm">
                <SelectValue placeholder="프로젝트 선택" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name || p.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
        {modeStatus && (
          <>
            <div className="h-4 w-[1px] bg-border mx-2" />
            <Badge
              variant={modeStatus.active ? 'default' : 'secondary'}
              className="flex items-center gap-1 text-xs"
            >
              <Zap className="h-3 w-3" />
              {modeStatus.active ? 'Maestro ON' : 'Maestro OFF'}
            </Badge>
            {modeStatus.active && modeStatus.current_phase != null && (
              <Badge variant="outline" className="text-xs">
                {modeStatus.current_req
                  ? `${modeStatus.current_req} — Phase ${modeStatus.current_phase}`
                  : `Phase ${modeStatus.current_phase}`}
              </Badge>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleArchiveAll}
          disabled={isArchiving}
          title="세션 정리"
        >
          <Archive className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={onShowShortcuts}>
          <HelpCircle className="h-5 w-5" />
        </Button>

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px]" variant="destructive">
                  {unreadCount}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Notifications</SheetTitle>
            </SheetHeader>
            <NotificationPanel onNavigate={() => setSheetOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
