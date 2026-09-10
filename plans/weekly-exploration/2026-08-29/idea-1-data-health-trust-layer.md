# Idea 1: Data Health & Trust Layer

**Week of 2026-08-29 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world, not the codebase

Ask anyone who has staffed a membership desk or a donor-relations team what erodes trust in "the
system" fastest, and it's rarely a missing feature — it's bad data. A renewal letter addressed to
someone who moved two years ago. A donor whose giving history looks thin because half their gifts
are attached to a stray second record. A board report that undercounts active members because a
required field went blank during a rushed import. Every one of these is small on its own and
corrosive in aggregate: staff stop trusting the reports, start keeping shadow spreadsheets "just to
be sure," and the system that was supposed to save them time starts costing them more of it.

This isn't a fringe concern. Nonprofit data-management research going into 2026 shows the problem
getting *worse*, not better — data and CRM issues were cited by 33% of surveyed organizations,
more than double the 15% who cited it in 2024 — and incomplete, outdated, or poor-quality data
remains the single leading blocker to organizations becoming genuinely data-driven. The causes are
mundane and universal: CRM migrations that carry duplicates forward, informal data entry with no
governance, systems that don't talk to each other, and — the one this idea targets — no built-in,
ambient signal that tells anyone *which records need attention* before a mailing goes out or a
board report gets pulled.

MJ already generates the majority of the CRUD surface for any app built on it. That's exactly the
leverage point where "every app inherits a data-health signal by default" is possible in a way it
isn't for a hand-rolled system: the framework already knows every entity's fields, types, and
required-ness from metadata, so a generic scoring engine can evaluate rules against *any* entity
without per-app engineering.

## What already exists (and why this doesn't duplicate it)

- **`packages/AI/Vectors/Dupe`** (`duplicateRecordDetector.ts`, `scoring/ReciprocalRankFusion.ts`,
  `reasoning/DuplicateReasoningProvider.ts`) solves **duplicate identity resolution** — is this
  Contact record the same person as that one? That's a hard, ML-assisted, vector-similarity
  problem, and Dupe already does it well. This proposal is explicitly **not** a second dedup
  engine. It solves a different, simpler problem: for a record that is *not* in dispute as to its
  identity, is its data *complete, current, and internally consistent*? Where the two do overlap —
  "this record may have unresolved duplicates" — the Data Health engine **reads Dupe's own findings
  as one input signal** rather than re-implementing similarity detection.
- **Idea 1 from 2026-08-07** (`../2026-08-07/idea-1-relationship-engagement-engine.md`, unshipped,
  still a live candidate) proposes a configurable *Engagement Score* — how connected/active is this
  person. That's a relationship/behavior signal. This proposal's *Data Health Score* is a
  **data-correctness** signal — orthogonal axes ("is this person engaged" vs. "is this record
  trustworthy"). Both could eventually feed a single record-quality panel, but neither requires the
  other, and this proposal introduces no dependency on that unshipped idea.
- **Record Changes / Version History** already tracks *when* a field last changed. This proposal
  reuses `__mj_UpdatedAt` and `RecordChange` history as one of its rule inputs (freshness checks)
  rather than tracking change timestamps a second way.
- **CodeGen's field metadata** (`AllowsNull`, `Type`, value lists, `RegEx`/format hints on
  `EntityField`) already declares most of what a completeness/format rule needs. This proposal
  reads that metadata rather than asking business users to redeclare "this field is required" a
  second time in a separate rules table.

## Proposed architecture

### New entities (`__mj` core schema)

| Entity | Purpose |
|---|---|
| `MJ: Data Quality Rules` | A configurable check: `Name`, `TargetEntityID`, `TargetFieldID` (nullable — null for cross-field/record-level rules), `RuleType` (`Completeness` / `Format` / `Freshness` / `Consistency` / `ExternalReference`), `RuleExpression` (a small declarative payload — a regex for `Format`, a day threshold for `Freshness`, a second-field comparison for `Consistency`), `Severity` (`Info`/`Warning`/`Critical`), `IsActive` |
| `MJ: Data Quality Findings` | One row per record that currently fails a rule: `EntityID`/`RecordID` (CompositeKey-safe, same pattern as `RecordChange`), `RuleID`, `Severity`, `FirstDetectedAt`, `LastConfirmedAt`, `ResolvedAt` (nullable), `Detail` (human-readable, e.g. "Email field is empty") |
| `MJ: Data Quality Scores` | Materialized rollup: `EntityID`/`RecordID`, `Score` (0–100, weighted by rule severity), `CriticalCount`/`WarningCount`/`InfoCount`, `ComputedAt` |

All three are generic across every entity in the system — nothing here is nonprofit-specific;
the *rules a given org enables* are the domain-specific configuration, same as every other
metadata-driven engine in MJ.

### `DataQualityEngine` (new package, `packages/AI/DataQuality`, mirroring the `Vectors/Dupe`
package layout and the `Base` + `Engine` split used throughout MJ)

