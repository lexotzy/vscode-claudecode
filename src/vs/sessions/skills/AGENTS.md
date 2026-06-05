<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-05 | Updated: 2026-06-05 -->

# sessions/skills

## Purpose
Built-in agentic skill definitions for common Git/GitHub workflows. Each subdirectory is a named skill that the sessions agent can invoke as a structured action. Skills are referenced by name and executed by the agent host.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `commit/` | Create a git commit with a generated message |
| `create-pr/` | Create a GitHub pull request |
| `create-draft-pr/` | Create a draft GitHub pull request |
| `update-pr/` | Update an existing PR description |
| `merge/` | Merge a pull request |
| `sync/` | Sync branch with upstream/base |
| `sync-upstream/` | Sync fork with the upstream repository |
| `act-on-feedback/` | Apply review feedback to code changes |
| `generate-run-commands/` | Generate shell commands for a task |
| `update-skills/` | Update the skills list itself |

## For AI Agents

### Working In This Directory
- Each skill is a self-contained definition — typically a prompt template and metadata
- Skills are invoked by name from the agent host; the skill definition controls what the agent does
- Adding a new skill: create a new subdirectory with the skill definition file(s)

### Common Patterns
- Skills map to discrete, repeatable actions that agents perform on behalf of the user
- Keep skill definitions focused — one skill, one action

## Dependencies

### Internal
- `src/vs/sessions/services/` — skills may reference session service interfaces

<!-- MANUAL: -->
