---
name: codex
description: "Codex CLI를 호출하여 코드 작업을 실행합니다. 사용자가 '코덱스 실행', '코덱스로', '코드 작업'을 말하거나 /mst:codex를 호출할 때 사용. Gran Maestro 워크플로우 내 모든 Codex 호출은 이 스킬을 경유합니다."
user-invocable: true
argument-hint: "{프롬프트} [--prompt-file {경로}] [--dir {경로}] [--json] [--trace {REQ/TASK/label}]"
---

# maestro:codex

Codex CLI 호출의 단일 진입점입니다. Gran Maestro 워크플로우 내·외부 모든 Codex 호출이 이 스킬을 경유합니다.
이 스킬은 모드에 관계없이 사용 가능합니다 (OMC 모드, Maestro 모드 모두).

## 실행 프로토콜

1. `$ARGUMENTS`에서 프롬프트와 옵션 파싱
2. **프롬프트 소스 결정**:
   - `--prompt-file` 있음 → 파일 존재 여부 확인, 없으면 에러 메시지 출력 후 중단 → 프롬프트 소스를 파일로 설정
   - `--prompt-file` 없음 → 인라인 프롬프트를 소스로 사용 (기존 동작)
   - `--prompt-file`과 인라인 프롬프트가 동시에 있으면 `--prompt-file` 우선
3. `--dir` 지정 시 해당 디렉토리 존재 여부 확인. 없으면 에러 메시지 출력 후 중단
4. 작업 디렉토리 결정 (--dir 또는 현재 디렉토리). 경로가 상대경로이면 현재 작업 디렉토리(cwd) 기준으로 해석
5. **`--trace` 모드 판별** (아래 "Trace 모드" 섹션 참조)
6. Codex CLI 실행:
   ```bash
   # 인라인 프롬프트 (기존)
   codex exec --full-auto -C {working_dir} "{prompt}"

   # 프롬프트 파일 (--prompt-file 지정 시) — 셸 치환으로 Claude 컨텍스트 미경유
   codex exec --full-auto -C {working_dir} "$(cat {prompt_file})"
   ```
7. **결과 처리 분기**:
   - `--trace` 있음 → Trace 문서 작성 후 경로만 출력 (전체 stdout 반환 금지)
   - `--output` 있음 → 해당 파일에 stdout 저장 + 결과 표시
   - 둘 다 없음 → 실행 결과를 사용자에게 표시

## Trace 모드 (워크플로우 내 자동 문서화)

> **목적**: MST 워크플로우 내에서 호출 시 결과를 자동으로 문서 파일로 저장하여 히스토리를 추적합니다.
> 전체 stdout을 부모 컨텍스트로 반환하지 않으므로 토큰이 절약됩니다.

### 옵션 형식

```
--trace {REQ-ID}/{TASK-NUM}/{label}
```

- `{REQ-ID}`: 요청 ID (예: `REQ-001`)
- `{TASK-NUM}`: 태스크 번호 (예: `01`)
- `{label}`: 용도 레이블 (예: `phase1-analysis`, `phase2-impl`, `phase3-review`)

### 실행 절차

1. Trace 경로 파싱: `--trace REQ-001/01/phase1-analysis`
2. 출력 디렉토리 결정: `.gran-maestro/requests/{REQ-ID}/tasks/{TASK-NUM}/traces/`
3. 디렉토리 없으면 생성
4. 파일명 생성: `codex-{label}-{YYYYMMDD-HHmmss}.md`
   - 예: `codex-phase1-analysis-20260215-103000.md`
5. Codex CLI 실행
6. **Trace 문서 작성** (Write 도구로 직접 저장):

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

7. **부모 컨텍스트에는 경로만 반환**:
   ```
   Trace 저장 완료: .gran-maestro/requests/{REQ-ID}/tasks/{TASK-NUM}/traces/codex-{label}-{timestamp}.md
   ```
   - 전체 stdout을 출력하지 않음 (토큰 절약)
   - 호출자가 내용이 필요하면 Read 도구로 해당 파일을 읽음

### Trace 호출 예시 (PM Conductor에서)

