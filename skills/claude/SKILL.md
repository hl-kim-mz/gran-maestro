---
name: claude
description: "Claude 서브에이전트를 호출하여 코드 작업을 실행합니다. 사용자가 '클로드로 실행', '클로드 서브에이전트'를 말하거나 /mst:claude를 호출할 때 사용. Gran Maestro 워크플로우 내 claude-dev 태스크 디스패치는 이 스킬을 경유합니다."
user-invocable: true
argument-hint: "{프롬프트} [--prompt-file {경로}] [--dir {경로}] [--trace {REQ/TASK/label}]"
---

# maestro:claude

Claude `general-purpose` 서브에이전트에게 구현 작업을 위임합니다. PM Conductor가 직접 코드를 작성하는 대신, 별도 Claude 서브에이전트 프로세스를 스폰하여 구현을 분리합니다.

## 목적

PM Conductor의 "I conduct, I don't code" 원칙을 유지하면서 Codex/Gemini CLI가 설치되지 않은 환경이나 Claude의 파일 편집 도구(Read/Write/Edit/Bash/Glob/Grep)가 필요한 작업에 활용합니다.

## 실행 프로토콜

1. `$ARGUMENTS` 파싱:
   - `--prompt-file {경로}`: 프롬프트 파일 경로 (우선)
   - `--dir {경로}`: 작업 디렉토리 (worktree 경로)
   - `--trace {REQ-ID}/{TASK-NUM}/{label}`: trace 파일 저장 경로
   - 나머지: 인라인 프롬프트

2. 프롬프트 준비:
   - `--prompt-file`이 있으면: 파일 내용을 Read 도구로 읽음
   - 없으면: 인라인 텍스트 사용
   - `--dir`이 지정된 경우: 프롬프트에 `작업 디렉토리: {dir}` 컨텍스트 추가

3. 서브에이전트 스폰:
   ```
   Task(
     subagent_type: "general-purpose",
     prompt: {준비된 프롬프트},
     run_in_background: false
   )
   ```
   실행 전 `task_dir` 결정:
   - `--trace {REQ-ID}/{TASK-NUM}/{label}` 제공 시:
     `task_dir` = `.gran-maestro/requests/{REQ-ID}/tasks/{TASK-NUM}/`
   - `--trace` 없고 `--dir {worktree_path}` 제공 시:
     worktree 경로에서 REQ-ID와 TASK-NUM을 추론할 수 없으므로 running.log 기록 스킵
   - 둘 다 없는 경우: running.log 기록 스킵

   `task_dir`가 확정된 경우:
   - 시작 시 `Bash`로 append:
     `echo '[start] Claude subagent dispatched' >> {task_dir}/running.log`
   - Task 완료 후 `Bash`로 append:
     `echo '[done] Claude subagent finished' >> {task_dir}/running.log`
   병렬 실행이 필요한 경우: `run_in_background: true` + `TaskOutput` 폴링

4. `--trace`가 있으면 trace 파일 저장:
   - 경로: `.gran-maestro/requests/{REQ-ID}/tasks/{TASK-NUM}/traces/claude-{label}-{timestamp}.md`
   - 내용: 프롬프트 요약 + 서브에이전트 결과

5. 결과 반환

## Codex/Gemini와의 차이점

| 항목 | Codex/Gemini | Claude (`/mst:claude`) |
|------|-------------|----------------------|
| 실행 방식 | `Bash(command: "codex exec ...")` | `Task(subagent_type: "general-purpose", ...)` |
| 병렬 실행 | `run_in_background: true` + TaskOutput 폴링 | `Task`에 `run_in_background: true` |
| CLI 의존성 | Codex/Gemini CLI 설치 필요 | 불필요 (Claude 자체 기능) |
| 파일 접근 | CLI 도구 권한 | 모든 Claude 도구 (Read/Write/Edit/Bash/Glob/Grep) |
| 적합한 작업 | 대규모 코드 구현, 복잡한 리팩토링 | 문서/설정 파일, 소규모 코드, 스킬 파일 수정 |

## Trace 파일 형식

```markdown
# Claude Execution Trace — {label}

- Request: {REQ-ID} / Task: {TASK-NUM}
- Timestamp: {ISO timestamp}
- Prompt file: {path or "inline"}
- Working dir: {dir or "N/A"}

## 실행 결과

{서브에이전트 출력 요약}
```

## 예시

```
# 인라인 프롬프트
/mst:claude "README의 설치 섹션을 업데이트해줘"

# prompt-file 방식 (워크플로우 내 표준)
/mst:claude --prompt-file .gran-maestro/requests/REQ-001/tasks/01/prompts/phase2-impl.md --dir .gran-maestro/worktrees/REQ-001-01 --trace REQ-001/01/phase2-impl

# trace 없이
/mst:claude --prompt-file prompts/fix.md --dir worktrees/REQ-002-01
```
