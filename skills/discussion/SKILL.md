---
name: discussion
description: "3 AI(Codex/Gemini/Claude)가 합의에 도달할 때까지 반복 토론합니다. 사용자가 '토론', '합의', '디스커션'을 말하거나 /mst:discussion을 호출할 때 사용. 1회성 의견 수집은 /mst:ideation을 사용."
user-invocable: true
argument-hint: "{주제 또는 IDN-NNN} [--max-rounds {N}] [--focus {분야}]"
---

# maestro:discussion

3개 AI(Codex, Gemini, Claude)가 **합의에 도달할 때까지** 반복 토론합니다.
PM(Claude Opus 4.6)이 사회자 역할로 발산점을 식별하고, 각 AI에게 타 AI의 반론을 전달하여 수렴을 유도합니다.
이 스킬은 모드에 관계없이 사용 가능합니다 (OMC 모드, Maestro 모드 모두).

## ideation과의 차이

| | ideation | discussion |
|---|---|---|
| 목적 | 다양한 관점 수집 (발산) | 합의 도달 (수렴) |
| 라운드 | 1회 | N회 반복 |
| 종료 조건 | PM 종합 완료 | 3자 합의 또는 max rounds |
| 출력 | synthesis.md | consensus.md |

## 실행 프로토콜

### Step 0: 아카이브 체크 (자동)

config.json의 `archive.auto_archive_on_create`가 true이면:
1. `.gran-maestro/discussion/` 하위의 DSC-* 디렉토리 수 확인
2. `archive.max_active_sessions` 초과 시:
   - 완료된(completed/cancelled) 세션만 아카이브 대상
   - 오래된 순 정렬 → 초과분을 `.gran-maestro/archive/`에 tar.gz 압축
   - 원본 디렉토리 삭제
   - `[Archive] discussion {N}개 세션 아카이브됨` 알림
3. 아카이브 완료 후 정상적으로 Step 1 진행

상세 아카이브 로직은 `/mst:archive` 스킬의 "자동 아카이브 프로토콜" 참조.

### Step 1: 초기화

1. `.gran-maestro/discussion/` 디렉토리 존재 확인, 없으면 생성
2. 새 세션 ID 채번 (DSC-NNN):
   - `.gran-maestro/discussion/` 하위의 기존 DSC-* 디렉토리를 스캔
   - 최대 번호를 찾아 +1 (첫 세션이면 DSC-001)
3. `.gran-maestro/discussion/DSC-NNN/` 디렉토리 생성
4. `session.json` 작성:
   ```json
   {
     "id": "DSC-NNN",
     "topic": "{사용자 주제}",
     "source_ideation": "{IDN-NNN 또는 null}",
     "focus": "{focus 옵션 또는 null}",
     "status": "analyzing",
     "max_rounds": "{config.json의 discussion.default_max_rounds 값}",
     "current_round": 0,
     "created_at": "ISO-timestamp",
     "roles": {
       "codex": { "perspective": "", "type": "opinion", "status": "pending" },
       "gemini": { "perspective": "", "type": "opinion", "status": "pending" },
       "claude": { "perspective": "", "type": "opinion", "status": "pending" }
     },
     "critics": {
       "claude": { "status": "pending" }
     },
     "critic_count": 1,
     "rounds": []
   }
   ```

### Step 1.5: PM 역할 배정 (Role Assignment)

PM이 주제와 focus를 분석하여 3개 관점을 동적으로 결정합니다.

1. **주제 분석**: 주제의 도메인, 복잡도, 기술적 깊이를 파악
2. **관점 결정**: 주제에 가장 적합한 3개 관점을 결정
   - 예시: "아키텍처 설계", "사용자 경험 전략", "성능 최적화"
   - 주제 특성에 따라 완전히 다른 관점 조합이 가능
3. **프로바이더 매칭**: 각 프로바이더의 강점을 고려하여 관점을 배정:
   - **Codex**: 코드/구현/아키텍처/시스템 설계 관련 관점에 적합
   - **Gemini**: 넓은 컨텍스트가 필요한 전략/디자인/트렌드/생태계 분석 관점에 적합
   - **Claude**: 깊은 추론이 필요한 분석/설계/평가/리스크 관점에 적합
