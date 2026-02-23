# yellowpages 📒

[![License](https://img.shields.io/badge/License-MIT-yellow)](https://opensource.org/licenses/MIT)

**Look it up before you break it.**

---

## The Problem

Your agent just got dropped into a codebase with 40 services, 12 teams, and a dependency graph that looks like a plate of spaghetti. It has no idea what exists, who owns what, or what'll break if it touches the wrong thing.

```bash
# Agent's inner monologue:
# "What services are there?"        → grep? find? pray?
# "Who owns auth-service?"          → git blame? Slack? Confluence?
# "What depends on payment-api?"    → trial and error? production outage?
```

There's a stale Confluence page somewhere. Nobody's updated it since the intern left.

**Your agent deserves better.**

---

## What if agents could understand your infrastructure before touching it?

```bash
# What exists?
yp service list
# ● checkout-api     EvoFg8sF  [production]
# ● payment-processor zSLMBKV6  [production]
# ● auth-service     k9Xm2wP1  [production]

# Who owns what?
yp owner show platform-team
# platform-team  team  3GJ00QQO
#   Slack: #platform
#
#   Systems
#   ● payments  8RW4htFP
#
#   Services
#   ● checkout-api  EvoFg8sF
#   ● payment-processor  zSLMBKV6

# What breaks if I touch this?
yp service show checkout-api
# checkout-api  EvoFg8sF
# Handles checkout flow
#
#   Owner:     platform-team
#   System:    payments
#   Lifecycle: production
#
#   APIs
#     Checkout REST API (rest) — Public checkout endpoints
#
#   Dependencies
#     → payment-processor (Stripe integration) — Sends payment requests
```

The agent knows what exists, who to ask, and what not to break. Before writing a single line of code.

**yellowpages is the service catalog. Look it up before you break it.**

---

## For Humans

You set up yellowpages once. Then your agent uses it every time.

### Installation

```bash
npm install -g yellowpages-cli
```

### Setup (one-time)

```bash
# Create the catalog in your repo
yp init

# Register who owns things
yp owner add --name platform-team --type team --slack "#platform"
yp owner add --name auth-team --type team --email "auth@company.com"

# Define your systems
yp system add --name payments --owner platform-team --description "Everything money-related"
yp system add --name identity --owner auth-team --description "Auth, users, permissions"

# Register your services
yp service add --name checkout-api \
  --system payments \
  --owner platform-team \
  --lifecycle production \
  --description "Handles checkout flow" \
  --repo https://github.com/company/checkout-api

yp service add --name auth-service \
  --system identity \
  --owner auth-team \
  --lifecycle production \
  --description "OAuth2 and session management"

# Add APIs
yp service api-add checkout-api \
  --name "Checkout REST API" \
  --type rest \
  --spec ./openapi.yaml \
  --description "Public checkout endpoints"

# Add dependencies
yp service dep-add checkout-api \
  --on payment-processor \
  --api "Stripe integration" \
  --description "Sends payment requests"

yp service dep-add checkout-api \
  --on auth-service \
  --description "Validates OAuth tokens"

# Commit to git — this is your service catalog
git add .yellowpages/
git commit -m "Add service catalog"
```

Now onboard your agent:

```bash
yp onboard
```

This adds yellowpages instructions to your `CLAUDE.md`, teaching your agent to check the catalog before making changes.

### Managing the Catalog

```bash
# Services
yp service add --name <name> [options]    # Register a service
yp service list                           # List all services
yp service show <id-or-name>              # Full service profile (with dependents)
yp service rm <id-or-name>                # Remove a service
yp service api-add <service> [options]    # Add an API to a service
yp service dep-add <service> [options]    # Add a dependency

# Systems
yp system add --name <name> [options]     # Create a system
yp system list                            # List all systems
yp system show <id-or-name>               # System details + services

# Owners
yp owner add --name <name> --type <type>  # Register an owner
yp owner list                             # List all owners
yp owner show <id-or-name>                # Owner details + what they own
```

### Dependencies

The most important question before modifying a service: *what depends on me?*

```bash
yp deps checkout-api                      # Both directions
yp deps checkout-api --direction up       # What depends on me (dependents)
yp deps checkout-api --direction down     # What I depend on (dependencies)
yp deps checkout-api --depth 3            # Limit transitive depth
yp deps --orphans                         # Find isolated services
```

```
checkout-api

  ↑ Dependents (what depends on me)
    ├── storefront-ui (Checkout REST API)
    └── mobile-app (Checkout REST API)

  ↓ Dependencies (what I depend on)
    ├── payment-processor — Sends payment requests
    │   └── stripe-webhook
    └── auth-service (OAuth tokens)
```

### Search

```bash
yp search "authentication"                # Full-text across all entities
yp search "grpc" --kind service           # Filter by entity kind
yp search --unowned                       # Services with no owner
yp search --unassigned                    # Services with no system
yp search --lifecycle deprecated          # By lifecycle stage
```

### Catalog Health

```bash
yp lint                                   # Validate catalog integrity
yp lint --json                            # Structured output for agents
```

Checks for: orphaned references, missing owners, circular dependencies, dangling deps, duplicate names, empty systems. Exit code 1 if errors found.

### Auto-Discovery

Don't add services by hand — discover them automatically.

```bash
# Scan a local directory of repos
yp discover --dir ~/Projects

# Scan a GitHub org
yp discover --github-org mycompany

# Filter by topic or language
yp discover --github-org mycompany --topic backend
yp discover --github-org mycompany --language typescript

# Preview without making changes
yp discover --dry-run
```

Discovery looks for `catalog-info.yaml` (or `.yellowpages/catalog.yaml`) in each repo. If none exists, it infers a service from the repo name and `package.json` description.

**Catalog file format:**
```yaml
apiVersion: yellowpages/v1
kind: Service
metadata:
  name: checkout-api
  description: Handles checkout flow
spec:
  system: payments
  owner: platform-team
  lifecycle: production
  apis:
    - name: Checkout REST API
      type: rest
      spec: ./openapi.yaml
  dependsOn:
    - payment-processor
    - service: auth-service
      api: OAuth
      description: Token validation
```

Running discover is **idempotent** — it matches on service name, detects what's new vs updated, and never duplicates. Changed a description? It'll show up as an update.

### Filtering

```bash
yp service list --system payments         # Services in a system
yp service list --owner platform-team     # Services by owner
yp service list --lifecycle deprecated    # By lifecycle stage
yp service list --tag backend             # By tag
```

### Global Flags

All commands support:
```bash
--json                        # Structured JSON output (for agents)
-q, --quiet                   # Suppress output, use exit codes only
```

### ID-or-Name Resolution

Every command accepts either an ID or a name. yellowpages checks for an exact ID match first, then searches by name (case-insensitive):

```bash
yp service show EvoFg8sF           # by ID
yp service show checkout-api       # by name — same result
```

---

## For Agents

**Check the catalog before you touch anything.**

### Understanding What Exists

```bash
# List all services (use --json for structured output)
yp service list --json

# Get full details on a service
yp service show checkout-api --json

# See what a team owns
yp owner show platform-team --json

# See all services in a system
yp system show payments --json
```

### Before Modifying a Service

1. **Check ownership** — who owns this? Do you have context from them?
2. **Check dependents** — what depends on this service? Will your change break something?
3. **Check lifecycle** — is this `production`? `deprecated`? `experimental`?
4. **Check APIs** — does this expose APIs others rely on?

```bash
# Full profile: owner, system, APIs, dependencies, AND dependents
yp service show checkout-api --json

# Dependency graph — what breaks if I touch this?
yp deps checkout-api --json

# Search for related services
yp search "payments" --json
```

### Registering New Services

If you create a new service, register it:

```bash
yp service add \
  --name my-new-service \
  --system payments \
  --owner platform-team \
  --lifecycle experimental \
  --description "Does the thing"
```

---

## How It Works

```
┌─────────────────────────────────────────────────────┐
│  Agent                                              │
│                                                     │
│  "I need to modify the checkout flow"               │
│  > yp service show checkout-api --json              │
│                                                     │
│  → Owner: platform-team                             │
│  → System: payments                                 │
│  → Depends on: payment-processor, auth-service      │
│  → API: Checkout REST API (rest)                    │
│  → Lifecycle: production                            │
│                                                     │
│  "OK, this is production, owned by platform,        │
│   and payment-processor depends on it.              │
│   I'll be careful."                                 │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│  .yellowpages/                                      │
│                                                     │
│  services/                                          │
│    EvoFg8sF.json    ← checkout-api                  │
│    zSLMBKV6.json    ← payment-processor             │
│    k9Xm2wP1.json    ← auth-service                  │
│  systems/                                           │
│    8RW4htFP.json    ← payments                      │
│  owners/                                            │
│    3GJ00QQO.json    ← platform-team                 │
│  config.json                                        │
│                                                     │
│  Plain JSON. Committed to git. Diffable.            │
│  Your PR review IS your catalog review.             │
└─────────────────────────────────────────────────────┘
```

**Design principles:**
- **Git-native**: Everything is JSON files in `.yellowpages/`, committed to your repo. `git log .yellowpages/` is your audit trail.
- **Agent-first**: `--json` on every command. Structured output agents can parse without regex.
- **Zero infrastructure**: No database, no server, no Docker. Just files in a directory.
- **ID-or-name**: Every command accepts either. No looking up IDs before you can do anything.

---

## Why Not Backstage?

[Backstage](https://backstage.io) is great. It's also a React app, a PostgreSQL database, a Node.js backend, a Docker deployment, and a full-time platform engineer to keep it running. It was designed for humans with browsers.

yellowpages was designed for agents with terminals.

| | Backstage | yellowpages |
|---|---|---|
| **Primary user** | Humans (browser UI) | AI agents (CLI + JSON) |
| **Infrastructure** | PostgreSQL, Node.js, Docker, Kubernetes | None. JSON files in a directory. |
| **Setup time** | Hours to days | `npm install -g yellowpages-cli && yp init` |
| **Data storage** | Database | Git. Your PR review is your catalog review. |
| **Team size** | 50+ engineers with a platform team | 1-50 engineers, no dedicated platform team |
| **Plugin ecosystem** | 100+ plugins | Focused scope. Not trying to be a platform. |

**If your org already runs Backstage**, yellowpages isn't a replacement. It's a CLI that could read from Backstage's API — giving your agents a way to query the catalog without a browser.

**If your org doesn't run Backstage**, yellowpages gives you 80% of the catalog value with 0% of the infrastructure overhead. Your agent can understand what exists, who owns it, and what depends on what — which is the part that actually matters when it's about to modify your code.

---

## Multi-Repo Setup

In an org with many repos, the recommended pattern:

```
org-catalog/              ← central catalog repo
  .yellowpages/
    services/
    systems/
    owners/

checkout-api/             ← service repo (owns its own metadata)
  catalog-info.yaml

payment-processor/        ← service repo
  catalog-info.yaml
```

1. **Each service repo** has a `catalog-info.yaml` — the team that owns the service owns its metadata
2. **One central catalog repo** has `.yellowpages/` — populated by `yp discover --github-org`
3. **Agents in any repo** set `YELLOWPAGES_CATALOG` to point at the central catalog (coming in v0.3)

```bash
# In the catalog repo, on a schedule:
yp discover --github-org mycompany

# In any service repo, the agent queries the central catalog:
export YELLOWPAGES_CATALOG=~/Projects/org-catalog/.yellowpages
yp deps checkout-api --json
```

For single-repo setups or small teams, just put `.yellowpages/` in your main repo. No ceremony needed.

---

## Data Model

### Service
The main entity. A deployable unit of software.

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Service name |
| `description` | string | What it does |
| `system` | ref | System it belongs to |
| `owner` | ref | Team or person who owns it |
| `lifecycle` | enum | `experimental` · `production` · `deprecated` · `decommissioned` |
| `repo` | string | Repository URL |
| `tags` | string[] | Freeform tags |
| `apis` | Api[] | APIs this service exposes |
| `dependsOn` | Dependency[] | Services this depends on |

### System
A group of related services (e.g., "payments", "identity").

### Owner
A team or person who owns services and systems.

### API
An interface a service exposes: `rest`, `grpc`, `graphql`, `event`, or `other`.

### Dependency
A link from one service to another, optionally specifying which API is consumed.

---

## Roadmap

### v0.2 — Trustworthy Catalog ✅
- [x] `yp lint` — validate catalog integrity (orphaned refs, missing owners, circular deps)
- [x] `yp search` — unified text search across all entities (MiniSearch, auto-reindexing)
- [x] `yp discover` — auto-populate from GitHub org or local repos (catalog files + inference)
- [x] `yp deps` — full dependency graph, both directions (up/down, transitive, orphans)
- [x] Relation stitching — bidirectional relations computed at query time

### v0.3 — Agent Context
- [ ] Multi-repo support — `YELLOWPAGES_CATALOG` env var for central catalog repo pattern
- [ ] `yp score` — health scorecards per service (agents see trust level before modifying)
- [ ] `yp sync` — continuous discovery via cron/9to5
- [ ] API spec rendering — parse and display OpenAPI/gRPC/GraphQL specs inline

---

## Development

```bash
# Install dependencies
npm install

# Run locally
npm run dev -- --help

# Build for npm
npm run build

# Build native binary
bun run build:bun

# Run tests
bun test

# Format & lint
bun run check
```

---

## License

MIT

---

<p align="center">
  <b>yellowpages</b> — <i>look it up before you break it</i>
</p>
