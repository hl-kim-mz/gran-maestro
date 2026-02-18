---
name: ideation
description: "설정된 AI 팀원들의 의견을 병렬 수집하고 종합 토론합니다. 사용자가 '아이디어', '브레인스토밍', '의견 수렴'을 말하거나 /mst:ideation을 호출할 때 사용. 구현 전 다각도 분석이 필요할 때 독립적으로 실행."
user-invocable: true
argument-hint: "{주제} [--focus {architecture|ux|performance|security|cost}]"
---

# maestro:ideation

설정된 AI 팀원들의 의견을 병렬 수집하고 PM이 종합하여 인터랙티브 토론을 진행합니다.
이 스킬은 모드에 관계없이 사용 가능합니다 (OMC 모드, Maestro 모드 모두).
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
2. 새 세션 ID 채번 (IDN-NNN):
   - `.gran-maestro/ideation/` 하위의 기존 IDN-* 디렉토리를 스캔
   - 최대 번호를 찾아 +1 (첫 세션이면 IDN-001)
3. `.gran-maestro/ideation/IDN-NNN/` 디렉토리 생성
4. `session.json` 작성:

```json
{
  "id": "IDN-NNN",
  "topic": "{사용자 주제}",
  "focus": "{focus 옵션 또는 null}",
  "status": "analyzing",
  "created_at": "ISO-timestamp",
  "roles": {
    "codex": { "perspective": "", "type": "opinion", "status": "pending", "provider": "codex" },
    "codex-2": { "perspective": "", "type": "opinion", "status": "pending", "provider": "codex" },
    "gemini": { "perspective": "", "type": "opinion", "status": "pending", "provider": "gemini" }
  },
  "critics": {
    "claude-1": { "status": "pending", "provider": "claude" }
  },
  "critic_count": 1,
  "participant_config": { "codex": 2, "gemini": 1, "claude": 0 }
}
```

`roles`는 config의 `participants.opinion_providers`를 읽어 생성합니다.  
`participants` 키가 없으면 기본값 `{ codex:1, gemini:1, claude:1 }` 사용, 총합이 2 미만 또는 7 초과면 즉시 에러 후 중단합니다.

`count > 1`일 때는 첫 번째 키(`codex`)와 이후 `codex-2`, `codex-3` 형태로 role key를 생성합니다.

### Step 1.5: PM 역할 배정 (Role Assignment)

PM이 주제와 focus를 분석하여 `roles` 수만큼 관점을 배정합니다.

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
   - `roles[roleKey].perspective` 기록
   - `critics` 키는 실제 배정된 `criticKey` 사용(예: `claude`, `codex-1` 등)
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

> - 역할 기반 반복: `roles`의 키를 순회하여 `provider` 필드에 따라 호출
> - 프롬프트 파일: `prompts/{roleKey}-prompt.md`
> - 출력 파일: `opinion-{roleKey}.md`

**도구 사용 원칙 (CRITICAL)**
> - 모든 호출은 Skill/Task 흐름을 통해 수행
> - Codex, Gemini, Claude 호출을 병렬(`run_in_background: true`)로 실행

**토큰 절약 원칙**
> - 각 응답은 파일로 직접 쓰기
> - 프롬프트도 파일로 저장 후 `--prompt-file` 사용

**프롬프트 작성 포맷 예시 (roleKey 단위)**
> "당신은 {provider}의 {N}번째 인스턴스입니다. 관점은 **{perspective}**입니다."
> "다른 {provider} 인스턴스들과 다른 고유한 시각으로 분석하세요."

**호출 방식**
- `provider: "codex"`: `/mst:codex --prompt-file prompts/{roleKey}-prompt.md --output opinion-{roleKey}.md`
- `provider: "gemini"`: `/mst:gemini --prompt-file prompts/{roleKey}-prompt.md > opinion-{roleKey}.md`
- `provider: "claude"`: `Task(subagent_type: "general-purpose", model: "opus", prompt: "prompts/{roleKey}-prompt.md 파일을 Read하고 지시에 따라 분석. 결과를 opinion-{roleKey}.md에 Write. 완료 후 '완료'")`

결과 확인:
1. `roles` 키 순회  
2. `opinion-{roleKey}.md` 존재 여부로 성공/실패 판단

### Step 2.5: 완료 확인 및 상태 업데이트

`roles` 순회하여 각 파일 존재 및 비어 있음 여부 확인.
- 존재+비어있지 않음: `roles[roleKey].status = "done"`
- 존재하지 않거나 비었음: `roles[roleKey].status = "failed"`

세션 상태를 한 번에 업데이트하고 다음 Step으로 진행.

### Step 2.7: Critic 평가 (Critical Review)

참여자별 의견 파일(`opinion-{roleKey}.md`)을 기반으로 critic이 배정된 `critics`만큼 생성:
- `critics` 키 순회 → `critique-{criticKey}-prompt.md` 생성
- `provider` 필드에 따라 호출 분기
- 각 critic는 자신의 관점에서 허점/엣지/반론을 식별

예시 파일 목록은 roles key 기준으로 동적으로 생성:
- `prompts/critique-{criticKey}-prompt.md`  
- `critique-{criticKey}.md`

### Step 3: PM 종합 (Delegated Synthesis)

의견 파일 목록은 `roles` 키 순회로 동적 생성:
- `opinion-{roleKey}.md` + 관점: `{roles[roleKey].perspective}`
- `critique-{criticKey}.md` 순회

Synthesis prompt는 템플릿 `templates/ideation-synthesis.md` 사용.
세션 정보 또한 고정 인원 표기가 아닌 `roles` 동적 나열 형식으로 구성.

### Step 4: 인터랙티브 토론

1. `synthesis.md` 표시
2. 사용자 질의 반영 토론 진행
3. 내용 append: `discussion.md`
4. `/mst:start` 시 구현 모드 전환

`session.json`의 `status`를 `"discussing"` → 완료 시 `"completed"`로 갱신.

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
│   ├── {roleKey}-prompt.md
│   ├── critique-{criticKey}-prompt.md
│   └── synthesis-prompt.md
├── opinion-{roleKey}.md
├── critique-{criticKey}.md
└── synthesis.md
```

## 예시

```
/mst:ideation "마이크로서비스 vs 모놀리식 아키텍처"
```
