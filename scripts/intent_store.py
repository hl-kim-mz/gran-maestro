#!/usr/bin/env python3
"""Intent store abstraction and SQLite-backed implementation."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections import deque
from contextlib import contextmanager
from datetime import datetime, timezone
import ast
import json
from pathlib import Path
import re
import sqlite3
from typing import Any, Deque, Dict, Iterable, List, Optional, Sequence, Tuple

try:
    import yaml
except ImportError:  # pragma: no cover - optional dependency fallback
    yaml = None


class IntentStoreError(Exception):
    """Raised when an intent store operation fails."""


class IntentStore(ABC):
    @abstractmethod
    def add(
        self,
        intent_id: str,
        *,
        feature: str,
        situation: str,
        motivation: str,
        goal: str,
        linked_req: Optional[str] = None,
        linked_plan: Optional[str] = None,
        related_intent: Optional[Sequence[str]] = None,
        tags: Optional[Sequence[str]] = None,
        files: Optional[Sequence[str]] = None,
        created_at: Optional[str] = None,
    ) -> Dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def update(
        self,
        intent_id: str,
        *,
        feature: Optional[str] = None,
        situation: Optional[str] = None,
        motivation: Optional[str] = None,
        goal: Optional[str] = None,
        linked_req: Optional[str] = None,
        linked_plan: Optional[str] = None,
        related_intent: Optional[Sequence[str]] = None,
        tags: Optional[Sequence[str]] = None,
        files: Optional[Sequence[str]] = None,
        created_at: Optional[str] = None,
    ) -> Dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def delete(self, intent_id: str) -> Dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def get(self, intent_id: str) -> Optional[Dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def list(self) -> List[Dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def search(self, keyword: str) -> List[Dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def lookup(self, files: Sequence[str]) -> List[Dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def related(self, intent_id: str, depth: int = 1) -> Dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def rebuild(self) -> Dict[str, Any]:
        raise NotImplementedError


class SqliteIntentStore(IntentStore):
    def __init__(self, project_root: Path):
        self.project_root = Path(project_root).resolve()
        self.intent_dir = self.project_root / ".gran-maestro" / "intent"
        self.db_path = self.intent_dir / "intent.db"
        self.legacy_index_path = self.intent_dir / "index.json"
        self._fts_enabled: Optional[bool] = None
        self._initialize()

    def add(
        self,
        intent_id: str,
        *,
        feature: str,
        situation: str,
        motivation: str,
        goal: str,
        linked_req: Optional[str] = None,
        linked_plan: Optional[str] = None,
        related_intent: Optional[Sequence[str]] = None,
        tags: Optional[Sequence[str]] = None,
        files: Optional[Sequence[str]] = None,
        created_at: Optional[str] = None,
    ) -> Dict[str, Any]:
        normalized_id = _normalize_intent_id(intent_id)
        feature_value = (feature or "").strip()
        if not feature_value:
            raise IntentStoreError("feature must not be empty")

        record = {
            "id": normalized_id,
            "feature": feature_value,
            "situation": (situation or "").strip(),
            "motivation": (motivation or "").strip(),
            "goal": (goal or "").strip(),
            "linked_req": _normalize_optional_string(linked_req),
            "linked_plan": _normalize_optional_string(linked_plan),
            "related_intent": _normalize_string_list(related_intent),
            "tags": _normalize_string_list(tags),
            "files": _normalize_string_list(files),
            "created_at": created_at or datetime.now(timezone.utc).isoformat(),
            "file_name": f"{normalized_id}-{_slugify(feature_value)}.md",
        }

        self.intent_dir.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            if self._fetch_row(conn, normalized_id) is not None:
                raise IntentStoreError(f"Intent already exists: {normalized_id}")
            self._upsert_intent(conn, record)

        self._remove_legacy_index()
        return {
            "id": normalized_id,
            "metadata": self._metadata_from_record(record),
        }

    def update(
        self,
        intent_id: str,
        *,
        feature: Optional[str] = None,
        situation: Optional[str] = None,
        motivation: Optional[str] = None,
        goal: Optional[str] = None,
        linked_req: Optional[str] = None,
        linked_plan: Optional[str] = None,
        related_intent: Optional[Sequence[str]] = None,
        tags: Optional[Sequence[str]] = None,
        files: Optional[Sequence[str]] = None,
        created_at: Optional[str] = None,
    ) -> Dict[str, Any]:
        normalized_id = _normalize_intent_id(intent_id)
        with self._connect() as conn:
            current = self._fetch_row(conn, normalized_id)
            if current is None:
                raise IntentStoreError(f"{normalized_id} not found")

            updated = dict(current)
            if feature is not None:
                feature_value = feature.strip()
                if not feature_value:
                    raise IntentStoreError("feature must not be empty")
                updated["feature"] = feature_value
                updated["file_name"] = f"{normalized_id}-{_slugify(feature_value)}.md"
            if situation is not None:
                updated["situation"] = situation.strip()
            if motivation is not None:
                updated["motivation"] = motivation.strip()
            if goal is not None:
                updated["goal"] = goal.strip()
            if linked_req is not None:
                updated["linked_req"] = _normalize_optional_string(linked_req)
            if linked_plan is not None:
                updated["linked_plan"] = _normalize_optional_string(linked_plan)
            if related_intent is not None:
                updated["related_intent"] = _normalize_string_list(related_intent)
            if tags is not None:
                updated["tags"] = _normalize_string_list(tags)
            if files is not None:
                updated["files"] = _normalize_string_list(files)
            if created_at is not None:
                created_at_value = _normalize_optional_string(created_at) or ""
                if created_at_value:
                    try:
                        datetime.fromisoformat(created_at_value)
                    except (TypeError, ValueError) as exc:
                        raise IntentStoreError(
                            f"Invalid ISO-8601 datetime: {created_at_value}"
                        ) from exc
                updated["created_at"] = created_at_value

            self._upsert_intent(conn, updated)

        self._remove_legacy_index()
        return {
            "id": normalized_id,
            "metadata": self._metadata_from_record(updated),
        }

    def delete(self, intent_id: str) -> Dict[str, Any]:
        normalized_id = _normalize_intent_id(intent_id)
        with self._connect() as conn:
            current = self._fetch_row(conn, normalized_id)
            if current is None:
                raise IntentStoreError(f"{normalized_id} not found")

            conn.execute("DELETE FROM intents WHERE id = ?", (normalized_id,))
            if self._fts_enabled:
                conn.execute("DELETE FROM intents_fts WHERE id = ?", (normalized_id,))

        self._remove_legacy_index()
        return {
            "id": normalized_id,
        }

    def get(self, intent_id: str) -> Optional[Dict[str, Any]]:
        normalized_id = _normalize_intent_id(intent_id)
        with self._connect() as conn:
            record = self._fetch_row(conn, normalized_id)
        if record is None:
            return None

        body = self._render_body_for_output(record)
        raw = _render_intent_document(
            metadata=self._metadata_from_record(record),
            body=body,
        )
        return {
            "id": normalized_id,
            "metadata": self._metadata_from_record(record),
            "body": body,
            "raw": raw,
        }

    def list(self) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, feature, linked_req, linked_plan, related_intent, tags, files, created_at, file_name
                FROM intents
                ORDER BY id
                """
            ).fetchall()
        return [self._entry_from_row(row) for row in rows]

    def search(self, keyword: str) -> List[Dict[str, Any]]:
        needle = (keyword or "").strip()
        if not needle:
            return []

        with self._connect() as conn:
            candidates = self._search_candidates(conn, needle)

        matches: List[Dict[str, Any]] = []
        for candidate in candidates:
            matches.extend(self._scan_lines_for_keyword(candidate, needle))
        return matches

    def lookup(self, files: Sequence[str]) -> List[Dict[str, Any]]:
        requested = {_normalize_file_path(item) for item in files if item and item.strip()}
        if not requested:
            return []

        results: List[Dict[str, Any]] = []
        for entry in self.list():
            entry_files = {_normalize_file_path(item) for item in _normalize_string_list(entry.get("files"))}
            if entry_files.intersection(requested):
                results.append(entry)
        return sorted(results, key=lambda item: item.get("id", ""))

    def related(self, intent_id: str, depth: int = 1) -> Dict[str, Any]:
        root_id = _normalize_intent_id(intent_id)
        max_depth = max(1, int(depth))
        entries = self.list()
        by_id: Dict[str, Dict[str, Any]] = {
            _normalize_intent_id(entry.get("id", "")): entry for entry in entries if entry.get("id")
        }

        if root_id not in by_id:
            raise IntentStoreError(f"Intent not found: {root_id}")

        graph = self._build_related_graph(entries)
        queue: Deque[Tuple[str, int]] = deque([(root_id, 0)])
        visited = {root_id}
        discovered: List[Dict[str, Any]] = []

        while queue:
            current_id, current_depth = queue.popleft()
            if current_depth >= max_depth:
                continue
            neighbors = graph.get(current_id, {})
            for neighbor_id, reasons in neighbors.items():
                if neighbor_id in visited:
                    continue
                visited.add(neighbor_id)
                next_depth = current_depth + 1
                queue.append((neighbor_id, next_depth))
                discovered.append(
                    {
                        "id": neighbor_id,
                        "depth": next_depth,
                        "reasons": sorted(reasons),
                        "entry": by_id.get(neighbor_id, {}),
                    }
                )

        discovered.sort(key=lambda item: (item.get("depth", 0), item.get("id", "")))
        return {
            "source": root_id,
            "depth": max_depth,
            "related": discovered,
        }

    def rebuild(self) -> Dict[str, Any]:
        self.intent_dir.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT rowid, id, feature, situation, motivation, goal, linked_req, linked_plan,
                       related_intent, tags, files, created_at, file_name
                FROM intents
                ORDER BY id
                """
            ).fetchall()
            records = [self._record_from_row(row) for row in rows]
            entries = [_to_index_entry(self._metadata_from_record(record)) for record in records]

            if self._fts_enabled:
                conn.execute("DELETE FROM intents_fts")
                conn.executemany(
                    """
                    INSERT INTO intents_fts(id, feature, situation, motivation, goal)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    [
                        (
                            record["id"],
                            record["feature"],
                            record["situation"],
                            record["motivation"],
                            record["goal"],
                        )
                        for record in records
                    ],
                )

        self._remove_legacy_index()
        return {
            "entries": entries,
            "database": str(self.db_path),
        }

    def _initialize(self) -> None:
        self.intent_dir.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS intents (
                    id TEXT PRIMARY KEY,
                    feature TEXT NOT NULL,
                    situation TEXT NOT NULL,
                    motivation TEXT NOT NULL,
                    goal TEXT NOT NULL,
                    linked_req TEXT,
                    linked_plan TEXT,
                    related_intent TEXT NOT NULL,
                    tags TEXT NOT NULL,
                    files TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    file_name TEXT NOT NULL
                )
                """
            )
            self._ensure_fts(conn)
        self._remove_legacy_index()

    @contextmanager
    def _connect(self):
        try:
            conn = sqlite3.connect(self.db_path)
        except sqlite3.Error as exc:
            raise IntentStoreError(f"Failed to open SQLite DB: {exc}") from exc
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _ensure_fts(self, conn: sqlite3.Connection) -> None:
        if self._fts_enabled is not None:
            return
        try:
            conn.execute(
                """
                CREATE VIRTUAL TABLE IF NOT EXISTS intents_fts
                USING fts5(id UNINDEXED, feature, situation, motivation, goal)
                """
            )
            self._fts_enabled = True
        except sqlite3.OperationalError:
            self._fts_enabled = False

    def _upsert_intent(self, conn: sqlite3.Connection, record: Dict[str, Any]) -> None:
        payload = (
            record["id"],
            record["feature"],
            record["situation"],
            record["motivation"],
            record["goal"],
            record.get("linked_req"),
            record.get("linked_plan"),
            json.dumps(_normalize_string_list(record.get("related_intent")), ensure_ascii=False),
            json.dumps(_normalize_string_list(record.get("tags")), ensure_ascii=False),
            json.dumps(_normalize_string_list(record.get("files")), ensure_ascii=False),
            record.get("created_at") or "",
            record["file_name"],
        )
        conn.execute(
            """
            INSERT INTO intents (
                id, feature, situation, motivation, goal, linked_req, linked_plan,
                related_intent, tags, files, created_at, file_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                feature = excluded.feature,
                situation = excluded.situation,
                motivation = excluded.motivation,
                goal = excluded.goal,
                linked_req = excluded.linked_req,
                linked_plan = excluded.linked_plan,
                related_intent = excluded.related_intent,
                tags = excluded.tags,
                files = excluded.files,
                created_at = excluded.created_at,
                file_name = excluded.file_name
            """
            ,
            payload,
        )
        row = self._fetch_row(conn, record["id"])
        if row is None:
            raise IntentStoreError(f"Failed to persist {record['id']}")
        if self._fts_enabled:
            conn.execute("DELETE FROM intents_fts WHERE id = ?", (record["id"],))
            conn.execute(
                """
                INSERT INTO intents_fts(id, feature, situation, motivation, goal)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    record["id"],
                    row["feature"],
                    row["situation"],
                    row["motivation"],
                    row["goal"],
                ),
            )

    def _fetch_row(self, conn: sqlite3.Connection, intent_id: str) -> Optional[Dict[str, Any]]:
        row = conn.execute(
            """
            SELECT rowid, id, feature, situation, motivation, goal, linked_req, linked_plan,
                   related_intent, tags, files, created_at, file_name
            FROM intents
            WHERE id = ?
            """,
            (intent_id,),
        ).fetchone()
        if row is None:
            return None
        return self._record_from_row(row)

    def _record_from_row(self, row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "rowid": row["rowid"],
            "id": _normalize_intent_id(row["id"]),
            "feature": _normalize_optional_string(row["feature"]) or "",
            "situation": _normalize_optional_string(row["situation"]) or "",
            "motivation": _normalize_optional_string(row["motivation"]) or "",
            "goal": _normalize_optional_string(row["goal"]) or "",
            "linked_req": _normalize_optional_string(row["linked_req"]),
            "linked_plan": _normalize_optional_string(row["linked_plan"]),
            "related_intent": _json_list(row["related_intent"]),
            "tags": _json_list(row["tags"]),
            "files": _json_list(row["files"]),
            "created_at": _normalize_optional_string(row["created_at"]) or "",
            "file_name": row["file_name"],
        }

    def _entry_from_row(self, row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": _normalize_intent_id(row["id"]),
            "feature": _normalize_optional_string(row["feature"]) or "",
            "linked_req": _normalize_optional_string(row["linked_req"]),
            "linked_plan": _normalize_optional_string(row["linked_plan"]),
            "related_intent": _json_list(row["related_intent"]),
            "tags": _json_list(row["tags"]),
            "files": _json_list(row["files"]),
            "created_at": _normalize_optional_string(row["created_at"]) or "",
        }

    def _metadata_from_record(self, record: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": record["id"],
            "feature": record["feature"],
            "linked_req": _normalize_optional_string(record.get("linked_req")),
            "linked_plan": _normalize_optional_string(record.get("linked_plan")),
            "related_intent": _normalize_string_list(record.get("related_intent")),
            "tags": _normalize_string_list(record.get("tags")),
            "files": _normalize_string_list(record.get("files")),
            "created_at": _normalize_optional_string(record.get("created_at")) or "",
        }

    def _render_body_for_output(self, record: Dict[str, Any]) -> str:
        return _compose_jtbd_body(
            situation=record["situation"],
            motivation=record["motivation"],
            goal=record["goal"],
        )

    def _read_file_if_exists(self, path: Path) -> Optional[str]:
        if not path.exists():
            return None
        try:
            return path.read_text(encoding="utf-8")
        except OSError as exc:
            raise IntentStoreError(f"Failed to read {path}: {exc}") from exc

    def _iter_intent_files(self) -> Iterable[Path]:
        if not self.intent_dir.exists():
            return []
        return sorted(
            path
            for path in self.intent_dir.glob("INTENT-*.md")
            if path.is_file()
        )

    def _record_from_markdown(self, intent_path: Path) -> Dict[str, Any]:
        try:
            raw_text = intent_path.read_text(encoding="utf-8")
        except OSError as exc:
            raise IntentStoreError(f"Failed to read {intent_path}: {exc}") from exc

        frontmatter, body = _split_frontmatter(raw_text)
        metadata = _parse_frontmatter(frontmatter, intent_path)
        sections = _extract_jtbd_sections(body)
        return {
            "id": _normalize_intent_id(metadata.get("id") or _intent_id_from_filename(intent_path.name)),
            "feature": _normalize_optional_string(metadata.get("feature")) or "",
            "situation": sections["situation"],
            "motivation": sections["motivation"],
            "goal": sections["goal"],
            "linked_req": _normalize_optional_string(metadata.get("linked_req")),
            "linked_plan": _normalize_optional_string(metadata.get("linked_plan")),
            "related_intent": _normalize_string_list(metadata.get("related_intent")),
            "tags": _normalize_string_list(metadata.get("tags")),
            "files": _normalize_string_list(metadata.get("files")),
            "created_at": _normalize_optional_string(metadata.get("created_at")) or "",
            "file_name": intent_path.name,
        }

    def _search_candidates(self, conn: sqlite3.Connection, needle: str) -> List[Dict[str, Any]]:
        if self._fts_enabled:
            try:
                rows = conn.execute(
                    """
                    SELECT i.rowid, i.id, i.feature, i.situation, i.motivation, i.goal, i.linked_req,
                           i.linked_plan, i.related_intent, i.tags, i.files, i.created_at, i.file_name
                    FROM intents AS i
                    JOIN intents_fts ON intents_fts.id = i.id
                    WHERE intents_fts MATCH ?
                    ORDER BY i.id
                    """,
                    (needle,),
                ).fetchall()
                return [self._record_from_row(row) for row in rows]
            except sqlite3.OperationalError:
                pass

        wildcard = f"%{needle}%"
        rows = conn.execute(
            """
            SELECT rowid, id, feature, situation, motivation, goal, linked_req, linked_plan,
                   related_intent, tags, files, created_at, file_name
            FROM intents
            WHERE feature LIKE ? OR situation LIKE ? OR motivation LIKE ? OR goal LIKE ?
            ORDER BY id
            """,
            (wildcard, wildcard, wildcard, wildcard),
        ).fetchall()
        return [self._record_from_row(row) for row in rows]

    def _scan_lines_for_keyword(self, record: Dict[str, Any], needle: str) -> List[Dict[str, Any]]:
        raw = _render_intent_document(
            metadata=self._metadata_from_record(record),
            body=self._render_body_for_output(record),
        )

        tokens = [t.strip().lower() for t in re.split(r'\bOR\b|\bAND\b|\bNOT\b', needle, flags=re.IGNORECASE) if t.strip()]
        if not tokens:
            tokens = [needle.lower()]

        matches: List[Dict[str, Any]] = []
        for line_no, line in enumerate(raw.splitlines(), start=1):
            line_lower = line.lower()
            if any(token in line_lower for token in tokens):
                matches.append(
                    {
                        "id": record["id"],
                        "file": record["file_name"],
                        "line": line_no,
                        "text": line,
                    }
                )
        return matches

    def _build_related_graph(self, entries: Sequence[Dict[str, Any]]) -> Dict[str, Dict[str, set]]:
        by_id: Dict[str, Dict[str, Any]] = {}
        for entry in entries:
            entry_id = _normalize_intent_id(entry.get("id", ""))
            if entry_id:
                by_id[entry_id] = entry

        graph: Dict[str, Dict[str, set]] = {entry_id: {} for entry_id in by_id}

        for entry_id, entry in by_id.items():
            for related_id in _normalize_string_list(entry.get("related_intent")):
                normalized_related_id = _normalize_intent_id(related_id)
                if normalized_related_id not in by_id:
                    continue
                graph[entry_id].setdefault(normalized_related_id, set()).add("related_intent")

            entry_tags = set(_normalize_string_list(entry.get("tags")))
            if not entry_tags:
                continue

            for other_id, other_entry in by_id.items():
                if other_id == entry_id:
                    continue
                shared_tags = sorted(entry_tags.intersection(_normalize_string_list(other_entry.get("tags"))))
                if shared_tags:
                    graph[entry_id].setdefault(other_id, set()).add(
                        "shared_tags:" + ",".join(shared_tags)
                    )

        return graph

    def _remove_legacy_index(self) -> None:
        self.legacy_index_path.unlink(missing_ok=True)


