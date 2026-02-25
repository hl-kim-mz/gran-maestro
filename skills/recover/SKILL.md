---
name: recover
description: "미완료 요청을 복구하고 마지막 Phase부터 재개합니다. 사용자가 '복구', '재개', '이어서', '계속해줘'를 말하거나 /mst:recover를 호출할 때 사용. 새 요청 시작에는 /mst:request를 사용."
user-invocable: true
argument-hint: "[{REQ-ID}] [{TASK-ID}]"
---

# maestro:resume

Claude Code 세션 종료 후 진행 중이던 워크플로우를 복구합니다.
파일 기반 상태에서 자동으로 복구 가능한 태스크를 탐색합니다.

## 실행 프로토콜

### 인자 없이 호출 시 (`/mst:recover`)

1. `.gran-maestro/requests/` 디렉토리 전체 스캔
2. 각 요청의 `request.json` 읽기
3. terminal 상태가 아닌 요청 탐색 (completed, cancelled, failed 제외)
4. 각 태스크의 `status.json` 확인
5. 복구 가능한 태스크 목록을 사용자에게 표시
6. 사용자가 선택하면 해당 Phase부터 재개

### 특정 요청 복구 (`/mst:recover REQ-001`)

1. `.gran-maestro/requests/REQ-001/request.json` 읽기
2. 모든 태스크의 상태 확인
3. 마지막 활성 Phase 판별
4. 해당 Phase부터 재개

### 특정 태스크 복구 (`/mst:recover REQ-001-01`)

1. `.gran-maestro/requests/REQ-001/tasks/01/status.json` 읽기
2. 해당 태스크의 `spec.md`에서 `Assigned Agent` 필드 확인 (codex | gemini)
3. 태스크 상태에 따른 복구 판단:
   - `executing` → CLI 프로세스 확인 → 살아있으면 모니터링, 없으면 **외주 재실행**
   - `review` → 리뷰 재개 (git diff 재확인, PM Conductor `phase3_protocol`)
   - `feedback` → 피드백 문서 기반 **외주 재실행**
   - `merging` → merge 상태 확인 후 재개
   - `queued` / `pending` → **외주 실행**
   - `pre_check` → 사전 검증 재실행
   - `pre_check_failed` → 실패 내용 포함하여 **외주 재실행**
4. 사용자 확인 후 실행

### 외주 실행/재실행 프로토콜

복구 시 Phase 2에 해당하는 상태(`pending`, `queued`, `executing`, `pre_check_failed`, `feedback`)는 **반드시 `/mst:codex` 또는 `/mst:gemini`를 통해 외주**합니다. Claude(PM)가 직접 코드를 작성하지 않습니다.

1. spec.md의 `Assigned Agent` 필드로 에이전트 결정 (`agents.json` capabilities 참조):
   - `codex` → `/mst:codex` (code, refactor, test)
   - `gemini` → `/mst:gemini` (frontend, docs, large-context)
2. Worktree 존재 확인:
   - 존재하면 기존 worktree에서 이어서 실행
   - 없으면 새로 생성
3. 외주 실행:
   ```
   # codex-dev인 경우
   Skill(skill: "mst:codex", args: "{프롬프트} --dir {worktree_path} --trace {REQ-ID}/{TASK-NUM}/phase2-impl")

   # gemini-dev인 경우
   Skill(skill: "mst:gemini", args: "{프롬프트} --files {worktree_path}/**/* --trace {REQ-ID}/{TASK-NUM}/phase2-impl")
   ```
4. `feedback` 상태에서 복구하는 경우: feedback-RN.md의 수정 요청을 프롬프트에 포함
5. 실행 완료 후 사전 검증 (테스트 + 타입 체크) → Phase 3 전환

## 복구 판단 매트릭스

| 마지막 상태 | 복구 동작 | Phase |
|------------|----------|-------|
| `pending` | 실행 큐에 삽입 | Phase 2 |
| `queued` | 큐에 재삽입 | Phase 2 |
| `executing` | 프로세스 확인 → 재실행 | Phase 2 |
| `pre_check` | 사전 검증 재실행 | Phase 2 |
| `pre_check_failed` | 피드백 첨부 재실행 | Phase 2 |
| `review` | 리뷰 재개 | Phase 3 |
| `feedback` | 피드백 기반 재실행 | Phase 4→2 |
| `merging` | merge 상태 확인 | Phase 5 |
| `merge_conflict` | 사용자에게 옵션 제시 | Phase 5 |

## 출력 형식 (목록)

```
Gran Maestro — 복구 가능한 요청
═══════════════════════════════════════

REQ-001  "사용자 인증 기능 추가"
  마지막 Phase: 2 (외주 실행)
  복구 가능 태스크:
  ├── 01: executing → 재실행 필요 (프로세스 없음)
  └── 02: pending → 큐에 삽입

REQ-003  "설정 페이지 리팩토링"
  마지막 Phase: 3 (PM 리뷰)
  복구 가능 태스크:
  └── 01: review → 리뷰 재개

═══════════════════════════════════════
복구할 요청 ID를 입력하세요 (전체: all):
```

## 예시

```
/mst:recover              # 모든 미완료 요청 복구 목록
/mst:recover REQ-001      # 특정 요청 복구
/mst:recover REQ-001-01   # 특정 태스크 복구
```

## 문제 해결

- "복구 가능한 요청이 없음" → 모든 요청이 완료/취소 상태입니다. `/mst:list --all`로 전체 목록 확인
- "REQ-ID를 찾을 수 없음" → ID 형식이 `REQ-NNN`인지 확인. `/mst:list`로 요청 목록 조회
- "worktree 상태 불일치" → `git worktree list`로 실제 worktree 상태 확인. 수동 정리가 필요할 수 있음
- "프로세스를 찾을 수 없음" (executing 상태) → CLI 프로세스가 종료된 상태. 자동으로 재실행됨
