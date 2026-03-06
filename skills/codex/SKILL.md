---
name: codex
description: "Codex CLI를 호출하여 코드 작업을 실행합니다. 사용자가 '코덱스 실행', '코덱스로', '코드 작업'을 말하거나 /mst:codex를 호출할 때 사용. Gran Maestro request 워크플로우(--trace 모드 포함)에서 단일 진입점 역할. discussion/ideation/debug/explore/plan-review의 병렬 dispatch에서는 Bash 직접 호출을 사용합니다."
user-invocable: true
argument-hint: "{프롬프트} [--prompt-file {경로}] [--dir {경로}] [--json] [--trace {REQ/TASK/label}]"
---

# maestro:codex

Codex CLI 호출의 단일 진입점. request 워크플로우(--trace 모드 포함)에서 단일 진입점 역할. discussion/ideation/debug/explore/plan-review의 병렬 dispatch에서는 Bash 직접 호출을 사용합니다. Maestro 모드 활성 여부 무관.

## 실행 프로토콜

> **경로 규칙 (MANDATORY)**: 이 스킬의 모든 `.gran-maestro/` 경로는 **절대경로**로 사용합니다.
> 스킬 실행 시작 시 `PROJECT_ROOT`를 취득하고, 이후 모든 경로에 `{PROJECT_ROOT}/` 접두사를 붙입니다.
> ```bash
> PROJECT_ROOT=$(pwd)
> ```

1. 프롬프트/옵션 파싱
2. **프롬프트 소스**: `--prompt-file` 있으면 파일 우선 (미존재 시 에러 중단); 없으면 인라인 사용
3. `--dir` 지정 시 디렉토리 존재 확인 (없으면 에러 중단); 상대경로는 cwd 기준
4. `--trace` 모드 판별 (아래 섹션 참조)
5. **기본 모델**: `config.resolved.json`의 `models.codex.default` 사용; 없으면 `gpt-5.3-codex` 폴백
6. Codex CLI 실행:
   ```bash
   codex exec --full-auto -m {model} -C {working_dir} "{prompt}"                         # 인라인
   codex exec --full-auto -m {model} -C {working_dir} "$(cat {prompt_file})"             # --prompt-file
   set -o pipefail; codex exec --full-auto -m {model} -C {working_dir} "$(cat {prompt_file})" 2>&1 | tee {task_dir}/running.log  # trace
   ```
7. **결과 처리**: `--trace` → Trace 문서 작성 후 경로만 출력; `--output` → 파일 저장; 둘 다 없음 → 결과 표시

## Trace 모드 (워크플로우 내 자동 문서화)

워크플로우 내 결과를 파일로 저장해 히스토리 추적; 전체 stdout을 부모 컨텍스트로 반환하지 않아 토큰 절약.

형식: `--trace {REQ-ID}/{TASK-NUM}/{label}` (예: `REQ-001/01/phase2-impl`)

실행 절차:
1. 출력 디렉토리: `requests/{REQ-ID}/tasks/{TASK-NUM}/traces/` (없으면 생성)
2. 파일명: `codex-{label}-{YYYYMMDD-HHmmss}.md`
3. Codex CLI 실행
4. **Trace 문서 작성** (Write 도구로 직접 저장):

```markdown
---
agent: codex
request: {REQ-ID}
task: {TASK-NUM}
label: {label}
timestamp: {ISO-8601 timestamp}
prompt_file: "{경로 또는 null}"  # --prompt-file 사용 시 경로 기록
prompt_summary: "{프롬프트 첫 100자}..."
duration_ms: {실행 시간}
exit_code: {종료 코드}
working_dir: {작업 디렉토리}
---

# Codex Trace — {REQ-ID}/{TASK-NUM} [{label}]

## 프롬프트

> 출처: {prompt_file 경로 또는 "inline"}

{전체 프롬프트 텍스트 — prompt-file 사용 시 $(cat)으로 읽은 내용}

## 결과

{stdout 전체 내용}

## 오류 (있는 경우)

{stderr 내용, 없으면 이 섹션 생략}
```

5. **부모 컨텍스트에는 아래 형식으로만 반환** (전체 stdout 출력 안 함; 필요 시 Read 도구로 파일 접근).
   **이 텍스트를 출력한 후 부모 컨텍스트에 제어를 반환한다 — 부모 스킬이 있으면 부모의 후속 단계가 이어진다. 추가 설명, 요약 등 부가 텍스트 출력 절대 금지**:
   ```
   [TRACE_DONE] requests/{REQ-ID}/tasks/{TASK-NUM}/traces/codex-{label}-{timestamp}.md | exit={exit_code}
   ```

> **Exit Code 캡처 (MANDATORY)**: Bash 도구의 exit code를 반드시 확인한다.
> 0이 아니면 trace의 `exit_code` 필드에 해당 값을 기록하고, `## 오류` 섹션을 포함한다.

## 옵션

- `--prompt-file {path}`: 프롬프트를 파일에서 읽기 (인라인 프롬프트 대신). 셸 치환(`$(cat)`)으로 파일→CLI 직접 전달하여 Claude 컨텍스트를 경유하지 않으므로 토큰 절약
- `--dir {path}`: 작업 디렉토리 지정 (기본: 현재 디렉토리)
- `--json`: JSON 형태로 구조화된 출력
- `--ephemeral`: 상태를 보존하지 않는 일회성 실행
- `--output {file}`: 결과를 파일로 저장 (독립 호출용)
- `--trace {REQ/TASK/label}`: 워크플로우 trace 문서 자동 생성 (stdout 반환 안 함)

> `--trace`와 `--output`이 동시에 지정되면 `--trace`가 우선합니다.
> `--prompt-file`과 인라인 프롬프트가 동시에 지정되면 `--prompt-file`이 우선합니다.

## 예시

```
/mst:codex "이 프로젝트의 아키텍처를 분석해줘"
/mst:codex --prompt-file .gran-maestro/requests/REQ-001/tasks/01/prompts/phase2-impl.md --dir {worktree} --trace REQ-001/01/phase2-impl
```

## 주의사항 / 문제 해결

- Codex CLI 필수 (`codex --version`); 미설치 시 `npm install -g @openai/codex`
- `--full-auto` 모드는 파일 수정 권한 있으므로 주의
- `--trace` 모드에서는 전체 결과가 파일에만 저장되고 부모 컨텍스트에 반환 안 됨
- "타임아웃" → `/mst:settings timeouts.cli_large_task_ms` 확인
- "trace 디렉토리 생성 실패" → `requests/{REQ-ID}/tasks/{TASK-NUM}/` 경로 확인
