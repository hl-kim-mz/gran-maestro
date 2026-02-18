---
name: ideation
description: "3 AI(Codex/Gemini/Claude) 의견을 병렬 수집하고 종합 토론합니다. 사용자가 '아이디어', '브레인스토밍', '의견 수렴'을 말하거나 /mst:ideation을 호출할 때 사용. 구현 전 다각도 분석이 필요할 때 독립적으로 실행."
user-invocable: true
argument-hint: "{주제} [--focus {architecture|ux|performance|security|cost}]"
---

# maestro:ideation

3개 AI(Codex, Gemini, Claude)의 의견을 병렬 수집하고 PM이 종합하여 인터랙티브 토론을 진행합니다.
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
       "codex": { "perspective": "", "type": "opinion", "status": "pending" },
       "gemini": { "perspective": "", "type": "opinion", "status": "pending" },
       "claude": { "perspective": "", "type": "opinion", "status": "pending" }
     },
     "critics": {
       "claude": { "status": "pending" }
     },
     "critic_count": 1
   }
   ```

### Step 1.5: PM 역할 배정 (Role Assignment)

PM이 주제와 focus를 분석하여 3개 관점을 동적으로 결정합니다.

1. **주제 분석**: 주제의 도메인, 복잡도, 기술적 깊이를 파악
2. **관점 결정**: 주제에 가장 적합한 3개 관점을 결정
   - 예시: "아키텍처 설계", "사용자 경험 전략", "성능 최적화"
   - 주제 특성에 따라 완전히 다른 관점 조합이 가능 (예: 비용 분석, 보안 모델링, 팀 역량 등)
3. **프로바이더 매칭**: 각 프로바이더의 강점을 고려하여 관점을 배정:
   - **Codex**: 코드/구현/아키텍처/시스템 설계 관련 관점에 적합
   - **Gemini**: 넓은 컨텍스트가 필요한 전략/디자인/트렌드/생태계 분석 관점에 적합
   - **Claude**: 깊은 추론이 필요한 분석/설계/평가/리스크 관점에 적합
4. **Critic 수 결정**:
   - **1 critic (Claude)**: 일반적인 주제, 명확한 범위
   - **2 critics (Claude + Codex)**: 복잡하거나 리스크가 높은 주제, 기술+비즈니스 교차 영역
5. `session.json` 업데이트:
   - 각 `roles[provider].perspective`에 배정된 관점명 기록
   - `critics` 필드 업데이트 (2 critic인 경우 codex 추가)
   - `critic_count` 업데이트
   - `status`를 `"collecting"`으로 변경

### AUTO-CONTINUE 원칙 (CRITICAL)

> **이 스킬의 Step 1~3은 사용자 입력 없이 자율적으로 진행합니다.**
> - 백그라운드 작업(Codex/Gemini/Claude)이 완료될 때, 사용자에게 "계속할까요?" "진행할까요?" 등을 **절대 묻지 마세요**.
> - 개별 백그라운드 작업 완료 알림에는 간단히 확인만 하고 **모든 작업이 완료될 때까지 대기**하세요.
> - 3개 작업이 모두 완료되면 **즉시 다음 Step으로 진행**하세요 (Step 2 → 2.5 → 2.7 → 3 → 사용자 보고).
> - 사용자 상호작용은 **Step 4 (인터랙티브 토론)** 에서만 발생합니다. 그 전 단계에서는 절대 중단하지 마세요.
> - 이 원칙은 ralph/ultrawork 모드가 아니어도 항상 적용됩니다.

### Step 2: 병렬 의견 수집 (Direct File Write)

3개 AI에 **동시에** 질문합니다. Step 1.5에서 동적으로 배정된 관점에 따라 각 AI에 질문합니다. 각 AI는 `session.json`의 `roles[provider].perspective`에 기록된 관점에서만 분석합니다.
각 의견은 config.json의 `ideation.opinion_char_limit` 값 이내로 제한합니다.

`--focus` 옵션이 지정된 경우, 해당 분야에 집중하도록 프롬프트에 명시합니다.

> **도구 사용 원칙 (CRITICAL)**: 모든 외부 AI 호출은 반드시 `Skill` 도구를 통해 내부 스킬을 호출합니다.
> - 올바른 호출: `Skill(skill: "mst:codex", args: "...")`, `Skill(skill: "mst:gemini", args: "...")`
> - 금지: OMC MCP 도구(`mcp__*__ask_codex`, `mcp__*__ask_gemini`) 직접 호출, CLI 직접 호출(`codex exec`, `gemini -p`)
> - 3개 호출을 병렬로 실행하려면 Bash `run_in_background: true`와 Task `run_in_background: true`를 사용합니다.

> **토큰 절약 원칙 (Direct File Write + Prompt-File)**:
> 각 AI의 응답을 부모 컨텍스트로 가져온 뒤 파일에 쓰면 동일한 텍스트가 두 번 토큰으로 소비됩니다.
> 대신 각 AI가 **직접 파일에 작성**하도록 하여 부모 컨텍스트에 전체 응답이 유입되지 않게 합니다.
> 또한 **프롬프트도 파일로 먼저 저장**한 뒤 `--prompt-file`로 전달하여 프롬프트 텍스트가 Claude 컨텍스트를 경유하지 않게 합니다.
> - Codex: `--prompt-file prompts/codex-prompt.md --output opinion-codex.md`로 입출력 모두 파일 경유
> - Gemini: `--prompt-file prompts/gemini-prompt.md` + 셸 리디렉션(`> opinion-gemini.md`)
> - Claude: 프롬프트를 `prompts/claude-prompt.md`에 저장 후, Task에는 "파일을 읽고 실행하라"는 최소 지시만 전달

**프롬프트 파일 경로 컨벤션:**
```
.gran-maestro/ideation/IDN-NNN/prompts/
├── codex-prompt.md
├── gemini-prompt.md
└── claude-prompt.md
```

**Phase 1 — 프롬프트 파일 병렬 작성** (3개 Write를 **하나의 메시지에서 동시에 호출**):

Write 작업을 다음 3개를 하나의 메시지/차례로 한 번에 수행합니다:
- `Write → .gran-maestro/ideation/IDN-NNN/prompts/codex-prompt.md`
- `Write → .gran-maestro/ideation/IDN-NNN/prompts/gemini-prompt.md`
- `Write → .gran-maestro/ideation/IDN-NNN/prompts/claude-prompt.md`

프로바이더별 프롬프트 내용 지침은 유지:

**Codex (`roles.codex.perspective`, `/mst:codex` + `--prompt-file` + `--output`)**
- "분석만 수행하고 파일을 수정하지 마세요. 마크다운 형식으로 분석 결과를 출력하세요."
- "당신의 관점은 **`roles.codex.perspective`**입니다. 이 관점에서만 집중하여 분석하세요."
- 해당 관점에 맞는 구체적 분석 수행
- "다른 관점(`roles.gemini.perspective`, `roles.claude.perspective`)은 다른 AI가 담당하므로, `roles.codex.perspective`에만 집중할 것"

**Gemini (`roles.gemini.perspective`, `/mst:gemini` + `--prompt-file` + 셸 리디렉션)**
- "당신의 관점은 **`roles.gemini.perspective`**입니다. 이 관점에서만 집중하여 분석하세요."
- 해당 관점에 맞는 구체적 분석 수행
- "다른 관점(`roles.codex.perspective`, `roles.claude.perspective`)은 다른 AI가 담당하므로, `roles.gemini.perspective`에만 집중할 것"

**Claude (`roles.claude.perspective`, Task/subagent_type: `general-purpose`, model: `opus`)**
- "당신의 관점은 **`roles.claude.perspective`**입니다. 이 관점에서만 집중하여 분석하세요."
- 해당 관점에 맞는 구체적 분석 수행
- "다른 관점(`roles.codex.perspective`, `roles.gemini.perspective`)은 다른 AI가 담당하므로, `roles.claude.perspective`에만 집중할 것"

**Phase 2 — AI 병렬 호출** (3개 호출을 **하나의 메시지에서 동시에 bg 실행**):
- `run_in_background: true`로 3개 모두 병렬 호출
- **Codex**: `/mst:codex --prompt-file .gran-maestro/ideation/IDN-NNN/prompts/codex-prompt.md --output .gran-maestro/ideation/IDN-NNN/opinion-codex.md`
- **Gemini**: `/mst:gemini --prompt-file .gran-maestro/ideation/IDN-NNN/prompts/gemini-prompt.md --sandbox > .gran-maestro/ideation/IDN-NNN/opinion-gemini.md`
- **Claude**: `Task(subagent_type: "general-purpose", model: "opus", run_in_background: true, prompt: ".gran-maestro/ideation/IDN-NNN/prompts/claude-prompt.md 파일을 Read 도구로 읽고 지시에 따라 분석하세요. 결과를 .gran-maestro/ideation/IDN-NNN/opinion-claude.md에 Write 도구로 저장하세요. 완료 후 '완료'라고만 답하세요.")`
- 결과 저장/완료 감지:
  - `opinion-codex.md`, `opinion-gemini.md`, `opinion-claude.md`를 각자 확인
  - 백그라운드 작업 완료 시 파일 존재 여부로 판단

### Step 2.5: 완료 확인 및 상태 업데이트

> **AUTO-CONTINUE**: 3개 작업이 모두 완료되면 상태 업데이트 후 **즉시 Step 2.7로 진행**하세요. 사용자에게 보고하거나 방향을 묻지 마세요.

3개 백그라운드 작업이 모두 완료되면:

1. 각 opinion 파일 존재 여부를 확인:
   - `opinion-codex.md` 존재 + 비어있지 않음 → `roles.codex.status = "done"`
   - `opinion-codex.md` 없음 또는 비어있음 → `roles.codex.status = "failed"`
   - (gemini, claude도 동일)
2. `session.json`을 한 번에 업데이트 (race condition 방지)

### Step 2.7: Critic 평가 (Critical Review)

3개 의견 파일이 모두 완료된 후, 별도의 비판적 평가 단계를 실행합니다.
Critic은 모든 의견을 종합적으로 검토하여 의견들 사이의 허점과 리스크를 식별합니다.

**Critic 평가 항목**:
- 숨은 가정과 전제 조건 식별
- 의견들 사이의 논리적 허점 지적
- 엣지 케이스와 실패 시나리오 도출
- 반론(devil's advocate) 제시
- 3개 의견이 공통으로 놓친 관점 식별

각 critique는 config.json의 `ideation.critique_char_limit` 값 이내로 제한합니다.

**critic_count == 1** (기존 방식 유지):
- `Write → .gran-maestro/ideation/IDN-NNN/prompts/critique-claude-prompt.md`
- `Task(..., run_in_background: true)` 호출

**Phase 1 — Critic 프롬프트 병렬 작성** (`critic_count == 2`인 경우):
- `Write → .gran-maestro/ideation/IDN-NNN/prompts/critique-claude-prompt.md`
- `Write → .gran-maestro/ideation/IDN-NNN/prompts/critique-codex-prompt.md`
- 2개 Critic 프롬프트 파일을 하나의 메시지에서 병렬 작성
- 각 프롬프트 파일에 3개 의견 경로를 동일 포함:
  - `.gran-maestro/ideation/IDN-NNN/opinion-codex.md`
  - `.gran-maestro/ideation/IDN-NNN/opinion-gemini.md`
  - `.gran-maestro/ideation/IDN-NNN/opinion-claude.md`
- 프롬프트 내용 요건:
  - "3개 AI 의견을 읽고 비판적 평가를 수행하세요. 숨은 가정, 논리적 허점, 엣지 케이스, 반론을 제시하세요."
  - `critique-codex`는 "/mst:codex --prompt-file ... --output ... run_in_background: true"를 사용한다는 점을 명시

**Phase 2 — Critic 병렬 호출** (`critic_count == 2`인 경우):
- `Task(..., run_in_background: true)`로 Claude 비판 평가 실행
- `/mst:codex --prompt-file .gran-maestro/ideation/IDN-NNN/prompts/critique-codex-prompt.md --output .gran-maestro/ideation/IDN-NNN/critique-codex.md`로 Codex 비판 평가 실행
- 두 호출 모두 같은 메시지에서 병렬 실행

완료 후 `session.json`의 `critics[provider].status`를 `"done"` 또는 `"failed"`로 업데이트하고,
`status`를 `"synthesizing"`으로 변경합니다.

> **AUTO-CONTINUE**: Critic 평가 완료 후 **즉시 Step 3 (PM 종합)으로 진행**하세요. 사용자에게 보고하거나 방향을 묻지 마세요.

### Step 3: PM 종합 (Delegated Synthesis)

> **토큰 절약 원칙 확장**: 의견 수집(Step 2)과 동일하게, 종합 단계도 서브 에이전트에 위임합니다.
> opinion 파일 전체가 메인 컨텍스트에 유입되지 않고, 서브 에이전트가 직접 읽고 synthesis.md를 작성합니다.
> 메인 컨텍스트는 최종 synthesis.md의 Executive Summary만 읽어 사용자에게 보고합니다.

**Phase 1 — 종합 프롬프트 파일 작성**:

`Write → .gran-maestro/ideation/IDN-NNN/prompts/synthesis-prompt.md`

프롬프트 파일에 포함할 내용:
```
당신은 PM(Project Manager)으로서 3개 AI의 의견을 종합 분석해야 합니다.

