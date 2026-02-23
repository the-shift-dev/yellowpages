# CLAUDE.md

This file provides guidance to Claude Code when working on this repository.

## Commands

```bash
bun test                          # Run all tests
bun test --coverage               # Run tests with coverage report
bun run dev                       # Run CLI locally (npx tsx src/main.ts)
bun run build                     # Build for npm (tsc → dist/)
bun run build:bun                 # Build native binary for current platform
```

## Architecture

yellowpages is a service catalog CLI for AI coding agents. It tracks services, systems, owners, APIs, and dependencies — stored as JSON files in `.yellowpages/`, committed to git.

### Layers

1. **CLI entry** (`src/main.ts`) — Commander-based routing. Global flags (`--json`, `--quiet`) propagated via `optsWithGlobals()`.
2. **Commands** (`src/commands/`) — Each entity (service, system, owner) is a Commander subcommand with add/list/show/rm actions. Standalone commands: `init`, `onboard`, `lint`, `search`, `deps`, `discover`.
3. **Relations** (`src/relations.ts`) — Shared module for cross-referencing entities. `resolveService()`, `resolveSystem()`, `resolveOwner()`, `filterServices()`. All relation stitching (e.g., "what depends on me?") happens here at query time — no background processing.
4. **Deps** (`src/deps.ts`) — Dependency graph traversal. `walkUp()` (dependents), `walkDown()` (dependencies), `findOrphans()`. Cycle-safe via ancestor tracking.
5. **Search** (`src/search-index.ts`) — MiniSearch-based full-text search with disk caching. Auto-rebuilds when catalog files change (hash-based invalidation).
6. **Discover** (`src/discover.ts`) — Service discovery from local directories and GitHub orgs. Parses `catalog-info.yaml` files or infers services from git repos. Diffing logic detects added/updated/unchanged services.
7. **Store** (`src/store.ts`) — File-based storage. JSON files in `.yellowpages/<collection>/<id>.json`. Walks up from cwd to find `.yellowpages/`. Supports ID-or-name resolution for all lookups.
8. **Types** (`src/types.ts`) — Core domain model: Service, System, Owner, Api, Dependency.

### Key patterns

- **Output triple**: Every command handles three output modes — `json` (structured for agents), `quiet` (exit codes only), human (chalk-colored). Use the `output()` helper from `utils/output.ts`.
- **Exit codes**: Semantic codes in `utils/exit-codes.ts` (0=success, 1=error, 2=user error, 3=not initialized).
- **ID-or-name resolution**: All commands accept either an ID or a name. `resolveId()` in `store.ts` checks ID first, then searches by name (case-insensitive).
- **Relations at query time**: No stitching phase or background jobs. When you `service show X`, it loads the full catalog and resolves owner, system, and dependents by scanning all services. Simple and correct.
- **Git-native**: Everything in `.yellowpages/` is plain JSON, designed to be committed, diffed, and reviewed in PRs. Search index cache (`.search-index.json`, `.search-hash`) is gitignored.

### Adding a new command

1. Create `src/commands/<name>.ts` exporting a Commander `Command` or async function
2. Import and add to `src/main.ts`
3. Follow the existing pattern: validate → `requireRoot()` → `loadCatalog()` → operate → `output()`
4. For relation resolution, use `relations.ts` — don't scatter `readAll` + `.filter` in commands
5. Write tests: unit tests for pure logic, CLI integration tests in `cli.test.ts`
