export function renderSPA(token: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Gran Maestro Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
/* ─── CSS Variables ─────────────────────────────────────────── */
:root {
  --bg-primary: #f8f9fa;
  --bg-secondary: #ffffff;
  --bg-card: #ffffff;
  --bg-input: #ffffff;
  --text-primary: #212529;
  --text-secondary: #495057;
  --text-muted: #6c757d;
  --accent: #007bff;
  --accent-hover: #0056b3;
  --blue: #007bff;
  --blue-light: #e7f1ff;
  --green: #28a745;
  --green-dark: #1e7e34;
  --red: #dc3545;
  --yellow: #ffc107;
  --gray: #6c757d;
  --border: #dee2e6;
  --radius: 8px;
  --shadow: 0 2px 8px rgba(0,0,0,0.08);
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
}

[data-theme="dark"] {
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --bg-card: #0f3460;
  --bg-input: #1a1a3e;
  --text-primary: #e0e0e0;
  --text-secondary: #a0a0b0;
  --text-muted: #6a6a7a;
  --accent: #3b82f6;
  --accent-hover: #60a5fa;
  --blue: #0f3460;
  --blue-light: #1a4a80;
  --green: #4ecca3;
  --green-dark: #2d8a6e;
  --red: #f87171;
  --yellow: #f0c040;
  --gray: #6a6a7a;
  --border: #2a2a4e;
  --shadow: 0 2px 8px rgba(0,0,0,0.3);
}

/* ─── Reset & Base ──────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; overflow: hidden; }
body {
  font-family: var(--font-sans);
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.6;
  transition: background-color 0.3s, color 0.3s;
}

/* ─── Layout ────────────────────────────────────────────────── */
#app {
  display: grid;
  grid-template-rows: auto auto auto 1fr;
  height: 100vh;
  max-height: 100vh;
}
header {
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  padding: 12px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
header h1 {
  font-size: 18px;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 0.5px;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}
header .status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}
header .status .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--green);
  animation: pulse-dot 2s ease-in-out infinite;
}
header .status .dot.disconnected { background: var(--red); animation: none; }

.theme-toggle {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  color: var(--text-primary);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 18px;
  transition: all 0.2s;
}
.theme-toggle:hover {
  border-color: var(--accent);
  background: var(--blue-light);
}
[data-theme="dark"] .theme-toggle:hover {
  background: rgba(59, 130, 246, 0.1);
}
main {
  overflow-y: auto;
  padding: 16px 20px;
}
nav {
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: center;
  gap: 0;
}
nav button {
  flex: 1;
  max-width: 180px;
  background: none;
  border: none;
  color: var(--text-secondary);
  padding: 10px 16px;
  font-size: 13px;
  font-family: var(--font-sans);
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
  border-bottom: 2px solid transparent;
}
nav button:hover { color: var(--text-primary); }
nav button.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
.search-container kbd {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  padding: 1px 4px;
  margin: 0 1px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--bg-primary);
  color: var(--text-muted);
  box-shadow: 0 1px 0 var(--border);
}

/* ─── Cards ─────────────────────────────────────────────────── */
.card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 16px 16px 20px;
  margin-bottom: 12px;
  box-shadow: var(--shadow);
  transition: opacity 0.2s, box-shadow 0.2s;
}
.request-card {
  border-left: 4px solid var(--border);
}
.request-card.status-active {
  border-left-color: var(--accent);
}
.request-card.status-completed {
  border-left-color: var(--green);
}
.request-card.status-failed {
  border-left-color: var(--red);
}
.request-card.status-pending {
  border-left-color: var(--yellow);
}
.card-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;
}
.card-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

/* ─── Progress Bar ─────────────────────────────────────────── */
.progress-container {
  height: 8px;
  background: var(--bg-primary);
  border-radius: 4px;
  margin: 12px 0;
  overflow: hidden;
  border: 1px solid var(--border);
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--green));
  transition: width 0.6s ease-out;
  border-radius: 4px;
}

/* ─── Workflow: Phase Nodes ─────────────────────────────────── */
.phase-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.phase-node {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 36px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.3px;
  border: 2px solid var(--border);
  color: var(--text-secondary);
  background: var(--bg-primary);
  transition: all 0.3s;
}
.phase-node.done {
  border-color: var(--green);
  color: var(--green);
  background: rgba(78, 204, 163, 0.12);
}
.phase-node.active {
  border-color: var(--accent);
  color: white;
  background: var(--accent);
  animation: pulse-phase 2s ease-in-out infinite;
}
.phase-node.waiting {
  border-color: var(--gray);
  color: var(--gray);
  opacity: 0.6;
}
.phase-arrow {
  color: var(--text-muted);
  font-size: 14px;
  margin: 0 2px;
}

/* ─── Workflow: Master-Detail Layout ──────────────────────── */
.workflow-layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 16px;
  height: calc(100vh - 130px);
}
@media (max-width: 768px) {
  .workflow-layout { grid-template-columns: 1fr; }
}
.workflow-list {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.workflow-list-item {
  padding: 10px 12px;
  border-radius: var(--radius);
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
  background: var(--bg-secondary);
}
.workflow-list-item:hover {
  border-color: var(--border);
  background: var(--bg-primary);
}
.workflow-list-item.active {
  border-color: var(--accent);
  background: var(--bg-card);
  box-shadow: 0 0 0 1px var(--accent);
}
.workflow-list-item .wli-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.workflow-list-item .wli-meta {
  font-size: 11px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}
.workflow-list-item .wli-progress {
  height: 3px;
  background: var(--bg-primary);
  border-radius: 2px;
  margin-top: 6px;
  overflow: hidden;
}
.workflow-list-item .wli-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--green));
  border-radius: 2px;
  transition: width 0.4s;
}
.workflow-list-item .wli-status {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 3px;
}
.workflow-list-item .wli-status.s-active { background: rgba(59,130,246,0.12); color: var(--accent); }
.workflow-list-item .wli-status.s-completed { background: rgba(78,204,163,0.12); color: var(--green); }
.workflow-list-item .wli-status.s-failed { background: rgba(220,53,69,0.12); color: var(--red); }
.workflow-list-item .wli-status.s-pending { background: rgba(255,193,7,0.12); color: var(--yellow); }
.workflow-detail {
  overflow-y: auto;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
}
.workflow-detail-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 14px;
  height: 100%;
}
.workflow-section-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 8px 12px 4px;
}

@keyframes pulse-phase {
  0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
  50% { box-shadow: 0 0 8px 4px rgba(59, 130, 246, 0.15); }
}
@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* ─── Workflow: Task List ───────────────────────────────────── */
.task-list { margin-top: 16px; border-top: 1px solid var(--border); padding-top: 10px; }
.task-item {
  display: flex;
  flex-direction: column;
  padding: 8px 0;
  border-bottom: 1px solid rgba(42, 42, 78, 0.1);
  cursor: pointer;
}
[data-theme="dark"] .task-item { border-bottom-color: rgba(42, 42, 78, 0.5); }
.task-item:last-child { border-bottom: none; }
.task-main {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.task-item:hover .task-name { color: var(--accent); }
.task-icon { font-size: 14px; flex-shrink: 0; }
.task-icon.executing { color: var(--green); animation: pulse-dot 1s ease-in-out infinite; }
.task-icon.pending { color: var(--gray); }
.task-icon.completed { color: var(--green); }
.task-icon.failed { color: var(--red); }
.task-icon.cancelled { color: var(--gray); text-decoration: line-through; }
.task-name { flex: 1; transition: color 0.2s; }
.task-agent {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-primary);
  padding: 2px 6px;
  border-radius: 4px;
}
.task-detail {
  margin-top: 12px;
  margin-left: 22px;
  padding: 10px;
  background: var(--bg-primary);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  display: none;
}
.task-item.expanded .task-detail {
  display: block;
}
.task-detail-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 4px;
}
.task-detail-tabs button {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: var(--font-sans);
}
.task-detail-tabs button.active {
  background: var(--accent);
  color: white;
}
.task-detail-content {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-primary);
}
.trace-item {
  display: block;
  color: var(--accent);
  text-decoration: none;
  padding: 4px 0;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}
.trace-item:last-child { border-bottom: none; }
.trace-item:hover { text-decoration: underline; }

/* ─── Search Bar ────────────────────────────────────────────── */
.search-container {
  padding: 10px 20px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 12px;
}
.search-input-wrapper {
  position: relative;
  flex: 1;
  max-width: 500px;
}
.search-input {
  width: 100%;
  padding: 8px 12px 8px 36px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 20px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: var(--font-sans);
  transition: all 0.2s;
}
.search-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
}
[data-theme="dark"] .search-input:focus {
  box-shadow: 0 0 0 3px rgba(233, 69, 96, 0.2);
}
.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-size: 14px;
}

.blocked-badge {
  display: inline-block;
  font-size: 11px;
  color: var(--yellow);
  background: rgba(240, 192, 64, 0.1);
  border: 1px solid rgba(240, 192, 64, 0.3);
  border-radius: 4px;
  padding: 2px 8px;
  margin-left: 8px;
}

.plan-badge {
  display: inline-block;
  font-size: 11px;
  color: var(--accent);
  background: rgba(79, 140, 255, 0.12);
  border: 1px solid rgba(79, 140, 255, 0.35);
  border-radius: 4px;
  padding: 2px 8px;
  margin-left: 8px;
}

/* ─── Agent Activity Stream ─────────────────────────────────── */
.activity-stream {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.activity-entry {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  font-size: 13px;
}
.activity-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.activity-time {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
}
.activity-task-id {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent);
  background: rgba(233, 69, 96, 0.1);
  padding: 1px 6px;
  border-radius: 3px;
}
.activity-agent {
  font-weight: 600;
  color: var(--green);
}
.activity-detail {
  margin-left: 16px;
  padding-left: 12px;
  border-left: 2px solid var(--border);
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.8;
}
.live-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--green);
}
.live-indicator .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--green);
  animation: pulse-dot 1s ease-in-out infinite;
}
.filter-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.filter-bar input, .filter-bar select {
  background: var(--bg-input);
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 6px 10px;
  border-radius: var(--radius);
  font-size: 13px;
  font-family: var(--font-sans);
}
.filter-bar input:focus, .filter-bar select:focus {
  outline: none;
  border-color: var(--accent);
}

/* ─── Document Browser ──────────────────────────────────────── */
.doc-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 16px;
  height: calc(100vh - 130px);
}
@media (max-width: 768px) {
  .doc-layout { grid-template-columns: 1fr; }
  .doc-tree { max-height: 200px; overflow-y: auto; }
}
.doc-tree {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  overflow-y: auto;
  font-size: 13px;
}
.tree-item {
  padding: 3px 0;
  cursor: pointer;
  color: var(--text-secondary);
  transition: color 0.2s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tree-item:hover { color: var(--text-primary); }
.tree-item.active { color: var(--accent); font-weight: 600; }
.tree-dir {
  color: var(--text-primary);
  font-weight: 600;
  padding: 3px 0;
  cursor: pointer;
  user-select: none;
}
.tree-dir::before { content: '\\25B6 '; font-size: 10px; }
.tree-dir.open::before { content: '\\25BC '; font-size: 10px; }
.tree-children { margin-left: 16px; }
.tree-children.collapsed { display: none; }
.doc-content {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  overflow-y: auto;
  font-size: 14px;
  line-height: 1.7;
}
.doc-content pre {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
}
.doc-content code {
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--bg-primary);
  padding: 1px 4px;
  border-radius: 3px;
}
.doc-content h1 { font-size: 22px; color: var(--accent); margin: 16px 0 8px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
.doc-content h2 { font-size: 18px; color: var(--text-primary); margin: 14px 0 6px; }
.doc-content h3 { font-size: 15px; color: var(--text-secondary); margin: 12px 0 4px; }
.doc-content ul, .doc-content ol { margin-left: 20px; margin-bottom: 8px; }
.doc-content blockquote {
  border-left: 3px solid var(--accent);
  margin: 8px 0;
  padding: 4px 12px;
  color: var(--text-secondary);
  background: rgba(233, 69, 96, 0.05);
}
.doc-content table { border-collapse: collapse; width: 100%; margin: 8px 0; }
.doc-content th, .doc-content td {
  border: 1px solid var(--border);
  padding: 6px 10px;
  text-align: left;
  font-size: 13px;
}
.doc-content th { background: var(--bg-primary); font-weight: 600; }
.json-key { color: #f08d49; }
.json-string { color: #7ec699; }
.json-number { color: #f08d49; }
.json-bool { color: #cc99cd; }
.json-null { color: #cc99cd; }

/* ─── Settings ──────────────────────────────────────────────── */
.settings-form { max-width: 600px; }
.form-group {
  margin-bottom: 16px;
}
.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.form-group input, .form-group textarea, .form-group select {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 8px 12px;
  border-radius: var(--radius);
  font-size: 14px;
  font-family: var(--font-sans);
}
.form-group textarea {
  font-family: var(--font-mono);
  resize: vertical;
  min-height: 200px;
}
.form-group input:focus, .form-group textarea:focus {
  outline: none;
  border-color: var(--accent);
}
.btn {
  background: var(--accent);
  color: white;
  border: none;
  padding: 8px 20px;
  border-radius: var(--radius);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}
.btn:hover { background: var(--accent-hover); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary {
  background: var(--blue-light);
}
.btn-secondary:hover { background: var(--blue); }
.mode-status {
  margin-top: 20px;
  padding: 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.mode-status h3 {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}
/* Config sections */
.config-section {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 8px;
  overflow: hidden;
}
.config-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--bg-secondary);
  cursor: pointer;
  font-weight: 600;
  font-size: 14px;
  user-select: none;
}
.config-section-header:hover {
  background: var(--bg-hover);
}
.config-section-body {
  padding: 12px 14px;
}
.config-section.collapsed .config-section-body {
  display: none;
}
.config-field {
  display: grid;
  grid-template-columns: 180px 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border-light, rgba(128,128,128,0.1));
}
.config-field:last-child {
  border-bottom: none;
}
.config-field label {
  font-size: 13px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
}
.config-field input[type="text"],
.config-field input[type="number"] {
  background: var(--bg-input);
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 5px 8px;
  border-radius: var(--radius);
  font-size: 13px;
  font-family: var(--font-mono);
  width: 100%;
}
.config-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
  white-space: nowrap;
}
.config-badge.default {
  color: var(--text-muted);
  background: transparent;
}
.config-badge.modified {
  color: var(--yellow, #f0c040);
  background: rgba(240,192,64,0.1);
}
.config-meta {
  padding: 8px 14px;
  font-size: 12px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
}
/* ─── Approval Banner ──────────────────────────────────────── */
.approval-banner {
  background: linear-gradient(90deg, rgba(240,192,64,0.15), rgba(233,69,96,0.10));
  border-bottom: 1px solid rgba(240,192,64,0.3);
  padding: 8px 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--yellow);
  animation: banner-pulse 3s ease-in-out infinite;
}
.approval-icon { font-size: 16px; }
@keyframes banner-pulse {
  0%, 100% { background: linear-gradient(90deg, rgba(240,192,64,0.15), rgba(233,69,96,0.10)); }
  50% { background: linear-gradient(90deg, rgba(240,192,64,0.25), rgba(233,69,96,0.18)); }
}

.toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  padding: 10px 16px;
  border-radius: var(--radius);
  font-size: 13px;
  z-index: 300;
  opacity: 0;
  transform: translateX(20px);
  transition: opacity 0.25s, transform 0.25s;
  pointer-events: none;
  border: 1px solid var(--border);
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 360px;
}
.toast.show { opacity: 1; transform: translateX(0); pointer-events: auto; }
.toast.toast-success { border-left: 4px solid var(--green); }
.toast.toast-error { border-left: 4px solid var(--red); }
.toast.toast-warning { border-left: 4px solid var(--yellow); }
.toast.toast-info { border-left: 4px solid var(--accent); }
.toast .toast-icon { font-size: 16px; flex-shrink: 0; }

/* ─── Empty State ───────────────────────────────────────────── */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
}
.empty-state .icon { font-size: 48px; margin-bottom: 16px; }
.empty-state h2 { font-size: 18px; color: var(--text-secondary); margin-bottom: 8px; }
.empty-state p { font-size: 13px; max-width: 400px; margin: 0 auto; }

/* ─── View Header & Refresh ────────────────────────────────── */
.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.view-header-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
}
.refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  padding: 4px 10px;
  border-radius: var(--radius);
  font-size: 12px;
  font-family: var(--font-sans);
  cursor: pointer;
  transition: all 0.2s;
}
.refresh-btn:hover {
  background: var(--bg-input);
  color: var(--text-primary);
  border-color: var(--accent);
}
.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.refresh-btn .refresh-icon {
  display: inline-block;
  font-size: 14px;
  line-height: 1;
}
.refresh-btn.loading .refresh-icon {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ─── Log View ─────────────────────────────────────────────── */
.log-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  align-items: center;
}
.log-toolbar select {
  background: var(--bg-input);
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 6px 10px;
  border-radius: var(--radius);
  font-size: 13px;
  font-family: var(--font-sans);
  min-width: 200px;
}
.log-toolbar select:focus {
  outline: none;
  border-color: var(--accent);
}
.log-content {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-y: auto;
  height: calc(100vh - 200px);
  color: var(--text-secondary);
}

