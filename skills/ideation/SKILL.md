---
name: ideation
description: "설정된 AI 팀원들의 의견을 병렬 수집하고 종합 토론합니다. 사용자가 '아이디어', '브레인스토밍', '의견 수렴'을 말하거나 /mst:ideation을 호출할 때 사용. 구현 전 다각도 분석이 필요할 때 독립적으로 실행."
user-invocable: true
argument-hint: "{주제} [--focus {architecture|ux|performance|security|cost}]"
---

# maestro:ideation

설정된 AI 팀원들의 의견을 병렬 수집하고 PM이 종합하여 인터랙티브 토론을 진행합니다.
이 스킬은 Maestro 모드 활성 여부에 관계없이 사용 가능합니다.
Gran Maestro 워크플로우(REQ)와 독립적으로 실행됩니다.

## 실행 프로토콜

### Step 0: 아카이브 체크 (자동)

config.json의 `archive.auto_archive_on_create`가 true이면:
1. `.gran-maestro/ideation/` 하위의 IDN-* 디렉토리 수 확인
2. `archive.max_active_sessions` 초과 시:
   - 완료된(completed/cancelled) 세션만 아카이브 대상
   - 오래된 순 정렬 → 초과분을 `.gran-maestro/archive/`에 tar.gz 압축
   - 원본 디렉토리 삭제
   - `[Archive] ideation {N}개 세션 아카이브됨` 알림
3. 아카이브 완료 후 정상적으로 Step 1 진행

상세 아카이브 로직은 `/mst:archive` 스킬의 "자동 아카이브 프로토콜" 참조.

### Step 1: 초기화

1. `.gran-maestro/ideation/` 디렉토리 존재 확인, 없으면 생성
2. 새 세션 ID 채번 (IDN-NNN) — **counter.json 기반**:
   - `.gran-maestro/ideation/counter.json` 파일 Read
   - **파일 존재 시**: `next_id = last_id + 1`
   - **파일 미존재 시** (최초 또는 복구):
     a. `.gran-maestro/ideation/` 하위의 기존 IDN-* 디렉토리 스캔
     b. `.gran-maestro/archive/` 내 `ideation-*` tar.gz 파일명에서 ID 범위 추출 (예: `ideation-IDN001-IDN005-*.tar.gz` → max 5)
     c. 모든 소스에서 최대 번호 결정 → `counter.json` 생성: `{ "last_id": {max_number} }`
     d. `next_id = last_id + 1`
   - `counter.json` 업데이트: `{ "last_id": {next_id} }`
3. `.gran-maestro/ideation/IDN-NNN/` 디렉토리 생성 (NNN은 3자리 zero-padded)
4. `session.json` 작성:

```json
{
  "id": "IDN-NNN",
  "topic": "{사용자 주제}",
  "focus": "{focus 옵션 또는 null}",
  "status": "analyzing",
  "created_at": "{현재 날짜+시각 ISO 8601, 예: 2026-02-23T14:35:22.000Z — 날짜만 입력 금지}",
  "participants": [
    {
      "key": "architect(codex)",
      "role": "architect",
      "perspective": "",
      "type": "opinion",
      "status": "pending",
      "provider": "codex"
    },
    {
      "key": "ux-strategist(gemini)",
      "role": "ux-strategist",
      "perspective": "",
      "type": "opinion",
      "status": "pending",
      "provider": "gemini"
    },
    {
      "key": "risk-analyst(claude)",
      "role": "risk-analyst",
      "perspective": "",
      "type": "opinion",
      "status": "pending",
      "provider": "claude"
    }
  ],
  "critics": {
    "claude": { "status": "pending", "provider": "claude" }
  },
  "critic_count": 1,
  "participant_config": { "codex": 3, "gemini": 2, "claude": 1 }
}
```

`participants`는 config의 `ideation.agents`를 읽어 다음 규칙으로 생성합니다.
> `discussion`과는 독립 운영이므로 값도 별도입니다.
### participants 동적 생성 규칙 (공통)
1. 각 provider(codex, gemini, claude)의 count를 읽음
2. count == 1이면 첫 번째 항목의 key 이름은 `{provider}`가 아닌 `{role}(provider)` 형식이 되도록 role을 붙임
3. count > 1이면 `{provider}` key를 유지하지 않고 순서대로 role을 생성해 `{participant.key}` 형태로 key를 만듦
4. 각 참가자 항목에 `provider` 필드를 기록하여 실제 호출 대상을 식별
5. 합계 검증: 2~7명, 위반 시 에러 후 중단
6. count가 0이면 해당 provider는 완전 skip

`participants` 키가 없으면 기본값 `{ codex:1, gemini:1, claude:1 }`로 채움.

