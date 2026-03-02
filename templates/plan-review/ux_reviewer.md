# Plan Review — UX Reviewer

- Plan ID: {{PLN_ID}}

## 리뷰 관점

사용자 경험 일관성을 검토하라. UI 흐름의 모호함, 누락된 인터랙션, 접근성, 기존 시스템과의 UX 불일치를 찾아라. UI 관련 플랜이 아닌 경우 NO_ISSUES 반환 가능.

## 플랜 초안

{{PLAN_DRAFT}}

## Q&A 컨텍스트

{{QA_SUMMARY}}

## 출력 형식

이슈가 없으면 첫 줄에 "NO_ISSUES"만 반환.

이슈가 있으면 아래 형식으로 반환:

CRITICAL: {제목} — {설명} (사용자에게 반드시 질문 필요)
MAJOR: {제목} — {설명} (PM이 판단 필요)
MINOR: {제목} — {설명} (PM이 자체 처리 가능)

각 항목은 한 줄, 최대 10개.
