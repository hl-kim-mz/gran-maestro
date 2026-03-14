#!/usr/bin/env python3
"""Gran Maestro CLI utility (mst.py)

Usage:
  python3 scripts/mst.py <subcommand> [options]

Subcommands:
  request list        [--active | --all | --completed] [--format table|json]
  request inspect     <REQ-ID>
  request history     [--all]
  request filter      [--phase N] [--status STATUS] [--priority LEVEL] [--format json]
  request count       [--active | --all | --completed]
  request cancel      <REQ-ID>

  plan list
  plan inspect       <PLN-ID>
  plan complete      <PLN-ID>
  plan count         [--active | --all]
  intent add         --feature TEXT --situation TEXT --goal TEXT [--motivation TEXT] [--req REQ-NNN] [--plan PLN-NNN]
  intent get         <INTENT-ID>
  intent list        [--req REQ-NNN] [--plan PLN-NNN]
  intent update      <INTENT-ID> [--feature TEXT] [--situation TEXT] [--motivation TEXT] [--goal TEXT]
                     [--req REQ-NNN] [--plan PLN-NNN] [--related-intent INTENT-ID] [--tag TAG] [--file PATH]
  intent delete      <INTENT-ID>
  intent search      <KEYWORD>
  intent lookup      --files <PATH...>
  intent related     <INTENT-ID> [--depth N]
  intent rebuild-index

  archive run         [--type req|idn|dsc|dbg|exp|pln|des|cap] [--max N] [--dir PATH]
  archive run-all     [--max N]
  archive list        [--type TYPE]
  archive restore     <ARCHIVE-ID>
  capture ttl-check

  counter next        [--type req|idn|dsc|dbg|exp|pln|des|cap|intent] [--dir PATH]
  counter peek        [--type req|idn|dsc|dbg|exp|pln|des|cap|intent]

  version get
  version check
  version bump        <patch|minor|major>

  context gather      [--diff N] [--skills] [--agents] [--format text|json]
  state set          --skill NAME --step N --total M [--return-to SKILL/STEP]
  state get
  state clear

  task set-commit     <TASK-ID> <commit hash> <commit message>

  agents check
  agents sync

  cleanup             [--dry-run]

  session list        [--type ideation|discussion|debug]
  session inspect     <SESSION-ID>
  session complete    <SESSION-ID>

  priority            <TASK-ID> [--before TASK-ID | --after TASK-ID]

  wait-files          <file1> [file2 ...] [--timeout SECONDS]
  resolve-model       <provider> <tier_or_section>
"""

import argparse
import copy
import hashlib
import json
import re
import os
import shutil
import subprocess
import sys
import glob
import tarfile
import time
from typing import Optional
from datetime import datetime, timezone, timedelta
from pathlib import Path


# ---------------------------------------------------------------------------
# Base directory discovery
# ---------------------------------------------------------------------------

def find_base_dir(start: Path = None) -> Path:
    """Walk up from start (or cwd) to find .gran-maestro/"""
    if start is None:
        start = Path.cwd()
    current = start.resolve()
    while True:
        candidate = current / ".gran-maestro"
        if candidate.is_dir():
            return candidate
        parent = current.parent
        if parent == current:
            print("Error: .gran-maestro/ directory not found in any ancestor directory.", file=sys.stderr)
            sys.exit(1)
        current = parent


BASE_DIR: Path = None  # resolved in main()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_json(path: Path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def save_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _plugin_root():
    """플러그인 루트 경로 반환 (scripts/ 상위)."""
    return Path(__file__).resolve().parent.parent


def deep_merge(base, override, depth=0):
    if depth > 20:
        return override

    if not isinstance(base, dict) or not isinstance(override, dict):
        return override

    result = dict(base)
    for key, override_value in override.items():
        base_value = base.get(key)
        if isinstance(base_value, dict) and isinstance(override_value, dict):
            result[key] = deep_merge(base_value, override_value, depth + 1)
        elif isinstance(override_value, list):
            result[key] = override_value
        else:
            result[key] = override_value
    return result


def requests_dir() -> Path:
    return BASE_DIR / "requests"


def plans_dir() -> Path:
    return BASE_DIR / "plans"


def iter_request_dirs(include_completed=False):
    """Yield (req_id, path, data) tuples."""
    for req_path in sorted(requests_dir().glob("REQ-*")):
        if not req_path.is_dir():
            continue
        rj = load_json(req_path / "request.json")
        if rj:
            yield rj.get("id", req_path.name), req_path, rj
    if include_completed:
        archived = type_archived_dir("req")
        if archived.exists():
            for arc_file in sorted(archived.glob("*.tar.gz")):
                try:
                    with tarfile.open(arc_file, "r:gz") as tar:
                        for member in tar.getmembers():
                            if (member.name.endswith("/request.json")
                                    and member.name.count("/") == 1):
                                f = tar.extractfile(member)
                                if f:
                                    rj = json.loads(f.read().decode("utf-8"))
                                    yield rj.get("id", member.name.split("/")[0]), arc_file, rj
                except Exception:
                    pass


def iter_plan_dirs():
    """Yield (pln_id, path, data) tuples."""
    pd = plans_dir()
    if not pd.exists():
        return
    for pln_path in sorted(pd.glob("PLN-*")):
        if not pln_path.is_dir():
            continue
        pj = load_json(pln_path / "plan.json")
        if pj:
            yield pj.get("id", pln_path.name), pln_path, pj


def format_table_row(req_id, data):
    status = data.get("status", "?")
    phase = data.get("current_phase", "?")
    title = (data.get("title") or "")[:55]
    return f"{req_id:<12} P{phase:<3} {status:<28} {title}"


# ---------------------------------------------------------------------------
# request subcommands
# ---------------------------------------------------------------------------

def cmd_request_list(args):
    rows = []
    include_completed = (args.scope == "all")
    for req_id, path, data in iter_request_dirs(include_completed):
        status = data.get("status", "")
        if args.scope == "active" and status == "completed":
            continue
        if args.scope == "completed" and status != "completed":
            continue
        rows.append((req_id, data))

    if args.format == "json":
        for req_id, data in rows:
            print(json.dumps({"id": req_id, **data}))
    else:
        print(f"{'ID':<12} {'Phase':<4} {'Status':<28} {'Title'}")
        print("-" * 80)
        for req_id, data in rows:
            print(format_table_row(req_id, data))
    return 0


def cmd_request_inspect(args):
    req_id = args.req_id.upper()
    for rid, path, data in iter_request_dirs(include_completed=True):
        if rid == req_id:
            print(json.dumps(data, ensure_ascii=False, indent=2))
            # also show task specs if present
            tasks_dir = path / "tasks"
            if tasks_dir.exists():
                for task_path in sorted(tasks_dir.iterdir()):
                    spec = task_path / "spec.md"
                    if spec.exists():
                        print(f"\n--- {task_path.name}/spec.md ---")
                        print(spec.read_text(encoding="utf-8")[:2000])
            return 0
    print(f"Error: {req_id} not found.", file=sys.stderr)
    return 1


def cmd_request_history(args):
    rows = []
    for req_id, path, data in iter_request_dirs(include_completed=True):
        if data.get("status") == "completed":
            rows.append((req_id, data))
    if not rows:
        print("No completed requests found.")
        return 0
    print(f"{'ID':<12} {'Status':<28} {'Title'}")
    print("-" * 80)
    for req_id, data in rows:
        print(format_table_row(req_id, data))
    return 0


def cmd_request_filter(args):
    for req_id, path, data in iter_request_dirs(include_completed=False):
        if args.phase is not None and data.get("current_phase") != args.phase:
            continue
        # pending_dependency는 --status 명시 없는 한 기본 제외
        if not args.status and data.get("status") == "pending_dependency":
            continue
        if args.status and data.get("status") != args.status:
            continue
        if args.priority and data.get("priority", "normal") != args.priority:
            continue
        if args.format == "json":
            print(json.dumps({"id": req_id, **data}))
        else:
            print(format_table_row(req_id, data))
    return 0


def cmd_request_count(args):
    count = 0
    include_completed = (args.scope == "all")
    for req_id, path, data in iter_request_dirs(include_completed):
        status = data.get("status", "")
        if args.scope == "active" and status == "completed":
            continue
        if args.scope == "completed" and status != "completed":
            continue
        count += 1
    print(count)
    return 0


def cmd_request_cancel(args):
    req_id = args.req_id.upper()
    for rid, path, data in iter_request_dirs(include_completed=True):
        if rid == req_id:
            if data.get("status") == "cancelled":
                print(f"{req_id} is already cancelled.")
                return 0
            from _state_manager import cancel
            cancel(BASE_DIR, req_id)
            print(f"Cancelled: {req_id}")
            return 0
    print(f"Error: {req_id} not found.", file=sys.stderr)
    return 1


def cmd_timestamp(args):
    """현재 UTC ISO 타임스탬프를 stdout 출력."""
    from _state_manager import timestamp_now
    print(timestamp_now())
    return 0


def cmd_set_status(args):
    """지정 ID의 status 필드 + updated_at 갱신."""
    from _state_manager import set_status
    set_status(BASE_DIR, args.id, args.status)
    return 0


def cmd_set_field(args):
    """지정 ID의 단일 JSON 필드 업데이트."""
    from _state_manager import set_field
    set_field(BASE_DIR, args.id, args.field, args.value)
    return 0


def _skill_state_base_dir() -> Path:
    local_base_dir = Path.cwd().resolve() / ".gran-maestro"
    if local_base_dir.exists():
        return local_base_dir
    if BASE_DIR and os.access(BASE_DIR, os.W_OK):
        return BASE_DIR
    return local_base_dir


def cmd_state_set(args):
    from _skill_state import set_snapshot

    state_base_dir = _skill_state_base_dir()
    data = set_snapshot(
        state_base_dir,
        skill=args.skill,
        step=args.step,
        total=args.total,
        return_to=args.return_to,
    )
    print(json.dumps(data, ensure_ascii=False, indent=2))
    return 0


def cmd_state_get(args):
    from _skill_state import get_snapshot

    data = get_snapshot(_skill_state_base_dir())
    if data is None:
        print("스냅샷 없음")
        return 0
    print(json.dumps(data, ensure_ascii=False, indent=2))
    return 0


def cmd_state_clear(args):
    from _skill_state import clear_snapshot

    clear_snapshot(_skill_state_base_dir())
    print("스냅샷 초기화 완료")
    return 0


def cmd_request_set_phase(args):
    """REQ의 current_phase와 status를 원자적으로 변경."""
    from _state_manager import set_phase
    set_phase(BASE_DIR, args.req_id, args.phase, args.status)
    print(f"{args.req_id}: phase={args.phase}, status={args.status}")
    return 0


def cmd_plan_list(args):
    rows = []
    for pln_id, path, data in iter_plan_dirs():
        status = data.get("status", "")
        if args.scope == "active" and status not in ("active", "in_progress"):
            continue
        rows.append((pln_id, data))

    print(f"{'ID':<10} {'Status':<12} {'Linked':<6} {'Title'}")
    print("-" * 80)
    for pln_id, data in rows:
        linked = data.get("linked_requests", [])
        linked_count = len(linked) if isinstance(linked, list) else 0
        title = (data.get("title") or "")[:55]
        print(f"{pln_id:<10} {data.get('status', ''):<12} {linked_count:<6} {title}")
    return 0


def cmd_plan_count(args):
    count = 0
    for pln_id, path, data in iter_plan_dirs():
        status = data.get("status", "")
        if args.scope == "active" and status not in ("active", "in_progress"):
            continue
        if args.scope == "completed" and status != "completed":
            continue
        count += 1
    print(count)
    return 0


def cmd_plan_inspect(args):
    pln_id = args.pln_id.upper()
    for pid, path, data in iter_plan_dirs():
        if pid == pln_id:
            print(json.dumps(data, ensure_ascii=False, indent=2))
            return 0
    print(f"Error: {pln_id} not found.", file=sys.stderr)
    return 1