예시 (`ideation.agents.codex=3`, `ideation.agents.gemini=2`, `ideation.agents.claude=1`):
```json
{
  "participants": [
    { "key": "architect(codex)", "role": "architect", "perspective": "", "type": "opinion", "status": "pending", "provider": "codex" },
    { "key": "ux(codex)", "role": "ux", "perspective": "", "type": "opinion", "status": "pending", "provider": "codex" },
    { "key": "security(codex)", "role": "security", "perspective": "", "type": "opinion", "status": "pending", "provider": "codex" },
    { "key": "architecture(gemini)", "role": "architecture", "perspective": "", "type": "opinion", "status": "pending", "provider": "gemini" },
    { "key": "cost(gemini)", "role": "cost", "perspective": "", "type": "opinion", "status": "pending", "provider": "gemini" },
    { "key": "risk(claude)", "role": "risk", "perspective": "", "type": "opinion", "status": "pending", "provider": "claude" }
  ]
}
```

### Step 1.5: PM 역할 배정 (Role Assignment)

PM이 주제와 focus를 분석하여 `participants` 수만큼 관점을 배정합니다.

1. **주제 분석**: 도메인, 복잡도, 기술적 깊이 파악
2. **관점 결정**: 참여자 수만큼 서로 다른 관점 결정
   - 예시: "아키텍처 설계", "사용자 경험 전략", "성능 최적화"
3. **프로바이더 매칭**: 각 관점은 강점에 따라 매칭
   - **Codex**: 코드/구현/아키텍처/시스템 설계 관점
   - **Gemini**: 전략/디자인/트렌드/생태계 분석 관점
   - **Claude**: 추론/리스크/평가/거버넌스 관점
4. **Critic 수 결정**
   - 기본 1 critic
   - 복잡한 주제는 2 critic
5. **Critic 배정 규칙 (필수)**  
   - Claude 참여자 수 ≥ 1: Claude가 critic 우선 배정
   - Claude 참여자 수 = 0: Codex 우선, 다음 Gemini  
   - critic_count=2면 2명 배정: Claude + Codex (또는 Codex + Gemini)
6. `session.json` 업데이트:
   - `participants` 각 항목의 `perspective` 기록
   - `critics` 키는 실제 배정된 `criticKey` 사용(예: `claude`, `codex` 등)
   - `participant_config`, `critic_count` 저장
   - `status`를 `"collecting"`으로 변경

### AUTO-CONTINUE 원칙 (CRITICAL)

> **이 스킬의 Step 1~3은 사용자 입력 없이 자율적으로 진행합니다.**
> - 백그라운드 작업(Codex/Gemini/Claude)이 완료될 때, 사용자에게 "계속할까요?" "진행할까요?" 등을 **절대 묻지 마세요**.
> - 개별 백그라운드 작업 완료 알림에는 간단히 확인만 하고 **모든 작업이 완료될 때까지 대기**하세요.
> - 모든 작업이 완료되면 **즉시 다음 Step**으로 진행하세요 (Step 2 → 2.5 → 2.7 → 3 → 사용자 보고).
> - 사용자 상호작용은 Step 4(인터랙티브 토론)에서만 발생합니다.
> - 이 원칙은 ralph/ultrawork 모드가 아니어도 항상 적용됩니다.

### Step 2: 병렬 의견 수집 (Direct File Write)

모든 참여자 수만큼 동시에 질문합니다.

> - 역할 기반 반복: `participants`의 항목을 순회하여 `provider` 필드에 따라 호출
> - 프롬프트 파일: `prompts/{participant.key}-prompt.md`
> - 출력 파일: `opinion-{participant.key}.md`

**도구 사용 원칙 (CRITICAL)**
> - 모든 호출은 `Task(run_in_background: true)` 래핑으로 병렬 실행
> - Codex/Gemini/Claude 호출 모두 `Task(subagent_type: "general-purpose", run_in_background: true, ...)` 형식으로만 실행

**토큰 절약 원칙**
> - 각 응답은 파일로 직접 쓰기
> - 프롬프트도 파일로 저장 후 `--prompt-file` 사용

**프롬프트 작성 포맷 예시 (participant 단위)**
> "당신은 {provider}의 {N}번째 인스턴스입니다. 관점은 **{perspective}**입니다."
> "다른 {provider} 인스턴스들과 다른 고유한 시각으로 분석하세요."

**호출 방식**

> **모델 결정**: 스킬 실행 초기에 `.gran-maestro/config.json`의 `models` 섹션을 Read하여 모델 설정을 확인하세요.
> - Claude: `models.claude.ideation` (opus / sonnet)
> - Codex/Gemini: `models.developer` 참조 불필요 (ideation은 Claude 전용 역할)

- `provider: "codex"`:
  ```
  Task(
    subagent_type: "general-purpose",
    run_in_background: true,
    prompt: "Skill(skill: 'mst:codex', args: '--prompt-file {absolute_path}/prompts/{participant.key}-prompt.md --output {absolute_path}/opinion-{participant.key}.md') 실행 후 완료 보고"
  )
  ```
- `provider: "gemini"`:
  ```
  Task(
    subagent_type: "general-purpose",
    run_in_background: true,
    prompt: "Skill(skill: 'mst:gemini', args: '--prompt-file {absolute_path}/prompts/{participant.key}-prompt.md > {absolute_path}/opinion-{participant.key}.md') 실행 후 완료 보고"
  )
  ```
