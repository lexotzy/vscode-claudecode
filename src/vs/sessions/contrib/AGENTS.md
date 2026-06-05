<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-05 | Updated: 2026-06-05 -->

# sessions/contrib

## Purpose
Self-contained feature contributions for the sessions workbench. Each subdirectory is an independent module with its own browser/common/electron-browser/test layers. Contributions are loaded at startup via `browser/sessions.web.contribution.ts`.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `providers/` | Session provider integrations — Claude CLI, agent host, copilot (see `providers/AGENTS.md`) |
| `sessions/` | Session list view and session management UI |
| `chat/` | Chat panel UI and message rendering |
| `changes/` | Changeset/diff review UI |
| `kanban/` | Kanban board view for session tasks |
| `editor/` | Editor integration and code review within sessions |
| `codeReview/` | Code review workflow |
| `github/` | GitHub PR / issue integration |
| `files/` | File tree and file management |
| `fileTreeView/` | Tree view for workspace files |
| `terminal/` | Embedded terminal for sessions |
| `workspace/` | Workspace management within sessions |
| `layout/` | Layout contribution and view registrations |
| `configuration/` | Sessions-specific settings contributions |
| `accountMenu/` | Account menu and auth status UI |
| `agentFeedback/` | Feedback collection for agent responses |
| `aiCustomizationTreeView/` | AI customization settings tree |
| `aquarium/` | Background animation / visual effects |
| `browserView/` | Embedded browser view panel |
| `applyCommitsToParentRepo/` | Apply agent commits to parent workspace |
| `chatDebug/` | Chat debugging tools |
| `policyBlocked/` | Policy-blocked feature UI |
| `search/` | Search within sessions |
| `tunnelHost/` | Tunnel host integration |

## For AI Agents

### Working In This Directory
- Each contrib is a self-contained module — changes to one rarely affect others
- New features: create a new subdirectory with `browser/`, `common/`, and `test/` sub-layers
- Register the new contribution in `../browser/sessions.web.contribution.ts`
- The hottest path is `providers/claudeCli/` — see `providers/AGENTS.md` for details
- Tests live in `<contrib>/test/browser/` or `<contrib>/test/common/`

### Testing Requirements
- `scripts/test.sh --grep <ContribName>`
- E2E tests in `src/vs/sessions/test/e2e/scenarios/`

### Common Patterns
- `*.contribution.ts` — top-level registration file for the contrib
- `browser/` contains all renderer code; `common/` has platform-agnostic types
- Use `Registry.as(Extensions.ViewsRegistry).registerViews(...)` for view contributions

## Dependencies

### Internal
- `src/vs/sessions/services/` — service interfaces consumed by contribs
- `src/vs/workbench/` — base VS Code services (one-way)

<!-- MANUAL: -->
