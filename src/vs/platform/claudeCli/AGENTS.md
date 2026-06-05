<!-- Parent: ../../../../AGENTS.md -->
<!-- Generated: 2026-06-05 | Updated: 2026-06-05 -->

# claudeCli (platform service)

## Purpose
Platform-level service that manages Claude Code CLI processes. Runs the actual `claude` binary in the Electron main process (where Node.js APIs are available) and exposes it to the renderer via IPC. This is the lowest-level integration point between VS Code and the Claude CLI.

## Key Files

| File | Description |
|------|-------------|
| `common/claudeCli.ts` | `IClaudeCliService` interface — service contract and event types |
| `common/processLifecycle.ts` | `escalatingKill()` — graceful → SIGTERM → SIGKILL process termination |
| `common/streamJson.ts` | Claude CLI NDJSON stream event type definitions |
| `common/streamJsonParser.ts` | Incremental NDJSON line parser for CLI stdout |
| `electron-main/claudeCliMainService.ts` | `ClaudeCliMainService` — actual implementation; spawns `claude` via `child_process`, runs MCP approval HTTP server |
| `electron-browser/claudeCliService.ts` | IPC proxy — delegates all calls to main process via `registerMainProcessRemoteService` |
| `node/findClaude.ts` | Locates the `claude` binary on PATH or well-known install paths |
| `test/common/processLifecycle.test.ts` | Unit tests for process lifecycle |
| `test/common/streamJsonParser.test.ts` | Unit tests for NDJSON parser |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `common/` | Interface, types, utilities — no Node.js APIs |
| `electron-main/` | Main-process implementation with `child_process`, `http`, `fs` |
| `electron-browser/` | Renderer-side IPC proxy (one-liner delegation to main) |
| `node/` | Node.js utilities safe in both main and node workers |
| `test/` | Unit tests for common utilities |

## For AI Agents

### Working In This Directory
- `electron-main/` has full Node.js access — spawn processes, open sockets, read files
- `electron-browser/` must NOT use Node.js APIs — renderer process only
- `common/` must be free of platform-specific imports
- The MCP approval server in `claudeCliMainService.ts` is a local HTTP server that Claude CLI calls back to for tool-use permission grants — changes here affect the permission flow in `claudeCliSessionsProvider.ts`
- `escalatingKill` sends SIGINT → waits → SIGTERM → waits → SIGKILL; respect this order when adding process teardown logic

### Testing Requirements
- `scripts/test.sh --grep streamJson` — unit tests for parser
- `scripts/test.sh --grep processLifecycle`

### Common Patterns
- Events are service-level, tagged with `sessionId` so one IPC channel serves many sessions
- `IClaudeCliService.startSession(sessionId, workspacePath, prompt, resumeCliSessionId?, modelId?)` — main entry point
- `onDidSessionData` / `onDidSessionEnd` / `onDidPermissionRequest` — the three event streams

## Dependencies

### Internal
- `src/vs/base/common/event.ts` — `Event<T>` and `Emitter<T>`
- `src/vs/platform/instantiation/` — DI decorators

### External
- Node.js `child_process`, `readline`, `http`, `fs` (main process only)
- `claude` binary on PATH

<!-- MANUAL: -->
