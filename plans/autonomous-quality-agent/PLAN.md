# Autonomous Quality Agent — MVP Plan

**Branch:** `autonomous-quality-agent`
**Status:** Phase 0/1 build — proof of concept
**Owner:** Amith
**Standalone bundle:** [`autonomous-quality/`](../../autonomous-quality/) (zero MJ dependency)

A basic, standalone version of the *Autonomous Continuous Quality & Development Agent*. It uses **Claude Code itself** as both the harness and the orchestrator: a **cron trigger fires a fresh Claude Code session** on an interval, that session runs **one bounded investigation** via the `/aq-tick` slash command, and then exits. Durability comes from the cron + external state, not from keeping a session alive.

This is intentionally light: **no MemberJunction instance required.** State lives in flat files (a git-trackable JSONL investigation log). The schema is shaped so it can be lifted into MJ entities later without rework.

---

## 1. Core design decisions

| Decision | Choice | Why |
|---|---|---|
| **Loop mechanism** | Claude Code **cron trigger** firing a **fresh session** each time (`create_trigger` / `CronCreate` with `create_new_session_on_fire: true`) | A fresh session per fire = the "outer harness that spawns a new CC" — already built into Claude Code. One crashed/API-errored fire never kills the schedule. Avoids unbounded context growth of an in-session sleep loop. |
| **Unit of work** | **One tick = one bounded investigation, then exit** | A session that does one thing and stops can't "run forever and die mid-flight." The cron is the loop; the tick is stateless between fires. |
| **State** | File-backed JSONL log + lockfile (`autonomous-quality/log/`) | Light, standalone, git-trackable, durable across fires. Schema mirrors the future MJ entities so the port is mechanical. |
| **PR output** | **Draft PRs** (`gh pr create --draft`), gated behind a `prMode` flag (`log` → `draft` → `real`) | Dark-launch as log-only, graduate to draft once trusted, real PRs much later. |
| **MJ coupling** | **None.** Orchestration is pure Claude Code; state access is a thin file-based store | Runs anywhere with Claude Code + `gh` + `git` + Node 18. A future `MJStateStore` is a drop-in replacement. |

### The guiding rule (unchanged from the parent plan)
**No false-positive PRs.** Proof of a real, reproduced problem is a hard precondition for any PR. Everything else — hypotheses, dead ends, low-confidence hunches — stays in the investigation log.

---

## 2. Work sources (pluggable selectors)

All sources feed the **same tick engine**. They differ only in (a) how a candidate is selected and (b) what counts as **proof**. That second column is the gate that decides whether a source is ready to ship.

| Source | Selection | Proof model | MVP status |
|---|---|---|---|
| **pr-mining** | Pick a recently **merged PR**; ask "is this defect class more pervasive than what was actually fixed?" | **break-the-fix** on the generalized instance (apply→pass, revert→fail, re-apply→pass) | ✅ **Primary** — read-heavy, lowest blast radius |
| **bug** | Hypothesis-driven defect discovery in the codebase | **break-the-fix** | ✅ **On** — shares the clean proof model |
| **assigned-issue** | Pluck a **label-gated** issue (`agent-ok`) with a clear, bounded spec | **acceptance-criteria**: new tests + E2E green + existing tests still green | ✅ **On** — external, unambiguous proof; bails on ambiguity |
| **performance** | Perf hypotheses | benchmark delta beyond a noise threshold, repeated N times | ⏸ **Deferred** — needs a measurement harness + confidence gate |
| **memory** | Leak hypotheses | heap-growth curve flattens after fix, measured over iterations | ⏸ **Deferred** — noisiest; highest ghost-chase risk |

**Why perf/memory are deferred:** they need a *different* proof primitive than break-the-fix (a repeatable measurement harness) and are the central ghost-chasing risk. They ship later as their own sources behind a stricter confidence gate. Stubbed-disabled in config so they're easy to dark-launch.

**Assigned-issue specifics**
- **Label-gated** — only touches issues a human explicitly marked. Never free-roams the backlog.
- **Bails on ambiguity** — vague spec ⇒ post a clarifying comment and exit. A wrong-direction feature PR is worse churn than no PR.
- **Phase-checkpointed** — issue work usually exceeds one tick. Each tick advances one issue **one phase** (`scaffold → implement → test → pr`), checkpointing in the log. This is the stateless-tick model paying off.

---

## 3. The tick lifecycle (`/aq-tick`)

One fresh session runs exactly this, then exits:

