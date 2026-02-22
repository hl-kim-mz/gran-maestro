---
name: discussion
description: "설정된 AI 팀원들이 합의에 도달할 때까지 반복 토론합니다. 사용자가 '토론', '합의', '디스커션'을 말하거나 /mst:discussion를 호출할 때 사용. 1회성 의견 수집은 /mst:ideation 사용."
user-invocable: true
argument-hint: "{주제 또는 IDN-NNN} [--max-rounds {N}] [--focus {분야}]"
---

# maestro:discussion

설정된 AI 팀원들이 **합의에 도달할 때까지** 반복 토론합니다.  
PM(Claude)이 사회자 역할로 발산점을 식별하고, 각 AI에게 반론을 전달하며 수렴을 유도합니다.
이 스킬은 Maestro 모드 활성 여부에 관계없이 사용 가능합니다.

## ideation과의 차이

| | ideation | discussion |
|---|---|---|
| 목적 | 다양한 관점 수집 (발산) | 합의 도달 (수렴) |
| 라운드 | 1회 | N회 반복 |
| 종료 조건 | PM 종합 완료 | 참여자 합의 또는 max rounds |
| 출력 | synthesis.md | consensus.md |

## 실행 프로토콜

### Step 0: 아카이브 체크 (자동)

config.json의 `archive.auto_archive_on_create`가 true이면:
1. `.gran-maestro/discussion/` 하위의 DSC-* 디렉토리 수 확인
2. `archive.max_active_sessions` 초과 시:
   - 완료된(completed/cancelled) 세션만 아카이브 대상
   - 오래된 순 정렬 → 초과분 압축 및 삭제
3. 아카이브 완료 후 정상적으로 Step 1 진행

### Step 1: 초기화

1. `.gran-maestro/discussion/` 디렉토리 존재 확인, 없으면 생성
2. 새 세션 ID 채번 (DSC-NNN) — **counter.json 기반**:
   - `.gran-maestro/discussion/counter.json` 파일 Read
   - **파일 존재 시**: `next_id = last_id + 1`
   - **파일 미존재 시** (최초 또는 복구):
     a. `.gran-maestro/discussion/` 하위의 기존 DSC-* 디렉토리 스캔
     b. `.gran-maestro/archive/` 내 `discussion-*` tar.gz 파일명에서 ID 범위 추출 (예: `discussion-DSC001-DSC006-*.tar.gz` → max 6)
     c. 모든 소스에서 최대 번호 결정 → `counter.json` 생성: `{ "last_id": {max_number} }`
     d. `next_id = last_id + 1`
   - `counter.json` 업데이트: `{ "last_id": {next_id} }`
3. `.gran-maestro/discussion/DSC-NNN/` 디렉토리 생성 (NNN은 3자리 zero-padded)
4. `session.json` 작성:

```json
{
  "id": "DSC-NNN",
  "topic": "{사용자 주제}",
  "source_ideation": "{IDN-NNN 또는 null}",
  "focus": "{focus 또는 null}",
  "status": "analyzing",
  "max_rounds": "{config.json의 discussion.default_max_rounds}",
  "current_round": 0,
  "created_at": "{현재 날짜+시각 ISO 8601, 예: 2026-02-23T14:35:22.000Z — 날짜만 입력 금지}",
  "participants": [
    { "key": "architect(codex)", "role": "architect", "perspective": "", "type": "opinion", "status": "pending", "provider": "codex" },
    { "key": "ux(codex)", "role": "ux", "perspective": "", "type": "opinion", "status": "pending", "provider": "codex" },
    { "key": "security(codex)", "role": "security", "perspective": "", "type": "opinion", "status": "pending", "provider": "codex" },
    { "key": "architecture(gemini)", "role": "architecture", "perspective": "", "type": "opinion", "status": "pending", "provider": "gemini" },
    { "key": "cost(gemini)", "role": "cost", "perspective": "", "type": "opinion", "status": "pending", "provider": "gemini" },
    { "key": "risk(claude)", "role": "risk", "perspective": "", "type": "opinion", "status": "pending", "provider": "claude" }
  ],
  "critics": {
    "claude": { "status": "pending", "provider": "claude" }
  },
  "critic_count": 1,
  "participant_config": { "codex": 3, "gemini": 2, "claude": 1 },
  "rounds": []
}
```