## 입력 파일 (Read 도구로 읽기)
- 의견 1: .gran-maestro/ideation/IDN-NNN/opinion-codex.md (관점: {roles.codex.perspective})
- 의견 2: .gran-maestro/ideation/IDN-NNN/opinion-gemini.md (관점: {roles.gemini.perspective})
- 의견 3: .gran-maestro/ideation/IDN-NNN/opinion-claude.md (관점: {roles.claude.perspective})
- 비판 평가: .gran-maestro/ideation/IDN-NNN/critique-claude.md
- 비판 평가 (해당 시): .gran-maestro/ideation/IDN-NNN/critique-codex.md

## 출력 템플릿 (Read 도구로 읽기)
- 템플릿: templates/ideation-synthesis.md

## 세션 정보
- 세션 ID: IDN-NNN
- 주제: {topic}
- Codex 관점: {roles.codex.perspective}
- Gemini 관점: {roles.gemini.perspective}
- Claude 관점: {roles.claude.perspective}

## 지시사항
1. 위 의견 파일 3개와 비판 평가 파일을 모두 Read 도구로 읽으세요
2. 템플릿 파일을 Read 도구로 읽으세요
3. 템플릿의 {플레이스홀더}를 실제 분석 결과로 채워 종합 문서를 작성하세요:
   - 수렴점 추출: 3개 AI가 공통으로 동의하는 부분
   - 발산점 추출: 의견이 갈리는 부분과 그 이유
   - 핵심 인사이트 도출: 각 AI의 고유 기여 중 가장 가치 있는 통찰
   - 추천 방향 순위화: 종합 근거에 기반한 우선순위 (트레이드오프 명시)