4. **Critic 수 결정**:
   - **1 critic (Claude)**: 일반적인 주제, 명확한 범위
   - **2 critics (Claude + Codex)**: 복잡하거나 리스크가 높은 주제, 기술+비즈니스 교차 영역
5. `session.json` 업데이트 내용을 준비 (실제 Write는 Step 2 Phase 1에서 프롬프트 파일과 함께 병렬 수행):
   - 각 `roles[provider].perspective`에 배정된 관점명 기록
   - `critics` 필드 업데이트 (2 critic인 경우 codex 추가)
   - `critic_count` 업데이트
   - `status`를 `"initializing"`으로 변경

### AUTO-CONTINUE 원칙 (CRITICAL)

> **이 스킬의 모든 단계는 사용자 입력 없이 자율적으로 진행합니다.**
> - 백그라운드 작업(Codex/Gemini/Claude)이 완료될 때, 사용자에게 "계속할까요?" "진행할까요?" 등을 **절대 묻지 마세요**.
> - 개별 백그라운드 작업 완료 알림에는 간단히 확인만 하고 **모든 작업이 완료될 때까지 대기**하세요.
> - 3개 작업이 모두 완료되면 **즉시 다음 Step으로 진행**하세요. 사용자에게 방향을 묻지 마세요.
> - 라운드 간 계속/중단 결정은 **Step 4d의 합의 판단 기준**에 따라 PM이 자율적으로 판단합니다.
> - 유일한 사용자 상호작용 지점은 **Step 6 (최종 보고)** 뿐입니다.
> - 이 원칙은 ralph/ultrawork 모드가 아니어도 항상 적용됩니다.

### 병렬 Write 원칙 (CRITICAL)

> **독립적인 파일을 작성할 때는 반드시 모든 Write 호출을 하나의 응답에서 동시에 emit하세요.**
> - 파일 내용을 먼저 머릿속에서 전부 구성한 뒤, 모든 Write를 한꺼번에 호출합니다.
> - 파일을 하나씩 Write하면 순차 실행되어 불필요한 지연이 발생합니다.
> - 예: session.json + 3개 프롬프트 = 4개 Write → **반드시 하나의 응답 블록에서 4개 Write를 동시에 호출**
> - 예: 3개 프롬프트만 작성 시 → **반드시 하나의 응답 블록에서 3개 Write를 동시에 호출**
> - 이 원칙은 이 스킬의 모든 Phase 1(파일 작성) 단계에 적용됩니다.

### Step 2: 초기 의견 수집

**입력이 IDN-NNN인 경우** (기존 ideation 참조):
1. `.gran-maestro/ideation/IDN-NNN/` 디렉토리에서 opinion 파일들과 synthesis.md를 읽기
2. 각 AI의 기존 의견을 Round 0으로 복사:
   - `rounds/00/codex.md`, `rounds/00/gemini.md`, `rounds/00/claude.md`
   - `rounds/00/synthesis.md`
3. synthesis.md의 발산점을 기반으로 Step 4(토론 라운드)로 바로 진입

**새 주제인 경우** (ideation 없이 시작):
1. ideation과 동일한 방식으로 3개 AI에 **동시에** 의견을 수집
2. 3개 AI를 한 번에 호출할 수 있도록 다음 두 단계로 수행합니다.

**Phase 1 — session.json + 프롬프트 파일 병렬 작성** (4개 Write를 **반드시 하나의 응답 블록에서 동시에 호출**):
- `Write → .gran-maestro/discussion/DSC-NNN/session.json` (Step 1.5에서 준비한 roles/critics/status 포함)
- `Write → .gran-maestro/discussion/DSC-NNN/rounds/00/prompts/codex-prompt.md`
- `Write → .gran-maestro/discussion/DSC-NNN/rounds/00/prompts/gemini-prompt.md`
- `Write → .gran-maestro/discussion/DSC-NNN/rounds/00/prompts/claude-prompt.md`
- 4개 파일은 서로 독립적이므로 **순차 Write 금지** — 모든 내용을 미리 구성한 뒤 한꺼번에 호출
- 프로바이더별 관점 안내를 각 프롬프트 파일에 포함:
  - Codex: `roles.codex.perspective` 반영
  - Gemini: `roles.gemini.perspective` 반영
  - Claude: `roles.claude.perspective` 반영

