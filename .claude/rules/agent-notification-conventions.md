# Agent Notification Conventions — template notifications between agents + to the operator

Every workshop run emits a **structured, append-only notification stream** so the operator (and the
`super-coordinator`) can watch a build live, resume a crashed run, and audit exactly what happened —
without any agent dumping prose into the conversation or echoing a secret. The substrate already exists:
**`IntegrationProgressEmitter`** in `@memberjunction/integration-progress-artifacts`. This file is the
contract for *how* agents use it — the notification **templates** each lifecycle moment must emit.

## Why a template, not free-form

A free-form "I'm working on it…" message is unverifiable, unresumable, and easy to fabricate. A *templated*
notification is a typed event with a known shape, written to `progress.jsonl`, that `floor-check` and the
`IntegrationProgressReader` can parse. The rule: **state changes are notified as events, not prose.** If it
matters enough to tell the operator, it matters enough to be a structured event.

## The substrate (don't reinvent it)

`IntegrationProgressEmitter` writes three artifacts under `logs/integration-runs/<runID>/`:

| File | Written | Carries |
|------|---------|---------|
| `manifest.json` | once at start | run identity (vendor, runID, kind, maxTier) |
| `progress.jsonl` | append-only per event | the notification stream — one JSON event per line |
| `result.json` | once at terminate | terminal verdict + `resumableFromSeq` |

Sequence numbers are monotonic; writes are serialized (callers don't `await`). `checkpoint` events carry a
`resumableState` so a killed run resumes from the last checkpoint, not from zero.

```js
import { IntegrationProgressEmitter } from '@memberjunction/integration-progress-artifacts';

const emitter = new IntegrationProgressEmitter(
    { runID: args.runID, vendor: VENDOR, kind: 'connector-build', maxTier: MANIFEST.e2eTier },
    { rootDir: `${REGISTRY_DIR}/runs/${args.runID}/progress` }
);
```

## The notification templates — emit these, verbatim-shaped, at each moment

Each row is a **required** notification at that lifecycle point. `stage` is the `phase()` title so the
reader can align the stream to the workflow's phase tree.

| Moment | Call | Operator sees |
|--------|------|---------------|
| Run begins | `emitter.runStart('Build <vendor> — maxTier <T>')` | run started, identity, budget ceiling |
| Phase begins | `emitter.stageStart(phase, '<one-line intent>')` | which stage, why |
| Phase ends OK | `emitter.stageComplete(phase, { processed, succeeded, failed, skipped })` | counts that prove work happened |
| Long phase alive | `emitter.heartbeat(phase, '<n>/<total> …', counts)` every ≥30s of silent work | not hung; burn-rate visible |
| Resumable point | `emitter.checkpoint(phase, { …resumableState })` after each expensive irreversible step | where a resume restarts |
| Recoverable problem | `emitter.stageError(phase, msg, { code })` (run continues) | a non-fatal issue, with a `SyncErrorCode` |
| **Amendment round** | `emitter.emit('progress.heartbeat', { stage, message: 'amendment round <r>/<max>: <n> blocking gaps', level: 'warn' })` | the loop is iterating, not stuck silently |
| **Escalation** | see below | the run needs a human |
| Run succeeds | `await emitter.complete('<vendor> connector built — floor-check pass')` | terminal green + duration |
| Run fails/escalates | `await emitter.fail(message, code)` | terminal red + reason |

**Always `await emitter.flush()` (or `complete`/`fail`, which flush) before the workflow returns** — otherwise
the last events can be lost when the process exits.

## Escalation notifications — the human-needed signal

The amendment loops in `_TEMPLATE.workflow.js` already *return* a status when they give up
(`EscalatedDeadlock`, `EscalatedMaxRounds`, `EscalatedCodeDeadlock`, `EscalatedCodeMaxRounds`). The
notification rule is: **an escalation is a terminal `fail` event with the escalation code**, so a watcher
polling `result.json`/`progress.jsonl` is alerted without reading the whole journal. Emit it at the moment
the loop decides to escalate, *before* returning:

```js
if (previousReviewFingerprint === reviewFingerprint) {
    await emitter.fail(
        `Producer + reviewer deadlocked after ${amendmentRound + 1} rounds; ` +
        `${review.ConfirmedGapsBlocking} blocking gaps unresolved. Evidence: ${review.ReviewFile}`,
        'escalated-deadlock'
    );
    return { /* …status: 'EscalatedDeadlock' as the template already does… */ };
}
```

The four escalation codes → notification messages:

| Status returned by `_TEMPLATE` | `fail()` code | Message template |
|--------------------------------|---------------|------------------|
| `EscalatedDeadlock` | `escalated-deadlock` | "Producer+reviewer deadlocked after N rounds; K blocking gaps. Evidence: `<ReviewFile>`" |
| `EscalatedMaxRounds` | `escalated-max-rounds` | "Extract amendment hit M-round cap; K blocking gaps. Human review: `<ReviewFile>`" |
| `EscalatedCodeDeadlock` | `escalated-code-deadlock` | "Code+ladder deadlocked after N rounds; identical failures recur. See `classifiedFailures`" |
| `EscalatedCodeMaxRounds` | `escalated-code-max-rounds` | "Code+ladder hit M-round cap; rungs still red. Human intervention required" |

## Budget notifications

The plan sets a hard token ceiling (1M). Emit a `progress.heartbeat` with `level:'warn'` when burn crosses
each quartile (`'budget 50% — 500k/1M'`), and `fail(msg, 'budget-exhausted')` if the ceiling is hit — which
`IntegrationProgressEmitter` already maps to `exitReason: 'budget-exhausted'` in `result.json`.

## Hard rules

1. **Never notify a secret or PII.** Anything that came from a vendor record or a credentialed call goes
   through `scrub-fixture` *before* it can appear in an event `message`/`data`. The emitter writes to disk;
   treat `progress.jsonl` as operator-visible.
2. **Counts, not adjectives.** `stageComplete` carries `{processed, succeeded, failed, skipped}` — "done" with
   no counts is not a notification, it's a claim. A green stage with `processed:0` is a *red flag*, not a pass
   (the silent-fail rule from `connector-test-conventions.md`).
3. **One emitter per run, passed down.** The `super-coordinator` creates the emitter and threads its `runID`
   into every sub-workflow via `args`; sub-workflows open an emitter against the **same** `runID` so all events
   land in one stream. Never spin a second run dir mid-build.
4. **Checkpoint before anything irreversible** (a write-back to `metadata/`, a `mj codegen`, a live write-path
   test) so a resume never repeats it.
5. **Flush before return.** `await emitter.complete(...)` / `emitter.fail(...)` / `emitter.flush()`.

The `super-coordinator` consumes this stream (via `IntegrationProgressReader`) to render the live status and
to write the human-readable `REPORT.md` at the end — so a faithful event stream is what makes the final report
trustworthy.
