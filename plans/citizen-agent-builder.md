# Plan: Citizen Agent Builder Program

**Branch:** `claude/mj-agent-building-guide-ro98ux`
**Status:** Proposal — not yet implemented
**Author:** Claude (with Amith)
**Last updated:** 2026-09-18

---

## 1. Goals & Non-Goals

### 1.1 Goals

1. **A non-technical business user can build a working MJ agent** using a local coding agent (Claude Code / Antigravity), without installing a development environment, learning git, or understanding migrations.
2. **Everything they build is portable by construction.** The artifact is MJ agent metadata — JSON + `.md` in a git repo — which is already the source of truth for every agent MJ ships. There is no "convert my prototype" step.
3. **Promotion is submission, not rewrite.** A finished personal agent is a folder of metadata that can be reviewed and pushed into AIDP or a client instance.
4. **The guardrails live where the work happens.** Authoring rules, tier escalation, and the security checklist are loaded by the *coding agent* via `CLAUDE.md` and skills — not by the human via a document they must remember to read.
5. **One shared base environment** so exercises are concrete, everyone hits the same data, and nobody prototypes against client records.

### 1.2 Non-Goals

- **Not** a visual/low-code agent builder UI. The coding agent is the authoring interface.
- **Not** a local MJ development environment. No SQL Server install, no monorepo checkout, no Node toolchain beyond a container runtime.
- **Not** a path for agents that need new Actions, entities, or schema. Those escalate to the platform team (§6.1).
- **Not** a replacement for security review before anything reaches a production instance.
- **Not** a change to how MJ agents work. Every mechanism used here already exists and is exercised by MJ's own agents.

### 1.3 Success Criteria

- A business user with Docker Desktop and a coding agent goes from empty folder to an agent running against a seeded MJ instance in **under 30 minutes**, with no human help.
- The agent they produce is a metadata bundle that a reviewer can read in one sitting and push to another database unchanged.
- At the Leadership Summit, ≥ 80% of lab participants get a working agent inside a 40-minute hands-on block.
- Zero participants need a platform engineer to fix their environment during the lab.

---

## 2. Current State Assessment

### 2.1 What already exists (verified in this repo)

| Asset | Location | State |
|---|---|---|
| Agent metadata format | `metadata/agents/*.json` | **Solid.** 20+ shipped agents; portable by `@lookup:` reference |
| Prompt metadata + templates | `metadata/prompts/*.json`, `prompts/templates/**/*.md` | **Solid.** `TemplateText: "@file:..."` splits prose from config |
| Sync config for agents | `metadata/agents/.mj-sync.json` | **Solid.** Declares `MJ: AI Agent Prompts` + `MJ: AI Agent Skills` as related entities |
| `mj sync push` | `packages/MetadataSync` | **Solid.** Connects directly to SQL Server (`lib/provider-utils.ts`) |
| Published API image | `docker/MJAPI/Dockerfile` | **Solid.** Ships `@memberjunction/cli` globally (line 74); entrypoint runs `mj migrate` + `mj codegen` on boot |
| Full-stack compose (in-repo) | `docker/regression/docker-compose.test.yml` | **Works.** sqlserver → db-setup → mjapi → mjexplorer, built from source |
| Full-stack compose (published images) | `docker/regression/docker-compose.bacpac-standalone.yml` | **Designed, blocked.** See §2.2 |
| More Cheese dataset | `more-cheese` repo, `generated/` | **Solid.** 89 MB across 121 JSON files, schema `morecheese_members` |
| Claude pack machinery | `plans/claude-install-pack.md`, `.github/workflows/claude-pack.yml` | **Adjacent.** See §9 |

### 2.2 The one real blocker

`docker/regression/docker-compose.bacpac-standalone.yml` already describes exactly the topology this program needs, from published images with no monorepo:

```
sqlserver → bacpac-import (SqlPackage) → api (memberjunction/api) → explorer (memberjunction/explorer)
```

Its own header states the blocker:

