---
name: explore
description: "에이전트들이 코드베이스를 백그라운드로 자율 탐색해 원하는 정보를 찾아옵니다. 사용자가 '탐색', '코드 찾아줘', '어디 있어'를 말하거나 /mst:explore를 호출할 때 사용."
user-invocable: true
argument-hint: "{탐색 목표 설명} [--focus {파일패턴}]"
---

# maestro:explore

`/mst:explore`는 디버그처럼 에이전트들이 병렬로 코드베이스를 탐색하고, Claude PM이 종합 리포트를 작성합니다.
이 스킬은 디버그와 동일한 병렬/자동 패턴을 사용하며, 개발자가 추가 지시 없이 백그라운드에서 동작합니다.

## 3. 실행 프로토콜(요약)

### Step 0: 아카이브 체크 (자동)

`config.json`의 `archive.auto_archive_on_create`가 true인 경우:
1. `.gran-maestro/explore/` 하위 `EXP-*` 세션 수 확인
2. `archive.max_active_sessions` 초과 시 완료된 세션을 아카이브 후 계속 진행

### Step 1: 초기화

1. `.gran-maestro/explore/` 디렉토리 확인 및 생성
2. `counter.json` 기반으로 세션 ID를 `EXP-NNN` 형식으로 채번
3. `session.json` 작성

```json
{
  "id": "EXP-NNN",
  "goal": "{사용자 탐색 목표 텍스트}",
  "focus": "{--focus 값 또는 null}",
  "status": "exploring",
  "created_at": "{ISO timestamp}",
  "explorers": {
    "codex": { "role": "", "status": "pending", "provider": "codex" },
    "gemini": { "role": "", "status": "pending", "provider": "gemini" }
  },
  "claude_synthesis": { "status": "pending" },
  "participant_config": { "codex": 1, "gemini": 1, "claude": 0 }
}
```

- `claude`는 `explorers`에서 제외하며, `claude_synthesis`로만 종합을 진행합니다.
- `explorers`는 디버그의 동적 생성 규칙을 동일 적용합니다.

#### 세션 구조

```
.gran-maestro/explore/EXP-NNN/
├── session.json
├── prompts/
│   ├── explore-{key}-prompt.md
│   └── synthesis-prompt.md
├── explore-{key}.md
└── explore-report.md
```

### Step 1.5: PM 역할 배정

Claude가 탐색 목표를 분석해 각 에이전트에 탐색 각도를 배정합니다.
- Codex: 코드 구조/구현 패턴 기반 추적
- Gemini: 아키텍처/흐름/연결 관계 기반 분석

### Step 2: 병렬 백그라운드 탐색

모든 `explorers`를 `Task(subagent_type:"general-purpose", run_in_background:true)`로 동시 실행합니다.

각 프롬프트에는 **"읽기 전용 탐색만 수행, 파일 수정/생성 금지"**를 명시하고, 결과를 `explore-{key}.md`에 작성합니다.

### Step 3: Claude PM 종합

`explore-{key}.md`를 읽어 `explore-report.md`를 작성합니다.
완료 안내:

`plan에서 참조하려면: .gran-maestro/explore/EXP-NNN/explore-report.md`

### Step 4: 사용자 표시

`explore-report.md` 내용을 출력합니다.

## 에러 처리

디버그와 동일 패턴을 따르며, 과반 미완료 시 Claude 결과 기반으로 보완 종합합니다.