def cmd_plan_sync(args):
    """plan.json의 linked_requests 전체가 done/completed이면 plan을 completed로 업데이트"""
    plan_id = args.plan_id.upper()
    for pid, path, data in iter_plan_dirs():
        if pid == plan_id:
            linked = data.get("linked_requests", [])
            if not linked:
                print(f"{plan_id}: linked_requests 없음, 스킵")
                return 0
            all_done = True
            for req_id in linked:
                req_path = requests_dir() / req_id / "request.json"
                if req_path.exists():
                    req_data = load_json(req_path)
                    st = req_data.get("status", "") if req_data else ""
                    if st not in ("done", "completed", "cancelled"):
                        all_done = False
                        break
                # 파일 없으면(아카이브된 경우) 완료로 간주
            if all_done:
                data["status"] = "completed"
                from datetime import datetime, timezone
                data["completed_at"] = datetime.now(timezone.utc).isoformat()
                save_json(path / "plan.json", data)
                print(f"{plan_id}: completed")
            else:
                print(f"{plan_id}: 미완료 REQ 있음, 스킵")
            return 0
    print(f"Error: {plan_id} not found.", file=sys.stderr)
    return 1


def cmd_plan_complete(args):
    pln_id = args.pln_id.upper()
    for pid, path, data in iter_plan_dirs():
        if pid == pln_id:
            if data.get("status") == "completed":
                print(f"{pln_id} is already completed.")
                return 0
            from _state_manager import complete
            complete(BASE_DIR, pln_id)
            print(f"Completed: {pln_id}")
            return 0
    print(f"Error: {pln_id} not found.", file=sys.stderr)
    return 1


def cmd_plan_render_review(args):
    """plan-review 템플릿을 치환해 prompts/review-{role}.md 파일로 생성한다."""
    pln_id = args.pln_id.upper()

    # 1. PLN 디렉토리 확인
    pln_dir = plans_dir() / pln_id
    if not pln_dir.exists():
        print(f"Error: {pln_id} not found.", file=sys.stderr)
        return 1

    # 2. plan_draft 취득 (파일 우선, 없으면 인라인 인자)
    if args.plan_draft_file:
        plan_draft = Path(args.plan_draft_file).read_text(encoding="utf-8")
    else:
        plan_draft = args.plan_draft or ""
    qa_summary = args.qa_summary or ""

    # 3. config에서 활성 역할 결정 (기본값 True = 모두 활성)
    config = load_json(BASE_DIR / "config.json") or {}
    plan_review = config.get("plan_review", {})
    roles_config = plan_review.get("roles", {})
    all_roles = ["architect", "devils_advocate", "completeness", "ux_reviewer"]
    active_roles = [
        r for r in all_roles
        if roles_config.get(r, {}).get("enabled", True)
    ]

    # 4. 템플릿 디렉토리 (PROJECT_ROOT/templates/plan-review/)
    # Path(__file__)을 기준으로 project_root 계산: scripts/mst.py → scripts/ → project_root
    # BASE_DIR.parent는 워크트리에서 항상 메인 repo 루트를 가리키므로 사용 불가
    project_root = Path(__file__).parent.parent
    template_dir = project_root / "templates" / "plan-review"

    # 5. prompts/ 디렉토리 생성
    prompts_dir = pln_dir / "prompts"
    prompts_dir.mkdir(parents=True, exist_ok=True)

    # 6. 각 역할별 템플릿 읽기 → 치환 → 파일 쓰기 → stdout 출력
    generated = []
    for role in active_roles:
        tmpl_path = template_dir / f"{role}.md"
        if not tmpl_path.exists():
            print(f"Warning: template not found: {tmpl_path}", file=sys.stderr)
            continue
        content = tmpl_path.read_text(encoding="utf-8")
        content = content.replace("{{PLAN_DRAFT}}", plan_draft)
        content = content.replace("{{QA_SUMMARY}}", qa_summary)
        content = content.replace("{{PLN_ID}}", pln_id)

        out_path = prompts_dir / f"review-{role}.md"
        out_path.write_text(content, encoding="utf-8")
        generated.append(str(out_path))
        print(str(out_path))

    return 0 if generated else 1


def _create_intent_store():
    try:
        from intent_store import FileIntentStore, IntentStoreError
    except ImportError as exc:
        print(
            f"Error: intent store dependency missing ({exc}). Install with: pip install pyyaml",
            file=sys.stderr,
        )
        return None, Exception
    except Exception as exc:
        print(f"Error: failed to initialize intent store ({exc})", file=sys.stderr)
        return None, Exception
    return FileIntentStore(BASE_DIR.parent), IntentStoreError


def _next_intent_id():
    cmd = [
        sys.executable,
        str(Path(__file__).resolve()),
        "counter",
        "next",
        "--type",
        "intent",
    ]
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        cwd=str(BASE_DIR.parent),
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "counter next failed")

    for line in reversed(result.stdout.splitlines()):
        if line.strip():
            return line.strip()
    raise RuntimeError("counter next produced no id")


def cmd_intent_add(args):
    store, store_error = _create_intent_store()
    if store is None:
        return 1

    try:
        intent_id = _next_intent_id()
        motivation = args.motivation if args.motivation is not None else args.goal
        created = store.add(
            intent_id,
            feature=args.feature,
            situation=args.situation,
            motivation=motivation,
            goal=args.goal,
            linked_req=args.req,
            linked_plan=args.plan,
            related_intent=args.related_intent,
            tags=args.tag,
            files=args.file,
        )
    except RuntimeError as exc:
        print(f"Error: failed to allocate intent id ({exc})", file=sys.stderr)
        return 1
    except store_error as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    if args.json:
        output = {k: v for k, v in created.items() if k not in ("path", "file")}
        print(json.dumps(output, ensure_ascii=False, indent=2))
    else:
        print(f"{created['id']} -> {created.get('path', created['id'])}")
    return 0


def cmd_intent_get(args):
    store, store_error = _create_intent_store()
    if store is None:
        return 1
    try:
        data = store.get(args.intent_id)
    except store_error as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    if data is None:
        print(f"Error: {args.intent_id} not found.", file=sys.stderr)
        return 1

    if args.json:
        output = {k: v for k, v in data.items() if k not in ("path", "file", "raw")}
        print(json.dumps(output, ensure_ascii=False, indent=2))
    else:
        meta = data.get("metadata", {})
        body = data.get("body", data.get("raw", ""))
        lines = ["---"]
        for key in ("id", "feature", "linked_req", "linked_plan", "related_intent", "tags", "files", "created_at"):
            val = meta.get(key)
            if isinstance(val, list):
                lines.append(f'{key}: {json.dumps(val, ensure_ascii=False)}')
            else:
                lines.append(f'{key}: {json.dumps(val, ensure_ascii=False)}')
        lines.append("---")
        lines.append(body)
        print("\n".join(lines))
    return 0


def cmd_intent_list(args):
    store, store_error = _create_intent_store()
    if store is None:
        return 1
    try:
        entries = store.list()
    except store_error as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    if args.req:
        entries = [entry for entry in entries if entry.get("linked_req") == args.req]
    if args.plan:
        entries = [entry for entry in entries if entry.get("linked_plan") == args.plan]

    if args.json:
        print(json.dumps(entries, ensure_ascii=False, indent=2))
        return 0

    if not entries:
        print("No intents found.")
        return 0

    print(f"{'ID':<12} {'Created':<12} {'Feature'}")
    print("-" * 80)
    for entry in entries:
        print(
            f"{entry.get('id', ''):<12} {entry.get('created_at', ''):<12} "
            f"{entry.get('feature', '')}"
        )
    return 0


def cmd_intent_update(args):
    store, store_error = _create_intent_store()
    if store is None:
        return 1

    update_fields = {}
    for key in ("feature", "situation", "motivation", "goal", "created_at"):
        value = getattr(args, key, None)
        if value is not None:
            update_fields[key] = value
    if args.req is not None:
        update_fields["linked_req"] = args.req
    if args.plan is not None:
        update_fields["linked_plan"] = args.plan
    if args.related_intent is not None:
        update_fields["related_intent"] = args.related_intent
    if args.tag is not None:
        update_fields["tags"] = args.tag
    if args.file is not None:
        update_fields["files"] = args.file

    if not update_fields:
        print("Error: no fields to update", file=sys.stderr)
        return 1

    try:
        updated = store.update(args.intent_id, **update_fields)
    except store_error as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    if args.json:
        output = {k: v for k, v in updated.items() if k not in ("path", "file")}
        print(json.dumps(output, ensure_ascii=False, indent=2))
    else:
        print(f"{updated['id']} -> {updated.get('path', updated['id'])}")
    return 0


def cmd_intent_delete(args):
    store, store_error = _create_intent_store()
    if store is None:
        return 1

    try:
        deleted = store.delete(args.intent_id)
    except store_error as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print(f"Deleted {deleted['id']}")
    return 0


def cmd_intent_search(args):
    store, store_error = _create_intent_store()
    if store is None:
        return 1
    try:
        matches = store.search(args.keyword)
    except store_error as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(matches, ensure_ascii=False, indent=2))
        return 0

    for match in matches:
        print(f"{match.get('id')}:{match.get('line')}:{match.get('text')}")
    return 0


def cmd_intent_lookup(args):
    store, store_error = _create_intent_store()
    if store is None:
        return 1
    try:
        entries = store.lookup(args.files)
    except store_error as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(entries, ensure_ascii=False, indent=2))
        return 0

    for entry in entries:
        files = ", ".join(entry.get("files", []))
        print(f"{entry.get('id')}: {files}")
    return 0


def cmd_intent_related(args):
    store, store_error = _create_intent_store()
    if store is None:
        return 1
    try:
        related = store.related(args.intent_id, depth=args.depth)
    except store_error as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(related, ensure_ascii=False, indent=2))
        return 0

    print(f"Source: {related.get('source')} (depth={related.get('depth')})")
    for item in related.get("related", []):
        reasons = ", ".join(item.get("reasons", []))
        print(f"{item.get('id')} [depth={item.get('depth')}] {reasons}")
    return 0


def cmd_intent_rebuild_index(args):
    store, store_error = _create_intent_store()
    if store is None:
        return 1
    try:
        index = store.rebuild_index()
    except store_error as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    entry_count = len(index.get("entries", []))
    print(f"Rebuilt .gran-maestro/intent/index.json ({entry_count} entries)")
    return 0


def cmd_session_split_prompts(args):
    if not args.prompts_dir:
        print("Error: directory not found", file=sys.stderr)
        return 1

    prompts_dir = Path(args.prompts_dir)
    if not prompts_dir.exists():
        print("Error: directory not found", file=sys.stderr)
        return 1

    combined_path = prompts_dir / "combined-prompts.txt"
    if not combined_path.exists():
        print("Error: combined-prompts.txt not found", file=sys.stderr)
        return 1

    content = combined_path.read_text(encoding="utf-8")
    marker_re = re.compile(r"^===SPLIT: (.+)===$")
    generated = []
    target_name = None
    target_lines = []

    for raw_line in content.splitlines(keepends=True):
        m = marker_re.match(raw_line.strip())
        if m:
            if target_name is not None:
                out_path = prompts_dir / target_name
                out_path.write_text("".join(target_lines).strip("\n\r"), encoding="utf-8")
                generated.append(str(out_path))
                print(str(out_path))
            target_name = m.group(1)
            target_lines = []
            continue

        if target_name is not None:
            target_lines.append(raw_line)

    if target_name is not None:
        out_path = prompts_dir / target_name
        out_path.write_text("".join(target_lines).strip("\n\r"), encoding="utf-8")
        generated.append(str(out_path))
        print(str(out_path))

    return 0


# ---------------------------------------------------------------------------
# counter subcommands
# ---------------------------------------------------------------------------

TYPE_DIRS = {
    "req": ("requests", "REQ"),
    "idn": ("ideation", "IDN"),
    "dsc": ("discussion", "DSC"),
    "dbg": ("debug", "DBG"),
    "exp": ("explore",   "EXP"),
    "pln": ("plans",     "PLN"),
    "des": ("designs",   "DES"),
    "cap": ("captures", "CAP"),
    "intent": ("intent", "INTENT"),
}
JSON_FILE_MAP = {"req": "request.json", "cap": "capture.json"}


def type_archived_dir(type_key: str) -> Path:
    subdir, _ = TYPE_DIRS.get(type_key, ("requests", "REQ"))
    return BASE_DIR / subdir / "archived"


def get_counter_path(type_key: str, dir_override: str = None) -> Path:
    if dir_override:
        return Path(dir_override) / "counter.json"
    subdir, _ = TYPE_DIRS.get(type_key, ("requests", "REQ"))
    return BASE_DIR / subdir / "counter.json"


