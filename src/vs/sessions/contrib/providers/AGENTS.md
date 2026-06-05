<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-05 | Updated: 2026-06-05 -->

# contrib/providers

## Purpose
Session provider integrations. Each provider implements `ISessionsProvider` and connects the sessions UI to a specific agent backend. Providers register themselves with the sessions service at startup.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `claudeCli/` | **Claude Code CLI provider** — primary provider for local Claude sessions (see `claudeCli/AGENTS.md`) |
| `agentHost/` | Local agent host provider — connects to a locally-running agent host process |
| `remoteAgentHost/` | Remote agent host provider — connects over network/tunnel |
| `copilotChatSessions/` | GitHub Copilot Chat provider — delegates to Copilot extension |
| `localChatSessions/` | Local chat provider for offline/mock sessions |

## For AI Agents

### Working In This Directory
- `claudeCli/` is the hottest path — all Claude Code local sessions flow through it
- Each provider is independent; adding a new one means implementing `ISessionsProvider` and registering in a `*.contribution.ts` file
- `agentHost/` and `remoteAgentHost/` share the agent host protocol from `src/vs/platform/agentHost/`

### Common Patterns
- Provider implements `ISessionsProvider` from `src/vs/sessions/services/sessions/common/sessionsProvider.ts`
- Register: `SessionsProviderRegistry.registerProvider(new MyProvider(...))`

## Dependencies

### Internal
- `src/vs/sessions/services/sessions/` — `ISessionsProvider` interface
- `src/vs/platform/claudeCli/` — Claude CLI service (used by `claudeCli/`)
- `src/vs/platform/agentHost/` — agent host protocol (used by `agentHost/`, `remoteAgentHost/`)

<!-- MANUAL: -->
