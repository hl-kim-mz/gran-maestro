import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  GitBranch,
  Lightbulb,
  Bug,
  Palette,
  Files,
  Crosshair,
  Settings,
} from 'lucide-react';
import { useEffect } from 'react';
import { useAppContext } from '@/context/AppContext';

export const TABS = [
  { id: 'plans', label: 'Plans', icon: LayoutDashboard, key: '1', path: '/plans' },
  { id: 'workflow', label: 'Workflow', icon: GitBranch, key: '2', path: '/workflow' },
  { id: 'picks', label: 'Picks', icon: Crosshair, key: '8', path: '/picks' },
  { id: 'ideation', label: 'Ideation', icon: Lightbulb, key: '3', path: '/ideation' },
  { id: 'debug', label: 'Debug', icon: Bug, key: '4', path: '/debug' },
  { id: 'designs', label: 'Designs', icon: Palette, key: '5', path: '/designs' },
  { id: 'documents', label: 'Documents', icon: Files, key: '6', path: '/documents' },
  { id: 'settings', label: 'Settings', icon: Settings, key: '7', path: '/settings' },
];

export function TabNav({
  onToggleShortcuts,
}: {
  onToggleShortcuts: () => void;
}) {
  const { theme, setTheme } = useAppContext();
  const navigate = useNavigate();

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
        navigate(tab.path);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, onToggleShortcuts, setTheme, theme]);

  return (
    <div className="bg-background border-b px-6">
      <nav className="bg-transparent h-12 flex gap-6 p-0 items-center">
        {TABS.map((tab) => (
          <NavLink
            key={tab.id}
            to={tab.path}
            end={tab.id === 'plans'}
            className={({ isActive }) =>
              `flex items-center h-full px-2 gap-2 rounded-none transition-colors border-b-2 ${
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`
            }
          >
            <tab.icon className="h-4 w-4" />
            <span>{tab.label}</span>
            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded opacity-50">{tab.key}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
