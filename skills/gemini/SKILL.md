---
name: gemini
description: "Gemini CLI를 호출하여 대용량 컨텍스트 작업을 실행합니다. 사용자가 '제미니 실행', '제미니로', '대용량 분석'을 말하거나 /mst:gemini를 호출할 때 사용. Gran Maestro 워크플로우 내 모든 Gemini 호출은 이 스킬을 경유합니다."
user-invocable: true
argument-hint: "{프롬프트} [--files {패턴}] [--sandbox] [--trace {REQ/TASK/label}]"
---

# maestro:gemini

Gemini CLI 호출의 단일 진입점입니다. Gran Maestro 워크플로우 내·외부 모든 Gemini 호출이 이 스킬을 경유합니다.
대용량 문서, 프론트엔드, 넓은 컨텍스트가 필요한 작업에 적합합니다.
이 스킬은 모드에 관계없이 사용 가능합니다 (OMC 모드, Maestro 모드 모두).

## 실행 프로토콜

1. `$ARGUMENTS`에서 프롬프트와 옵션 파싱
2. 파일 패턴 지정 시 해당 파일들을 컨텍스트로 포함
3. `--files` 옵션의 패턴으로 파일 목록 확인. 매칭 파일이 없으면 경고 출력
4. **`--trace` 모드 판별** (아래 "Trace 모드" 섹션 참조)
5. Gemini CLI 실행:
   ```bash
   gemini -p "{prompt}" --approval-mode yolo
   ```
6. **결과 처리 분기**:
   - `--trace` 있음 → Trace 문서 작성 후 경로만 출력 (전체 stdout 반환 금지)
   - 없음 → 실행 결과를 사용자에게 표시

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
4. 파일명 생성: `gemini-{label}-{YYYYMMDD-HHmmss}.md`
   - 예: `gemini-phase1-analysis-20260215-103000.md`
5. Gemini CLI 실행
6. **Trace 문서 작성** (Write 도구로 직접 저장):

```markdown
---
agent: gemini
request: {REQ-ID}
task: {TASK-NUM}
label: {label}
timestamp: {ISO-8601 timestamp}
prompt_summary: "{프롬프트 첫 100자}..."
duration_ms: {실행 시간}
exit_code: {종료 코드}
files_pattern: {--files 패턴, 없으면 생략}
---

# Gemini Trace — {REQ-ID}/{TASK-NUM} [{label}]

## 프롬프트

{전체 프롬프트 텍스트}

## 결과

{stdout 전체 내용}

## 오류 (있는 경우)

{stderr 내용, 없으면 이 섹션 생략}
```

7. **부모 컨텍스트에는 경로만 반환**:
   ```
   Trace 저장 완료: .gran-maestro/requests/{REQ-ID}/tasks/{TASK-NUM}/traces/gemini-{label}-{timestamp}.md
   ```
   - 전체 stdout을 출력하지 않음 (토큰 절약)
   - 호출자가 내용이 필요하면 Read 도구로 해당 파일을 읽음

### Trace 호출 예시 (PM Conductor에서)

```
# Phase 1: 대규모 컨텍스트 분석
Skill(skill: "mst:gemini", args: "{분석 프롬프트} --files src/**/*.ts --trace REQ-001/01/phase1-analysis")

# Phase 3: 전체 일관성 검토
Skill(skill: "mst:gemini", args: "{검토 프롬프트} --files src/**/*.ts --trace REQ-001/01/phase3-review")
```

## 옵션

- `--files {pattern}`: 컨텍스트에 포함할 파일 패턴 (예: `src/**/*.ts`)
- `--sandbox`: 샌드박스 환경에서 실행
- `-y`: 자동 승인 모드
- `--trace {REQ/TASK/label}`: 워크플로우 trace 문서 자동 생성 (stdout 반환 안 함)

## CLI 커맨드

```bash
# 기본 실행
gemini -p "{prompt}" --approval-mode yolo

# 자동 승인
gemini -p "{prompt}" -y

# 샌드박스
gemini -p "{prompt}" --sandbox
```

## 예시

```
# 독립 호출 (기존 동작 유지)
/mst:gemini "전체 코드베이스의 문서를 생성해줘"
/mst:gemini --files src/**/*.ts "이 파일들의 API 문서를 작성해줘"
/mst:gemini "대규모 리팩토링 영향 분석"

# 워크플로우 내 호출 (trace 문서 자동 생성)
/mst:gemini --files src/**/*.ts --trace REQ-001/01/phase1-analysis "코드베이스 구조 분석해줘"
/mst:gemini --files src/**/*.ts --trace REQ-001/01/phase3-review "전체 일관성을 검토해줘"
```

## 주의사항

- Gemini CLI가 설치되어 있어야 합니다 (`gemini --version`으로 확인)
- Gemini의 컨텍스트 윈도우는 최대 1M 토큰입니다. 대용량 파일은 분할 처리를 권장합니다
- `--approval-mode yolo` / `-y` 옵션은 모든 작업을 자동 승인하므로 주의하여 사용
- 워크플로우 외부에서 독립 호출 시 요청 상태에 영향을 주지 않음. 워크플로우 내에서는 PM Conductor가 컨텍스트를 전달
- `--trace` 모드에서는 전체 결과가 파일에만 저장되고 부모 컨텍스트에 반환되지 않음

## 문제 해결

- "gemini: command not found" → Gemini CLI가 설치되지 않았습니다. `npm install -g @google/gemini-cli`로 설치
- "파일 패턴 매칭 없음" → `--files` 패턴이 올바른지 확인. glob 패턴 사용 (예: `src/**/*.ts`)
- "컨텍스트 윈도우 초과" → 파일 수를 줄이거나 특정 디렉토리로 범위 한정. `--files` 패턴을 더 구체적으로 지정
- "샌드박스 실행 실패" → Docker가 설치/실행 중인지 확인. `--sandbox` 옵션은 Docker 기반 격리 환경을 사용
- "trace 디렉토리 생성 실패" → `.gran-maestro/requests/{REQ-ID}/tasks/{TASK-NUM}/` 경로가 존재하는지 확인
