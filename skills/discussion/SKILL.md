---
name: discussion
description: "설정된 AI 팀원들이 합의에 도달할 때까지 반복 토론합니다. 사용자가 '토론', '합의', '디스커션'을 말하거나 /mst:discussion를 호출할 때 사용. 1회성 의견 수집은 /mst:ideation 사용."
user-invocable: true
argument-hint: "{주제 또는 IDN-NNN} [--max-rounds {N}] [--focus {분야}]"
---

# maestro:discussion

설정된 AI 팀원들이 **합의에 도달할 때까지** 반복 토론합니다.  
PM(Claude)이 사회자 역할로 발산점을 식별하고, 각 AI에게 반론을 전달하며 수렴을 유도합니다.
이 스킬은 모드에 관계없이 사용 가능합니다 (OMC 모드, Maestro 모드 모두).

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

1. `.gran-maestro/discussion/` 디렉토리 존재 확인
2. 새 세션 ID 채번 (DSC-NNN)
3. `.gran-maestro/discussion/DSC-NNN/` 디렉토리 생성
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
  "created_at": "ISO-timestamp",
  "roles": {
    "codex": { "perspective": "", "type": "opinion", "status": "pending", "provider": "codex" },
    "codex-2": { "perspective": "", "type": "opinion", "status": "pending", "provider": "codex" },
    "gemini": { "perspective": "", "type": "opinion", "status": "pending", "provider": "gemini" }
  },
  "critics": {
    "claude": { "status": "pending", "provider": "claude" }
  },
  "critic_count": 1,
  "participant_config": { "codex": 2, "gemini": 1, "claude": 0 },
  "rounds": []
}
```

`roles` 생성 규칙은 ideation과 동일:
- `participants.opinion_providers`를 읽어 동적으로 생성 (`codex`, `codex-2`, ...)
- 합계 검증: 2~7명, 위반 시 에러 후 중단
- `provider` 필드로 실제 호출 대상 식별

### Step 1.5: PM 역할 배정

PM이 주제/포커스를 분석해 `roles` 수만큼 관점을 배정하고 `critics`를 결정합니다.

- Codex/Gemini/Claude 강점에 맞춰 관점 배정
- Critic 규칙
  - Claude 1명 이상: Claude 우선 배정
  - Claude 0명: Codex 1명, 다음 Gemini
  - critic_count 2: 1순위가 Claude(또는 대체), 2순위 Codex(또는 Gemini)

`session.json`에 `roles`, `critics`, `critic_count`, `participant_config`, `status: "initializing"` 기록.

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
   - `rounds/00/{roleKey}.md`
2. 초기 `synthesis.md`(또는 합성 결과) 기준으로 Step 4로 진입

**새 주제인 경우**

1. `roles` 키를 순회해 `rounds/00/prompts/{roleKey}-prompt.md` 작성
2. 병렬 호출:

   > **Claude 모델 결정**: config.json의 `models.claude` 값을 사용합니다 (미설정 시 `"opus"` 폴백).

   - `provider: "codex"`: `/mst:codex --prompt-file .../{roleKey}-prompt.md --output rounds/00/{roleKey}.md`
   - `provider: "gemini"`: `/mst:gemini --prompt-file .../{roleKey}-prompt.md --sandbox > rounds/00/{roleKey}.md`
   - `provider: "claude"`: `Task(..., model: "{config.models.claude}", prompt: ".../{roleKey}-prompt.md 파일을 Read 후 rounds/00/{roleKey}.md Write")`

각 호출은 `run_in_background: true`.

### Step 3: PM 초기 종합

`rounds/00/synthesis.md` 생성 절차:
- 의견 목록: `rounds/00/{roleKey}.md` 순회
- 템플릿: `templates/discussion-round-synthesis.md` + `provider/perspective` 동적 표기
- 결과 저장 후 `status: "debating"`, `current_round: 0`

### Step 4: 토론 라운드 (반복)

#### 4a. PM이 맞춤 프롬프트 작성

이전 라운드에서 수렴되지 않은 발산점을 기반으로 각 역할에 적합한 반론형 프롬프트 작성:
- 응답 파일명: `rounds/NN/{roleKey}.md`
- 프롬프트 파일: `rounds/NN/prompts/{roleKey}-prompt.md`
- 핵심: 이전 라운드 입장 요약 + 타 AI의 반론 반영

#### 4b. 역할 기반 병렬 호출

역할별 동시 호출:
- `Codex`: `/mst:codex --prompt-file rounds/NN/prompts/{roleKey}-prompt.md --output rounds/NN/{roleKey}.md`
- `Gemini`: `/mst:gemini --prompt-file rounds/NN/prompts/{roleKey}-prompt.md > rounds/NN/{roleKey}.md`
- `Claude`: `Task(model: "{config.models.claude}", prompt: "prompts/{roleKey}-prompt.md")`

#### 4b.5. Critic 평가

- `critics` 키 순회하여 `rounds/NN/prompts/critique-{criticKey}-prompt.md` 생성
- `provider` 규칙에 따라 역할별 배정 수행
- `rounds/NN/critique-{criticKey}.md` 저장

#### 4c. 라운드 종합

- 입력: `rounds/{NN-1}/synthesis.md` + `rounds/NN/{roleKey}.md` + `rounds/NN/critique-{criticKey}.md`
- 템플릿: `templates/discussion-round-synthesis.md`의 동적 표 사용
- 출력: `rounds/NN/synthesis.md`
- `status`, `current_round` 업데이트

### Step 4d. 수렴 판단

PM이 4c 결과의 합의 정도를 판정:
- 합의 판단 기준 충족 또는 최대 라운드 도달 시 Step 5
- 미충족 시 다음 라운드 수행

### Step 5: 합의문 작성

최종 consensus.md를 생성.
- 참여자 목록: `roles` 키/Provider를 동적 나열
- 미합의 사항: `roles` 기준 행 반복
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
│   │   │   ├── {roleKey}-prompt.md
│   │   │   ├── critique-{criticKey}-prompt.md
│   │   │   └── synthesis-prompt.md
│   │   ├── {roleKey}.md
│   │   ├── critique-{criticKey}.md
│   │   └── synthesis.md
│   └── ...
├── consensus.md
```

## 옵션

- `--focus {architecture|ux|performance|security|cost}`: 분석 포커스 지정
- `--max-rounds {N}`: 최대 토론 라운드 지정

## 참고

총합 2~7명 규칙 및 roles/critics의 동적 배정은 ideation과 동일.
