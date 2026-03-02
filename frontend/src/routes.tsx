import { Routes, Route, Navigate } from 'react-router-dom';
import { PlansView } from './views/PlansView';
import { WorkflowView } from './views/WorkflowView';
import { IdeationView } from './views/IdeationView';
import { DebugView } from './views/DebugView';
import { DesignView } from './views/DesignView';
import { DocumentsView } from './views/DocumentsView';
import { SettingsView } from './views/SettingsView';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/plans" replace />} />
      <Route path="/plans" element={<PlansView />} />
      <Route path="/plans/:planId" element={<PlansView />} />
      <Route path="/plans/:planId/tasks" element={<PlansView />} />
      <Route path="/workflow" element={<WorkflowView />} />
      <Route path="/workflow/:reqId" element={<WorkflowView />} />
      <Route path="/workflow/:reqId/spec" element={<WorkflowView />} />
      <Route path="/workflow/:reqId/tasks/:taskId" element={<WorkflowView />} />
      <Route path="/ideation" element={<IdeationView />} />
      <Route path="/ideation/:sessionId" element={<IdeationView />} />
      <Route path="/debug" element={<DebugView />} />
      <Route path="/debug/:sessionId" element={<DebugView />} />
      <Route path="/designs" element={<DesignView />} />
      <Route path="/designs/:designId" element={<DesignView />} />
      <Route path="/documents" element={<DocumentsView />} />
      <Route path="/settings" element={<SettingsView />} />
      <Route path="*" element={<Navigate to="/plans" replace />} />
    </Routes>
  );
}
