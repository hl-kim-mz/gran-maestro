import { useState } from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import { Header } from './components/layout/Header';
import { TabNav } from './components/layout/TabNav';
import { Tabs, TabsContent } from './components/ui/tabs';
import { KeyboardShortcutsModal } from './components/shared/KeyboardShortcutsModal';

// Views
import { PlansView } from './views/PlansView';
import { WorkflowView } from './views/WorkflowView';
import { IdeationView } from './views/IdeationView';
import { DebugView } from './views/DebugView';
import { DocumentsView } from './views/DocumentsView';
import { SettingsView } from './views/SettingsView';

function AppContent() {
  const { token, authRequired } = useAppContext();
  const [activeTab, setActiveTab] = useState('plans');
  const [showShortcuts, setShowShortcuts] = useState(false);

  if (authRequired && !token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8">
        <div className="max-w-md w-full border rounded-lg p-8 shadow-lg text-center bg-card">
          <h1 className="text-2xl font-bold mb-4">Token Required</h1>
          <p className="text-muted-foreground mb-6">
            Please access the dashboard with a valid token in the URL.
            <br />
            <code className="text-xs bg-muted px-2 py-1 rounded">?token=YOUR_TOKEN</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <Header onShowShortcuts={() => setShowShortcuts(true)} />
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onToggleShortcuts={() => setShowShortcuts((prev) => !prev)}
        />
        <div className="flex-1 overflow-hidden relative">
          <TabsContent value="plans" className="absolute inset-0 m-0">
            <PlansView />
          </TabsContent>
          <TabsContent value="workflow" className="absolute inset-0 m-0">
            <WorkflowView />
          </TabsContent>
          <TabsContent value="ideation" className="absolute inset-0 m-0">
            <IdeationView />
          </TabsContent>
          <TabsContent value="debug" className="absolute inset-0 m-0">
            <DebugView />
          </TabsContent>
          <TabsContent value="documents" className="absolute inset-0 m-0">
            <DocumentsView />
          </TabsContent>
          <TabsContent value="settings" className="absolute inset-0 m-0">
            <SettingsView />
          </TabsContent>
        </div>
      </Tabs>
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