```
# Phase 1: 코드 구조 분석 (prompt-file 패턴)
Write → .gran-maestro/requests/REQ-001/tasks/01/prompts/phase1-analysis.md
Skill(skill: "mst:codex", args: "--prompt-file .gran-maestro/requests/REQ-001/tasks/01/prompts/phase1-analysis.md --dir {path} --trace REQ-001/01/phase1-analysis")

# Phase 2: 코드 구현 (prompt-file 패턴)
Write → .gran-maestro/requests/REQ-001/tasks/01/prompts/phase2-impl.md
Skill(skill: "mst:codex", args: "--prompt-file .gran-maestro/requests/REQ-001/tasks/01/prompts/phase2-impl.md --dir {worktree} --trace REQ-001/01/phase2-impl")

# Phase 3: 코드 검증 (prompt-file 패턴)
Write → .gran-maestro/requests/REQ-001/tasks/01/prompts/phase3-review.md
Skill(skill: "mst:codex", args: "--prompt-file .gran-maestro/requests/REQ-001/tasks/01/prompts/phase3-review.md --dir {path} --trace REQ-001/01/phase3-review")

# 독립 호출 (인라인 — 기존 호환성 유지)
Skill(skill: "mst:codex", args: "{프롬프트} --dir {path} --trace REQ-001/01/phase1-analysis")
```

## 옵션

- `--prompt-file {path}`: 프롬프트를 파일에서 읽기 (인라인 프롬프트 대신). 셸 치환(`$(cat)`)으로 파일→CLI 직접 전달하여 Claude 컨텍스트를 경유하지 않으므로 토큰 절약
- `--dir {path}`: 작업 디렉토리 지정 (기본: 현재 디렉토리)
- `--json`: JSON 형태로 구조화된 출력
- `--ephemeral`: 상태를 보존하지 않는 일회성 실행
- `--output {file}`: 결과를 파일로 저장 (독립 호출용)
- `--trace {REQ/TASK/label}`: 워크플로우 trace 문서 자동 생성 (stdout 반환 안 함)

> `--trace`와 `--output`이 동시에 지정되면 `--trace`가 우선합니다.
> `--prompt-file`과 인라인 프롬프트가 동시에 지정되면 `--prompt-file`이 우선합니다.

## CLI 커맨드

```bash
# 기본 실행 (인라인 프롬프트)
codex exec --full-auto -C {working_dir} "{prompt}"

# 프롬프트 파일 — 셸 치환으로 Claude 컨텍스트 미경유
codex exec --full-auto -C {working_dir} "$(cat {prompt_file})"

# JSON 출력
codex exec --full-auto --json -C {working_dir} "{prompt}"

# 파일 출력
codex exec --full-auto -C {working_dir} -o {output_file} "{prompt}"
```

## 예시

```
# 독립 호출 (인라인 프롬프트 — 기존 동작 유지)
/mst:codex "이 프로젝트의 아키텍처를 분석해줘"
/mst:codex --dir ./src "이 모듈의 의존성을 리팩토링해줘"
/mst:codex --json "package.json 의존성 분석"

# 프롬프트 파일 호출 (토큰 절약, 감사 추적)
/mst:codex --prompt-file .gran-maestro/requests/REQ-001/tasks/01/prompts/phase2-impl.md --dir {worktree}
/mst:codex --prompt-file ./my-prompt.md --trace REQ-001/01/phase1-analysis

# 워크플로우 내 호출 (prompt-file + trace)
/mst:codex --prompt-file {prompt_path} --dir {worktree} --trace REQ-001/01/phase2-impl
/mst:codex --prompt-file {prompt_path} --trace REQ-001/01/phase3-review
```

## 주의사항

- Codex CLI가 설치되어 있어야 합니다 (`codex --version`으로 확인)
- `--full-auto` 모드는 파일 수정 권한이 있으므로 주의하여 사용
- 워크플로우 외부에서 독립 호출 시 요청 상태에 영향을 주지 않음. 워크플로우 내에서는 PM Conductor가 컨텍스트를 전달
- `--trace` 모드에서는 전체 결과가 파일에만 저장되고 부모 컨텍스트에 반환되지 않음

## 문제 해결

- "codex: command not found" → Codex CLI가 설치되지 않았습니다. `npm install -g @openai/codex`로 설치
- "작업 디렉토리를 찾을 수 없음" → `--dir` 경로가 존재하는지 확인. 상대경로는 현재 디렉토리 기준으로 해석됨
- "타임아웃" → 대규모 작업 시 `/mst:settings timeouts.cli_large_task_ms`로 타임아웃 값 확인. 필요 시 증가
- "실행 결과 없음" → Codex CLI의 `--json` 출력을 확인. 프롬프트가 명확한지 검토
- "trace 디렉토리 생성 실패" → `.gran-maestro/requests/{REQ-ID}/tasks/{TASK-NUM}/` 경로가 존재하는지 확인