def cmd_counter_next(args):
    counter_path = get_counter_path(args.type, args.dir)
    subdir, prefix = TYPE_DIRS.get(args.type, ("requests", "REQ"))
    scan_root = Path(args.dir) if args.dir else BASE_DIR / subdir
    disk_max = 0
    for path in scan_root.glob(f"{prefix}-*"):
        if args.type != "intent" and not path.is_dir():
            continue
        if args.type == "intent" and not (path.is_dir() or path.is_file()):
            continue
        try:
            n = int(path.name.split("-")[1])
        except (IndexError, ValueError):
            continue
        if n > disk_max:
            disk_max = n

    scan_root.mkdir(parents=True, exist_ok=True)
    data = load_json(counter_path) or {}
    last_id = max(data.get("last_id", 0), disk_max)
    next_id = last_id + 1
    save_json(counter_path, {"last_id": next_id})
    print(f"{prefix}-{next_id:03d}")
    return 0


def cmd_counter_peek(args):
    counter_path = get_counter_path(args.type, args.dir)
    data = load_json(counter_path) or {"last_id": 0}
    _, prefix = TYPE_DIRS.get(args.type, ("requests", "REQ"))
    last_id = data.get("last_id", 0)
    print(f"{prefix}-{last_id + 1:03d} (next, current last_id={last_id})")
    return 0


def _parse_utc_datetime(value):
    if not isinstance(value, str):
        return None
    try:
        normalized = value
        if normalized.endswith("Z"):
            normalized = normalized[:-1] + "+00:00"
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def _capture_is_plan_active(plan_id):
    if not plan_id:
        return False
    plan_data = load_json(plans_dir() / str(plan_id) / "plan.json")
    if not isinstance(plan_data, dict):
        return False
    return plan_data.get("status") in ("active", "in_progress")


def _capture_linked_requests_done(plan_id):
    if not plan_id:
        return False
    plan_data = load_json(plans_dir() / str(plan_id) / "plan.json")
    if not isinstance(plan_data, dict):
        return False
    linked_requests = plan_data.get("linked_requests")
    if not isinstance(linked_requests, list) or not linked_requests:
        return False

    for req_id in linked_requests:
        request_paths = [
            requests_dir() / req_id / "request.json",
            requests_dir() / "completed" / req_id / "request.json",
        ]
        req_path = next((p for p in request_paths if p.exists()), None)
        if req_path is None:
            return False
        req_data = load_json(req_path) or {}
        if req_data.get("status") not in ("completed", "cancelled"):
            return False
    return True


def _capture_expired(meta, now):
    created_at = _parse_utc_datetime(meta.get("created_at", "")) if isinstance(meta, dict) else None
    if created_at is None:
        return False
    ttl_expires_at = _parse_utc_datetime(meta.get("ttl_expires_at", ""))
    expires_at = ttl_expires_at or (created_at + timedelta(days=7))
    return now >= expires_at


def cmd_capture_ttl_check(args):
    captures_dir = BASE_DIR / "captures"
    if not captures_dir.exists():
        print("No captures directory.")
        return 0

    now = datetime.now(timezone.utc)
    warn_threshold = timedelta(hours=24)
    expired = []

    for cap_dir in sorted(captures_dir.glob("CAP-*")):
        if not cap_dir.is_dir():
            continue
        cap_path = cap_dir / "capture.json"
        meta = load_json(cap_path) or {}

        changed = False
        created_at = _parse_utc_datetime(meta.get("created_at", ""))
        if created_at is None:
            continue

        ttl_warned_at = _parse_utc_datetime(meta.get("ttl_warned_at", ""))
        if ttl_warned_at is None and now - created_at >= warn_threshold:
            meta["ttl_warned_at"] = now.isoformat()
            changed = True

        if _capture_expired(meta, now):
            linked_plan = (meta.get("linked_plan") or "").upper()
            if not _capture_is_plan_active(linked_plan):
                expired.append(cap_dir.name)

        if _capture_linked_requests_done(meta.get("linked_plan")):
            if meta.get("status") not in ("done", "cancelled"):
                meta["status"] = "done"
                changed = True

        if changed:
            save_json(cap_path, meta)

    if expired:
        print("Expired captures:")
        for name in expired:
            print(name)
    else:
        print("No expired captures.")
    return 0


# ---------------------------------------------------------------------------
# version subcommands
# ---------------------------------------------------------------------------

def _project_root() -> Path:
    cwd = Path.cwd().resolve()
    worktrees_root = BASE_DIR / "worktrees"

    candidate = cwd
    while (
        candidate != BASE_DIR
        and candidate != worktrees_root
        and candidate.parent != worktrees_root
        and candidate.parent != candidate
    ):
        candidate = candidate.parent

    if candidate.parent == worktrees_root:
        return candidate

    return BASE_DIR.parent


def _read_versions() -> dict:
    """5파일에서 버전 읽기."""
    root = _project_root()
    pkg = load_json(root / "package.json") or {}
    plugin = load_json(root / ".claude-plugin" / "plugin.json") or {}
    market = load_json(root / ".claude-plugin" / "marketplace.json") or {}
    ext_manifest = load_json(root / "extension" / "manifest.json") or {}
    ext_package = load_json(root / "extension" / "package.json") or {}
    return {
        "package":     pkg.get("version", ""),
        "plugin":      plugin.get("version", ""),
        "marketplace": (market.get("plugins") or [{}])[0].get("version", ""),
        "ext_manifest": ext_manifest.get("version", ""),
        "ext_package":  ext_package.get("version", ""),
    }


def cmd_version_get(args):
    versions = _read_versions()
    print(versions["package"])
    return 0


def cmd_version_check(args):
    versions = _read_versions()
    pkg = versions["package"]
    plugin = versions["plugin"]
    market = versions["marketplace"]
    ext_manifest = versions["ext_manifest"]
    ext_package = versions["ext_package"]
    if (
        pkg == plugin == market == ext_manifest == ext_package
        and pkg != ""
    ):
        print(f"✓ {pkg} (동기화됨)")
        return 0
    else:
        print(f"✗ 버전 불일치:")
        print(f"  package.json:              {pkg}")
        print(f"  plugin.json:               {plugin}")
        print(f"  marketplace.json:          {market}")
        print(f"  extension/manifest.json:   {ext_manifest}")
        print(f"  extension/package.json:    {ext_package}")
        return 1


def cmd_version_bump(args):
    versions = _read_versions()
    current = versions["package"]
    if not (
        current == versions["plugin"] == versions["marketplace"] == versions["ext_manifest"] == versions["ext_package"]
    ):
        print("Error: version mismatch")
        print(f"  package.json:              {versions['package']}")
        print(f"  plugin.json:               {versions['plugin']}")
        print(f"  marketplace.json:          {versions['marketplace']}")
        print(f"  extension/manifest.json:   {versions['ext_manifest']}")
        print(f"  extension/package.json:    {versions['ext_package']}")
        return 1

    parts = current.split(".")
    if len(parts) != 3:
        print(f"Error: cannot parse version '{current}'", file=sys.stderr)
        return 1
    try:
        major, minor, patch = int(parts[0]), int(parts[1]), int(parts[2])
    except ValueError:
        print(f"Error: cannot parse version '{current}'", file=sys.stderr)
        return 1

    level = args.level
    if level == "patch":
        patch += 1
    elif level == "minor":
        minor += 1
        patch = 0
    elif level == "major":
        major += 1
        minor = 0
        patch = 0
    else:
        print(f"Error: unknown bump level '{level}'", file=sys.stderr)
        return 1

    new_version = f"{major}.{minor}.{patch}"
    root = _project_root()

    # Update package.json
    pkg_path = root / "package.json"
    pkg_data = load_json(pkg_path) or {}
    pkg_data["version"] = new_version
    save_json(pkg_path, pkg_data)

    # Update plugin.json
    plugin_path = root / ".claude-plugin" / "plugin.json"
    plugin_data = load_json(plugin_path) or {}
    plugin_data["version"] = new_version
    save_json(plugin_path, plugin_data)

    # Update marketplace.json
    market_path = root / ".claude-plugin" / "marketplace.json"
    market_data = load_json(market_path) or {}
    plugins = market_data.get("plugins") or [{}]
    plugins[0]["version"] = new_version
    market_data["plugins"] = plugins
    save_json(market_path, market_data)

    # Update extension manifest
    ext_manifest_path = root / "extension" / "manifest.json"
    ext_manifest_data = load_json(ext_manifest_path) or {}
    ext_manifest_data["version"] = new_version
    save_json(ext_manifest_path, ext_manifest_data)

    # Update extension package.json
    ext_package_path = root / "extension" / "package.json"
    ext_package_data = load_json(ext_package_path) or {}
    ext_package_data["version"] = new_version
    save_json(ext_package_path, ext_package_data)

    print(new_version)
    return 0


# ---------------------------------------------------------------------------
# context subcommands
# ---------------------------------------------------------------------------

def cmd_context_gather(args):
    root = _project_root()

    # Git Status
    git_status_data = {"modified": 0, "added": 0, "deleted": 0}
    git_status_raw = None
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True, text=True, cwd=str(root)
        )
        if result.returncode == 0:
            lines = result.stdout.splitlines()
            for line in lines:
                if len(line) >= 2:
                    xy = line[:2]
                    if "M" in xy:
                        git_status_data["modified"] += 1
                    elif "A" in xy or "?" in xy:
                        git_status_data["added"] += 1
                    elif "D" in xy:
                        git_status_data["deleted"] += 1
            git_status_raw = lines
        else:
            git_status_raw = None
    except Exception:
        git_status_raw = None

    # Recent Changes
    diff_n = getattr(args, "diff", 1) or 1
    recent_changes = []
    try:
        result = subprocess.run(
            ["git", "diff", f"HEAD~{diff_n}..HEAD", "--name-only"],
            capture_output=True, text=True, cwd=str(root)
        )
        if result.returncode == 0:
            recent_changes = [l for l in result.stdout.splitlines() if l.strip()]
        else:
            recent_changes = None
    except Exception:
        recent_changes = None

    # Version
    versions = _read_versions()
    version_synced = (
        versions["package"]
        == versions["plugin"]
        == versions["marketplace"]
        == versions["ext_manifest"]
        == versions["ext_package"]
        and versions["package"] != ""
    )

    # Skills
    skills_list = []
    skills_dir = root / "skills"
    if skills_dir.exists():
        for skill_dir in sorted(skills_dir.iterdir()):
            if not skill_dir.is_dir():
                continue
            skill_md = skill_dir / "SKILL.md"
            if skill_md.exists():
                skill_name = None
                try:
                    for line in skill_md.read_text(encoding="utf-8").splitlines():
                        line = line.strip()
                        if line.startswith("name:"):
                            skill_name = line[5:].strip().strip('"').strip("'")
                            break
                except Exception:
                    pass
                skills_list.append(skill_name if skill_name else skill_dir.name)
            else:
                skills_list.append(skill_dir.name)

    # Agents
    agents_list = []
    agents_dir = root / "agents"
    if agents_dir.exists():
        for agent_file in sorted(agents_dir.glob("*.md")):
            agents_list.append(agent_file.stem)

    fmt = getattr(args, "format", "text") or "text"
    include_skills = getattr(args, "skills", True)
    include_agents = getattr(args, "agents", True)

    if fmt == "json":
        output = {
            "git_status": git_status_data if git_status_raw is not None else "(git 없음)",
            "recent_changes": recent_changes if recent_changes is not None else "(git 없음)",
            "version": {
                "package":     versions["package"],
                "plugin":      versions["plugin"],
                "marketplace": versions["marketplace"],
                "synced":      version_synced,
            },
        }
        if include_skills:
            output["skills"] = skills_list
        if include_agents:
            output["agents"] = agents_list
        print(json.dumps(output, ensure_ascii=False, indent=2))
    else:
        # text format
        print("## Git Status")
        if git_status_raw is None:
            print("(git 없음)")
        else:
            print(f"Modified: {git_status_data['modified']} | Added: {git_status_data['added']} | Deleted: {git_status_data['deleted']}")
        print()

        print(f"## Recent Changes (HEAD~{diff_n}..HEAD)")
        if recent_changes is None:
            print("(git 없음)")
        elif recent_changes:
            for f in recent_changes:
                print(f)
        else:
            print("(변경 없음)")
        print()

        print("## Version")
        print(f"package.json:      {versions['package']}")
        print(f"plugin.json:       {versions['plugin']}")
        print(f"marketplace.json:  {versions['marketplace']}")
        print("✓ 동기화됨" if version_synced else "✗ 불일치")
        print()

        if include_skills:
            print(f"## Skills ({len(skills_list)})")
            print(", ".join(skills_list) if skills_list else "(없음)")
            print()

        if include_agents:
            print(f"## Agents ({len(agents_list)})")
            print(", ".join(agents_list) if agents_list else "(없음)")
            print()

    return 0


