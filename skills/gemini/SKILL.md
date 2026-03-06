---
name: gemini
description: "Gemini CLI를 호출하여 대용량 컨텍스트 작업을 실행합니다. 사용자가 '제미니 실행', '제미니로', '대용량 분석'을 말하거나 /mst:gemini를 호출할 때 사용. Gran Maestro request 워크플로우(--trace 모드 포함)에서 단일 진입점 역할. discussion/ideation/debug/explore/plan-review의 병렬 dispatch에서는 Bash 직접 호출을 사용합니다."
user-invocable: true
argument-hint: "{프롬프트} [--prompt-file {경로}] [--files {패턴}] [--trace {REQ/TASK/label}]"
---

# maestro:gemini

Gemini CLI 호출의 단일 진입점. request 워크플로우(--trace 모드 포함)에서 단일 진입점 역할. discussion/ideation/debug/explore/plan-review의 병렬 dispatch에서는 Bash 직접 호출을 사용합니다. 대용량 문서/프론트엔드/넓은 컨텍스트 작업에 적합. Maestro 모드 활성 여부 무관.

## 실행 프로토콜

1. 프롬프트/옵션 파싱
2. **프롬프트 소스**: `--prompt-file` 있으면 파일 우선 (미존재 시 에러 중단); 없으면 인라인 사용
3. `--files` 패턴으로 파일 목록 확인; 매칭 없으면 경고
4. `--trace` 모드 판별 (아래 섹션 참조)
5. **기본 모델**: `config.resolved.json`의 `models.providers.gemini[default_tier]`로 resolve; 없으면 `--model` 플래그 생략. tier resolve 순서: `providers.gemini[default_tier]`
6. Gemini CLI 실행:
   ```bash
   gemini -p "{prompt}" --model {model} --approval-mode yolo
   gemini -p "$(cat {prompt_file})" --model {model} --approval-mode yolo
   set -o pipefail; gemini -p "$(cat {prompt_file})" --model {model} --approval-mode yolo 2>&1 | tee {task_dir}/running.log
   ```
7. **결과 처리**: `--trace` → Trace 문서 작성 후 경로만 출력; 없음 → 결과 표시

## Trace 모드 (워크플로우 내 자동 문서화)

워크플로우 내 결과를 파일로 저장해 히스토리 추적; 전체 stdout 부모 컨텍스트 반환 안 함 (토큰 절약).

형식: `--trace {REQ-ID}/{TASK-NUM}/{label}`

실행 절차:
1. 출력 디렉토리: `requests/{REQ-ID}/tasks/{TASK-NUM}/traces/` (없으면 생성)
2. 파일명: `gemini-{label}-{YYYYMMDD-HHmmss}.md`
3. Gemini CLI 실행
4. **Trace 문서 작성** (Write 도구로 직접 저장):

```markdown
---
agent: gemini
request: {REQ-ID}
task: {TASK-NUM}
label: {label}
timestamp: {ISO-8601 timestamp}
prompt_file: "{경로 또는 null}"  # --prompt-file 사용 시 경로 기록
prompt_summary: "{프롬프트 첫 100자}..."
duration_ms: {실행 시간}
exit_code: {종료 코드}
files_pattern: {--files 패턴, 없으면 생략}
---

# Gemini Trace — {REQ-ID}/{TASK-NUM} [{label}]

## 프롬프트

> 출처: {prompt_file 경로 또는 "inline"}

{전체 프롬프트 텍스트 — prompt-file 사용 시 $(cat)으로 읽은 내용}

## 결과

{stdout 전체 내용}

## 오류 (있는 경우)

{stderr 내용, 없으면 이 섹션 생략}
```

5. **부모 컨텍스트에는 아래 형식으로만 반환** (필요 시 Read 도구로 접근).
   **이 텍스트를 출력한 후 부모 컨텍스트에 제어를 반환한다 — 부모 스킬이 있으면 부모의 후속 단계가 이어진다. 추가 설명, 요약 등 부가 텍스트 출력 절대 금지**:
   ```
   [TRACE_DONE] requests/{REQ-ID}/tasks/{TASK-NUM}/traces/gemini-{label}-{timestamp}.md | exit={exit_code}
   ```

> **Exit Code 캡처 (MANDATORY)**: Bash 도구의 exit code를 반드시 확인한다.
> 0이 아니면 trace의 `exit_code` 필드에 해당 값을 기록하고, `## 오류` 섹션을 포함한다.

## 옵션

- `--prompt-file {path}`: 파일에서 프롬프트 읽기 (셸 치환으로 Claude 컨텍스트 미경유, 토큰 절약)
- `--files {pattern}`: 컨텍스트에 포함할 파일 패턴 (예: `src/**/*.ts`)
- `-y`: 자동 승인 모드
- `--trace {REQ/TASK/label}`: Trace 문서 자동 생성 (stdout 반환 안 함)

## 예시

```
/mst:gemini "전체 코드베이스 문서 생성해줘"
/mst:gemini --prompt-file {prompt_path} --files src/**/*.ts --trace REQ-001/01/phase1-analysis
```

## 주의사항 / 문제 해결

- Gemini CLI 필수 (`gemini --version`); 미설치 시 `npm install -g @google/gemini-cli`
- 컨텍스트 윈도우 최대 1M 토큰; 대용량 파일은 `--files` 패턴을 구체적으로 지정
- `--trace` 모드에서 전체 결과는 파일에만 저장, 부모 컨텍스트 반환 안 됨
- "trace 디렉토리 생성 실패" → `requests/{REQ-ID}/tasks/{TASK-NUM}/` 경로 확인
