# Autonomous Quality Agent (standalone)

A continuous, autonomous code-quality engine that runs **Claude Code as both the harness and the orchestrator**. A **cron trigger fires a fresh Claude Code session** on an interval; that session runs **one bounded investigation** (`/aq-tick`) and exits. Durability comes from the cron + this on-disk state — not from keeping a session alive.

**No MemberJunction required.** Everything here is plain Claude Code + `git` + `gh` + Node 18. The state store is a thin file-based layer that a future `MJStateStore` can replace 1:1.

> Full design + rationale: [`../plans/autonomous-quality-agent/PLAN.md`](../plans/autonomous-quality-agent/PLAN.md)

---

## What it does

Each tick picks **one** candidate from an enabled work source, forms a GitHub-grounded hypothesis, and only proceeds toward a **draft PR** if it can **prove a real problem** — reproduce it, cover it with a test, and pass **break-the-fix** validation plus a **separate adversarial QA** subagent. Everything it tries (including dead ends) is logged so it never repeats itself.

**The hard rule: no false-positive PRs.** Proof is a precondition; unproven hypotheses stay in the log.

### Work sources
| Source | Proof model | Default |
|---|---|---|
| `pr-mining` — is a merged PR's defect class more pervasive? | break-the-fix | ✅ on |
| `bug` — discovered defects | break-the-fix | ✅ on |
| `assigned-issue` — `agent-ok`-labeled issues | acceptance-criteria | ✅ on |
| `performance` | benchmark delta | ⏸ off |
| `memory` | heap-growth | ⏸ off |

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
/aq-tick
```
Review what it did:
```
/aq-status
```

## Schedule it (the "loop")
Ask Claude Code to create a **cron trigger that spawns a fresh session** firing `/aq-tick`. Start at **every few hours**, not hourly, while you watch it. Each fire is a clean session, so an API error in one fire never stops the schedule. The lockfile prevents overlapping fires.

## State store CLI
Deterministic bits live in [`lib/state.mjs`](lib/state.mjs) (zero dependencies):
```
node autonomous-quality/lib/state.mjs digest
node autonomous-quality/lib/state.mjs seen pr:1234
node autonomous-quality/lib/state.mjs list --status pr-raised
node autonomous-quality/lib/state.mjs lock-acquire
```
Runtime state lives in `log/` and `workspace/` (both gitignored). Optionally commit `log/investigations.jsonl` to a dedicated branch for portable, git-backed memory.

---

## Safety
- Draft PRs by default — humans hold the merge decision.
- Caps prevent PR flooding; the tick does non-PR work or exits when capped.
- `assigned-issue` only touches `agent-ok`-labeled issues; bails (with a clarifying comment) on ambiguous specs.
- Investigations run in throwaway worktrees, never mutating this bundle's repo.
