---
name: intent
description: "기능 의도(Intent) 문서를 생성/조회/검색합니다. 사용자가 'intent', '의도 저장', '의도 조회'를 말하거나 /mst:intent를 호출할 때 사용."
user-invocable: true
argument-hint: "{add|get|list|search|lookup|related|rebuild-index ...}"
---

# maestro:intent

기능 의도(INTENT) 레지스트리를 관리합니다.

## 실행 프로토콜

> **경로 규칙 (MANDATORY)**: 이 스킬의 모든 `.gran-maestro/` 경로는 **절대경로**로 사용합니다.
> 스킬 실행 시작 시 `PROJECT_ROOT`를 취득하고, 이후 모든 경로에 `{PROJECT_ROOT}/` 접두사를 붙입니다.
> ```bash
> PROJECT_ROOT=$(pwd)
> ```

**스크립트 우선 실행**: `python3 {PLUGIN_ROOT}/scripts/mst.py intent ...` 를 그대로 호출합니다.

예시:
- 추가: `python3 {PLUGIN_ROOT}/scripts/mst.py intent add --req REQ-001 --feature "기능명" --situation "..." --motivation "..." --goal "..."`
- 조회: `python3 {PLUGIN_ROOT}/scripts/mst.py intent get INTENT-001`
- 목록: `python3 {PLUGIN_ROOT}/scripts/mst.py intent list`
- 검색: `python3 {PLUGIN_ROOT}/scripts/mst.py intent search "키워드"`
- 파일 역조회: `python3 {PLUGIN_ROOT}/scripts/mst.py intent lookup --files src/foo.py`
- 연관 탐색: `python3 {PLUGIN_ROOT}/scripts/mst.py intent related INTENT-001 --depth 2 --json`
- 인덱스 재생성: `python3 {PLUGIN_ROOT}/scripts/mst.py intent rebuild-index`

## 스킬 실행 마커 (MANDATORY)

- 모든 응답의 첫 줄 또는 각 Step 시작 줄에 아래 마커를 출력한다.
- 기본 마커 포맷: `[MST skill={name} step={N}/{M} return_to={parent_skill/step | null}]`
- 필드 규칙:
  - `skill`: 현재 실행 중인 스킬 이름
  - `step`: 현재 단계(`N/M`) 또는 서브스킬 종료 시 `done`
  - `return_to`: 최상위 스킬이면 `null`, 서브스킬이면 `{parent_skill}/{step_number}`
- 서브스킬 종료 마커: `[MST skill={subskill} step=done return_to={parent/step}]`
- C/D 분리 마커 규칙을 추가로 사용하지 않는다. 반드시 단일 MST 마커만 사용한다.

## 문제 해결

- `No module named 'yaml'` 오류: `pip install pyyaml`
- `Intent not found`: `/mst:intent list`로 ID 확인 후 재시도
- 검색 결과 없음: `intent rebuild-index` 실행 후 다시 조회
