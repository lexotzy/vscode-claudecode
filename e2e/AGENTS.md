<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-05 | Updated: 2026-06-05 -->

# e2e

## Purpose
Playwright E2E tests for the sessions UI web layer. Tests run against the sessions web server (`node scripts/code-sessions-web.js --port 9222 --skip-welcome --mock`) configured in `playwright.config.ts`.

## Key Files

| File | Description |
|------|-------------|
| `example.spec.ts` | Baseline smoke tests — page loads and no console errors |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `fixtures/` | Custom Playwright fixtures (extend `test` with shared setup) |
| `pages/` | Page Object Models for sessions UI components |
| `test-data/` | Static test data files |

## For AI Agents

### Working In This Directory
- `baseURL` is `http://localhost:9222` — the sessions web server must be running or the `webServer` block in `playwright.config.ts` starts it
- Use Page Object Models in `pages/` for any test that interacts with a reusable UI component
- Keep `example.spec.ts` as smoke-only; add feature-specific tests in separate `*.spec.ts` files
- The mock server (`--mock` flag) stubs Claude CLI responses — no real API calls in CI

### Testing Requirements
```bash
npm run test:e2e          # headless chromium
npm run test:e2e:ui       # interactive UI mode
npm run test:e2e:debug    # debug mode with inspector
```

### Common Patterns
- `await page.goto('/')` then `await expect(page).toHaveTitle(/.+/)`
- Use `page.getByRole(...)` over CSS selectors for resilience
- `page.on('pageerror', ...)` pattern to assert zero JS errors

## Dependencies

### Internal
- `playwright.config.ts` — test runner config and web server setup
- `scripts/code-sessions-web.js` — sessions web server used as `webServer`

### External
- `@playwright/test` — test framework

<!-- MANUAL: -->