```
1. Acquire lockfile         → another tick running? exit.
2. Health check             → repo/gh/node ready? if not, log + exit loudly.
3. Read config + log digest → caps, enabled sources, what's been tried.
4. Enforce caps             → at maxOpenDraftPRs? do non-PR work or exit.
5. Select source + candidate→ weighted pick among enabled sources.
6. Memory check             → seen this candidate? skip to a fresh one.
7. Form hypothesis          → grounded in GitHub artifacts (PRs/issues/code).
8. Confidence gate          → below minConfidenceToReproduce? log dead-end + exit.
9. Set up workspace         → throwaway git worktree/clone of the target repo.
10. Reproduce               → can't reproduce? log + exit. NO PR.
11. Test + fix              → write coverage that captures it, then fix.
12. Break-the-fix validate  → apply→pass, revert→fail, re-apply→pass. Mandatory.
13. Adversarial QA gate     → SEPARATE skeptic subagent must sign off.
14. Evidence + docs         → screenshots (Playwright for UX), regression notes.
15. Raise draft PR          → per prMode (log|draft|real).
16. Log everything          → including dead ends. Release lock. EXIT.
```

**Two non-negotiable gates** (Section 5 of the parent plan):
- **Break-the-fix** (step 12) — the objective gate. Scripted, not a vibe check.
- **Adversarial QA** (step 13) — a *separate* subagent with fresh context and a skeptic prompt, so the agent never grades its own homework.

---

## 4. Standalone bundle layout

```
autonomous-quality/
  README.md            # what it is, how to run standalone (no MJ)
  config.json          # prMode, source enable flags + weights, caps
  lib/
    state.mjs          # zero-dep file-backed StateStore + lockfile (Node 18+)
  log/                 # gitignored runtime state
    investigations.jsonl
  workspace/           # gitignored throwaway worktrees/clones per investigation
  .gitignore

.claude/commands/
  aq-tick.md           # the one-investigation unit of work (cron entrypoint)
  aq-status.md         # human-readable digest of the log
```

### Investigation record schema (one JSONL line; latest-by-id wins)
```jsonc
{
  "id": "inv_...",
  "createdAt": "ISO", "updatedAt": "ISO",
  "source": "pr-mining | bug | assigned-issue | performance | memory",
  "repo": "owner/name",
  "candidateKey": "pr:1234 | issue:567 | code:path#sym",   // dedup key
  "status": "exploring | dead-end | proven | pr-raised | blocked",
  "phase": "scaffold | implement | test | pr",             // assigned-issue multi-tick
  "confidence": 0.0,
  "hypothesis": "string",
  "proofModel": "break-the-fix | acceptance-criteria | benchmark | heap-growth",
  "evidence": ["string"],
  "outcome": "string",
  "prUrl": "string|null",
  "notes": "string"
}
```
Field names deliberately track the parent plan's Section-9 entities (**Investigation / Hypothesis / Attempt / Evidence / RaisedPR / Feedback / Repo**), so an `MJStateStore` is a faithful port.

---

## 5. State store CLI (`lib/state.mjs`)

Deterministic orchestration stays in code; the LLM does tactical work. Zero npm dependencies.

| Command | Purpose |
|---|---|
| `node state.mjs lock-acquire` / `lock-release` | Lockfile with a 6h stale-steal timeout |
| `node state.mjs seen <candidateKey>` | `SEEN <status> <id>` or `NEW` — the repetition guard |
| `node state.mjs record '<json>'` | Append/merge a record by `id` (latest-wins) |
| `node state.mjs list [--status x] [--source y]` | Filter records |
| `node state.mjs digest` | Compact memory summary the tick reads first |

---

## 6. Phased rollout (this branch = Phase 0→1)

- **Phase 0 — log only.** `prMode: "log"`. The tick investigates and writes findings; **never opens PRs.** Builds trust + the feedback corpus before any GitHub churn. *(Flip the config to start here if desired.)*
- **Phase 1 — draft PRs.** `prMode: "draft"`. pr-mining + bug + assigned-issue, draft PRs only. **← default for this MVP.**
- **Phase 2 — real PRs + perf/memory sources** behind a measurement harness + stricter confidence gate.
- **Phase 3+** — feature discovery, supervisor agent, multi-repo fleet (parent plan).

---

## 7. Safety rails

- **Caps:** `maxOpenDraftPRs` (default 3), `maxTickMinutes`, `minConfidenceToReproduce`. The tick does non-PR work or exits when capped — no flooding.
- **Lockfile:** prevents overlapping ticks if cron fires while one is still running.
- **Label-gating:** assigned-issue source only touches `agent-ok` issues.
- **Throwaway workspace:** investigations run in a per-investigation worktree/clone, never mutating the bundle's own repo. Cleaned up after.
- **Draft-by-default:** humans hold the merge decision; nothing auto-merges.
- **Loud health-check failures:** a fresh session with a half-ready environment logs and exits rather than half-running.

---

## 8. Open questions (carried forward)

- Confidence-threshold tuning per source (start at 0.6, observe).
- Definition of "proof" for perf/memory specifically (which measurable deltas count).
- When to add semantic search over the log (grep + digest suffices at MVP scale).
- Cron cadence (start every few hours while watching, not hourly).
- Whether assigned-issue phase-checkpointing needs its own lock lane vs. the global tick lock.