def _to_index_entry(metadata: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": _normalize_intent_id(metadata.get("id", "")),
        "feature": _normalize_optional_string(metadata.get("feature")) or "",
        "linked_req": _normalize_optional_string(metadata.get("linked_req")),
        "linked_plan": _normalize_optional_string(metadata.get("linked_plan")),
        "related_intent": _normalize_string_list(metadata.get("related_intent")),
        "tags": _normalize_string_list(metadata.get("tags")),
        "files": _normalize_string_list(metadata.get("files")),
        "created_at": _normalize_optional_string(metadata.get("created_at")) or "",
    }


def _render_intent_document(*, metadata: Dict[str, Any], body: str) -> str:
    lines = [
        "---",
        f'id: {json.dumps(_normalize_optional_string(metadata.get("id")) or "", ensure_ascii=False)}',
        f'feature: {json.dumps(_normalize_optional_string(metadata.get("feature")) or "", ensure_ascii=False)}',
        f'linked_req: {_yaml_scalar(_normalize_optional_string(metadata.get("linked_req")))}',
        f'linked_plan: {_yaml_scalar(_normalize_optional_string(metadata.get("linked_plan")))}',
        f'related_intent: {json.dumps(_normalize_string_list(metadata.get("related_intent")), ensure_ascii=False)}',
        f'tags: {json.dumps(_normalize_string_list(metadata.get("tags")), ensure_ascii=False)}',
        f'files: {json.dumps(_normalize_string_list(metadata.get("files")), ensure_ascii=False)}',
        f'created_at: {json.dumps(_normalize_optional_string(metadata.get("created_at")) or "", ensure_ascii=False)}',
        "---",
        "",
        body.rstrip(),
        "",
    ]
    return "\n".join(lines)


