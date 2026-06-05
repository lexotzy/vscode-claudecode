<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-05 | Updated: 2026-06-05 -->

# sessions/browser

## Purpose
Browser-process entry point and UI scaffolding for the sessions workbench. Contains the custom workbench class, layout engine, menu registrations, and the web factory that bootstraps the sessions window.

## Key Files

| File | Description |
|------|-------------|
| `web.main.ts` | `SessionsBrowserMain` — overrides `BrowserMain` to inject sessions-specific workspace/config services |
| `workbench.ts` | `SessionsWorkbench` — custom layout: chat panel, editor area, mobile parts |
| `web.factory.ts` | Browser bootstrap factory called from the HTML entry point |
| `sessions.web.contribution.ts` | Top-level contribution file — imports all browser-layer contrib modules |
| `layoutPolicy.ts` | Rules controlling editor/agent toggle and panel visibility |
| `layoutActions.ts` | Actions for toggling layout modes |
| `menus.ts` | Menu contributions and action registrations |
| `chatDashboardService.ts` | Service managing the chat dashboard view state |
| `accountTitleBarState.ts` | Observable state for account info in the title bar |
| `mobileNavigationStack.ts` | Navigation stack for mobile view mode |
| `sessionsSetUpService.ts` | One-time setup tasks on sessions window open |
| `dnd.ts` | Drag-and-drop handling for session items |
| `openInVSCodeUtils.ts` | Helpers to open files/folders in the parent VS Code window |
| `paneCompositePartService.ts` | Sessions-specific pane composite part override |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `actions/` | Command/action implementations |
| `parts/` | Custom workbench parts (editor, chat bar, auxiliary bar) |
| `widget/` | Standalone reusable widgets |
| `media/` | CSS stylesheets for browser-layer UI |

## For AI Agents

### Working In This Directory
- `workbench.ts` owns the top-level layout grid — add new parts here if needed
- `sessions.web.contribution.ts` is the import manifest; add new `import './my-contrib.js'` lines here
- Layout toggle (editor ↔ agent view) is driven by `layoutPolicy.ts` + `layoutActions.ts`
- Mobile-specific code lives in `parts/mobile/` contributions and `mobileNavigationStack.ts`

### Testing Requirements
- Browser unit tests: `scripts/test.sh --grep <pattern>` (look in `../../test/browser/`)
- E2E: `npm run test:e2e`

### Common Patterns
- Override VS Code base classes with `protected override` methods
- CSS modules in `media/` — import via `import './media/style.css'`

## Dependencies

### Internal
- `src/vs/workbench/browser/web.main.ts` — base `BrowserMain`
- `src/vs/sessions/services/` — sessions-layer service implementations
- `src/vs/sessions/contrib/` — feature contributions (loaded via `sessions.web.contribution.ts`)

<!-- MANUAL: -->
