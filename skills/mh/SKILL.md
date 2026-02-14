---
name: maestro:history
description: "완료된 요청의 이력을 조회합니다"
user-invocable: true
argument-hint: "[<REQ-ID>] [--limit <N>]"
aliases: ["mh"]
---

# maestro:history

완료된 Gran Maestro 요청의 이력을 조회합니다.
요청별 요약, 소요 시간, 에이전트 사용량, 피드백 라운드 수 등을 확인할 수 있습니다.

## 실행 프로토콜

1. `.gran-maestro/requests/` 스캔
2. `status: completed` 또는 `status: cancelled`인 요청 필터링
3. 특정 REQ ID 지정 시 상세 이력, 미지정 시 요약 목록

## 출력 형식 (목록)

```
Gran Maestro — 완료 이력
═══════════════════════════════════════

REQ-001  "사용자 인증 기능 추가"
  완료: 2026-02-14 14:30  |  소요: 4h 30m
  Tasks: 3  |  Feedback: 1회  |  Agent: codex x2, gemini x1

REQ-003  "설정 페이지 리팩토링"
  완료: 2026-02-13 17:00  |  소요: 1h 15m
  Tasks: 1  |  Feedback: 0회  |  Agent: codex x1
```

## 출력 형식 (상세)

```
/mh REQ-001

Gran Maestro — REQ-001 이력
═══════════════════════════════════════

Phase 1: PM 분석 (45m)
  - Analysis Squad: Explorer x2 + Analyst + Architect
  - 스펙: 3개 태스크, 8개 수락조건

Phase 2: 외주 실행 (2h 15m)
  - REQ-001-01: codex (38m) — JWT 미들웨어
  - REQ-001-02: gemini (1h 20m) — 로그인 UI
  - REQ-001-03: codex (38s) — 유저 모델 테스트

Phase 3: PM 리뷰 (30m)
  - Review Squad: Security + Quality + Verifier
  - 결과: PARTIAL (AC-2 미충족)

Phase 4: 피드백 1회 (45m)
  - 이슈: JWT 만료 처리 누락
  - 재실행: codex → 수정 완료

Phase 5: 수락 완료
  - Squash merge → main
  - 변경: +342 / -28 lines, 5 files
```

## 옵션

- `--limit <N>`: 최근 N개만 표시 (기본: 10)

## 예시

```
/mh              # 전체 완료 이력
/mh REQ-001      # 특정 요청 상세 이력
/mh --limit 5    # 최근 5개
```