def _extract_jtbd_sections(body: str) -> Dict[str, str]:
    lines = body.splitlines()
    when_heading = "## When I..."
    motivation_heading = "## I want to..."
    goal_heading = "## So I can..."

    try:
        when_idx = next(idx for idx, line in enumerate(lines) if line.strip() == when_heading)
        motivation_idx = next(idx for idx, line in enumerate(lines) if line.strip() == motivation_heading)
        goal_idx = next(idx for idx, line in enumerate(lines) if line.strip() == goal_heading)
    except StopIteration as exc:
        raise IntentStoreError("Invalid intent body format") from exc

    if not (when_idx < motivation_idx < goal_idx):
        raise IntentStoreError("Invalid intent body section order")

    next_section_idx = len(lines)
    for idx in range(goal_idx + 1, len(lines)):
        if lines[idx].strip().startswith("## "):
            next_section_idx = idx
            break

    situation = "\n".join(lines[when_idx + 1 : motivation_idx]).strip()
    motivation = "\n".join(lines[motivation_idx + 1 : goal_idx]).strip()
    goal = "\n".join(lines[goal_idx + 1 : next_section_idx]).strip()
    tail = "\n".join(lines[next_section_idx:]).strip()
    return {
        "situation": situation,
        "motivation": motivation,
        "goal": goal,
        "tail": tail,
    }


