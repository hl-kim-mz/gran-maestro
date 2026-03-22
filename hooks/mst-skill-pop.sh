#!/usr/bin/env bash
set -euo pipefail

# PostToolUse hook — Skill(mst:*) 완료 시 콜스택에서 pop
# stdin: Claude Code PostToolUse JSON (tool_name, tool_input, tool_response 등)

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MST_TMP="${PROJECT_ROOT}/.gran-maestro/tmp"
mkdir -p "$MST_TMP"

STACK_FILE="${MST_TMP}/mst-call-stack-${PPID}.json"
TRANSCRIPT_BRIDGE_FILE="${MST_TMP}/mst-transcript-${PPID}.path"
PENDING_FILE="${MST_TMP}/mst-pending-continuation-${PPID}"
DEBUG_LOG_FILE="${MST_TMP}/mst-hook-debug-${PPID}.log"
INPUT="$(cat || true)"

debug_log() {
  [ "${MST_DEBUG:-0}" = "1" ] || return 0
  local event="${1:-event}"
  shift || true
  local detail="${*:-}"
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%FT%TZ)"
  printf '%s event=%s %s\n' "$ts" "$event" "$detail" >> "$DEBUG_LOG_FILE" 2>/dev/null || true
}

read_stack_length() {
  local file="$1"
  local length
  length="$(python3 -c 'import json, sys
path = sys.argv[1]
try:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
except Exception:
    data = []
if not isinstance(data, list):
    data = []
print(len(data))
' "$file" 2>/dev/null || true)"
  if [[ "$length" =~ ^[0-9]+$ ]]; then
    printf '%s' "$length"
  else
    printf '0'
  fi
}

read_transcript_path_from_bridge() {
  local bridge_file="$1"
  [ -f "$bridge_file" ] || return 1

  local transcript_path
  transcript_path="$(python3 -c 'import sys
path = sys.argv[1]
value = ""
try:
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        value = (f.readline() or "").strip()
except Exception:
    value = ""
if value:
    print(value)
' "$bridge_file" 2>/dev/null || true)"

  [ -n "$transcript_path" ] || return 1
  printf '%s' "$transcript_path"
}

