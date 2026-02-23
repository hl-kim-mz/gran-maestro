---
name: debug
description: "3 AI(Codex/Gemini/Claude)가 병렬로 버그를 조사하고 종합 리포트를 생성합니다. 사용자가 '디버그', '버그 찾아줘', '문제 분석'을 말하거나 /mst:debug를 호출할 때 사용. 1회성 의견 수집은 /mst:ideation을, 합의 토론은 /mst:discussion을 사용."
user-invocable: true
argument-hint: "{버그/이슈 설명} [--focus {파일패턴}]"
---

# maestro:debug

설정된 AI 팀원들이 **병렬로 버그를 조사**하고 PM(Claude)이 자체 조사를 동시 수행한 뒤, 모든 결과를 합쳐 종합 디버그 리포트를 생성합니다.
이 스킬은 Maestro 모드 활성 여부에 관계없이 사용 가능합니다.

## ideation/discussion과의 차이

| | ideation | discussion | **debug** |
|---|---|---|---|
| 목적 | 다양한 관점 수집 (발산) | 합의 도달 (수렴) | **버그 탐지 (조사)** |
| Claude 역할 | 종합자 (PM) | 사회자 (PM) | **능동적 조사자 + 종합자** |
| 에이전트 역할 | 의견 제시 | 토론 참여 | **독립 조사 → 결과 문서** |
| 라운드 | 1회 | N회 반복 | **1회 (병렬 조사 후 합류)** |
| 종료 조건 | PM 종합 완료 | 참여자 합의 | **Claude 조사 완료 + 에이전트 합류** |
| 출력 | synthesis.md | consensus.md | **debug-report.md** |

## 실행 프로토콜

### Step 0: 아카이브 체크 (자동)

config.json의 `archive.auto_archive_on_create`가 true이면:
1. `.gran-maestro/debug/` 하위의 DBG-* 디렉토리 수 확인
2. `archive.max_active_sessions` 초과 시:
   - 완료된(completed/cancelled) 세션만 아카이브 대상
   - 오래된 순 정렬 → 초과분 압축 및 삭제
3. 아카이브 완료 후 정상적으로 Step 1 진행

### Step 1: 초기화

1. `.gran-maestro/debug/` 디렉토리 존재 확인, 없으면 생성
2. 새 세션 ID 채번 (DBG-NNN) — **counter.json 기반**:
   - `.gran-maestro/debug/counter.json` 파일 Read
   - **파일 존재 시**: `next_id = last_id + 1`
   - **파일 미존재 시** (최초 또는 복구):
     a. `.gran-maestro/debug/` 하위의 기존 DBG-* 디렉토리 스캔
     b. `.gran-maestro/archive/` 내 `debug-*` tar.gz 파일명에서 ID 범위 추출
     c. 모든 소스에서 최대 번호 결정 → `counter.json` 생성: `{ "last_id": {max_number} }`
     d. `next_id = last_id + 1`
   - `counter.json` 업데이트: `{ "last_id": {next_id} }`
3. `.gran-maestro/debug/DBG-NNN/` 디렉토리 생성 (NNN은 3자리 zero-padded)
4. `session.json` 작성:

```json
{
  "id": "DBG-NNN",
  "issue": "{사용자 이슈 설명}",
  "focus": "{--focus 값 또는 null}",
  "status": "analyzing",
  "created_at": "{현재 날짜+시각 ISO 8601, 예: 2026-02-23T14:35:22.000Z — 날짜만 입력 금지}",
  "investigators": {
    "codex": { "role": "", "status": "pending", "provider": "codex" },
    "codex-2": { "role": "", "status": "pending", "provider": "codex" },
    "codex-3": { "role": "", "status": "pending", "provider": "codex" },
    "gemini": { "role": "", "status": "pending", "provider": "gemini" },
    "gemini-2": { "role": "", "status": "pending", "provider": "gemini" }
  },
  "claude_investigation": { "status": "pending" },
  "participant_config": { "codex": 3, "gemini": 2, "claude": 1 },
  "merge_wait_ms": 60000
}
```

