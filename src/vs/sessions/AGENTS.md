<!-- Parent: ../../../AGENTS.md -->
<!-- Generated: 2026-06-05 | Updated: 2026-06-05 -->

# sessions

## Purpose
The custom agentic sessions layer — a dedicated workbench for running and managing AI agent sessions (Claude Code CLI, agent hosts, copilot chat). Sits alongside `vs/workbench` and may import from it, but `workbench` must never import from `sessions`.

## Key Files

| File | Description |
|------|-------------|
| `browser/web.main.ts` | Browser entry point — `SessionsBrowserMain` extends `BrowserMain` |
| `browser/workbench.ts` | `SessionsWorkbench` — custom layout and part composition |
| `browser/sessions.web.contribution.ts` | Registers all browser-layer contributions |
| `browser/menus.ts` | Menu and action registrations for sessions UI |
| `browser/layoutPolicy.ts` | Layout rules (editor/agent toggle, panel visibility) |
| `common/agentHostSessionsProvider.ts` | `IAgentHostSessionsProvider` — extended provider interface |
| `common/sessionConfig.ts` | `isSessionConfigComplete()` helper |
| `common/categories.ts` | Command category constants |
| `common/contextkeys.ts` | Context key definitions for conditional UI |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `browser/` | Browser-layer UI, entry points, layout (see `browser/AGENTS.md`) |
| `common/` | Shared interfaces, types, and utilities (see `common/AGENTS.md`) |
| `contrib/` | Feature contributions — self-contained modules (see `contrib/AGENTS.md`) |
| `services/` | Service implementations for sessions layer (see `services/AGENTS.md`) |
| `skills/` | Agentic skill definitions for built-in agent actions (see `skills/AGENTS.md`) |
| `electron-browser/` | Electron-specific browser-process contributions |
| `test/` | Unit, browser, and E2E tests for the sessions layer |

## For AI Agents

### Working In This Directory
- One-way dependency: `sessions` → `workbench`, never the reverse
- New features go in `contrib/` as self-contained modules with `browser/`, `common/`, and `test/` sub-layers
- Services go in `services/` following the same sub-layer pattern
- All contribution registrations belong in `*.contribution.ts` files loaded at startup
- Context keys in `common/contextkeys.ts` control conditional UI — update them before adding key-gated commands

### Testing Requirements
- Unit/browser tests: `scripts/test.sh --grep <pattern>`
- E2E: `npm run test:e2e` (playwright against sessions web server)
- Type check: `npm run compile-check-ts-native`

### Common Patterns
- Features register via `Registry.as(Extensions.XxxRegistry).registerXxx(...)`
- Services declared as constructor parameters with `@IServiceName` decorators
- Disposables always in `DisposableStore` / `DisposableMap`

## Dependencies

### Internal
- `src/vs/workbench/` — base workbench parts (one-way)
- `src/vs/platform/claudeCli/` — Claude CLI service interface
- `src/vs/platform/agentHost/` — agent host protocol

### External
- VS Code base and platform layers

<!-- MANUAL: -->
