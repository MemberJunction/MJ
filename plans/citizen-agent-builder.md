# Plan: Citizen Agent Builder Program

**Branch:** `feat/citizen-agent-builder`
**Status:** Implemented — ready for review and merge
**Author:** Claude (with Amith)
**Last updated:** 2026-09-19

---

## 1. Goals & Non-Goals

### 1.1 Goals

1. **A non-technical business user can build a working MJ agent** using a local coding agent, without installing a development environment, learning git, or understanding migrations.
2. **Everything they build is portable by construction.** The artifact is MJ agent metadata — JSON + `.md` in a git repo — which is already the source of truth for every agent MJ ships. There is no "convert my prototype" step.
3. **Promotion is submission, not rewrite.** A finished personal agent is a folder of metadata that can be reviewed and pushed to a production instance.
4. **The local environment resembles the organization's real system**, not a generic MJ install — so what the builder makes has somewhere to land.
5. **The guardrails live where the work happens.** Authoring rules, tier boundaries, and the security checklist are loaded by the *coding agent* via `CLAUDE.md` and skills, not by the human via a document they must remember to read.

### 1.2 Non-Goals

- **Not** a visual/low-code agent builder UI. The coding agent is the authoring interface.
- **Not** a local MJ development environment. No SQL Server install, no monorepo checkout, no Node toolchain beyond a container runtime.
- **Not** a replacement for human review before anything reaches a production instance.
- **Not** a change to how MJ agents or Runtime actions work. Every mechanism used here already exists and is exercised by MJ's own agents.

### 1.3 Success Criteria

- A business user with a container runtime and a coding agent gets to a running local instance with no human help. Environment build is a one-time, unattended cost — it is allowed to take as long as it takes.
- Once the instance is up, the authoring loop (describe → push → run → read the result → iterate) is **minutes, not hours**.
- The agent they produce is a bundle a reviewer can read in one sitting and install elsewhere unchanged.
- An organization can stand up its own flavour of the lab by publishing two Open Apps and changing one URL.
- Zero participants need a platform engineer to fix their environment during an onboarding session.

---

## 2. Current State Assessment

### 2.1 What already exists (verified in this repo)

| Asset | Location | State |
|---|---|---|
| Agent metadata format | `metadata/agents/*.json` | **Solid.** 20+ shipped agents, portable by `@lookup:` reference |
| Prompt metadata + templates | `metadata/prompts/*.json`, `prompts/templates/**/*.md` | **Solid.** `TemplateText: "@file:..."` splits prose from config |
| `mj sync push` | `packages/MetadataSync` | **Solid.** Connects directly to SQL Server (`lib/provider-utils.ts`) |
| **Runtime actions** | `packages/Actions/RuntimeHost/`, `packages/Actions/Base/RuntimeAction*` | **Solid.** Sandboxed JS actions with a permission schema and a bridge |
| **ActionSmith / Codesmith** | `metadata/prompts/templates/agents/{actionsmith,codesmith}.template.md` | **Solid.** Meta-agents that author, test and persist Runtime actions |
| `Create` / `Test Runtime Action` | `metadata/actions/.create-runtime-action.json` | **Solid.** Persist + test seam, with human approval |
| Open App dependency resolution | `packages/OpenApp/Engine/src/dependency/` | **Solid.** Leaf-first topological sort, cycle detection, already-installed handling — all unit-tested |
| Published API image | `docker/MJAPI/Dockerfile` | **Solid.** Ships `@memberjunction/cli` globally (line 74); entrypoint runs `mj migrate` + `mj codegen` on boot |
| Full-stack compose (source-built) | `docker/regression/docker-compose.test.yml` | **Works.** sqlserver → db-setup → mjapi → mjexplorer |
| Full-stack compose (published images) | `docker/regression/docker-compose.bacpac-standalone.yml` | **Designed, blocked.** See §2.2 |
| Metadata → migration capture | `packages/MetadataSync/src/lib/sql-logger.ts` | **Solid.** `sqlLogging.formatAsMigration` emits a push's SQL as a migration — how MJ ships its own metadata (§4.3) |

### 2.2 The one infrastructure blocker

`docker/regression/docker-compose.bacpac-standalone.yml` already describes a full MJ stack from published images with no monorepo. Its own header states the blocker:

> **PREREQUISITE:** `memberjunction/explorer` is not published yet (a separate workstream — runtime-configurable Explorer image).

`memberjunction/api` **is** published. **The environment is gated on exactly one already-scoped piece of work: a published, runtime-configurable Explorer image.** Everything else here can proceed in parallel.

### 2.3 Constraints