**Phase 2 — AI 병렬 호출** (3개 bg 호출을 **하나의 메시지에서 동시에 실행**):
- `/mst:codex --prompt-file .gran-maestro/discussion/DSC-NNN/rounds/00/prompts/codex-prompt.md --output .gran-maestro/discussion/DSC-NNN/rounds/00/codex.md`
- `/mst:gemini --prompt-file .gran-maestro/discussion/DSC-NNN/rounds/00/prompts/gemini-prompt.md --sandbox > .gran-maestro/discussion/DSC-NNN/rounds/00/gemini.md`
- `Task(subagent_type: "general-purpose", model: "opus", run_in_background: true, prompt: ".gran-maestro/discussion/DSC-NNN/rounds/00/prompts/claude-prompt.md 파일을 Read로 읽고 지시에 따라 수행하세요. 결과를 rounds/00/claude.md에 Write하세요. 완료 후 '완료'라고만 답하세요.")`
- 각 호출은 `run_in_background: true`로 병렬 실행
3. 결과를 `rounds/00/` 디렉토리에 저장

> **도구 사용 원칙 (CRITICAL)**: 모든 외부 AI 호출은 반드시 `Skill` 도구를 통해 내부 스킬을 호출합니다.
> - 올바른 호출: `Skill(skill: "mst:codex", args: "...")`, `Skill(skill: "mst:gemini", args: "...")`
> - 금지: OMC MCP 도구(`mcp__*__ask_codex`, `mcp__*__ask_gemini`) 직접 호출, CLI 직접 호출(`codex exec`, `gemini -p`)
> - 3개 호출을 병렬로 실행하려면 Bash `run_in_background: true`와 Task `run_in_background: true`를 사용합니다.

> **토큰 절약 원칙 (Direct File Write + Prompt-File)**:
> 각 AI의 응답을 부모 컨텍스트로 가져온 뒤 파일에 쓰면 동일한 텍스트가 두 번 토큰으로 소비됩니다.
> 대신 각 AI가 **직접 파일에 작성**하도록 하여 부모 컨텍스트에 전체 응답이 유입되지 않게 합니다.
> 또한 **프롬프트도 파일로 먼저 저장**한 뒤 `--prompt-file`로 전달하여 프롬프트 텍스트가 Claude 컨텍스트를 경유하지 않게 합니다.
> - Codex: `--prompt-file rounds/NN/prompts/codex-prompt.md --output rounds/NN/codex.md`로 입출력 모두 파일 경유
> - Gemini: `--prompt-file rounds/NN/prompts/gemini-prompt.md` + 셸 리디렉션(`> rounds/NN/gemini.md`)
> - Claude: 프롬프트를 `rounds/NN/prompts/claude-prompt.md`에 저장 후, Task에는 "파일을 읽고 실행하라"는 최소 지시만 전달

각 AI의 관점 (Step 1.5에서 동적 배정):
- **Codex**: `roles.codex.perspective` (session.json에서 로드)
- **Gemini**: `roles.gemini.perspective` (session.json에서 로드)
- **Claude**: `roles.claude.perspective` (session.json에서 로드)

각 AI에게 "당신의 관점은 **{perspective}**입니다. 이 관점에서만 집중하여 분석하세요." 지침을 포함합니다.

### Step 3: PM 초기 종합 (Delegated Synthesis)

> **토큰 절약 원칙 확장**: 종합 단계를 서브 에이전트에 위임합니다.
> opinion 파일이 메인 컨텍스트에 유입되지 않고, 서브 에이전트가 직접 읽고 synthesis.md를 작성합니다.

**Phase 1 — 종합 프롬프트 파일 작성**:

`Write → .gran-maestro/discussion/DSC-NNN/rounds/00/prompts/synthesis-prompt.md`

