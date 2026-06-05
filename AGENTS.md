<!-- Generated: 2026-06-05 | Updated: 2026-06-05 -->

# vscode-claudecode

## Purpose
A VS Code fork that adds a dedicated **agentic sessions window** for running and managing Claude Code CLI sessions. The standard VS Code workbench is extended with a parallel `sessions` layer (`src/vs/sessions/`) that sits alongside `vs/workbench` — it may import from workbench but not vice versa.

## Key Files

| File | Description |
|------|-------------|
| `playwright.config.ts` | E2E test config — sessions web server on port 9222 |
| `product.json` | Product identity and feature flags |
| `package.json` | Deps and npm scripts (see `test:e2e`, `playwright-install`) |
| `.github/copilot-instructions.md` | Detailed coding guidelines (read before editing) |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/vs/sessions/` | Custom agentic sessions layer (see `src/vs/sessions/AGENTS.md`) |
| `src/vs/platform/claudeCli/` | Claude CLI platform service — IPC bridge (see `src/vs/platform/claudeCli/AGENTS.md`) |
| `src/vs/workbench/` | Standard VS Code workbench (upstream, avoid editing) |
| `src/vs/platform/` | Platform services and DI infrastructure |
| `e2e/` | Playwright E2E tests for sessions UI (see `e2e/AGENTS.md`) |
| `extensions/` | Built-in extensions shipped with VS Code |
| `scripts/` | Dev and build scripts |
| `build/` | Build tooling and CI scripts |

## For AI Agents

### Working In This Directory
- Read `.github/copilot-instructions.md` before any changes — it overrides defaults
- Use **tabs**, not spaces
- All user-visible strings must use `nls.localize()` from `vs/nls`
- `src/vs/sessions/` is the primary custom layer — most new feature work goes here
- Never import from `sessions/` inside `workbench/` — the dependency flows one way
- Run `npm run compile-check-ts-native` after changes under `src/` to catch type errors

### Testing Requirements
- TypeScript: `npm run compile-check-ts-native` (no build errors before tests)
- E2E: `npm run test:e2e` — requires sessions web server running or `webServer` block starts it
- Unit: `scripts/test.sh`

### Common Patterns
- Dependency injection via constructor parameters with service decorators (`@IServiceName`)
- Contribution model: features register to registries via `Registry.as(...).registerXxx(...)`
- Disposables: always store in `DisposableStore` / `DisposableMap`, never leak

## Dependencies

### External
- Electron — desktop shell
- `@playwright/test` — E2E testing
- TypeScript — strict mode

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
