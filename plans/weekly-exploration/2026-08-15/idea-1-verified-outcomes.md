# Idea 1: Verified Outcomes — Closing the Attempted-vs-Confirmed Gap in Actions & Integrations

**Week of 2026-08-15 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world, not the codebase

An understaffed nonprofit's whole operating model depends on trusting that when the system says "done," it's actually done. A renewal reminder was supposedly sent. A payment processor sync supposedly posted this month's dues. A social-media action supposedly deleted an outdated event post before a compliance deadline. Staff move on to the next fire because the dashboard shows a green checkmark — and for an org where 76% of staff report bandwidth, not budget, as their binding constraint (2026 Nonprofit AI Adoption Report), nobody has time to double-check work the system already claimed to have finished. When that checkmark is wrong, the org doesn't find out from the system — it finds out from an angry donor, a bounced compliance audit, or a board member who noticed the stale post themselves. That's not a hypothetical: it's the exact failure mode reported this week in issue #3790, where a Twitter delete action and an Instagram schedule action each report `SUCCESS` while a dead-code guard silently prevents the underlying operation from running at all. Nobody would have caught that from the log — the log looked healthy.

MemberJunction is in a position to fix the *category* of bug, not just this one instance of it. Every action and every integration sync in MJ already produces a structured execution record — the raw material for a trust layer already exists. What's missing is a first-class distinction between "the code path returned without throwing" and "we independently confirmed the world actually changed."

## What already exists (and why this doesn't duplicate it)

Verified directly against the generated entities and provider code, not assumed:

- **`MJ: Action Execution Logs`** (`MJActionExecutionLogEntity`) already captures `Params`, `ResultParams` (NULL is a documented "never finished" signal), and a `ResultCode` that joins to **`MJ: Action Result Codes`**, which carries the `IsSuccess` bit per `(ActionID, ResultCode)` pair. This is a real, structured outcome model — but it is entirely self-reported by the action's own code. Nothing re-checks that the declared side effect actually happened, which is exactly how #3790's dead guard code slips through: the action returns a "this succeeded" result code because that line of code executed, not because anything was verified.
- **`MJ: Company Integration Runs`** (`MJCompanyIntegrationRunEntity`) and **`MJ: Company Integration Run Details`** (`MJCompanyIntegrationRunDetailEntity`) are considerably stronger — a real `Status` value list (Pending/Queued/In Progress/Success/Failed/Cancelled) at the run level and an explicit `IsSuccess` bit per record at the detail level, plus a full lease/heartbeat/fence-token model for safe resumable execution. This proposal does not touch or duplicate that concurrency machinery — it only adds an optional, additional verification dimension on top of the outcome these entities already record.
- **Open App Publish & Install Integrity** (in flight, `plans/weekly-exploration/2026-08-08/idea-2-open-app-install-integrity.md`, PR #3630) addresses a different lifecycle moment — whether an *Open App's own installation* rolled back cleanly. This proposal is about ordinary, everyday Action and Integration runs that happen constantly after any app is already installed and running.
- This is explicitly **not** a rebuild of `ResultCode`/`Status` — those stay exactly as they are. Verification is modeled as an additive, optional layer, because most actions genuinely don't need it (a dashboard refresh doesn't need independent confirmation) and forcing it everywhere would tax high-volume connectors for no benefit.

## Proposed architecture

### New entities

| Entity | Purpose |
|---|---|
| `MJ: Action Verification Strategies` | Opt-in, per-`ActionID` (or per `ActionResultCode`) declaration of how to confirm a claimed success: `VerificationType` (Requery / WebhookCallback / ManualAttestation / None), `TargetEntityID` + `ExpectedFieldMapping` (JSON — for Requery, which field(s) on which record should now hold which value), `TimeoutSeconds`, `RetryPolicy` |
| `MJ: Action Verification Results` | One row per verification attempt, attached via CompositeKey to an `MJActionExecutionLogID` or `MJCompanyIntegrationRunDetailID`: `VerificationStatus` (Unverified / Pending / Verified / **Contradicted** / TimedOut), `VerifiedAt`, `Evidence` (JSON — what was checked and what was actually found) |

`Contradicted` is the important new state: "the action's own code reported success, and independent verification proved that wrong." That is precisely the #3790 bug class, made visible and queryable instead of discovered by accident.

### Engine

**`VerificationEngine`** (new, `packages/Actions/Verification`, following the existing `Base`+`Engine` split) — for `Requery`-type strategies, re-fetches the target record via the standard entity/RunView path immediately or after a short delay and compares against `ExpectedFieldMapping`; for `WebhookCallback`-type strategies, exposes a normalized ingestion point that a connector's async confirmation (if the external system has one) writes into, reusing the same scheduled-job substrate already used elsewhere in MJ for deferred/async work rather than inventing new polling infrastructure. `ManualAttestation` is the lightweight v1 path: a human marks a result Verified or Contradicted directly, no automation required.

### UI

- A **Confirmed vs. Attempted** status chip added to the existing Action Execution Log and Integration Run Detail grids — three states at a glance (Verified / Unverified / Contradicted), not a new screen to learn.
- A **"Silent Failures"** dashboard widget (embeddable on any ops/admin dashboard) that specifically surfaces `ResultCode.IsSuccess = true` rows where `VerificationStatus = Contradicted` — the exact "the system lied to us" view that would have surfaced #3790 in production automatically, instead of via code review months later.
- A per-Action **"Add Verification"** configuration panel, next to where an Action's result codes are already administered, so an app builder opts a specific action into verification without writing code.

### Why this belongs in core, not an app

Every app built on MJ calls Actions and runs Integration syncs; the gap between "the code returned" and "the world actually changed" is identical whether the action deletes a stale social post, posts a payment, or updates a member's mailing address. Only the verification *strategy* for a given action — what to re-check, and how — is domain-specific, and that's metadata an app builder configures, not new framework code per app.

## Phased rollout

1. **Phase 1** — `MJ: Action Verification Results` entity + `ManualAttestation` only + the Confirmed/Attempted status chip on existing grids. No automation yet, but immediately valuable as an audit trail and a place for ops staff to flag "this said success but I know it isn't."
2. **Phase 2** — `MJ: Action Verification Strategies` + `VerificationEngine` automated `Requery` verification, opt-in per action.
3. **Phase 3** — `WebhookCallback` async verification for Integration Runs, plus the "Silent Failures" dashboard widget.

## Open questions

- Should a `Contradicted` result automatically retry or roll back, or only surface for human review? Leaning: surface only in Phase 1–2 — automatic remediation is a later decision that needs more operational trust in the verification signal itself first.
- Requery verification adds a DB or API round trip per verified action; this must stay strictly opt-in per action, never a global default, so high-volume connectors aren't taxed for actions where the risk doesn't justify the cost.

## Mockup

See [`mockups/verified-outcomes.html`](./mockups/verified-outcomes.html) — an Action/Integration ops view showing Attempted-vs-Verified counts and a drill-in "Silent Failures" list of results the system claimed succeeded but verification contradicted. Screenshot: [`screenshots/idea-1-verified-outcomes.png`](./screenshots/idea-1-verified-outcomes.png).