/* ─── Dependencies View ────────────────────────────────────── */
.dep-graph {
  position: relative;
  overflow: auto;
  height: calc(100vh - 160px);
}
.dep-graph svg {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}
.dep-node {
  position: absolute;
  background: var(--bg-secondary);
  border: 2px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 14px;
  min-width: 160px;
  cursor: default;
  z-index: 1;
}
.dep-node .dep-id {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent);
  margin-bottom: 4px;
}
.dep-node .dep-title {
  font-size: 13px;
  color: var(--text-primary);
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}
.dep-node .dep-status {
  display: inline-block;
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 4px;
  font-weight: 600;
}
.dep-node.status-done { border-color: var(--green); opacity: 0.65; }
.dep-node.status-done .dep-status { background: rgba(78,204,163,0.15); color: var(--green); }
.dep-node.status-active { border-color: var(--accent); box-shadow: 0 0 8px rgba(233,69,96,0.3); }
.dep-node.status-active .dep-status { background: rgba(233,69,96,0.15); color: var(--accent); }
.dep-node.status-blocked { border-color: var(--red); }
.dep-node.status-blocked .dep-status { background: rgba(233,69,96,0.15); color: var(--red); }
.dep-node.status-pending .dep-status { background: rgba(106,106,122,0.15); color: var(--gray); }

/* ─── Notification Bell ────────────────────────────────────── */
.notif-bell {
  position: relative;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  margin-left: 12px;
  user-select: none;
}
.notif-badge {
  position: absolute;
  top: -6px;
  right: -8px;
  background: var(--red);
  color: white;
  font-size: 10px;
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}
.notif-panel {
  position: fixed;
  top: 56px;
  right: 12px;
  width: 380px;
  max-height: calc(100vh - 80px);
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  z-index: 200;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: notifSlideIn 0.15s ease-out;
}
@keyframes notifSlideIn {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
.notif-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  font-weight: 600;
}
.notif-header button {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 12px;
  cursor: pointer;
  font-family: var(--font-sans);
}
.notif-header button:hover { text-decoration: underline; }
.notif-list {
  overflow-y: auto;
  flex: 1;
}
.notif-item {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  cursor: default;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  transition: background 0.15s;
}
.notif-item:last-child { border-bottom: none; }
.notif-item:hover { background: rgba(59,130,246,0.04); }
.notif-item.unread { background: rgba(59,130,246,0.06); }
.notif-item .notif-icon {
  font-size: 16px;
  flex-shrink: 0;
  margin-top: 2px;
}
.notif-item .notif-body { flex: 1; min-width: 0; }
.notif-item .notif-time {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  margin-bottom: 2px;
}
.notif-item .notif-msg {
  color: var(--text-secondary);
  word-break: break-word;
}
.notif-item.unread .notif-msg { color: var(--text-primary); font-weight: 500; }
.notif-empty {
  text-align: center;
  padding: 30px 14px;
  color: var(--text-muted);
  font-size: 13px;
}

/* ─── Ideation View ────────────────────────────────────────── */
.ideation-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ideation-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 16px;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  display: flex;
  align-items: center;
  gap: 12px;
}
.ideation-card:hover {
  border-color: var(--accent);
  background: var(--bg-primary);
}
.ideation-card.active {
  border-color: var(--accent);
}
.ideation-status {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
}
.ideation-status.collecting {
  background: rgba(240, 192, 64, 0.15);
  color: var(--yellow);
}
.ideation-status.synthesized {
  background: rgba(26, 74, 128, 0.3);
  color: var(--blue-light);
}
.ideation-status.discussing {
  background: rgba(78, 204, 163, 0.15);
  color: var(--green);
}
.ideation-status.debating {
  background: rgba(240,192,64,0.15);
  color: var(--yellow);
}
.ideation-status.completed {
  background: rgba(106, 106, 122, 0.15);
  color: var(--gray);
}
.opinion-progress {
  display: flex;
  gap: 12px;
  margin-top: 10px;
}
.opinion-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
}
.opinion-chip .op-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.opinion-chip .op-dot.pending {
  background: var(--gray);
}
.opinion-chip .op-dot.done {
  background: var(--green);
}
.opinion-chip .op-dot.failed {
  background: var(--red);
}
.opinion-chip .op-dot.collecting {
  background: var(--yellow);
  animation: pulse-dot 1s ease-in-out infinite;
}
.ideation-detail {
  margin-top: 16px;
}
.opinions-columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
  margin-top: 12px;
}
@media (max-width: 900px) {
  .opinions-columns { grid-template-columns: 1fr; }
}
.opinion-panel {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  max-height: 400px;
  overflow-y: auto;
}
.opinion-panel h4 {
  font-size: 13px;
  margin-bottom: 8px;
}
.critiques-section { margin-top: 12px; }
.critiques-section > h4 {
  color: var(--red, #e06c75);
  font-size: 13px;
  margin-bottom: 8px;
}
.opinion-panel.critic { border-left: 2px solid var(--red, #e06c75); }
.opinion-panel.critic h4 { color: var(--red, #e06c75);
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
.opinion-panel.codex h4 { color: var(--accent); }
.opinion-panel.gemini h4 { color: var(--yellow); }
.opinion-panel.claude h4 { color: var(--green); }
.synthesis-panel, .discussion-panel {
  margin-top: 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  max-height: 500px;
  overflow-y: auto;
}
.synthesis-panel h4 { color: var(--green); font-size: 14px; margin-bottom: 10px; }
.discussion-panel h4 { color: var(--blue-light); font-size: 14px; margin-bottom: 10px; }
.ideation-back {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  padding: 6px 14px;
  border-radius: var(--radius);
  font-size: 13px;
  cursor: pointer;
  margin-bottom: 12px;
  font-family: var(--font-sans);
  transition: color 0.2s, border-color 0.2s;
}
.ideation-back:hover { color: var(--text-primary); border-color: var(--accent); }

/* ─── Request Sections ─────────────────────────────────────── */
.request-section--active h2 {
  font-size: 16px;
  font-weight: 700;
  color: var(--accent);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.request-section--completed {
  margin-top: 16px;
}
.request-section--completed summary {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 8px 0;
  user-select: none;
}
.request-section--completed summary:hover { color: var(--text-primary); }

/* ─── Plans View ─────────────────────────────────────────── */
.plans-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Plans: Master-Detail Layout */
.plans-layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 16px;
  height: calc(100vh - 130px);
}
@media (max-width: 768px) {
  .plans-layout { grid-template-columns: 1fr; }
}
.plans-list {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.plans-detail {
  overflow-y: auto;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
}
.plans-detail-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  height: 100%;
  font-size: 13px;
}
.plan-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  transition: border-color 0.2s, background 0.2s;
}
.plan-card:hover {
  border-color: var(--accent);
  background: var(--bg-primary);
}
.plan-card.active {
  border-color: var(--accent);
  background: var(--bg-primary);
}
.plan-card-meta {
  color: var(--text-secondary);
  font-size: 11px;
}
.plan-status {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-secondary);
}
.plan-status.active {
  background: rgba(59,130,246,0.12);
  color: var(--accent);
}
.plan-status.completed {
  background: rgba(78, 204, 163, 0.15);
  color: var(--green);
}
.plan-status.failed {
  background: rgba(220,53,69,0.12);
  color: var(--red);
}
.plan-status.pending {
  background: rgba(255,193,7,0.12);
  color: var(--yellow);
}

/* ─── Card update animation ───────────────────────────────── */
.card-updated {
  animation: cardPulse 0.4s ease-out;
}
@keyframes cardPulse {
  0% { box-shadow: 0 0 0 0 rgba(59,130,246,0.3); }
  50% { box-shadow: 0 0 0 4px rgba(59,130,246,0.1); }
  100% { box-shadow: var(--shadow); }
}

/* ─── Scrollbar ─────────────────────────────────────────────── */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: var(--bg-primary); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--gray); }
</style>
</head>
<body>
<div id="app">
  <header>
    <h1>Gran Maestro</h1>
    <div class="header-actions">
      <div id="project-selector" style="display:none">
        <select id="project-select" onchange="switchProject(this.value)" style="background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);border-radius:4px;padding:4px 8px;font-size:13px;cursor:pointer"></select>
      </div>
      <button class="theme-toggle" id="theme-toggle" onclick="toggleTheme()" title="Toggle Theme (T)">
        &#9728;
      </button>
      <div class="status">
        <span id="connection-status">Connecting...</span>
        <div class="dot" id="connection-dot"></div>
        <span class="notif-bell" onclick="toggleNotifPanel(event)" id="notif-bell">&#128276;<span class="notif-badge" id="notif-badge" style="display:none">0</span></span>
      </div>
    </div>
  </header>
  <div class="notif-panel" id="notif-panel" style="display:none">
    <div class="notif-header">
      <span>Notifications</span>
      <button onclick="markAllRead()">Mark all read</button>
    </div>
    <div class="notif-list" id="notif-list"></div>
  </div>
  <nav>
    <button class="active" data-view="plans" onclick="switchView('plans')" title="단축키: 1">Plans</button>
    <button data-view="workflow" onclick="switchView('workflow')" title="단축키: 2">Workflow</button>
    <button data-view="ideation" onclick="switchView('ideation')" title="단축키: 3">Idea</button>
    <button data-view="debug" onclick="switchView('debug')" title="단축키: 4">Debug</button>
    <button data-view="documents" onclick="switchView('documents')" title="단축키: 5">Docs</button>
    <button data-view="settings" onclick="switchView('settings')" title="단축키: 6">Settings</button>
  </nav>
  <div class="search-container" id="search-container">
    <div class="search-input-wrapper">
      <span class="search-icon">&#128269;</span>
      <input type="text" id="workflow-search" class="search-input" placeholder="Search requests... (S)" oninput="filterWorkflow()">
    </div>
    <div style="font-size: 11px; color: var(--text-muted); display: flex; gap: 10px;">
      <span><kbd>1</kbd>-<kbd>6</kbd> Views</span>
      <span><kbd>T</kbd> Theme</span>
      <span><kbd>S</kbd> Search</span>
      <span><kbd>R</kbd> Refresh</span>
    </div>
  </div>
  <div class="approval-banner" id="approval-banner" style="display:none">
    <span class="approval-icon">&#9888;</span>
    <span id="approval-msg">Approval needed</span>
    <button onclick="dismissApprovalBanner()" style="margin-left:auto;background:none;border:1px solid rgba(240,192,64,0.4);color:var(--yellow);cursor:pointer;padding:2px 8px;border-radius:4px;font-size:12px">&times;</button>
  </div>
  <main id="main-content"></main>
</div>
<div class="toast" id="toast"></div>
<script>
// ─── State ──────────────────────────────────────────────────────────────────
const TOKEN = '${token}';
let currentProjectId = new URLSearchParams(window.location.search).get('project') || '';
let projects = [];
let theme = localStorage.getItem('gm-theme') || 'light';
document.documentElement.setAttribute('data-theme', theme);

function toggleTheme() {
  theme = theme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('gm-theme', theme);
  document.getElementById('theme-toggle').innerHTML = theme === 'light' ? '&#9728;' : '&#9789;';
}

function getApiBase() {
  return currentProjectId ? '/api/projects/' + encodeURIComponent(currentProjectId) : '/api';
}
let currentView = 'plans';
let requests = [];
let plans = [];
let agentActivities = [];
let docTree = [];
let docContent = '';
let docActivePath = '';
let config = {};
let configDefaults = {};
let configDefaultsLoaded = false;
let modeStatus = {};
let sseConnected = false;
let logContent = '';
let logSelectedTask = '';
let notifications = [];
let notificationUnread = 0;
let showNotificationPanel = false;
let ideationSessions = [];
let discussionSessions = [];
let ideationActiveSession = null;
let discussionActiveSession = null;
let openDirs = new Set();
let treeInitialized = false;
const viewCache = {};
let selectedRequestId = '';
let selectedPlanId = '';
let debugSessions = [];
let selectedDebugId = '';
let loadDataTimer = null;
let dirtyLoadTimer = null;
let pollInterval = null;
let dirtyFlags = { requests: false, config: false, mode: false, tree: false, ideation: false, discussion: false, plans: false, debug: false };

async function loadRequests() {
  try {
    requests = await apiFetch('/requests');
    for (const req of requests) {
      try { req._tasks = await apiFetch('/requests/' + encodeURIComponent(req.id) + '/tasks'); }
      catch { req._tasks = []; }
    }
  } catch { requests = []; }
}

async function loadDirtyData() {
  const promises = [];
  if (dirtyFlags.requests) promises.push(loadRequests());
  if (dirtyFlags.config) promises.push(apiFetch('/config').then(d => { config = d; }).catch(() => {}));
  if (dirtyFlags.mode) promises.push(apiFetch('/mode').then(d => { modeStatus = d; }).catch(() => {}));
  if (dirtyFlags.tree) promises.push(apiFetch('/tree').then(d => { docTree = d; }).catch(() => {}));
  if (dirtyFlags.ideation) promises.push(apiFetch('/ideation').then(d => { ideationSessions = d; }).catch(() => {}));
  if (dirtyFlags.discussion) promises.push(apiFetch('/discussion').then(d => { discussionSessions = d; }).catch(() => {}));
  if (dirtyFlags.plans) promises.push(apiFetch('/plans').then(d => { plans = d; }).catch(() => {}));

  // If nothing is dirty, do a full load
  if (promises.length === 0) { await loadData(); return; }

  await Promise.all(promises);
  // Reset dirty flags
  dirtyFlags = { requests: false, config: false, mode: false, tree: false, ideation: false, discussion: false, plans: false, debug: false };

  renderCurrentView();
}

function scheduleDirtyLoad() {
  if (dirtyLoadTimer) clearTimeout(dirtyLoadTimer);
  dirtyLoadTimer = setTimeout(loadDirtyData, 1500);
}

function scheduleLoadData() {
  if (loadDataTimer) clearTimeout(loadDataTimer);
  loadDataTimer = setTimeout(loadData, 1500);
}

function startPolling() {
  if (!pollInterval) pollInterval = setInterval(() => scheduleLoadData(), 10000);
}

function stopPolling() {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}

// ─── Keyboard Shortcuts ─────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  
  const key = e.key.toLowerCase();
  if (key >= '1' && key <= '6') {
    const views = ['plans', 'workflow', 'ideation', 'debug', 'documents', 'settings'];
    switchView(views[parseInt(key) - 1]);
  } else if (key === 't') {
    toggleTheme();
  } else if (key === 's') {
    e.preventDefault();
    document.getElementById('workflow-search')?.focus();
  } else if (key === 'r') {
    refreshView(currentView);
  }
});