4. 결과를 .gran-maestro/ideation/IDN-NNN/synthesis.md에 Write 도구로 저장하세요
5. 완료 후 '완료'라고만 답하세요
```

**Phase 2 — 서브 에이전트 호출**:

```
Task(subagent_type: "general-purpose", model: "opus", run_in_background: true,
     prompt: ".gran-maestro/ideation/IDN-NNN/prompts/synthesis-prompt.md 파일을 Read 도구로 읽고 지시에 따라 종합 분석을 수행하세요. 완료 후 '완료'라고만 답하세요.")
```

**Phase 3 — 결과 확인 + 상태 업데이트**:

1. 서브 에이전트 완료 대기
2. `synthesis.md` 파일 존재 + 비어있지 않음 확인
3. `session.json`의 `status`를 `"synthesized"`로 업데이트

### Step 4: 인터랙티브 토론

1. `synthesis.md`를 Read 도구로 읽어 사용자에게 표시합니다
   (서브 에이전트가 작성한 파일을 이 시점에서 처음 메인 컨텍스트에 로드합니다)
2. 사용자와 자유 토론을 진행합니다:
   - 특정 방향에 대한 심층 분석 요청 가능
   - 추가 질문이나 관점 변경 가능
   - 특정 AI의 의견에 대한 반박/확장 가능
3. 토론 내용을 `discussion.md`에 append합니다
4. 사용자가 `/mst:start`를 호출하면 구현 워크플로우로 전환 가능

`session.json`의 `status`를 `"discussing"`으로 업데이트합니다.
토론 종료 시 `"completed"`로 업데이트합니다.

### Step 5: 아카이브 체크 (완료 시, 자동)

config.json의 `archive.auto_archive_on_complete`가 true이면:
1. `.gran-maestro/ideation/` 하위의 IDN-* 디렉토리 수 확인
2. `archive.max_active_sessions` 초과 시:
   - 완료된(completed/cancelled) 세션만 아카이브 대상
   - 오래된 순 정렬 → 초과분을 `.gran-maestro/archive/`에 tar.gz 압축
   - 원본 디렉토리 삭제
   - `[Archive] ideation {N}개 세션 아카이브됨` 알림
3. 아카이브 대상이 없거나 초과하지 않으면 스킵

상세 아카이브 로직은 `/mst:archive` 스킬의 "자동 아카이브 프로토콜" 참조.

## 에러 처리

| 상황 | 대응 |
|------|------|
| 1개 AI 실패 | 경고 표시 + 나머지 2개로 종합 진행 |
| 2개 AI 실패 | 경고 표시 + 1개 의견 + PM 자체 분석으로 보완 |
| 3개 AI 실패 | 에러 메시지 출력 + 재시도 안내 |
| CLI 미설치 | 해당 AI 스킵, 사용 가능한 AI로만 진행 |

## 옵션

- `--focus {architecture|ux|performance|security|cost}`: 분석 범위를 특정 분야로 제한. 지정하지 않으면 전체 범위 분석

## 세션 파일 구조

```
.gran-maestro/ideation/IDN-NNN/
├── session.json          # 메타데이터 (id, topic, focus, status, roles 상태)
├── prompts/              # 입력 프롬프트 보관 (감사 추적)
│   ├── codex-prompt.md           # Codex 의견 수집 프롬프트
│   ├── gemini-prompt.md          # Gemini 의견 수집 프롬프트
│   ├── claude-prompt.md          # Claude 의견 수집 프롬프트
│   ├── critique-claude-prompt.md # Claude Critic 프롬프트
│   ├── critique-codex-prompt.md  # Codex Critic 프롬프트 (선택)
│   └── synthesis-prompt.md       # 종합 위임 프롬프트
├── opinion-codex.md      # Codex 의견 (roles.codex.perspective)
├── opinion-gemini.md     # Gemini 의견 (roles.gemini.perspective)
├── opinion-claude.md     # Claude 의견 (roles.claude.perspective)
├── critique-claude.md    # 비판적 평가 (필수)
├── critique-codex.md     # 비판적 평가 (선택, critic_count == 2)
├── synthesis.md          # PM 종합 결과
└── discussion.md         # 토론 기록 (append-only)
```

## 예시

```
/mst:ideation "마이크로서비스 vs 모놀리식 아키텍처"
/mst:ideation --focus architecture "이벤트 소싱 도입 여부"
/mst:ideation --focus security "OAuth2 vs 자체 인증 시스템"
/mst:ideation "React vs Vue vs Svelte 프론트엔드 프레임워크 선택"
/mst:ideation --focus cost "서버리스 vs 컨테이너 배포 전략"
```

## 문제 해결

- `.gran-maestro/ideation/` 디렉토리 생성 실패 → 현재 디렉토리가 git 저장소인지 확인. 쓰기 권한 확인
- Codex 호출 실패 → `/mst:codex --help`로 스킬 확인. CLI 미설치 시 `npm install -g @openai/codex`
- Gemini 호출 실패 → `/mst:gemini --help`로 스킬 확인. CLI 미설치 시 `npm install -g @google/gemini-cli`
- 기존 세션 ID 충돌 → `.gran-maestro/ideation/` 디렉토리를 확인하고 중복 IDN 폴더가 없는지 검증
- 종합 결과 품질 저하 → `--focus` 옵션으로 분석 범위를 좁혀서 재시도