# ---------------------------------------------------------------------------
# agents subcommands
# ---------------------------------------------------------------------------

def cmd_agents_check(args):
    root = _project_root()
    agents_dir = root / "agents"
    fs_agents = set()
    if agents_dir.exists():
        for f in agents_dir.glob("*.md"):
            fs_agents.add(f"./agents/{f.name}")

    plugin_path = root / ".claude-plugin" / "plugin.json"
    plugin_data = load_json(plugin_path) or {}
    plugin_agents = set(plugin_data.get("agents") or [])

    missing = fs_agents - plugin_agents   # in fs but not in plugin.json
    ghost = plugin_agents - fs_agents     # in plugin.json but not in fs

    if not missing and not ghost:
        print(f"✓ agents 배열 동기화됨 ({len(fs_agents)}개)")
        return 0

    for entry in sorted(missing):
        print(f"+ {entry}")
    for entry in sorted(ghost):
        print(f"- {entry}")
    return 1


def cmd_agents_sync(args):
    root = _project_root()
    agents_dir = root / "agents"
    fs_agents = []
    if agents_dir.exists():
        for f in sorted(agents_dir.glob("*.md")):
            fs_agents.append(f"./agents/{f.name}")

    plugin_path = root / ".claude-plugin" / "plugin.json"
    plugin_data = load_json(plugin_path) or {}
    plugin_data["agents"] = fs_agents
    save_json(plugin_path, plugin_data)
    print(f"Updated agents: {fs_agents}")
    return 0


# ---------------------------------------------------------------------------
# archive subcommands
# ---------------------------------------------------------------------------

def cmd_archive_run(args):
    type_key = getattr(args, "type", None) or "req"
    max_active = args.max or 20
    _archive_run_type(type_key, max_active, emit_output=True)
    return 0


def _load_archive_max_active(cli_max: Optional[int]) -> int:
    if cli_max is not None:
        return cli_max

    config_paths = [
        BASE_DIR / ".." / ".gran-maestro" / "config.json",
        BASE_DIR.parent / "config.json",
    ]
    cfg = None
    for path in config_paths:
        loaded = load_json(path)
        if loaded is not None:
            cfg = loaded
            break

    max_active = 20
    if isinstance(cfg, dict):
        max_active = cfg.get("archive", {}).get("max_active_sessions", 20)
    try:
        max_active = int(max_active)
    except (TypeError, ValueError):
        max_active = 20
    return max_active


def _archive_run_type(type_key: str, max_active: int, emit_output: bool) -> int:
    subdir, prefix = TYPE_DIRS.get(type_key, ("requests", "REQ"))
    src_dir = BASE_DIR / subdir
    dst_dir = type_archived_dir(type_key)
    dst_dir.mkdir(parents=True, exist_ok=True)

    dirs = sorted(src_dir.glob(f"{prefix}-*"))
    json_file = JSON_FILE_MAP.get(type_key, "session.json")

    if type_key == "cap":
        now = datetime.now(timezone.utc)
        to_archive = []
        for d in dirs:
            if not d.is_dir():
                continue
            data = load_json(d / json_file) or {}
            if not _capture_expired(data, now):
                continue
            linked_plan = (data.get("linked_plan") or "").upper()
            if not _capture_is_plan_active(linked_plan):
                to_archive.append(d)
    else:
        completed = [d for d in dirs if d.is_dir() and
                     (load_json(d / json_file) or {}).get("status") in ("completed", "cancelled")]

        if len(dirs) - len(completed) <= max_active:
            if emit_output:
                print("No archiving needed.")
            return 0

        to_archive = completed[:len(dirs) - max_active]

    if not to_archive:
        if emit_output:
            if type_key == "cap":
                print("No captures to archive.")
            else:
                print("No completed sessions to archive.")
        return 0

    ids = [d.name for d in to_archive]
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    archive_name = f"{subdir}-{ids[0]}-to-{ids[-1]}-{timestamp}.tar.gz"
    archive_path = dst_dir / archive_name

    if type_key == "cap":
        for d in to_archive:
            cap_json = d / json_file
            cap_data = load_json(cap_json) or {}
            cap_data["status"] = "archived"
            save_json(cap_json, cap_data)

    with tarfile.open(archive_path, "w:gz") as tar:
        for d in to_archive:
            tar.add(d, arcname=d.name)

    for d in to_archive:
        shutil.rmtree(d)

    if emit_output:
        print(f"Archived {len(to_archive)} sessions → {archive_name}")
    return len(to_archive)


def cmd_archive_run_all(args):
    max_active = _load_archive_max_active(args.max)

    counts = {}
    had_error = False
    for type_key in TYPE_DIRS:
        try:
            counts[type_key] = _archive_run_type(type_key, max_active=max_active, emit_output=False)
        except Exception as exc:
            print(f"[Archive] {type_key} 정리 실패: {exc}", file=sys.stderr)
            counts[type_key] = 0
            had_error = True

    if sum(counts.values()) == 0 and not had_error:
        print("[Archive] 정리 대상 없음")
        return 0

    summary = ", ".join(f"{k}:{counts[k]}" for k in counts.keys())
    print(f"[Archive] 전체 정리 완료 — {summary}")
    return 0


def cmd_archive_list(args):
    has_any = False
    filter_type = getattr(args, "type", None)
    for type_key, (subdir, _) in TYPE_DIRS.items():
        if filter_type and filter_type != type_key:
            continue
        archived = type_archived_dir(type_key)
        if not archived.exists():
            continue
        for a in sorted(archived.glob("*.tar.gz")):
            size_kb = a.stat().st_size // 1024
            print(f"{a.name:<60} {size_kb:>6} KB")
            has_any = True
    if not has_any:
        print("No archives found.")
    return 0


def cmd_archive_restore(args):
    target = args.archive_id.upper()
    prefix = target[:3]
    prefix_to_type = {"REQ": "req", "IDN": "idn", "DSC": "dsc", "DBG": "dbg", "CAP": "cap"}
    type_key = prefix_to_type.get(prefix, "req")
    subdir, _ = TYPE_DIRS.get(type_key, ("requests", "REQ"))
    archived = type_archived_dir(type_key)
    restore_dir = BASE_DIR / subdir

    for arc in sorted(archived.glob("*.tar.gz")):
        with tarfile.open(arc, "r:gz") as tar:
            names = tar.getnames()
            matching = [n for n in names if n.startswith(target + "/") or n == target]
            if matching:
                tar.extractall(path=restore_dir, members=[tar.getmember(n) for n in matching])
                print(f"Restored {target} from {arc.name}")
                return 0
    print(f"Error: {args.archive_id} not found in any archive.", file=sys.stderr)
    return 1


# ---------------------------------------------------------------------------
# cleanup subcommand
# ---------------------------------------------------------------------------

def cmd_cleanup(args):
    dirs = sorted(requests_dir().glob("REQ-*"))
    stale = []
    for d in dirs:
        if not d.is_dir():
            continue
        data = load_json(d / "request.json") or {}
        if data.get("status") in ("completed", "cancelled"):
            stale.append((d, data))

    if not stale:
        print("Nothing to clean up.")
        return 0

    print(f"Found {len(stale)} completed/cancelled sessions:")
    for d, data in stale:
        print(f"  {d.name}: {data.get('title', '')[:50]}")

    if args.dry_run:
        print("[dry-run] No changes made.")
        return 0

    dst_dir = type_archived_dir("req")
    dst_dir.mkdir(parents=True, exist_ok=True)
    ids = [d.name for d in stale]
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    if len(ids) == 1:
        archive_name = f"requests-{ids[0]}-{timestamp}.tar.gz"
    else:
        archive_name = f"requests-{ids[0]}-to-{ids[-1]}-{timestamp}.tar.gz"
    archive_path = dst_dir / archive_name

    with tarfile.open(archive_path, "w:gz") as tar:
        for d, _ in stale:
            tar.add(d, arcname=d.name)

    for d, _ in stale:
        shutil.rmtree(d)

    print(f"Archived {len(stale)} sessions → {archive_name}")
    return 0


# ---------------------------------------------------------------------------
# session subcommands
# ---------------------------------------------------------------------------

def cmd_session_list(args):
    session_type = args.type
    type_map = {"ideation": ("ideation", "IDN"), "discussion": ("discussion", "DSC"), "debug": ("debug", "DBG")}
    types_to_scan = [type_map[session_type]] if session_type in type_map else list(type_map.values())

    for subdir, prefix in types_to_scan:
        sdir = BASE_DIR / subdir
        if not sdir.exists():
            continue
        for sess in sorted(sdir.glob(f"{prefix}-*")):
            if not sess.is_dir():
                continue
            sj = load_json(sess / "session.json") or {}
            topic = (sj.get("topic") or sj.get("title") or "")[:50]
            print(f"{sess.name:<15} {subdir:<12} {topic}")
    return 0


def cmd_session_inspect(args):
    sess_id = args.session_id.upper()
    prefix = sess_id[:3]
    type_map = {"IDN": "ideation", "DSC": "discussion", "DBG": "debug"}
    subdir = type_map.get(prefix, "ideation")
    sess_path = BASE_DIR / subdir / sess_id
    if not sess_path.exists():
        print(f"Error: {sess_id} not found.", file=sys.stderr)
        return 1
    sj = load_json(sess_path / "session.json")
    if sj:
        print(json.dumps(sj, ensure_ascii=False, indent=2))
    return 0


def cmd_session_complete(args):
    sess_id = args.session_id.upper()
    prefix = sess_id[:3]
    type_map = {"IDN": "ideation", "DSC": "discussion", "DBG": "debug"}
    subdir = type_map.get(prefix)
    if subdir is None:
        print(f"Error: Unknown session type '{prefix}'. Expected IDN/DSC/DBG.", file=sys.stderr)
        return 1
    sess_path = BASE_DIR / subdir / sess_id
    if not sess_path.exists():
        print(f"Error: {sess_id} not found.", file=sys.stderr)
        return 1
    sj = load_json(sess_path / "session.json")
    if sj is None:
        print(f"Error: session.json not found for {sess_id}.", file=sys.stderr)
        return 1
    if sj.get("status") == "completed":
        print(f"{sess_id} is already completed.")
        return 0
    from _state_manager import complete
    complete(BASE_DIR, sess_id)
    print(f"Completed: {sess_id}")
    return 0


# ---------------------------------------------------------------------------
# notify subcommand
# ---------------------------------------------------------------------------

def cmd_notify(args):
    from _notifier import notify
    data = json.loads(args.data) if args.data else {}
    ok = notify(args.event_type, data)
    if ok:
        print(f"notify: {args.event_type} 전송됨")
    else:
        print(f"notify: {args.event_type} 실패 (서버 미실행 또는 연결 오류)")
    return 0


# ---------------------------------------------------------------------------
# wait-files subcommand
# ---------------------------------------------------------------------------

def cmd_wait_files(args):
    files = args.files
    total = len(files)

    # 타임아웃 우선순위: CLI 인자 > config.json > 기본값 600s
    cfg = load_json(BASE_DIR / "config.json") or {}
    if args.timeout is not None:
        timeout_s = args.timeout
    else:
        timeout_ms = cfg.get("timeouts", {}).get("wait_files_ms", 600000)
        timeout_s = timeout_ms / 1000
    min_content_wait = cfg.get("min_content_wait", 5)
    try:
        min_content_wait = float(min_content_wait)
    except (TypeError, ValueError):
        min_content_wait = 5

    completed = set()
    empty_files_seen = {}
    start = time.time()

    while time.time() - start < timeout_s:
        for f in files:
            if f in completed:
                continue

            if os.path.exists(f):
                size = os.path.getsize(f)
                if size > 0:
                    completed.add(f)
                    name = os.path.basename(f)
                    print(f"[{len(completed)}/{total}] {name} 완료", flush=True)
                else:
                    now = time.time()
                    if f not in empty_files_seen:
                        empty_files_seen[f] = now
                    elif min_content_wait > 0 and now - empty_files_seen[f] < min_content_wait:
                        continue
                    # 빈 파일이 생성되어도 즉시 완료로 처리하지 않고 재확인
            else:
                empty_files_seen.pop(f, None)

        if len(completed) == total:
            print("ALL_READY", flush=True)
            return 0

        time.sleep(1)

    print(f"TIMEOUT ({len(completed)}/{total})", flush=True)
    return 1


