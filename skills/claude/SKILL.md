---
name: claude
description: "Claude CLI를 호출하여 코드 작업을 실행합니다. 사용자가 '클로드로 실행', '클로드 서브에이전트'를 말하거나 /mst:claude를 호출할 때 사용. Gran Maestro 워크플로우 내 claude-dev 태스크 디스패치는 이 스킬을 경유합니다."
user-invocable: true
argument-hint: "{프롬프트} [--prompt-file {경로}] [--dir {경로}] [--trace {REQ/TASK/label}]"
---

# maestro:claude

PM Conductor 원칙 유지 목적으로 Claude CLI를 Bash로 호출해 구현을 위임합니다. Codex/Gemini와 동일한 CLI 기반 디스패치 패턴을 사용합니다.

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
   - `--prompt-file`이 있으면: 실행 시 `$(cat {prompt_file})`로 파일 내용을 CLI에 직접 전달
   - 없으면: 인라인 텍스트 사용

3. Claude CLI 실행 (Bash):
   - 기본 모델 resolve (MANDATORY):
     ```bash
     MODEL=$(python3 {PLUGIN_ROOT}/scripts/mst.py resolve-model claude default 2>/dev/null || echo "sonnet")
     ```
   - 실행 명령 패턴:
     ```bash
     MODEL=$(python3 {PLUGIN_ROOT}/scripts/mst.py resolve-model claude default 2>/dev/null || echo "sonnet"); claude -p "{prompt}" --model "$MODEL" --permission-mode bypassPermissions
     MODEL=$(python3 {PLUGIN_ROOT}/scripts/mst.py resolve-model claude default 2>/dev/null || echo "sonnet"); claude -p "$(cat {prompt_file})" --model "$MODEL" --permission-mode bypassPermissions
     MODEL=$(python3 {PLUGIN_ROOT}/scripts/mst.py resolve-model claude default 2>/dev/null || echo "sonnet"); cd {worktree_path} && claude -p "$(cat {prompt_file})" --model "$MODEL" --permission-mode bypassPermissions
     ```
   - 실행 전 `task_dir` 결정:
   - `--trace {REQ-ID}/{TASK-NUM}/{label}` 제공 시:
     `task_dir` = `{PROJECT_ROOT}/.gran-maestro/requests/{REQ-ID}/tasks/{TASK-NUM}/`
   - `--trace` 없고 `--dir {worktree_path}` 제공 시:
     worktree 경로가 `{PROJECT_ROOT}/.gran-maestro/worktrees/REQ-NNN-NN` 형태이면:
     - 정규식 `worktrees/(REQ-\w+)-(\d+)$`로 REQ-ID와 TASK-NUM 추출
     - `task_dir` = `{PROJECT_ROOT}/.gran-maestro/requests/{REQ-ID}/tasks/{TASK-NUM}/`
     - 추론 실패 시: running.log 기록 스킵
   - 둘 다 없는 경우: running.log 기록 스킵

   `task_dir`가 확정된 경우:
   - 로그 저장 실행 패턴:
     `set -o pipefail; claude -p "$(cat {prompt_file})" --model "$MODEL" --permission-mode bypassPermissions 2>&1 | tee "$task_dir/running.log"`
   - `--dir` 지정 시:
     `set -o pipefail; cd {worktree_path} && claude -p "$(cat {prompt_file})" --model "$MODEL" --permission-mode bypassPermissions 2>&1 | tee "$task_dir/running.log"`
   병렬 실행이 필요한 경우: Bash 백그라운드 실행(`... &`) + `wait`/PID 폴링으로 상태 확인
   - 실행 시간/종료 코드 캡처:
     - CLI 시작 직전: `START=$(date +%s%3N)`
     - CLI 완료 직후: `END=$(date +%s%3N)`, `DUR=$((END-START))`
     - Bash 종료 코드: `EXIT=$?`

