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
  plan count         [--active | --all]

  archive run         [--type req|idn|dsc|dbg] [--max N] [--dir PATH]
  archive list        [--type TYPE]
  archive restore     <ARCHIVE-ID>

  counter next        [--type req|idn|dsc|dbg] [--dir PATH]
  counter peek        [--type TYPE]

  cleanup             [--dry-run]

  session list        [--type ideation|discussion|debug]
  session inspect     <SESSION-ID>

  priority            <TASK-ID> [--before TASK-ID | --after TASK-ID]
"""

import argparse
import json
import os
import sys
import glob
import tarfile
from datetime import datetime, timezone
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


def requests_dir() -> Path:
    return BASE_DIR / "requests"


def plans_dir() -> Path:
    return BASE_DIR / "plans"


def completed_dir() -> Path:
    return BASE_DIR / "requests" / "completed"


def archive_dir() -> Path:
    return BASE_DIR / "archive"


def iter_request_dirs(include_completed=False):
    """Yield (req_id, path, data) tuples."""
    for req_path in sorted(requests_dir().glob("REQ-*")):
        if not req_path.is_dir():
            continue
        rj = load_json(req_path / "request.json")
        if rj:
            yield rj.get("id", req_path.name), req_path, rj
    if include_completed and completed_dir().exists():
        for req_path in sorted(completed_dir().glob("REQ-*")):
            if not req_path.is_dir():
                continue
            rj = load_json(req_path / "request.json")
            if rj:
                yield rj.get("id", req_path.name), req_path, rj


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
            data["status"] = "cancelled"
            save_json(path / "request.json", data)
            print(f"Cancelled: {req_id}")
            return 0
    print(f"Error: {req_id} not found.", file=sys.stderr)
    return 1


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


# ---------------------------------------------------------------------------
# counter subcommands
# ---------------------------------------------------------------------------

TYPE_DIRS = {
    "req": ("requests", "REQ"),
    "idn": ("ideation", "IDN"),
    "dsc": ("discussion", "DSC"),
    "dbg": ("debug", "DBG"),
}


def get_counter_path(type_key: str, dir_override: str = None) -> Path:
    if dir_override:
        return Path(dir_override) / "counter.json"
    subdir, _ = TYPE_DIRS.get(type_key, ("requests", "REQ"))
    return BASE_DIR / subdir / "counter.json"


def cmd_counter_next(args):
    counter_path = get_counter_path(args.type, args.dir)
    data = load_json(counter_path) or {}
    last_id = data.get("last_id", 0)
    next_id = last_id + 1
    save_json(counter_path, {"last_id": next_id})
    _, prefix = TYPE_DIRS.get(args.type, ("requests", "REQ"))
    print(f"{prefix}-{next_id:03d}")
    return 0


def cmd_counter_peek(args):
    counter_path = get_counter_path(args.type, args.dir)
    data = load_json(counter_path) or {"last_id": 0}
    _, prefix = TYPE_DIRS.get(args.type, ("requests", "REQ"))
    last_id = data.get("last_id", 0)
    print(f"{prefix}-{last_id + 1:03d} (next, current last_id={last_id})")
    return 0


# ---------------------------------------------------------------------------
# archive subcommands
# ---------------------------------------------------------------------------

def cmd_archive_run(args):
    src_dir = requests_dir()
    dst_dir = archive_dir()
    dst_dir.mkdir(parents=True, exist_ok=True)

    dirs = sorted(src_dir.glob("REQ-*"))
    max_active = args.max or 20

    completed = [d for d in dirs if d.is_dir() and
                 (load_json(d / "request.json") or {}).get("status") in ("completed", "cancelled")]

    if len(dirs) - len(completed) <= max_active:
        print("No archiving needed.")
        return 0

    to_archive = completed[:len(dirs) - max_active]
    if not to_archive:
        print("No completed sessions to archive.")
        return 0

    ids = [d.name for d in to_archive]
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    archive_name = f"requests-{ids[0]}-to-{ids[-1]}-{timestamp}.tar.gz"
    archive_path = dst_dir / archive_name

    with tarfile.open(archive_path, "w:gz") as tar:
        for d in to_archive:
            tar.add(d, arcname=d.name)

    for d in to_archive:
        import shutil
        shutil.rmtree(d)

    print(f"Archived {len(to_archive)} sessions → {archive_name}")
    return 0


def cmd_archive_list(args):
    dst_dir = archive_dir()
    if not dst_dir.exists():
        print("No archives found.")
        return 0
    archives = sorted(dst_dir.glob("*.tar.gz"))
    if not archives:
        print("No archives found.")
        return 0
    for a in archives:
        size_kb = a.stat().st_size // 1024
        print(f"{a.name:<60} {size_kb:>6} KB")
    return 0


def cmd_archive_restore(args):
    dst_dir = archive_dir()
    # Find archive containing the session
    for arc in dst_dir.glob("*.tar.gz"):
        with tarfile.open(arc, "r:gz") as tar:
            names = tar.getnames()
            target = args.archive_id.upper()
            matching = [n for n in names if n.startswith(target + "/") or n == target]
            if matching:
                tar.extractall(path=requests_dir(), members=[tar.getmember(n) for n in matching])
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
        status = data.get("status", "")
        if status in ("completed", "cancelled"):
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

    import shutil
    for d, _ in stale:
        comp = completed_dir()
        comp.mkdir(parents=True, exist_ok=True)
        dest = comp / d.name
        if not dest.exists():
            d.rename(dest)
            print(f"  Moved {d.name} → completed/")
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


# ---------------------------------------------------------------------------
# priority subcommand
# ---------------------------------------------------------------------------

def cmd_priority(args):
    print(f"priority management for {args.task_id} — stub (not yet implemented)")
    return 0


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

    # --- counter ---
    ctr = sub.add_parser("counter")
    ctr_sub = ctr.add_subparsers(dest="subcommand")

    ctr_next = ctr_sub.add_parser("next")
    ctr_next.add_argument("--type", choices=["req", "idn", "dsc", "dbg"], default="req")
    ctr_next.add_argument("--dir")

    ctr_peek = ctr_sub.add_parser("peek")
    ctr_peek.add_argument("--type", choices=["req", "idn", "dsc", "dbg"], default="req")
    ctr_peek.add_argument("--dir")

    # --- archive ---
    arc = sub.add_parser("archive")
    arc_sub = arc.add_subparsers(dest="subcommand")

    arc_run = arc_sub.add_parser("run")
    arc_run.add_argument("--type", choices=["req", "idn", "dsc", "dbg"], default="req")
    arc_run.add_argument("--max", type=int)
    arc_run.add_argument("--dir")

    arc_list = arc_sub.add_parser("list")
    arc_list.add_argument("--type")

    arc_restore = arc_sub.add_parser("restore")
    arc_restore.add_argument("archive_id")

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

    # --- priority ---
    pri = sub.add_parser("priority")
    pri.add_argument("task_id")
    pri.add_argument("--before")
    pri.add_argument("--after")

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
        ("plan", "list"): cmd_plan_list,
        ("plan", "count"): cmd_plan_count,
        ("plan", "inspect"): cmd_plan_inspect,
        ("counter", "next"): cmd_counter_next,
        ("counter", "peek"): cmd_counter_peek,
        ("archive", "run"): cmd_archive_run,
        ("archive", "list"): cmd_archive_list,
        ("archive", "restore"): cmd_archive_restore,
        ("cleanup", None): cmd_cleanup,
        ("session", "list"): cmd_session_list,
        ("session", "inspect"): cmd_session_inspect,
        ("priority", None): cmd_priority,
    }

    key = (args.command, getattr(args, "subcommand", None))
    fn = dispatch.get(key)
    if fn is None:
        parser.print_help()
        sys.exit(1)

    sys.exit(fn(args) or 0)


if __name__ == "__main__":
    main()