프롬프트 파일에 포함할 내용:
```
당신은 PM(Project Manager)으로서 3개 AI의 초기 의견을 종합 분석해야 합니다.

## 입력 파일 (Read 도구로 읽기)
- 의견 1: .gran-maestro/discussion/DSC-NNN/rounds/00/codex.md (관점: {roles.codex.perspective})
- 의견 2: .gran-maestro/discussion/DSC-NNN/rounds/00/gemini.md (관점: {roles.gemini.perspective})
- 의견 3: .gran-maestro/discussion/DSC-NNN/rounds/00/claude.md (관점: {roles.claude.perspective})

## 출력 템플릿 (Read 도구로 읽기)
- 템플릿: templates/discussion-round-synthesis.md

## 세션 정보
- 세션 ID: DSC-NNN
- 주제: {topic}
- 라운드: 0 (초기 의견 수집)
- Codex 관점: {roles.codex.perspective}
- Gemini 관점: {roles.gemini.perspective}
- Claude 관점: {roles.claude.perspective}

## 지시사항
1. 위 의견 파일 3개를 모두 Read 도구로 읽으세요
2. 템플릿 파일을 Read 도구로 읽으세요
3. 템플릿을 참고하여 종합 문서를 작성하세요:
   - 수렴점 추출: 3자 합의 사항
   - 발산점 추출: 의견이 갈리는 논점 목록
   - 각 발산점에 대해 어떤 AI가 어떤 입장인지 정리
4. 결과를 .gran-maestro/discussion/DSC-NNN/rounds/00/synthesis.md에 Write 도구로 저장하세요
5. 완료 후 '완료'라고만 답하세요
```

**Phase 2 — 서브 에이전트 호출**:

```
Task(subagent_type: "general-purpose", model: "opus", run_in_background: true,
     prompt: ".gran-maestro/discussion/DSC-NNN/rounds/00/prompts/synthesis-prompt.md 파일을 Read 도구로 읽고 지시에 따라 종합 분석을 수행하세요. 완료 후 '완료'라고만 답하세요.")
```

**Phase 3 — 결과 확인 + 상태 업데이트**:

1. 서브 에이전트 완료 대기
2. `rounds/00/synthesis.md` 파일 존재 + 비어있지 않음 확인
3. 메인 컨텍스트에서 `rounds/00/synthesis.md`를 Read하여 발산점 수를 파악 (PM이 다음 라운드 진행 여부를 판단하기 위해 필요)
4. `session.json` 업데이트: `status: "debating"`, `current_round: 0`

### Step 4: 토론 라운드 (반복)

발산점이 존재하는 동안 반복합니다. 각 라운드:

#### 4a. PM이 각 AI별 맞춤 프롬프트 작성

PM은 이전 라운드의 synthesis를 기반으로, 각 AI에게 **타 AI의 반론을 전달**합니다.

프롬프트 구조:
```
당신은 이전에 "{주제}"에 대해 다음과 같은 의견을 제시했습니다:
{이전 라운드에서 해당 AI의 의견 요약}

다른 AI들이 다음과 같은 반론을 제시했습니다:

[반론 1 - {AI명}]: {반론 내용}
[반론 2 - {AI명}]: {반론 내용}

위 반론을 고려하여, 당신의 입장을 재검토해주세요.
- 동의하는 부분이 있다면 명시적으로 수용하세요
- 여전히 동의하지 않는 부분은 구체적 근거와 함께 반박하세요
- 새로운 대안이 있다면 제시하세요

응답은 config.json의 `discussion.response_char_limit` 값 이내로 작성하세요.
```

#### 4b. 3개 AI 병렬 호출

> **AUTO-CONTINUE**: 3개 AI 호출이 모두 완료되면 **즉시 Step 4b.5 (Critic 평가)로 진행**하세요. 개별 작업 완료 시 사용자에게 보고하거나 "계속할까요?"라고 묻지 마세요.

라운드 디렉토리 생성: `rounds/NN/`

Codex, Gemini, Claude에게 **동시에** 맞춤 프롬프트를 전달합니다.
Direct File Write + Prompt-File 원칙을 동일하게 적용합니다:

**Phase 1 — 프롬프트 파일 병렬 작성** (3개 Write를 **반드시 하나의 응답 블록에서 동시에 호출 — 순차 Write 금지**):
```
Write → .gran-maestro/discussion/DSC-NNN/rounds/NN/prompts/codex-prompt.md
Write → .gran-maestro/discussion/DSC-NNN/rounds/NN/prompts/gemini-prompt.md
Write → .gran-maestro/discussion/DSC-NNN/rounds/NN/prompts/claude-prompt.md
```
3개 파일의 내용을 미리 구성한 뒤, 하나의 응답에서 3개 Write를 동시에 emit하세요.

**Phase 2 — AI 병렬 호출** (3개 bg 호출을 **하나의 메시지에서 동시에 실행**):
- Codex: `/mst:codex --prompt-file .gran-maestro/discussion/DSC-NNN/rounds/NN/prompts/codex-prompt.md --output .gran-maestro/discussion/DSC-NNN/rounds/NN/codex.md`
- Gemini: `/mst:gemini --prompt-file .gran-maestro/discussion/DSC-NNN/rounds/NN/prompts/gemini-prompt.md --sandbox > .gran-maestro/discussion/DSC-NNN/rounds/NN/gemini.md`
- Claude: `Task(prompt: ".../rounds/NN/prompts/claude-prompt.md 파일을 Read로 읽고 지시에 따라 수행하세요. 결과를 rounds/NN/claude.md에 Write하세요. 완료 후 '완료'라고만 답하세요.")`
- 각 호출은 `run_in_background: true`로 병렬 실행

각 응답은 config.json의 `discussion.response_char_limit` 값 이내로 제한합니다 (라운드가 진행될수록 핵심만 남기도록).

#### 4b.5. Critic 평가

해당 라운드의 3개 의견이 완료된 후, Critic 평가를 실행합니다.

Critic은 해당 라운드의 3개 의견 + 이전 라운드 synthesis를 읽고 비판적 평가를 수행합니다:
- 새로 제시된 논거의 타당성 검증
- 입장 변경의 논리적 일관성 확인
- 여전히 존재하는 논리적 허점 지적
- 라운드 간 진전도 평가

**Claude Critic** (필수):
- 호출 방법 (2단계: Write → Task):
  ```
  Write → .gran-maestro/discussion/DSC-NNN/rounds/NN/prompts/critique-claude-prompt.md
  Task(subagent_type: "general-purpose", model: "opus", run_in_background: true,
       prompt: ".../rounds/NN/prompts/critique-claude-prompt.md 파일을 Read로 읽고 비판적 평가를 수행하세요. 결과를 rounds/NN/critique-claude.md에 Write하세요. 완료 후 '완료'라고만 답하세요.")
  ```
- 프롬프트 파일에 해당 라운드 3개 파일 + 이전 synthesis 경로를 포함
- config.json의 `discussion.critique_char_limit` 값 이내로 제한 (라운드 critique는 간결하게)

**critic_count == 1** (기존 방식 유지):
- `Write → .gran-maestro/discussion/DSC-NNN/rounds/NN/prompts/critique-claude-prompt.md`
- `Task(..., run_in_background: true)` 호출 유지

**Phase 1 — Critic 프롬프트 병렬 작성** (`critic_count == 2`인 경우):
- `Write → .gran-maestro/discussion/DSC-NNN/rounds/NN/prompts/critique-claude-prompt.md`
- `Write → .gran-maestro/discussion/DSC-NNN/rounds/NN/prompts/critique-codex-prompt.md`
- 2개 Critic 프롬프트를 하나의 메시지에서 병렬 작성

**Phase 2 — Critic 병렬 호출** (`critic_count == 2`인 경우):
- `Task(subagent_type: "general-purpose", model: "opus", run_in_background: true, prompt: "...")`
- `/mst:codex --prompt-file .gran-maestro/discussion/DSC-NNN/rounds/NN/prompts/critique-codex-prompt.md --output .gran-maestro/discussion/DSC-NNN/rounds/NN/critique-codex.md` (run_in_background: true)
- 두 호출 모두 한 메시지에서 병렬 실행
- config.json의 `discussion.critique_char_limit` 값 이내로 제한

#### 4c. PM 라운드 종합 (Delegated Synthesis)

