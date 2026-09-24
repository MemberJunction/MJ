# Idea 3: Data Access Sentinel — Anomalous Access & Bulk Export Detection

**Week of 2026-09-05 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world, not the codebase

Small nonprofits and associations are, by every current measure, the **most targeted and least
defended** organizations on the internet — not because their data is uniquely valuable, but
because they have the thinnest IT staff and the least room to absorb a bad week. Ransomware was a
factor in 44% of all data breaches in 2025 (up sharply from 32% the year before), 80% of small
organizations experienced at least one cyberattack in the past year, and a typical incident costs
a small organization $120,000 and 24 days of downtime — money and staff time that, for a mission-
driven organization, comes directly out of the work the mission exists to do. The specific failure
mode that matters most for a membership or donor database isn't usually a firewall breach; it's a
legitimate, already-logged-in account — a departing employee, a compromised password, a well-
meaning volunteer who doesn't realize what they're about to do — quietly pulling an entire donor
list at 2 a.m., or a service account suddenly reading fields it has never touched before. Nobody
notices until a reporter, a regulator, or a ransom note tells them.

The uncomfortable truth is that most of the *evidence* a small organization would need to catch
this already exists in their systems — it's just never looked at, because nobody has time to
audit logs by hand and there's no alerting layer that knows what "normal" looks like for this
specific org. That's exactly the gap a framework can close for free: MJ already logs a remarkable
amount about who does what, to which records, through which surface. What's missing is the layer
that turns that raw trail into "here's the one thing that looks different from last month, and
here's who to tell."

## What already exists (and why this doesn't duplicate it)

MJ's core schema already ships several access/execution logs — this proposal reads all of them; it
adds **zero new logging infrastructure** and instead adds the scoring/alerting intelligence none of
them currently have:

- **`MJ: Audit Logs`** (+ `MJ: Audit Log Types`) — a generic, already-wired Success/Failed event log
  tied to `Authorization` checks. The Sentinel's primary raw signal for "who attempted what,
  successfully or not."
- **`MJ: User View Runs`** / **`MJ: User View Run Details`** — every saved-view execution, by whom,
  when. The natural signal for "did someone just run a view that returns the entire donor table,"
  which today is recorded but never scored.
- **`MJ: User Record Logs`** — per-user, per-record access timestamps, today powering "recently
  viewed" UX. The Sentinel reads the same rows as one more input rather than adding a parallel
  per-record access tracker.
- **`MJ: API Key Usage Log`** — service-account/integration access patterns, distinct from
  interactive-user behavior, so a sudden change in an API key's usual call volume or entity scope
  is its own signal.