`participants`는 config의 `discussion.agents`를 읽어 다음 규칙으로 생성합니다.
### participants 동적 생성 규칙 (공통)
1. 각 provider(codex, gemini, claude)의 count를 읽음
2. count == 1이면 key는 `{role}(provider)` 형태로 생성
3. count > 1이면 role 키를 순차 생성해 `{role}(provider)` 형태로 유지
4. 각 participant 항목에 `provider` 필드를 기록하여 실제 호출 대상을 식별
5. 합계 검증: 2~7명, 위반 시 에러 후 중단
6. count가 0이면 해당 provider는 완전 skip

`participants` 키가 없으면 기본값 `{ codex:1, gemini:1, claude:1 }` 사용.

### Step 1.5: PM 역할 배정

PM이 주제/포커스를 분석해 `participants` 수만큼 관점을 배정하고 `critics`를 결정합니다.

- Codex/Gemini/Claude 강점에 맞춰 관점 배정
- Critic 규칙
  - Claude 1명 이상: Claude 우선 배정
  - Claude 0명: Codex 1명, 다음 Gemini
  - critic_count 2: 1순위가 Claude(또는 대체), 2순위 Codex(또는 Gemini)

`session.json`에 `participants`, `critics`, `critic_count`, `participant_config`, `status: "initializing"` 기록.

### AUTO-CONTINUE 원칙 (CRITICAL)

> - 백그라운드 작업 완료 시 사용자에게 확인 질문 금지
> - 모든 단계는 사용자 입력 없이 자동 진행
> - 모든 호출이 모두 완료되면 즉시 다음 step 진행
> - Step 4d 종료 판단은 PM이 자율적으로 처리
> - 최종 사용자 보고는 Step 6에서만

### 병렬 Write 원칙 (CRITICAL)

독립 파일 Write는 하나의 응답에서 동시에 수행:
- `session.json`, 프롬프트 여러 개를 함께 생성
- 순차 쓰기를 피해 병렬성 보장

### Step 2: 초기 의견 수집

**입력이 IDN-NNN인 경우**

1. 아이디에 해당하는 ideation의 의견 파일들을 `rounds/00/`로 복사
   - `rounds/00/{participant.key}.md`
2. 초기 `synthesis.md`(또는 합성 결과) 기준으로 Step 4로 진입

**새 주제인 경우**

1. `participants`를 순회해 `rounds/00/prompts/{participant.key}-prompt.md` 작성
2. 병렬 호출:

   > **모델 결정**: config.json `models.claude.discussion` 참조 (opus / sonnet)

   - `provider: "codex"`:
     ```
     Task(
       subagent_type: "general-purpose",
       run_in_background: true,
      prompt: "Skill(skill: 'mst:codex', args: '--prompt-file {absolute_path}/rounds/00/prompts/{participant.key}-prompt.md --output {absolute_path}/rounds/00/{participant.key}.md') 실행 후 완료 보고"
     )
     ```
   - `provider: "gemini"`:
     ```
     Task(
       subagent_type: "general-purpose",
       run_in_background: true,
      prompt: "Skill(skill: 'mst:gemini', args: '--prompt-file {absolute_path}/rounds/00/prompts/{participant.key}-prompt.md --sandbox > {absolute_path}/rounds/00/{participant.key}.md') 실행 후 완료 보고"
     )
     ```
   - `provider: "claude"`:
     ```
     Task(
       subagent_type: "general-purpose",
       model: "{config.models.claude.discussion}",
       run_in_background: true,
      prompt: "{absolute_path}/rounds/00/prompts/{participant.key}-prompt.md 파일을 Read하고 지시에 따라 분석. 결과를 {absolute_path}/rounds/00/{participant.key}.md에 Write. 완료 후 '완료'"
     )
     ```

각 호출은 `Task(run_in_background: true)`로 병렬 실행됩니다.

### Step 3: PM 초기 종합

`rounds/00/synthesis.md` 생성 절차:
- 의견 목록: `rounds/00/{participant.key}.md` 순회
- 템플릿: `templates/discussion-round-synthesis.md` + `role/provider` 동적 표기
- 결과 저장 후 `status: "debating"`, `current_round: 0`

### Step 4: 토론 라운드 (반복)

#### 4a. PM이 맞춤 프롬프트 작성

이전 라운드에서 수렴되지 않은 발산점을 기반으로 각 역할에 적합한 반론형 프롬프트 작성:
- 응답 파일명: `rounds/NN/{participant.key}.md`
- 프롬프트 파일: `rounds/NN/prompts/{participant.key}-prompt.md`
- 핵심: 이전 라운드 입장 요약 + 타 AI의 반론 반영

#### 4b. 역할 기반 병렬 호출

