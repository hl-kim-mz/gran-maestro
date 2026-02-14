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
}

export const agents: Record<string, AgentDefinition> = {
  'pm-conductor': {
    name: 'pm-conductor',
    description:
      'PM Conductor — Phase 1 & 3 리더. 요구사항 분석, 스펙 작성, 리뷰 조율, 사용자 커뮤니케이션',
    model: 'opus',
    tools: ['Read', 'Glob', 'Grep', 'Write', 'Bash', 'Task', 'AskUserQuestion'],
    systemPromptFile: 'agents/pm-conductor.md',
  },

  'feedback-composer': {
    name: 'feedback-composer',
    description:
      'Feedback Composer — Phase 4 피드백 문서 작성. 리뷰 결과를 정밀한 수정 지침으로 변환',
    model: 'sonnet',
    tools: ['Read', 'Write', 'Grep'],
    systemPromptFile: 'agents/feedback-composer.md',
  },

  'architect': {
    name: 'architect',
    description:
      'Design Wing — 시스템 아키텍처, API 설계, 모듈 경계, 의존성 방향 설계',
    model: 'opus',
    tools: ['Read', 'Glob', 'Grep', 'Write'],
    systemPromptFile: 'agents/architect.md',
  },

  'schema-designer': {
    name: 'schema-designer',
    description:
      'Design Wing — DB 스키마, 데이터 모델, ERD, 마이그레이션 계획 설계',
    model: 'opus',
    tools: ['Read', 'Glob', 'Grep', 'Write'],
    systemPromptFile: 'agents/schema-designer.md',
  },

  'ui-designer': {
    name: 'ui-designer',
    description:
      'Design Wing — 화면 설계, 컴포넌트 구조, 인터랙션 흐름, 디자인 시스템',
    model: 'opus',
    tools: ['Read', 'Glob', 'Grep', 'Write'],
    systemPromptFile: 'agents/ui-designer.md',
  },
};

/**
 * 에이전트 호출 예시
 *
 * // PM Conductor (Phase 1 분석)
 * Task(
 *   subagent_type="gran-maestro:pm-conductor",
 *   model="opus",
 *   prompt="Analyze request: '사용자 인증 기능 추가'"
 * )
 *
 * // Feedback Composer (Phase 4)
 * Task(
 *   subagent_type="gran-maestro:feedback-composer",
 *   model="sonnet",
 *   prompt="Write feedback for REQ-001-01 based on review at ..."
 * )
 *
 * // Architect (Design Wing)
 * Task(
 *   subagent_type="gran-maestro:architect",
 *   model="opus",
 *   prompt="Design system architecture for REQ-001"
 * )
 *
 * // Schema Designer (Design Wing)
 * Task(
 *   subagent_type="gran-maestro:schema-designer",
 *   model="opus",
 *   prompt="Design data model for REQ-001"
 * )
 *
 * // UI Designer (Design Wing)
 * Task(
 *   subagent_type="gran-maestro:ui-designer",
 *   model="opus",
 *   prompt="Design UI specification for REQ-001"
 * )
 *
 * Note: outsource-brief.md는 에이전트가 아닌 템플릿으로,
 * PM Conductor가 변수를 치환하여 Codex/Gemini CLI에 전달합니다.
 */