> **토큰 절약 원칙 확장**: 라운드 종합도 서브 에이전트에 위임합니다.
> 3개 응답 + critique 파일이 메인 컨텍스트에 유입되지 않고, 서브 에이전트가 직접 읽고 synthesis.md를 작성합니다.

**Phase 1 — 종합 프롬프트 파일 작성**:

`Write → .gran-maestro/discussion/DSC-NNN/rounds/NN/prompts/synthesis-prompt.md`

프롬프트 파일에 포함할 내용:
```
당신은 PM(Project Manager)으로서 토론 라운드 {NN}의 3개 AI 응답을 종합 분석해야 합니다.

## 입력 파일 (Read 도구로 읽기)
- 이전 라운드 종합: .gran-maestro/discussion/DSC-NNN/rounds/{NN-1}/synthesis.md
- 라운드 {NN} 응답:
  - .gran-maestro/discussion/DSC-NNN/rounds/NN/codex.md (관점: {roles.codex.perspective})
  - .gran-maestro/discussion/DSC-NNN/rounds/NN/gemini.md (관점: {roles.gemini.perspective})
  - .gran-maestro/discussion/DSC-NNN/rounds/NN/claude.md (관점: {roles.claude.perspective})
- Critic 평가:
  - .gran-maestro/discussion/DSC-NNN/rounds/NN/critique-claude.md
  - .gran-maestro/discussion/DSC-NNN/rounds/NN/critique-codex.md (해당 시)

## 출력 템플릿 (Read 도구로 읽기)
- 템플릿: templates/discussion-round-synthesis.md

## 지시사항
1. 이전 라운드 synthesis와 이번 라운드 3개 응답 + critique를 모두 Read 도구로 읽으세요
2. 템플릿 파일을 Read 도구로 읽으세요
3. 종합 분석을 수행하세요:
   - 이전 발산점 중 수렴된 것 식별 (AI가 입장을 변경하거나 수용한 경우)
   - 여전히 발산 중인 논점 업데이트
   - 새로 등장한 논점 추가 (있는 경우)
   - Critic 평가의 핵심 지적 사항을 종합에 반영
4. 결과를 .gran-maestro/discussion/DSC-NNN/rounds/NN/synthesis.md에 Write 도구로 저장하세요
5. 완료 후 '완료'라고만 답하세요
```

**Phase 2 — 서브 에이전트 호출**:

```
Task(subagent_type: "general-purpose", model: "opus", run_in_background: true,
     prompt: ".gran-maestro/discussion/DSC-NNN/rounds/NN/prompts/synthesis-prompt.md 파일을 Read 도구로 읽고 지시에 따라 종합 분석을 수행하세요. 완료 후 '완료'라고만 답하세요.")
```

**Phase 3 — 결과 확인**:

1. 서브 에이전트 완료 대기
2. `rounds/NN/synthesis.md` 파일 존재 + 비어있지 않음 확인
3. 메인 컨텍스트에서 `rounds/NN/synthesis.md`를 Read하여 발산점 수와 합의 상태를 파악 (PM이 합의 판단을 위해 필요)

#### 4d. 합의 판단

> **AUTO-CONTINUE**: PM이 아래 기준으로 **자율적으로** 판단합니다. 사용자에게 "계속할까요?" "마무리할까요?"라고 묻지 마세요. 판단 결과에 따라 즉시 다음 라운드 또는 Step 5로 진행하세요.

PM이 아래 기준으로 합의 여부를 판단합니다:

- **완전 합의**: 발산점 0개 → Step 5로 진행
- **실질 합의**: 남은 발산점이 사소하거나 취향 차이 수준 → Step 5로 진행
- **진전 있음**: 발산점이 줄었으나 핵심 논점 남음 → 다음 라운드 진행
- **교착 상태**: 2라운드 연속 동일 발산점, 입장 변화 없음 → Step 5(교착 종료)로 진행
- **최대 라운드 도달**: `max_rounds` 초과 → Step 5(최대 라운드 종료)로 진행

`session.json` 업데이트: `current_round` 증가, `rounds` 배열에 라운드 결과 추가:
```json
{
  "round": 1,
  "divergences_before": 3,
  "divergences_after": 1,
  "status": "progressing"
}
```