def cmd_stitch_sleep(args):
    """Stitch 비동기 생성 대기용 인터벌 sleep."""
    interval = args.interval
    print(f"[Stitch] {interval}초 대기 중...", flush=True)
    time.sleep(interval)
    print("SLEEP_DONE", flush=True)
    return 0


# ---------------------------------------------------------------------------
# priority subcommand
# ---------------------------------------------------------------------------

def cmd_priority(args):
    task_id = args.task_id.upper()
    parts = task_id.split("-")
    if len(parts) != 3:
        print(f"Error: invalid task ID '{args.task_id}'. Expected REQ-XXX-YY format.", file=sys.stderr)
        return 1

    req_id = f"{parts[0]}-{parts[1]}"
    task_num = parts[2]

    status_paths = [
        BASE_DIR / "requests" / req_id / "tasks" / task_num / "status.json",
        BASE_DIR / "requests" / "completed" / req_id / "tasks" / task_num / "status.json",
    ]
    status_path = next((p for p in status_paths if p.exists()), None)
    if status_path is None:
        print(f"Error: task {args.task_id} not found", file=sys.stderr)
        return 1

    data = load_json(status_path)
    if data is None:
        print(f"Error: failed to load status.json for {args.task_id}", file=sys.stderr)
        return 1

    if args.before:
        data["priority"] = "high"
        data["priority_before"] = args.before.upper()
        data.pop("priority_after", None)
    elif args.after:
        data["priority"] = "low"
        data["priority_after"] = args.after.upper()
        data.pop("priority_before", None)
    else:
        data["priority"] = "normal"
        data.pop("priority_before", None)
        data.pop("priority_after", None)

    save_json(status_path, data)
    print(f"priority updated: {task_id}")
    return 0


def cmd_task_set_commit(args):
    task_id = args.task_id.upper()
    match = re.match(r"^(REQ-\d+)-T(\d{2})$", task_id)
    if not match:
        print(
            f"Error: invalid task ID '{args.task_id}'. "
            "Expected REQ-NNN-TNN format.",
            file=sys.stderr
        )
        return 1

    if not args.commit_hash:
        print("Error: commit hash is required.", file=sys.stderr)
        return 1

    req_id = match.group(1)

    request_paths = [
        BASE_DIR / "requests" / req_id / "request.json",
        BASE_DIR / "requests" / "completed" / req_id / "request.json",
    ]
    request_path = next((p for p in request_paths if p.exists()), None)
    if request_path is None:
        print(f"Error: request.json not found for {req_id}", file=sys.stderr)
        return 1

    data = load_json(request_path)
    if data is None:
        print(f"Error: failed to load request.json for {req_id}", file=sys.stderr)
        return 1

    tasks = data.get("tasks")
    if not isinstance(tasks, list):
        print(f"Error: tasks field not found in {request_path}", file=sys.stderr)
        return 1

    for task in tasks:
        if isinstance(task, dict) and task.get("id", "").upper() == task_id:
            task["commit_hash"] = args.commit_hash
            task["commit_message"] = args.commit_message or ""
            break
    else:
        print(f"Error: task {task_id} not found in request.json", file=sys.stderr)
        return 1

    save_json(request_path, data)
    print(f"commit metadata saved: {task_id}")
    return 0


def _load_resolve_model_config():
    plugin_root = _plugin_root()
    config_paths = [
        BASE_DIR / "config.resolved.json",
        plugin_root / "templates" / "defaults" / "config.json",
    ]
    for path in config_paths:
        config = load_json(path)
        if isinstance(config, dict):
            return config
    return {}


def _resolve_provider_default_model(provider, provider_cfg):
    if isinstance(provider_cfg, dict):
        default_tier = provider_cfg.get("default_tier")
        if isinstance(default_tier, str):
            default_model = provider_cfg.get(default_tier)
            if isinstance(default_model, str) and default_model:
                return default_model

    hardcoded = {
        "codex": "gpt-5.3-codex",
        "gemini": "gemini-3.1-pro-preview",
        "claude": "claude-sonnet-4-6",
    }
    return hardcoded.get(provider, hardcoded["codex"])


def cmd_resolve_model(args):
    provider = str(args.provider or "").strip().lower()
    tier_or_section = str(args.tier_or_section or "").strip().lower()

    config = _load_resolve_model_config()
    models_cfg = config.get("models", {}) if isinstance(config, dict) else {}
    providers_cfg = models_cfg.get("providers", {}) if isinstance(models_cfg, dict) else {}
    provider_cfg = providers_cfg.get(provider) if isinstance(providers_cfg, dict) else None

    fallback_model = _resolve_provider_default_model(provider, provider_cfg)

    if not isinstance(provider_cfg, dict):
        print(f"Warning: unknown provider '{provider}', using fallback model", file=sys.stderr)
        print(fallback_model)
        return 0

    default_tier = provider_cfg.get("default_tier")
    if not isinstance(default_tier, str):
        default_tier = None

    resolved_tier = None

    if tier_or_section == "default":
        resolved_tier = default_tier
    else:
        section_cfg = config.get(tier_or_section, {})
        is_section = isinstance(section_cfg, dict) and isinstance(section_cfg.get("agents"), dict)
        if is_section:
            agents_cfg = section_cfg.get("agents", {})
            provider_agent_cfg = agents_cfg.get(provider, {})
            if isinstance(provider_agent_cfg, dict):
                section_tier = provider_agent_cfg.get("tier")
                if isinstance(section_tier, str):
                    resolved_tier = section_tier
            if not isinstance(resolved_tier, str):
                resolved_tier = default_tier
        else:
            resolved_tier = tier_or_section

    model = provider_cfg.get(resolved_tier) if isinstance(resolved_tier, str) else None
    if isinstance(model, str) and model:
        print(model)
        return 0

    print(
        f"Warning: unknown tier/section '{tier_or_section}' for provider '{provider}', "
        "using fallback model",
        file=sys.stderr,
    )
    print(fallback_model)
    return 0


LEGACY_AGENT_SECTIONS = ["debug", "explore", "discussion", "ideation", "prereview"]
LEGACY_MODEL_KEYS = ["claude", "codex", "gemini", "developer", "reviewer"]
CLAUDE_MODEL_TO_TIER = {
    "opus": "premium",
    "sonnet": "economy",
    "haiku": "economy",
}


def _load_json_strict(path: Path, required=True):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        if required:
            print(f"Error: file not found: {path}", file=sys.stderr)
            raise SystemExit(1)
        return None
    except json.JSONDecodeError as exc:
        print(f"Error: invalid JSON in {path}: {exc}", file=sys.stderr)
        raise SystemExit(1)
    except OSError as exc:
        print(f"Error: failed to read {path}: {exc}", file=sys.stderr)
        raise SystemExit(1)


def _compact_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _has_legacy_format(config):
    if not isinstance(config, dict):
        return False

    for section in LEGACY_AGENT_SECTIONS:
        agents = config.get(section, {}).get("agents", {})
        if not isinstance(agents, dict):
            continue
        for value in agents.values():
            if isinstance(value, (int, float)):
                return True

    models = config.get("models", {})
    if isinstance(models, dict):
        for legacy_key in LEGACY_MODEL_KEYS:
            if legacy_key in models:
                return True

    code_review = config.get("code_review", {})
    if isinstance(code_review, dict) and isinstance(code_review.get("agent_roster"), str):
        return True

    phase1 = config.get("phase1_exploration", {})
    roles = phase1.get("roles", {}) if isinstance(phase1, dict) else {}
    if isinstance(roles, dict):
        for role_cfg in roles.values():
            if isinstance(role_cfg, dict) and "model" in role_cfg:
                return True

    return False


def _provider_model_to_tier(provider, model_name, default_providers):
    if not isinstance(provider, str) or not isinstance(model_name, str):
        return None

    if provider == "claude" and model_name in CLAUDE_MODEL_TO_TIER:
        return CLAUDE_MODEL_TO_TIER[model_name]

    provider_defaults = default_providers.get(provider)
    if isinstance(provider_defaults, dict):
        for tier, tier_model in provider_defaults.items():
            if tier == "default_tier":
                continue
            if isinstance(tier_model, str) and tier_model == model_name:
                return tier

    return None


def _prune_empty_dicts(node):
    if not isinstance(node, dict):
        return
    for key in list(node.keys()):
        value = node.get(key)
        if isinstance(value, dict):
            _prune_empty_dicts(value)
            if not value:
                del node[key]


def _ensure_roles_dict(models):
    roles = models.get("roles")
    if roles is None:
        models["roles"] = {}
        return models["roles"]
    if isinstance(roles, dict):
        return roles
    return None


def _default_section_claude_tier(defaults, section):
    section_cfg = defaults.get(section, {}) if isinstance(defaults, dict) else {}
    agents = section_cfg.get("agents", {}) if isinstance(section_cfg, dict) else {}
    claude_cfg = agents.get("claude", {}) if isinstance(agents, dict) else {}
    if isinstance(claude_cfg, dict):
        tier = claude_cfg.get("tier")
        if isinstance(tier, str):
            return tier
    return None