- The target user will not install Node, will not run package managers, and will not use git directly. Their coding agent does all three.
- Any error surfaced to them must be actionable by their coding agent, or the program fails at that step.
- Tier 2 (§5) means a citizen builder can cause **arbitrary sandboxed JavaScript to run server-side**. The local environment must therefore be genuinely isolated — no production credentials, no network path to production. This is a design requirement, not a caution.

---

## 3. Architecture

Three artifacts, each independently useful.

### 3.1 The base environment — built declaratively, never restored from a snapshot

The local instance is built the same way any MJ instance is built:

```
clean empty database
   → mj migrate                    # MJ core
   → mj app install <org-sample-data-app>
        └─ topological, leaf-first dependency install pulls
           the org's entities/code app, and everything beneath it
```

**No database backups or bacpacs.** A binary snapshot is opaque, un-diffable, frozen at build time, per-organization, and a hosting problem. The install chain is declarative, composable, current, and already implemented — `packages/OpenApp/Engine/src/dependency/` does leaf-first topological resolution with cycle detection, and it is unit-tested.

It also scales without central coordination: an organization publishes its apps, and the citizen builder's command is one URL.

**The CLI runs inside the container.** The published API image already installs `@memberjunction/cli` globally, so this needs no new image work. The user's metadata folder is bind-mounted and their coding agent invokes:

```bash
docker compose exec api mj sync push --dir /work/metadata
```

A locally-installed CLI would drift from the containerized instance, and version skew is undiagnosable for this audience. Pinning them to one image makes that failure structurally impossible, and drops the user's local prerequisite to **a container runtime alone**.

### 3.2 The organization's two Open Apps

This is what makes the local environment resemble the real system instead of a generic MJ install. An organization publishes two apps, both typically from private repositories:

| App | Carries | Depends on |
|---|---|---|
| **`<org>-platform`** | Their entities, metadata, configuration, packages, code | Whatever Open Apps they build on |
| **`<org>-sampledata`** | Loom-generated synthetic records shaped like their production data | `<org>-platform` |

The citizen builder runs a single command against the sample-data app; the dependency graph assembles everything beneath it. Onboarding a new organization is publishing two repos and changing one URL in the template.

Two properties worth naming:

- **The builder is isolated but not generic.** They work against their organization's real entity names and shapes, with synthetic records. Promotion becomes a re-point at a different database rather than a rewrite.
- **The sample data is synthetic by construction.** Nobody prototypes against customer records, and the data-governance question answers itself before anyone asks it.

### 3.3 The template repo — `mj-agent-starter`

Copied ("Use this template") to create each person's private repo:

```
CLAUDE.md                  # authoring rules, tier boundaries, security checklist
CAPABILITIES.md            # catalog of existing Actions, agents and sub-agents
README.md                  # the only human-facing page, ~1 screen
docker-compose.yml         # the base env from §3.1
.env.example               # points at the org's sample-data app
metadata/
  agents/.mj-sync.json     # pre-configured, never edited by the user
  prompts/.mj-sync.json
  prompts/templates/       # .md prompt bodies
  agents/.hello-agent.json # one worked starter agent
.claude/skills/
  new-agent/               # guided authoring: intent → metadata
  test-agent/              # push → run → read the run log → iterate
  submit-agent/            # package + open the PR
```

**`CAPABILITIES.md` is load-bearing.** Without a catalog of what exists, a coding agent will invent, because inventing is what it does. With one, it composes existing Actions and sub-agents first — which is what keeps most work inside Tier 1. It should list sub-agents as prominently as Actions; composing `Codesmith` or a research agent as a sub-agent is a Tier 1 move that solves problems a builder would otherwise reach for code to solve.

**The starter agent is not decoration.** It gives a five-minute proof the loop works — push, run, see output — *before* the user invests in an idea of their own. The most common failure for this audience is not knowing whether the problem is their idea or their setup.

---

## 4. Sample data as an Open App

### 4.1 The pattern

Loom generates a causally-consistent synthetic dataset shaped like the organization's real data. That dataset ships as an Open App so it installs through the same dependency-resolved path as everything else.

### 4.2 More Cheese as the public reference

The `more-cheese` repo is the worked example of this pattern and the default for anyone without their own apps yet. It declares dependencies on nine Open Apps — common, orders, accounting, committees, forms, tasks, issues, secure-messaging, sonar — and carries a Loom-generated association dataset: people, organizations, orders, payments, GL accounts, committee meetings with motions and votes, events, certifications, forms, tasks, issues, secure threads.

It serves three purposes: a working reference for organizations building their own pair, a default environment for evaluation and training, and a shared vocabulary for examples in documentation.

### 4.3 How the data actually ships — the release-time metadata migration

`mj app install` applies migrations and nothing else, so sample data has to arrive as SQL. It does, through the same release step MJ uses to ship its own metadata.