> **PREREQUISITE:** `memberjunction/explorer` is not published yet (a separate workstream — runtime-configurable Explorer image). Until it exists, the `explorer` service can't pull and external bacpac stays dormant.

`memberjunction/api` **is** published. SQL Server and bacpac import are solved. **The citizen-builder environment is gated on exactly one already-scoped piece of work: a published, runtime-configurable Explorer image.** Everything else in this plan can proceed in parallel and land behind it.

### 2.3 Constraints

- The target user will not install Node, will not run `npm`, and will not use git directly. Their coding agent does all three.
- Any error surfaced to them must be actionable by their coding agent, or the program fails at that step.
- `more-cheese/generated/` is 89 MB of JSON; a `mj sync push` of it is a long, memory-hungry operation (its own `CLAUDE.md` calls for a 16 GB heap). It must **not** run on the user's first boot.
- Agents authored against a demo dataset can silently hardcode demo records. Portability of *shape* does not imply portability of *instances* (§6.3).

---

## 3. Architecture

Three artifacts, each independently useful:

### 3.1 The base environment — `mj-agent-lab` container stack

A `docker-compose.yml` that brings up SQL Server, restores a pre-built More Cheese bacpac, and boots the API and Explorer from published images. The user runs one command.

**The CLI runs inside the container, not on the user's machine.** This is already possible with no new work — the API image installs `@memberjunction/cli` globally. The user's metadata folder is bind-mounted, and their coding agent invokes:

```bash
docker compose exec api mj sync push --dir /work/metadata
```

Rationale: a locally-installed CLI would drift from the containerized instance, and a version-skew error is undiagnosable for this audience. Pinning them to the same image makes the failure structurally impossible. Local prerequisite drops to **Docker Desktop alone**.

**The dataset ships as a pre-built bacpac, not as a sync-on-boot.** CI builds the bacpac once from `more-cheese/generated/` and publishes it; containers restore it in a couple of minutes. A first-boot `mj sync push` of 89 MB would be a 30-minute wait with a plausible OOM — unacceptable as step one for this audience.

### 3.2 The template repo — `mj-agent-starter`

Copied ("Use this template") to create each person's private repo. Contents:

```
CLAUDE.md                  # authoring rules, tier escalation, security checklist
ACTIONS.md                 # catalog of Actions that already exist
README.md                  # the only human-facing page, ~1 screen
docker-compose.yml         # the base env from §3.1
metadata/
  agents/.mj-sync.json     # pre-configured, never edited by the user
  prompts/.mj-sync.json
  prompts/templates/       # .md prompt bodies live here
  agents/.hello-agent.json # one worked starter agent
.claude/skills/
  new-agent/               # guided authoring: intent → metadata
  test-agent/              # push → run → read the run log → iterate
  submit-agent/            # package + open the PR
```

**`ACTIONS.md` is load-bearing and easy to overlook.** Without a catalog of what exists, a coding agent will invent new Actions, because inventing is what it does. With it, the agent reaches for `Betty` or `Execute Code` first and only proposes a new Action when nothing fits — which is how the tier system gets enforced without the user ever learning it exists.

**The starter agent is not decoration.** It gives the user a five-minute proof that the whole loop works — push, run, see output — *before* they invest in an idea of their own. The most common failure mode for this audience is not knowing whether the problem is their idea or their setup.

### 3.3 The submission path

The user's coding agent opens a PR from their private repo into a central catalog repo. The human never touches git. The PR body is generated from the agent metadata: what it does, which Actions it binds, which data it reads, whether it writes.

Review is a **checklist against the rules already in `CLAUDE.md`** (§6), so most submissions pass first time — the review is verifying rules the author was building against, not discovering them.

---

## 4. More Cheese as the base environment

**Recommendation: adopt it.** The argument is stronger than "we have a demo dataset."

More Cheese declares dependencies on nine BizApps:

```
common · orders · accounting · committees · forms · tasks · issues · secure-messaging · sonar
```

