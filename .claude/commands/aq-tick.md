---
description: Run ONE bounded autonomous-quality investigation (cron entrypoint), then exit. Picks a candidate from an enabled work source, proves a real problem, and raises a draft PR only if proven.
arguments:
  - name: source
    description: "Optional: force a source — pr-mining | bug | assigned-issue. Omit to auto-select by config weights."
    required: false
---

# /aq-tick — one autonomous-quality investigation

You are the tactical executor for the **Autonomous Quality Agent**. A cron trigger fired a fresh Claude Code session to run **exactly ONE bounded investigation**, then **exit**. You are NOT a forever loop — the cron is the loop. Do one unit of work well and stop.

**The hard rule: no false-positive PRs.** Proof of a *real, reproduced* problem is a precondition for any PR. Unproven hypotheses get logged and that's it. When in doubt, log a dead-end and exit — that is a success, not a failure.

Full design context: `plans/autonomous-quality-agent/PLAN.md`. Bundle: `autonomous-quality/`.

---

## Conventions
- **Bundle root:** `autonomous-quality/` (relative to repo root). Config: `autonomous-quality/config.json`. State CLI: `node autonomous-quality/lib/state.mjs <cmd>`.
- **Always log before exiting** — every path (dead-end, blocked, proven, capped) must `record` an investigation row so the next tick has memory.
- **Keep it bounded** — respect `caps.maxTickMinutes`. If you're approaching it, checkpoint the investigation to the log (set a `phase` / `status: blocked`) and exit cleanly.

---

## Steps

### 1. Acquire the lock
```
node autonomous-quality/lib/state.mjs lock-acquire
```
- `LOCKED` → another tick is running. **Stop immediately.** Print "tick skipped (locked)" and exit. Do nothing else.
- `ACQUIRED` → continue. From here on, you MUST `lock-release` before exiting on every path.

### 2. Health check
Confirm the environment is ready: `git rev-parse --is-inside-work-tree`, `gh auth status`, `node --version` (≥18). If anything is missing, `record` a `status: blocked` row describing the gap, `lock-release`, and exit loudly. Do not half-run.

### 3. Load config + memory
- Read `autonomous-quality/config.json` (`prMode`, `sources`, `caps`).
- Read the digest: `node autonomous-quality/lib/state.mjs digest`. This tells you open PRs, in-flight phased work, and recently-touched `candidateKey`s to avoid repeating.