`investigators`는 config의 `participants.opinion_providers`를 다음 규칙으로 읽어 생성합니다.
### investigators 동적 생성 규칙 (공통: debug용)
1. 각 provider(codex, gemini, claude)의 count를 읽음
2. count == 1이면 키 이름은 provider 그대로
3. count > 1이면 첫 번째는 `{provider}`, 이후는 `{provider}-2`, `{provider}-3` ...
4. 각 항목에 `provider` 필드를 기록해 실제 호출 대상을 식별
5. `claude`는 investigators에서 제외 (별도 `claude_investigation` 사용), 합계 검증: investigators 1~6명, 위반 시 에러 후 중단.

`participants` 키가 없으면 기본값 `{ codex:1, gemini:1, claude:1 }` 사용.
예시 (`codex:3`, `gemini:2`, `claude:1`):
```json
{
  "investigators": {
    "codex": { "role": "", "status": "pending", "provider": "codex" },
    "codex-2": { "role": "", "status": "pending", "provider": "codex" },
    "codex-3": { "role": "", "status": "pending", "provider": "codex" },
    "gemini": { "role": "", "status": "pending", "provider": "gemini" },
    "gemini-2": { "role": "", "status": "pending", "provider": "gemini" }
  }
}
```

### Step 1.5: PM 역할 배정 (Investigation Assignment)

PM이 이슈를 분석하여 `investigators` 수만큼 조사 역할을 배정합니다.

1. **이슈 분석**: 증상, 재현 조건, 관련 모듈, 의심 영역 파악
2. **조사 역할 결정**: 참여자 수만큼 서로 다른 조사 각도 배정
   - 예시: "콜 체인 추적", "상태 변이 분석", "의존성 충돌 검사", "에러 패턴 탐색"
3. **프로바이더 매칭**:
   - **Codex**: 코드 레벨 정밀 추적 (콜 체인, 심볼 참조, 타입 불일치, 경계 조건)
   - **Gemini**: 광역 컨텍스트 분석 (모듈 간 상호작용, 설정 불일치, 대규모 패턴)
4. `session.json` 업데이트:
   - `investigators[key].role` 기록
   - `status`를 `"investigating"`으로 변경

### AUTO-CONTINUE 원칙 (CRITICAL)

> **이 스킬의 모든 Step은 사용자 입력 없이 자율적으로 진행합니다.**
> - 백그라운드 작업 완료 시 사용자에게 확인 질문 금지
> - 모든 단계는 사용자 입력 없이 자동 진행
> - Step 2~5는 완전 자동, Step 6에서만 사용자 보고

### 병렬 Write 원칙 (CRITICAL)

독립 파일 Write는 하나의 응답에서 동시에 수행:
- `session.json`, 프롬프트 여러 개를 함께 생성
- 순차 쓰기를 피해 병렬성 보장

### Step 2: 에이전트 백그라운드 파견

`investigators` 키를 순회하여 조사 프롬프트를 작성하고 **즉시 백그라운드로 파견**합니다.

> **Claude 모델 결정**: config.json의 `models.claude` 값을 사용합니다 (미설정 시 `"sonnet"` 폴백).

#### 2a. 프롬프트 파일 작성

`investigators` 키를 순회하여 `prompts/{investigatorKey}-prompt.md`를 **하나의 메시지에서 동시에 Write**합니다.

**프롬프트 작성 포맷:**

```markdown
# 버그 조사 요청

## 이슈
{사용자가 보고한 이슈 전체 내용}

## 당신의 조사 역할
당신은 {provider}입니다. 조사 각도: **{role}**

## 조사 지침
1. 아래 관점에서 코드베이스를 철저히 조사하세요
2. 구체적인 파일명, 라인 번호, 코드 스니펫을 포함하세요
3. 발견한 문제의 근본 원인(root cause)을 추론하세요
4. 수정 방안이 있다면 제안하세요

## 집중 영역
{--focus 값이 있으면 해당 파일 패턴, 없으면 "코드베이스 전체"}

## 출력 형식
응답을 {output_file}에 마크다운으로 작성하세요. 다음 섹션을 포함:
- **조사 요약**: 무엇을 조사했는지 1~2문장
- **발견 사항**: 발견한 문제점 목록 (파일:라인 형식으로)
- **근본 원인 분석**: 왜 이 문제가 발생하는지 추론
- **수정 제안**: 구체적인 수정 방안 (있는 경우)
- **추가 조사 필요 영역**: 더 확인이 필요한 부분

글자 수 제한: {config.collaborative_debug.finding_char_limit}자 이내
```

