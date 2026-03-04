[한국어](dashboard.md) | [English](dashboard.en.md)

# Gran Maestro Dashboard

A local web server-based dashboard for visual workflow monitoring.

## Getting started

```
/mst:dashboard              # start dashboard and register current project in hub
/mst:dashboard --stop       # stop dashboard
/mst:dashboard --port 8080  # start with custom port
/mst:dashboard --restart    # restart dashboard
```

| Option | Description |
|------|------|
| (none) | starts server on default port (`server.port`) and registers current project in hub |
| `--stop` | stop running dashboard server |
| `--port <number>` | start with a specific port |
| `--restart` | stop and start again |

The browser opens automatically after startup.

## Requirements

The dashboard server requires the **Deno runtime**. It will not start if Deno is not installed.

### Install Deno

```bash
# macOS / Linux (official install script)
curl -fsSL https://deno.land/install.sh | sh

# macOS (Homebrew)
brew install deno

# Windows (PowerShell)
irm https://deno.land/install.ps1 | iex
```

Verify with `deno --version` after installation.

## Hub architecture

It runs as a hub that manages **multiple projects concurrently** from one server instance. Each project is automatically registered to the hub when `/mst:dashboard` runs, and you can switch projects from the left sidebar.

Server data is stored in `~/.gran-maestro-hub/`:

| Item | Path |
|------|------|
| PID file | `~/.gran-maestro-hub/hub.pid` |
| project registry | `~/.gran-maestro-hub/registry.json` |
| log | `/tmp/gran-maestro-hub.log` |

## Dashboard views

| View | Description |
|---|------|
| Workflow Graph | Node-edge graph of Phase transitions with animated active nodes |
| Agent Stream | Real-time SSE stream of agent prompts/results |
| Documents | Markdown rendering of `.gran-maestro/` subfolder files (MD/JSON) |
| Dependency Graph | Visualization of blockedBy / blocks relationships among requests |
| Settings | Edit `config.json` in web UI (section form, reset defaults) |

## API endpoints

| Endpoint | Description |
|-----------|------|
| `GET /` | SPA dashboard rendering |
| `GET /events` | SSE real-time event stream |
| `POST /api/projects` | register a project |
| `DELETE /api/projects/:id` | unregister a project |
| `GET\|PUT /api/projects/:id/config` | get / update config |
| `GET /api/projects/:id/config/defaults` | config templates |
| `GET /api/projects/:id/mode` | mode status |
| `GET /api/projects/:id/requests` | request list |
| `GET /api/projects/:id/requests/:id/tasks` | task list |
| `GET /api/projects/:id/ideation` | Ideation session |
| `GET /api/projects/:id/discussion` | Discussion session |

## Port configuration

Default port is `3847` and can be changed in two ways.

### Method 1: set at startup

```
/mst:dashboard --port 8080
```

This applies only for that run and does not modify `config.json`.

### Method 2: permanent change in config file

Modify the `server` section of `config.json`:

```json
"server": {
  "port": 8080,
  "host": "127.0.0.1"
}
```

Or modify with `/mst:settings` command:

```
/mst:settings server.port 8080
/mst:settings server.host 127.0.0.1
```

| Key | Default | Description |
|----|--------|-------------|
| `server.port` | `3847` | dashboard port |
| `server.host` | `127.0.0.1` | binding host (localhost recommended) |

Restart the server with `/mst:dashboard --restart` after changing settings.