def _migrate_config(config, defaults):
    migrated = copy.deepcopy(config) if isinstance(config, dict) else {}
    warnings = []

    def warn(message):
        warnings.append(message)

    defaults_models = defaults.get("models", {}) if isinstance(defaults, dict) else {}
    default_providers = defaults_models.get("providers", {}) if isinstance(defaults_models, dict) else {}
    default_roles = defaults_models.get("roles", {}) if isinstance(defaults_models, dict) else {}

    for section in LEGACY_AGENT_SECTIONS:
        section_cfg = migrated.get(section)
        if not isinstance(section_cfg, dict):
            continue
        agents = section_cfg.get("agents")
        if not isinstance(agents, dict):
            continue

        for provider, raw_value in list(agents.items()):
            if not isinstance(raw_value, (int, float)):
                continue

            provider_defaults = default_providers.get(provider)
            if not isinstance(provider_defaults, dict):
                warn(
                    f"수동 확인 필요: {section}.agents.{provider}={_compact_json(raw_value)}"
                )
                continue

            if isinstance(raw_value, bool):
                count = int(raw_value)
                warn(
                    f"{section}.agents.{provider}: bool 값을 count={count}로 보정"
                )
            else:
                count = int(raw_value)
                if raw_value < 0 or (
                    isinstance(raw_value, float) and not raw_value.is_integer()
                ):
                    warn(
                        f"{section}.agents.{provider}: {raw_value} 값을 count={max(0, count)}로 보정"
                    )
                if count < 0:
                    count = 0

            if count == 0:
                agents[provider] = {"count": 0}
                continue

            default_tier = provider_defaults.get("default_tier")
            if not isinstance(default_tier, str) or not default_tier:
                warn(
                    f"수동 확인 필요: {section}.agents.{provider}={_compact_json(raw_value)}"
                )
                continue
            agents[provider] = {"count": count, "tier": default_tier}

    models = migrated.get("models")
    if isinstance(models, dict):
        legacy_claude = models.get("claude")
        if isinstance(legacy_claude, dict):
            for role, model_name in list(legacy_claude.items()):
                legacy_key = f"models.claude.{role}"
                if role in LEGACY_AGENT_SECTIONS:
                    mapped_tier = _provider_model_to_tier("claude", model_name, default_providers)
                    if not isinstance(mapped_tier, str):
                        warn(f"수동 확인 필요: {legacy_key}={_compact_json(model_name)}")
                        continue

                    section_cfg = migrated.get(role)
                    agents = section_cfg.get("agents") if isinstance(section_cfg, dict) else None
                    claude_cfg = agents.get("claude") if isinstance(agents, dict) else None

                    count = 0
                    if isinstance(claude_cfg, dict):
                        raw_count = claude_cfg.get("count")
                        if isinstance(raw_count, bool):
                            count = int(raw_count)
                        elif isinstance(raw_count, (int, float)):
                            count = int(raw_count)
                    elif isinstance(claude_cfg, bool):
                        count = int(claude_cfg)
                    elif isinstance(claude_cfg, (int, float)):
                        count = int(claude_cfg)

                    if count > 0:
                        default_section_tier = _default_section_claude_tier(defaults, role)
                        if mapped_tier != default_section_tier:
                            if isinstance(claude_cfg, dict):
                                if "tier" not in claude_cfg:
                                    claude_cfg["tier"] = mapped_tier
                            elif isinstance(agents, dict) and "claude" not in agents:
                                agents["claude"] = {"count": count, "tier": mapped_tier}
                            else:
                                warn(f"수동 확인 필요: {legacy_key}={_compact_json(model_name)}")
                                continue

                    del legacy_claude[role]
                    continue

                roles_cfg = models.get("roles")
                if isinstance(roles_cfg, dict) and role in roles_cfg:
                    del legacy_claude[role]
                    continue

                mapped_tier = _provider_model_to_tier("claude", model_name, default_providers)
                if not isinstance(mapped_tier, str):
                    warn(f"수동 확인 필요: {legacy_key}={_compact_json(model_name)}")
                    continue

                default_role_cfg = default_roles.get(role) if isinstance(default_roles, dict) else None
                if isinstance(default_role_cfg, dict):
                    default_provider = default_role_cfg.get("provider")
                    default_tier = default_role_cfg.get("tier")
                    if default_provider == "claude" and default_tier == mapped_tier:
                        del legacy_claude[role]
                        continue

                roles_cfg = _ensure_roles_dict(models)
                if roles_cfg is None:
                    warn(f"수동 확인 필요: {legacy_key}={_compact_json(model_name)}")
                    continue
                if role not in roles_cfg:
                    roles_cfg[role] = {"tier": mapped_tier}
                del legacy_claude[role]

        for provider in ["codex", "gemini"]:
            legacy_provider = models.get(provider)
            if not isinstance(legacy_provider, dict):
                continue
            if "default" not in legacy_provider:
                continue

            value = legacy_provider.get("default")
            provider_defaults = default_providers.get(provider)
            default_premium_model = (
                provider_defaults.get("premium")
                if isinstance(provider_defaults, dict)
                else None
            )
            if isinstance(default_premium_model, str) and value == default_premium_model:
                del legacy_provider["default"]
                continue

            warn(f"수동 확인 필요: models.{provider}.default={_compact_json(value)}")

        def migrate_legacy_role_array(legacy_key, role_key):
            legacy_cfg = models.get(legacy_key)
            if not isinstance(legacy_cfg, dict):
                return

            roles_cfg = models.get("roles")
            role_preexisting = isinstance(roles_cfg, dict) and role_key in roles_cfg
            role_defaults = (
                default_roles.get(role_key)
                if isinstance(default_roles, dict)
                else None
            )

            for index, field in enumerate(["primary", "fallback"]):
                if field not in legacy_cfg:
                    continue
                legacy_leaf = f"models.{legacy_key}.{field}"
                if role_preexisting:
                    del legacy_cfg[field]
                    continue

                model_name = legacy_cfg.get(field)
                default_provider = None
                default_tier = None
                if isinstance(role_defaults, list) and index < len(role_defaults):
                    default_role = role_defaults[index]
                    if isinstance(default_role, dict):
                        default_provider = default_role.get("provider")
                        default_tier = default_role.get("tier")

                expected_model = None
                provider_defaults = (
                    default_providers.get(default_provider)
                    if isinstance(default_provider, str)
                    else None
                )
                if isinstance(provider_defaults, dict) and isinstance(default_tier, str):
                    expected_model = provider_defaults.get(default_tier)

                if isinstance(expected_model, str) and model_name == expected_model:
                    del legacy_cfg[field]
                    continue

                if not isinstance(default_provider, str):
                    warn(f"수동 확인 필요: {legacy_leaf}={_compact_json(model_name)}")
                    continue

                mapped_tier = _provider_model_to_tier(default_provider, model_name, default_providers)
                if not isinstance(mapped_tier, str):
                    warn(f"수동 확인 필요: {legacy_leaf}={_compact_json(model_name)}")
                    continue

                roles_cfg = _ensure_roles_dict(models)
                if roles_cfg is None:
                    warn(f"수동 확인 필요: {legacy_leaf}={_compact_json(model_name)}")
                    continue

                role_override = roles_cfg.get(role_key)
                if role_override is None:
                    if isinstance(role_defaults, list):
                        role_override = copy.deepcopy(role_defaults)
                    else:
                        role_override = []
                    roles_cfg[role_key] = role_override
                if not isinstance(role_override, list):
                    warn(f"수동 확인 필요: {legacy_leaf}={_compact_json(model_name)}")
                    continue

                while len(role_override) <= index:
                    role_override.append({})
                if not isinstance(role_override[index], dict):
                    warn(f"수동 확인 필요: {legacy_leaf}={_compact_json(model_name)}")
                    continue

                if "tier" not in role_override[index]:
                    role_override[index]["tier"] = mapped_tier
                del legacy_cfg[field]

        migrate_legacy_role_array("developer", "developer")
        migrate_legacy_role_array("reviewer", "reviewer")

        legacy_developer = models.get("developer")
        if isinstance(legacy_developer, dict):
            claude_dev = legacy_developer.get("claude_dev")
            if isinstance(claude_dev, dict) and "model" in claude_dev:
                model_name = claude_dev.get("model")
                roles_cfg = models.get("roles")
                if isinstance(roles_cfg, dict) and "developer_claude" in roles_cfg:
                    del claude_dev["model"]
                else:
                    mapped_tier = _provider_model_to_tier("claude", model_name, default_providers)
                    if not isinstance(mapped_tier, str):
                        warn(
                            "수동 확인 필요: "
                            f"models.developer.claude_dev.model={_compact_json(model_name)}"
                        )
                    else:
                        roles_cfg = _ensure_roles_dict(models)
                        if roles_cfg is None:
                            warn(
                                "수동 확인 필요: "
                                f"models.developer.claude_dev.model={_compact_json(model_name)}"
                            )
                        else:
                            role_cfg = roles_cfg.get("developer_claude")
                            if role_cfg is None:
                                roles_cfg["developer_claude"] = {"tier": mapped_tier}
                            elif isinstance(role_cfg, dict) and "tier" not in role_cfg:
                                role_cfg["tier"] = mapped_tier
                            del claude_dev["model"]

    code_review = migrated.get("code_review")
    if isinstance(code_review, dict):
        agent_roster = code_review.get("agent_roster")
        if isinstance(agent_roster, str):
            tokens = []
            seen = set()
            for item in agent_roster.split(","):
                token = item.strip()
                if not token or token in seen:
                    continue
                seen.add(token)
                tokens.append(token)
            code_review["agent_roster"] = tokens

    phase1 = migrated.get("phase1_exploration")
    if isinstance(phase1, dict):
        roles = phase1.get("roles")
        if isinstance(roles, dict):
            for role_name, role_cfg in roles.items():
                if not isinstance(role_cfg, dict):
                    continue
                if "model" not in role_cfg:
                    continue
                model_name = role_cfg.get("model")
                provider = role_cfg.get("agent")
                if not isinstance(provider, str) or not isinstance(
                    default_providers.get(provider), dict
                ):
                    warn(
                        "수동 확인 필요: "
                        f"phase1_exploration.roles.{role_name}.model={_compact_json(model_name)}"
                    )
                    continue
                mapped_tier = _provider_model_to_tier(provider, model_name, default_providers)
                if not isinstance(mapped_tier, str):
                    warn(
                        "수동 확인 필요: "
                        f"phase1_exploration.roles.{role_name}.model={_compact_json(model_name)}"
                    )
                    continue
                role_cfg["tier"] = mapped_tier
                del role_cfg["model"]

    for root_key in ["models", "code_review", "phase1_exploration"]:
        root_cfg = migrated.get(root_key)
        if not isinstance(root_cfg, dict):
            continue
        _prune_empty_dicts(root_cfg)
        if not root_cfg:
            del migrated[root_key]

    return migrated, warnings


def _path_exists(data, dotted_path):
    current = data
    for part in dotted_path.split("."):
        if not isinstance(current, dict) or part not in current:
            return False
        current = current[part]
    return True


def _format_migrate_value(value):
    if isinstance(value, (dict, list, str, int, float, bool)) or value is None:
        return _compact_json(value)
    return str(value)


def cmd_config_migrate(args):
    plugin_root = _plugin_root()
    defaults_path = plugin_root / "templates" / "defaults" / "config.json"
    config_path = BASE_DIR / "config.json"

    defaults = _load_json_strict(defaults_path, required=True)
    if not isinstance(defaults, dict):
        print(f"Error: invalid defaults format: {defaults_path}", file=sys.stderr)
        return 1

    overrides = _load_json_strict(config_path, required=False)
    if overrides is None:
        print("변환할 항목 없음")
        return 0
    if not isinstance(overrides, dict):
        print(f"Error: invalid config format: {config_path}", file=sys.stderr)
        return 1

    migrated, warnings = _migrate_config(overrides, defaults)
    changed = _flat_diff(overrides, migrated)
    if not changed:
        print("변환할 항목 없음")
        for message in warnings:
            print(f"[WARN]    {message}")
        print(f"총 0건 변환, {len(warnings)}건 경고")
        return 0

    for key, (old_value, new_value) in changed.items():
        if key == "<root>":
            old_text = _format_migrate_value(old_value)
            new_text = _format_migrate_value(new_value)
        else:
            old_text = "(added)" if not _path_exists(overrides, key) else _format_migrate_value(old_value)
            new_text = "(deleted)" if not _path_exists(migrated, key) else _format_migrate_value(new_value)
        print(f"[MIGRATE] {key}: {old_text} → {new_text}")

    for message in warnings:
        print(f"[WARN]    {message}")
    print(f"총 {len(changed)}건 변환, {len(warnings)}건 경고")

    if not args.apply:
        return 0

    save_json(config_path, migrated)
    resolved = deep_merge(defaults, migrated)
    save_json(BASE_DIR / "config.resolved.json", resolved)
    print("config.json updated")
    print("config.resolved.json updated")
    return 0


def cmd_config_resolve(args):
    plugin_root = Path(__file__).resolve().parent.parent
    defaults_path = plugin_root / "templates" / "defaults" / "config.json"
    defaults = load_json(defaults_path) or {}
    overrides = load_json(BASE_DIR / "config.json") or {}
    if _has_legacy_format(overrides):
        print(
            "⚠ 구 포맷 설정 감지. `python3 scripts/mst.py config migrate` 실행을 권장합니다.",
            file=sys.stderr,
        )
    resolved = deep_merge(defaults, overrides)
    save_json(BASE_DIR / "config.resolved.json", resolved)
    print(f"config.resolved.json updated ({len(resolved)} top-level keys)")
    return 0


def _load_preset(preset_id):
    plugin_root = _plugin_root()
    manifest = load_json(plugin_root / "templates" / "defaults" / "presets" / "manifest.json")

    # 1) built-in preset lookup from manifest
    if isinstance(manifest, dict):
        presets = manifest.get("presets")
        if isinstance(presets, list):
            for entry in presets:
                if not isinstance(entry, dict):
                    continue
                if entry.get("id") != preset_id:
                    continue
                rel_file = entry.get("file")
                if isinstance(rel_file, str):
                    return load_json(plugin_root / "templates" / "defaults" / "presets" / rel_file)

    # 2) user preset lookup (path traversal guard)
    if not re.match(r"^[a-z0-9-]+$", preset_id):
        return None
    user_file = BASE_DIR / "presets" / f"{preset_id}.json"
    if user_file.is_file():
        return load_json(user_file)

    return None


def _diff_from_base(base, current):
    diff = {}
    if not isinstance(base, dict) or not isinstance(current, dict):
        return diff

    for key, current_value in current.items():
        base_value = base.get(key)
        if isinstance(base_value, dict) and isinstance(current_value, dict):
            nested = _diff_from_base(base_value, current_value)
            if nested:
                diff[key] = nested
        elif current_value != base_value:
            diff[key] = current_value
    return diff


def _flat_diff(old, new, prefix=""):
    changes = {}
    if not isinstance(old, dict) or not isinstance(new, dict):
        if old != new:
            changes[prefix or "<root>"] = (old, new)
        return changes

    all_keys = set(old.keys()) | set(new.keys())
    for key in sorted(all_keys):
        full_key = f"{prefix}.{key}" if prefix else key
        old_value = old.get(key)
        new_value = new.get(key)
        if isinstance(old_value, dict) and isinstance(new_value, dict):
            changes.update(_flat_diff(old_value, new_value, full_key))
        elif old_value != new_value:
            changes[full_key] = (old_value, new_value)
    return changes