When an app is published, the build engineer runs `mj sync push` for that app's metadata against a database at the **last-published state**, and captures the emitted SQL as the next `V<ts>__v<x.y.x>_Metadata_Sync.sql` migration. Because push is differential — it emits statements only for records that differ from what the database already holds — the captured SQL is precisely the delta since the previous published migration set. Successive releases therefore produce successive, append-only metadata migrations rather than one ever-growing seed.

The capture is implemented in `packages/MetadataSync/src/lib/sql-logger.ts`: `sqlLogging: { enabled, outputDirectory, formatAsMigration }` records every statement a push executes and can format the result as a migration.

Two properties this gives the program:

- **`generated/` is the editable dev-time source of truth; the migration is the shipping artifact.** An organization's data authors iterate on Loom output in their repo and never hand-write SQL. The migration is generated, not maintained.
- **It scales to any volume.** The delta between releases is the size of what changed, not the size of the dataset. A large first release is a large first migration and a normal one thereafter.

**Consequence for this plan: nothing new is required here.** An organization publishing a sample-data Open App follows the ordinary MJ release process. The reason `more-cheese/migrations/` currently holds only its schema baseline is that it has not yet published its dataset through that step — not that the step is missing.

## 5. Tiers — the boundary is code

The user never self-assesses. These live in `CLAUDE.md` as rules the coding agent applies, surfacing only as a sentence when a boundary is crossed.

| Tier | Boundary | What the builder may do |
|---|---|---|
| **1** | **No code** | Everything metadata can express: agents, prompts, agent types, steps and flows, action bindings, **sub-agent composition**, payload shaping, validation. Deliberately powerful — do whatever, as long as it is declarative. |
| **2** | **Code** | Author **Runtime actions** — sandboxed JavaScript, permission-scoped, persisted as metadata. |
| **3** | **New data entities** | Schema changes. Migrations, CodeGen, packages. Platform team. |

### 5.1 Tier 1 should be as powerful as possible

Most of what a business user wants is reachable without code, and the template should push hard in that direction. Sub-agent composition is the lever: delegating to `Codesmith` for a calculation, or to a research agent for a lookup, solves in Tier 1 what a builder would otherwise write code for. `CAPABILITIES.md` is what makes that visible.

### 5.2 Tier 2 already exists — this is documentation, not construction

MJ already ships the entire Runtime action pipeline:

- **ActionSmith** is a meta-agent that turns a human-language description of a missing capability into a persisted, approved, permission-scoped JavaScript action. It orchestrates; it delegates code generation to **Codesmith**, which writes and iterates JS in a sandbox.
- **`Test Runtime Action`** validates against ActionSmith-owned test cases before anything is persisted.
- **`Create Runtime Action`** persists the record.
- The permission object (`allowedEntities`, `allowedActions`, `allowedAgents`, `allowAnyEntity`) bounds what the code may touch.
- **A human approval step gates it.** ActionSmith's default posture is `allowAnyEntity: true` during iteration, and the approval UI *flags wildcard grants prominently so a human reviewer can narrow them to an explicit list before approving*.

That approval step **is the promotion vetting seam**, already built. At promotion a reviewer has exactly two options, both supported today:

1. **Keep the Runtime action.** Review the JS, narrow its permissions from the wildcard to an explicit entity list, approve. The action ships as metadata alongside the agent.
2. **Promote it to a typed package.** Reimplement as a strongly-typed TypeScript Action in a package, and re-point the agent's action binding. Same agent metadata, different implementation behind it.

Option 1 is the default and should be. Option 2 is for actions that prove load-bearing, hot, or complex enough to deserve compile-time types and a test suite — a deliberate graduation, not a tax on every submission.

So the plan's Tier 2 work is not building a mechanism. It is: documenting the ActionSmith path in `CLAUDE.md`, making the review checklist match what the approval UI already asks, and deciding who approves.

### 5.3 Security checklist (published up front, not at the gate)

Loaded into `CLAUDE.md` so agents are built against it rather than reviewed against it later:

- No credentials, tokens, or keys in prompt templates or action parameters.
- Runtime actions ship with an explicit `allowedEntities` list, not a wildcard, at submission time.
- Data access through MJ entity permissions — never raw SQL in a prompt.
- `ExposeAsAction: false` unless justified (§6.2).
- No agent writes to production records without a human confirmation step in v1.
- No PII in prompt templates, including examples.
- `IsRestricted: true` for anything touching system or admin entities.

---

## 6. Authoring defaults the template enforces

Each prevents a failure that only surfaces at promotion.

### 6.1 Never let the user choose models

`metadata/prompts/.codesmith-prompt.json` pins six models across six vendors with explicit priorities. A business user who hand-picks a model the destination instance has not configured has built something that fails on promotion for a reason they will never guess. **Default `ModelSelectionMode: "Agent Type"`**; the `new-agent` skill never emits an `MJ: AI Prompt Models` block.

