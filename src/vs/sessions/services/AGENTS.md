<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-05 | Updated: 2026-06-05 -->

# sessions/services

## Purpose
Service implementations for the sessions layer. Each service follows the VS Code DI pattern: an interface in `common/`, a browser implementation in `browser/`, and tests in `test/`. Services are registered in `web.main.ts` or contribution files.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `sessions/` | Core session model service — CRUD, state machine, provider orchestration |
| `agentHost/` | Agent host connection and lifecycle service |
| `agentHostFilter/` | Filtering/routing logic for which agent host handles a session |
| `chatView/` | Chat view state management service |
| `configuration/` | Sessions-specific configuration service (in-memory workspace config) |
| `extensionRecommendations/` | Extension recommendation service for sessions context |
| `title/` | Title bar content service for sessions window |
| `workspace/` | Workspace context service — manages in-memory workspace folders |

## For AI Agents

### Working In This Directory
- Interface in `<service>/common/` → implementation in `<service>/browser/`
- Register services in `SessionsBrowserMain.createServices()` or a contribution file
- `sessions/` service is the core — it owns the session state machine and delegates to providers
- `workspace/` overrides standard VS Code workspace service to keep folders in-memory (no `.code-workspace` file)

### Testing Requirements
- `scripts/test.sh --grep <ServiceName>`
- Test files in `<service>/test/browser/` or `<service>/test/common/`

### Common Patterns
```typescript
export const IMyService = createDecorator<IMyService>('myService');
export interface IMyService {
    readonly _serviceBrand: undefined;
    doSomething(): Promise<void>;
}
```

## Dependencies

### Internal
- `src/vs/sessions/common/` — shared types
- `src/vs/platform/claudeCli/` — Claude CLI service (used by sessions service via provider)

<!-- MANUAL: -->