def cmd_preset_list(args):
    plugin_root = _plugin_root()
    builtin_manifest = load_json(plugin_root / "templates" / "defaults" / "presets" / "manifest.json")

    presets = []
    if isinstance(builtin_manifest, dict):
        for p in builtin_manifest.get("presets", []):
            if isinstance(p, dict):
                presets.append({**p, "source": "builtin"})

    user_dir = BASE_DIR / "presets"
    if user_dir.is_dir():
        for preset_path in sorted(user_dir.glob("*.json")):
            presets.append({
                "id": preset_path.stem,
                "name": preset_path.stem,
                "source": "user",
                "file": str(preset_path),
            })

    if args.format == "json":
        print(json.dumps(presets, ensure_ascii=False, indent=2))
        return 0

    print(f"{'TYPE':<10} {'ID':<32} {'NAME'}")
    print("-" * 80)
    for preset in presets:
        source = "[builtin]" if preset.get("source") == "builtin" else "[user]"
        print(
            f"{source:<10} "
            f"{preset.get('id', ''):<32} "
            f"{preset.get('name', '')}"
        )
    return 0


def cmd_preset_apply(args):
    preset_data = _load_preset(args.preset_id)
    if not isinstance(preset_data, dict):
        print(f"Error: preset '{args.preset_id}' not found", file=sys.stderr)
        return 1

    plugin_root = _plugin_root()
    defaults = load_json(plugin_root / "templates" / "defaults" / "config.json") or {}
    overrides = load_json(BASE_DIR / "config.json") or {}
    current_resolved = deep_merge(defaults, overrides)
    merged = deep_merge(current_resolved, preset_data)
    next_overrides = _diff_from_base(defaults, merged)
    save_json(BASE_DIR / "config.json", next_overrides)
    save_json(BASE_DIR / "config.resolved.json", merged)

    changed = _flat_diff(current_resolved, merged)
    if changed:
        print(f"Applied preset '{args.preset_id}': {len(changed)} settings changed")
        for key, (old, new) in changed.items():
            print(f"  {key}: {old} → {new}")
    else:
        print(f"Preset '{args.preset_id}' has no changes")
    return 0


def cmd_preset_diff(args):
    preset_data = _load_preset(args.preset_id)
    if not isinstance(preset_data, dict):
        print(f"Error: preset '{args.preset_id}' not found", file=sys.stderr)
        return 1

    plugin_root = _plugin_root()
    defaults = load_json(plugin_root / "templates" / "defaults" / "config.json") or {}
    overrides = load_json(BASE_DIR / "config.json") or {}
    current_resolved = deep_merge(defaults, overrides)
    merged = deep_merge(current_resolved, preset_data)

    changed = _flat_diff(current_resolved, merged)
    if not changed:
        print(f"No changes — current config already matches preset '{args.preset_id}'")
        return 0

    print(f"Preset '{args.preset_id}' would change {len(changed)} settings:")
    for key, (old, new) in changed.items():
        print(f"  {key}: {old} → {new}")
    return 0


def cmd_preset_save(args):
    if not re.match(r"^[a-z0-9-]+$", args.preset_id):
        print(
            f"Error: preset ID must match ^[a-z0-9-]+$ (got '{args.preset_id}')",
            file=sys.stderr,
        )
        return 1

    user_dir = BASE_DIR / "presets"
    user_dir.mkdir(parents=True, exist_ok=True)

    target = user_dir / f"{args.preset_id}.json"
    if target.is_file():
        print(f"Warning: overwriting existing user preset '{args.preset_id}'", file=sys.stderr)

    current = load_json(BASE_DIR / "config.json") or {}
    save_json(target, current)
    print(f"Saved current config as user preset '{args.preset_id}'")
    return 0


def cmd_hooks_post_skill(args):
    try:
        payload = json.loads(sys.stdin.read())
        if not isinstance(payload, dict):
            return 0

        tool_input = payload.get("tool_input", {})
        if not isinstance(tool_input, dict):
            return 0

        skill = tool_input.get("skill", "")
        if not isinstance(skill, str):
            return 0
        if skill not in {"mst:accept", "mst:ideation", "mst:discussion", "mst:debug"}:
            return 0

        resolved = load_json(BASE_DIR / "config.resolved.json") or {}
        archive_cfg = resolved.get("archive", {})
        if not isinstance(archive_cfg, dict):
            archive_cfg = {}

        if not archive_cfg.get("auto_archive_on_complete", True):
            return 0

        max_active = archive_cfg.get("max_active_sessions", 20)
        try:
            max_active = int(max_active)
        except (TypeError, ValueError):
            max_active = 20

        for type_key in TYPE_DIRS:
            try:
                _archive_run_type(type_key, max_active=max_active, emit_output=False)
            except Exception:
                pass
    except Exception:
        return 0
    return 0


# ---------------------------------------------------------------------------
# extension subcommands
# ---------------------------------------------------------------------------

def _dir_content_hash(directory: Path) -> str:
    EXCLUDED_HASH_PARTS = {"node_modules", ".git", ".omc"}

    if not directory.exists():
        return ""

    hasher = hashlib.sha256()

    try:
        entries = sorted(
            [entry for entry in directory.rglob("*") if entry.is_file() and not entry.is_symlink()],
            key=lambda entry: str(entry.relative_to(directory).as_posix()),
        )
    except Exception:
        return ""

    for path in entries:
        relative_path = path.relative_to(directory)
        if relative_path.name == ".content-hash":
            continue
        if any(part in EXCLUDED_HASH_PARTS for part in relative_path.parts):
            continue
        try:
            hasher.update(str(relative_path.as_posix()).encode("utf-8"))
            hasher.update(b"\x00")
            hasher.update(path.read_bytes())
        except Exception:
            continue

    return hasher.hexdigest()


def _ensure_copy_impl(plugin_root: Path, home_dir: Path) -> int:
    if sys.platform == "win32":
        print("미지원 OS", file=sys.stderr)
        return 1

    src = plugin_root / "extension"
    dst = home_dir / "chrome-extension"

    is_project = (plugin_root / ".git").exists() and src.is_dir()
    if is_project:
        print("프로젝트 설치 감지. 직접 경로 사용 권장", file=sys.stderr)
        print("skipped")
        return 0

    if not src.exists():
        if dst.exists():
            print("경고: 플러그인 extension/ 경로가 없어 stale 상태일 수 있습니다.", file=sys.stderr)
        print("unchanged")
        return 0

    try:
        home_dir.mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        print(f"[extension ensure-copy] 대상 상위 디렉토리 생성 실패: {exc}", file=sys.stderr)
        print("unchanged")
        return 0

    if not dst.exists():
        try:
            shutil.copytree(src, dst)
        except Exception as exc:
            print(f"[extension ensure-copy] extension 복사 실패: {exc}", file=sys.stderr)
            print("unchanged")
            return 0
        try:
            (dst / ".content-hash").write_text(_dir_content_hash(src), encoding="utf-8")
        except Exception:
            pass
        print("created")
        return 0

    src_hash = _dir_content_hash(src)
    dst_hash = ""
    try:
        dst_hash = (dst / ".content-hash").read_text(encoding="utf-8").strip()
    except Exception:
        pass

    if src_hash != dst_hash:
        try:
            shutil.rmtree(dst)
            shutil.copytree(src, dst)
        except Exception as exc:
            print(f"[extension ensure-copy] 버전 변경 반영 실패: {exc}", file=sys.stderr)
            print("unchanged")
            return 0
        try:
            (dst / ".content-hash").write_text(src_hash, encoding="utf-8")
        except Exception:
            pass
        print("updated")
        return 0

    print("unchanged")
    return 0


def cmd_extension_ensure_copy(args):
    plugin_root = Path(__file__).resolve().parent.parent
    home_dir = Path.home() / ".gran-maestro"
    return _ensure_copy_impl(plugin_root, home_dir)


# ---------------------------------------------------------------------------
# Argument parser
# ---------------------------------------------------------------------------

