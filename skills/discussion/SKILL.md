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
     "max_rounds": 5,
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
5. `session.json` 업데이트:
   - 각 `roles[provider].perspective`에 배정된 관점명 기록
   - `critics` 필드 업데이트 (2 critic인 경우 codex 추가)
   - `critic_count` 업데이트
   - `status`를 `"initializing"`으로 변경

### Step 2: 초기 의견 수집

**입력이 IDN-NNN인 경우** (기존 ideation 참조):
1. `.gran-maestro/ideation/IDN-NNN/` 디렉토리에서 opinion 파일들과 synthesis.md를 읽기
2. 각 AI의 기존 의견을 Round 0으로 복사:
   - `rounds/00/codex.md`, `rounds/00/gemini.md`, `rounds/00/claude.md`
   - `rounds/00/synthesis.md`
3. synthesis.md의 발산점을 기반으로 Step 4(토론 라운드)로 바로 진입

**새 주제인 경우** (ideation 없이 시작):
1. ideation과 동일한 방식으로 3개 AI에 **동시에** 의견을 수집
2. 결과를 `rounds/00/` 디렉토리에 저장

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

### Step 3: PM 초기 종합

Round 0의 3개 의견을 Read 도구로 읽어 종합합니다:

1. **수렴점 추출**: 3자 합의 사항
2. **발산점 추출**: 의견이 갈리는 논점 목록
3. 각 발산점에 대해 어떤 AI가 어떤 입장인지 정리

결과를 `rounds/00/synthesis.md`에 저장합니다. 포맷:

```markdown
# Round 0 Synthesis

## 수렴점
- ...

## 발산점
| # | 논점 | {Provider A} ({perspective A}) | {Provider B} ({perspective B}) | {Provider C} ({perspective C}) |
|---|------|--------------------------------|--------------------------------|--------------------------------|
| 1 | {논점} | {입장 요약} | {입장 요약} | {입장 요약} |
| 2 | ... | ... | ... | ... |

## 합의 상태: 미합의 (발산점 N개)
```

`session.json` 업데이트: `status: "debating"`, `current_round: 0`

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

응답은 500자 이내로 작성하세요.
```

#### 4b. 3개 AI 병렬 호출

라운드 디렉토리 생성: `rounds/NN/`

Codex, Gemini, Claude에게 **동시에** 맞춤 프롬프트를 전달합니다.
Direct File Write + Prompt-File 원칙을 동일하게 적용합니다:

먼저 각 provider별 프롬프트를 `rounds/NN/prompts/` 디렉토리에 Write합니다:
```
Write → .gran-maestro/discussion/DSC-NNN/rounds/NN/prompts/codex-prompt.md
Write → .gran-maestro/discussion/DSC-NNN/rounds/NN/prompts/gemini-prompt.md
Write → .gran-maestro/discussion/DSC-NNN/rounds/NN/prompts/claude-prompt.md
```

그리고 파일 경로만 전달하여 호출합니다:
- Codex: `/mst:codex --prompt-file .gran-maestro/discussion/DSC-NNN/rounds/NN/prompts/codex-prompt.md --output .gran-maestro/discussion/DSC-NNN/rounds/NN/codex.md`
- Gemini: `/mst:gemini --prompt-file .gran-maestro/discussion/DSC-NNN/rounds/NN/prompts/gemini-prompt.md --sandbox > .gran-maestro/discussion/DSC-NNN/rounds/NN/gemini.md`
- Claude: `Task(prompt: ".../rounds/NN/prompts/claude-prompt.md 파일을 Read로 읽고 지시에 따라 수행하세요. 결과를 rounds/NN/claude.md에 Write하세요. 완료 후 '완료'라고만 답하세요.")`

각 응답은 **500자 이내**로 제한합니다 (라운드가 진행될수록 핵심만 남기도록).

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
- 500자 이내 제한 (라운드 critique는 간결하게)

**Codex Critic** (`critic_count == 2`인 경우):
- 호출 방법 (2단계: Write → Skill):
  ```
  Write → .gran-maestro/discussion/DSC-NNN/rounds/NN/prompts/critique-codex-prompt.md
  /mst:codex --prompt-file .gran-maestro/discussion/DSC-NNN/rounds/NN/prompts/critique-codex-prompt.md --output .gran-maestro/discussion/DSC-NNN/rounds/NN/critique-codex.md
  ```
- 500자 이내 제한

#### 4c. PM 라운드 종합

3개 응답을 Read로 읽어 종합합니다:

1. 이전 발산점 중 **수렴된 것** 식별 (AI가 입장을 변경하거나 수용한 경우)
2. **여전히 발산 중인 논점** 업데이트
3. **새로 등장한 논점** 추가 (있는 경우)
4. **Critic 평가 반영**: critique 파일을 Read하고 핵심 지적 사항을 종합에 반영

결과를 `rounds/NN/synthesis.md`에 저장합니다.

#### 4d. 합의 판단

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

### Step 5: 합의 문서 작성

토론 종료 후, PM이 최종 합의 문서를 작성합니다.

`consensus.md` 포맷:

```markdown
# Discussion Consensus — DSC-NNN