### Step 5: 합의 문서 작성 (Delegated Consensus)

> **토큰 절약 원칙 확장**: 합의 문서 작성도 서브 에이전트에 위임합니다.
> 모든 라운드의 synthesis 파일과 의견 파일이 메인 컨텍스트에 유입되지 않고, 서브 에이전트가 직접 읽고 consensus.md를 작성합니다.

**Phase 1 — 합의 프롬프트 파일 작성**:

`Write → .gran-maestro/discussion/DSC-NNN/prompts/consensus-prompt.md`

프롬프트 파일에 포함할 내용:
```
당신은 PM(Project Manager)으로서 토론의 최종 합의 문서를 작성해야 합니다.

## 입력 파일 (Read 도구로 읽기)
- 각 라운드별 synthesis:
  - .gran-maestro/discussion/DSC-NNN/rounds/00/synthesis.md
  - .gran-maestro/discussion/DSC-NNN/rounds/01/synthesis.md
  - ... (존재하는 모든 라운드)
- 각 라운드별 critique (해당 시):
  - .gran-maestro/discussion/DSC-NNN/rounds/NN/critique-claude.md
  - .gran-maestro/discussion/DSC-NNN/rounds/NN/critique-codex.md

## 출력 템플릿 (Read 도구로 읽기)
- 템플릿: templates/discussion-consensus.md

## 세션 정보
- 세션 ID: DSC-NNN
- 주제: {topic}
- 소스: {IDN-NNN 참조 또는 "독립 토론"}
- 총 라운드: {current_round + 1}회
- 종료 사유: {완전 합의 / 실질 합의 / 교착 상태 / 최대 라운드}
- Codex 관점: {roles.codex.perspective}
- Gemini 관점: {roles.gemini.perspective}
- Claude 관점: {roles.claude.perspective}

## 지시사항
1. 모든 라운드의 synthesis 파일과 critique 파일을 Read 도구로 읽으세요
2. 템플릿 파일을 Read 도구로 읽으세요
3. 템플릿의 {플레이스홀더}를 실제 토론 결과로 채워 합의 문서를 작성하세요:
   - 토론 진행 과정을 서술형으로 기술
   - 합의 사항과 미합의 사항을 구분하여 정리
   - Critic 기여를 요약
   - 핵심 결론과 다음 단계를 제시
4. 결과를 .gran-maestro/discussion/DSC-NNN/consensus.md에 Write 도구로 저장하세요
5. 완료 후 '완료'라고만 답하세요
```

**Phase 2 — 서브 에이전트 호출**:

```
Task(subagent_type: "general-purpose", model: "opus", run_in_background: true,
     prompt: ".gran-maestro/discussion/DSC-NNN/prompts/consensus-prompt.md 파일을 Read 도구로 읽고 지시에 따라 합의 문서를 작성하세요. 완료 후 '완료'라고만 답하세요.")
```

**Phase 3 — 결과 확인 + 상태 업데이트**:

1. 서브 에이전트 완료 대기
2. `consensus.md` 파일 존재 + 비어있지 않음 확인
3. `session.json` 업데이트: `status: "completed"`

### Step 5.5: 아카이브 체크 (완료 시, 자동)

config.json의 `archive.auto_archive_on_complete`가 true이면:
1. `.gran-maestro/discussion/` 하위의 DSC-* 디렉토리 수 확인
2. `archive.max_active_sessions` 초과 시:
   - 완료된(completed/cancelled) 세션만 아카이브 대상
   - 오래된 순 정렬 → 초과분을 `.gran-maestro/archive/`에 tar.gz 압축
   - 원본 디렉토리 삭제
   - `[Archive] discussion {N}개 세션 아카이브됨` 알림
3. 아카이브 대상이 없거나 초과하지 않으면 스킵

상세 아카이브 로직은 `/mst:archive` 스킬의 "자동 아카이브 프로토콜" 참조.

### Step 6: 사용자 보고

1. `consensus.md`를 Read 도구로 읽어 사용자에게 표시합니다
   (서브 에이전트가 작성한 파일을 이 시점에서 처음 메인 컨텍스트에 로드합니다)
