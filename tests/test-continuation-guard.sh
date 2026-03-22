#!/usr/bin/env bash
set -euo pipefail

# Unit tests for mst continuation hooks
# Coverage: pending continuation, next_action guard, hook clear flow, counter limits

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
GUARD_SCRIPT="$SCRIPT_DIR/.claude/hooks/mst-continuation-guard.sh"
PUSH_SCRIPT="$SCRIPT_DIR/.claude/hooks/mst-skill-push.sh"
POP_SCRIPT="$SCRIPT_DIR/.claude/hooks/mst-skill-pop.sh"
SESSION_INIT_SCRIPT="$SCRIPT_DIR/.claude/hooks/mst-session-init.sh"

PASS=0
FAIL=0
TOTAL=0

OUTFILE="/tmp/mst-test-output-$$.txt"
INFILE="/tmp/mst-test-input-$$.txt"
TEMP_PROJECT_ROOT=""

# Hooks use PPID to construct file paths. In a pipe like:
#   printf ... | bash "$SCRIPT" > "$OUTFILE"
# bash's PPID = this script's PID ($$).
MY_PID="$$"
STACK_FILE="/tmp/mst-call-stack-${MY_PID}.json"
COUNTER_FILE="/tmp/mst-stop-hook-count-${MY_PID}"
PENDING_FILE="/tmp/mst-pending-continuation-${MY_PID}"
NEXT_ACTION_FILE="/tmp/mst-next-action-${MY_PID}.json"
NEXT_ACTION_COUNTER_FILE="/tmp/mst-next-action-count-${MY_PID}"
NEXT_ACTION_STATE_FILE="/tmp/mst-next-action-state-${MY_PID}"
DEBUG_LOG="/tmp/mst-hook-debug-${MY_PID}.log"

cleanup() {
  rm -f \
    "$STACK_FILE" "${STACK_FILE}.tmp" \
    "$COUNTER_FILE" "${COUNTER_FILE}.tmp" \
    "$PENDING_FILE" "${PENDING_FILE}.tmp" \
    "$NEXT_ACTION_FILE" "${NEXT_ACTION_FILE}.tmp" \
    "$NEXT_ACTION_COUNTER_FILE" "${NEXT_ACTION_COUNTER_FILE}.tmp" \
    "$NEXT_ACTION_STATE_FILE" "${NEXT_ACTION_STATE_FILE}.tmp" \
    "$DEBUG_LOG" "$OUTFILE" "$INFILE" \
    2>/dev/null || true
  if [ -n "$TEMP_PROJECT_ROOT" ]; then
    rm -rf "$TEMP_PROJECT_ROOT" 2>/dev/null || true
    TEMP_PROJECT_ROOT=""
  fi
}

trap cleanup EXIT

# Run hook and write stdout to OUTFILE (no subshell, so PPID stays consistent)
run_guard() {
  local input="$1"
  printf '%s' "$input" > "$INFILE"
  bash "$GUARD_SCRIPT" < "$INFILE" > "$OUTFILE" 2>/dev/null || true
}

run_guard_with_env() {
  local input="$1"
  shift
  printf '%s' "$input" > "$INFILE"
  env "$@" bash "$GUARD_SCRIPT" < "$INFILE" > "$OUTFILE" 2>/dev/null || true
}

run_push() {
  local input="$1"
  printf '%s' "$input" > "$INFILE"
  bash "$PUSH_SCRIPT" < "$INFILE" > /dev/null 2>/dev/null || true
}

run_pop() {
  local input="$1"
  printf '%s' "$input" > "$INFILE"
  bash "$POP_SCRIPT" < "$INFILE" > /dev/null 2>/dev/null || true
}

run_session_init() {
  bash "$SESSION_INIT_SCRIPT" > /dev/null 2>/dev/null || true
}

read_output() {
  cat "$OUTFILE" 2>/dev/null || true
}

assert_eq() {
  local test_name="$1" expected="$2" actual="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$expected" = "$actual" ]; then
    echo "  PASS: $test_name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $test_name"
    echo "    expected: $expected"
    echo "    actual:   $actual"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local test_name="$1" needle="$2" haystack="$3"
  TOTAL=$((TOTAL + 1))
  if printf '%s' "$haystack" | grep -qF "$needle"; then
    echo "  PASS: $test_name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $test_name"
    echo "    expected to contain: $needle"
    echo "    actual: $haystack"
    FAIL=$((FAIL + 1))
  fi
}

