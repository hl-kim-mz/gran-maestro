# Configuration Management (Configuration Reference)

[한국어](configuration.md) | [English](configuration.en.md)

` .gran-maestro/config.json` controls all behavior.
It is generated with defaults on first run of `/mst:request` or `/mst:on`.

```
/mst:settings                                    # show all settings
/mst:settings workflow.max_feedback_rounds        # show a specific setting
/mst:settings workflow.max_feedback_rounds 3      # change a setting
```

You can also edit it through the dashboard **Settings** tab with a web UI.

---

## Table of contents

- [workflow](#workflow)
- [server](#server)
- [concurrency](#concurrency)
- [timeouts](#timeouts)
- [worktree](#worktree)
- [retry](#retry)
- [history / archive](#history--archive)
- [discussion / ideation](#discussion--ideation)
- [collaborative_debug](#collaborative-debug)
- [debug.agents](#debugagents)
- [models](#models)
- [notifications / realtime / debug / cleanup](#notifications--realtime--debug--cleanup)
- [Example setting presets](#example-setting-presets)

---

## workflow

Controls the overall workflow behavior.

| Key | Default | Description |
|----|--------|------|
| `workflow.max_feedback_rounds` | `5` | maximum number of feedback loops in Phase 4 |
| `workflow.auto_approve_spec` | `false` | auto-approve spec |
| `workflow.auto_accept_result` | `true` | auto accept after Phase 3 review PASS |
| `workflow.default_agent` | `codex-dev` | default execution agent |

---

## server

Settings for dashboard server access.

| Key | Default | Description |
|----|--------|------|
| `server.port` | `3847` | dashboard port |
| `server.host` | `127.0.0.1` | dashboard host |

---

## concurrency

Controls parallelism level.

| Key | Default | Description |
|----|--------|------|
| `concurrency.max_parallel_tasks` | `5` | maximum number of parallel tasks |
| `concurrency.max_parallel_reviews` | `3` | maximum number of parallel reviews |
| `concurrency.queue_strategy` | `fifo` | queue strategy |

---

## timeouts

Timeout settings for each stage (ms).

| Key | Default | Description |
|----|--------|------|
| `timeouts.cli_default_ms` | `300000` | default CLI timeout (5 min) |
| `timeouts.cli_large_task_ms` | `1800000` | large task timeout (30 min) |
| `timeouts.pre_check_ms` | `120000` | pre-check timeout (2 min) |
| `timeouts.merge_ms` | `60000` | merge timeout (1 min) |
| `timeouts.dashboard_health_check_ms` | `10000` | dashboard health check (10 sec) |

---

## worktree

Settings for Git worktree creation and management.

| Key | Default | Description |
|----|--------|------|
| `worktree.root_directory` | `.gran-maestro/worktrees` | root path for worktrees |
| `worktree.max_active` | `10` | maximum active worktrees |
| `worktree.base_branch` | `main` | base branch |
| `worktree.stale_timeout_hours` | `24` | stale threshold (hours) |
| `worktree.auto_cleanup_on_cancel` | `true` | auto cleanup on cancel |

---

## retry

Controls retry behavior on failure.

| Key | Default | Description |
|----|--------|------|
| `retry.max_cli_retries` | `2` | maximum number of CLI retries |
| `retry.max_fallback_depth` | `1` | maximum fallback depth |
| `retry.backoff_base_ms` | `1000` | base backoff time (ms) |

---

## history / archive

Settings for request history retention and session archive.

| Key | Default | Description |
|----|--------|------|
| `history.retention_days` | `30` | history retention period (days) |
| `history.auto_archive` | `true` | auto archive |
| `archive.max_active_sessions` | `20` | maximum active sessions |
| `archive.archive_retention_days` | `null` | archive retention period (null = indefinite) |
| `archive.auto_archive_on_create` | `true` | auto-archive when sessions exceed limits at creation |
| `archive.auto_archive_on_complete` | `true` | auto-archive on completion |
| `archive.archive_directory` | `.gran-maestro/archive` | archive path |

---

## discussion / ideation

Controls discussion and ideation rounds.

| Key | Default | Description |
|----|--------|------|
| `discussion.response_char_limit` | `2000` | Discussion response character limit |
| `discussion.critique_char_limit` | `2000` | Discussion critique character limit |
| `discussion.default_max_rounds` | `5` | default max number of rounds |
| `discussion.max_rounds_upper_limit` | `10` | maximum rounds upper limit |
| `ideation.opinion_char_limit` | `2000` | Ideation opinion character limit |
| `ideation.critique_char_limit` | `2000` | Ideation critique character limit |

---

## collaborative_debug

Settings for collaborative debug mode.

| Key | Default | Description |
|----|--------|------|
| `collaborative_debug.finding_char_limit` | `3000` | debug finding character limit |
| `collaborative_debug.merge_wait_ms` | `60000` | agent join wait time (60 sec) |
| `collaborative_debug.auto_trigger_from_start` | `true` | auto trigger debug when intent is detected in `/mst:request` |

---

## debug.agents

Controls the number of agents participating in debug investigation.

| Key | Default | Description |
|----|--------|------|
| `debug.agents.codex` | `1` | number of Codex agents in debug investigation (0 to exclude) |
| `debug.agents.gemini` | `1` | number of Gemini agents in debug investigation (0 to exclude) |
| `debug.agents.claude` | `0` | number of Claude agents in debug investigation (0 to exclude) |

Participation rules:
- total: 1 to 6
- defaults when omitted: `codex: 1`, `gemini: 1`, `claude: 0`

---

## models

Models used for each role.

| Key | Default | Description |
|----|--------|------|
| `models.claude.pm_conductor` | `sonnet` | PM conductor for Phase 1, 3 |
| `models.claude.architect` | `sonnet` | architect (Design Wing) |
| `models.claude.ideation` | `sonnet` | ideation participant |
| `models.claude.discussion` | `sonnet` | discussion participant |
| `models.claude.debug` | `sonnet` | debug participant |
| `models.developer.primary` | `codex / gpt-5.3-codex` | primary developer (provider/model) |
| `models.developer.fallback` | `gemini / gemini-3-pro-preview` | fallback developer |
| `models.reviewer.primary` | `codex / gpt-5.3-codex` | primary reviewer |
| `models.reviewer.fallback` | `gemini / gemini-3-pro-preview` | fallback reviewer |

Example config:
```json
"models": {
  "claude": {
    "pm_conductor": "sonnet",
    "architect": "sonnet",
    "ideation": "sonnet",
    "discussion": "sonnet",
    "debug": "sonnet"
  },
  "developer": {
    "primary": { "provider": "codex", "model": "gpt-5.3-codex" },
    "fallback": { "provider": "gemini", "model": "gemini-3-pro-preview" }
  },
  "reviewer": {
    "primary": { "provider": "codex", "model": "gpt-5.3-codex" },
    "fallback": { "provider": "gemini", "model": "gemini-3-pro-preview" }
  }
}
```

---

## notifications / realtime / debug / cleanup

Settings for notifications, realtime updates, debug logging, and session cleanup.

| Key | Default | Description |
|----|--------|------|
| `notifications.terminal` | `true` | terminal notifications |
| `notifications.dashboard` | `true` | dashboard notifications |
| `realtime.protocol` | `sse` | realtime protocol (SSE) |
| `realtime.debounce_ms` | `100` | event debounce (ms) |
| `debug.enabled` | `false` | debug mode |
| `debug.log_level` | `info` | log level |
| `debug.log_prompts` | `false` | prompt logging |
| `cleanup.ideation_keep_count` | `10` | number of ideation sessions kept |
| `cleanup.discussion_keep_count` | `10` | number of discussion sessions kept |
| `cleanup.debug_keep_count` | `10` | number of debug sessions kept |
| `cleanup.old_request_threshold_hours` | `24` | threshold to classify old requests (hours) |

---

## Example setting presets

The following are recommended presets by usage pattern.
Apply these in `.gran-maestro/config.json` or change individually with `/mst:settings <key> <value>`.

### Example 1: parallel execution optimized

Maximize throughput for handling many tasks in team settings.
Recommended only on machines with sufficient resources.

```json
{
  "concurrency": {
    "max_parallel_tasks": 10,
    "max_parallel_reviews": 6,
    "queue_strategy": "fifo"
  },
  "worktree": {
    "max_active": 20,
    "stale_timeout_hours": 48,
    "auto_cleanup_on_cancel": true
  },
  "timeouts": {
    "cli_default_ms": 600000,
    "cli_large_task_ms": 3600000
  },
  "archive": {
    "max_active_sessions": 50,
    "auto_archive_on_create": true,
    "auto_archive_on_complete": true
  }
}
```

### Example 2: cost-saving mode

Limit agent count and discussion rounds to minimize API cost.
Suitable for small projects or personal development.

```json
{
  "debug": {
    "agents": {
      "codex": 1,
      "gemini": 0,
      "claude": 0
    }
  },
  "discussion": {
    "response_char_limit": 1000,
    "critique_char_limit": 1000,
    "default_max_rounds": 2,
    "max_rounds_upper_limit": 3
  },
  "ideation": {
    "opinion_char_limit": 1000,
    "critique_char_limit": 1000
  },
  "workflow": {
    "max_feedback_rounds": 2,
    "auto_accept_result": true
  },
  "concurrency": {
    "max_parallel_tasks": 3,
    "max_parallel_reviews": 2
  }
}
```

### Example 3: offline / auto-accept mode

Run workflows fully automatically without interaction.
Suitable for CI/CD pipelines or nightly batch jobs.

```json
{
  "workflow": {
    "auto_approve_spec": true,
    "auto_accept_result": true,
    "max_feedback_rounds": 1,
    "default_agent": "codex-dev"
  },
  "notifications": {
    "terminal": false,
    "dashboard": true
  },
  "debug": {
    "enabled": false,
    "log_level": "warn",
    "log_prompts": false
  },
  "collaborative_debug": {
    "auto_trigger_from_start": false
  },
  "retry": {
    "max_cli_retries": 3,
    "max_fallback_depth": 2,
    "backoff_base_ms": 2000
  }
}
```
