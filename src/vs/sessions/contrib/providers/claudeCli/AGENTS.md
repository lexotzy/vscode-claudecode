<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-05 | Updated: 2026-06-05 -->

# providers/claudeCli

## Purpose
The Claude Code CLI session provider — the primary integration between the sessions UI and the `claude` binary. Implements `ISessionsProvider` by translating Claude CLI NDJSON stream events into the sessions model. This is the **hottest path** in the codebase (71 recorded touch points).

## Key Files

| File | Description |
|------|-------------|
| `browser/claudeCliSessionsProvider.ts` | Core provider — maps `IClaudeCliService` events to session state; handles streaming output, tool-use permissions, changesets, and model selection |
| `browser/claudeCliChangesets.ts` | `ClaudeCliSessionChangeset` — tracks file edits made during a session, builds diff summary |
| `browser/claudeCli.contribution.ts` | Registers the provider with the sessions registry |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `browser/` | All provider code (renderer process only) |

## For AI Agents

### Working In This Directory
**Read `claudeCliSessionsProvider.ts` fully before making changes.** It is complex and stateful.

Key responsibilities of `claudeCliSessionsProvider.ts`:
- Registers Claude models (`claude-haiku-4-5`, `claude-sonnet-4-5`, `claude-opus-4-5`, etc.)
- Calls `IClaudeCliService.startSession()` to spawn the CLI process
- Consumes `onDidSessionData` events (NDJSON lines) and parses them via `streamJson.ts` types
- Maps assistant/tool/system events to `ISession` state updates
- Handles `onDidPermissionRequest` — forwards tool-use permission prompts to the UI
- Delegates file-edit tracking to `ClaudeCliSessionChangeset`
- `FILE_EDITING_TOOLS = Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])` — tools that count as edits

**Event flow:**
```
claude binary stdout
  → IClaudeCliService.onDidSessionData (main process → IPC → renderer)
  → claudeCliSessionsProvider: parse NDJSON line
  → update ISession observables
  → UI re-renders
```

**Permission flow:**
```
claude requests tool permission
  → IClaudeCliService.onDidPermissionRequest
  → provider shows approval dialog
  → IClaudeCliService.respondToPermission(requestId, allow)
  → MCP approval HTTP server in claudeCliMainService.ts
```

### Testing Requirements
- No dedicated test directory yet — covered by E2E tests in `src/vs/sessions/test/e2e/`
- `npm run test:e2e` exercises the full flow

### Common Patterns
- `DisposableMap<sessionId, DisposableStore>` — one store per active session, cleaned up on `stopSession`
- `observableValue<SessionStatus>` for reactive session state
- `IClaudeCliService.checkAuthStatus()` called at provider init to gate session creation

## Dependencies

### Internal
- `src/vs/platform/claudeCli/common/claudeCli.ts` — `IClaudeCliService` interface (the IPC bridge)
- `src/vs/platform/claudeCli/common/streamJson.ts` — NDJSON event type guards
- `src/vs/sessions/services/sessions/common/` — `ISession`, `ISessionsProvider`, `SessionStatus`
- `src/vs/sessions/contrib/providers/claudeCli/browser/claudeCliChangesets.ts` — changeset tracking

### External
- Claude CLI binary (`claude`) — spawned by `IClaudeCliService` in the main process

<!-- MANUAL: -->