#### 2b. 병렬 호출

> 모든 호출은 `Task(run_in_background: true)`로 실행합니다.

- `provider: "codex"`:
  ```
  Task(
    subagent_type: "general-purpose",
    run_in_background: true,
    prompt: "Skill(skill: 'mst:codex', args: '--prompt-file {absolute_path}/prompts/{investigatorKey}-prompt.md --output {absolute_path}/finding-{investigatorKey}.md') 실행 후 완료 보고"
  )
  ```
- `provider: "gemini"`:
  ```
  Task(
    subagent_type: "general-purpose",
    run_in_background: true,
    prompt: "Skill(skill: 'mst:gemini', args: '--prompt-file {absolute_path}/prompts/{investigatorKey}-prompt.md --files {focus_pattern} > {absolute_path}/finding-{investigatorKey}.md') 실행 후 완료 보고"
  )
  ```

각 호출의 background task ID를 `session.json`에 기록합니다.

### Step 3: Claude 자체 조사 (동시 진행)

에이전트 파견 직후, Claude(PM)가 **직접** 버그 조사를 수행합니다.

#### 조사 절차

1. **증상 분석**: 사용자 보고 내용에서 키워드 추출
2. **코드베이스 탐색**: Glob, Grep, Read 도구를 활용하여 관련 코드 탐색
   - `--focus` 지정 시 해당 파일 패턴을 우선 탐색
   - 미지정 시 에러 메시지, 로그 패턴, 관련 함수명 기반 탐색
3. **가설 수립**: 발견된 코드 패턴을 기반으로 버그 가설 수립
4. **가설 검증**: 추가 코드 읽기로 가설 확인/반증
5. **결과 기록**: `finding-claude.md` 작성

```markdown
# Claude 조사 결과

## 조사 요약
{무엇을 조사했는지}

## 탐색 경로
{어떤 파일/함수를 탐색했는지 순서대로}

## 발견 사항
{발견한 문제점 목록 — 파일:라인 형식}

## 근본 원인 분석
{왜 이 문제가 발생하는지 추론}

## 수정 제안
{구체적인 수정 방안}

## 확신도
{높음/중간/낮음} — {근거}
```

### Step 4: 합류 (Merge)

Claude 자체 조사 완료 후 에이전트 결과를 합류합니다.

#### 4a. 즉시 확인

`investigators` 키를 순회하여 `finding-{investigatorKey}.md` 파일의 존재 여부를 확인합니다.
- 파일 존재 + 비어있지 않음 → `status: "done"`
- 파일 미존재 또는 비었음 → `status: "in_progress"`

#### 4b. 대기 (필요 시)

모든 investigator가 `done`이면 즉시 Step 5로 진행합니다.

`in_progress`인 investigator가 있으면:
1. `config.collaborative_debug.merge_wait_ms` (기본 60000ms) 동안 대기
2. 대기 중 주기적으로 (10초 간격) 파일 존재를 재확인
3. 타임아웃 시: 완료된 결과만 사용하고 미완료 investigator는 `status: "timeout"`으로 기록

#### 4c. session.json 업데이트

```json
{
  "status": "synthesizing",
  "investigators": {
    "codex": { "status": "done", ... },
    "gemini": { "status": "timeout", ... }
  },
  "claude_investigation": { "status": "done" },
  "merge_completed_at": "{현재 날짜+시각 ISO 8601, 예: 2026-02-23T14:35:22.000Z — 날짜만 입력 금지}"
}
```

### Step 5: 종합 리포트 작성

