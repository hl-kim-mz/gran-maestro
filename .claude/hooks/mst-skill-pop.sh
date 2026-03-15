#!/usr/bin/env bash
set -euo pipefail

# PostToolUse hook — Skill(mst:*) 완료 시 콜스택에서 pop
# stdin: Claude Code PostToolUse JSON (tool_name, tool_input, tool_response 등)

STACK_FILE="/tmp/mst-call-stack.json"
INPUT="$(cat || true)"

# tool_name이 "Skill"인지 확인
TOOL_NAME="$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || true)"
if [ "$TOOL_NAME" != "Skill" ]; then
  exit 0
fi

# tool_input.skill에서 스킬명 추출
SKILL_NAME="$(printf '%s' "$INPUT" | jq -r '.tool_input.skill // empty' 2>/dev/null || true)"
if [ -z "$SKILL_NAME" ]; then
  exit 0
fi

# mst: 접두사가 있는 스킬만 대상
case "$SKILL_NAME" in
  mst:*) ;;
  *) exit 0 ;;
esac

# 스택 파일 없으면 아무것도 하지 않음
if [ ! -f "$STACK_FILE" ]; then
  exit 0
fi

# pop: 마지막 항목 제거 (LIFO)
STACK_LEN="$(jq 'length' "$STACK_FILE" 2>/dev/null || echo 0)"
if [ "$STACK_LEN" -gt 0 ]; then
  jq '.[:-1]' "$STACK_FILE" > "${STACK_FILE}.tmp" && mv "${STACK_FILE}.tmp" "$STACK_FILE"
fi

# PostToolUse는 추가 컨텍스트 없이 종료
exit 0
