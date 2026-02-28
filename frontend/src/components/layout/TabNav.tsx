import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  LayoutDashboard,
  GitBranch,
  Lightbulb,
  Bug,
  Files,
  Settings,
} from 'lucide-react';
import { useEffect } from 'react';
import { useAppContext } from '@/context/AppContext';

export const TABS = [
  { id: 'plans', label: 'Plans', icon: LayoutDashboard, key: '1' },
  { id: 'workflow', label: 'Workflow', icon: GitBranch, key: '2' },
  { id: 'ideation', label: 'Ideation', icon: Lightbulb, key: '3' },
  { id: 'debug', label: 'Debug', icon: Bug, key: '4' },
  { id: 'documents', label: 'Documents', icon: Files, key: '5' },
  { id: 'settings', label: 'Settings', icon: Settings, key: '6' },
];

export function TabNav({
  activeTab,
  onTabChange,
  onToggleShortcuts,
}: {
  activeTab: string;
  onTabChange: (id: string) => void;
  onToggleShortcuts: () => void;
}) {
  const { theme, setTheme } = useAppContext();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) return;

      if (e.key === '?') {
        onToggleShortcuts();
        return;
      }
      if (e.key === 't' || e.key === 'T') {
        setTheme(theme === 'dark' ? 'light' : 'dark');
        return;
      }

      const tab = TABS.find(t => t.key === e.key);
      if (tab) {
        onTabChange(tab.id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onTabChange, onToggleShortcuts, setTheme, theme]);

  return (
    <div className="bg-background border-b px-6">
      <TabsList className="bg-transparent h-12 gap-6 p-0">
        {TABS.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-2 gap-2 text-muted-foreground data-[state=active]:text-foreground"
          >
            <tab.icon className="h-4 w-4" />
            <span>{tab.label}</span>
            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded opacity-50">{tab.key}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  );
}
