---
name: list
description: "모든 요청 및 태스크의 현황 목록을 표시합니다. 사용자가 '현황', '상태 보여줘', '목록'을 말하거나 /mst:list를 호출할 때 사용. 특정 요청의 상세 상태는 /mst:inspect를 사용."
user-invocable: true
argument-hint: "[--all | --active | --completed]"
---

# maestro:list

모든 Gran Maestro 요청과 태스크의 현황을 터미널에 표시합니다.

## 실행 프로토콜

**스크립트 우선 실행**: `python3 {PLUGIN_ROOT}/scripts/mst.py request list --active` 실행. 성공(exit 0)이면 출력 그대로 사용. 실패 시 아래 fallback으로 진행.

**Fallback (python3 미설치 또는 오류 시):**
1. `.gran-maestro/requests/` 디렉토리 스캔
2. 각 `request.json` 읽기
3. 상태별 분류 및 포맷팅

## 출력 형식

```
Gran Maestro — 요청 현황
═══════════════════════════════════════

REQ-001  "사용자 인증 기능 추가"
  Phase: 2 (외주 실행)  |  Tasks: 3  |  진행: 1/3
  ├── 01: [codex] 실행 중 — JWT 미들웨어 구현
  ├── 02: [gemini] 대기 — 로그인 UI 구현
  └── 03: [codex] 완료 — 유저 모델 테스트

REQ-002  "로그인 페이지 디자인"
  Phase: 1 (PM 분석)  |  blockedBy: REQ-001-02
  └── 스펙 작성 중...

═══════════════════════════════════════
활성: 2  |  완료: 0  |  전체: 2
```

## 옵션

- `--all`: 완료된 요청 포함 전체 목록
- `--active`: 활성 요청만 (기본값)
- `--completed`: 완료된 요청만

## 문제 해결

- `.gran-maestro/requests/` 디렉토리 없음 → Maestro 모드가 활성화되지 않았습니다. `/mst:on`으로 활성화하거나 `/mst:request`로 첫 요청을 시작하세요
- 빈 목록 표시 → `--all` 옵션으로 완료/취소된 요청 포함 여부 확인
