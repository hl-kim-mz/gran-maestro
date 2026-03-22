---
name: gemini
description: "Gemini CLI를 호출하여 대용량 컨텍스트 작업을 실행합니다. 사용자가 '제미니 실행', '제미니로', '대용량 분석'을 말하거나 /mst:gemini를 호출할 때 사용. Gran Maestro request 워크플로우(--trace 모드 포함)에서 단일 진입점 역할. discussion/ideation/debug/explore/plan-review의 병렬 dispatch에서는 Bash 직접 호출을 사용합니다."
user-invocable: true
argument-hint: "{프롬프트} [--prompt-file {경로}] [--dir {경로}] [--files {패턴}] [--trace {REQ/TASK/label}]"
---

# maestro:gemini

Gemini CLI 호출의 단일 진입점. request 워크플로우(--trace 모드 포함)에서 단일 진입점 역할. discussion/ideation/debug/explore/plan-review의 병렬 dispatch에서는 Bash 직접 호출을 사용합니다. 대용량 문서/프론트엔드/넓은 컨텍스트 작업에 적합. Maestro 모드 활성 여부 무관.

## 실행 프로토콜

1. 프롬프트/옵션 파싱
2. **프롬프트 소스**: `--prompt-file` 있으면 파일 우선 (미존재 시 에러 중단); 없으면 인라인 사용
3. `--dir` 지정 시 디렉토리 존재 확인 (없으면 에러 중단); 상대경로는 cwd 기준
4. `--files` 패턴으로 파일 목록 확인; 매칭 없으면 경고
5. `--trace` 모드 판별 (아래 섹션 참조)
6. **기본 모델**: `config.resolved.json`의 `models.providers.gemini[default_tier]`로 resolve; 없으면 `--model` 플래그 생략. tier resolve 순서: `providers.gemini[default_tier]`
7. Gemini CLI 실행:
   ```bash
   gemini -p "{prompt}" --model {model} --approval-mode yolo --sandbox=false                                  # 인라인
   gemini -p "$(cat {prompt_file})" --model {model} --approval-mode yolo --sandbox=false                      # --prompt-file
   set -o pipefail; gemini -p "$(cat {prompt_file})" --model {model} --approval-mode yolo --sandbox=false 2>&1 | tee {task_dir}/running.log  # trace
   set -o pipefail && cd {dir} && gemini -p "$(cat {prompt_file})" --model {model} --approval-mode yolo --sandbox=false 2>&1 | tee {task_dir}/running.log  # trace + --dir
   ```
8. **결과 처리**: `--trace` → Trace 문서 자동 생성 후 exit code만 반환; 없음 → 결과 표시

## Trace 모드 (워크플로우 내 자동 문서화)

워크플로우 내 결과를 파일로 저장해 히스토리 추적; 실행 본문은 `running.log`에 위임하고 trace .md는 메타데이터만 기록.

형식: `--trace {REQ-ID}/{TASK-NUM}/{label}`

실행 절차:
1. 출력 디렉토리: `requests/{REQ-ID}/tasks/{TASK-NUM}/traces/` (없으면 생성)
2. 파일명 패턴: `gemini-{label}-{YYYYMMDD-HHmmss}.md`
3. **단일 Bash 블록**에서 실행 + trace 자동 생성:

```bash
task_dir="{PROJECT_ROOT}/.gran-maestro/requests/{REQ-ID}/tasks/{TASK-NUM}"
trace_dir="$task_dir/traces"
mkdir -p "$trace_dir"
TS=$(date +"%Y%m%d-%H%M%S")
START=$(date +%s%3N)
set -o pipefail
cd {working_dir} && gemini -p "$(cat {prompt_file})" --model {model} --approval-mode yolo --sandbox=false 2>&1 | tee "$task_dir/running.log"
EXIT=$?
END=$(date +%s%3N)
DUR=$((END-START))
cat > "$trace_dir/gemini-{label}-${TS}.md" <<EOF
---
agent: gemini
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

4. **부모 컨텍스트에는 exit code만 반환**한다.
   반환 후 부모 스킬의 후속 단계를 계속 진행한다. 추가 설명, 요약 등 부가 텍스트 출력 절대 금지.

> **금지 마커 (MANDATORY)**: 이 스킬은 `NEXT_ACTION`, `step=returned`, `[MST skill=...]` 마커를 **절대 출력하지 않는다**.
> 이 마커들은 부모 스킬(approve 등)의 책임이며, 서브스킬이 출력하면 부모가 "이미 처리됨"으로 혼동한다.

> **Exit Code 캡처 (MANDATORY)**: Bash 도구의 exit code를 반드시 확인한다.
> 0이 아니어도 trace의 `exit_code` 필드에 해당 값을 반드시 기록한다.

## 옵션

- `--prompt-file {path}`: 파일에서 프롬프트 읽기 (셸 치환으로 Claude 컨텍스트 미경유, 토큰 절약)
- `--dir {path}`: 작업 디렉토리 지정 (기본: 현재 디렉토리)
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