역할별 병렬 호출:
- `provider: "codex"`:
  ```
  Task(
    subagent_type: "general-purpose",
    run_in_background: true,
    prompt: "Skill(skill: 'mst:codex', args: '--prompt-file {absolute_path}/rounds/NN/prompts/{participant.key}-prompt.md --output {absolute_path}/rounds/NN/{participant.key}.md') 실행 후 완료 보고"
  )
  ```
- `provider: "gemini"`:
  ```
  Task(
    subagent_type: "general-purpose",
    run_in_background: true,
    prompt: "Skill(skill: 'mst:gemini', args: '--prompt-file {absolute_path}/rounds/NN/prompts/{participant.key}-prompt.md > {absolute_path}/rounds/NN/{participant.key}.md') 실행 후 완료 보고"
  )
  ```
- `provider: "claude"`:
  ```
  Task(
    subagent_type: "general-purpose",
    model: "{config.models.claude.discussion}",
    run_in_background: true,
    prompt: "{absolute_path}/rounds/NN/prompts/{participant.key}-prompt.md 파일을 Read하고 지시에 따라 분석. 결과를 {absolute_path}/rounds/NN/{participant.key}.md에 Write. 완료 후 '완료'"
  )
  ```

#### 4b.5. Critic 평가

- `critics` 키 순회하여 `rounds/NN/prompts/critique-{criticKey}-prompt.md` 생성
- `provider` 규칙에 따라 역할별 배정 수행
- `rounds/NN/critique-{criticKey}.md` 저장
  
호출 방식:

- `provider: "codex"`:
  ```
  Task(
    subagent_type: "general-purpose",
    run_in_background: true,
    prompt: "Skill(skill: 'mst:codex', args: '--prompt-file {absolute_path}/rounds/NN/prompts/critique-{criticKey}-prompt.md --output {absolute_path}/rounds/NN/critique-{criticKey}.md') 실행 후 완료 보고"
  )
  ```
- `provider: "gemini"`:
  ```
  Task(
    subagent_type: "general-purpose",
    run_in_background: true,
    prompt: "Skill(skill: 'mst:gemini', args: '--prompt-file {absolute_path}/rounds/NN/prompts/critique-{criticKey}-prompt.md > {absolute_path}/rounds/NN/critique-{criticKey}.md') 실행 후 완료 보고"
  )
  ```
- `provider: "claude"`:
  ```
  Task(
    subagent_type: "general-purpose",
    model: "{config.models.claude.discussion}",
    run_in_background: true,
    prompt: "{absolute_path}/rounds/NN/prompts/critique-{criticKey}-prompt.md 파일을 Read하고 비판적 시각으로 분석. 결과를 {absolute_path}/rounds/NN/critique-{criticKey}.md에 Write. 완료 후 '완료'"
  )
  ```

#### 4c. 라운드 종합

- 입력: `rounds/{NN-1}/synthesis.md` + `rounds/NN/{participant.key}.md` + `rounds/NN/critique-{criticKey}.md`
- 템플릿: `templates/discussion-round-synthesis.md`의 동적 표 사용
- 출력: `rounds/NN/synthesis.md`
- `status`, `current_round` 업데이트

### Step 4d. 수렴 판단

PM이 4c 결과의 합의 정도를 판정:
- 합의 판단 기준 충족 또는 최대 라운드 도달 시 Step 5
- 미충족 시 다음 라운드 수행

### Step 5: 합의문 작성

최종 consensus.md를 생성.
- 참여자 목록: `participants` 키/Provider를 동적 나열
- 미합의 사항: `participants` 기준 행 반복
- 각 라운드 합의 이력 및 critic 기여 기록 반영

## 에러 처리

실패율 기반 정책:
- 과반 이상 성공: 실패한 항목은 제외하고 진행
- 과반 미만 성공: PM 자체 보완 분석으로 보완
- 전원 실패: 에러 + 재시도 안내

## 세션 파일 구조

```
.gran-maestro/discussion/DSC-NNN/
├── session.json
├── rounds/
│   ├── 00/
│   │   ├── prompts/
│   │   │   ├── {participant.key}-prompt.md
│   │   │   ├── critique-{criticKey}-prompt.md
│   │   │   └── synthesis-prompt.md
│   │   ├── {participant.key}.md
│   │   ├── critique-{criticKey}.md
│   │   └── synthesis.md
│   └── ...
├── consensus.md
```

## 옵션

- `--focus {architecture|ux|performance|security|cost}`: 분석 포커스 지정
- `--max-rounds {N}`: 최대 토론 라운드 지정

## 참고

총합 2~7명 규칙 및 participants/critics의 동적 배정은 ideation과 동일.
