#!/usr/bin/env bash
set -euo pipefail

# Stop hook — pending/next_action/depth 기반 continuation guard

STACK_FILE="/tmp/mst-call-stack-${PPID}.json"
COUNTER_FILE="/tmp/mst-stop-hook-count-${PPID}"
NEXT_ACTION_FILE="/tmp/mst-next-action-${PPID}.json"
NEXT_ACTION_COUNTER_FILE="/tmp/mst-next-action-count-${PPID}"
NEXT_ACTION_STATE_FILE="/tmp/mst-next-action-state-${PPID}"
PENDING_FILE="/tmp/mst-pending-continuation-${PPID}"
DEBUG_LOG_FILE="/tmp/mst-hook-debug-${PPID}.log"

MAX_BLOCKS="${MST_MAX_BLOCKS:-3}"
if ! [[ "$MAX_BLOCKS" =~ ^[0-9]+$ ]] || [ "$MAX_BLOCKS" -lt 1 ]; then
  MAX_BLOCKS=3
fi

MAX_NEXT_ACTION_BLOCKS="${MST_MAX_NEXT_ACTION_BLOCKS:-3}"
if ! [[ "$MAX_NEXT_ACTION_BLOCKS" =~ ^[0-9]+$ ]] || [ "$MAX_NEXT_ACTION_BLOCKS" -lt 1 ]; then
  MAX_NEXT_ACTION_BLOCKS=3
fi

MAX_TOTAL_BLOCKS="${MST_MAX_TOTAL_BLOCKS:-5}"
if ! [[ "$MAX_TOTAL_BLOCKS" =~ ^[0-9]+$ ]] || [ "$MAX_TOTAL_BLOCKS" -lt 1 ]; then
  MAX_TOTAL_BLOCKS=5
fi

FRAME_TTL="${MST_FRAME_TTL:-1800}"
if ! [[ "$FRAME_TTL" =~ ^[0-9]+$ ]] || [ "$FRAME_TTL" -lt 0 ]; then
  FRAME_TTL=600
fi

CONTINUATION_TTL="${MST_CONTINUATION_TTL:-1800}"
if ! [[ "$CONTINUATION_TTL" =~ ^[0-9]+$ ]] || [ "$CONTINUATION_TTL" -lt 0 ]; then
  CONTINUATION_TTL=60
fi

NEXT_ACTION_FALLBACK_TIMEOUT_MS="${MST_NEXT_ACTION_FALLBACK_TIMEOUT_MS:-200}"
if ! [[ "$NEXT_ACTION_FALLBACK_TIMEOUT_MS" =~ ^[0-9]+$ ]] || [ "$NEXT_ACTION_FALLBACK_TIMEOUT_MS" -lt 1 ]; then
  NEXT_ACTION_FALLBACK_TIMEOUT_MS=200
fi

STDIN_RAW="$(cat || true)"
last_assistant_message="$STDIN_RAW"
TTL_REMOVED=0

# --- stop_hook_active 파싱 (stdin JSON) ---
# Claude Code Stop hook은 JSON으로 stop_hook_active 플래그를 전달할 수 있음
# true이면 이미 block 중이므로 즉시 allow (무한 루프 방지)
STOP_HOOK_ACTIVE="$(printf '%s' "$STDIN_RAW" | python3 -c 'import json, sys
try:
    data = json.loads(sys.stdin.read() or "{}")
    val = data.get("stop_hook_active")
    if val is True:
        print("true")
    elif val is False:
        print("false")
    else:
        print("unknown")
except Exception:
    print("unknown")
' 2>/dev/null || echo "unknown")"

# --- 유틸리티 함수 ---

debug_log() {
  [ "${MST_DEBUG:-0}" = "1" ] || return 0
  local event="${1:-event}"
  shift || true
  local detail="${*:-}"
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%FT%TZ)"
  printf '%s event=%s %s\n' "$ts" "$event" "$detail" >> "$DEBUG_LOG_FILE" 2>/dev/null || true
}

if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  debug_log "allow" "reason=stop_hook_active_true"
  exit 0
fi