- **Field-Level Security** (open PR #3367, in flight) governs **whether a role can see a field at
  all** — a static, declarative permission. This proposal is deliberately not a permission system:
  it does not decide what anyone *can* do. It watches what an *already-permitted* action pattern
  looks like against that account's own history, and flags when it diverges sharply — a
  fundamentally different, complementary question ("is this normal for you" vs. "are you allowed
  to"). A user with perfectly correct field-level permissions bulk-exporting the whole database at
  3 a.m. is exactly the case Field-Level Security cannot catch and this proposal exists for.
- **RLS / Unified Permissions** — same relationship: this proposal never overrides or second-
  guesses what a row-level-security filter or the permission engine allows. It is a read-only
  observer of already-authorized activity, never an enforcement point itself in Phase 1.
- **Universal Approval Gates** (2026-08-14 idea 1, PR #4009) is *pre-action* — it pauses a
  configured-in-advance risky action before it runs. This proposal is *post-hoc pattern detection*
  across everything, including the enormous majority of actions nobody thought to write an
  approval rule for in advance, because nobody could anticipate every anomalous pattern as a rule.
  The two are the same "prevent vs. detect" split as 2026-08-29's Operation Safety Net vs. Approval
  Gates pairing, applied to reads/exports instead of writes.

## Proposed architecture

### New entities (`__mj` core schema)

| Entity | Purpose |
|---|---|
| `MJ: Access Baselines` | Per-user (or per-API-key) rolling behavioral profile: `PrincipalType` (`User`/`APIKey`), `PrincipalID`, `EntityID` (nullable — null means cross-entity), `TypicalHourRangeStart`/`End`, `TypicalRecordsPerRunP95`, `TypicalDistinctEntitiesPerDayP95`, `LastRecomputedAt` — a small set of simple percentile stats, not a trained model, same "spreadsheet formula, not a trained model" philosophy every prior week's scoring engine has used |
| `MJ: Access Anomalies` | One row per detected deviation: `PrincipalType`/`PrincipalID`, `EntityID` (nullable), `AnomalyType` (`OffHoursAccess` / `VolumeSpike` / `NewEntityScope` / `RapidSequentialExport` / `DormantAccountReactivated`), `Severity`, `ObservedValue`/`BaselineValue` (so the alert is explainable, not a black-box score), `SourceLogType` (`AuditLog`/`UserViewRun`/`UserRecordLog`/`APIKeyUsageLog`), `SourceLogID`, `Status` (`Open`/`Acknowledged`/`Confirmed`/`FalsePositive`), `ReviewedByUserID` (nullable) |

Two tables. No new logging — `Access Baselines` and `Access Anomalies` are read/derived from the
four existing log entities above; the anomaly row always cites exactly which existing log row
triggered it (`SourceLogType`/`SourceLogID`), so every alert is one click away from the underlying
evidence, never an unverifiable score.

### `AccessSentinelEngine` (new package, `packages/Core/AccessSentinel`, `Base` + `Engine` split)

- `RecomputeBaselines(principalType, principalId?)` — reads recent history from the four existing
  logs via batched `RunView` calls (never a per-record loop, per the data-access rules), computes
  simple percentile stats, writes/updates `Access Baselines`. Scheduled via a new
  `AccessSentinelScheduledJobDriver` in `packages/Scheduling/engine/src/drivers/` — the tenth driver
  in that directory, following the exact same interface as the nine that already exist there.
- `EvaluateActivity(principalType, principalId, event)` — the near-real-time check, invoked as a
  lightweight hook from the existing `MJ: Audit Logs` write path and the `User View Run` completion
  path (an additive call at an existing write point, not a new interception layer): compares the
  just-logged event against the principal's current baseline; on a clear deviation
  (`>` a configurable multiple of the P95, or activity entirely outside the typical hour range, or
  a scope the principal has never touched before), writes an `Access Anomalies` row.
- **Alert delivery reuses `NotificationEngine`** (`packages/Communication/notifications`) exactly as
  it exists today — a confirmed or high-severity anomaly is delivered to configured admins through
  the same in-app/email/SMS mechanism every other MJ notification already uses. No parallel
  alerting channel is introduced.
- **Explicit non-goal, stated plainly in the UI, not just this doc**: this is a *detection and
  alerting* layer, not an *enforcement* layer, in Phase 1 — it never blocks a read or an export by
  itself. An org that wants automatic blocking on a confirmed pattern can wire a `Access Anomalies`
  row to a Universal Approval Gate or a Suppression rule (this week's Idea 2, for the export-to-
  audience path specifically) as a *composition* of existing/proposed primitives, not something
  this engine does unilaterally — a false positive that silently blocked a legitimate late-night
  board report would be a worse failure than the one this proposal solves.
- A small schema gap, named honestly rather than assumed away: `MJ: User View Runs` does not
  currently persist a returned-row count. Phase 1 adds one small, additive `RecordCount` field to
  that existing entity (populated at the point the view already executes) rather than inventing a
  parallel "view execution with row count" table — the volume signal this proposal most needs is
  one column away, not a new logging subsystem.

### UI (Angular, L1/L2 per the UI layering guide)

- **Data Access Sentinel dashboard** (`packages/Angular/Explorer/dashboards`, `scaffold-mj-dashboard`
  pattern) — an anomaly feed (who/what/when/why-flagged, severity-sorted), a per-principal activity
  timeline showing the baseline band and the anomalous spike visually, and a one-click
  Acknowledge/Confirm/False-Positive triage action per row — the same lightweight triage pattern
  Idea 2's suppression override flow and 2026-08-29's Data Health findings both use, so admins
  learn one interaction pattern across every "engine surfaces something, a human disposes of it"
  screen in the product.
- **Principal detail drill-down** — clicking any anomaly shows the exact `SourceLogType`/
  `SourceLogID` evidence inline (the actual `Audit Log`/`User View Run` row), so "why was I
  flagged" is always answerable without a database query.
- A quiet **admin-only badge** in the main nav (unread confirmed-severity count) rather than a
  disruptive interrupt — this is a monitoring surface an admin checks periodically, not a blocking
  gate, consistent with the Phase 1 non-goal above.

### Why this belongs in core, not an app

A university registrar's office, a healthcare network's records team, a trade association's
membership desk, and a SaaS company running its internal data platform on MJ all face the same
exposure: legitimate accounts that occasionally do something very unlike their own history, at the
exact moment nobody is watching. The mechanism (simple percentile baselines over existing log
tables, an explainable anomaly row that always cites its evidence, delivery through the existing
notification engine) is completely domain-agnostic. Only the sensitivity thresholds an org
configures are deployment-specific — and even those default to sane, off-by-default-alerting
values so a brand-new deployment with no history yet doesn't immediately drown admins in
cold-start false positives.

## Phased rollout

1. **Phase 1** — `Access Baselines` + `Access Anomalies` entities, the additive `RecordCount` field
   on `User View Runs`, `AccessSentinelEngine.RecomputeBaselines()`/`EvaluateActivity()` covering
   `VolumeSpike` and `OffHoursAccess` only (the two cheapest and highest-signal anomaly types),
   alerts through `NotificationEngine`. No dashboard yet — alerts alone are independently useful.
2. **Phase 2** — `NewEntityScope` and `DormantAccountReactivated` anomaly types,
   `AccessSentinelScheduledJobDriver` for baseline refresh, the full Data Access Sentinel dashboard
   with triage actions.
3. **Phase 3** — `RapidSequentialExport` (cross-view, cross-session pattern detection — a principal
   running many small "innocent-looking" view executions in rapid succession that add up to a full
   export, which no single-event check catches) and an optional, explicitly opt-in composition
   with Approval Gates/Suppression for organizations that want a confirmed anomaly to trigger
   automatic friction rather than only an alert.

## Open questions

- Cold-start problem: a brand-new deployment, or a newly-created user, has no baseline yet.
  Leaning toward a minimum-history floor (e.g., no `VolumeSpike` alerts for a principal until 14
  days of activity exist) rather than alerting against an empty or single-sample baseline —
  flagged as a Phase 1 requirement, not deferred, since a noisy cold start is exactly how alert
  fatigue starts and trust in the whole feature erodes.
- Should `Access Anomalies` support a per-org allowlist ("our controller runs a full-database
  export every month-end — stop flagging that specific recurring pattern")? Leaning yes, modeled
  as a recognized, named recurring baseline exception rather than a blanket mute, so a genuinely
  new anomalous pattern from the same principal still surfaces — deferred to Phase 2 design.
- Multi-tenant/API-key baselines (`PrincipalType = APIKey`) may need a different statistical shape
  than human users (integrations often *are* naturally bursty/scheduled) — flagged for the
  architecture-review stage rather than assuming one baseline model fits both principal types.

## Mockup

See [`mockups/data-access-sentinel.html`](./mockups/data-access-sentinel.html) — the Data Access
Sentinel dashboard showing the anomaly feed, a principal's activity timeline with the baseline
band and flagged spike, and the evidence drill-down panel. Screenshot:
[`screenshots/idea-3-data-access-sentinel.png`](./screenshots/idea-3-data-access-sentinel.png).

## Sources

- [StationX, "Ransomware Statistics 2026"](https://app.stationx.net/articles/ransomware-statistics) —
  ransomware as a factor in 44% of 2025 breaches, up from 32%.
- [StationX, "Small Business Cybersecurity Statistics and Trends 2026"](https://app.stationx.net/articles/small-business-cybersecurity-statistics) ·
  [Spacelift, "60 Small Business Cybersecurity Statistics"](https://spacelift.io/blog/small-business-cybersecurity-statistics) —
  80% of small organizations breached in the past year; small organizations as the most-targeted,
  least-defended segment; ~$120,000/24-day typical recovery cost.
- [SentinelOne, "Data Breach Statistics for 2026"](https://www.sentinelone.com/cybersecurity-101/cybersecurity/data-breach-statistics/) —
  broader 2026 breach-cost and prevalence context.