## 주제
{주제}

## Executive Summary
{5~7문장으로 토론의 전체 흐름과 결론을 요약. 초기 발산점이 무엇이었고, 어떤 과정을 거쳐 합의에 도달했으며(또는 교착되었으며), 최종 결론이 무엇인지를 한눈에 파악할 수 있도록 서술}

---

## 토론 개요

| 항목 | 내용 |
|------|------|
| 총 라운드 | {N}회 |
| 종료 사유 | {완전 합의 / 실질 합의 / 교착 상태 / 최대 라운드} |
| 초기 발산점 | {N}개 |
| 최종 발산점 | {M}개 |
| 합의 도달률 | {(N-M)/N * 100}% |
| 참여 AI | Codex ({perspective}), Gemini ({perspective}), Claude ({perspective}) |
| 소스 | {IDN-NNN 참조 또는 "독립 토론"} |

## 토론 진행 과정 (Narrative)

{토론이 어떻게 전개되었는지를 서술형으로 기술합니다. 단순 통계가 아닌, 각 라운드에서 어떤 논점이 핵심이었고, 어떤 AI가 입장을 변경했으며, 어떤 논거가 결정적이었는지를 스토리 형태로 3~5문단 서술}

### 주요 전환점
- **Round {N}**: {어떤 논거가 제시되어 흐름이 바뀌었는지}
- **Round {M}**: {어떤 양보/수렴이 발생했는지}

---

## 합의 사항

토론을 통해 3개 AI가 합의에 도달한 사항입니다.

### 1. {합의 사항 제목}
- **합의 내용**: {합의된 구체적 내용을 2~3문장으로 상세 서술}
- **합의 근거**: {3개 AI가 공통으로 인정한 논거와 증거}
- **합의 과정**: {처음부터 합의였는지, 토론을 통해 수렴했는지. 수렴 시 어떤 AI가 입장을 변경했고 그 이유는 무엇이었는지}
- **구현 시 필요한 것**: {이 합의를 실현하려면 구체적으로 무엇을 만들거나 변경해야 하는지 — PM이 스펙 작성 시 직접 참조}
- **실행 시 유의사항**: {이 합의를 실행에 옮길 때 주의해야 할 점}

### 2. {합의 사항 제목}
- **합의 내용**: {상세 서술}
- **합의 근거**: {공통 논거}
- **합의 과정**: {수렴 과정 서술}
- **실행 시 유의사항**: {유의점}

(합의 사항 수만큼 반복)

---

## 미합의 사항 (있는 경우)

토론을 거쳤으나 합의에 이르지 못한 논점입니다.

### 1. {미합의 논점 제목}

| {Provider} ({perspective}) | 최종 입장 | 핵심 근거 |
|---------------------------|----------|----------|
| Codex ({perspective}) | {입장 요약} | {주요 논거 2~3줄} |
| Gemini ({perspective}) | {입장 요약} | {주요 논거 2~3줄} |
| Claude ({perspective}) | {입장 요약} | {주요 논거 2~3줄} |

- **미합의 원인 분석**: {왜 합의에 이르지 못했는지 — 전제 차이, 가치관 차이, 정보 부족, 본질적 트레이드오프 등}
- **각 입장의 장단점 비교**:
  - {입장 A}: 장점 — {…}, 단점 — {…}
  - {입장 B}: 장점 — {…}, 단점 — {…}
- **PM 최종 권고**: {PM이 종합적으로 판단한 추천 방향과 그 근거를 3~5문장으로 상세 서술. 어떤 조건에서 어떤 선택이 적합한지 조건부 권고 포함}

(미합의 사항 수만큼 반복)

---

## Critic 기여 요약