assert_empty() {
  local test_name="$1" actual="$2"
  TOTAL=$((TOTAL + 1))
  if [ -z "$actual" ]; then
    echo "  PASS: $test_name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $test_name"
    echo "    expected empty, got: $actual"
    FAIL=$((FAIL + 1))
  fi
}

assert_file_exists() {
  local test_name="$1" file_path="$2"
  TOTAL=$((TOTAL + 1))
  if [ -f "$file_path" ]; then
    echo "  PASS: $test_name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $test_name"
    echo "    expected file exists: $file_path"
    FAIL=$((FAIL + 1))
  fi
}

assert_file_missing() {
  local test_name="$1" file_path="$2"
  TOTAL=$((TOTAL + 1))
  if [ ! -f "$file_path" ]; then
    echo "  PASS: $test_name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $test_name"
    echo "    expected file missing: $file_path"
    FAIL=$((FAIL + 1))
  fi
}

create_next_action_marker() {
  local auto_mode="$1"
  local project_root="$2"
  local source_id="$3"
  local expected_skill="${4:-mst:request}"
  local timestamp
  timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%FT%TZ)"
  printf '{"expected_skill":"%s","source_skill":"mst:plan","source_id":"%s","auto_mode":%s,"project_root":"%s","created_at":"%s"}' \
    "$expected_skill" "$source_id" "$auto_mode" "$project_root" "$timestamp" > "$NEXT_ACTION_FILE"
}

probe_next_action_counter_limit() {
  bash -s "$GUARD_SCRIPT" <<'EOF'
set -euo pipefail
GUARD_SCRIPT="$1"
PID="$$"
OUTFILE="/tmp/mst-probe-next-action-out-${PID}.txt"
INFILE="/tmp/mst-probe-next-action-in-${PID}.txt"
NEXT_ACTION_FILE="/tmp/mst-next-action-${PID}.json"
NEXT_ACTION_COUNTER_FILE="/tmp/mst-next-action-count-${PID}"
NEXT_ACTION_STATE_FILE="/tmp/mst-next-action-state-${PID}"
COUNTER_FILE="/tmp/mst-stop-hook-count-${PID}"

cleanup_probe() {
  rm -f "$OUTFILE" "$INFILE" "$NEXT_ACTION_FILE" "${NEXT_ACTION_FILE}.tmp" "$NEXT_ACTION_COUNTER_FILE" "${NEXT_ACTION_COUNTER_FILE}.tmp" "$NEXT_ACTION_STATE_FILE" "${NEXT_ACTION_STATE_FILE}.tmp" "$COUNTER_FILE" "${COUNTER_FILE}.tmp" 2>/dev/null || true
}

cleanup_probe
printf '{"expected_skill":"mst:request","source_skill":"mst:plan","source_id":"PLN-001","auto_mode":true,"project_root":"/tmp/test-project","created_at":"2026-03-22T00:00:00Z"}' > "$NEXT_ACTION_FILE"

statuses=()
for _ in 1 2 3 4; do
  printf '%s' '{"stop_hook_active": false}' > "$INFILE"
  bash "$GUARD_SCRIPT" < "$INFILE" > "$OUTFILE" 2>/dev/null || true
  if grep -q '"decision":"block"' "$OUTFILE" 2>/dev/null; then
    statuses+=("block")
  else
    statuses+=("allow")
  fi
done

printf '%s\n' "$(IFS=,; echo "${statuses[*]}")"
cat "$NEXT_ACTION_COUNTER_FILE" 2>/dev/null || echo "0"
cleanup_probe
EOF
}

probe_global_counter_limit() {
  bash -s "$GUARD_SCRIPT" <<'EOF'
set -euo pipefail
GUARD_SCRIPT="$1"
PID="$$"
OUTFILE="/tmp/mst-probe-global-out-${PID}.txt"
INFILE="/tmp/mst-probe-global-in-${PID}.txt"
PENDING_FILE="/tmp/mst-pending-continuation-${PID}"
COUNTER_FILE="/tmp/mst-stop-hook-count-${PID}"
NEXT_ACTION_COUNTER_FILE="/tmp/mst-next-action-count-${PID}"
NEXT_ACTION_STATE_FILE="/tmp/mst-next-action-state-${PID}"

cleanup_probe() {
  rm -f "$OUTFILE" "$INFILE" "$PENDING_FILE" "${PENDING_FILE}.tmp" "$COUNTER_FILE" "${COUNTER_FILE}.tmp" "$NEXT_ACTION_COUNTER_FILE" "${NEXT_ACTION_COUNTER_FILE}.tmp" "$NEXT_ACTION_STATE_FILE" "${NEXT_ACTION_STATE_FILE}.tmp" 2>/dev/null || true
}

cleanup_probe
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%FT%TZ)"
printf '{"parent_skill":"mst:approve","return_step":"Step 5","next_step":"Step 5: run pre-check","created_at":"%s"}' "$TIMESTAMP" > "$PENDING_FILE"