contains_pattern() {
  local pattern="$1"
  printf '%s' "$last_assistant_message" | grep -Eiq -- "$pattern"
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

read_counter() {
  local file="$1"
  local current=0
  if [ -f "$file" ]; then
    local raw
    raw="$(cat "$file" 2>/dev/null || true)"
    if [[ "$raw" =~ ^[0-9]+$ ]]; then
      current="$raw"
    fi
  fi
  printf '%s' "$current"
}

write_counter() {
  local file="$1"
  local value="$2"
  printf '%s' "$value" > "$file"
}

reset_block_counters() {
  write_counter "$COUNTER_FILE" 0
  write_counter "$NEXT_ACTION_COUNTER_FILE" 0
  rm -f "$NEXT_ACTION_STATE_FILE" "${NEXT_ACTION_STATE_FILE}.tmp" 2>/dev/null || true
}

reset_counter_and_allow() {
  local reason="${1:-allow}"
  local stack_depth="${2:-0}"
  reset_block_counters
  debug_log "allow" "reason=$reason stack_depth=$stack_depth ttl_removed=$TTL_REMOVED max_blocks=$MAX_BLOCKS max_next_action_blocks=$MAX_NEXT_ACTION_BLOCKS max_total_blocks=$MAX_TOTAL_BLOCKS"
  exit 0
}

increment_global_counter_or_allow() {
  local current next_value
  current="$(read_counter "$COUNTER_FILE")"
  next_value=$((current + 1))
  if [ "$next_value" -gt "$MAX_TOTAL_BLOCKS" ]; then
    echo "[mst-continuation-guard] warning: global block limit reached (${MAX_TOTAL_BLOCKS}), forcing allow." >&2
    debug_log "allow" "reason=global_block_limit current=$current attempted=$next_value max_total_blocks=$MAX_TOTAL_BLOCKS"
    reset_counter_and_allow "global_block_limit" "${STACK_DEPTH:-0}"
  fi
  write_counter "$COUNTER_FILE" "$next_value"
  GLOBAL_COUNTER_RESULT="$next_value"
}

increment_next_action_counter_or_allow() {
  local marker_key="$1"
  local previous_key current next_value
  previous_key="$(cat "$NEXT_ACTION_STATE_FILE" 2>/dev/null || true)"

  if [ "$previous_key" = "$marker_key" ]; then
    current="$(read_counter "$NEXT_ACTION_COUNTER_FILE")"
  else
    current=0
  fi

  next_value=$((current + 1))
  if [ "$next_value" -gt "$MAX_NEXT_ACTION_BLOCKS" ]; then
    echo "[mst-continuation-guard] warning: next_action block limit reached (${MAX_NEXT_ACTION_BLOCKS}), forcing allow." >&2
    debug_log "allow" "reason=next_action_block_limit marker_key=$marker_key current=$current attempted=$next_value max_next_action_blocks=$MAX_NEXT_ACTION_BLOCKS"
    reset_counter_and_allow "next_action_block_limit" "${STACK_DEPTH:-0}"
  fi

  write_counter "$NEXT_ACTION_COUNTER_FILE" "$next_value"
  printf '%s' "$marker_key" > "$NEXT_ACTION_STATE_FILE"
  NEXT_ACTION_COUNTER_RESULT="$next_value"
}

block_with_reason() {
  local reason="$1"
  local block_message="$2"
  local detail="${3:-}"
  local marker_key="${4:-}"
  local global_counter next_action_counter="0"

  GLOBAL_COUNTER_RESULT="0"
  NEXT_ACTION_COUNTER_RESULT="0"
  increment_global_counter_or_allow
  global_counter="$GLOBAL_COUNTER_RESULT"

  if [ "$reason" = "next_action" ]; then
    increment_next_action_counter_or_allow "$marker_key"
    next_action_counter="$NEXT_ACTION_COUNTER_RESULT"
  fi

  debug_log "block" "reason=$reason $detail global_counter=$global_counter max_total_blocks=$MAX_TOTAL_BLOCKS next_action_counter=$next_action_counter max_next_action_blocks=$MAX_NEXT_ACTION_BLOCKS ttl_removed=$TTL_REMOVED"
  printf '%s\n' "{\"decision\":\"block\",\"reason\":\"$block_message\"}"
  exit 0
}

cleanup_expired_frames() {
  [ -f "$STACK_FILE" ] || return 0

  local before after tmp_file
  before="$(read_stack_length "$STACK_FILE")"
  tmp_file="${STACK_FILE}.tmp"

  if python3 -c 'import json, sys
from datetime import datetime, timezone

path = sys.argv[1]
ttl = int(sys.argv[2])
now = datetime.now(timezone.utc)

try:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
except Exception:
    data = []

if not isinstance(data, list):
    data = []

kept = []
for frame in data:
    if not isinstance(frame, dict):
        kept.append(frame)
        continue
    pushed_at = frame.get("pushed_at")
    if not isinstance(pushed_at, str):
        kept.append(frame)
        continue
    try:
        dt = datetime.fromisoformat(pushed_at.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        age = (now - dt.astimezone(timezone.utc)).total_seconds()
        if age > ttl:
            continue
    except Exception:
        pass
    kept.append(frame)

print(json.dumps(kept, ensure_ascii=True))
' "$STACK_FILE" "$FRAME_TTL" > "$tmp_file" 2>/dev/null; then
    mv "$tmp_file" "$STACK_FILE" || true
  else
    rm -f "$tmp_file"
    return 0
  fi

  after="$(read_stack_length "$STACK_FILE")"
  if [[ "$before" =~ ^[0-9]+$ ]] && [[ "$after" =~ ^[0-9]+$ ]] && [ "$before" -gt "$after" ]; then
    TTL_REMOVED=$((before - after))
    echo "[mst-continuation-guard] warning: removed stale frames ttl=${FRAME_TTL}s removed=$TTL_REMOVED" >&2
  fi
}

read_active_request_context() {
  # Scan .gran-maestro/requests/ for the most recent active request
  # and return actionable next-step instructions based on its phase.
  local project_root
  project_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  [ -n "$project_root" ] || { printf '\t\t\t\n'; return 0; }

  local requests_dir="$project_root/.gran-maestro/requests"
  [ -d "$requests_dir" ] || { printf '\t\t\t\n'; return 0; }

  python3 -c 'import glob, json, os, sys, signal

requests_dir = sys.argv[1]
project_root = sys.argv[2] if len(sys.argv) > 2 else ""

signal.signal(signal.SIGALRM, lambda s, f: (_ for _ in ()).throw(TimeoutError()))
signal.setitimer(signal.ITIMER_REAL, 0.3)

try:
    candidates = sorted(glob.glob(os.path.join(requests_dir, "REQ-*", "request.json")), reverse=True)
    for path in candidates:
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue
        if not isinstance(data, dict):
            continue

        status = data.get("status", "")
        req_id = data.get("id", "")
        if not req_id:
            continue

        # Skip terminal states
        if status in ("done", "completed", "accepted", "cancelled", "archived"):
            continue

        next_action = ""
        if status == "phase2_execution":
            tasks = data.get("tasks", [])
            pending = [t for t in tasks if isinstance(t, dict) and t.get("status") not in ("committed", "done", "completed")]
            if pending:
                next_action = f"Task execution in progress. {len(pending)} pending tasks. Continue dispatching agents."
            else:
                next_action = f"All tasks committed. Transition to Phase 3: update status to phase3_review, then call Skill(skill: \"mst:review\", args: \"{req_id} --auto\")."

        elif status == "phase3_review":
            rs = data.get("review_summary", {})
            rv_status = rs.get("status", "") if isinstance(rs, dict) else ""
            if rv_status == "passed":
                next_action = f"Review PASSED. Immediately call Skill(skill: \"mst:accept\", args: \"{req_id}\") to complete Phase 5 (merge)."
            elif rv_status in ("failed", "gap_found"):
                next_action = f"Review found gaps. Read reviews/ for latest RV-NNN/review.json, create fix tasks, and re-dispatch."
            else:
                next_action = f"Review in progress. Check reviews/ directory for latest RV-NNN/review.json results."

        elif status == "spec_ready":
            next_action = f"Spec ready. Call Skill(skill: \"mst:approve\", args: \"{req_id}\") to begin execution."

        else:
            next_action = f"Continue workflow from {status}."

        print(f"{req_id}\t{status}\t{next_action}")
        sys.exit(0)

    print("\t\t")
except TimeoutError:
    print("\t\t")
except Exception:
    print("\t\t")
finally:
    signal.setitimer(signal.ITIMER_REAL, 0)
' "$requests_dir" "$project_root" 2>/dev/null || printf '\t\t\n'
}

check_pending_continuation() {
  [ -f "$PENDING_FILE" ] || return 1

  local info status parent_skill return_step age
  info="$(python3 -c 'import json, sys
from datetime import datetime, timezone

path = sys.argv[1]
ttl = int(sys.argv[2])
now = datetime.now(timezone.utc)

status = "stale"
parent_skill = "unknown"
return_step = "next_step"
next_step = ""
age = ttl + 1

try:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
except Exception:
    data = {}

if isinstance(data, dict):
    ps = data.get("parent_skill")
    rs = data.get("return_step")
    ns = data.get("next_step")
    created_at = data.get("created_at")
    if isinstance(ps, str) and ps.strip():
        parent_skill = ps.strip()
    if isinstance(rs, str) and rs.strip():
        return_step = rs.strip()
    if isinstance(ns, str) and ns.strip():
        next_step = ns.strip()
    if isinstance(created_at, str) and created_at.strip():
        try:
            dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            age = int((now - dt.astimezone(timezone.utc)).total_seconds())
            status = "fresh" if age <= ttl else "stale"
        except Exception:
            status = "stale"
            age = ttl + 1

print(f"{status}\t{parent_skill}\t{return_step}\t{age}\t{next_step}")
' "$PENDING_FILE" "$CONTINUATION_TTL" 2>/dev/null || true)"

  status="$(printf '%s' "$info" | cut -f1)"
  parent_skill="$(printf '%s' "$info" | cut -f2)"
  return_step="$(printf '%s' "$info" | cut -f3)"
  age="$(printf '%s' "$info" | cut -f4)"
  next_step="$(printf '%s' "$info" | cut -f5)"

  if [ "$status" = "fresh" ]; then
    local reason_detail="부모 스킬로 복귀: $parent_skill (return_step=$return_step)."
    if [ -n "$next_step" ]; then
      reason_detail="$reason_detail Execute $next_step."
    fi

    # Enrich with active request context for actionable instructions
    local req_ctx req_id req_status req_next_action
    req_ctx="$(read_active_request_context 2>/dev/null || true)"
    req_id="$(printf '%s' "$req_ctx" | cut -f1)"
    req_status="$(printf '%s' "$req_ctx" | cut -f2)"
    req_next_action="$(printf '%s' "$req_ctx" | cut -f3)"
    if [ -n "$req_next_action" ]; then
      reason_detail="$reason_detail [ACTIVE REQUEST: $req_id ($req_status)] $req_next_action"
    fi

    reason_detail="$reason_detail pending_continuation is active age=${age}s <= ttl=${CONTINUATION_TTL}s. Do not stop — emit the next tool call immediately."
    block_with_reason "pending_continuation" "$reason_detail" "parent=$parent_skill return_step=$return_step next_step=$next_step age=${age}s ttl=${CONTINUATION_TTL}s req_id=$req_id req_status=$req_status"
  fi

  rm -f "$PENDING_FILE" "${PENDING_FILE}.tmp" 2>/dev/null || true
  debug_log "allow" "reason=pending_continuation_stale_removed parent=$parent_skill age=${age}s ttl=${CONTINUATION_TTL}s"
  reset_counter_and_allow "pending_continuation_stale_removed" 0
}

read_next_action_marker() {
  local path="$1"
  [ -f "$path" ] || {
    printf 'missing\t\t\t\t\t\t\n'
    return 0
  }

  python3 -c 'import json, sys
path = sys.argv[1]

status = "invalid"
expected_skill = ""
source_skill = ""
source_id = ""
auto_mode = "unknown"
project_root = ""
created_at = ""

try:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
except Exception:
    print(f"{status}\t{expected_skill}\t{source_skill}\t{source_id}\t{auto_mode}\t{project_root}\t{created_at}")
    sys.exit(0)

if isinstance(data, dict):
    es = data.get("expected_skill")
    ss = data.get("source_skill")
    sid = data.get("source_id")
    am = data.get("auto_mode")
    pr = data.get("project_root")
    ca = data.get("created_at")
    if isinstance(es, str) and es.strip():
        expected_skill = es.strip()
    if isinstance(ss, str) and ss.strip():
        source_skill = ss.strip()
    if isinstance(sid, str) and sid.strip():
        source_id = sid.strip()
    if isinstance(pr, str) and pr.strip():
        project_root = pr.strip()
    if isinstance(ca, str) and ca.strip():
        created_at = ca.strip()
    if am is True:
        auto_mode = "true"
    elif am is False:
        auto_mode = "false"

if expected_skill and auto_mode == "true":
    status = "valid"
elif expected_skill and auto_mode == "false":
    status = "inactive"

print(f"{status}\t{expected_skill}\t{source_skill}\t{source_id}\t{auto_mode}\t{project_root}\t{created_at}")
' "$path" 2>/dev/null || printf 'invalid\t\t\t\t\t\t\n'
}

read_next_action_from_plan_json() {
  local project_root_hint="${1:-}"
  local source_id_hint="${2:-}"
  python3 -c 'import glob, json, os, signal, subprocess, sys

project_root_hint = sys.argv[1] if len(sys.argv) > 1 else ""
source_id_hint = sys.argv[2] if len(sys.argv) > 2 else ""
timeout_ms = int(sys.argv[3]) if len(sys.argv) > 3 else 200

def timeout_handler(signum, frame):
    raise TimeoutError()

def to_str(value):
    return value.strip() if isinstance(value, str) and value.strip() else ""

signal.signal(signal.SIGALRM, timeout_handler)
signal.setitimer(signal.ITIMER_REAL, max(timeout_ms, 1) / 1000.0)

try:
    roots = []
    if project_root_hint and os.path.isdir(project_root_hint):
        roots.append(project_root_hint)

    try:
        proc = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=0.05,
            check=False,
        )
        root = proc.stdout.strip()
        if root and os.path.isdir(root):
            roots.append(root)
    except Exception:
        pass

    seen = set()
    deduped_roots = []
    for root in roots:
        if root in seen:
            continue
        seen.add(root)
        deduped_roots.append(root)

    for root in deduped_roots:
        plans_root = os.path.join(root, ".gran-maestro", "plans")
        if not os.path.isdir(plans_root):
            continue

        candidates = []
        if source_id_hint:
            hinted = os.path.join(plans_root, source_id_hint, "plan.json")
            if os.path.isfile(hinted):
                candidates.append(hinted)
        if not candidates:
            candidates = sorted(glob.glob(os.path.join(plans_root, "PLN-*", "plan.json")), reverse=True)

        for plan_path in candidates:
            try:
                with open(plan_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception:
                continue
            if not isinstance(data, dict):
                continue

            next_action = data.get("next_action")
            if not isinstance(next_action, dict):
                continue

            expected_skill = to_str(next_action.get("expected_skill"))
            if not expected_skill:
                continue

            auto_mode_raw = next_action.get("auto_mode")
            if auto_mode_raw is not True:
                continue

            source_skill = to_str(next_action.get("source_skill"))
            source_id = to_str(next_action.get("source_id"))
            if not source_id:
                source_id = source_id_hint or os.path.basename(os.path.dirname(plan_path))
            project_root = to_str(next_action.get("project_root")) or root
            created_at = to_str(next_action.get("created_at"))

            print(f"hit\t{expected_skill}\t{source_skill}\t{source_id}\ttrue\t{project_root}\t{created_at}")
            sys.exit(0)

    print("none\t\t\t\t\t\t")
except TimeoutError:
    print("timeout\t\t\t\t\t\t")
except Exception:
    print("error\t\t\t\t\t\t")
finally:
    signal.setitimer(signal.ITIMER_REAL, 0)
' "$project_root_hint" "$source_id_hint" "$NEXT_ACTION_FALLBACK_TIMEOUT_MS" 2>/dev/null || printf 'error\t\t\t\t\t\t\n'
}

check_next_action_continuation() {
  local marker_info marker_status expected_skill source_skill source_id auto_mode project_root created_at
  marker_info="$(read_next_action_marker "$NEXT_ACTION_FILE")"
  marker_status="$(printf '%s' "$marker_info" | cut -f1)"
  expected_skill="$(printf '%s' "$marker_info" | cut -f2)"
  source_skill="$(printf '%s' "$marker_info" | cut -f3)"
  source_id="$(printf '%s' "$marker_info" | cut -f4)"
  auto_mode="$(printf '%s' "$marker_info" | cut -f5)"
  project_root="$(printf '%s' "$marker_info" | cut -f6)"
  created_at="$(printf '%s' "$marker_info" | cut -f7)"

  if [ "$marker_status" = "valid" ]; then
    local marker_key reason_detail
    marker_key="${expected_skill}|${source_id}|${created_at}"
    reason_detail="next_action guard is active (source=$source_skill:$source_id, expected=$expected_skill). plan→request 워크플로우를 계속 진행해야 하므로 Stop을 차단합니다."

    # Enrich with active request context
    local na_req_ctx na_req_id na_req_status na_req_next
    na_req_ctx="$(read_active_request_context 2>/dev/null || true)"
    na_req_id="$(printf '%s' "$na_req_ctx" | cut -f1)"
    na_req_status="$(printf '%s' "$na_req_ctx" | cut -f2)"
    na_req_next="$(printf '%s' "$na_req_ctx" | cut -f3)"
    if [ -n "$na_req_next" ]; then
      reason_detail="$reason_detail [ACTIVE REQUEST: $na_req_id ($na_req_status)] $na_req_next"
    fi

    reason_detail="$reason_detail Do not stop — emit Skill($expected_skill) immediately."
    block_with_reason "next_action" "$reason_detail" "source_skill=$source_skill source_id=$source_id expected_skill=$expected_skill auto_mode=$auto_mode project_root=$project_root created_at=$created_at marker_status=$marker_status req_id=$na_req_id" "$marker_key"
  fi

  if [ "$marker_status" = "inactive" ]; then
    rm -f "$NEXT_ACTION_FILE" "${NEXT_ACTION_FILE}.tmp" 2>/dev/null || true
    debug_log "allow" "reason=next_action_inactive_removed expected_skill=$expected_skill source_id=$source_id"
    return 1
  fi

  if [ "$marker_status" = "invalid" ]; then
    rm -f "${NEXT_ACTION_FILE}.tmp" 2>/dev/null || true
  fi

  local fallback_info fallback_status fb_expected fb_source_skill fb_source_id fb_auto_mode fb_project_root fb_created_at
  fallback_info="$(read_next_action_from_plan_json "$project_root" "$source_id")"
  fallback_status="$(printf '%s' "$fallback_info" | cut -f1)"
  fb_expected="$(printf '%s' "$fallback_info" | cut -f2)"
  fb_source_skill="$(printf '%s' "$fallback_info" | cut -f3)"
  fb_source_id="$(printf '%s' "$fallback_info" | cut -f4)"
  fb_auto_mode="$(printf '%s' "$fallback_info" | cut -f5)"
  fb_project_root="$(printf '%s' "$fallback_info" | cut -f6)"
  fb_created_at="$(printf '%s' "$fallback_info" | cut -f7)"

  if [ "$fallback_status" = "hit" ] && [ -n "$fb_expected" ]; then
    local marker_key reason_detail
    marker_key="${fb_expected}|${fb_source_id}|${fb_created_at}"
    reason_detail="next_action fallback(plan.json) is active (source=${fb_source_skill}:${fb_source_id}, expected=${fb_expected}). plan→request 워크플로우를 계속 진행해야 하므로 Stop을 차단합니다."

    # Enrich with active request context
    local fb_req_ctx fb_req_id fb_req_status fb_req_next
    fb_req_ctx="$(read_active_request_context 2>/dev/null || true)"
    fb_req_id="$(printf '%s' "$fb_req_ctx" | cut -f1)"
    fb_req_status="$(printf '%s' "$fb_req_ctx" | cut -f2)"
    fb_req_next="$(printf '%s' "$fb_req_ctx" | cut -f3)"
    if [ -n "$fb_req_next" ]; then
      reason_detail="$reason_detail [ACTIVE REQUEST: $fb_req_id ($fb_req_status)] $fb_req_next"
    fi

    reason_detail="$reason_detail Do not stop — emit Skill(${fb_expected}) immediately."
    block_with_reason "next_action" "$reason_detail" "source_skill=$fb_source_skill source_id=$fb_source_id expected_skill=$fb_expected auto_mode=$fb_auto_mode project_root=$fb_project_root created_at=$fb_created_at marker_status=$marker_status fallback=plan_json req_id=$fb_req_id" "$marker_key"
  fi

  if [ "$fallback_status" = "timeout" ] || [ "$fallback_status" = "error" ]; then
    debug_log "allow" "reason=next_action_plan_fallback_fail_open marker_status=$marker_status fallback_status=$fallback_status timeout_ms=$NEXT_ACTION_FALLBACK_TIMEOUT_MS"
    reset_counter_and_allow "next_action_plan_fallback_fail_open:$fallback_status" "${STACK_DEPTH:-0}"
  fi

  debug_log "allow" "reason=next_action_not_active marker_status=$marker_status fallback_status=$fallback_status source_id=${source_id:-none}"
  return 1
}

# --- 1. 명시적 허용 패턴 (최우선 — 스택 무관) ---

if contains_pattern 'AskUserQuestion|"tool_name"[[:space:]]*:[[:space:]]*"AskUserQuestion"'; then
  reset_counter_and_allow "explicit_allow_pattern:ask_user_question" 0
fi

if contains_pattern 'MST_STOP_ALLOW|MST_ALLOW_STOP|EXPLICIT_STOP|종료 요청|중단 요청|작업 종료|workflow complete|final answer delivered|user requested stop'; then
  reset_counter_and_allow "explicit_allow_pattern:stop_signal" 0
fi

# --- 2. pending_continuation 기반 판단 (depth 체크 이전) ---

check_pending_continuation || true

# --- 3. next_action 기반 판단 (depth 체크 이전) ---

check_next_action_continuation || true

# --- 4. 콜스택 기반 판단 (핵심 로직) ---

STACK_DEPTH=0
if [ -f "$STACK_FILE" ]; then
  cleanup_expired_frames
  STACK_DEPTH="$(read_stack_length "$STACK_FILE")"
fi

# depth <= 1: 최상위 스킬이거나 스택 비어있음 → Stop 허용
if [ "$STACK_DEPTH" -le 1 ]; then
  reset_counter_and_allow "stack_depth_le_1" "$STACK_DEPTH"
fi

# depth >= 2: 서브스킬 내부이므로 부모로 돌아가야 함 → block 시도

# 부모 스킬 정보 추출
PARENT_SKILL="$(python3 -c 'import json, sys
path = sys.argv[1]
try:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
except Exception:
    data = []
if isinstance(data, list) and len(data) >= 2 and isinstance(data[-2], dict):
    print(data[-2].get("skill") or "unknown")
else:
    print("unknown")
' "$STACK_FILE" 2>/dev/null || true)"
CURRENT_SKILL="$(python3 -c 'import json, sys
path = sys.argv[1]
try:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
except Exception:
    data = []
if isinstance(data, list) and len(data) >= 1 and isinstance(data[-1], dict):
    print(data[-1].get("skill") or "unknown")
else:
    print("unknown")
' "$STACK_FILE" 2>/dev/null || true)"

# Enrich with active request context for actionable instructions
REQ_CTX="$(read_active_request_context 2>/dev/null || true)"
REQ_ID="$(printf '%s' "$REQ_CTX" | cut -f1)"
REQ_STATUS="$(printf '%s' "$REQ_CTX" | cut -f2)"
REQ_NEXT_ACTION="$(printf '%s' "$REQ_CTX" | cut -f3)"
STACK_BLOCK_MSG="Call stack depth=$STACK_DEPTH ($CURRENT_SKILL inside $PARENT_SKILL). Return to parent skill $PARENT_SKILL and continue with the next step."
if [ -n "$REQ_NEXT_ACTION" ]; then
  STACK_BLOCK_MSG="$STACK_BLOCK_MSG [ACTIVE REQUEST: $REQ_ID ($REQ_STATUS)] $REQ_NEXT_ACTION"
fi
STACK_BLOCK_MSG="$STACK_BLOCK_MSG Do not stop — emit the next tool call immediately."

block_with_reason \
  "stack_depth" \
  "$STACK_BLOCK_MSG" \
  "stack_depth=$STACK_DEPTH current=$CURRENT_SKILL parent=$PARENT_SKILL req_id=$REQ_ID req_status=$REQ_STATUS"