read_parent_from_transcript() {
  local transcript_path="$1"
  local completed_skill="$2"
  [ -n "$transcript_path" ] || return 1

  python3 -c 'import json, os, re, sys

path = sys.argv[1]
completed_skill = (sys.argv[2] if len(sys.argv) > 2 else "").split("\n", 1)[0].strip()
MAX_TAIL_BYTES = 512 * 1024
SKILL_TOOL_NAMES = {"Skill", "proxy_Skill"}

if not path or not os.path.isfile(path):
    sys.exit(1)

try:
    file_size = os.path.getsize(path)
except Exception:
    sys.exit(1)

try:
    if file_size > MAX_TAIL_BYTES:
        start_offset = max(0, file_size - MAX_TAIL_BYTES)
        with open(path, "rb") as f:
            f.seek(start_offset)
            raw = f.read()
        text = raw.decode("utf-8", errors="ignore")
        lines = text.splitlines()
        if start_offset > 0 and lines:
            lines = lines[1:]
    else:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.read().splitlines()
except Exception:
    sys.exit(1)

stack = []

def normalize_skill(value):
    if not isinstance(value, str):
        return ""
    return value.split("\n", 1)[0].strip()

def extract_return_step(args):
    if not isinstance(args, str):
        return ""
    match = re.search(r"--trace\\s+\"?([^\"]+)", args)
    if not match:
        match = re.search(r"--trace\\s+(\\S+)", args)
    if match:
        return match.group(1).strip()
    match = re.search(r"(Step\\s+\\d+[^,;]*)", args, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return ""

for line in lines:
    if not line.strip():
        continue
    try:
        entry = json.loads(line)
    except Exception:
        continue
    if not isinstance(entry, dict):
        continue

    timestamp = entry.get("timestamp")
    message = entry.get("message")
    if not isinstance(message, dict):
        continue
    content = message.get("content")
    if not isinstance(content, list):
        continue

    for block in content:
        if not isinstance(block, dict):
            continue
        block_type = block.get("type")
        if block_type == "tool_use":
            block_id = block.get("id")
            block_name = block.get("name")
            if not isinstance(block_id, str) or block_name not in SKILL_TOOL_NAMES:
                continue
            input_data = block.get("input")
            if not isinstance(input_data, dict):
                input_data = {}
            stack.append({
                "id": block_id,
                "skill": normalize_skill(input_data.get("skill")),
                "args": input_data.get("args") if isinstance(input_data.get("args"), str) else "",
                "timestamp": timestamp if isinstance(timestamp, str) else "",
            })
        elif block_type == "tool_result":
            tool_use_id = block.get("tool_use_id")
            if not isinstance(tool_use_id, str):
                continue
            for idx in range(len(stack) - 1, -1, -1):
                if stack[idx].get("id") == tool_use_id:
                    del stack[idx]
                    break

parent = None
child = None
if stack:
    top = stack[-1]
    top_skill = normalize_skill(top.get("skill"))
    if completed_skill and top_skill == completed_skill and len(stack) >= 2:
        parent = stack[-2]
        child = top
    elif top_skill != completed_skill:
        parent = top

parent_skill = ""
return_step = "next_step"

if isinstance(parent, dict):
    parent_skill = normalize_skill(parent.get("skill"))
    candidate = extract_return_step(parent.get("args"))
    if candidate:
        return_step = candidate

if isinstance(child, dict):
    child_candidate = extract_return_step(child.get("args"))
    if child_candidate:
        return_step = child_candidate

print(parent_skill)
print(return_step)
' "$transcript_path" "$completed_skill" 2>/dev/null || true
}

# tool_name이 "Skill"인지 확인
TOOL_NAME="$(printf '%s' "$INPUT" | python3 -c 'import json, sys
try:
    data = json.loads(sys.stdin.read() or "{}")
    print(data.get("tool_name") or "")
except Exception:
    print("")
' 2>/dev/null || true)"
if [ "$TOOL_NAME" != "Skill" ]; then
  exit 0
fi

# tool_input.skill에서 스킬명 추출
SKILL_NAME="$(printf '%s' "$INPUT" | python3 -c 'import json, sys
try:
    data = json.loads(sys.stdin.read() or "{}")
    tool_input = data.get("tool_input") or {}
    if isinstance(tool_input, dict):
        print(tool_input.get("skill") or "")
    else:
        print("")
except Exception:
    print("")
' 2>/dev/null || true)"
if [ -z "$SKILL_NAME" ]; then
  exit 0
fi

# mst: 접두사가 있는 스킬만 대상
case "$SKILL_NAME" in
  mst:*) ;;
  *) exit 0 ;;
esac

PARENT_SKILL=""
RETURN_STEP=""
MST_STACK_SOURCE="${MST_STACK_SOURCE:-transcript}"

if [ "$MST_STACK_SOURCE" = "hook" ]; then
  # 스택 파일 없으면 아무것도 하지 않음
  if [ ! -f "$STACK_FILE" ]; then
    exit 0
  fi

  # pop 전 top 스킬 검증
  STACK_LEN="$(read_stack_length "$STACK_FILE")"
  if [ "$STACK_LEN" -gt 0 ]; then
    TOP_SKILL="$(python3 -c 'import json, sys
path = sys.argv[1]
try:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
except Exception:
    data = []
if isinstance(data, list) and data:
    top = data[-1]
    if isinstance(top, dict):
        print(top.get("skill") or "")
    else:
        print("")
else:
    print("")
' "$STACK_FILE" 2>/dev/null || true)"

    if [ "$TOP_SKILL" != "$SKILL_NAME" ]; then
      echo "[mst-skill-pop] warning: top skill mismatch, refusing pop. expected_top=$TOP_SKILL completed=$SKILL_NAME" >&2
      debug_log "block" "action=pop_mismatch expected_top=$TOP_SKILL completed=$SKILL_NAME depth=$STACK_LEN"
      exit 0
    fi

    if [ "$STACK_LEN" -ge 2 ]; then
      PARENT_INFO="$(python3 -c 'import json, sys
