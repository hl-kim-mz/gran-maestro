#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MST_TMP="${PROJECT_ROOT}/.gran-maestro/tmp"
BACKUP_FILE="${HOME}/.claude/mst-statusline-backup.json"
INPUT_JSON="$(cat || true)"

DEFAULT_HUD_COMMAND="$(cat <<'CMD'
bash -c 'plugin_dir=$(ls -d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/claude-hud/claude-hud/*/ 2>/dev/null | sort -t/ -k$(echo "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/cache/claude-hud/claude-hud/" | tr "/" "\n" | wc -l)n | tail -1); exec "/opt/homebrew/bin/node" "${plugin_dir}/dist/index.js"'
CMD
)"

resolve_hud_command() {
  if [ -f "$BACKUP_FILE" ]; then
    local restored
    restored="$(python3 -c 'import json, sys
path = sys.argv[1]
try:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
except Exception:
    print("")
    sys.exit(0)

command = ""
if isinstance(data, dict):
    status_line = data.get("statusLine")
    if isinstance(status_line, dict):
        value = status_line.get("command")
        if isinstance(value, str):
            command = value
if command:
    print(command)
' "$BACKUP_FILE" 2>/dev/null || true)"
    if [ -n "$restored" ]; then
      if [[ "$restored" == *"mst-statusline"* ]]; then
        printf '%s' "$DEFAULT_HUD_COMMAND"
        return 0
      fi
      printf '%s' "$restored"
      return 0
    fi
  fi

  printf '%s' "$DEFAULT_HUD_COMMAND"
}

resolve_stack_file() {
  local by_ppid latest
  by_ppid="${MST_TMP}/mst-call-stack-${PPID}.json"
  if [ -f "$by_ppid" ]; then
    printf '%s' "$by_ppid"
    return 0
  fi

  latest="$(ls -1t "${MST_TMP}"/mst-call-stack-*.json 2>/dev/null | head -n 1 || true)"
  printf '%s' "$latest"
}

extract_transcript_path() {
  printf '%s' "$INPUT_JSON" | python3 -c 'import json, sys
try:
    data = json.loads(sys.stdin.read() or "{}")
except Exception:
    data = {}

path = ""
if isinstance(data, dict):
    value = data.get("transcript_path")
    if isinstance(value, str):
        path = value.strip()

if path:
    print(path)
' 2>/dev/null || true
}

save_transcript_bridge() {
  local transcript_path="${1:-}"
  local bridge_file tmp_file
  [ -n "$transcript_path" ] || return 0
  mkdir -p "$MST_TMP"
  bridge_file="${MST_TMP}/mst-transcript-${PPID}.path"
  tmp_file="${bridge_file}.tmp.$$"
  if printf '%s' "$transcript_path" > "$tmp_file" 2>/dev/null; then
    mv "$tmp_file" "$bridge_file" 2>/dev/null || rm -f "$tmp_file"
  else
    rm -f "$tmp_file"
  fi
}