- `EvaluateEntity(entityName, {ruleFilter?})` — runs all active rules for an entity against its
  current rows via `RunView`, batched (never per-record queries in a loop, per the data-access
  rules), writes/updates `Data Quality Findings`, recomputes `Data Quality Scores`.
- Rule evaluators are a small, deterministic, no-ML-required library — the same "spreadsheet
  formula, not a trained model" philosophy the 2026-08-07 Engagement Score proposal used for the
  same good reason: a small nonprofit can configure and *understand* "flag any Contact with no
  Email and no Phone" without a data scientist. `ExternalReference` is the one extensibility point
  for orgs that *do* want to plug in a paid address-validation/NCOA-style service — MJ ships the
  hook (an Action reference on the rule), not the vendor integration itself.
- Scheduled via a new `DataQualityScheduledJobDriver` in `packages/Scheduling/engine/src/drivers/`,
  following the exact same driver interface as the five existing drivers there
  (`ActionScheduledJobDriver`, `AgentScheduledJobDriver`, `AgentRunSweepScheduledJobDriver`,
  `IntegrationDiscoveryScheduledJobDriver`, `IntegrationSyncScheduledJobDriver`) — no new scheduling
  substrate, just a sixth driver.
- Also runnable synchronously via a `CoreActions` action (`Evaluate Data Quality`) so a workflow or
  agent can request an on-demand check ("check data quality before this mailing runs") without
  waiting for the next scheduled sweep — consistent with the Actions-as-boundary philosophy already
  documented in `packages/Actions/CLAUDE.md`.

### UI (Angular, L1/L2 per the UI layering guide)

- **`ng-data-quality-badge`** — a compact, embeddable score chip (green/amber/red + count) that any
  generated form can host as a tab or header decoration, same dynamic-tab registration mechanism
  used by the 2026-08-07 relationship-graph and decision-timeline proposals. Clicking it expands the
  specific findings for that record with a one-line fix suggestion per finding.
- **Data Health dashboard** (`packages/Angular/Explorer/dashboards`, following the
  `scaffold-mj-dashboard` skill) — org-wide conformance score cards per entity, a trend line (is
  data quality improving or decaying?), a sortable worst-offenders table, and rule-management for
  admins (the same "business users configure it without a deploy" pattern used by the 2026-08-07
  relationship-type editor).
- **Bulk-fix affordance**: findings can link to a registered fix `Action` (e.g., "Standardize Phone
  Format", "Flag for Address Verification") so a data-health finding becomes a one-click, human-
  approved remediation rather than a dead-end report — the same "AI/rule proposes, a human commits"
  posture already established by the accessibility idea's "Explain & suggest a fix."

### Why this belongs in core, not an app

A trade association, a university, a healthcare network, and a SaaS company all lose the same way
to the same failure mode: fields nobody enforced, timestamps nobody watched, formats nobody
validated. The rule *types* (completeness, format, freshness, consistency) are universal; only the
specific rules an org turns on are domain-specific, and that's metadata configuration — exactly the
MJ pattern of "the platform provides the engine, the org supplies the config."

## Phased rollout

1. **Phase 1** — `Data Quality Rules` + `Data Quality Findings` entities, `DataQualityEngine` with
   `Completeness` and `Format` rule types (the two cheapest to compute and highest-value), `Evaluate
   Data Quality` action, `ng-data-quality-badge` read-only viewer.
2. **Phase 2** — `Freshness` and `Consistency` rule types, `Data Quality Scores` materialization,
   `DataQualityScheduledJobDriver`, the Data Health dashboard.
3. **Phase 3** — `ExternalReference` rule type + fix-action linkage for bulk remediation, and a
   read-only integration with Dupe's findings so a record's health panel can surface "possible
   duplicate — unresolved" as one more finding type without re-implementing detection.

## Open questions

- Should `Data Quality Rules` support cross-entity consistency checks (e.g., "this Contact's
  Employer field should resolve to an active Organization record")? Leaning yes for Phase 2+, using
  the existing FK/EntityRelationship metadata to constrain which cross-entity checks are even
  expressible, so the rule authoring UI can't produce a check that doesn't type-check against the
  schema.
- Performance at scale: evaluating `Format`/`Completeness` rules across a 500k-row entity needs
  batched, indexed evaluation (likely via generated SQL predicates rather than row-by-row JS), not
  a naive `RunView` + client-side filter loop — flagged for the architecture-review stage, same
  caveat the 2026-08-07 relationship-graph proposal raised for its own traversal performance.

## Mockup

See [`mockups/data-health-dashboard.html`](./mockups/data-health-dashboard.html) — the Data Health
dashboard showing per-entity conformance scores, a worst-offenders table, and the record-level
health panel as it would appear embedded in a Contact form. Screenshot:
[`screenshots/idea-1-data-health-dashboard.png`](./screenshots/idea-1-data-health-dashboard.png).