path = sys.argv[1]
try:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
except Exception:
    data = []

parent_skill = ""
return_step = "next_step"
if isinstance(data, list) and len(data) >= 2 and isinstance(data[-2], dict):
    parent_skill = data[-2].get("skill") or ""
    # Check parent frame for return_step first
    candidate = data[-2].get("return_step")
    if isinstance(candidate, str) and candidate.strip():
        return_step = candidate.strip()
# Also check the child frame (being popped) for return_step hint
if isinstance(data, list) and data and isinstance(data[-1], dict):
    child_rs = data[-1].get("return_step")
    if isinstance(child_rs, str) and child_rs.strip():
        return_step = child_rs.strip()

print(parent_skill)
print(return_step)
' "$STACK_FILE" 2>/dev/null || true)"
      if [ -n "$PARENT_INFO" ]; then
        PARENT_SKILL="$(printf '%s\n' "$PARENT_INFO" | sed -n '1p')"
        RETURN_STEP="$(printf '%s\n' "$PARENT_INFO" | sed -n '2p')"
      fi
    fi

    if python3 -c 'import json, sys
path = sys.argv[1]
try:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
except Exception:
    data = []
if not isinstance(data, list):
    data = []
if data:
    data = data[:-1]
print(json.dumps(data, ensure_ascii=True))
' "$STACK_FILE" > "${STACK_FILE}.tmp" 2>/dev/null; then
      mv "${STACK_FILE}.tmp" "$STACK_FILE" || true
    else
      rm -f "${STACK_FILE}.tmp"
      exit 0
    fi
  fi

  POST_LEN="$(read_stack_length "$STACK_FILE")"
  debug_log "pop" "skill=$SKILL_NAME depth=$POST_LEN stack_source=hook"
else
  TRANSCRIPT_PATH="$(read_transcript_path_from_bridge "$TRANSCRIPT_BRIDGE_FILE" 2>/dev/null || true)"
  if [ -n "$TRANSCRIPT_PATH" ]; then
    PARENT_INFO="$(read_parent_from_transcript "$TRANSCRIPT_PATH" "$SKILL_NAME")"
    if [ -n "$PARENT_INFO" ]; then
      PARENT_SKILL="$(printf '%s\n' "$PARENT_INFO" | sed -n '1p')"
      RETURN_STEP="$(printf '%s\n' "$PARENT_INFO" | sed -n '2p')"
    fi
  fi
  debug_log "pop_skip" "skill=$SKILL_NAME stack_source=$MST_STACK_SOURCE transcript_path=${TRANSCRIPT_PATH:-none} parent_skill=${PARENT_SKILL:-none}"
fi

if [ -n "$PARENT_SKILL" ]; then
  TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%FT%TZ)"
  if python3 -c 'import json, sys
path = sys.argv[1]
parent_skill = sys.argv[2]
return_step = sys.argv[3]
created_at = sys.argv[4]

payload = {
    "parent_skill": parent_skill,
    "return_step": return_step or "next_step",
    "next_step": return_step or "next_step",
    "created_at": created_at,
}

print(json.dumps(payload, ensure_ascii=True))
' "$PENDING_FILE" "$PARENT_SKILL" "$RETURN_STEP" "$TIMESTAMP" > "${PENDING_FILE}.tmp" 2>/dev/null; then
    mv "${PENDING_FILE}.tmp" "$PENDING_FILE" || true
    debug_log "pending_created" "parent_skill=$PARENT_SKILL return_step=$RETURN_STEP created_at=$TIMESTAMP"
  else
    rm -f "${PENDING_FILE}.tmp"
  fi
fi

# PostToolUse는 추가 컨텍스트 없이 종료
exit 0
