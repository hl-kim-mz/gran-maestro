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
  const { activeTab, setActiveTab } = useAppContext();
  const [showShortcuts, setShowShortcuts] = useState(false);

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
          <TabsContent value="plans" className="absolute inset-0 m-0 overflow-hidden">
            <PlansView />
          </TabsContent>
          <TabsContent value="workflow" className="absolute inset-0 m-0 overflow-hidden">
            <WorkflowView />
          </TabsContent>
          <TabsContent value="ideation" className="absolute inset-0 m-0 overflow-hidden">
            <IdeationView />
          </TabsContent>
          <TabsContent value="debug" className="absolute inset-0 m-0 overflow-hidden">
            <DebugView />
          </TabsContent>
<TabsContent value="documents" className="absolute inset-0 m-0 overflow-hidden">
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
