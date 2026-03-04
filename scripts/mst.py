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

  archive run         [--type req|idn|dsc|dbg|exp|pln|des|cap] [--max N] [--dir PATH]
  archive run-all     [--max N]
  archive list        [--type TYPE]
  archive restore     <ARCHIVE-ID>
  capture ttl-check

  counter next        [--type req|idn|dsc|dbg|exp|pln|des|cap] [--dir PATH]
  counter peek        [--type req|idn|dsc|dbg|exp|pln|des|cap]

  version get
  version check
  version bump        <patch|minor|major>

  context gather      [--diff N] [--skills] [--agents] [--format text|json]

  task set-commit     <TASK-ID> <commit hash> <commit message>

  agents check
  agents sync

  cleanup             [--dry-run]

  session list        [--type ideation|discussion|debug]
  session inspect     <SESSION-ID>
  session complete    <SESSION-ID>

  priority            <TASK-ID> [--before TASK-ID | --after TASK-ID]

  wait-files          <file1> [file2 ...] [--timeout SECONDS]
"""

import argparse
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
    for d in scan_root.glob(f"{prefix}-*"):
        if not d.is_dir():
            continue
        try:
            n = int(d.name.split("-")[1])
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
            if meta.get("status") != "done":
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


def cmd_config_resolve(args):
    plugin_root = Path(__file__).resolve().parent.parent
    defaults_path = plugin_root / "templates" / "defaults" / "config.json"
    defaults = load_json(defaults_path) or {}
    overrides = load_json(BASE_DIR / "config.json") or {}
    resolved = deep_merge(defaults, overrides)
    save_json(BASE_DIR / "config.resolved.json", resolved)
    print(f"config.resolved.json updated ({len(resolved)} top-level keys)")
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
        print("created")
        return 0

    src_manifest = load_json(src / "manifest.json")
    dst_manifest = load_json(dst / "manifest.json")

    src_version = src_manifest.get("version") if isinstance(src_manifest, dict) else None
    dst_version = dst_manifest.get("version") if isinstance(dst_manifest, dict) else None
    version_changed = src_version != dst_version or src_version is None or dst_version is None

    if version_changed:
        try:
            shutil.rmtree(dst)
            shutil.copytree(src, dst)
        except Exception as exc:
            print(f"[extension ensure-copy] 버전 변경 반영 실패: {exc}", file=sys.stderr)
            print("unchanged")
            return 0
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

    # --- counter ---
    ctr = sub.add_parser("counter")
    ctr_sub = ctr.add_subparsers(dest="subcommand")

    ctr_next = ctr_sub.add_parser("next")
    ctr_next.add_argument(
        "--type",
        choices=["req", "idn", "dsc", "dbg", "exp", "pln", "des", "cap"],
        default="req",
    )
    ctr_next.add_argument("--dir")

    ctr_peek = ctr_sub.add_parser("peek")
    ctr_peek.add_argument(
        "--type",
        choices=["req", "idn", "dsc", "dbg", "exp", "pln", "des", "cap"],
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
        ("timestamp", "now"): cmd_timestamp,
        ("set-status", None): cmd_set_status,
        ("set-field", None): cmd_set_field,
        ("plan", "list"): cmd_plan_list,
        ("plan", "count"): cmd_plan_count,
        ("plan", "inspect"): cmd_plan_inspect,
        ("plan", "complete"): cmd_plan_complete,
        ("plan", "sync"): cmd_plan_sync,
        ("plan", "render-review"): cmd_plan_render_review,
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
        ("extension", "ensure-copy"): cmd_extension_ensure_copy,
        ("config", "resolve"): cmd_config_resolve,
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
