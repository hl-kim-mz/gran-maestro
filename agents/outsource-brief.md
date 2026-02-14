# Outsource Brief Template

Phase 2에서 Codex CLI / Gemini CLI에 전달하는 프롬프트 템플릿입니다.
이 파일은 에이전트가 아닌 **템플릿**으로, PM Conductor가 변수를 치환하여 사용합니다.

<outsource_brief>
<context>
You are working on task {TASK_ID} in a git worktree at {WORKTREE_PATH}.
This is an outsourced task from Gran Maestro. You must implement exactly
what the spec describes — no more, no less.
</context>

<spec>
{SPEC_CONTENT — spec.md의 전체 내용이 여기에 삽입됨}
</spec>

<rules>
- Implement ONLY what the acceptance criteria specify
- Do NOT modify files outside the specified scope
- Do NOT add features, refactoring, or "improvements" beyond the spec
- Write tests as specified in the test plan
- Commit your changes with a descriptive message: "[{TASK_ID}] {summary}"
- If you encounter a blocker, document it in exec-log.md and stop
</rules>

<verification_before_completion>
Before declaring completion, verify:
- [ ] All acceptance criteria addressed
- [ ] Type check passes (if applicable)
- [ ] Tests pass (if applicable)
- [ ] Changes are within specified scope
- [ ] Commit message follows convention
</verification_before_completion>

<previous_feedback>
{피드백 라운드 시: feedback-RN.md 내용이 여기에 삽입됨}
{첫 실행 시: "No previous feedback. This is the initial implementation."}
</previous_feedback>
</outsource_brief>

## 변수 목록

| 변수 | 설명 | 예시 |
|------|------|------|
| `{TASK_ID}` | 태스크 ID | `REQ-001-01` |
| `{WORKTREE_PATH}` | Git worktree 경로 | `.gran-maestro/worktrees/REQ-001-01` |
| `{SPEC_CONTENT}` | spec.md 전체 내용 | (Implementation Spec 문서) |
| `{summary}` | 커밋 메시지용 요약 | `Add JWT auth middleware` |

## CLI 호출 방식

> **주의**: 아래 CLI 명령어는 검증 전 초안입니다. 실제 사용 시 `--help`로 확인 후 조정하세요.
> CLIAdapter 추상화 레이어(`src/core/cli-adapter.ts`)를 통해 호출됩니다.

### Codex CLI
```bash
# 검증 필요: exec 서브커맨드, -C 플래그 실존 확인
codex exec --full-auto -C {WORKTREE_PATH} "{brief}"
# 대안: codex --full-auto "{brief}" (cwd 옵션으로 디렉토리 지정)
```

### Gemini CLI
```bash
# 검증 필요: -p 플래그, --approval-mode 옵션 확인
gemini -p "{brief}" --approval-mode yolo
# 대안: gemini -y -p "{brief}" (자동 승인)
```

### CLIAdapter 경유 호출 (권장)
```typescript
const adapter = createAdapter(agent.provider); // 'codex' | 'gemini'
const result = await adapter.execute(brief, {
  workingDir: worktreePath,
  timeout_ms: config.timeouts.cli_default_ms,
  outputFormat: 'text'
});
```

## 피드백 라운드 시 추가 삽입

피드백 라운드(Phase 4 → Phase 2 재실행)에서는 `{previous_feedback}` 섹션에
해당 라운드의 feedback 파일 내용이 삽입됩니다.