statuses=()
for _ in 1 2 3 4 5 6; do
  printf '%s' '{"stop_hook_active": false}' > "$INFILE"
  bash "$GUARD_SCRIPT" < "$INFILE" > "$OUTFILE" 2>/dev/null || true
  if grep -q '"decision":"block"' "$OUTFILE" 2>/dev/null; then
    statuses+=("block")
  else
    statuses+=("allow")
  fi
done

printf '%s\n' "$(IFS=,; echo "${statuses[*]}")"
cat "$COUNTER_FILE" 2>/dev/null || echo "0"
cleanup_probe
EOF
}

echo "DEBUG: MY_PID=$MY_PID"
echo "DEBUG: STACK_FILE=$STACK_FILE"
echo "DEBUG: PENDING_FILE=$PENDING_FILE"
echo "DEBUG: NEXT_ACTION_FILE=$NEXT_ACTION_FILE"

# ============================================================
echo "=== Test Suite: stop_hook_active parsing + pending continuation ==="
# ============================================================

echo "--- stop_hook_active=true -> allow ---"
cleanup
run_guard '{"stop_hook_active": true}'
output="$(read_output)"
assert_empty "stop_hook_active=true produces empty output (allow)" "$output"

echo "--- stop_hook_active=false with pending continuation -> block ---"
cleanup
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%FT%TZ)"
printf '{"parent_skill":"mst:approve","return_step":"Step 5","next_step":"Step 5: run pre-check","created_at":"%s"}' "$TIMESTAMP" > "$PENDING_FILE"
run_guard '{"stop_hook_active": false}'
output="$(read_output)"
assert_contains "stop_hook_active=false with pending -> block output" '"decision":"block"' "$output"

echo "--- stop_hook_active absent with pending continuation -> block ---"
cleanup
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%FT%TZ)"
printf '{"parent_skill":"mst:approve","return_step":"Step 5","next_step":"Step 5: run pre-check","created_at":"%s"}' "$TIMESTAMP" > "$PENDING_FILE"
run_guard 'some plain text message'
output="$(read_output)"
assert_contains "stop_hook_active absent with pending -> block output" '"decision":"block"' "$output"

# ============================================================
echo ""
echo "=== Test Suite: pending next_step + stack push/pop compatibility ==="
# ============================================================

echo "--- pending block message contains next_step ---"
cleanup
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%FT%TZ)"
printf '{"parent_skill":"mst:approve","return_step":"Step 5","next_step":"Step 5: run pre-check in worktree","created_at":"%s"}' "$TIMESTAMP" > "$PENDING_FILE"
run_guard '{"stop_hook_active": false}'
output="$(read_output)"
assert_contains "pending block reason includes next_step content" "Execute Step 5: run pre-check in worktree" "$output"

echo "--- PENDING_FILE next_step exists after pop ---"
cleanup
printf '[]' > "$STACK_FILE"
run_push '{"tool_name":"Skill","tool_input":{"skill":"mst:approve","args":"REQ-423"}}'
run_push '{"tool_name":"Skill","tool_input":{"skill":"mst:claude","args":"REQ-423 --trace Step 5: run pre-check"}}'
run_pop '{"tool_name":"Skill","tool_input":{"skill":"mst:claude"}}'
if [ -f "$PENDING_FILE" ]; then
  pending_content="$(cat "$PENDING_FILE")"
  has_next_step="$(python3 -c 'import json, sys
data = json.loads(sys.stdin.read())
print("yes" if "next_step" in data and data["next_step"] else "no")
' <<< "$pending_content" 2>/dev/null || echo "no")"
  assert_eq "PENDING_FILE contains next_step field" "yes" "$has_next_step"
