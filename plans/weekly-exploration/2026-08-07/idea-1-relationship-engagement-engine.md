# Idea 1: Relationship Graph & Engagement Signal Engine

**Week of 2026-08-07 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world, not the codebase

Every membership organization, alumni network, professional society, congregation, and donor program runs on relationships — who knows whom, who introduced whom, who's connected to which household or employer, who has quietly drifted away after being a top volunteer for a decade. Today that knowledge lives in staff members' heads, in scattered spreadsheet tabs, or not at all. When a long-tenured membership director leaves, the *relationships* leave with them — not just the row-level data. Small and mid-sized nonprofits and associations can't afford a dedicated CRM data scientist to build "engagement scoring," so they either buy an expensive vertical suite that does it opaquely, or they don't do it at all and quietly lose members and donors nobody noticed were slipping away.

MemberJunction is in a unique position to fix this at the *framework* level rather than the app level: it already knows the full entity graph via metadata, it already has a mature scheduling engine, and it already has a dedup/vector engine that shows the "metadata-driven engine" pattern works well for this kind of problem. This idea gives every app built on MJ two generic primitives — a typed relationship graph and a configurable engagement score — instead of every vertical rebuilding both from scratch.

## What already exists (and why this doesn't duplicate it)

- **Foreign keys / EntityRelationships (CodeGen)** today describe *schema* structure (one-to-many, many-to-many join tables) for UI generation — they are not a *semantic* graph. There's no way to say "these two Contact records are the same household" or "this Contact was referred by that Contact" without a bespoke junction table and bespoke UI per app.
- **`packages/AI/Vectors/Dupe`** solves *duplicate*-record detection — a different problem (is this the same entity twice?) from relationship modeling (how are two distinct entities connected?). This proposal follows the same metadata-driven-engine architectural pattern Dupe established, applied to a different problem.
- **Predictive Studio** (in flight, `plans/predictive-studio*.md`) is a full ML platform — train models, feature engineering, scoring pipelines. It is the right tool when an org wants a *trained* propensity-to-lapse model. This proposal is deliberately **not** that: it's a deterministic, no-training-required, business-user-configurable point system, the same way a spreadsheet formula is a lighter tool than a regression model. Critically, an Engagement Score computed by this engine becomes a *candidate feature column* Predictive Studio can consume later — the two are complementary, not competing.
- **Query & Entity Materialization** (in flight, `plans/query-entity-materialization.md`) provides the generic "materialize a computed value on a schedule" substrate. This proposal reuses that substrate for score refresh rather than reinventing scheduling/refresh semantics.
- **Unified Permissions** (in flight) governs *who can see* a record. This proposal does not touch permissions — relationship edges and scores inherit the permission model of the records they connect.

## Proposed architecture

### New entities (schema, `__mj` core schema)

| Entity | Purpose |
|---|---|
| `MJ: Relationship Types` | Declares an edge type: Name (e.g. "Household Member", "Employer", "Board Seat", "Referred By", "Mentor"), Symmetric (bool), InverseTypeID (self-FK, e.g. "Employer" ↔ "Employee Of"), AllowedFromEntityID / AllowedToEntityID (nullable — null means "any entity"), CardinalityConstraint (One-to-One / One-to-Many / Many-to-Many) |
| `MJ: Entity Relationships` | An edge instance: FromEntityID + FromRecordID (CompositeKey-safe), ToEntityID + ToRecordID, RelationshipTypeID, Strength (0–100, optional), Status (Active/Ended/Proposed), StartDate/EndDate, Source (Manual/Imported/AI-Inferred), ProvenanceNote |
| `MJ: Engagement Signal Definitions` | A configurable point source: Name, TargetEntityID (which entity gets scored), SourceQueryID or SourceViewID (what to count — reuses existing Query/View infrastructure), Weight, DecayHalfLifeDays (nullable — recent activity counts more), Category (e.g. "Participation", "Giving", "Communication") |
| `MJ: Engagement Scores` | Materialized output: EntityID/RecordID, CompositeScore, CategoryBreakdown (JSON), ComputedAt, TrendDirection (computed vs. prior run) |

### Engines

- **`RelationshipGraphEngine`** (new package `packages/Core/Relationships`, following the `Base` + `Engine` split used throughout MJ) — CRUD over `Entity Relationships` with type-constraint validation, plus a traversal API: `GetNeighbors(entity, record, {typeFilter, maxHops})`, `FindPath(fromRecord, toRecord, maxHops)` for "who connects A and B" queries (e.g., "does anyone on our board know this prospective major donor?").
- **`EngagementScoringEngine`** (new package `packages/AI/EngagementScoring`, mirroring the Vectors/Dupe package layout) — reads active `Engagement Signal Definitions` for an entity, runs each source query, applies weight + time decay, writes `Engagement Scores`. Scheduled via the existing `ScheduledJobEngine` (same refresh-cadence pattern as Query Materialization) — no new scheduling substrate needed.

### UI (Angular, generic — L1/L2 per the UI layering guide)

- **`ng-relationship-graph`** (`packages/Angular/Generic/relationship-graph`) — a force-directed graph panel, reusing the D3 force-layout approach already proven in `packages/Angular/Generic/entity-relationship-diagram`, but rendering *semantic* edges with type-colored links and a hop-depth slider. Embeddable as a form tab on **any** entity via the existing dynamic-form-tab registration mechanism — no per-entity custom code required.
- **`ng-engagement-widget`** — a compact score gauge + category sparkline + "what's driving this score" breakdown, also embeddable on any entity form.
- A relationship-type editor lives under **Admin → Entity Admin** (parallel to how Entity Fields are administered today) so business users define edge types and signal weights without a deploy.

### Why this belongs in core, not an app

Nothing above is nonprofit-specific. A B2B software company could use the same relationship types for "Champion", "Economic Buyer", "Renewal Risk"; a healthcare network could use it for "Referring Physician"; a university could use it for "Advisor". The engine is generic; only the *metadata* (relationship type names, signal definitions) is domain-specific, and that metadata is configured by the app builder — exactly the MJ philosophy of "define your schema, MJ generates the rest."

## Phased rollout

1. **Phase 1** — `Relationship Types` + `Entity Relationships` entities, `RelationshipGraphEngine` CRUD + traversal, `ng-relationship-graph` read-only viewer.
2. **Phase 2** — `Engagement Signal Definitions` + `Engagement Scores`, `EngagementScoringEngine` wired to `ScheduledJobEngine`, `ng-engagement-widget`.
3. **Phase 3** — AI-assisted relationship inference (an agent that proposes likely edges from co-occurrence in views/communications, always landing in `Status = Proposed` for human confirmation — never auto-committed) and "path finding" UI ("introduce me" tool for development/major-gift officers).

## Open questions

- Should relationship edges be soft-deletable/versioned through the existing Record Changes system, or does the temporal Start/End-date pair suffice? (Leaning: reuse Record Changes, avoid a parallel audit mechanism.)
- Graph traversal performance at scale (a 200k-member association) needs a benchmark before Phase 1 ships — likely requires a recursive CTE or a dedicated graph index strategy; flagged for the architecture-review stage, not blocking the design.

## Mockup

See [`mockups/relationship-engagement-graph.html`](./mockups/relationship-engagement-graph.html) — a "Constituent 360" record-detail view showing the relationship graph panel and engagement widget as they'd appear embedded in a Contact form tab. Screenshot: [`screenshots/idea-1-relationship-engagement-graph.png`](./screenshots/idea-1-relationship-engagement-graph.png).
