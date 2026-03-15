#!/usr/bin/env bash
set -euo pipefail

# PreToolUse hook — Skill(mst:*) 호출 시 콜스택에 push
# stdin: Claude Code PreToolUse JSON (tool_name, tool_input 등)

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

# 스택 파일 초기화 (없으면)
if [ ! -f "$STACK_FILE" ]; then
  printf '[]' > "$STACK_FILE"
fi

# push: 스킬명 + 타임스탬프
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%FT%TZ)"
jq --arg skill "$SKILL_NAME" --arg ts "$TIMESTAMP" \
  '. + [{"skill": $skill, "pushed_at": $ts}]' \
  "$STACK_FILE" > "${STACK_FILE}.tmp" && mv "${STACK_FILE}.tmp" "$STACK_FILE"

# PreToolUse는 allow 반환 (실행을 차단하지 않음)
exit 0