else
  TOTAL=$((TOTAL + 1))
  echo "  FAIL: PENDING_FILE exists after pop"
  FAIL=$((FAIL + 1))
fi

echo "--- push frame return_step includes trace hint ---"
cleanup
printf '[]' > "$STACK_FILE"
run_push '{"tool_name":"Skill","tool_input":{"skill":"mst:approve","args":"REQ-423"}}'
run_push '{"tool_name":"Skill","tool_input":{"skill":"mst:claude","args":"REQ-423 --trace Step 5: run pre-check"}}'
if [ -f "$STACK_FILE" ]; then
  stack_content="$(cat "$STACK_FILE")"
  has_return_step="$(python3 -c 'import json, sys
data = json.loads(sys.stdin.read())
if isinstance(data, list) and len(data) >= 2:
    last = data[-1]
    if isinstance(last, dict) and "return_step" in last and last["return_step"]:
        print("yes")
    else:
        print("no")
else:
    print("no")
' <<< "$stack_content" 2>/dev/null || echo "no")"
  assert_eq "push frame has return_step field" "yes" "$has_return_step"
else
  TOTAL=$((TOTAL + 1))
  echo "  FAIL: STACK_FILE exists after push"
  FAIL=$((FAIL + 1))
fi

# ============================================================
echo ""
echo "=== Test Suite: next_action marker block ==="
# ============================================================

echo "--- AC-001: next_action marker schema includes expected_skill ---"
cleanup
create_next_action_marker "true" "/tmp/test-project" "PLN-001" "mst:request"
assert_file_exists "next_action marker file is created" "$NEXT_ACTION_FILE"
has_expected_skill="$(python3 -c 'import json, sys
data = json.load(open(sys.argv[1], "r", encoding="utf-8"))
print("yes" if isinstance(data, dict) and isinstance(data.get("expected_skill"), str) and data.get("expected_skill") else "no")
' "$NEXT_ACTION_FILE" 2>/dev/null || echo "no")"
assert_eq "next_action marker has expected_skill" "yes" "$has_expected_skill"

echo "--- AC-002: valid next_action marker blocks stop ---"
cleanup
create_next_action_marker "true" "/tmp/test-project" "PLN-001" "mst:request"
run_guard '{"stop_hook_active": false}'
output="$(read_output)"
assert_contains "valid next_action marker -> block output" '"decision":"block"' "$output"
assert_contains "block reason includes expected skill" "Skill(mst:request)" "$output"

echo "--- AC-003: next_action check happens before depth allow ---"
cleanup
create_next_action_marker "true" "/tmp/test-project" "PLN-001" "mst:request"
run_guard 'plain text input'
output="$(read_output)"
assert_contains "next_action with empty stack still blocks" '"decision":"block"' "$output"

# ============================================================
echo ""
echo "=== Test Suite: request push clear + session-init GC ==="
# ============================================================

echo "--- AC-004: mst:request push clears /tmp marker and plan.json next_action ---"
cleanup
TEMP_PROJECT_ROOT="/tmp/mst-next-action-project-$$"
mkdir -p "$TEMP_PROJECT_ROOT/.gran-maestro/plans/PLN-777"
cat > "$TEMP_PROJECT_ROOT/.gran-maestro/plans/PLN-777/plan.json" <<EOF
{
  "id": "PLN-777",
  "title": "test",
  "status": "active",
  "next_action": {
    "expected_skill": "mst:request",
    "source_skill": "mst:plan",
    "source_id": "PLN-777",
    "auto_mode": true,
    "project_root": "$TEMP_PROJECT_ROOT",
    "created_at": "2026-03-22T00:00:00Z"
  }
}
EOF
create_next_action_marker "true" "$TEMP_PROJECT_ROOT" "PLN-777" "mst:request"
run_push '{"tool_name":"Skill","tool_input":{"skill":"mst:request","args":"--plan PLN-777 test"}}'
assert_file_missing "next_action marker removed on mst:request push" "$NEXT_ACTION_FILE"
has_plan_next_action="$(python3 -c 'import json, sys
data = json.load(open(sys.argv[1], "r", encoding="utf-8"))
print("yes" if "next_action" in data else "no")
' "$TEMP_PROJECT_ROOT/.gran-maestro/plans/PLN-777/plan.json" 2>/dev/null || echo "yes")"
assert_eq "plan.json next_action is cleared on mst:request push" "no" "$has_plan_next_action"