async function refreshView(viewName) {
  const btn = document.getElementById('refresh-btn-' + viewName);
  if (btn) { btn.classList.add('loading'); btn.disabled = true; }
  try {
    switch (viewName) {
      case 'workflow':
      case 'agents':
      case 'dependencies':
        await loadRequests();
        break;
      case 'documents':
        docTree = await apiFetch('/tree');
        break;
      case 'plans':
        plans = await apiFetch('/plans').catch(() => []);
        break;
      case 'debug':
        await loadDebug();
        break;
      case 'log':
        if (logSelectedTask) { await selectLogTask(logSelectedTask); }
        break;
      case 'ideation':
        const results = await Promise.all([
          apiFetch('/ideation').catch(() => []),
          apiFetch('/discussion').catch(() => [])
        ]);
        ideationSessions = results[0];
        discussionSessions = results[1];
        break;
      case 'settings':
        config = await apiFetch('/config');
        break;
    }
    renderCurrentView();
    showToast(viewName.charAt(0).toUpperCase() + viewName.slice(1) + ' refreshed');
  } catch (e) {
    showToast('Refresh failed: ' + e.message, 'error');
  } finally {
    const btn2 = document.getElementById('refresh-btn-' + viewName);
    if (btn2) { btn2.classList.remove('loading'); btn2.disabled = false; }
  }
}

function filterWorkflow() {
  const query = (document.getElementById('workflow-search')?.value || '').toLowerCase();
  document.querySelectorAll('.workflow-list-item').forEach(el => {
    const text = el.textContent.toLowerCase();
    el.style.display = text.includes(query) ? '' : 'none';
  });
}

// ─── API Helpers ────────────────────────────────────────────────────────────
function apiHeaders() {
  return { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };
}

async function apiFetch(path, options = {}) {
  const url = getApiBase() + path + (path.includes('?') ? '&' : '?') + 'token=' + TOKEN;
  const res = await fetch(url, { ...options, headers: { ...apiHeaders(), ...(options.headers || {}) } });
  if (!res.ok) throw new Error('API error: ' + res.status);
  return res.json();
}

// ─── Markdown Renderer (Inline GFM-lite) ────────────────────────────────────
function renderMarkdown(md) {
  if (!md) return '';

  var html = md;
  var bt = String.fromCharCode(96);
  var bts = bt + bt + bt;

  // 1. Escaping HTML (XSS Protection)
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 2. Code blocks (new RegExp needs \\\\  for regex metacharacters)
  var codeBlocks = [];
  var codeBlockRegex = new RegExp(bts + '([a-zA-Z0-9_]*)\\\\n([\\\\s\\\\S]*?)' + bts, 'g');
  html = html.replace(codeBlockRegex, function(match, lang, code) {
    var id = 'CODEBLOCK_' + codeBlocks.length;
    codeBlocks.push('<pre><code class="language-' + (lang || 'text') + '">' + code.trim() + '</code></pre>');
    return id;
  });

  // 3. Inline Code
  var inlineCodes = [];
  var inlineCodeRegex = new RegExp(bt + '([^' + bt + ']+)' + bt, 'g');
  html = html.replace(inlineCodeRegex, function(match, code) {
    var id = 'INLINE_' + inlineCodes.length;
    inlineCodes.push('<code>' + code + '</code>');
    return id;
  });

  // 4. Block Elements (regex literals use \\\\ for regex metacharacters)
  var lines = html.split('\\n');
  var inList = null;
  var inTable = false;
  var inQuote = false;

  var processedLines = lines.map(function(line, index) {
    var currentLine = line;

    // Horizontal Rule
    if (/^(\\s*[-*_]){3,}\\s*$/.test(currentLine)) return '<hr>';

    // Headers
    var headerMatch = currentLine.match(/^(#{1,6})\\s+(.*)$/);
    if (headerMatch) {
      var level = headerMatch[1].length;
      return '<h' + level + '>' + headerMatch[2] + '</h' + level + '>';
    }

    // Blockquote
    if (currentLine.indexOf('&gt; ') === 0) {
      var content = currentLine.substring(5);
      if (!inQuote) { inQuote = true; return '<blockquote>' + content; }
      return content;
    } else if (inQuote) {
      inQuote = false;
      return '</blockquote>' + currentLine;
    }

    // Checkboxes
    currentLine = currentLine.replace(/^[-*]\\s+\\[ \\]\\s+(.*)$/, '<li><input type="checkbox" disabled> $1</li>');
    currentLine = currentLine.replace(/^[-*]\\s+\\[x\\]\\s+(.*)$/, '<li><input type="checkbox" checked disabled> $1</li>');

    // Lists
    var ulMatch = currentLine.match(/^(\\s*)[-*]\\s+(.*)$/);
    var olMatch = currentLine.match(/^(\\s*)[0-9]+\\.\\s+(.*)$/);

    if (ulMatch || olMatch) {
      var type = ulMatch ? 'ul' : 'ol';
      var content = ulMatch ? ulMatch[2] : olMatch[2];
      var prefix = '';
      if (inList !== type) {
        if (inList) prefix += '</' + inList + '>';
        inList = type;
        prefix += '<' + type + '>';
      }
      return prefix + '<li>' + content + '</li>';
    } else if (inList) {
      var suffix = '</' + inList + '>';
      inList = null;
      currentLine = suffix + currentLine;
    }

    // Tables
    if (currentLine.trim().indexOf('|') === 0 && currentLine.trim().lastIndexOf('|') === currentLine.trim().length - 1) {
      var cells = currentLine.trim().split('|').filter(function(c) { return c.length > 0; });
      if (index + 1 < lines.length && /^(\\s*\\|?\\s*:?-+:?\\s*\\|?)+\\s*$/.test(lines[index+1])) {
        inTable = true;
        return '<table><thead><tr>' + cells.map(function(c) { return '<th>' + c.trim() + '</th>'; }).join('') + '</tr></thead><tbody>';
      } else if (inTable) {
        if (/^(\\s*\\|?\\s*:?-+:?\\s*\\|?)+\\s*$/.test(currentLine)) return '';
        return '<tr>' + cells.map(function(c) { return '<td>' + c.trim() + '</td>'; }).join('') + '</tr>';
      }
    } else if (inTable) {
      inTable = false;
      return '</tbody></table>' + currentLine;
    }

    // Paragraphs
    if (currentLine.trim() === '') return '<br>';
    return currentLine;
  });

  if (inList) processedLines.push('</' + inList + '>');
  if (inTable) processedLines.push('</tbody></table>');
  if (inQuote) processedLines.push('</blockquote>');

  html = processedLines.join('\\n');

  // 5. Inline Elements
  html = html.replace(/\\*\\*([^\\*]+)\\*\\*/g, '<strong>$1</strong>');
  html = html.replace(/\\*([^\\*]+)\\*/g, '<em>$1</em>');
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  html = html.replace(/!\\[([^\\]]*)\\]\\(([^\\)]*)\\)/g, '<img src="$2" alt="$1">');
  html = html.replace(/\\[([^\\]]*)\\]\\(([^\\)]*)\\)/g, '<a href="$2" target="_blank">$1</a>');

  // 6. Restore protected content
  inlineCodes.forEach(function(code, i) { html = html.replace('INLINE_' + i, code); });
  codeBlocks.forEach(function(block, i) { html = html.replace('CODEBLOCK_' + i, block); });

  return html;
}

// ─── JSON Syntax Highlighting ───────────────────────────────────────────────
function highlightJson(json) {
  if (typeof json === 'string') {
    try { json = JSON.parse(json); } catch { return escapeHtml(json); }
  }
  const str = JSON.stringify(json, null, 2);
  return str.replace(
    /("(\\\\u[a-zA-Z0-9]{4}|\\\\[^u]|[^\\\\"])*"(\\s*:)?|\\b(true|false|null)\\b|-?\\d+(?:\\.\\d*)?(?:[eE][+\\-]?\\d+)?)/g,
    function(match) {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
          match = match.replace(/:$/, '') + ':';
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-bool';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return '<span class="' + cls + '">' + match + '</span>';
    }
  );
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Task Status Helpers ────────────────────────────────────────────────────
function taskStatusIcon(status) {
  switch ((status || '').toLowerCase()) {
    case 'executing': case 'running': case 'in_progress':
      return '<span class="task-icon executing" title="Executing">&#9673;</span>';
    case 'pending': case 'queued': case 'waiting':
      return '<span class="task-icon pending" title="Pending">&#9675;</span>';
    case 'completed': case 'done': case 'success':
      return '<span class="task-icon completed" title="Completed">&#9679;</span>';
    case 'failed': case 'error':
      return '<span class="task-icon failed" title="Failed">&#10005;</span>';
    case 'cancelled': case 'skipped':
      return '<span class="task-icon cancelled" title="Cancelled">&#8856;</span>';
    default:
      return '<span class="task-icon pending" title="Unknown">&#9675;</span>';
  }
}

function phaseClass(phase, activePhase, reqStatus) {
  if (!activePhase) return '';
  const p = typeof phase === 'number' ? phase : parseInt(phase);
  const ap = typeof activePhase === 'number' ? activePhase : parseInt(activePhase);
  const st = (reqStatus || '').toLowerCase();
  // All phases done when request is completed
  if (st === 'completed' || st === 'done' || st === 'success') return 'done';
  if (p < ap) return 'done';
  if (p === ap) return 'active';
  return 'waiting';
}

async function loadDebug() {
  try {
    debugSessions = await apiFetch('/debug');
  } catch {
    debugSessions = [];
  }
  renderCurrentView();
}

// ─── View Renderers ─────────────────────────────────────────────────────────