2. 미합의 사항에 대해 사용자 의견을 구할 수 있음
3. `/mst:start`로 구현 워크플로우 전환 가능

## 에러 처리

| 상황 | 대응 |
|------|------|
| 1개 AI 실패 (특정 라운드) | 경고 표시 + 나머지 2개로 라운드 진행 |
| 1개 AI 연속 2회 실패 | 해당 AI를 토론에서 제외, 2자 토론으로 전환 |
| 2개 이상 AI 실패 | 에러 메시지 출력 + 현재까지 결과 저장 후 종료 |
| CLI 미설치 | 해당 AI 스킵, 사용 가능한 AI로만 진행 |
| 컨텍스트 초과 우려 | 라운드 응답을 config.json의 `discussion.response_char_limit` 값으로 제한하고 Direct File Write로 완화 |

## 옵션

- `--max-rounds {N}`: 최대 라운드 수 (기본: config.json의 `discussion.default_max_rounds` 값, 최대: config.json의 `discussion.max_rounds_upper_limit` 값). 입력값이 최대치를 초과하면 `discussion.max_rounds_upper_limit` 값으로 자동 클램프됩니다.
- `--focus {architecture|ux|performance|security|cost}`: 토론 범위를 특정 분야로 제한

## 세션 파일 구조

```
.gran-maestro/discussion/DSC-NNN/
├── session.json              # 메타데이터
├── prompts/                  # 세션 레벨 프롬프트
│   └── consensus-prompt.md   # 합의 문서 작성 프롬프트
├── rounds/
│   ├── 00/                   # 초기 의견 (또는 ideation에서 복사)
│   │   ├── prompts/          # 입력 프롬프트 보관 (감사 추적)
│   │   │   ├── codex-prompt.md
│   │   │   ├── gemini-prompt.md
│   │   │   ├── claude-prompt.md
│   │   │   └── synthesis-prompt.md   # 종합 위임 프롬프트
│   │   ├── codex.md
│   │   ├── gemini.md
│   │   ├── claude.md
│   │   └── synthesis.md
│   ├── 01/                   # 1차 토론
│   │   ├── prompts/          # 라운드별 맞춤 프롬프트
│   │   │   ├── codex-prompt.md
│   │   │   ├── gemini-prompt.md
│   │   │   ├── claude-prompt.md
│   │   │   ├── critique-claude-prompt.md
│   │   │   ├── critique-codex-prompt.md  # (선택)
│   │   │   └── synthesis-prompt.md       # 종합 위임 프롬프트
│   │   ├── codex.md
│   │   ├── gemini.md
│   │   ├── claude.md
│   │   ├── critique-claude.md   # Critic 평가 (필수)
│   │   ├── critique-codex.md    # Critic 평가 (선택)
│   │   └── synthesis.md
│   └── .../
└── consensus.md              # 최종 합의 문서
```

## 예시

```
/mst:discussion "마이크로서비스 vs 모놀리식 아키텍처"
/mst:discussion IDN-001
/mst:discussion --max-rounds 3 "Redis vs Memcached 캐시 전략"
/mst:discussion --focus security "JWT vs 세션 기반 인증"
/mst:discussion IDN-003 --max-rounds 7
```

## 문제 해결

- `.gran-maestro/discussion/` 디렉토리 생성 실패 → 현재 디렉토리가 git 저장소인지 확인. 쓰기 권한 확인
- "IDN-NNN을 찾을 수 없음" → `.gran-maestro/ideation/` 하위에 해당 세션이 존재하는지 확인
- "합의에 도달하지 못함" → `--max-rounds`를 늘려서 재시도하거나, 미합의 사항을 수용
- "라운드 응답이 비어있음" → 해당 AI CLI가 정상 동작하는지 확인. `/mst:codex --help`, `/mst:gemini --help`
- "교착 상태 반복" → 주제가 본질적으로 트레이드오프인 경우 정상. consensus.md의 PM 권고를 참고
- Codex 호출 실패 → CLI 미설치 시 `npm install -g @openai/codex`
- Gemini 호출 실패 → CLI 미설치 시 `npm install -g @google/gemini-cli`
