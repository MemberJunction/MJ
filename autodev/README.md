# autodev — autonomous development engine (standalone)

A continuous, autonomous software-engineering engine that runs **Claude Code as both the harness and the orchestrator**. A **cron trigger fires a fresh Claude Code session** on an interval; that session runs **one bounded unit of work** (`/autodev-tick`) and exits. Durability comes from the cron + this on-disk state — not from keeping a session alive.

**No MemberJunction required.** Everything here is plain Claude Code + `git` + `gh` + Node 18. The state store is a thin file-based layer that a future `MJStateStore` can replace 1:1.

> Full design + roadmap: [`../plans/autodev/PLAN.md`](../plans/autodev/PLAN.md)

---

## Scope & roadmap

`autodev` is the umbrella for autonomous engineering work on a repo. It ships one capability at a time, each behind a proof gate, so trust is earned before reach expands:

| Phase | Capability | Status |
|---|---|---|
| **1 — Quality** | Defect discovery, regression hardening, and label-gated issue work — every PR proven via break-the-fix or acceptance-criteria | ✅ **current** (this bundle) |
| **2 — Measurement-gated** | Performance + memory sources behind a repeatable measurement harness and a stricter confidence gate; graduate to non-draft PRs | ⏳ next |
| **3 — Feature development** | Larger, spec-driven feature work from labeled issues — phase-checkpointed across ticks | 🔭 planned |
| **4 — Fleet** | A supervisor coordinating multiple agents across multiple repos | 🔭 planned |

The architecture (cron-fired stateless tick, file-backed memory, pluggable work **sources**, hard proof gates) is the same across every phase — later phases add new sources and relax PR mode, they don't change the engine. **Phase 1 is live today; everything below describes it.**

---

## What phase 1 does

Each tick picks **one** candidate from an enabled work source, forms a GitHub-grounded hypothesis, and only proceeds toward a **draft PR** if it can **prove a real problem** — reproduce it, cover it with a test, and pass **break-the-fix** validation plus a **separate adversarial QA** subagent. Everything it tries (including dead ends) is logged so it never repeats itself.

**The hard rule: no false-positive PRs.** Proof is a precondition; unproven hypotheses stay in the log.

### Work sources
| Source | Proof model | Default | Phase |
|---|---|---|---|
| `pr-mining` — is a merged PR's defect class more pervasive? | break-the-fix | ✅ on | 1 |
| `bug` — discovered defects | break-the-fix | ✅ on | 1 |
| `assigned-issue` — `agent-ok`-labeled issues | acceptance-criteria | ✅ on | 1 |
| `performance` | benchmark delta | ⏸ off | 2 |
| `memory` | heap-growth | ⏸ off | 2 |

---

## Requirements
- **Claude Code** (provides the cron trigger + the agent harness)
- `git`, `gh` (authenticated), **Node 18+**
- A working clone of each target repo (the tick creates throwaway worktrees/clones under `workspace/`)

## Configure
Edit [`config.json`](config.json):
- **`prMode`**: `log` (investigate only, no PRs — Phase 0) → `draft` (default) → `real`.
- **`sources`**: enable/disable + relative `weight` for selection.
- **`caps`**: `maxOpenDraftPRs`, `maxTickMinutes`, `minConfidenceToReproduce`.

## Run one tick manually (recommended before scheduling)
In Claude Code, from the repo root:
```
/autodev-tick
```
Review what it did:
```
/autodev-status
```

## Schedule it (the "loop")
Ask Claude Code to create a **cron trigger that spawns a fresh session** firing `/autodev-tick`. Start at **every few hours**, not hourly, while you watch it. Each fire is a clean session, so an API error in one fire never stops the schedule. The lockfile prevents overlapping fires.

## State store CLI
Deterministic bits live in [`lib/state.mjs`](lib/state.mjs) (zero dependencies):
```
node autodev/lib/state.mjs digest
node autodev/lib/state.mjs seen pr:1234
node autodev/lib/state.mjs list --status pr-raised
node autodev/lib/state.mjs lock-acquire
```
Runtime state lives in `log/` and `workspace/` (both gitignored). Optionally commit `log/investigations.jsonl` to a dedicated branch for portable, git-backed memory.

---

## Safety
- Draft PRs by default — humans hold the merge decision.
- Caps prevent PR flooding; the tick does non-PR work or exits when capped.
- `assigned-issue` only touches `agent-ok`-labeled issues; bails (with a clarifying comment) on ambiguous specs.
- Investigations run in throwaway worktrees, never mutating this bundle's repo.