function renderWorkflow() {
  const sortedRequests = [...requests].sort((a, b) => (b.id || '').localeCompare(a.id || ''));
  const activeRequests = sortedRequests.filter(req => req._location !== 'completed');
  const completedRequests = sortedRequests.filter(req => req._location === 'completed');

  // Auto-select first request if none selected
  if (!selectedRequestId && sortedRequests.length > 0) {
    selectedRequestId = sortedRequests[0].id;
  }

  // Left panel: compact request list
  const renderListItem = (req) => {
    const reqStatus = req.status || 'unknown';
    const isCompleted = ['completed','done','success'].includes(reqStatus.toLowerCase());
    const isFailed = ['failed','error'].includes(reqStatus.toLowerCase());
    const isPending = ['pending','queued','phase1_analysis','phase1_spec_review'].includes(reqStatus.toLowerCase());
    const statusCls = isCompleted ? 's-completed' : isFailed ? 's-failed' : isPending ? 's-pending' : 's-active';
    const statusLabel = isCompleted ? 'Done' : isFailed ? 'Fail' : isPending ? 'Wait' : 'Active';
    const activePhase = req.current_phase || req.phase || 1;
    const progress = isCompleted ? 100 : Math.round(((activePhase - 1) / 5) * 100);
    const isActive = selectedRequestId === req.id;
    const planBadge = req.source_plan ? '<span class="plan-badge">PLN: ' + escapeHtml(String(req.source_plan)) + '</span>' : '';

    return '<div class="workflow-list-item' + (isActive ? ' active' : '') + '" onclick="selectRequest(\\'' + escapeHtml(req.id) + '\\')">' +
      '<div class="wli-title">' + escapeHtml(req.id) +
        '<span class="wli-status ' + statusCls + '">' + statusLabel + '</span>' +
        planBadge +
      '</div>' +
      '<div class="wli-meta">' + escapeHtml(req.title || 'Untitled') + '</div>' +
      '<div class="wli-progress"><div class="wli-progress-fill" style="width:' + progress + '%"></div></div>' +
      '</div>';
  };

  let listHtml = '';
  if (activeRequests.length > 0) {
    listHtml += '<div class="workflow-section-label">Active</div>';
    listHtml += activeRequests.map(renderListItem).join('');
  }
  if (completedRequests.length > 0) {
    listHtml += '<div class="workflow-section-label" style="margin-top:12px">Completed</div>';
    listHtml += completedRequests.map(renderListItem).join('');
  }
  if (sortedRequests.length === 0) {
    listHtml = '<div class="empty-state" style="padding:20px"><p>No requests</p></div>';
  }

  // Right panel: selected request detail
  const selectedReq = sortedRequests.find(r => r.id === selectedRequestId);
  let detailHtml = '';
  if (selectedReq) {
    const req = selectedReq;
    const phases = [1, 2, 3, 4, 5];
    const activePhase = req.current_phase || req.phase || 1;
    const reqStatus = req.status || 'unknown';
    const isCompleted = ['completed','done','success'].includes(reqStatus.toLowerCase());
    const progress = isCompleted ? 100 : Math.round(((activePhase - 1) / 5) * 100);

    const phaseNodes = phases.map((p, i) => {
      const cls = phaseClass(p, activePhase, reqStatus);
      const node = '<div class="phase-node ' + cls + '">Phase ' + p + '</div>';
      const arrow = i < phases.length - 1 ? '<span class="phase-arrow">&#9654;</span>' : '';
      return node + arrow;
    }).join('');

    const blockedBadge = req.blockedBy && req.blockedBy.length > 0
      ? '<span class="blocked-badge">blocked by: ' + req.blockedBy.join(', ') + '</span>'
      : '';

    const completedBadge = isCompleted
      ? '<span style="display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;background:rgba(78,204,163,0.15);color:var(--green);margin-left:8px">COMPLETED</span>'
      : '';

    const tasksHtml = (req._tasks || []).map((t, idx) => {
      const taskNum = parseInt(t.id, 10) || (idx + 1);
      return '<div class="task-item" onclick="toggleTaskDetail(event, this, \\'' + escapeHtml(req.id) + '\\', \\'' + escapeHtml(t.id) + '\\')">' +
        '<div class="task-main">' +
          taskStatusIcon(t.status) +
          '<span class="task-name">Task ' + taskNum + (t.agent ? ' <span class=\\'task-agent\\'>' + escapeHtml(t.agent) + '</span>' : '') + '</span>' +
        '</div>' +
        '<div class="task-detail"></div>' +
        '</div>';
    }).join('');

    detailHtml = '<div class="card-title">' + escapeHtml(req.id) + ': ' + escapeHtml(req.title || 'Untitled') + completedBadge + blockedBadge + '</div>' +
      '<div class="card-subtitle">Status: ' + escapeHtml(reqStatus) +
      ' | Phase: ' + activePhase + (req.completed_at ? ' | Completed: ' + new Date(req.completed_at).toLocaleString() : '') + '</div>' +
      '<div class="progress-container"><div class="progress-fill" style="width:' + progress + '%"></div></div>' +
      '<div class="phase-row">' + phaseNodes + '</div>' +
      (tasksHtml ? '<div class="task-list">' + tasksHtml + '</div>' : '');
  } else {
    detailHtml = '<div class="workflow-detail-empty">Select a request from the list</div>';
  }

  return '<div class="view-header">' +
      '<div class="view-header-title">Workflow</div>' +
      '<button class="refresh-btn" id="refresh-btn-workflow" onclick="refreshView(\\'workflow\\')"><span class="refresh-icon">&#x21bb;</span> Refresh</button>' +
    '</div>' +
    '<div class="workflow-layout">' +
      '<div class="workflow-list">' + listHtml + '</div>' +
      '<div class="workflow-detail" id="workflow-detail">' + detailHtml + '</div>' +
    '</div>';
}

function selectRequest(reqId) {
  selectedRequestId = reqId;
  delete viewCache['workflow'];
  renderCurrentView();
}

function renderPlans() {
  const sortedPlans = [...plans].sort((a, b) => (b.id || '').localeCompare(a.id || ''));
  const header = '<div class="view-header">' +
      '<div class="view-header-title">Plans</div>' +
      '<button class="refresh-btn" id="refresh-btn-plans" onclick="refreshView(\\'plans\\')"><span class="refresh-icon">&#x21bb;</span> Refresh</button>' +
    '</div>';

  if (sortedPlans.length === 0) {
    return header + '<div class="empty-state"><div class="icon">&#128196;</div><h2>No plans yet</h2><p>Run planning steps to create PLN entries.</p></div>';
  }

  // Auto-select first plan if none selected
  if (!selectedPlanId && sortedPlans.length > 0) {
    selectedPlanId = sortedPlans[0].id;
  }

  const listHtml = sortedPlans.map(plan => {
    const linkedCount = Array.isArray(plan.linked_requests) ? plan.linked_requests.length : 0;
    const linkedLabel = linkedCount + ' linked request' + (linkedCount === 1 ? '' : 's');
    const statusText = (plan.status || 'unknown');
    const status = statusText.toLowerCase();
    const statusCls = status === 'completed' || status === 'done' || status === 'success'
      ? 'completed'
      : status === 'failed' || status === 'error'
        ? 'failed'
        : status === 'active' || status === 'running' || status === 'in_progress'
          ? 'active'
          : 'pending';
    const created = plan.created_at ? new Date(plan.created_at).toLocaleString() : 'No timestamp';
    const isActive = selectedPlanId === plan.id;

    return '<div class="plan-card' + (isActive ? ' active' : '') + '" onclick="selectPlan(\\'' + escapeHtml(plan.id) + '\\')">' +
      '<div>' +
        '<div class="card-title" style="margin-bottom:6px;font-size:15px;">' + escapeHtml(plan.id || 'PLN-UNKNOWN') + ': ' + escapeHtml(plan.title || 'Untitled') + '</div>' +
        '<div class="plan-card-meta">Status: ' + escapeHtml(statusText) + ' · Created: ' + escapeHtml(created) + ' · ' + escapeHtml(linkedLabel) + '</div>' +
      '</div>' +
      '<span class="plan-status ' + statusCls + '">' + escapeHtml(statusText) + '</span>' +
    '</div>';
  }).join('');

  const detailHtml = selectedPlanId
    ? '<div style="color:var(--text-muted);font-size:13px;">Loading plan content...</div>'
    : '<div class="plans-detail-empty">Select a plan to view its contents</div>';

  return header +
    '<div class="plans-layout">' +
      '<div class="plans-list">' + listHtml + '</div>' +
      '<div class="plans-detail" id="plan-detail">' + detailHtml + '</div>' +
    '</div>';
}

async function selectPlan(planId) {
  selectedPlanId = planId;
  delete viewCache['plans'];
  renderCurrentView();
  try {
    const planData = await apiFetch('/plans/' + encodeURIComponent(planId));
    const detailEl = document.getElementById('plan-detail');
    if (detailEl && planData) {
      detailEl.innerHTML = renderMarkdown(planData.content || '*(내용 없음)*');
    }
  } catch (e) {
    const detailEl = document.getElementById('plan-detail');
    if (detailEl) detailEl.innerHTML = '<div style="color:var(--red);padding:12px">Failed to load plan content.</div>';
  }
}

function renderDebug() {
  const sortedDebugs = [...debugSessions].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (aTime !== bTime) return bTime - aTime;
    const aNum = parseInt((a.id || '').replace(/\\D+/g, ''), 10) || 0;
    const bNum = parseInt((b.id || '').replace(/\\D+/g, ''), 10) || 0;
    return bNum - aNum;
  });

  const header = '<div class=\"view-header\">' +
    '<div class=\"view-header-title\">Debug</div>' +
    '<button class=\"refresh-btn\" id=\"refresh-btn-debug\" onclick=\"refreshView(\\'debug\\')\"><span class=\"refresh-icon\">&#x21bb;</span> Refresh</button>' +
    '</div>';

  if (sortedDebugs.length === 0) {
    return header + '<div class=\"empty-state\"><div class=\"icon\">[DBG]</div><h2>No debug sessions</h2><p>Run a debug flow to create DBG entries.</p></div>';
  }

  if (!selectedDebugId && sortedDebugs.length > 0) {
    selectedDebugId = sortedDebugs[0].id;
  }

  const listHtml = sortedDebugs.map(debug => {
    const statusText = (debug.status || 'unknown');
    const status = statusText.toLowerCase();
    const statusCls = status === 'completed' || status === 'done' || status === 'success'
      ? 'completed'
      : status === 'failed' || status === 'error'
        ? 'failed'
        : status === 'active' || status === 'running' || status === 'in_progress'
          ? 'active'
          : 'pending';
    const created = debug.created_at ? new Date(debug.created_at).toLocaleString() : 'No timestamp';
    const isActive = selectedDebugId === debug.id;
    return '<div class=\"plan-card' + (isActive ? ' active' : '') + '\" onclick=\"selectDebug(\\'' + escapeHtml(debug.id) + '\\')\">' +
      '<div>' +
        '<div class=\"card-title\" style=\"margin-bottom:6px;font-size:15px;\">' + escapeHtml(debug.id || 'DBG-UNKNOWN') + '</div>' +
        '<div class=\"plan-card-meta\">Issue: ' + escapeHtml(debug.issue || '-') + ' · Focus: ' + escapeHtml(debug.focus || '-') + ' · Status: ' + escapeHtml(statusText) + ' · Created: ' + escapeHtml(created) + '</div>' +
      '</div>' +
      '<span class=\"plan-status ' + statusCls + '\">' + escapeHtml(statusText) + '</span>' +
    '</div>';
  }).join('');

  const detailHtml = selectedDebugId
    ? '<div style=\"color:var(--text-muted);font-size:13px;\">Loading debug report...</div>'
    : '<div class=\"plans-detail-empty\">Select a debug session to view its contents</div>';

  return header +
    '<div class=\"plans-layout\">' +
      '<div class=\"plans-list\">' + listHtml + '</div>' +
      '<div class=\"plans-detail\" id=\"debug-detail\">' + detailHtml + '</div>' +
    '</div>';
}

async function selectDebug(debugId) {
  selectedDebugId = debugId;
  delete viewCache['debug'];
  renderCurrentView();
  try {
    const debugData = await apiFetch('/debug/' + encodeURIComponent(debugId));
    const detailEl = document.getElementById('debug-detail');
    if (detailEl && debugData) {
      detailEl.innerHTML = renderMarkdown(debugData.content || '*(내용 없음)*');
    }
  } catch (e) {
    const detailEl = document.getElementById('debug-detail');
    if (detailEl) detailEl.innerHTML = '<div style=\"color:var(--red);padding:12px\">Failed to load debug content.</div>';
  }
}

async function toggleTaskDetail(event, el, reqId, taskId) {
  event.stopPropagation();
  const isExpanding = !el.classList.contains('expanded');
  el.classList.toggle('expanded');
  
  if (isExpanding) {
    const detailEl = el.querySelector('.task-detail');
    detailEl.innerHTML = '<div style="padding:10px;text-align:center">Loading task details...</div>';
    
    try {
      const data = await apiFetch('/requests/' + encodeURIComponent(reqId) + '/tasks/' + encodeURIComponent(taskId));
      
      const renderContent = (tab) => {
        const contentEl = el.querySelector('.task-detail-content');
        if (tab === 'spec') {
          contentEl.innerHTML = renderMarkdown(data.spec || 'No spec available');
        } else if (tab === 'review') {
          contentEl.innerHTML = renderMarkdown(data.review || 'No review yet');
        } else if (tab === 'traces') {
          if (!data.traces || data.traces.length === 0) {
            contentEl.innerHTML = '<div style="color:var(--text-muted);padding:8px">No traces found</div>';
          } else {
            contentEl.innerHTML = data.traces.map(t => 
              '<div class="trace-item" onclick="loadTrace(event, \\'' + reqId + '\\', \\'' + taskId + '\\', \\'' + t + '\\', this.parentElement)">' + escapeHtml(t) + '</div>'
            ).join('');
          }
        }
        
        // Update active tab
        el.querySelectorAll('.task-detail-tabs button').forEach(btn => {
          btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
        });
      };

      detailEl.innerHTML = 
        '<div class="task-detail-tabs">' +
          '<button class="active" data-tab="spec" onclick="event.stopPropagation(); this.closest(\\'.task-item\\').renderTaskContent(\\'spec\\')">Spec</button>' +
          '<button data-tab="review" onclick="event.stopPropagation(); this.closest(\\'.task-item\\').renderTaskContent(\\'review\\')">Review</button>' +
          '<button data-tab="traces" onclick="event.stopPropagation(); this.closest(\\'.task-item\\').renderTaskContent(\\'traces\\')">Traces</button>' +
        '</div>' +
        '<div class="task-detail-content"></div>';
      
      // Attach renderer to element for tab switching
      el.renderTaskContent = (tab) => {
        renderContent(tab);
      };
      
      renderContent('spec');
    } catch (e) {
      detailEl.innerHTML = '<div style="color:var(--red);padding:10px">Error loading task details: ' + escapeHtml(e.message) + '</div>';
    }
  }
}

async function loadTrace(event, reqId, taskId, traceName, container) {
  event.stopPropagation();
  container.innerHTML = '<div style="padding:10px;text-align:center">Loading trace...</div>';
  try {
    const data = await apiFetch('/requests/' + encodeURIComponent(reqId) + '/tasks/' + encodeURIComponent(taskId) + '/traces/' + encodeURIComponent(traceName));
    container.innerHTML = '<button class="ideation-back" style="margin-bottom:8px;padding:2px 8px;font-size:11px" onclick="event.stopPropagation(); this.closest(\\'.task-item\\').renderTaskContent(\\'traces\\')">&larr; Back to traces</button>' +
      '<div class="doc-content" style="background:transparent;border:none;padding:0">' + renderMarkdown(data.content) + '</div>';
  } catch (e) {
    container.innerHTML = '<div style="color:var(--red);padding:10px">Error loading trace: ' + escapeHtml(e.message) + '</div>';
  }
}

