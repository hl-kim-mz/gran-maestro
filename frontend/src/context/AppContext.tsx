import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useSse, SSEStatus } from '../hooks/useSse';
import { apiFetch } from '../hooks/useApi';

interface Project {
  id: string;
  name: string;
}

interface AppContextType {
  token: string;
  projectId: string;
  setProjectId: (id: string) => void;
  projects: Project[];
  sseStatus: SSEStatus;
  authRequired: boolean;
  notifications: any[];
  addNotification: (notification: any) => void;
  clearNotifications: () => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const { token, projectId: initialProjectId } = useAuth();
  const [projectId, setProjectIdState] = useState<string>(initialProjectId);
  const [projects, setProjects] = useState<Project[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [authRequired, setAuthRequired] = useState<boolean>(true);
  const [theme, setThemeState] = useState<'light' | 'dark'>(
    () => (localStorage.getItem('theme') as 'light' | 'dark') || 'light'
  );

  const setTheme = useCallback((newTheme: 'light' | 'dark') => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  }, []);

  const setProjectId = useCallback((id: string) => {
    setProjectIdState(id);
    sessionStorage.setItem('gm_project', id);
  }, []);

  // Initialize theme on mount
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    fetch('/api/auth/status')
      .then((response) => response.json())
      .then((data: { auth_required: boolean }) => {
        setAuthRequired(data.auth_required);
      })
      .catch(() => {
        // keep default true
      });
  }, []);

  // Load project list on mount
  useEffect(() => {
    if (authRequired && !token) return;
    apiFetch<Project[]>('/api/projects', token).then((data) => {
      setProjects(data);
    }).catch((err) => {
      console.error('Failed to fetch projects:', err);
    });
  }, [token, authRequired]);

  const onSseEvent = useCallback((event: any) => {
    setNotifications(prev => [event, ...prev].slice(0, 50));
    // Trigger re-fetches or other logic based on event type if needed
  }, []);

  const { status: sseStatus } = useSse(token, onSseEvent);

  const addNotification = useCallback((n: any) => {
    setNotifications(prev => [n, ...prev].slice(0, 50));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  return (
    <AppContext.Provider value={{
      token,
      projectId,
      setProjectId,
      projects,
      sseStatus,
      authRequired,
      notifications,
      addNotification,
      clearNotifications,
      theme,
      setTheme
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