### 6.2 `ExposeAsAction: false` by default

Both `Betty` and `Codesmith` set it `true`, which makes them callable as Actions by other agents. For a personal agent that is a quiet privilege escalation. Turning it on becomes a deliberate act requiring justification in the submission.

### 6.3 Never hardcode a record name

Entity *shape* is portable across instances; entity *instances* are not. A prompt saying "notify the Standards Committee chair" works against sample data and breaks everywhere else. **Agents take their subjects as inputs or discover them by query.** Grep-checkable at review against known sample-data record names.

### 6.4 Prefer `Flow` for deterministic work

`.betty-agent.json` is the cleanest teaching example in the repo — a `Flow` agent, one action binding, one step with `ActionInputMapping`/`ActionOutputMapping`, ~60 lines. Where the request is "take this, do that, return the other," a Flow agent is cheaper, faster, and far easier to review than a Loop.

### 6.5 Never hand-edit `primaryKey` or `sync`

`mj sync push` maintains the `ID`, `lastModified` and `checksum` blocks. Stated explicitly so the coding agent does not "helpfully" tidy them.

---

## 7. Submission and promotion

The user's coding agent opens a PR from their private repo into a catalog repo. The human never touches git. The PR body is generated from the bundle: what the agent does, which Actions and sub-agents it binds, which entities it reads, whether it writes, and — for Tier 2 — the Runtime action source with its requested permission scope.

Review is a **checklist against rules already in `CLAUDE.md`** (§5.3), so most submissions pass first time. The review verifies rules the author was building against rather than discovering them.

---

## 8. Phasing

| Phase | Work | Depends on |
|---|---|---|
| **P0** | Publish runtime-configurable `memberjunction/explorer` image | — (existing workstream; **critical path**) |
| **P1** | Publish the reference sample-data app, capturing its `Metadata_Sync` migration via the normal release step (§4.3) | — |
| **P2** | `mj-agent-starter`: `CLAUDE.md`, `CAPABILITIES.md`, three skills, starter agent, sync configs | — |
| **P3** | Reference `<org>` app pair, using `more-cheese` as the worked example | P1 |
| **P4** | `docker-compose.yml` wired to the §3.1 install chain against published images | P0, P3 |
| **P5** | Catalog repo, review checklist, PR template; Tier 2 approval ownership | P2 |
| **P6** | Dry run with 3 volunteers; fix what breaks | P4, P5 |

P1, P2 and P5 are independent of the Explorer blocker and can start now. P2 can be validated today against `docker/regression/docker-compose.test.yml` while P0 lands.

---

## 9. Relationship to `plans/claude-install-pack.md`

That plan proposes shipping a curated `CLAUDE.md` + `.claude/` pack with every MJ install via `mj install:claude`; `.github/workflows/claude-pack.yml` suggests part of it exists. Same machinery, different audience — that pack targets developers building MJ *applications*, this targets business users building *agents*.

**Recommendation:** if the install-pack's compilation mechanism lands, `mj-agent-starter` consumes it as a profile (e.g. `--profile=agent-author`) rather than maintaining a parallel copy. Until then, ship the template standalone. **Owner decision needed so it is not built twice.**

---

## 10. Open questions

1. **Private repo authentication from the container.** `mj app install <private repo URL>` needs credentials a business user does not have and should not be handed. Options: a fine-grained read-only token provisioned by IT into the image or `.env`; mirroring app packages to a registry the container can reach; or a credential helper in the CLI. Unresolved, and it blocks the very first command the user runs.
2. **Who approves Tier 2 Runtime actions, and what is the turnaround?** The approval mechanism exists; the ownership and SLA do not. A review queue with no SLA converts enthusiasm into abandonment.
3. **Where does `mj-agent-starter` live** — alongside MJ as part of the platform story, or in the adopting organization's own space? Probably both: a public reference template, forked per organization.
4. **Tooling:** the guide should name one coding agent at step one. Divergence in the first instruction costs more than the tool difference is worth; the rest is tool-agnostic.

---

## 11. What this plan is really asserting

MJ already has every mechanism this needs. Agents are declarative metadata in git, referenced by name, pushed to a database only for testing. Runtime actions give non-developers real capability behind a sandbox, a permission scope, and a human approval gate. Open App dependency resolution assembles an environment from published apps, leaf-first.

What is missing is **packaging**: a container that needs no development environment, a repo that teaches the coding agent rather than the human, an organization-shaped environment assembled from two published Open Apps, and a submission path that does not require the author to know git.

The one thing genuinely not yet built is a published, runtime-configurable Explorer image — an existing workstream. Everything else is assembly, documentation, and an organization running the release process it already runs.
