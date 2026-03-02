import { useState } from 'react';
import { AppProvider } from './context/AppContext';
import { Header } from './components/layout/Header';
import { TabNav } from './components/layout/TabNav';
import { KeyboardShortcutsModal } from './components/shared/KeyboardShortcutsModal';
import { AppRoutes } from './routes';

function AppContent() {
  const [showShortcuts, setShowShortcuts] = useState(false);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <Header onShowShortcuts={() => setShowShortcuts(true)} />
      <TabNav onToggleShortcuts={() => setShowShortcuts((prev) => !prev)} />
      <div className="flex-1 overflow-hidden relative">
        <AppRoutes />
      </div>
      <KeyboardShortcutsModal open={showShortcuts} onOpenChange={setShowShortcuts} />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
