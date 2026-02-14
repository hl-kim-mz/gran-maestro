/**
 * Gran Maestro 플러그인 에이전트 정의
 *
 * Claude Code 플러그인 시스템에서 에이전트를 등록하는 레지스트리입니다.
 * 각 에이전트는 Task(subagent_type="gran-maestro:<name>") 형태로 호출됩니다.
 */

export interface AgentDefinition {
  name: string;
  description: string;
  model: 'haiku' | 'sonnet' | 'opus';
  tools: string[];
  systemPromptFile: string;
  /** Fallback agent name when this agent fails */
  fallback?: string;
  /** Maximum fallback chain depth (default: 1) */
  maxFallbackDepth?: number;
  /** Provider for CLI-based agents */
  provider?: 'claude' | 'codex' | 'gemini';
  /** Capabilities for agent selection */
  capabilities?: string[];
  /** Condition for automatic spawning */
  spawnCondition?: string;
}

export const agents: Record<string, AgentDefinition> = {
  // ─── Analysis Agents (Phase 1) ────────────────────────────

  'pm-conductor': {
    name: 'pm-conductor',
    description:
      'PM Conductor — Phase 1 & 3 리더. 요구사항 분석, 스펙 작성, 리뷰 조율, 사용자 커뮤니케이션',
    model: 'opus',
    tools: ['Read', 'Glob', 'Grep', 'Write', 'Bash', 'Task', 'AskUserQuestion'],
    systemPromptFile: 'agents/pm-conductor.md',
    provider: 'claude',
    capabilities: ['analysis', 'spec-writing', 'review', 'coordination'],
  },

  // ─── Design Wing (Phase 1, conditional) ───────────────────

  'architect': {
    name: 'architect',
    description:
      'Design Wing — 시스템 아키텍처, API 설계, 모듈 경계, 의존성 방향 설계',
    model: 'opus',
    tools: ['Read', 'Glob', 'Grep', 'Write'],
    systemPromptFile: 'agents/architect.md',
    provider: 'claude',
    capabilities: ['system-design', 'api-design', 'module-boundaries'],
    spawnCondition: 'new_module || structural_change',
  },

  'schema-designer': {
    name: 'schema-designer',
    description:
      'Design Wing — DB 스키마, 데이터 모델, ERD, 마이그레이션 계획 설계',
    model: 'opus',
    tools: ['Read', 'Glob', 'Grep', 'Write'],
    systemPromptFile: 'agents/schema-designer.md',
    provider: 'claude',
    capabilities: ['db-schema', 'data-model', 'erd', 'migration'],
    spawnCondition: 'data_model_change',
  },

  'ui-designer': {
    name: 'ui-designer',
    description:
      'Design Wing — 화면 설계, 컴포넌트 구조, 인터랙션 흐름, 디자인 시스템',
    model: 'opus',
    tools: ['Read', 'Glob', 'Grep', 'Write'],
    systemPromptFile: 'agents/ui-designer.md',
    provider: 'claude',
    capabilities: ['ui-spec', 'component-tree', 'interaction-flow'],
    spawnCondition: 'frontend_ui_work',
  },

  // ─── Feedback Agent (Phase 4) ─────────────────────────────

  'feedback-composer': {
    name: 'feedback-composer',
    description:
      'Feedback Composer — Phase 4 피드백 문서 작성. 리뷰 결과를 정밀한 수정 지침으로 변환',
    model: 'sonnet',
    tools: ['Read', 'Write', 'Grep'],
    systemPromptFile: 'agents/feedback-composer.md',
    provider: 'claude',
    capabilities: ['feedback', 'issue-classification', 'prioritization'],
  },
};

/**
 * 논리 역할 → 에이전트 키 매핑 테이블
 *
 * | 논리 역할 | agents.json 키 | 유형 | Phase |
 * |----------|----------------|------|-------|
 * | PM Conductor | pm-conductor | analysis | 1, 3 |
 * | Explorer Agent | (Claude Code Team) | analysis | 1 |
 * | Analyst Agent | (Claude Code Team) | analysis | 1 |
 * | Architect | architect | analysis | 1 |
 * | Schema Designer | schema-designer | analysis | 1 |
 * | UI Designer | ui-designer | analysis | 1 |
 * | Codex Developer | codex-dev (agents.json) | execution | 2 |
 * | Gemini Developer | gemini-dev (agents.json) | execution | 2 |
 * | Security Reviewer | (Claude Code Team) | — | 3 |
 * | Quality Reviewer | (Claude Code Team) | — | 3 |
 * | Verifier | (Claude Code Team) | — | 3 |
 * | Codex Reviewer | codex-reviewer (agents.json) | review | 3 |
 * | Gemini Reviewer | gemini-reviewer (agents.json) | review | 3 |
 * | Feedback Composer | feedback-composer | — | 4 |
 *
 * Note: Execution agents (codex-dev, gemini-dev) and review agents
 * (codex-reviewer, gemini-reviewer) are defined in the runtime
 * agents.json file at .gran-maestro/agents.json, not here.
 * They are invoked via CLI (Phase 2) or MCP (Phase 1, 3).
 *
 * The outsource-brief.md is a template (not an agent).
 * PM Conductor substitutes variables and passes it to CLI agents.
 */