Blue Cypress runs its own operations on the same suite. So an agent authored against More Cheese binds to **the same entity names and the same shapes** a BC user's real instance exposes. Promotion becomes a re-point at a different database, not a rewrite. That is a materially stronger claim than any generic sample dataset can make, and it is the reason to prefer More Cheese over a purpose-built training fixture.

Secondary benefits:

- **Rich enough for real exercises.** People, organizations, orders, payments, GL accounts, committee meetings with motions and votes, events, certifications, forms, tasks, issues, secure threads. Nearly any "help me with X" a BC user imagines has a plausible analogue.
- **Causally consistent.** Orders have journal entries; committees have terms and attendance. Agents that reason across entities get sensible answers rather than noise.
- **Safe by construction.** Nobody prototypes against client data, and the data policy question answers itself before anyone asks it.
- **A shared vocabulary.** "Build me the lapsed-member outreach agent" means the same thing to everyone in the room.

### 4.1 The caveat this choice creates

Entity *shape* is portable; entity *instances* are not. An agent whose prompt says "look up the Artisan Cheddar product" or "notify the Standards Committee chair" works beautifully in More Cheese and breaks on promotion.

This becomes a hard rule in `CLAUDE.md` (§6.3): **agents take their subjects as inputs or discover them by query — they never hardcode the name of a record.** It is checkable at review by grepping the prompt templates against known More Cheese record names.

---

## 5. Authoring defaults the template enforces

These fall out of reading the shipped agents, and each one prevents a failure that only surfaces at promotion time.

### 5.1 Never let the user choose models

`metadata/prompts/.codesmith-prompt.json` pins six models across six vendors with explicit priorities. A business user who hand-picks a model AIDP has not configured has built something that fails on promotion for a reason they will never guess.

**Default `ModelSelectionMode: "Agent Type"`** (as `Betty` does) and let the platform resolve it. The template's `new-agent` skill never emits an `MJ: AI Prompt Models` block.

### 5.2 `ExposeAsAction: false` by default

Both `Betty` and `Codesmith` set it `true`, which makes them callable as Actions by other agents. For a personal agent that is a quiet privilege escalation. Turning it on becomes a deliberate act requiring a justification in the submission PR.

### 5.3 Prefer `Flow` for deterministic work

`.betty-agent.json` is the cleanest teaching example in the repo — a `Flow` agent, one action binding, one step with `ActionInputMapping` / `ActionOutputMapping`, about 60 lines total. Where a user's request is "take this, do that, give me back the other," a Flow agent is cheaper, faster, and far easier to review than a Loop.

### 5.4 Never hand-edit `primaryKey` or `sync`

`mj sync push` maintains the `ID`, `lastModified`, and `checksum` blocks. The template's `CLAUDE.md` states this explicitly so the coding agent does not "helpfully" tidy them.

---

## 6. Tiers, enforced as escalation rules

The tier model is real, but the **user never sees a chart**. It lives in `CLAUDE.md` as rules the coding agent applies, surfacing only as a sentence like *"what you're describing needs a new Action — here's the draft request."*

| Tier | Shape | Agent behaviour |
|---|---|---|
| **1** | Agent + prompts, existing Actions and entities | Build it. No escalation. |
| **2** | Needs one or two new Actions | Stop. Draft an Action request; user submits it; continue when it lands. |
| **3** | Needs new entities / schema / migrations | Stop. This is a product request, not an agent. Route to the platform team. |

Target: Tier 1 covers ~80% of what citizen builders want. `ACTIONS.md` is the mechanism that keeps that ratio high.

### 6.1 Security checklist (published up front, not at the gate)

Loaded into `CLAUDE.md` so agents are built against it rather than reviewed against it later:

- No credentials, tokens, or keys in prompt templates or action parameters.
- Data access through MJ entity permissions — never raw SQL in a prompt.
- `ExposeAsAction: false` unless justified.
- No agent writes to production records without a human confirmation step in v1.
- No PII in prompt templates, including examples.
- `IsRestricted: true` for anything touching system or admin entities (as `.memory-cleanup-agent.json` does).

