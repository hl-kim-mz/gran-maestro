---
name: claude
description: "Claude 서브에이전트를 호출하여 코드 작업을 실행합니다. 사용자가 '클로드로 실행', '클로드 서브에이전트'를 말하거나 /mst:claude를 호출할 때 사용. Gran Maestro 워크플로우 내 claude-dev 태스크 디스패치는 이 스킬을 경유합니다."
user-invocable: true
argument-hint: "{프롬프트} [--prompt-file {경로}] [--dir {경로}] [--trace {REQ/TASK/label}]"
---

# maestro:claude

PM Conductor 원칙 유지 목적으로 general-purpose 서브에이전트에 구현을 위임합니다. Codex/Gemini CLI 미설치 환경이나 Claude 파일 편집 도구(Read/Write/Edit/Bash/Glob/Grep)가 필요한 작업에 사용합니다.

## 실행 프로토콜

> **경로 규칙 (MANDATORY)**: 이 스킬의 모든 `.gran-maestro/` 경로는 **절대경로**로 사용합니다.
> 스킬 실행 시작 시 `PROJECT_ROOT`를 취득하고, 이후 모든 경로에 `{PROJECT_ROOT}/` 접두사를 붙입니다.
> ```bash
> PROJECT_ROOT=$(pwd)
> ```

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
     `task_dir` = `{PROJECT_ROOT}/.gran-maestro/requests/{REQ-ID}/tasks/{TASK-NUM}/`
   - `--trace` 없고 `--dir {worktree_path}` 제공 시:
     worktree 경로가 `{PROJECT_ROOT}/.gran-maestro/worktrees/REQ-NNN-NN` 형태이면:
     - 정규식 `worktrees/(REQ-\w+)-(\d+)$`로 REQ-ID와 TASK-NUM 추출
     - `task_dir` = `{PROJECT_ROOT}/.gran-maestro/requests/{REQ-ID}/tasks/{TASK-NUM}/`
     - 추론 실패 시: running.log 기록 스킵
   - 둘 다 없는 경우: running.log 기록 스킵

   `task_dir`가 확정된 경우 (running.log 생성 필수):
   - 시작 전 `Bash`로 파일 생성 (없으면 생성, 있으면 유지):
     `Bash("touch {task_dir}/running.log")`
   - 시작 시 `Bash`로 append:
     `echo '[start] Claude subagent dispatched' >> {task_dir}/running.log`
   - Task 완료 후 `Bash`로 append:
     `echo '[done] Claude subagent finished' >> {task_dir}/running.log`
   병렬 실행이 필요한 경우: `run_in_background: true` + `TaskOutput` 폴링

4. `--trace`가 있으면 trace 파일 저장:
   - 경로: `{PROJECT_ROOT}/.gran-maestro/requests/{REQ-ID}/tasks/{TASK-NUM}/traces/claude-{label}-{timestamp}.md`
   - 내용: 프롬프트 요약 + 서브에이전트 결과

5. **결과 반환**

   **`--trace` 모드**: Trace 문서 작성 후 부모 컨텍스트에는 아래 형식으로만 반환한다 (전체 결과 출력 안 함; 필요 시 Read 도구로 파일 접근).
   **이 텍스트를 출력한 후 부모 컨텍스트에 제어를 반환한다 — 부모 스킬이 있으면 부모의 후속 단계가 이어진다. 추가 설명, 요약 등 부가 텍스트 출력 절대 금지**:
   ```
   [TRACE_SAVED] requests/{REQ-ID}/tasks/{TASK-NUM}/traces/claude-{label}-{timestamp}.md | exit={exit_code} — 부모 스킬의 다음 단계를 계속 진행하세요.
   ```

   **`--trace` 미제공 시**: 서브에이전트 결과만 간결하게 반환한다. 추가 설명, 요약 등 부가 텍스트 출력 절대 금지.

   > **금지 마커 (MANDATORY)**: 이 스킬은 `NEXT_ACTION`, `step=returned`, `[MST skill=...]` 마커를 **절대 출력하지 않는다**.
   > 이 마커들은 부모 스킬(approve 등)의 책임이며, 서브스킬이 출력하면 부모가 "이미 처리됨"으로 혼동한다.

## Codex/Gemini와의 차이점

- Codex/Gemini: `Bash("codex exec ...")`, CLI 설치 필요, 대규모 코드 구현에 적합
- Claude: `Task(subagent_type:"general-purpose")`, CLI 불필요, 모든 Claude 도구(Read/Write/Edit/Bash) 사용 가능, 문서/설정/소규모 코드에 적합
- 병렬 실행: 양쪽 모두 `run_in_background: true` 지원

## Trace 파일 형식

저장 경로: `{PROJECT_ROOT}/.gran-maestro/requests/{REQ-ID}/tasks/{TASK-NUM}/traces/claude-{label}-{timestamp}.md`
내용: `# Claude Execution Trace — {label}` + Request/Task/Timestamp/Prompt file/Working dir 헤더 + 실행 결과 요약

## 예시

```
/mst:claude "README의 설치 섹션을 업데이트해줘"
/mst:claude --prompt-file .gran-maestro/requests/REQ-001/tasks/01/prompts/phase2-impl.md --dir .gran-maestro/worktrees/REQ-001-01 --trace REQ-001/01/phase2-impl
```