function renderAgents() {
  const filterHtml = '<div class="filter-bar">' +
    '<input type="text" id="agent-filter-req" placeholder="Filter by Request ID..." oninput="filterAgents()">' +
    '<input type="text" id="agent-filter-agent" placeholder="Filter by Agent..." oninput="filterAgents()">' +
    '<div style="flex:1"></div>' +
    '<button class="refresh-btn" id="refresh-btn-agents" onclick="refreshView(\\'agents\\')" style="margin-right:8px"><span class="refresh-icon">&#x21bb;</span></button>' +
    '<div class="live-indicator"><div class="dot"></div> LIVE</div>' +
    '</div>';

  if (agentActivities.length === 0) {
    return filterHtml +
      '<div class="empty-state"><div class="icon">&#9881;</div>' +
      '<h2>No Agent Activity</h2>' +
      '<p>Agent activity will appear here in real-time as tasks are executed.</p></div>';
  }

  const entries = agentActivities.slice().reverse().map(a => {
    const time = a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : '--:--:--';
    return '<div class="activity-entry" data-req="' + escapeHtml(a.requestId || '') + '" data-agent="' + escapeHtml(a.agent || '') + '">' +
      '<div class="activity-header">' +
        '<span class="activity-time">' + time + '</span>' +
        (a.taskId ? '<span class="activity-task-id">[' + escapeHtml(a.requestId || '?') + '-' + escapeHtml(a.taskId) + ']</span>' : '') +
        '<span class="activity-agent">' + escapeHtml(a.agent || a.type || 'system') + '</span>' +
      '</div>' +
      '<div class="activity-detail">' +
        (a.status ? 'STATUS: ' + escapeHtml(a.status) + '<br>' : '') +
        (a.path ? 'FILE: ' + escapeHtml(a.path) + '<br>' : '') +
        (a.message ? escapeHtml(a.message) : '') +
      '</div>' +
    '</div>';
  }).join('');

  return filterHtml + '<div class="activity-stream" id="activity-stream">' + entries + '</div>';
}

function filterAgents() {
  const reqFilter = (document.getElementById('agent-filter-req')?.value || '').toLowerCase();
  const agentFilter = (document.getElementById('agent-filter-agent')?.value || '').toLowerCase();
  document.querySelectorAll('.activity-entry').forEach(el => {
    const req = (el.getAttribute('data-req') || '').toLowerCase();
    const agent = (el.getAttribute('data-agent') || '').toLowerCase();
    const show = (!reqFilter || req.includes(reqFilter)) && (!agentFilter || agent.includes(agentFilter));
    el.style.display = show ? '' : 'none';
  });
}

function renderDocuments() {
  const treeHtml = renderTree(docTree, 0, '');
  treeInitialized = true;
  const contentHtml = docContent || '<div class="empty-state" style="padding:40px"><p>Select a file from the tree to view its contents.</p></div>';
  return '<div class="view-header">' +
    '<div class="view-header-title">Documents</div>' +
    '<button class="refresh-btn" id="refresh-btn-documents" onclick="refreshView(\\'documents\\')"><span class="refresh-icon">&#x21bb;</span> Refresh</button>' +
    '</div>' +
    '<div class="doc-layout">' +
    '<div class="doc-tree">' + treeHtml + '</div>' +
    '<div class="doc-content" id="doc-content">' + contentHtml + '</div>' +
    '</div>';
}

function renderTree(nodes, depth, parentPath) {
  if (!nodes || nodes.length === 0) return '';
  return nodes.map(n => {
    const nodePath = parentPath ? parentPath + '/' + n.name : n.name;
    if (n.type === 'directory') {
      // On first render, default-open dirs at depth < 2
      if (!treeInitialized && depth < 2) openDirs.add(nodePath);
      const isOpen = openDirs.has(nodePath);
      return '<div class="tree-dir ' + (isOpen ? 'open' : '') + '" data-path="' + escapeHtml(nodePath) + '" onclick="toggleTreeDir(this)">' +
        '&#128193; ' + escapeHtml(n.name) + '</div>' +
        '<div class="tree-children ' + (isOpen ? '' : 'collapsed') + '">' +
        renderTree(n.children || [], depth + 1, nodePath) +
        '</div>';
    }
    const activeClass = docActivePath === n.path ? 'active' : '';
    const ext = n.name.split('.').pop().toLowerCase();
    const fileIcon = ext === 'json' ? '&#128196;' : ext === 'md' ? '&#128221;' : '&#128196;';
    return '<div class="tree-item ' + activeClass + '" onclick="loadFile(\\'' + escapeHtml(n.path).replace(/'/g, "\\\\'") + '\\')">' +
      fileIcon + ' ' + escapeHtml(n.name) + '</div>';
  }).join('');
}

function toggleTreeDir(el) {
  const path = el.getAttribute('data-path');
  if (path) {
    if (openDirs.has(path)) { openDirs.delete(path); } else { openDirs.add(path); }
  }
  el.classList.toggle('open');
  const children = el.nextElementSibling;
  if (children) children.classList.toggle('collapsed');
}

async function loadFile(path) {
  try {
    const data = await apiFetch('/file?path=' + encodeURIComponent(path));
    docActivePath = path;
    const ext = path.split('.').pop().toLowerCase();
    if (ext === 'json') {
      docContent = '<pre>' + highlightJson(data.content) + '</pre>';
    } else if (ext === 'md') {
      docContent = renderMarkdown(data.content);
    } else {
      docContent = '<pre>' + escapeHtml(data.content) + '</pre>';
    }
    document.getElementById('doc-content').innerHTML = docContent;
    // Update active item
    document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tree-item').forEach(el => {
      if (el.textContent === path.split('/').pop()) el.classList.add('active');
    });
  } catch (e) {
    docContent = '<div class="empty-state"><p>Error loading file: ' + escapeHtml(e.message) + '</p></div>';
    document.getElementById('doc-content').innerHTML = docContent;
  }
}

// ─── Log View ────────────────────────────────────────────────────────────────

function renderLog() {
  let options = '<option value="">-- Select a file --</option>';

  // Request-level files (limit to 20 most recent)
  const recentRequests = [...requests].sort((a, b) => (b.id || '').localeCompare(a.id || '')).slice(0, 20);
  recentRequests.forEach(req => {
    const reqFiles = ['request.json', 'design/spec.md', 'discussion/feedback.md'];
    options += '<optgroup label="' + escapeHtml(req.id) + ' (' + escapeHtml(req.status || '?') + ')">';
    reqFiles.forEach(f => {
      const val = 'req:' + req.id + '/' + f;
      options += '<option value="' + escapeHtml(val) + '"' +
        (logSelectedTask === val ? ' selected' : '') + '>' +
        escapeHtml(f) + '</option>';
    });
    // Task exec-logs
    (req._tasks || []).forEach(t => {
      const val = 'task:' + req.id + '/' + t.id;
      options += '<option value="' + escapeHtml(val) + '"' +
        (logSelectedTask === val ? ' selected' : '') + '>' +
        'tasks/' + escapeHtml(t.id) + '/exec-log.md' +
        (t.status ? ' (' + escapeHtml(t.status) + ')' : '') +
        '</option>';
    });
    options += '</optgroup>';
  });

  const toolbar = '<div class="log-toolbar">' +
    '<select onchange="selectLogTask(this.value)" style="min-width:320px">' + options + '</select>' +
    '<button class="refresh-btn" id="refresh-btn-log" onclick="refreshView(\\'log\\')" style="margin-left:auto"><span class="refresh-icon">&#x21bb;</span></button>' +
    '</div>';

  if (!logSelectedTask) {
    return toolbar +
      '<div class="empty-state"><div class="icon">&#128220;</div>' +
      '<h2>Execution Log</h2>' +
      '<p>Select a request file or task log to view</p></div>';
  }

  const isMarkdown = logSelectedTask.endsWith('.md');
  const contentHtml = isMarkdown
    ? '<div class="doc-content" id="log-content" style="height:calc(100vh - 200px);overflow-y:auto">' + renderMarkdown(logContent || 'Loading...') + '</div>'
    : '<div class="log-content" id="log-content">' + (logContent.startsWith('{') ? highlightJson(logContent) : escapeHtml(logContent || 'Loading...')) + '</div>';

  return toolbar + contentHtml;
}

async function selectLogTask(val) {
  logSelectedTask = val;
  logContent = '';
  if (!val) {
    renderCurrentView();
    return;
  }
  let filePath = '';
  if (val.startsWith('req:')) {
    // Request-level file: req:REQ-001/design/spec.md
    filePath = 'requests/' + val.substring(4);
  } else if (val.startsWith('task:')) {
    // Task exec-log: task:REQ-001/01
    const parts = val.substring(5).split('/');
    filePath = 'requests/' + parts[0] + '/tasks/' + parts[1] + '/exec-log.md';
  }
  try {
    const data = await apiFetch('/file?path=' + encodeURIComponent(filePath));
    logContent = data.content || '';
  } catch {
    logContent = '(File not found: ' + filePath + ')';
  }
  renderCurrentView();
  scrollLogToBottom();
}

function scrollLogToBottom() {
  const el = document.getElementById('log-content');
  if (el) el.scrollTop = el.scrollHeight;
}

// ─── Dependencies View ───────────────────────────────────────────────────────

function renderDependencies() {
  const depHeader = '<div class="view-header">' +
    '<div class="view-header-title">Dependencies</div>' +
    '<button class="refresh-btn" id="refresh-btn-dependencies" onclick="refreshView(\\'dependencies\\')"><span class="refresh-icon">&#x21bb;</span> Refresh</button>' +
    '</div>';
  // Collect requests that have blockedBy or blocks relationships
  const hasRelation = requests.filter(r =>
    (r.blockedBy && r.blockedBy.length > 0) || (r.blocks && r.blocks.length > 0)
  );

  // Build adjacency: blockedBy means an edge from blocker -> blocked
  const edges = [];
  const nodeIds = new Set();
  requests.forEach(r => {
    if (r.blockedBy && r.blockedBy.length > 0) {
      r.blockedBy.forEach(dep => {
        edges.push({ from: dep, to: r.id });
        nodeIds.add(dep);
        nodeIds.add(r.id);
      });
    }
  });

  if (edges.length === 0) {
    return depHeader +
      '<div class="empty-state"><div class="icon">&#128279;</div>' +
      '<h2>No Dependencies</h2>' +
      '<p>No dependency relationships found between requests</p></div>';
  }

  // Build lookup
  const reqMap = {};
  requests.forEach(r => { reqMap[r.id] = r; });

  // Topological layering (Kahn-style BFS)
  const inDeg = {};
  const adj = {};
  nodeIds.forEach(id => { inDeg[id] = 0; adj[id] = []; });
  edges.forEach(e => {
    adj[e.from].push(e.to);
    inDeg[e.to] = (inDeg[e.to] || 0) + 1;
  });
  const layers = [];
  let queue = [];
  nodeIds.forEach(id => { if (inDeg[id] === 0) queue.push(id); });
  const assigned = new Set();
  while (queue.length > 0) {
    layers.push([...queue]);
    queue.forEach(id => assigned.add(id));
    const next = [];
    queue.forEach(id => {
      (adj[id] || []).forEach(to => {
        inDeg[to]--;
        if (inDeg[to] === 0 && !assigned.has(to)) next.push(to);
      });
    });
    queue = next;
  }
  // Orphans (cycles): put remaining in last layer
  nodeIds.forEach(id => { if (!assigned.has(id)) { layers.push([id]); assigned.add(id); } });

  // Position nodes: left-to-right layers
  const COL_W = 220;
  const ROW_H = 90;
  const PAD_X = 40;
  const PAD_Y = 30;
  const nodePos = {};
  layers.forEach((layer, li) => {
    layer.forEach((id, ri) => {
      nodePos[id] = { x: PAD_X + li * COL_W, y: PAD_Y + ri * ROW_H };
    });
  });

  const totalW = PAD_X * 2 + layers.length * COL_W;
  const maxRows = Math.max(...layers.map(l => l.length));
  const totalH = PAD_Y * 2 + maxRows * ROW_H;

  // Render SVG arrows
  let svgLines = '';
  edges.forEach(e => {
    const f = nodePos[e.from];
    const t = nodePos[e.to];
    if (!f || !t) return;
    const x1 = f.x + 160;
    const y1 = f.y + 30;
    const x2 = t.x;
    const y2 = t.y + 30;
    svgLines += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + 'var(--text-muted)' + '" stroke-width="2" marker-end="url(#arrow)"/>';
  });

  const svg = '<svg width="' + totalW + '" height="' + totalH + '" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><marker id="arrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">' +
    '<polygon points="0 0, 10 3.5, 0 7" fill="var(--text-muted)"/></marker></defs>' +
    svgLines + '</svg>';

  // Render nodes
  let nodesHtml = '';
  nodeIds.forEach(id => {
    const r = reqMap[id] || { id: id, title: id, status: 'unknown' };
    const pos = nodePos[id];
    if (!pos) return;
    const st = (r.status || '').toLowerCase();
    let statusCls = 'status-pending';
    if (['completed','done','success'].includes(st)) statusCls = 'status-done';
    else if (['executing','running','in_progress','active'].includes(st)) statusCls = 'status-active';
    else if (r.blockedBy && r.blockedBy.length > 0) statusCls = 'status-blocked';

    nodesHtml += '<div class="dep-node ' + statusCls + '" style="left:' + pos.x + 'px;top:' + pos.y + 'px">' +
      '<div class="dep-id">' + escapeHtml(r.id) + '</div>' +
      '<div class="dep-title">' + escapeHtml(r.title || r.id) + '</div>' +
      '<span class="dep-status">' + escapeHtml(r.status || 'pending') + '</span>' +
      '</div>';
  });

  return depHeader +
    '<div class="dep-graph" style="min-width:' + totalW + 'px;min-height:' + totalH + 'px">' +
    svg + nodesHtml + '</div>';
}

// ─── Notification Helpers ────────────────────────────────────────────────────

function notifTypeIcon(type) {
  switch (type) {
    case 'success': return '\\u2705';
    case 'error': return '\\u274C';
    case 'warning': return '\\u26A0\\uFE0F';
    case 'phase': return '\\u27A1\\uFE0F';
    case 'trace': return '\\uD83D\\uDCDD';
    default: return '\\u2139\\uFE0F';
  }
}