- `provider: "claude"`:
  ```
  Task(
    subagent_type: "general-purpose",
    model: "{config.models.claude.ideation}",
    run_in_background: true,
    prompt: "{absolute_path}/prompts/{participant.key}-prompt.md 파일을 Read하고 지시에 따라 분석. 결과를 opinion-{participant.key}.md에 Write. 완료 후 '완료'"
  )
  ```

결과 확인:
1. `participants` 항목 순회  
2. `opinion-{participant.key}.md` 존재 여부로 성공/실패 판단

### Step 2.5: 완료 확인 및 상태 업데이트

`participants` 순회하여 각 파일 존재 및 비어 있음 여부 확인.
- 존재+비어있지 않음: `participant.status = "done"`
- 존재하지 않거나 비었음: `participant.status = "failed"`

세션 상태를 한 번에 업데이트하고 다음 Step으로 진행.

### Step 2.7: Critic 평가 (Critical Review)

참여자별 의견 파일(`opinion-{participant.key}.md`)을 기반으로 critic이 배정된 `critics`만큼 생성:
- `critics` 키 순회 → `critique-{criticKey}-prompt.md` 생성
- `provider` 필드에 따라 호출 분기
- 각 critic는 자신의 관점에서 허점/엣지/반론을 식별

예시 파일 목록은 critic key 기준으로 동적으로 생성:
- `prompts/critique-{criticKey}-prompt.md`  
- `critique-{criticKey}.md`

호출 방식:

- `provider: "codex"`:
  ```
  Task(
    subagent_type: "general-purpose",
    run_in_background: true,
    prompt: "Skill(skill: 'mst:codex', args: '--prompt-file {absolute_path}/prompts/critique-{criticKey}-prompt.md --output {absolute_path}/critique-{criticKey}.md') 실행 후 완료 보고"
  )
  ```
- `provider: "gemini"`:
  ```
  Task(
    subagent_type: "general-purpose",
    run_in_background: true,
    prompt: "Skill(skill: 'mst:gemini', args: '--prompt-file {absolute_path}/prompts/critique-{criticKey}-prompt.md > {absolute_path}/critique-{criticKey}.md') 실행 후 완료 보고"
  )
  ```
- `provider: "claude"`:
  ```
  Task(
    subagent_type: "general-purpose",
    model: "{config.models.claude.ideation}",
    run_in_background: true,
    prompt: "prompts/critique-{criticKey}-prompt.md 파일을 Read하고 비판 관점에서 분석. 결과를 critique-{criticKey}.md에 Write. 완료 후 '완료'"
  )
  ```

### Step 3: PM 종합 (Delegated Synthesis)

의견 파일 목록은 `participants` 항목 순회로 동적 생성:
- `opinion-{participant.key}.md` + 관점: `{participant.perspective}`
- `critique-{criticKey}.md` 순회

Synthesis prompt는 템플릿 `templates/ideation-synthesis.md` 사용.
세션 정보 또한 고정 인원 표기가 아닌 `participants` 동적 나열 형식으로 구성.

### Step 4: 인터랙티브 토론

**Step 4 진입 시 컨텍스트 판별 (최우선):**
`/mst:start`가 ideation을 서브 호출할 때는 호출 인자에 `--from-start` 플래그가 포함됨.
이 플래그 존재 여부로 분기한다.

- **[경로 A] `/mst:start` 서브 호출 (`--from-start` 포함):**
  1. `synthesis.md`를 호출자(/mst:start)에게 반환
  2. `session.json`의 `status`를 즉시 `"completed"`로 갱신
  3. Step 5 진행

- **[경로 B] 독립 실행 (flags 없음):**
  1. `synthesis.md` 표시
  2. 사용자 질의 반영 토론 진행
  3. 내용 append: `discussion.md`
  4. `session.json`의 `status`를 `"discussing"` → 완료 시 `"completed"`로 갱신
  5. Step 5 진행

### Step 5: 아카이브 체크 (완료 시, 자동)

config.json의 `archive.auto_archive_on_complete`가 true이면 `archive` 절차 수행(상세는 `/mst:archive`).

## 에러 처리

참여자 수 대비 처리:
- 과반 이상 성공: 실패/누락 항목을 제외하고 합성 진행
- 과반 미만 성공: PM 자체 분석으로 보완 후 진행
- 전원 실패: 에러 메시지 + 재시도 안내
- CLI 미설치: 해당 AI 스킵, 사용 가능한 AI로만 진행

## 옵션

- `--focus {architecture|ux|performance|security|cost}`: 분석 범위를 특정 분야로 제한

## 세션 파일 구조

```
.gran-maestro/ideation/IDN-NNN/
├── session.json
├── prompts/
│   ├── {participant.key}-prompt.md
│   ├── critique-{criticKey}-prompt.md
│   └── synthesis-prompt.md
├── opinion-{participant.key}.md
├── critique-{criticKey}.md
└── synthesis.md
```

## 예시

```
/mst:ideation "마이크로서비스 vs 모놀리식 아키텍처"
```