4. `--trace`가 있으면 trace 파일 저장:
   - 파일명 패턴: `claude-{label}-{YYYYMMDD-HHmmss}.md`
   - 단일 Bash 블록에서 실행 + trace 자동 생성:
     ```bash
     task_dir="{PROJECT_ROOT}/.gran-maestro/requests/{REQ-ID}/tasks/{TASK-NUM}"
     trace_dir="$task_dir/traces"
     mkdir -p "$trace_dir"
     TS=$(date +"%Y%m%d-%H%M%S")
     START=$(date +%s%3N)
     MODEL=$(python3 {PLUGIN_ROOT}/scripts/mst.py resolve-model claude default 2>/dev/null || echo "sonnet")
     set -o pipefail
     cd_prefix=""
     if [ -n "{worktree_path}" ]; then
       cd_prefix="cd {worktree_path} && "
     fi
     eval "${cd_prefix}claude -p \"$(cat {prompt_file})\" --model \"$MODEL\" --permission-mode bypassPermissions 2>&1 | tee \"$task_dir/running.log\""
     EXIT=$?
     END=$(date +%s%3N)
     DUR=$((END-START))
     cat > "$trace_dir/claude-{label}-${TS}.md" <<EOF
     ---
     agent: claude
     request: {REQ-ID}
     task: {TASK-NUM}
     label: {label}
     timestamp: ${TS}
     duration_ms: ${DUR}
     exit_code: ${EXIT}
     log: requests/{REQ-ID}/tasks/{TASK-NUM}/running.log
     ---
     EOF
     exit $EXIT
     ```

5. **결과 반환**

   **`--trace` 모드**: Trace 문서 작성 후 부모 컨텍스트에는 exit code만 반환한다 (전체 결과 출력 안 함; 필요 시 Read 도구로 파일 접근).
   반환 후 부모 스킬의 후속 단계를 계속 진행한다. 추가 설명, 요약 등 부가 텍스트 출력 절대 금지.

   **`--trace` 미제공 시**: 서브에이전트 결과만 간결하게 반환한다. 추가 설명, 요약 등 부가 텍스트 출력 절대 금지.

   > **금지 마커 (MANDATORY)**: 이 스킬은 `NEXT_ACTION`, `step=returned`, `[MST skill=...]` 마커를 **절대 출력하지 않는다**.
   > 이 마커들은 부모 스킬(approve 등)의 책임이며, 서브스킬이 출력하면 부모가 "이미 처리됨"으로 혼동한다.

   > **Exit Code 캡처 (MANDATORY)**: Bash 실행의 종료 코드를 반드시 확인한다.
   > 0이 아니어도 trace의 `exit_code` 필드에 해당 값을 반드시 기록한다.

## Codex/Gemini와의 차이점

- Codex: `Bash("codex exec ...")`, CLI 설치 필요, 대규모 코드 구현에 적합
- Gemini: `Bash("gemini ...")`, CLI 설치 필요
- Claude: `Bash("claude -p ...")`, CLI 설치 필요, `--model` + `--permission-mode bypassPermissions` 필수
- 병렬 실행: 모두 Bash 백그라운드 실행(`... &`) + `wait`/PID 폴링 패턴 사용

## Trace 파일 형식

저장 경로: `{PROJECT_ROOT}/.gran-maestro/requests/{REQ-ID}/tasks/{TASK-NUM}/traces/claude-{label}-{YYYYMMDD-HHmmss}.md`
내용: YAML frontmatter 메타데이터만 포함

```yaml
---
agent: claude
request: {REQ-ID}
task: {TASK-NUM}
label: {label}
timestamp: {YYYYMMDD-HHmmss}
duration_ms: {실행 시간}
exit_code: {종료 코드}
log: requests/{REQ-ID}/tasks/{TASK-NUM}/running.log
---
```

## 예시

```
/mst:claude "README의 설치 섹션을 업데이트해줘"
/mst:claude --prompt-file .gran-maestro/requests/REQ-001/tasks/01/prompts/phase2-impl.md --dir .gran-maestro/worktrees/REQ-001-01 --trace REQ-001/01/phase2-impl
```