function addNotification(msg, type) {
  type = type || 'info';
  notifications.unshift({ message: msg, time: new Date().toISOString(), read: false, type: type });
  if (notifications.length > 50) notifications = notifications.slice(0, 50);
  notificationUnread = notifications.filter(n => !n.read).length;
  updateNotifBadge();
  if (showNotificationPanel) renderNotifList();
  showToast(msg, type);
}

function updateNotifBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  if (notificationUnread > 0) {
    badge.style.display = 'flex';
    badge.textContent = notificationUnread > 99 ? '99+' : String(notificationUnread);
  } else {
    badge.style.display = 'none';
  }
}

function toggleNotifPanel(e) {
  if (e) e.stopPropagation();
  showNotificationPanel = !showNotificationPanel;
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  panel.style.display = showNotificationPanel ? 'flex' : 'none';
  if (showNotificationPanel) renderNotifList();
}

function renderNotifList() {
  const list = document.getElementById('notif-list');
  if (!list) return;
  if (notifications.length === 0) {
    list.innerHTML = '<div class="notif-empty">No notifications</div>';
    return;
  }
  list.innerHTML = notifications.map((n, i) => {
    const t = new Date(n.time).toLocaleTimeString();
    const icon = notifTypeIcon(n.type);
    return '<div class="notif-item ' + (n.read ? '' : 'unread') + '" onclick="markNotifRead(' + i + ')">' +
      '<span class="notif-icon">' + icon + '</span>' +
      '<div class="notif-body">' +
        '<div class="notif-time">' + t + '</div>' +
        '<div class="notif-msg">' + escapeHtml(n.message) + '</div>' +
      '</div>' +
      '</div>';
  }).join('');
}

function markNotifRead(idx) {
  if (notifications[idx]) {
    notifications[idx].read = true;
    notificationUnread = notifications.filter(n => !n.read).length;
    updateNotifBadge();
    renderNotifList();
  }
}

function markAllRead() {
  notifications.forEach(n => { n.read = true; });
  notificationUnread = 0;
  updateNotifBadge();
  renderNotifList();
}

// Close notification panel on outside click
document.addEventListener('click', function(e) {
  if (!showNotificationPanel) return;
  const panel = document.getElementById('notif-panel');
  const bell = document.getElementById('notif-bell');
  if (panel && !panel.contains(e.target) && bell && !bell.contains(e.target)) {
    showNotificationPanel = false;
    panel.style.display = 'none';
  }
});

// ─── Settings ────────────────────────────────────────────────────────────────

function renderSettings() {
  const defaults = configDefaults || {};
  const metaKeys = ['version', 'plugin_name', 'branding'];
  let html = '<div class="settings-form" style="max-width:800px">' +
    '<h2 style="margin-bottom:16px;font-size:18px">Configuration</h2>';

  const keys = Object.keys(defaults);
  for (const section of keys) {
    const sectionDefaults = defaults[section];
    const sectionConfig = config && Object.prototype.hasOwnProperty.call(config, section) ? config[section] : undefined;
    if (metaKeys.includes(section)) {
      html += renderMetaSection(section, sectionConfig ?? sectionDefaults);
      continue;
    }
    // Add description hints for models section
    if (section === 'models') {
      html += '<div class="config-section">' +
        '<div class="config-section-header" onclick="toggleConfigSection(this)"><span>models</span><span>&#9662;</span></div>' +
        '<div class="config-section-body">' +
          '<div style="font-size:11px;color:var(--text-muted);padding:4px 0 8px;border-bottom:1px solid var(--border);margin-bottom:8px">' +
            '<b>claude</b>: Claude 전용 역할 (opus / sonnet) &nbsp;|&nbsp; ' +
            '<b>developer</b> &amp; <b>reviewer</b>: CLI 에이전트 (provider + model 자유 선택)' +
          '</div>';
      const modelsDefaults = sectionDefaults || {};
      const modelsConfig = sectionConfig || {};
      for (const sub of Object.keys(modelsDefaults)) {
        const subDef = modelsDefaults[sub];
        const subCfg = modelsConfig[sub] || {};
        if (typeof subDef === 'object' && subDef !== null) {
          html += renderSection(sub, subDef, subCfg, true, 'models.' + sub);
        } else {
          html += renderField(sub, subDef, subCfg, 'models', true);
        }
      }
      html += '</div></div>';
      continue;
    }
    if (typeof sectionDefaults === 'object' && sectionDefaults !== null && !Array.isArray(sectionDefaults)) {
      html += renderSection(section, sectionDefaults, sectionConfig || {}, true, section);
    } else {
      html += renderScalarSection(section, sectionDefaults, sectionConfig, '', true);
    }
  }

  const extraKeys = Object.keys(config || {}).filter((key) => !(key in defaults));
  if (extraKeys.length > 0) {
    const extraDefaults = Object.fromEntries(extraKeys.map((k) => [k, config[k]]));
    html += renderSection('Custom (project-only)', extraDefaults, extraDefaults, true, '', false, false);
  }

  html += '</div>' +
    '<div style="display:flex;gap:8px;margin:20px 0">' +
      '<button class="btn" onclick="saveSettingsForm()">Save</button>' +
      '<button class="btn btn-secondary" onclick="resetToDefaults()">Reset to Defaults</button>' +
      '<button class="btn btn-secondary" onclick="refreshConfig()">Reload</button>' +
    '</div>' +
    '<div class="mode-status">' +
      '<h3>Maestro Mode Status</h3>' +
      '<pre style="margin-top:8px">' + highlightJson(modeStatus) + '</pre>' +
    '</div>';
  return html;
}

function renderMetaSection(section, value) {
  let text = '';
  if (typeof value === 'object' && value !== null) {
    try { text = JSON.stringify(value, null, 2); } catch { text = String(value); }
  } else {
    text = String(value ?? '');
  }
  return '<div class="config-section" style="margin-top:8px;">' +
    '<div class="config-section-header">' + escapeHtml(section) + '</div>' +
    '<div class="config-meta">' + escapeHtml(text) + '</div>' +
  '</div>';
}

function renderScalarSection(name, defaultValue, projectValue, sectionPath = '', compareDefaults = true) {
  const body = renderField(name, defaultValue, projectValue, sectionPath, compareDefaults);
  return '<div class="config-section">' +
    '<div class="config-section-header" onclick="toggleConfigSection(this)">' +
      '<span>' + escapeHtml(name) + '</span>' +
      '<span>▾</span>' +
    '</div>' +
    '<div class="config-section-body">' + body + '</div>' +
  '</div>';
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDeepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (!isPlainObject(a) || !isPlainObject(b)) return a === b;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && isDeepEqual(a[key], b[key]));
}

function getDefaultType(v) {
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return 'number';
  if (v === null) return 'null';
  if (typeof v === 'string') return 'string';
  return 'string';
}

function renderSection(name, defaults, projectValues, expanded = true, sectionPath = name, compareDefaults = true, canCollapse = true) {
  const keys = Object.keys(defaults || {});
  let body = '';
  for (const key of keys) {
    const defaultValue = defaults[key];
    const projectValue = projectValues ? projectValues[key] : undefined;

    if (isPlainObject(defaultValue)) {
      body += renderSection(
        key,
        defaultValue,
        projectValue || {},
        true,
        sectionPath ? sectionPath + '.' + key : key,
        compareDefaults,
        true
      );
    } else {
      body += renderField(key, defaultValue, projectValue, sectionPath, compareDefaults);
    }
  }
  return '<div class="config-section' + (canCollapse && !expanded ? ' collapsed' : '') + '">' +
    '<div class="config-section-header" onclick="toggleConfigSection(this)">' +
      '<span>' + escapeHtml(name) + '</span>' +
      '<span>▾</span>' +
    '</div>' +
    '<div class="config-section-body">' + body + '</div>' +
  '</div>';
}

function renderField(fieldKey, defaultValue, projectValue, sectionPath = '', compareDefaults = true) {
  const value = projectValue === undefined ? defaultValue : projectValue;
  const type = getDefaultType(defaultValue);
  const isDefault = compareDefaults ? isDeepEqual(value, defaultValue) : true;
  const badge = compareDefaults
    ? (isDefault ? '<span class="config-badge default">(default)</span>' : '<span class="config-badge modified">(modified)</span>')
    : '';
  const valueText = value === null ? '' : escapeHtml(String(value));
  const ds = escapeHtml(sectionPath || '');
  let input = '';
  if (type === 'boolean') {
    input = '<input type="checkbox" data-section="' + ds + '" data-key="' + escapeHtml(fieldKey) + '" data-type="' + type + '" ' + (value ? 'checked' : '') + ' onclick="event.stopPropagation()">';
  } else if (type === 'number') {
    input = '<input type="number" data-section="' + ds + '" data-key="' + escapeHtml(fieldKey) + '" data-type="' + type + '" value="' + valueText + '">';
  } else if (type === 'null') {
    input = '<input type="text" placeholder="null" data-section="' + ds + '" data-key="' + escapeHtml(fieldKey) + '" data-type="' + type + '" value="' + valueText + '">';
  } else {
    input = '<input type="text" data-section="' + ds + '" data-key="' + escapeHtml(fieldKey) + '" data-type="' + type + '" value="' + valueText + '">';
  }
  return '<div class="config-field">' +
    '<label>' + escapeHtml(fieldKey) + '</label>' +
    '<span>' + input + '</span>' +
    '<span>' + badge + '</span>' +
  '</div>';
}

function toggleConfigSection(btn) {
  const section = btn.closest('.config-section');
  if (section) section.classList.toggle('collapsed');
}

function collectConfigFromForm() {
  const next = {};
  const fields = document.querySelectorAll('.settings-form [data-section][data-key][data-type]');
  fields.forEach((el) => {
    const section = el.getAttribute('data-section') || '';
    const key = el.getAttribute('data-key');
    const type = el.getAttribute('data-type');
    if (!key || !type) return;

    let value;
    if (type === 'boolean') {
      value = el.checked;
    } else if (type === 'number') {
      const parsed = parseFloat(el.value);
      if (Number.isNaN(parsed)) {
        throw new Error('Invalid number for ' + key);
      }
      value = parsed;
    } else if (type === 'null') {
      const raw = (el.value || '').trim();
      value = raw === '' || raw.toLowerCase() === 'null' ? null : raw;
    } else {
      value = el.value;
    }

    const target = section
      ? section.split('.').reduce((acc, part) => {
          if (!acc[part]) acc[part] = {};
          return acc[part];
        }, next)
      : next;
    target[key] = value;
  });
  return next;
}

