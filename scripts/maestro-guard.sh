#!/bin/bash
# maestro-guard.sh — Blocks OMC MCP direct calls and blacklisted Task subagents when Maestro mode is active.
# PreToolUse hook: exit 0 = pass, exit 2 = block with message.

INPUT=$(cat)
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Walk up from CWD to find .gran-maestro/mode.json
MODE_FILE=""
DIR="$CWD"
while [ "$DIR" != "/" ] && [ -n "$DIR" ]; do
  if [ -f "$DIR/.gran-maestro/mode.json" ]; then
    MODE_FILE="$DIR/.gran-maestro/mode.json"
    break
  fi
  DIR=$(dirname "$DIR")
done

[ -z "$MODE_FILE" ] && exit 0

ACTIVE=$(jq -r '.active // false' "$MODE_FILE" 2>/dev/null)
[ "$ACTIVE" != "true" ] && exit 0

# Handle Task subagent-based guard first.
if [ "$TOOL_NAME" = "Task" ]; then
  SUBAGENT_TYPE=$(echo "$INPUT" | jq -r '.tool_input.subagent_type // empty')
  [ -z "$SUBAGENT_TYPE" ] && exit 0

  case "$SUBAGENT_TYPE" in
    oh-my-claudecode:executor|oh-my-claudecode:deep-executor|oh-my-claudecode:verifier|oh-my-claudecode:build-fixer)
      echo "BLOCKED: Maestro 모드 활성 상태. 금지된 OMC 서브에이전트 호출입니다. subagent_type=\"$SUBAGENT_TYPE\""
      exit 2
      ;;
  esac

  exit 0
fi

# Determine correct skill name
SKILL="mst:codex"
echo "$TOOL_NAME" | grep -q "gemini" && SKILL="mst:gemini"

echo "BLOCKED: Maestro 모드 활성 상태. OMC MCP 직접 호출 금지. Skill(skill: \"$SKILL\", args: \"...\")를 사용하세요."
exit 2