def _compose_jtbd_body(*, situation: str, motivation: str, goal: str, tail: str = "") -> str:
    parts = [
        "## When I...",
        (situation or "").strip(),
        "",
        "## I want to...",
        (motivation or "").strip(),
        "",
        "## So I can...",
        (goal or "").strip(),
    ]
    text = "\n".join(parts).rstrip()
    if tail:
        text = f"{text}\n\n{tail.strip()}"
    return text + "\n"


def _split_frontmatter(raw_text: str) -> Tuple[str, str]:
    lines = raw_text.splitlines()
    if not lines or lines[0].strip() != "---":
        raise IntentStoreError("Missing YAML frontmatter start delimiter")

    frontmatter_lines: List[str] = []
    end_index = None
    for idx, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            end_index = idx
            break
        frontmatter_lines.append(line)

    if end_index is None:
        raise IntentStoreError("Missing YAML frontmatter end delimiter")

    body = "\n".join(lines[end_index + 1 :])
    return "\n".join(frontmatter_lines), body


def _normalize_intent_id(value: str) -> str:
    text = (value or "").strip().upper()
    if not text:
        raise IntentStoreError("intent_id is required")
    if not re.fullmatch(r"INTENT-\d+", text):
        raise IntentStoreError(f"Invalid intent id: {value}")
    return text