### 4. Enforce caps
- Count open draft PRs (`status: pr-raised`) from the digest. If `>= caps.maxOpenDraftPRs`: do **non-PR work only** this tick (advance a phased `assigned-issue`, or deepen an existing investigation's log), or if nothing useful remains, `record` a short "capped, idle" note, `lock-release`, and exit.

### 5. Select source + candidate
- If `$ARGUMENTS` names a source, use it (must be enabled). Otherwise pick among **enabled** sources weighted by `weight`. Prefer advancing in-flight phased `assigned-issue` work before starting something new.
- Fetch candidates from **GitHub as source of truth** (`gh pr list --state merged`, `gh issue list --label <config label>`, or codebase scan), per the selected source:
  - **pr-mining** — pick a recently merged PR. Candidate question: *"This fixed X here — does the same class of defect exist elsewhere?"* `candidateKey = pr:<number>`.
  - **bug** — a concrete defect hypothesis grounded in the code. `candidateKey = code:<path>#<symbol>`.
  - **assigned-issue** — pick an open issue labeled with `sources.assigned-issue.label` (default `agent-ok`). `candidateKey = issue:<number>`.

### 6. Memory check
```
node autonomous-quality/lib/state.mjs seen <candidateKey>
```
- `SEEN dead-end ...` or `SEEN pr-raised ...` → pick a different candidate (back to step 5). Don't repeat finished work.
- `SEEN <other> ...` with a `phase` → this is in-flight; resume it.
- `NEW` → proceed. `record` an opening row now (`status: exploring`, the hypothesis, source, repo, candidateKey) and keep its `id`.

### 7. Form the hypothesis (grounded)
Ground it in GitHub artifacts (the merged PR diff, the issue body + acceptance criteria, the actual code). No reasoning in a vacuum. Write the hypothesis into the investigation row.

### 8. Confidence gate
Estimate confidence (0–1) that a real problem exists / the issue is well-specified.
- **assigned-issue:** if the spec is **ambiguous**, post a clarifying comment on the issue (`gh issue comment`), `record` `status: blocked` with the question, `lock-release`, exit. Do NOT guess.
- **pr-mining / bug:** if confidence `< caps.minConfidenceToReproduce`, `record` `status: dead-end` (with reasoning for future recall), `lock-release`, exit. Logging a low-confidence pass is the correct outcome — it avoids ghost-chasing.

### 9. Set up an isolated workspace
Create a **throwaway** working copy so you never mutate this bundle's repo:
- Same-repo target: `git worktree add autonomous-quality/workspace/<id> -b aq/<id> origin/next`
- External repo: clone into `autonomous-quality/workspace/<id>`.
Do all edits/tests there. Clean it up (`git worktree remove`) before exiting.

### 10. Reproduce
Concretely reproduce the problem (or, for `assigned-issue`, establish the failing/missing-feature baseline).
- **Cannot reproduce → NO PR.** `record` `status: dead-end` with what you tried, clean up, `lock-release`, exit.

### 11. Test + fix
Write the test/coverage that **captures** the problem first, then implement the fix (or the feature, for `assigned-issue`). Follow the target repo's conventions (read its `CLAUDE.md`).

### 12. Break-the-fix validation (MANDATORY for bug/pr-mining)
Prove the test genuinely catches the defect:
1. Apply the fix → new test **passes**.
2. Revert the fix → test **fails**.
3. Re-apply the fix → test **passes**.
If step 2 doesn't fail, the test didn't exercise the bug — fix the test or abandon (`record` `dead-end`, exit). Record the three results in `evidence`.
- **assigned-issue** uses the acceptance-criteria proof instead: new tests + E2E green + **existing tests still green**.

### 13. Adversarial QA gate (separate subagent)
Spawn a **separate** subagent (via the Agent tool) with a **skeptic** prompt: *"Try to refute that this is a real, proven problem with a correct, well-tested fix. Look for: test that doesn't actually catch the bug, scope creep, regressions, convention violations. Default to REJECT if uncertain."* Pass it the diff + evidence. If it rejects, `record` the reasoning as `status: blocked` or `dead-end`, clean up, `lock-release`, exit. You do NOT grade your own homework.

### 14. Evidence + docs
Gather evidence appropriate to the change: Playwright screenshots for UX (use the `playwright-cli` skill), a clear description of what was fixed/built and how it's guarded against regression. Put artifact references in the investigation `evidence`.

### 15. Raise the PR (per prMode)
- `prMode: "log"` → **do not open a PR.** `record` `status: proven` with the full evidence for human review. This is Phase 0.
- `prMode: "draft"` → `gh pr create --draft` targeting the repo's default review branch (`next` for MJ), with a body that includes the hypothesis, the proof (break-the-fix results / acceptance criteria), evidence, and regression notes. **Draft only.**
- `prMode: "real"` → same but non-draft (reserved for later phases).
Then `record` `status: pr-raised` with `prUrl`.

### 16. Finalize
- `record` the final state of the investigation (outcome, evidence, prUrl).
- Clean up the workspace worktree/clone.
- `node autonomous-quality/lib/state.mjs lock-release`
- Print a one-paragraph summary of what this tick did and exit.

---

## Recording shape
Use the schema in the plan. Example:
```
node autonomous-quality/lib/state.mjs record '{"id":"<id>","source":"pr-mining","repo":"MemberJunction/MJ","candidateKey":"pr:2978","status":"dead-end","confidence":0.4,"hypothesis":"...","proofModel":"break-the-fix","outcome":"could not reproduce generalized instance","notes":"checked X,Y,Z"}'
```
Always pass the same `id` you got from the opening `record` in step 6 so updates merge (latest-wins).
