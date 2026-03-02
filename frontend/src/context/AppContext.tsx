import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useSse, SSEStatus } from '../hooks/useSse';
import { apiFetch } from '../hooks/useApi';

interface Project {
  id: string;
  name: string;
  path: string;
}

export interface CompletionNotification {
  id: string;        // REQ-NNN, DBG-NNN 등
  read: boolean;
  receivedAt: string; // ISO 8601 타임스탬프
}

interface AppContextType {
  projectId: string;
  setProjectId: (id: string) => void;
  projects: Project[];
  sseStatus: SSEStatus;
  notifications: CompletionNotification[];
  markAsRead: (id: string) => void;
  clearNotifications: () => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  lastSseEvent: any | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  navigateTo: (tab: string, selectedId?: string) => void;
  pendingNavigation: { tab: string; selectedId?: string } | null;
  clearPendingNavigation: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const { projectId: initialProjectId } = useAuth();
  const [projectId, setProjectIdState] = useState<string>(initialProjectId);
  const [projects, setProjects] = useState<Project[]>([]);
  const [notifications, setNotifications] = useState<CompletionNotification[]>([]);
  const [lastSseEvent, setLastSseEvent] = useState<any | null>(null);
  const [theme, setThemeState] = useState<'light' | 'dark'>(
    () => (localStorage.getItem('theme') as 'light' | 'dark') || 'light'
  );
  const [activeTab, setActiveTab] = useState<string>('plans');
  const [pendingNavigation, setPendingNavigation] = useState<{ tab: string; selectedId?: string } | null>(null);

  const setTheme = useCallback((newTheme: 'light' | 'dark') => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  }, []);

  const setProjectId = useCallback((id: string) => {
    setProjectIdState(id);
    sessionStorage.setItem('gm_project', id);
  }, []);

  const setActiveTabState = useCallback((tab: string) => {
    setActiveTab(tab);
  }, []);

  const clearPendingNavigation = useCallback(() => {
    setPendingNavigation(null);
  }, []);

  const navigateTo = useCallback((tab: string, selectedId?: string) => {
    setActiveTab(tab);
    if (selectedId) {
      setPendingNavigation({ tab, selectedId });
    } else {
      setPendingNavigation({ tab });
    }
  }, [setActiveTabState]);

  // Initialize theme on mount
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Load project list on mount
  useEffect(() => {
    apiFetch<Project[]>('/api/projects').then((data) => {
      const filtered = data.filter(p => !p.path.includes('/gran-maestro/frontend'));
      setProjects(filtered);
      if (projectId && filtered.length > 0 && !filtered.find(p => p.id === projectId)) {
        console.warn('프로젝트를 찾을 수 없습니다. 첫 번째 프로젝트로 전환합니다.');
        setProjectId(filtered[0].id);
      }
    }).catch((err) => {
      console.error('Failed to fetch projects:', err);
    });
  }, []);

  const onSseEvent = useCallback((event: any) => {
    const eventType = event?.type;
    if (eventType === 'heartbeat' || eventType === 'connected') return;

    if (eventType === 'completion_alert' && event.data?.id) {
      setNotifications(prev => {
        const next = [{ id: event.data.id, read: false, receivedAt: new Date().toISOString() }, ...prev];
        return next.slice(0, 50);
      });
    }

    setLastSseEvent(event);
    // Trigger re-fetches or other logic based on event type if needed
  }, []);

  const { status: sseStatus } = useSse(onSseEvent);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  return (
    <AppContext.Provider value={{
      projectId,
      setProjectId,
      projects,
      sseStatus,
      notifications,
      markAsRead,
      clearNotifications,
      theme,
      setTheme,
      lastSseEvent,
      activeTab,
      setActiveTab: setActiveTabState,
      navigateTo,
      pendingNavigation,
      clearPendingNavigation,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
