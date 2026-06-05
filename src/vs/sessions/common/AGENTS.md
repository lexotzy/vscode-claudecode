<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-05 | Updated: 2026-06-05 -->

# sessions/common

## Purpose
Shared interfaces, types, constants, and pure utilities for the sessions layer. No platform-specific imports — must be importable from browser, node, and electron-main contexts.

## Key Files

| File | Description |
|------|-------------|
| `agentHostSessionsProvider.ts` | `IAgentHostSessionsProvider` — extends `ISessionsProvider` with remote connection and session config APIs |
| `agentHostSessionWorkspace.ts` | Types for agent host session workspace descriptors |
| `sessionConfig.ts` | `isSessionConfigComplete()` — checks if all required config values are present |
| `categories.ts` | Command category string constants used across contributions |
| `contextkeys.ts` | Context key definitions (`ContextKeyExpr`) for conditional command/menu visibility |
| `sizes.ts` | Layout size constants (panel widths, heights) |
| `theme.ts` | Token color and theme contribution constants |
| `sessionsTelemetry.ts` | Telemetry event type definitions |
| `welcome.ts` | Welcome/onboarding state types |

## For AI Agents

### Working In This Directory
- No Node.js APIs, no DOM APIs, no Electron APIs
- Add new context keys to `contextkeys.ts` before gating any commands on them
- `IAgentHostSessionsProvider` is the primary extension point for new session provider types
- Size constants in `sizes.ts` are referenced by layout code — change carefully

### Testing Requirements
- Pure unit tests — no browser or electron runtime needed
- `scripts/test.sh --grep <pattern>` with test files in `../../test/common/`

## Dependencies

### Internal
- `src/vs/sessions/services/sessions/common/` — session model types
- `src/vs/platform/agentHost/common/` — agent host protocol

<!-- MANUAL: -->
