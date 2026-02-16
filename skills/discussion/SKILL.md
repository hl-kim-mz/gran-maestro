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
     "status": "initializing",
     "max_rounds": 5,
     "current_round": 0,
     "created_at": "ISO-timestamp",
     "rounds": []
   }
   ```

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

> **토큰 절약 원칙 (Direct File Write)**:
> 각 AI의 응답을 부모 컨텍스트로 가져온 뒤 파일에 쓰면 동일한 텍스트가 두 번 토큰으로 소비됩니다.
> 대신 각 AI가 **직접 파일에 작성**하도록 하여 부모 컨텍스트에 전체 응답이 유입되지 않게 합니다.
> - Codex: `--output rounds/NN/codex.md`로 직접 파일 저장
> - Gemini: 셸 리디렉션(`> rounds/NN/gemini.md`)으로 직접 파일 저장
> - Claude: Task 에이전트에게 Write 도구로 직접 파일 작성을 지시

각 AI의 관점 (ideation과 동일):
- **Codex**: 기술 실현성 분석
- **Gemini**: 전략/창의 분석
- **Claude**: 비판적 평가

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
| # | 논점 | Codex | Gemini | Claude |
|---|------|-------|--------|--------|
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
Direct File Write 원칙을 동일하게 적용합니다:
- Codex: `/mst:codex "{prompt}" --output .gran-maestro/discussion/DSC-NNN/rounds/NN/codex.md`
- Gemini: `/mst:gemini "{prompt}" --sandbox > .gran-maestro/discussion/DSC-NNN/rounds/NN/gemini.md`
- Claude: Task 에이전트가 Write 도구로 `rounds/NN/claude.md`에 직접 작성

각 응답은 **500자 이내**로 제한합니다 (라운드가 진행될수록 핵심만 남기도록).

#### 4c. PM 라운드 종합

3개 응답을 Read로 읽어 종합합니다:

1. 이전 발산점 중 **수렴된 것** 식별 (AI가 입장을 변경하거나 수용한 경우)
2. **여전히 발산 중인 논점** 업데이트
3. **새로 등장한 논점** 추가 (있는 경우)

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

## 토론 요약
- 총 라운드: {N}
- 종료 사유: {완전 합의 | 실질 합의 | 교착 상태 | 최대 라운드}
- 초기 발산점: {N}개 → 최종: {M}개

## 합의 사항
1. **{합의 1}**: {3자 합의 내용 및 근거}
2. **{합의 2}**: ...

## 미합의 사항 (있는 경우)
| 논점 | Codex | Gemini | Claude | PM 권고 |
|------|-------|--------|--------|---------|
| ... | ... | ... | ... | {PM의 최종 권고} |

## 핵심 결론
{PM이 토론 전체를 종합한 최종 결론 및 추천 방향}

## 라운드별 진행 기록
| Round | 발산점 수 | 주요 변화 |
|-------|----------|----------|
| 0 | {N} | 초기 의견 수집 |
| 1 | {N-x} | {요약} |
| ... | ... | ... |
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
│   │   ├── codex.md
│   │   ├── gemini.md
│   │   ├── claude.md
│   │   └── synthesis.md
│   ├── 01/                   # 1차 토론
│   │   ├── codex.md
│   │   ├── gemini.md
│   │   ├── claude.md
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