---

## 7. Leadership Summit lab

The forcing function. Structure, built on the observation that the highest-value session of the last offsite was a colleague showing real work:

| Block | Minutes | Content |
|---|---|---|
| Showcase | 15 | 3 × 5 min, real client projects, real screens |
| Live build | 20 | One agent end-to-end **including submission** — the promote step is not optional, it is the whole thesis |
| Hands-on | 40 | Pre-provisioned environments, Tier 1 only, menu of 5 starter ideas |
| Close | 10 | Template repo, where to post what you built, review date |

**Preparation that determines whether this works:**

- Every environment pre-built and verified on Mac *and* Windows before the room opens. Forty people with forty install errors is the failure mode.
- A recorded fallback for the live build, with checkpoints to jump to.
- Deliberately show one failure and the recovery. Participants who watch a flawless demo and then hit their first error conclude they are doing it wrong.
- A menu of starter ideas so nobody spends ten of their forty minutes choosing.

---

## 8. Phasing

| Phase | Work | Depends on |
|---|---|---|
| **P0** | Publish runtime-configurable `memberjunction/explorer` image | — (existing workstream; **critical path**) |
| **P1** | Build + publish the More Cheese bacpac in CI | — |
| **P2** | `mj-agent-starter` template repo: `CLAUDE.md`, `ACTIONS.md`, three skills, starter agent, sync configs | — |
| **P3** | Wire `docker-compose.yml` into the template against published images | P0, P1 |
| **P4** | Submission repo + review checklist + PR template | P2 |
| **P5** | Dry run with 3 volunteers; fix what breaks | P3, P4 |
| **P6** | Summit lab | P5 |

P1, P2 and P4 are independent of the blocker and can start immediately. P2 can be validated today against `docker/regression/docker-compose.test.yml` (source-built) while waiting on P0.

---

## 9. Relationship to `plans/claude-install-pack.md`

That plan proposes shipping a curated `CLAUDE.md` + `.claude/` pack with every MJ install via `mj install:claude`, and `.github/workflows/claude-pack.yml` suggests part of it exists. The overlap is real and should be resolved deliberately rather than discovered later:

- **Same machinery, different audience.** The install pack targets developers building MJ *applications*. This targets business users building *agents* — a narrower, simpler pack.
- **Recommendation:** if the install-pack's compilation mechanism lands, `mj-agent-starter` consumes it as a profile (e.g. `mj install:claude --profile=agent-author`) rather than maintaining a parallel copy. Until then, ship the template repo standalone with its own `CLAUDE.md`.
- **Owner decision needed** so nobody builds the same pack twice.

---

## 10. Open questions

1. **Where does `mj-agent-starter` live** — MemberJunction org (public, part of the platform story) or Blue Cypress org (internal first)? This plan assumes BC-internal to start, public once proven.
2. **What is the actual AIDP promotion mechanism** — a `mj sync push` against AIDP's database, or a bundled app install? Nobody has walked one agent end-to-end yet. **This should be done once, by hand, before P4** — whatever it produces *is* the submission spec.
3. **Who owns security review, and what is the turnaround SLA?** A review queue with no SLA converts enthusiasm into abandonment.
4. **Tooling:** the guide should name one coding agent for step one. Divergence in the first instruction costs more than the tool difference is worth; the middle of the guide is tool-agnostic regardless.
5. **Does the More Cheese bacpac carry `config/` as well as `generated/`?** The `config/` tree (AI models, vendors, dashboards, queries, conversations) is what makes the instance feel alive on first boot.

---

## 11. What this plan is really asserting

MJ agents are already authored the way this program needs: declarative metadata, in git, referenced by name, pushed to a database only for testing. Nothing about the authoring model has to change.

What is missing is **packaging** — a container that needs no development environment, a repo that teaches the coding agent instead of the human, a dataset that is structurally identical to production, and a submission path that does not require the author to know git.

All four are small. One of them is blocked on an image that is already on someone's roadmap.