모든 조사 결과를 합쳐 `debug-report.md`를 생성합니다.

**입력 파일**:
- `finding-claude.md` (Claude 자체 조사)
- `finding-{investigatorKey}.md` (완료된 에이전트 결과만)

**템플릿**: `templates/debug-synthesis.md` 사용

종합 절차:
1. 모든 finding 파일을 Read
2. 발견 사항을 중복 제거 + 교차 검증
3. 여러 조사자가 동일 문제를 지목하면 **확신도 상승**
4. 단일 조사자만 발견한 문제는 **추가 검증 필요**로 표시
5. 근본 원인 추론을 통합하여 최종 진단
6. 수정 방안을 우선순위로 정렬

`session.json`의 `status`를 `"completed"`로 변경합니다.

### Step 6: 사용자 보고

`debug-report.md`의 내용을 사용자에게 표시합니다.

표시 포맷:
```
## DBG-NNN 디버그 리포트

### 참여 조사자
- Claude (자체 조사): {상태}
- Codex ({role}): {상태}
- Gemini ({role}): {상태}

### 핵심 발견
{가장 확신도 높은 문제 1~3개}

### 수정 제안
{우선순위별 수정 방안}

---
상세 리포트: .gran-maestro/debug/DBG-NNN/debug-report.md
```

### Step 7: 다음 단계 안내

> ℹ️ **AUTO-CONTINUE 예외**: 다음 단계는 사용자 의사에 따라 결정되므로 AskUserQuestion을 사용합니다.

`AskUserQuestion`으로 아래 선택지를 제시합니다:

- **"수정 작업 시작 (→ /mst:start)"**: debug-report.md 컨텍스트를 유지하며 REQ를 생성하고 구현을 시작합니다.
  → `Skill(skill: "mst:start", args: "--from-debug {DBG-NNN} {이슈 제목 요약}")`
- **"플랜으로 정제 후 진행 (→ /mst:plan)"**: debug 결과를 바탕으로 구현 범위를 먼저 정제합니다.
  → `Skill(skill: "mst:plan", args: "--from-debug {DBG-NNN} {이슈 제목 요약}")`
- **"리포트만 확인 (종료)"**: 현재 세션을 종료합니다. 나중에 수동으로 `/mst:start` 또는 `/mst:plan`을 호출할 수 있습니다.
  → 스킬 종료

`{DBG-NNN}`은 현재 세션의 ID, `{이슈 제목 요약}`은 `session.json`의 `issue` 필드 앞 50자를 사용합니다.

## 에러 처리

참여자 수 대비 처리:
- Claude 조사 성공 + 에이전트 과반 성공: 정상 합성
- Claude 조사 성공 + 에이전트 전원 실패/타임아웃: Claude 결과만으로 리포트 생성 (에이전트 미참여 명시)
- Claude 조사 실패: 에러 메시지 + 재시도 안내
- CLI 미설치: 해당 AI 스킵, 사용 가능한 AI로만 진행

## 세션 파일 구조

```
.gran-maestro/debug/DBG-NNN/
├── session.json
├── prompts/
│   ├── {investigatorKey}-prompt.md
│   └── ...
├── finding-{investigatorKey}.md
├── finding-claude.md
└── debug-report.md
```

## 옵션

- `--focus {파일패턴}`: 조사 범위를 특정 파일 패턴으로 제한 (예: `src/auth/**/*.ts`)

## 예시

```
/mst:debug "로그인 시 간헐적으로 401 에러가 발생합니다"
/mst:debug --focus src/api/**/*.ts "API 응답이 비정상적으로 느립니다"
/mst:debug "빌드 시 타입 에러가 발생하는데 원인을 모르겠습니다"
```

## 참고

- investigators의 동적 배정은 ideation의 규칙(참여자 수 기반 key 생성 + 합계 검증)을 디버그용으로 재사용합니다.  
- roles가 아니라 investigators를 사용하는 것은 디버그 스킬 고유 스키마이며 의도된 차이입니다.
- Claude 참여자는 investigators에 포함되지 않고 별도 `claude_investigation`으로 분리됩니다.