build_mst_line() {
  local stack_file="$1"
  local transcript_path="${2:-}"
  local stack_source="${3:-auto}"
  python3 -c 'import json, os, re, sys
from datetime import datetime, timezone

stack_path = sys.argv[1] if len(sys.argv) > 1 else ""
transcript_path = sys.argv[2] if len(sys.argv) > 2 else ""
stack_source = (sys.argv[3] if len(sys.argv) > 3 else "auto").strip().lower()
MAX_TAIL_BYTES = 512 * 1024
SNIFF_LINE_LIMIT = 100
SKILL_TOOL_NAMES = {"Skill", "proxy_Skill"}

def parse_iso(ts: str):
    if not isinstance(ts, str) or not ts:
        return None
    normalized = ts.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(normalized)
    except Exception:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt

def format_elapsed(ts: str):
    started = parse_iso(ts)
    if started is None:
        return "0s"
    now = datetime.now(timezone.utc)
    total = int((now - started).total_seconds())
    if total < 0:
        total = 0
    if total < 60:
        return f"{total}s"
    if total < 3600:
        return f"{total // 60}m"
    if total < 86400:
        return f"{total // 3600}h"
    return f"{total // 86400}d"

def clean_skill(name, strip_namespace=False):
    if not isinstance(name, str):
        return ""
    value = re.sub(r"^mst:", "", name.split("\n", 1)[0].strip())
    if strip_namespace and ":" in value:
        value = value.rsplit(":", 1)[-1]
    return value

def extract_context_id(args):
    if not isinstance(args, str):
        return ""
    match = re.search(r"\b((?:PLN|REQ)-\d+)\b", args, re.IGNORECASE)
    if match:
        return match.group(1).upper()
    return ""

def render_line(labels, context_id):
    if not labels:
        return "MST idle"
    line = " > ".join(labels)
    if context_id:
        line += f" ({context_id})"
    return line

def render_from_stack(path):
    frames = []
    if path:
        try:
            with open(path, "r", encoding="utf-8") as f:
                raw = json.load(f)
                if isinstance(raw, list):
                    frames = raw
        except Exception:
            frames = []

    labels = []
    context_id = ""

    for frame in reversed(frames):
        if isinstance(frame, dict):
            candidate = frame.get("context_id")
            if isinstance(candidate, str) and candidate.strip():
                context_id = candidate.strip()
                break

    for frame in frames:
        if not isinstance(frame, dict):
            continue
        skill = clean_skill(frame.get("skill"))
        if not skill:
            continue
        started_at = frame.get("started_at") or frame.get("pushed_at") or ""
        labels.append(f"{skill}({format_elapsed(started_at)})")

    return render_line(labels, context_id)

def load_transcript_lines(path):
    if not path or not os.path.isfile(path):
        return None
    try:
        file_size = os.path.getsize(path)
    except Exception:
        return None

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
            return lines

        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read().splitlines()
    except Exception:
        return None

def schema_detected(lines):
    scanned = 0
    for line in lines:
        if not line.strip():
            continue
        scanned += 1
        if scanned > SNIFF_LINE_LIMIT:
            break
        try:
            entry = json.loads(line)
        except Exception:
            continue
        message = entry.get("message")
        if not isinstance(message, dict):
            continue
        content = message.get("content")
        if not isinstance(content, list):
            continue
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") in ("tool_use", "tool_result"):
                return True
    return False

def render_from_transcript(path):
    lines = load_transcript_lines(path)
    if lines is None:
        return None
    if not schema_detected(lines):
        return None

    pending = {}
    for line in lines:
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
        except Exception:
            continue

        timestamp = entry.get("timestamp") if isinstance(entry, dict) else ""
        message = entry.get("message") if isinstance(entry, dict) else {}
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
                pending[block_id] = {
                    "skill": input_data.get("skill"),
                    "args": input_data.get("args"),
                    "timestamp": timestamp,
                }
            elif block_type == "tool_result":
                tool_use_id = block.get("tool_use_id")
                if isinstance(tool_use_id, str):
                    pending.pop(tool_use_id, None)

    labels = []
    context_id = ""
    for info in pending.values():
        if not isinstance(info, dict):
            continue
        skill = clean_skill(info.get("skill"), strip_namespace=True)
        if not skill:
            continue
        started_at = info.get("timestamp") or ""
        labels.append(f"{skill}({format_elapsed(started_at)})")
        candidate_context_id = extract_context_id(info.get("args"))
        if candidate_context_id:
            context_id = candidate_context_id

    if not labels:
        return None  # Empty stack from transcript → fallback to call-stack
    return render_line(labels, context_id)

if stack_source not in ("hook", "transcript", "auto"):
    stack_source = "auto"

if stack_source == "hook":
    print(render_from_stack(stack_path))
    sys.exit(0)

transcript_line = render_from_transcript(transcript_path)
if transcript_line is not None:
    print(transcript_line)
    sys.exit(0)

print(render_from_stack(stack_path))
' "$stack_file" "$transcript_path" "$stack_source" 2>/dev/null || printf 'MST idle\n'
}

HUD_COMMAND="$(resolve_hud_command)"
HUD_OUTPUT="$(printf '%s' "$INPUT_JSON" | sh -c "$HUD_COMMAND" 2>/dev/null || true)"
STACK_FILE="$(resolve_stack_file)"
TRANSCRIPT_PATH="$(extract_transcript_path)"
save_transcript_bridge "$TRANSCRIPT_PATH"
MST_STACK_SOURCE="${MST_STACK_SOURCE:-auto}"
MST_LINE="$(build_mst_line "$STACK_FILE" "$TRANSCRIPT_PATH" "$MST_STACK_SOURCE")"

if [ -n "$HUD_OUTPUT" ]; then
  printf '%s\n' "$HUD_OUTPUT"
fi
printf '%s\n' "$MST_LINE"