echo "--- AC-005: session-init removes lingering next_action marker ---"
cleanup
create_next_action_marker "true" "/tmp/test-project" "PLN-001" "mst:request"
assert_file_exists "precondition: next_action marker exists" "$NEXT_ACTION_FILE"
run_session_init
assert_file_missing "session-init clears next_action marker" "$NEXT_ACTION_FILE"

# ============================================================
echo ""
echo "=== Test Suite: AUTO_MODE=false + counter limits + fallback ==="
# ============================================================

echo "--- AC-006: auto_mode=false marker does not block ---"
cleanup
create_next_action_marker "false" "/tmp/test-project" "PLN-001" "mst:request"
run_guard '{"stop_hook_active": false}'
output="$(read_output)"
assert_empty "auto_mode=false marker -> allow" "$output"
assert_file_missing "auto_mode=false marker is cleaned up" "$NEXT_ACTION_FILE"

echo "--- AC-007: next_action dedicated counter limit (3) forces allow on 4th ---"
cleanup
probe_result="$(probe_next_action_counter_limit)"
probe_statuses="$(printf '%s\n' "$probe_result" | sed -n '1p')"
probe_counter="$(printf '%s\n' "$probe_result" | sed -n '2p')"
assert_eq "next_action counter sequence" "block,block,block,allow" "$probe_statuses"
next_counter_value="$probe_counter"
assert_eq "next_action counter reset after forced allow" "0" "$next_counter_value"

echo "--- AC-007: global counter limit (5) forces allow on 6th ---"
cleanup
probe_result="$(probe_global_counter_limit)"
probe_statuses="$(printf '%s\n' "$probe_result" | sed -n '1p')"
probe_counter="$(printf '%s\n' "$probe_result" | sed -n '2p')"
assert_eq "global counter sequence" "block,block,block,block,block,allow" "$probe_statuses"
global_counter_value="$probe_counter"
assert_eq "global counter reset after forced allow" "0" "$global_counter_value"

echo "--- AC-008: fallback reads plan.json when marker invalid ---"
cleanup
TEMP_PROJECT_ROOT="/tmp/mst-next-action-fallback-$$"
mkdir -p "$TEMP_PROJECT_ROOT/.gran-maestro/plans/PLN-888"
cat > "$TEMP_PROJECT_ROOT/.gran-maestro/plans/PLN-888/plan.json" <<EOF
{
  "id": "PLN-888",
  "title": "fallback test",
  "status": "active",
  "next_action": {
    "expected_skill": "mst:request",
    "source_skill": "mst:plan",
    "source_id": "PLN-888",
    "auto_mode": true,
    "project_root": "$TEMP_PROJECT_ROOT",
    "created_at": "2026-03-22T00:00:00Z"
  }
}
EOF
# invalid marker: expected_skill missing -> marker invalid, fallback should read plan.json
printf '{"source_skill":"mst:plan","source_id":"PLN-888","auto_mode":true,"project_root":"%s","created_at":"2026-03-22T00:00:00Z"}' \
  "$TEMP_PROJECT_ROOT" > "$NEXT_ACTION_FILE"
run_guard_with_env '{"stop_hook_active": false}' MST_NEXT_ACTION_FALLBACK_TIMEOUT_MS=200
output="$(read_output)"
assert_contains "plan.json fallback blocks when next_action exists" '"decision":"block"' "$output"
assert_contains "block reason indicates fallback(plan.json)" "fallback(plan.json)" "$output"

# ============================================================
echo ""
echo "=== Test Suite: backward compatibility ==="
# ============================================================

echo "--- plain text stdin with stack depth 0 -> allow ---"
cleanup
run_guard 'Hello, I completed the task.'
output="$(read_output)"
assert_empty "plain text with no stack/pending -> allow (empty)" "$output"

echo "--- plain text stdin with stack depth 2 -> block ---"
cleanup
printf '[{"skill":"mst:approve","pushed_at":"%s"},{"skill":"mst:claude","pushed_at":"%s"}]' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STACK_FILE"
run_guard 'Some assistant message'
output="$(read_output)"
assert_contains "plain text with stack depth 2 -> block" '"decision":"block"' "$output"

cleanup

echo ""
echo "==============================="
echo "Results: $PASS/$TOTAL passed, $FAIL failed"
echo "==============================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