def build_parser():
    parser = argparse.ArgumentParser(
        prog="mst.py",
        description="Gran Maestro CLI utility"
    )
    sub = parser.add_subparsers(dest="command")

    # --- request ---
    req = sub.add_parser("request")
    req_sub = req.add_subparsers(dest="subcommand")

    req_list = req_sub.add_parser("list")
    req_list.add_argument("--active", dest="scope", action="store_const", const="active", default="active")
    req_list.add_argument("--all", dest="scope", action="store_const", const="all")
    req_list.add_argument("--completed", dest="scope", action="store_const", const="completed")
    req_list.add_argument("--format", choices=["table", "json"], default="table")

    req_inspect = req_sub.add_parser("inspect")
    req_inspect.add_argument("req_id")

    req_history = req_sub.add_parser("history")
    req_history.add_argument("--all", action="store_true")

    req_filter = req_sub.add_parser("filter")
    req_filter.add_argument("--phase", type=int)
    req_filter.add_argument("--status")
    req_filter.add_argument("--priority")
    req_filter.add_argument("--format", choices=["table", "json"], default="table")

    req_count = req_sub.add_parser("count")
    req_count.add_argument("--active", dest="scope", action="store_const", const="active", default="active")
    req_count.add_argument("--all", dest="scope", action="store_const", const="all")
    req_count.add_argument("--completed", dest="scope", action="store_const", const="completed")

    req_cancel = req_sub.add_parser("cancel")
    req_cancel.add_argument("req_id")

    req_set_phase = req_sub.add_parser("set-phase")
    req_set_phase.add_argument("req_id")
    req_set_phase.add_argument("phase", type=int)
    req_set_phase.add_argument("status")

    # --- timestamp ---
    ts = sub.add_parser("timestamp")
    ts_sub = ts.add_subparsers(dest="subcommand")

    ts_now = ts_sub.add_parser("now")
    ts_now.set_defaults(func=cmd_timestamp)

    # --- set-status ---
    set_status_cmd = sub.add_parser("set-status")
    set_status_cmd.add_argument("id", help="REQ-NNN / PLN-NNN / DBG-NNN 등")
    set_status_cmd.add_argument("status", help="새 상태값")
    set_status_cmd.set_defaults(func=cmd_set_status)

    # --- set-field ---
    set_field_cmd = sub.add_parser("set-field")
    set_field_cmd.add_argument("id", help="REQ-NNN / PLN-NNN / DBG-NNN 등")
    set_field_cmd.add_argument("field", help="JSON 필드명")
    set_field_cmd.add_argument("value", help="새 값 (문자열)")
    set_field_cmd.set_defaults(func=cmd_set_field)

    # --- state ---
    state = sub.add_parser("state")
    state_sub = state.add_subparsers(dest="subcommand")

    state_set = state_sub.add_parser("set")
    state_set.add_argument("--skill", required=True)
    state_set.add_argument("--step", type=int, required=True)
    state_set.add_argument("--total", type=int, required=True)
    state_set.add_argument("--return-to", dest="return_to")

    state_sub.add_parser("get")
    state_sub.add_parser("clear")

    # --- plan ---
    plan = sub.add_parser("plan")
    plan_sub = plan.add_subparsers(dest="subcommand")

    plan_list = plan_sub.add_parser("list")
    plan_list.add_argument("--active", dest="scope", action="store_const", const="active", default="active")
    plan_list.add_argument("--all", dest="scope", action="store_const", const="all")

    plan_count = plan_sub.add_parser("count")
    plan_count.add_argument("--active", dest="scope", action="store_const", const="active", default="active")
    plan_count.add_argument("--all", dest="scope", action="store_const", const="all")
    plan_count.add_argument("--completed", dest="scope", action="store_const", const="completed")

    plan_inspect = plan_sub.add_parser("inspect")
    plan_inspect.add_argument("pln_id")

    plan_complete = plan_sub.add_parser("complete")
    plan_complete.add_argument("pln_id")

    p_plan_sync = plan_sub.add_parser("sync", help="Plan 완료 여부 동기화")
    p_plan_sync.add_argument("plan_id", help="Plan ID (예: PLN-068)")

    plan_render_review = plan_sub.add_parser("render-review", help="plan-review 프롬프트 파일 생성")
    plan_render_review.add_argument("--pln", dest="pln_id", required=True)
    plan_render_review.add_argument("--plan-draft", dest="plan_draft", default="")
    plan_render_review.add_argument("--plan-draft-file", dest="plan_draft_file", default=None)
    plan_render_review.add_argument("--qa-summary", dest="qa_summary", default="")

    # --- intent ---
    intent = sub.add_parser("intent")
    intent_sub = intent.add_subparsers(dest="subcommand")

    intent_add = intent_sub.add_parser("add")
    intent_add.add_argument("--req", dest="req")
    intent_add.add_argument("--plan", dest="plan")
    intent_add.add_argument("--feature", required=True)
    intent_add.add_argument("--situation", required=True)
    intent_add.add_argument("--motivation")
    intent_add.add_argument("--goal", required=True)
    intent_add.add_argument("--related-intent", dest="related_intent", action="append", default=[])
    intent_add.add_argument("--tag", dest="tag", action="append", default=[])
    intent_add.add_argument("--file", dest="file", action="append", default=[])
    intent_add.add_argument("--json", action="store_true")

    intent_get = intent_sub.add_parser("get")
    intent_get.add_argument("intent_id")
    intent_get.add_argument("--json", action="store_true")

    intent_list = intent_sub.add_parser("list")
    intent_list.add_argument("--req", dest="req")
    intent_list.add_argument("--plan", dest="plan")
    intent_list.add_argument("--json", action="store_true")

    intent_update = intent_sub.add_parser("update")
    intent_update.add_argument("intent_id")
    intent_update.add_argument("--feature")
    intent_update.add_argument("--situation")
    intent_update.add_argument("--motivation")
    intent_update.add_argument("--goal")
    intent_update.add_argument("--req", dest="req")
    intent_update.add_argument("--plan", dest="plan")
    intent_update.add_argument("--related-intent", dest="related_intent", action="append")
    intent_update.add_argument("--tag", dest="tag", action="append")
    intent_update.add_argument("--file", dest="file", action="append")
    intent_update.add_argument("--created-at", dest="created_at")
    intent_update.add_argument("--json", action="store_true")

    intent_delete = intent_sub.add_parser("delete")
    intent_delete.add_argument("intent_id")

    intent_search = intent_sub.add_parser("search")
    intent_search.add_argument("keyword")
    intent_search.add_argument("--json", action="store_true")

    intent_lookup = intent_sub.add_parser("lookup")
    intent_lookup.add_argument("--files", nargs="+", required=True)
    intent_lookup.add_argument("--json", action="store_true")

    intent_related = intent_sub.add_parser("related")
    intent_related.add_argument("intent_id")
    intent_related.add_argument("--depth", type=int, default=1)
    intent_related.add_argument("--json", action="store_true")

    intent_sub.add_parser("rebuild-index")

    # --- counter ---
    ctr = sub.add_parser("counter")
    ctr_sub = ctr.add_subparsers(dest="subcommand")

    ctr_next = ctr_sub.add_parser("next")
    ctr_next.add_argument(
        "--type",
        choices=["req", "idn", "dsc", "dbg", "exp", "pln", "des", "cap", "intent"],
        default="req",
    )
    ctr_next.add_argument("--dir")

    ctr_peek = ctr_sub.add_parser("peek")
    ctr_peek.add_argument(
        "--type",
        choices=["req", "idn", "dsc", "dbg", "exp", "pln", "des", "cap", "intent"],
        default="req",
    )
    ctr_peek.add_argument("--dir")

    # --- archive ---
    arc = sub.add_parser("archive")
    arc_sub = arc.add_subparsers(dest="subcommand")

    arc_run = arc_sub.add_parser("run")
    arc_run.add_argument("--type", choices=["req", "idn", "dsc", "dbg", "exp", "pln", "des", "cap"], default="req")
    arc_run.add_argument("--max", type=int)
    arc_run.add_argument("--dir")

    arc_run_all = arc_sub.add_parser("run-all")
    arc_run_all.add_argument("--max", type=int)

    arc_list = arc_sub.add_parser("list")
    arc_list.add_argument("--type")

    arc_restore = arc_sub.add_parser("restore")
    arc_restore.add_argument("archive_id")

    # --- capture ---
    cap = sub.add_parser("capture")
    cap_sub = cap.add_subparsers(dest="subcommand")
    cap_ttl_check = cap_sub.add_parser("ttl-check")
    cap_ttl_check.set_defaults(func=cmd_capture_ttl_check)

    # --- version ---
    ver = sub.add_parser("version")
    ver_sub = ver.add_subparsers(dest="subcommand")

    ver_get = ver_sub.add_parser("get")
    ver_check = ver_sub.add_parser("check")
    ver_bump = ver_sub.add_parser("bump")
    ver_bump.add_argument("level", choices=["patch", "minor", "major"])

    # --- context ---
    ctx = sub.add_parser("context")
    ctx_sub = ctx.add_subparsers(dest="subcommand")

    ctx_gather = ctx_sub.add_parser("gather")
    ctx_gather.add_argument("--diff", type=int, default=1)
    ctx_gather.add_argument("--skills", action="store_true", default=True)
    ctx_gather.add_argument("--no-skills", dest="skills", action="store_false")
    ctx_gather.add_argument("--agents", action="store_true", default=True)
    ctx_gather.add_argument("--no-agents", dest="agents", action="store_false")
    ctx_gather.add_argument("--format", choices=["text", "json"], default="text")

    # --- agents ---
    agt = sub.add_parser("agents")
    agt_sub = agt.add_subparsers(dest="subcommand")

    agt_check = agt_sub.add_parser("check")
    agt_sync = agt_sub.add_parser("sync")

    # --- cleanup ---
    cln = sub.add_parser("cleanup")
    cln.add_argument("--dry-run", action="store_true")

    # --- session ---
    sess = sub.add_parser("session")
    sess_sub = sess.add_subparsers(dest="subcommand")

    sess_list = sess_sub.add_parser("list")
    sess_list.add_argument("--type", choices=["ideation", "discussion", "debug"])

    sess_inspect = sess_sub.add_parser("inspect")
    sess_inspect.add_argument("session_id")

    sess_complete = sess_sub.add_parser("complete")
    sess_complete.add_argument("session_id")

    sess_split = sess_sub.add_parser("split-prompts", help="combined-prompts.txt를 개별 프롬프트 파일로 분리")
    sess_split.add_argument("--dir", dest="prompts_dir", required=False, help="prompts 디렉토리 경로")

    # --- priority ---
    pri = sub.add_parser("priority")
    pri.add_argument("task_id")
    pri.add_argument("--before")
    pri.add_argument("--after")

    # --- task ---
    task = sub.add_parser("task")
    task_sub = task.add_subparsers(dest="subcommand")
    task_set_commit = task_sub.add_parser("set-commit")
    task_set_commit.add_argument("task_id")
    task_set_commit.add_argument("commit_hash", nargs="?")
    task_set_commit.add_argument("commit_message", nargs="?")

    # --- wait-files ---
    wf = sub.add_parser("wait-files")
    wf.add_argument("files", nargs="+", help="대기할 파일 경로 목록")
    wf.add_argument("--timeout", type=float, default=None,
                    help="타임아웃 (초). 미지정 시 config.json의 timeouts.wait_files_ms 사용")

    # --- resolve-model ---
    resolve_model = sub.add_parser("resolve-model")
    resolve_model.add_argument("provider")
    resolve_model.add_argument("tier_or_section")

    # --- stitch ---
    stitch = sub.add_parser("stitch")
    stitch_sub = stitch.add_subparsers(dest="subcommand")

    stitch_sleep = stitch_sub.add_parser("sleep")
    stitch_sleep.add_argument(
        "--interval", type=float, default=30.0,
        help="대기 시간(초). 기본값 30."
    )

    # --- notify ---
    notify_parser = sub.add_parser("notify")
    notify_parser.add_argument("event_type")
    notify_parser.add_argument("data", nargs="?", default=None)

    # --- extension ---
    ext = sub.add_parser("extension")
    ext_sub = ext.add_subparsers(dest="subcommand")
    ext_sub.add_parser("ensure-copy")

    # --- config ---
    cfg = sub.add_parser("config")
    cfg_sub = cfg.add_subparsers(dest="subcommand")
    cfg_resolve = cfg_sub.add_parser("resolve", help="defaults + overrides → config.resolved.json")
    cfg_resolve.set_defaults(func=cmd_config_resolve)
    cfg_migrate = cfg_sub.add_parser("migrate", help="구 포맷 config를 신 포맷으로 마이그레이션")
    cfg_migrate.add_argument("--apply", action="store_true", help="실제 적용 (기본: dry-run)")
    cfg_migrate.set_defaults(func=cmd_config_migrate)

    # --- preset ---
    preset = sub.add_parser("preset")
    preset_sub = preset.add_subparsers(dest="subcommand")
    preset_list = preset_sub.add_parser("list", help="built-in and user presets")
    preset_list.add_argument("--format", choices=["table", "json"], default="table")
    preset_apply = preset_sub.add_parser("apply", help="apply preset to config overrides")
    preset_apply.add_argument("preset_id")
    preset_diff = preset_sub.add_parser("diff", help="preview preset diff against current config")
    preset_diff.add_argument("preset_id")
    preset_save = preset_sub.add_parser("save", help="save current config as user preset")
    preset_save.add_argument("preset_id")

    # --- hooks ---
    hooks = sub.add_parser("hooks")
    hooks_sub = hooks.add_subparsers(dest="subcommand")
    hooks_post_skill = hooks_sub.add_parser("post-skill")
    hooks_post_skill.set_defaults(func=cmd_hooks_post_skill)

    return parser


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    global BASE_DIR
    BASE_DIR = find_base_dir()

    parser = build_parser()
    args = parser.parse_args()

    dispatch = {
        ("request", "list"): cmd_request_list,
        ("request", "inspect"): cmd_request_inspect,
        ("request", "history"): cmd_request_history,
        ("request", "filter"): cmd_request_filter,
        ("request", "count"): cmd_request_count,
        ("request", "cancel"): cmd_request_cancel,
        ("request", "set-phase"): cmd_request_set_phase,
        ("timestamp", "now"): cmd_timestamp,
        ("set-status", None): cmd_set_status,
        ("set-field", None): cmd_set_field,
        ("state", "set"): cmd_state_set,
        ("state", "get"): cmd_state_get,
        ("state", "clear"): cmd_state_clear,
        ("plan", "list"): cmd_plan_list,
        ("plan", "count"): cmd_plan_count,
        ("plan", "inspect"): cmd_plan_inspect,
        ("plan", "complete"): cmd_plan_complete,
        ("plan", "sync"): cmd_plan_sync,
        ("plan", "render-review"): cmd_plan_render_review,
        ("intent", "add"): cmd_intent_add,
        ("intent", "get"): cmd_intent_get,
        ("intent", "list"): cmd_intent_list,
        ("intent", "update"): cmd_intent_update,
        ("intent", "delete"): cmd_intent_delete,
        ("intent", "search"): cmd_intent_search,
        ("intent", "lookup"): cmd_intent_lookup,
        ("intent", "related"): cmd_intent_related,
        ("intent", "rebuild-index"): cmd_intent_rebuild_index,
        ("counter", "next"): cmd_counter_next,
        ("counter", "peek"): cmd_counter_peek,
        ("version", "get"):    cmd_version_get,
        ("version", "check"):  cmd_version_check,
        ("version", "bump"):   cmd_version_bump,
        ("context", "gather"): cmd_context_gather,
        ("agents", "check"):   cmd_agents_check,
        ("agents", "sync"):    cmd_agents_sync,
        ("capture", "ttl-check"): cmd_capture_ttl_check,
        ("archive", "run"): cmd_archive_run,
        ("archive", "run-all"): cmd_archive_run_all,
        ("archive", "list"): cmd_archive_list,
        ("archive", "restore"): cmd_archive_restore,
        ("cleanup", None): cmd_cleanup,
        ("session", "list"): cmd_session_list,
        ("session", "inspect"): cmd_session_inspect,
        ("session", "complete"): cmd_session_complete,
        ("session", "split-prompts"): cmd_session_split_prompts,
        ("priority", None): cmd_priority,
        ("task", "set-commit"): cmd_task_set_commit,
        ("notify", None): cmd_notify,
        ("stitch", "sleep"): cmd_stitch_sleep,
        ("wait-files", None): cmd_wait_files,
        ("resolve-model", None): cmd_resolve_model,
        ("extension", "ensure-copy"): cmd_extension_ensure_copy,
        ("config", "resolve"): cmd_config_resolve,
        ("config", "migrate"): cmd_config_migrate,
        ("preset", "list"): cmd_preset_list,
        ("preset", "apply"): cmd_preset_apply,
        ("preset", "diff"): cmd_preset_diff,
        ("preset", "save"): cmd_preset_save,
        ("hooks", "post-skill"): cmd_hooks_post_skill,
    }

    key = (args.command, getattr(args, "subcommand", None))
    fn = dispatch.get(key)
    if fn is None:
        parser.print_help()
        sys.exit(1)

    sys.exit(fn(args) or 0)


if __name__ == "__main__":
    main()