function saveSettingsForm() {
  try {
    const nextConfig = collectConfigFromForm();
    // Preserve read-only meta fields from current config
    var metaKeys = ['version', 'plugin_name', 'branding'];
    metaKeys.forEach(function(mk) {
      if (config && config[mk] !== undefined && !(mk in nextConfig)) {
        nextConfig[mk] = config[mk];
      }
    });
    apiFetch('/config', {
      method: 'PUT',
      body: JSON.stringify(nextConfig)
    }).then(() => {
      config = nextConfig;
      viewCache['settings'] = null;
      renderCurrentView();
      showToast('Configuration saved', 'success');
    }).catch((e) => {
      showToast('Error: ' + e.message, 'error');
    });
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function refreshConfig() {
  try {
    config = await apiFetch('/config');
    viewCache['settings'] = null;
    renderCurrentView();
    showToast('Configuration reloaded', 'success');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

function resetToDefaults() {
  try {
    config = JSON.parse(JSON.stringify(configDefaults || {}));
    viewCache['settings'] = null;
    renderCurrentView();
    showToast('Reset to defaults (unsaved)', 'info');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

function saveConfig() {
  return saveSettingsForm();
}

let toastQueue = [];
let toastShowing = false;

function showToast(msg, type) {
  type = type || 'info';
  toastQueue.push({ msg: msg, type: type });
  if (!toastShowing) processToastQueue();
}

function processToastQueue() {
  if (toastQueue.length === 0) { toastShowing = false; return; }
  toastShowing = true;
  const item = toastQueue.shift();
  const t = document.getElementById('toast');
  if (!t) { toastShowing = false; return; }
  t.className = 'toast toast-' + item.type;
  const icon = notifTypeIcon(item.type);
  t.innerHTML = '<span class="toast-icon">' + icon + '</span><span>' + escapeHtml(item.msg) + '</span>';
  t.classList.add('show');
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(processToastQueue, 300);
  }, 2500);
}

// ─── Ideation View ──────────────────────────────────────────────────────────

function normalizeProviderFromKey(key) {
  const match = key.match(/\(([^()]+)\)$/);
  return match ? match[1] : key;
}

function normalizeRoleFromKey(key) {
  const match = key.match(/^(.+)\(([^()]+)\)$/);
  return match ? match[1] : key;
}

function normalizeParticipantStatus(value) {
  if (value && typeof value === 'object' && typeof value.status === 'string') return value.status;
  return 'pending';
}

function capitalizeWord(word) {
  return word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : '';
}

function normalizeText(str) {
  return String(str || '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function capitalizeRoleLabel(raw) {
  return normalizeText(raw).split(' ').map(capitalizeWord).join(' ');
}

function getSessionParticipants(session, fallbackOpinions) {
  if (session && Array.isArray(session.participants) && session.participants.length > 0) {
    return session.participants.map(function(p) {
      return {
        key: p.key,
        role: p.role || normalizeRoleFromKey(p.key || ''),
        perspective: p.perspective || '',
        status: p.status || normalizeParticipantStatus(p),
        provider: p.provider || normalizeProviderFromKey(p.key || ''),
      };
    });
  }

  if (session && session.roles && typeof session.roles === 'object') {
    const roleMap = session.roles;
    const keys = Object.keys(roleMap);
    if (keys.length > 0) {
      return keys.map(function(key) {
        const role = roleMap[key] || {};
        return {
          key: key,
          role: (role.role || normalizeRoleFromKey(key)),
          perspective: role.perspective || '',
          status: normalizeParticipantStatus(role),
          provider: role.provider || normalizeProviderFromKey(key),
        };
      });
    }
  }

  if (fallbackOpinions && typeof fallbackOpinions === 'object') {
    const keys = Object.keys(fallbackOpinions);
    if (keys.length > 0) {
      return keys.map(function(key) {
        return {
          key: key,
          role: normalizeRoleFromKey(key),
          perspective: '',
          status: normalizeParticipantStatus(fallbackOpinions[key]),
          provider: normalizeProviderFromKey(key),
        };
      });
    }
  }

  return ['codex', 'gemini', 'claude'].map(function(key) {
    return {
      key: key,
      role: key,
      perspective: '',
      status: 'pending',
      provider: key,
    };
  });
}

function participantProviderClass(provider) {
  const normalized = (provider || '').toLowerCase();
  return ['codex', 'gemini', 'claude'].includes(normalized) ? normalized : '';
}

function participantLabel(participant) {
  const provider = (participant.provider || '').toLowerCase();
  const role = participant.role || participant.key || '';
  if (!role) return capitalizeWord(provider);

  const roleNormalized = normalizeText(role);
  const roleLabel = capitalizeRoleLabel(roleNormalized);
  if (roleNormalized && roleNormalized.toLowerCase() === provider.toLowerCase()) return capitalizeWord(provider);
  return roleLabel + ' (' + capitalizeWord(provider) + ')';
}

function renderIdeation() {
  // Detail view for a specific ideation session
  if (ideationActiveSession) {
    const s = ideationActiveSession.session;
    const ops = ideationActiveSession.opinions || {};
    const participants = getSessionParticipants(s, ops);
    const participantKeys = participants.map(function(p) { return p.key; });
    const statusCls = (s.status || 'collecting').toLowerCase();

    let html = '<button class="ideation-back" onclick="closeIdeationDetail()">&larr; Back to sessions</button>';
    html += '<div class="card"><div class="card-title">' + escapeHtml(s.id) + ': ' + escapeHtml(s.topic) + '</div>';
    html += '<div class="card-subtitle"><span class="ideation-status ' + statusCls + '">' + escapeHtml(s.status || 'collecting') + '</span>';
    if (s.focus) html += ' &middot; Focus: ' + escapeHtml(s.focus);
    if (s.created_at) html += ' &middot; ' + new Date(s.created_at).toLocaleString();
    html += '</div>';

    // Opinion progress chips
    html += '<div class="opinion-progress">';
    participantKeys.forEach(function(ai) {
      const participant = participants.find(function(p) { return p.key === ai; }) || { status: 'pending', provider: ai };
      const st = participant.status || 'pending';
      const dotCls = st === 'done' ? 'done' : st === 'failed' ? 'failed'
        : st === 'pending' && statusCls === 'collecting' ? 'collecting'
        : participant.status === 'pending' ? 'pending'
          : participant.status;
      html += '<div class="opinion-chip"><div class="op-dot ' + dotCls + '"></div>' + ai + '</div>';
    });
    html += '</div></div>';

    // Three-column opinions
    let hasAnyOpinion = false;
    for (const key of participantKeys) {
      if (ops[key]) {
        hasAnyOpinion = true;
        break;
      }
    }
    if (hasAnyOpinion) {
      html += '<div class="opinions-columns">';
      participantKeys.forEach(function(ai) {
        const role = participants.find(function(p) { return p.key === ai; }) || {
          key: ai,
          role: ai,
          perspective: '',
          provider: ai,
          status: 'pending',
        };
        const providerLabel = participantLabel(role);
        const perspective = role.perspective || '';
        const label = perspective
          ? providerLabel + ' — ' + escapeHtml(perspective)
          : providerLabel;
        const content = ops[ai];
        const panelClass = participantProviderClass(role.provider);
        html += '<div class="opinion-panel' + (panelClass ? ' ' + panelClass : '') + '"><h4>' + label + '</h4>';
        if (content) {
          html += '<div class="doc-content" style="background:transparent;border:none;padding:0">' + renderMarkdown(content) + '</div>';
        } else {
          html += '<div style="color:var(--text-muted);font-size:13px">Waiting for response...</div>';
        }
        html += '</div>';
      });
      html += '</div>';
    }

    // Critiques
    const crits = ideationActiveSession.critiques || {};
    const criticKeys = Object.keys(crits);
    if (criticKeys.length > 0) {
      html += '<div class="critiques-section"><h4>Critical Review</h4>';
      html += '<div class="opinions-columns" style="grid-template-columns:repeat(' + criticKeys.length + ',1fr)">';
      criticKeys.forEach(function(criticKey) {
        const criticProvider = (s.critics && s.critics[criticKey] && s.critics[criticKey].provider) || criticKey;
        if (!crits[criticKey]) return;
        html += '<div class="opinion-panel critic"><h4>' + criticProvider.charAt(0).toUpperCase() + criticProvider.slice(1) + ' Critic</h4>';
        html += '<div class="doc-content" style="background:transparent;border:none;padding:0">' + renderMarkdown(crits[criticKey]) + '</div></div>';
      });
      html += '</div></div>';
    }

    // Synthesis
    if (ideationActiveSession.synthesis) {
      html += '<div class="synthesis-panel"><h4>PM Synthesis</h4>';
      html += '<div class="doc-content" style="background:transparent;border:none;padding:0">' + renderMarkdown(ideationActiveSession.synthesis) + '</div>';
      html += '</div>';
    }

    // Discussion
    if (ideationActiveSession.discussion) {
      html += '<div class="discussion-panel"><h4>Discussion</h4>';
      html += '<div class="doc-content" style="background:transparent;border:none;padding:0">' + renderMarkdown(ideationActiveSession.discussion) + '</div>';
      html += '</div>';
    }

    return html;
  }

    // Detail view for a specific discussion session
  if (discussionActiveSession) {
    const s = discussionActiveSession.session;
    const rounds = discussionActiveSession.rounds || [];
    const participants = getSessionParticipants(s, {});
    const participantKeys = participants.map(function(p) { return p.key; });
    const statusCls = (s.status || 'initializing').toLowerCase();

    let html = '<button class="ideation-back" onclick="closeDiscussionDetail()">&larr; Back to sessions</button>';
    html += '<div class="card"><div class="card-title">' + escapeHtml(s.id) + ': ' + escapeHtml(s.topic) + '</div>';
    html += '<div class="card-subtitle"><span class="ideation-status ' + statusCls + '">' + escapeHtml(s.status || 'initializing') + '</span>';
    html += ' &middot; Round ' + (s.current_round || 0) + '/' + (s.max_rounds || 5);
    if (s.source_ideation) html += ' &middot; from ' + escapeHtml(s.source_ideation);
    if (s.focus) html += ' &middot; Focus: ' + escapeHtml(s.focus);
    if (s.created_at) html += ' &middot; ' + new Date(s.created_at).toLocaleString();
    html += '</div></div>';

    // Rounds
    rounds.forEach(function(r) {
      html += '<div class="card" style="margin-top:12px">';
      html += '<div class="card-title" style="font-size:14px">Round ' + r.round + '</div>';

      // Three-column opinions for this round
      const hasAny = participantKeys.some(function(ai) {
        const roundResponses = r.responses || r;
        return !!roundResponses[ai];
      });
      if (hasAny) {
        html += '<div class="opinions-columns">';
        participantKeys.forEach(function(ai) {
          const participant = participants.find(function(p) { return p.key === ai; }) || {
            key: ai,
            role: ai,
            provider: ai,
            perspective: '',
            status: 'pending',
          };
          const providerLabel = participantLabel(participant);
          const perspective = participant.perspective || '';
          const label = perspective
            ? providerLabel + ' — ' + escapeHtml(perspective)
            : providerLabel;
          const roundResponses = r.responses || {};
          const content = roundResponses[ai] || r[ai];
          const panelClass = participantProviderClass(participant.provider);
          html += '<div class="opinion-panel' + (panelClass ? ' ' + panelClass : '') + '"><h4>' + label + '</h4>';
          if (content) {
            html += '<div class="doc-content" style="background:transparent;border:none;padding:0;font-size:12px">' + renderMarkdown(content) + '</div>';
          } else {
            html += '<div style="color:var(--text-muted);font-size:12px">No response</div>';
          }
          html += '</div>';
        });
        html += '</div>';
      }

      // Round critiques
      const rc = r.critiques || {};
      const roundCriticKeys = Object.keys(rc);
      if (roundCriticKeys.length > 0) {
        html += '<div class="critiques-section"><h4>Critical Review</h4>';
        html += '<div class="opinions-columns" style="grid-template-columns:repeat(' + roundCriticKeys.length + ',1fr)">';
        roundCriticKeys.forEach(function(criticKey) {
          const criticProvider = (s.critics && s.critics[criticKey] && s.critics[criticKey].provider) || criticKey;
          if (!rc[criticKey]) return;
          html += '<div class="opinion-panel critic"><h4>' + criticProvider.charAt(0).toUpperCase() + criticProvider.slice(1) + ' Critic</h4>';
          html += '<div class="doc-content" style="background:transparent;border:none;padding:0;font-size:12px">' + renderMarkdown(rc[criticKey]) + '</div></div>';
        });
        html += '</div></div>';
      }

      // Round synthesis
      if (r.synthesis) {
        html += '<div class="synthesis-panel" style="margin-top:8px"><h4>Round ' + r.round + ' Synthesis</h4>';
        html += '<div class="doc-content" style="background:transparent;border:none;padding:0;font-size:12px">' + renderMarkdown(r.synthesis) + '</div>';
        html += '</div>';
      }
      html += '</div>';
    });

    // Consensus
    if (discussionActiveSession.consensus) {
      html += '<div class="synthesis-panel" style="margin-top:12px;border-color:var(--green)"><h4 style="color:var(--green)">Consensus</h4>';
      html += '<div class="doc-content" style="background:transparent;border:none;padding:0">' + renderMarkdown(discussionActiveSession.consensus) + '</div>';
      html += '</div>';
    }

    return html;
  }

  // List view — merge ideation + discussion sessions
  const ideaHeader = '<div class="view-header">' +
    '<div class="view-header-title">Ideation &amp; Discussion</div>' +
    '<button class="refresh-btn" id="refresh-btn-ideation" onclick="refreshView(\\'ideation\\')"><span class="refresh-icon">&#x21bb;</span> Refresh</button>' +
    '</div>';
  const allSessions = [];
  ideationSessions.forEach(function(s) { allSessions.push({ ...s, _type: 'ideation' }); });
  discussionSessions.forEach(function(s) { allSessions.push({ ...s, _type: 'discussion' }); });
  allSessions.sort(function(a, b) { var tA = a.created_at ? new Date(a.created_at).getTime() : 0; var tB = b.created_at ? new Date(b.created_at).getTime() : 0; if (tA !== tB) return tB - tA; var numA = parseInt((a.id || '').replace(/\D+/g, '')) || 0; var numB = parseInt((b.id || '').replace(/\D+/g, '')) || 0; return numB - numA; });

  if (allSessions.length === 0) {
    return ideaHeader +
      '<div class="empty-state"><div class="icon">&#128161;</div>' +
      '<h2>No Sessions</h2>' +
      '<p>Run /mst:ideation or /mst:discussion to start.</p></div>';
  }

  let html = ideaHeader + '<div class="ideation-grid">';
  allSessions.forEach(function(s) {
    const isDiscussion = s._type === 'discussion';
    const statusCls = (s.status || 'collecting').toLowerCase();
    const onclick = isDiscussion
      ? 'loadDiscussionSession(\\'' + escapeHtml(s.id) + '\\')'
      : 'loadIdeationSession(\\'' + escapeHtml(s.id) + '\\')';

    html += '<div class="ideation-card" onclick="' + onclick + '">';
    html += '<span style="font-size:11px;padding:1px 6px;border-radius:3px;font-weight:600;background:' + (isDiscussion ? 'rgba(240,192,64,0.15);color:var(--yellow)' : 'rgba(100,200,120,0.15);color:var(--green)') + '">' + (isDiscussion ? 'DSC' : 'IDN') + '</span>';
    html += '<span style="font-size:13px;font-weight:600;color:var(--text-secondary);min-width:80px">' + escapeHtml(s.id) + '</span>';
    html += '<span style="font-size:13px;color:var(--text-primary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(s.topic || '') + '</span>';
    html += '<span class="ideation-status ' + statusCls + '">' + escapeHtml(s.status || 'collecting') + '</span>';
    if (isDiscussion && s.current_round != null) html += '<span style="font-size:11px;color:var(--text-muted)">R' + s.current_round + '/' + (s.max_rounds || 5) + '</span>';
    if (s.created_at) html += '<span style="font-size:11px;color:var(--text-muted);min-width:140px;text-align:right">' + new Date(s.created_at).toLocaleString() + '</span>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}

async function loadIdeationSession(id) {
  try {
    discussionActiveSession = null;
    ideationActiveSession = await apiFetch('/ideation/' + encodeURIComponent(id));
    renderCurrentView();
  } catch (e) {
    showToast('Error loading session: ' + e.message, 'error');
  }
}

async function loadDiscussionSession(id) {
  try {
    ideationActiveSession = null;
    discussionActiveSession = await apiFetch('/discussion/' + encodeURIComponent(id));
    renderCurrentView();
  } catch (e) {
    showToast('Error loading session: ' + e.message, 'error');
  }
}

function closeIdeationDetail() {
  ideationActiveSession = null;
  renderCurrentView();
}

function closeDiscussionDetail() {
  discussionActiveSession = null;
  renderCurrentView();
}

// ─── Approval Banner Logic ───────────────────────────────────────────────────
let approvalNotified = new Set();
let bannerDismissed = new Set();

function dismissApprovalBanner() {
  const banner = document.getElementById('approval-banner');
  if (banner) banner.style.display = 'none';
  // Remember dismissed requests so banner doesn't re-appear until status changes
  requests.forEach(r => {
    const st = (r.status || '').toLowerCase();
    if (st === 'phase1_spec_review' || st === 'phase2_spec_review') {
      bannerDismissed.add(r.id + ':' + st);
    }
  });
}

function updateApprovalBanner() {
  const banner = document.getElementById('approval-banner');
  const msg = document.getElementById('approval-msg');
  if (!banner || !msg) return;
  // Only show for explicit spec approval states (Phase 1 complete, awaiting user approval)
  const pending = requests.filter(r => {
    const st = (r.status || '').toLowerCase();
    const needsApproval = st === 'phase1_spec_review' || st === 'phase2_spec_review';
    return needsApproval && !bannerDismissed.has(r.id + ':' + st);
  });
  if (pending.length > 0) {
    const labels = pending.map(r => r.id).join(', ');
    msg.textContent = labels + ': Spec ready — run /mst:approve to proceed';
    banner.style.display = 'flex';
    // Browser notification (once per request)
    pending.forEach(r => {
      if (!approvalNotified.has(r.id)) {
        approvalNotified.add(r.id);
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Gran Maestro', { body: r.id + ': Spec ready for approval' });
        } else if ('Notification' in window && Notification.permission !== 'denied') {
          Notification.requestPermission();
        }
      }
    });
  } else {
    banner.style.display = 'none';
  }
}

// ─── View Switching ─────────────────────────────────────────────────────────
function switchView(view) {
  delete viewCache[currentView]; // Invalidate cache of view being left
  ideationActiveSession = null;
  discussionActiveSession = null;
  currentView = view;
  document.querySelectorAll('nav button').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-view') === view);
  });
  
  // Toggle search bar visibility
  const searchBar = document.getElementById('search-container');
  if (searchBar) {
    searchBar.style.display = (view === 'workflow') ? 'flex' : 'none';
  }

  renderCurrentView();
}

function patchCards(main, newHtml) {
  const temp = document.createElement('div');
  temp.innerHTML = newHtml;

  // With the new master-detail layout, patch the detail panel content
  const oldDetail = main.querySelector('.workflow-detail');
  const newDetail = temp.querySelector('.workflow-detail');
  if (oldDetail && newDetail) {
    // Update list items
    const oldList = main.querySelector('.workflow-list');
    const newList = temp.querySelector('.workflow-list');
    if (oldList && newList) oldList.innerHTML = newList.innerHTML;

    // Preserve task expansion in detail
    const hasExpanded = oldDetail.querySelector('.task-item.expanded');
    if (!hasExpanded) {
      oldDetail.innerHTML = newDetail.innerHTML;
    } else {
      // Update non-task parts
      const oldTitle = oldDetail.querySelector('.card-title');
      const newTitle = newDetail.querySelector('.card-title');
      if (oldTitle && newTitle && oldTitle.innerHTML !== newTitle.innerHTML) oldTitle.innerHTML = newTitle.innerHTML;
      const oldSub = oldDetail.querySelector('.card-subtitle');
      const newSub = newDetail.querySelector('.card-subtitle');
      if (oldSub && newSub && oldSub.innerHTML !== newSub.innerHTML) oldSub.innerHTML = newSub.innerHTML;
      const oldFill = oldDetail.querySelector('.progress-fill');
      const newFill = newDetail.querySelector('.progress-fill');
      if (oldFill && newFill) oldFill.style.width = newFill.style.width;
      const oldPhases = oldDetail.querySelector('.phase-row');
      const newPhases = newDetail.querySelector('.phase-row');
      if (oldPhases && newPhases && oldPhases.innerHTML !== newPhases.innerHTML) oldPhases.innerHTML = newPhases.innerHTML;
    }
    return;
  }

  // Fallback: old card-based patching
  const oldCards = main.querySelectorAll('[data-req-id]');
  const newCards = temp.querySelectorAll('[data-req-id]');

  // Build lookup maps
  const oldMap = new Map();
  oldCards.forEach(c => oldMap.set(c.getAttribute('data-req-id'), c));
  const newMap = new Map();
  newCards.forEach(c => newMap.set(c.getAttribute('data-req-id'), c));

  // If no cards in DOM yet, fall back to full replace
  if (oldCards.length === 0) {
    main.innerHTML = newHtml;
    return;
  }

  // If card count changed (added/removed), fall back to full replace
  if (oldMap.size !== newMap.size) {
    main.innerHTML = newHtml;
    return;
  }

  // Update existing cards in-place — only patch changed sections, preserving task detail expansion
  for (const [id, newCard] of newMap) {
    const oldCard = oldMap.get(id);
    if (!oldCard) continue;

    // Compare static parts
    const getStatic = (card) => {
      return (card.querySelector('.card-title')?.innerHTML || '') + '|' +
        (card.querySelector('.card-subtitle')?.innerHTML || '') + '|' +
        (card.querySelector('.progress-fill')?.style.width || '') + '|' +
        (card.querySelector('.phase-row')?.innerHTML || '') + '|' +
        card.className;
    };

    if (getStatic(oldCard) !== getStatic(newCard)) {
      // Update only the parts that change, preserving task-list expansion state
      oldCard.className = newCard.className;

      const oldTitle = oldCard.querySelector('.card-title');
      const newTitle = newCard.querySelector('.card-title');
      if (oldTitle && newTitle && oldTitle.innerHTML !== newTitle.innerHTML) {
        oldTitle.innerHTML = newTitle.innerHTML;
      }

      const oldSub = oldCard.querySelector('.card-subtitle');
      const newSub = newCard.querySelector('.card-subtitle');
      if (oldSub && newSub && oldSub.innerHTML !== newSub.innerHTML) {
        oldSub.innerHTML = newSub.innerHTML;
      }

      const oldFill = oldCard.querySelector('.progress-fill');
      const newFill = newCard.querySelector('.progress-fill');
      if (oldFill && newFill) {
        oldFill.style.width = newFill.style.width;
      }

      const oldPhases = oldCard.querySelector('.phase-row');
      const newPhases = newCard.querySelector('.phase-row');
      if (oldPhases && newPhases && oldPhases.innerHTML !== newPhases.innerHTML) {
        oldPhases.innerHTML = newPhases.innerHTML;
      }

      // Task list: only update non-expanded items
      const oldTasks = oldCard.querySelectorAll('.task-item');
      const newTaskList = newCard.querySelector('.task-list');
      const hasExpanded = oldCard.querySelector('.task-item.expanded');
      if (!hasExpanded && newTaskList) {
        const oldTaskList = oldCard.querySelector('.task-list');
        if (oldTaskList) {
          oldTaskList.innerHTML = newTaskList.innerHTML;
        }
      }

      oldCard.classList.add('card-updated');
      setTimeout(() => oldCard.classList.remove('card-updated'), 500);
    }
  }
}


function renderCurrentView() {
  const main = document.getElementById('main-content');
  if (!main) return;

  // Save scroll position before DOM replacement
  const scrollTop = main.scrollTop;

  let html;
  switch (currentView) {
    case 'workflow': html = renderWorkflow(); break;
    case 'agents': html = renderAgents(); break;
    case 'documents': html = renderDocuments(); break;
    case 'debug': html = renderDebug(); break;
    case 'ideation': html = renderIdeation(); break;
    case 'plans': html = renderPlans(); break;
    case 'dependencies': html = renderDependencies(); break;
    case 'settings': html = renderSettings(); break;
  }

  if (viewCache[currentView] !== html) {
    viewCache[currentView] = html;
    // Use card-level patching for workflow to avoid flickering
    if (currentView === 'workflow' && main.querySelector('.workflow-layout')) {
      patchCards(main, html);
    } else {
      main.innerHTML = html;
    }
    // Restore scroll position after DOM update
    main.scrollTop = scrollTop;
  }
  updateApprovalBanner();
}

// ─── Project Selector ───────────────────────────────────────────────────────
async function loadProjects() {
  try {
    const res = await fetch('/api/projects?token=' + TOKEN, { headers: apiHeaders() });
    if (res.ok) {
      projects = await res.json();
      const selector = document.getElementById('project-selector');
      const select = document.getElementById('project-select');
      if (projects.length > 0 && selector && select) {
        selector.style.display = '';
        select.innerHTML = projects.map(p =>
          '<option value="' + p.id + '"' + (p.id === currentProjectId ? ' selected' : '') + '>' + escapeHtml(p.name) + '</option>'
        ).join('');
        if (!currentProjectId && projects.length > 0) {
          currentProjectId = projects[0].id;
        }
      }
    }
  } catch { /* not in hub mode or no projects */ }
}

function switchProject(projectId) {
  currentProjectId = projectId;
  const url = new URL(window.location);
  url.searchParams.set('project', projectId);
  window.history.replaceState({}, '', url);
  loadData();
}

// ─── Data Loading ───────────────────────────────────────────────────────────
async function loadData() {
  await loadProjects();
  if (!configDefaultsLoaded) {
    await loadConfigDefaults();
    configDefaultsLoaded = true;
  }
  try {
    // Load requests and their tasks
    requests = await apiFetch('/requests');
    for (const req of requests) {
      try {
        req._tasks = await apiFetch('/requests/' + encodeURIComponent(req.id) + '/tasks');
      } catch { req._tasks = []; }
    }
  } catch { requests = []; }
  try { plans = await apiFetch('/plans'); } catch { plans = []; }
  await loadDebug();

  try { config = await apiFetch('/config'); } catch { config = {}; }
  try { modeStatus = await apiFetch('/mode'); } catch { modeStatus = {}; }
  try { docTree = await apiFetch('/tree'); } catch { docTree = []; }
  try { ideationSessions = await apiFetch('/ideation'); } catch { ideationSessions = []; }
  try { discussionSessions = await apiFetch('/discussion'); } catch { discussionSessions = []; }

  // Auto-refresh active ideation/discussion detail
  if (ideationActiveSession && currentView === 'ideation') {
    try {
      ideationActiveSession = await apiFetch('/ideation/' + encodeURIComponent(ideationActiveSession.session.id));
    } catch { /* keep stale data */ }
  }
  if (discussionActiveSession && currentView === 'ideation') {
    try {
      discussionActiveSession = await apiFetch('/discussion/' + encodeURIComponent(discussionActiveSession.session.id));
    } catch { /* keep stale data */ }
  }

  // Check for phase transitions requiring approval (deduplicated)
  requests.forEach(req => {
    const st = (req.status || '').toLowerCase();
    if (st.includes('approve') || st.includes('review') || st === 'phase2_spec_review') {
      if (!approvalNotified.has(req.id)) {
        addNotification(req.id + ': Approval needed', 'warning');
      }
    }
  });

  renderCurrentView();
}

async function loadConfigDefaults() {
  try {
    configDefaults = await apiFetch('/config/defaults');
  } catch {
    configDefaults = {};
  }
}

// ─── SSE Connection ─────────────────────────────────────────────────────────
function connectSSE() {
  const url = '/events?token=' + TOKEN;
  const es = new EventSource(url);

  es.onopen = () => {
    sseConnected = true;
    document.getElementById('connection-status').textContent = 'Connected';
    document.getElementById('connection-dot').classList.remove('disconnected');
    stopPolling();
    loadData();
  };

  es.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);

      // Filter by current project in hub mode
      if (currentProjectId && event.projectId && event.projectId !== currentProjectId) return;

      // Track agent activities
      if (event.type === 'agent_activity' || event.type === 'task_update' || event.type === 'request_update') {
        agentActivities.push({
          type: event.type,
          requestId: event.requestId,
          taskId: event.taskId,
          timestamp: (event.data && event.data.timestamp) || new Date().toISOString(),
          path: event.data && event.data.path,
          status: event.data && event.data.kind,
          agent: event.type,
          message: event.data && event.data.path ? 'File ' + event.data.kind + ': ' + event.data.path : ''
        });
        // Keep last 200 entries
        if (agentActivities.length > 200) agentActivities = agentActivities.slice(-200);
      }

      // ─── Notification collection ───
      if (event.type === 'phase_change') {
        const reqId = event.requestId || '?';
        addNotification(reqId + ': Phase changed', 'phase');
      }
      if (event.type === 'task_update') {
        const st = (event.data && event.data.kind) || '';
        const taskLabel = (event.requestId || '?') + '-' + (event.taskId || '?');
        if (st === 'done' || st === 'completed') {
          addNotification(taskLabel + ': Completed', 'success');
        } else if (st === 'failed' || st === 'error') {
          addNotification(taskLabel + ': Failed', 'error');
        } else if (st === 'cancelled') {
          addNotification(taskLabel + ': Cancelled', 'warning');
        }
      }
      if (event.type === 'config_change') {
        addNotification('Settings changed', 'info');
      }

      // ─── Log view: refresh if viewing exec-log and relevant event ───
      if (event.type === 'agent_activity' && event.data && event.data.path &&
          event.data.path.includes('exec-log') && logSelectedTask && currentView === 'log') {
        const parts = logSelectedTask.split('/');
        if (event.data.path.includes(parts[0]) && event.data.path.includes(parts[1])) {
          selectLogTask(logSelectedTask);
        }
      }

      // Ideation updates
      if (event.type === 'ideation_update') {
        addNotification('Ideation ' + (event.sessionId || '?') + ' updated', 'info');
      }

      // Trace updates
      if (event.type === 'trace_update') {
        const traceLabel = (event.requestId || '?') + '-' + (event.taskId || '?');
        const traceFile = (event.data && event.data.traceFile) || '';
        addNotification(traceLabel + ': AI trace saved (' + traceFile + ')', 'trace');
      }

      // Refresh data on meaningful events — set dirty flags per event type
      if (event.type === 'task_update' || event.type === 'request_update') {
        dirtyFlags.requests = true;
      }
      if (event.type === 'phase_change') {
        dirtyFlags.mode = true;
        dirtyFlags.requests = true;
      }
      if (event.type === 'config_change') {
        dirtyFlags.config = true;
      }
      if (event.type === 'ideation_update') {
        dirtyFlags.ideation = true;
      }
      if (event.type === 'discussion_update') {
        dirtyFlags.discussion = true;
      }
      if (event.type === 'plan_update') {
        dirtyFlags.plans = true;
      }
      if (event.type === 'debug_update') {
        dirtyFlags.debug = true;
      }
      if (event.type === 'trace_update') {
        dirtyFlags.requests = true;
      }
      if (['task_update', 'request_update', 'phase_change', 'config_change', 'ideation_update', 'discussion_update', 'trace_update', 'plan_update', 'debug_update'].includes(event.type)) {
        scheduleDirtyLoad();
      }
    } catch { /* ignore parse errors */ }
  };

  es.onerror = () => {
    sseConnected = false;
    document.getElementById('connection-status').textContent = 'Disconnected';
    document.getElementById('connection-dot').classList.add('disconnected');
    es.close();
    startPolling();
    // Reconnect after 3s
    setTimeout(connectSSE, 3000);
  };
}

// ─── Init ───────────────────────────────────────────────────────────────────
document.getElementById('theme-toggle').innerHTML = theme === 'light' ? '&#9728;' : '&#9789;';
const searchBar = document.getElementById('search-container');
if (searchBar) searchBar.style.display = (currentView === 'workflow') ? 'flex' : 'none';

connectSSE();
// loadData is called by SSE onopen; fall back if SSE fails to connect
setTimeout(() => { if (!sseConnected) { loadData(); startPolling(); } }, 3000);
</script>
</body>
</html>`;
}
