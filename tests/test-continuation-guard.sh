#!/usr/bin/env bash
set -euo pipefail

# Unit tests for mst-continuation-guard.sh, mst-skill-push.sh, mst-skill-pop.sh
# Tests: stop_hook_active parsing, PENDING_FILE next_step, push frame return_step

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
GUARD_SCRIPT="$SCRIPT_DIR/.claude/hooks/mst-continuation-guard.sh"
PUSH_SCRIPT="$SCRIPT_DIR/.claude/hooks/mst-skill-push.sh"
POP_SCRIPT="$SCRIPT_DIR/.claude/hooks/mst-skill-pop.sh"

PASS=0
FAIL=0
TOTAL=0

OUTFILE="/tmp/mst-test-output-$$.txt"

# Hooks use PPID to construct file paths. In a pipe like:
#   printf ... | bash "$SCRIPT" > "$OUTFILE"
# bash's PPID = this script's PID ($$).
MY_PID="$$"
STACK_FILE="/tmp/mst-call-stack-${MY_PID}.json"
COUNTER_FILE="/tmp/mst-stop-hook-count-${MY_PID}"
PENDING_FILE="/tmp/mst-pending-continuation-${MY_PID}"
DEBUG_LOG="/tmp/mst-hook-debug-${MY_PID}.log"

cleanup() {
  rm -f "$STACK_FILE" "${STACK_FILE}.tmp" "$COUNTER_FILE" "$PENDING_FILE" "${PENDING_FILE}.tmp" "$DEBUG_LOG" "$OUTFILE" 2>/dev/null || true
}

# Run hook and write stdout to OUTFILE (no subshell, so PPID stays consistent)
run_guard() {
  local input="$1"
  printf '%s' "$input" | bash "$GUARD_SCRIPT" > "$OUTFILE" 2>/dev/null || true
}

run_push() {
  local input="$1"
  printf '%s' "$input" | bash "$PUSH_SCRIPT" > /dev/null 2>/dev/null || true
}

run_pop() {
  local input="$1"
  printf '%s' "$input" | bash "$POP_SCRIPT" > /dev/null 2>/dev/null || true
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

echo "DEBUG: MY_PID=$MY_PID, STACK_FILE=$STACK_FILE, PENDING_FILE=$PENDING_FILE"

# ============================================================
echo "=== Test Suite: stop_hook_active parsing (AC-001, AC-002) ==="
# ============================================================

# AC-002: stop_hook_active=true -> allow (empty output)
echo "--- AC-002: stop_hook_active=true -> allow ---"
cleanup
run_guard '{"stop_hook_active": true}'
output="$(read_output)"
assert_empty "stop_hook_active=true produces empty output (allow)" "$output"

# AC-001: stop_hook_active=false -> should proceed to block logic
echo "--- AC-001: stop_hook_active=false with pending continuation -> block ---"
cleanup
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%FT%TZ)"
printf '{"parent_skill":"mst:approve","return_step":"Step 5","next_step":"Step 5: run pre-check","created_at":"%s"}' "$TIMESTAMP" > "$PENDING_FILE"
run_guard '{"stop_hook_active": false}'
output="$(read_output)"
assert_contains "stop_hook_active=false with pending -> block output" '"decision":"block"' "$output"

# AC-001 variant: stop_hook_active absent (unknown) -> fallback to existing logic
echo "--- AC-001 variant: stop_hook_active absent -> fallback logic ---"
cleanup
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%FT%TZ)"
printf '{"parent_skill":"mst:approve","return_step":"Step 5","next_step":"Step 5: run pre-check","created_at":"%s"}' "$TIMESTAMP" > "$PENDING_FILE"
run_guard 'some plain text message'
output="$(read_output)"
assert_contains "stop_hook_active absent with pending -> block output" '"decision":"block"' "$output"

# ============================================================
echo ""
echo "=== Test Suite: PENDING_FILE next_step in block message (AC-003, AC-004) ==="
# ============================================================

echo "--- AC-003: block message contains next_step ---"
cleanup
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%FT%TZ)"
printf '{"parent_skill":"mst:approve","return_step":"Step 5","next_step":"Step 5: run pre-check in worktree","created_at":"%s"}' "$TIMESTAMP" > "$PENDING_FILE"
run_guard '{"stop_hook_active": false}'
output="$(read_output)"
assert_contains "block reason includes next_step content" "Execute Step 5: run pre-check in worktree" "$output"

echo "--- AC-004: PENDING_FILE has next_step field after pop ---"
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
  next_step_val="$(python3 -c 'import json, sys
data = json.loads(sys.stdin.read())
print(data.get("next_step", ""))
' <<< "$pending_content" 2>/dev/null || echo "")"
  assert_contains "PENDING_FILE next_step has correct value" "Step 5" "$next_step_val"
else
  TOTAL=$((TOTAL + 1))
  echo "  FAIL: PENDING_FILE exists after pop"
  echo "    PENDING_FILE was not created"
  FAIL=$((FAIL + 1))
  TOTAL=$((TOTAL + 1))
  echo "  FAIL: PENDING_FILE next_step has correct value (skipped)"
  FAIL=$((FAIL + 1))
fi

# ============================================================
echo ""
echo "=== Test Suite: push frame return_step (AC-005) ==="
# ============================================================

echo "--- AC-005: push frame includes return_step ---"
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
  return_step_val="$(python3 -c 'import json, sys
data = json.loads(sys.stdin.read())
if isinstance(data, list) and data:
    print(data[-1].get("return_step", ""))
' <<< "$stack_content" 2>/dev/null || echo "")"
  assert_contains "push frame return_step has correct value" "Step 5" "$return_step_val"
else
  TOTAL=$((TOTAL + 1))
  echo "  FAIL: STACK_FILE exists after push"
  FAIL=$((FAIL + 1))
  TOTAL=$((TOTAL + 1))
  echo "  FAIL: push frame return_step has correct value (skipped)"
  FAIL=$((FAIL + 1))
fi

echo "--- AC-005 variant: push without --trace has no return_step ---"
cleanup
printf '[]' > "$STACK_FILE"
run_push '{"tool_name":"Skill","tool_input":{"skill":"mst:approve","args":"REQ-423"}}'
if [ -f "$STACK_FILE" ]; then
  stack_content="$(cat "$STACK_FILE")"
  no_return_step="$(python3 -c 'import json, sys
data = json.loads(sys.stdin.read())
if isinstance(data, list) and data:
    last = data[-1]
    if isinstance(last, dict) and not last.get("return_step"):
        print("yes")
    else:
        print("no")
else:
    print("no")
' <<< "$stack_content" 2>/dev/null || echo "no")"
  assert_eq "push without --trace has no return_step" "yes" "$no_return_step"
fi

# ============================================================
echo ""
echo "=== Test Suite: backward compatibility ==="
# ============================================================

echo "--- Backward compat: plain text stdin with stack depth 0 -> allow ---"
cleanup
run_guard 'Hello, I completed the task.'
output="$(read_output)"
assert_empty "plain text with no stack/pending -> allow (empty)" "$output"

echo "--- Backward compat: plain text with stack depth 2 -> block ---"
cleanup
printf '[{"skill":"mst:approve","pushed_at":"%s"},{"skill":"mst:claude","pushed_at":"%s"}]' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STACK_FILE"
run_guard 'Some assistant message'
output="$(read_output)"
assert_contains "plain text with stack depth 2 -> block" '"decision":"block"' "$output"

# ============================================================
cleanup

echo ""
echo "==============================="
echo "Results: $PASS/$TOTAL passed, $FAIL failed"
echo "==============================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