각 라운드의 Critic 평가는 토론의 질을 높이는 데 기여했으며, 특히 다음 지적 사항들이 합의 형성에 결정적이었습니다:

- {Round N — Critic명}: {핵심 지적 사항과 그 영향}
- {Round M — Critic명}: {핵심 지적 사항과 그 영향}

---

## Hard Constraints (구현 시 절대 위반 불가)

토론 과정에서 3개 AI가 공통으로 경고하거나, 합의를 통해 확정된 금기사항/기술적 제약을 명시합니다.

- {예: "사용자 데이터는 반드시 암호화 저장", "동기 블로킹 호출 금지" 등}
- {해당 사항이 없으면 이 섹션 생략}

---

## 핵심 결론

### 종합 판단
{PM이 토론 전체를 종합한 최종 결론. 합의 사항의 의미, 미합의 사항에 대한 판단 근거, 전체적인 추천 방향을 5~7문장으로 상세 서술. 단순 나열이 아닌 논리적 흐름으로 구성}

### 핵심 교훈 (Key Takeaways)
1. **{교훈 1}**: {토론에서 드러난 중요한 인사이트와 그 시사점}
2. **{교훈 2}**: {토론에서 드러난 중요한 인사이트와 그 시사점}
3. **{교훈 3}**: {토론에서 드러난 중요한 인사이트와 그 시사점}

### 의사결정 가이드
{사용자가 최종 의사결정을 내릴 때 참고할 수 있는 가이드라인. 어떤 조건에서 어떤 선택이 최적인지, 고려해야 할 트레이드오프는 무엇인지를 조건부로 정리}

- **{조건 A}인 경우**: → {권고 방향} (근거: {…})
- **{조건 B}인 경우**: → {권고 방향} (근거: {…})
- **{조건 C}인 경우**: → {권고 방향} (근거: {…})

---

## 제안하는 다음 단계

1. **즉시 실행**: {합의 사항 기반으로 바로 착수할 수 있는 액션}
2. **추가 검토 필요**: {미합의 사항 중 추가 조사나 PoC가 필요한 항목}
3. **장기 고려**: {현재 결정하지 않아도 되지만 향후 재검토할 사항}

---

## 라운드별 진행 기록

| Round | 발산점 수 | 수렴된 논점 | 새 논점 | 주요 변화 상세 |
|-------|----------|-----------|--------|--------------|
| 0 | {N} | — | — | 초기 의견 수집. {초기 주요 쟁점 요약} |
| 1 | {N-x} | {수렴된 논점명} | {새 논점명 또는 없음} | {어떤 AI가 어떤 입장을 변경했고, 결정적 논거가 무엇이었는지} |
| 2 | ... | ... | ... | ... |
| ... | ... | ... | ... | ... |
```

`session.json` 업데이트: `status: "completed"`

### Step 6: 사용자 보고

1. 합의 문서 요약을 사용자에게 표시
2. 미합의 사항에 대해 사용자 의견을 구할 수 있음
3. `/mst:start`로 구현 워크플로우 전환 가능

## 에러 처리

| 상황 | 대응 |
|------|------|
| 1개 AI 실패 (특정 라운드) | 경고 표시 + 나머지 2개로 라운드 진행 |
| 1개 AI 연속 2회 실패 | 해당 AI를 토론에서 제외, 2자 토론으로 전환 |
| 2개 이상 AI 실패 | 에러 메시지 출력 + 현재까지 결과 저장 후 종료 |
| CLI 미설치 | 해당 AI 스킵, 사용 가능한 AI로만 진행 |
| 컨텍스트 초과 우려 | 라운드 응답 500자 제한 + Direct File Write로 완화 |

## 옵션

- `--max-rounds {N}`: 최대 라운드 수 (기본: 5, 최대: 10)
- `--focus {architecture|ux|performance|security|cost}`: 토론 범위를 특정 분야로 제한

## 세션 파일 구조

```
.gran-maestro/discussion/DSC-NNN/
├── session.json              # 메타데이터
├── rounds/
│   ├── 00/                   # 초기 의견 (또는 ideation에서 복사)
│   │   ├── prompts/          # 입력 프롬프트 보관 (감사 추적)
│   │   │   ├── codex-prompt.md
│   │   │   ├── gemini-prompt.md
│   │   │   └── claude-prompt.md
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
│   │   │   └── critique-codex-prompt.md  # (선택)
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
