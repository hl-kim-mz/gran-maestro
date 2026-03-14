#!/usr/bin/env python3
"""Intent store abstraction and file-backed implementation."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections import deque
from datetime import datetime, timezone
import ast
import json
from pathlib import Path
import re
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
    def rebuild_index(self) -> Dict[str, Any]:
        raise NotImplementedError


class FileIntentStore(IntentStore):
    def __init__(self, project_root: Path):
        self.project_root = Path(project_root).resolve()
        self.intent_dir = self.project_root / ".gran-maestro" / "intent"
        self.index_path = self.intent_dir / "index.json"
        self.template_path = self.project_root / "templates" / "intent-template.md"

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
        if self._find_intent_path(normalized_id) is not None:
            raise IntentStoreError(f"Intent already exists: {normalized_id}")

        created_at_value = created_at or datetime.now(timezone.utc).date().isoformat()
        feature_value = feature.strip()
        if not feature_value:
            raise IntentStoreError("feature must not be empty")

        metadata = {
            "id": normalized_id,
            "feature": feature_value,
            "linked_req": _normalize_optional_string(linked_req),
            "linked_plan": _normalize_optional_string(linked_plan),
            "related_intent": _normalize_string_list(related_intent),
            "tags": _normalize_string_list(tags),
            "files": _normalize_string_list(files),
            "created_at": created_at_value,
        }

        intent_path = self.intent_dir / f"{normalized_id}-{_slugify(feature_value)}.md"
        intent_text = self._render_intent_template(
            metadata=metadata,
            situation=situation,
            motivation=motivation,
            goal=goal,
        )

        self.intent_dir.mkdir(parents=True, exist_ok=True)
        intent_path.write_text(intent_text, encoding="utf-8")

        self.rebuild_index()
        return {
            "id": normalized_id,
            "path": str(intent_path),
            "file": intent_path.name,
            "metadata": metadata,
        }

    def get(self, intent_id: str) -> Optional[Dict[str, Any]]:
        normalized_id = _normalize_intent_id(intent_id)
        intent_path = self._find_intent_path(normalized_id)
        if intent_path is None:
            return None
        metadata, body, raw_text = self._read_intent(intent_path)
        return {
            "id": normalized_id,
            "path": str(intent_path),
            "file": intent_path.name,
            "metadata": metadata,
            "body": body,
            "raw": raw_text,
        }

    def list(self) -> List[Dict[str, Any]]:
        entries = self._load_entries_from_index_or_scan()
        return sorted(entries, key=lambda item: item.get("id", ""))

    def search(self, keyword: str) -> List[Dict[str, Any]]:
        needle = (keyword or "").strip()
        if not needle:
            return []

        matches: List[Dict[str, Any]] = []
        for intent_path in self._iter_intent_files():
            intent_id = _intent_id_from_filename(intent_path.name)
            try:
                for line_no, line in enumerate(intent_path.read_text(encoding="utf-8").splitlines(), start=1):
                    if needle in line:
                        matches.append(
                            {
                                "id": intent_id,
                                "file": intent_path.name,
                                "line": line_no,
                                "text": line,
                            }
                        )
            except OSError as exc:
                raise IntentStoreError(f"Failed to read {intent_path}: {exc}") from exc
        return matches

    def lookup(self, files: Sequence[str]) -> List[Dict[str, Any]]:
        requested = {_normalize_file_path(item) for item in files if item and item.strip()}
        if not requested:
            return []

        results: List[Dict[str, Any]] = []
        for entry in self._load_entries_from_index_or_scan():
            entry_files = {_normalize_file_path(item) for item in _normalize_string_list(entry.get("files"))}
            if entry_files.intersection(requested):
                results.append(entry)
        return sorted(results, key=lambda item: item.get("id", ""))

    def related(self, intent_id: str, depth: int = 1) -> Dict[str, Any]:
        root_id = _normalize_intent_id(intent_id)
        max_depth = max(1, int(depth))
        entries = self._load_entries_from_index_or_scan()
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

    def rebuild_index(self) -> Dict[str, Any]:
        entries: List[Dict[str, Any]] = []
        for intent_path in self._iter_intent_files():
            metadata, _, _ = self._read_intent(intent_path)
            entries.append(_to_index_entry(metadata, intent_path.name))

        entries.sort(key=lambda item: item.get("id", ""))
        index_data = {
            "version": 1,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "entries": entries,
        }

        self.intent_dir.mkdir(parents=True, exist_ok=True)
        self.index_path.write_text(
            json.dumps(index_data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        return index_data

    def _iter_intent_files(self) -> Iterable[Path]:
        if not self.intent_dir.exists():
            return []
        return sorted(
            path
            for path in self.intent_dir.glob("INTENT-*.md")
            if path.is_file()
        )

    def _find_intent_path(self, intent_id: str) -> Optional[Path]:
        candidates = sorted(self.intent_dir.glob(f"{intent_id}-*.md"))
        for candidate in candidates:
            if candidate.is_file():
                return candidate
        return None

    def _read_intent(self, intent_path: Path) -> Tuple[Dict[str, Any], str, str]:
        try:
            raw_text = intent_path.read_text(encoding="utf-8")
        except OSError as exc:
            raise IntentStoreError(f"Failed to read {intent_path}: {exc}") from exc

        frontmatter, body = _split_frontmatter(raw_text)
        metadata = _parse_frontmatter(frontmatter, intent_path)

        normalized = {
            "id": _normalize_intent_id(metadata.get("id") or _intent_id_from_filename(intent_path.name)),
            "feature": _normalize_optional_string(metadata.get("feature")) or "",
            "linked_req": _normalize_optional_string(metadata.get("linked_req")),
            "linked_plan": _normalize_optional_string(metadata.get("linked_plan")),
            "related_intent": _normalize_string_list(metadata.get("related_intent")),
            "tags": _normalize_string_list(metadata.get("tags")),
            "files": _normalize_string_list(metadata.get("files")),
            "created_at": _normalize_optional_string(metadata.get("created_at")) or "",
        }
        return normalized, body, raw_text

    def _load_entries_from_index_or_scan(self) -> List[Dict[str, Any]]:
        if self.index_path.exists():
            try:
                index_data = json.loads(self.index_path.read_text(encoding="utf-8"))
                entries = index_data.get("entries", []) if isinstance(index_data, dict) else []
                if isinstance(entries, list):
                    return [_to_index_entry(entry, entry.get("file", "")) for entry in entries]
            except (json.JSONDecodeError, OSError):
                pass

        scanned: List[Dict[str, Any]] = []
        for intent_path in self._iter_intent_files():
            metadata, _, _ = self._read_intent(intent_path)
            scanned.append(_to_index_entry(metadata, intent_path.name))
        scanned.sort(key=lambda item: item.get("id", ""))
        return scanned

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

    def _render_intent_template(
        self,
        *,
        metadata: Dict[str, Any],
        situation: str,
        motivation: str,
        goal: str,
    ) -> str:
        template_text = _default_template()
        if self.template_path.exists():
            try:
                template_text = self.template_path.read_text(encoding="utf-8")
            except OSError:
                template_text = _default_template()

        replacements = {
            "INTENT_ID": json.dumps(metadata.get("id", ""), ensure_ascii=False),
            "FEATURE": json.dumps(metadata.get("feature", ""), ensure_ascii=False),
            "LINKED_REQ": _yaml_scalar(metadata.get("linked_req")),
            "LINKED_PLAN": _yaml_scalar(metadata.get("linked_plan")),
            "RELATED_INTENT": json.dumps(_normalize_string_list(metadata.get("related_intent")), ensure_ascii=False),
            "TAGS": json.dumps(_normalize_string_list(metadata.get("tags")), ensure_ascii=False),
            "FILES": json.dumps(_normalize_string_list(metadata.get("files")), ensure_ascii=False),
            "CREATED_AT": json.dumps(metadata.get("created_at", ""), ensure_ascii=False),
            "SITUATION": (situation or "").strip(),
            "MOTIVATION": (motivation or "").strip(),
            "GOAL": (goal or "").strip(),
        }

        rendered = template_text
        for key, value in replacements.items():
            rendered = rendered.replace(f"{{{{{key}}}}}", value)

        if not rendered.endswith("\n"):
            rendered += "\n"
        return rendered


def _to_index_entry(metadata: Dict[str, Any], file_name: str) -> Dict[str, Any]:
    return {
        "id": _normalize_intent_id(metadata.get("id", "")),
        "file": file_name,
        "feature": _normalize_optional_string(metadata.get("feature")) or "",
        "linked_req": _normalize_optional_string(metadata.get("linked_req")),
        "linked_plan": _normalize_optional_string(metadata.get("linked_plan")),
        "related_intent": _normalize_string_list(metadata.get("related_intent")),
        "tags": _normalize_string_list(metadata.get("tags")),
        "files": _normalize_string_list(metadata.get("files")),
        "created_at": _normalize_optional_string(metadata.get("created_at")) or "",
    }


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


def _default_template() -> str:
    return """---
id: {{INTENT_ID}}
feature: {{FEATURE}}
linked_req: {{LINKED_REQ}}
linked_plan: {{LINKED_PLAN}}
related_intent: {{RELATED_INTENT}}
tags: {{TAGS}}
files: {{FILES}}
created_at: {{CREATED_AT}}
---

## When I...
{{SITUATION}}

## I want to...
{{MOTIVATION}}

## So I can...
{{GOAL}}

## Implementation Decision

"""


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
                # YAML flow sequence with unquoted scalars (e.g. [core, api])
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