def _intent_id_from_filename(file_name: str) -> str:
    match = re.match(r"(INTENT-\d+)", file_name.upper())
    if not match:
        raise IntentStoreError(f"Invalid intent filename: {file_name}")
    return match.group(1)


def _normalize_optional_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _normalize_string_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        normalized: List[str] = []
        for item in value:
            text = _normalize_optional_string(item)
            if text:
                normalized.append(text)
        return normalized
    single = _normalize_optional_string(value)
    return [single] if single else []


def _normalize_file_path(value: str) -> str:
    text = str(value).strip().replace("\\", "/")
    return re.sub(r"/+", "/", text)


def _slugify(value: str) -> str:
    slug = value.strip().lower()
    slug = re.sub(r"\s+", "-", slug)
    slug = re.sub(r"[^0-9a-z가-힣_-]", "", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or "intent"


def _yaml_scalar(value: Optional[str]) -> str:
    if value is None:
        return "null"
    return json.dumps(value, ensure_ascii=False)


def _parse_frontmatter(frontmatter: str, path: Path) -> Dict[str, Any]:
    if yaml is not None:
        try:
            metadata = yaml.safe_load(frontmatter) or {}
        except Exception as exc:  # pragma: no cover - handled fallback below
            raise IntentStoreError(f"Invalid YAML frontmatter in {path}: {exc}") from exc
        if not isinstance(metadata, dict):
            raise IntentStoreError(f"Invalid metadata shape in {path}")
        return metadata

    try:
        return _parse_frontmatter_fallback(frontmatter)
    except Exception as exc:
        raise IntentStoreError(
            f"Invalid frontmatter in {path} (and PyYAML unavailable): {exc}"
        ) from exc


def _parse_frontmatter_fallback(frontmatter: str) -> Dict[str, Any]:
    lines = frontmatter.splitlines()
    metadata: Dict[str, Any] = {}
    index = 0

    while index < len(lines):
        raw_line = lines[index]
        line = raw_line.strip()
        if not line or line.startswith("#"):
            index += 1
            continue
        if ":" not in raw_line:
            raise ValueError(f"expected key:value line, got '{raw_line}'")

        key, value = raw_line.split(":", 1)
        key = key.strip()
        value = value.strip()

        if value:
            metadata[key] = _parse_scalar_or_list(value)
            index += 1
            continue

        list_items: List[str] = []
        cursor = index + 1
        while cursor < len(lines):
            candidate = lines[cursor]
            stripped = candidate.strip()
            if not stripped:
                cursor += 1
                continue
            if stripped.startswith("- "):
                list_items.append(_strip_quotes(stripped[2:].strip()))
                cursor += 1
                continue
            if ":" in candidate and not candidate.startswith((" ", "\t")):
                break
            break

        metadata[key] = list_items if list_items else None
        index = cursor

    return metadata


def _parse_scalar_or_list(value: str) -> Any:
    lowered = value.lower()
    if lowered in ("null", "~"):
        return None
    if value.startswith("[") and value.endswith("]"):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [str(item) for item in parsed]
        except json.JSONDecodeError:
            try:
                parsed = ast.literal_eval(value)
                if isinstance(parsed, list):
                    return [str(item) for item in parsed]
                return parsed
            except (ValueError, SyntaxError):
                inner = value[1:-1].strip()
                if not inner:
                    return []
                return [item.strip() for item in inner.split(",") if item.strip()]
    if value.startswith(("\"", "'")) and value.endswith(("\"", "'")):
        return _strip_quotes(value)
    return value


def _strip_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("\"", "'"):
        return value[1:-1]
    return value


def _json_list(raw: Any) -> List[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return _normalize_string_list(raw)
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return []
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            return _normalize_string_list(raw)
        return _normalize_string_list(parsed)
    return _normalize_string_list(raw)
