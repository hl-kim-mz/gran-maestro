# Gran Maestro

[한국어](README.md) | [English](README.en.md)

> **"I am the Maestro — I conduct, I don't code."**

Vague requests to AI produce wrong results fast.
What you need is a planning step before code — one where AI thinks with you.
Gran Maestro turns that planning step into an AI partnership.

```bash
/plugin marketplace add myrtlepn/gran-maestro
```

![Plans discussed and validated in a real dashboard](docs/assets/dashboard-ideation.png)

[Q&A Planning](#feature-summary) | [Multi-angle Brainstorming](#feature-summary) | [Team Discussion](#feature-summary) | [UI Visualization](#feature-summary) | [Code Exploration](docs/skills-reference.en.md)

---

Conventional spec documents and PRDs create a gap between writing and execution. When context is lost before implementation begins, time, focus, and trust erode together. Planning and execution need to flow as one continuous process.

`/mst:plan` asks the right questions instead of writing code. Each answer sharpens the next question, turning a vague request into an actionable plan. When you hit a wall, the AI team collects perspectives from multiple angles (ideation) and debates until consensus is reached (discussion).

```
> /mst:plan "Improve the login screen"

[PM] Two decisions are needed:
  1. Add social login, or improve the existing form?
  2. Switch session management to JWT?

> If you're stuck, use ideation to gather opinions from the AI team.
```

Text-only agreement leaves gaps unchecked — screens are visualized instantly with Stitch, and completed plans are reviewed by multiple AIs in dedicated roles (Plan Review). Validated plans are handed off to the Codex and Gemini engineering team for automatic implementation. The dashboard lets you track progress and rationale in real time. Get started with the Quick Start below.

## Quick Start

In Claude Code (v1.0.33 or later):

```bash
/plugin marketplace add myrtlepn/gran-maestro
/plugin install mst@gran-maestro
```

```
# 1. Expand multiple requests as plans
/mst:plan Improve login screen
/mst:plan Add API endpoint
/mst:plan Fix dashboard error

# 2. Review specs and start execution in batch
/mst:list
/mst:approve PLN-001 PLN-002 PLN-003
```

Single-request mode is also available: `/mst:request`

Detailed installation guide: [docs/quick-start.en.md](docs/quick-start.en.md)

## Feature Summary

| Feature | Command | Purpose |
|---------|---------|---------|
| Q&A Planning | `/mst:plan` | Refine requirements through questions, produce validated plans |
| Multi-angle Brainstorming | `/mst:ideation` | AI team collects opinions in parallel, PM synthesizes |
| Team Discussion | `/mst:discussion` | Iterative discussion until consensus is reached |
| Bug Investigation | `/mst:debug` | 3 AIs investigate bugs in parallel, consolidated report |
| UI Visualization | `/mst:stitch` | Generate UI mockups instantly with Stitch |
| Code Exploration | `/mst:explore` | Autonomous codebase exploration, evidence for specs |

Full skill list: [docs/skills-reference.en.md](docs/skills-reference.en.md)

## Documentation

**Getting Started**
- [Quick Start](docs/quick-start.en.md) — prerequisites, installation, Stitch MCP setup, authentication
- [Configuration](docs/configuration.en.md) — complete config.json option reference

**In Depth**
- [Skills Reference](docs/skills-reference.en.md) — detailed usage of 30 skills
- [Dashboard](docs/dashboard.en.md) — hub architecture, views, API endpoints
- [Best Practices](docs/best-practices.en.md) — efficient workflow patterns
- [OMX Guide](docs/omx-guide.en.md) — oh-my-codex install, AGENTS.md customization, trigger reference

**Reference**
- [Glossary](docs/glossary.en.md) — official terms and ID system
- [Changelog](CHANGELOG.md) — version history

## License

Source Available License — free to use, but fork and redistribution are not allowed. See [LICENSE](LICENSE) for details.
