# Idea 1: Federated Hierarchy & Roll-Up Governance Layer

**Week of 2026-09-05 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world, not the codebase

A national trade association has 46 state chapters. A university has a central alumni office and
120 school/department affiliate groups. A denomination has a national body and thousands of
congregations. A healthcare association has a national accrediting body and regional affiliates
that run their own events and dues. In every one of these federated structures, the same quiet
failure repeats: the national office cannot see what's happening in the chapters without begging
for a spreadsheet export, chapters can't get a consistent membership list or brand template
without emailing national and waiting, and nobody can answer "how many members do we have,
total, right now" without someone manually reconciling 46 different answers. Local volunteer
boards — who rotate every year or two — end up rebuilding the same reporting process from
scratch, because their new chapter database has no idea it's part of anything bigger than itself.

This is not a hypothetical: association-management research going into 2026 is explicit that
**data infrastructure, not appetite, is what's missing** for federated organizations — "most
federated organisations don't have the data infrastructure to support data-driven governance,
with data scattered across chapter spreadsheets and national office filing cabinets — not
aggregated, not current, and not accessible." The commercial response has been to build entire
separate product tiers for this ("multi-chapter federations," "enterprise" AMS editions) rather
than treating federation as a property every organization's data model could have for free. That's
the gap MJ is unusually positioned to close: it already ships a **generic self-referencing
hierarchy primitive** at the entity level, and per-entity metadata that already knows every field,
permission, and form definition. What's missing is the governance layer that turns "records can
point to a parent record" into "a national body can safely delegate operational data ownership to
46 chapters while still getting one consolidated, trustworthy picture."

## What already exists (and why this doesn't duplicate it)

- **`BaseEntity` hierarchy support** (`packages/MJCore/src/generic/baseEntity.ts`,
  `packages/MJCore/src/__tests__/baseEntity.hierarchy.test.ts`) already gives any self-referencing
  entity `GetDescendants()`/`GetAncestors()`, and SQL Server CodeGen already emits a
  table-valued-function-backed hierarchy view for it
  (`packages/CodeGenLib/src/Database/providers/sqlserver/SQLServerCodeGenProvider.ts`). **This
  proposal does not reinvent tree structure.** It is the governance layer that sits *on top of*
  any entity an app builder has already marked as hierarchical — Organizations, Chapters,
  Departments, Regions, whatever domain-specific entity the hierarchy lives on — adding
  permission cascade, config inheritance-with-override, and roll-up aggregation, none of which
  the existing primitive provides today.
- **`mj-hierarchy-tree`** (flagged in open issue #3997 for an unrelated SVG-layout bug) is already
  the generic UI component for rendering any such tree. This proposal's admin UI reuses that
  component; it does not introduce a second tree-rendering widget.
- **Unified Permissions** (`plans/unified-permissions-architecture.md`, Phase 1 shipped, Phase 2 in
  flight) is building the canonical `IPermissionProvider` interface and a single "what can User X
  do" query API. This proposal's permission cascade is designed as **one more permission provider**
  registered with that engine (a `HierarchyCascadePermissionProvider`) — it does not introduce a
  13th standalone permission subsystem, which the Unified Permissions doc explicitly diagnoses as
  the core problem with the status quo.
- **Query & Entity Materialization** (`plans/query-entity-materialization*.md`, in flight) is the
  generic "compute and cache a value on a schedule" substrate. Roll-up aggregates (e.g., "total
  active members across all descendant chapters") are implemented as materializations that consume
  this proposal's hierarchy metadata, not a bespoke aggregation engine.
- **`RunView`/`RunViews` with `CompositeKey`** already scope queries to a single entity's rows.
  This proposal's roll-up queries are ordinary `RunView` calls with a `WHERE EntityID IN (self +
  descendants)` predicate generated from the hierarchy — no new query surface.

## Proposed architecture

### New entities (`__mj` core schema)

| Entity | Purpose |
|---|---|
| `MJ: Hierarchy Configurations` | Declares that a given entity participates in federated governance: `EntityID`, `ParentFieldName` (the existing self-referencing FK CodeGen already knows about), `RollUpEnabled`, `CascadePermissionsEnabled`, `ConfigInheritanceEnabled` |
| `MJ: Hierarchy Overrides` | Per-node exceptions: `EntityID`/`RecordID` (CompositeKey-safe, the same pattern `RecordChange` uses), `SettingKey` (e.g., `BrandTheme`, `DuesSchedule`, `DefaultCommunicationProvider`), `OverrideValue` (JSON), `InheritedFromParent` (computed, not stored — read-through resolution, never a stale copy) |
| `MJ: Roll-Up Definitions` | A configurable aggregate: `Name`, `TargetEntityID`, `SourceQueryID` or `SourceViewID` (reuses existing Query/View infrastructure, same pattern the 2026-08-07 Engagement Signal Definitions used), `AggregationType` (`Sum`/`Count`/`Avg`/`Max`/`Min`), `Scope` (`SelfAndDescendants` / `DescendantsOnly` / `DirectChildrenOnly`) |

Three small tables. The tree itself is **not** duplicated — `Hierarchy Configurations` points at
whatever self-referencing entity the app builder already has; these tables answer three questions
the existing primitive can't: *what's configurable per node, what's inherited vs. overridden, and
what rolls up to which ancestor.*

### `FederationGovernanceEngine` (new package, `packages/Core/Federation`, `Base` + `Engine` split)

- `ResolveSetting(entityName, recordId, settingKey)` — read-through resolution: checks
  `Hierarchy Overrides` for the record itself, then walks `GetAncestors()` (the existing primitive)
  until it finds a value or reaches the root, then falls back to the `Hierarchy Configurations`
  default. Cached per the standard `BaseEngine` pattern, since this is a hot per-request lookup
  path exactly like `LocalizationEngine.Resolve()` from the 2026-08-29 exploration.
- `ComputeRollUp(rollUpDefinitionId, recordId)` — resolves the scoped descendant set via
  `GetDescendants()`, runs the definition's source query/view against that set, applies the
  aggregation. Wired into the existing Query & Entity Materialization substrate for scheduled
  refresh rather than a bespoke scheduler — a roll-up definition *is* a materialization whose input
  set is computed from hierarchy, not hand-declared.
- `HierarchyCascadePermissionProvider` — registers with the Unified Permissions engine (Phase 2)
  so "can User X read/edit records under Chapter Y" is answerable by walking the same hierarchy,
  rather than requiring a chapter admin to hand-grant permissions node-by-node. Falls back to
  today's existing Entity Permissions/RLS behavior unchanged for any entity that never opts into
  `CascadePermissionsEnabled` — **zero behavior change for every deployment that doesn't
  configure federation**, the same "off-by-default, latent capability" shape every prior week's
  CodeGen-adjacent proposal has used.
- **Explicit non-goal**: this is not a data-residency or separate-database multi-tenancy feature —
  that's `plans/multi-database-skyway-support.md`'s territory (physically separate databases per
  tenant). Federation here is entirely **within one MJ instance's metadata and data model**: one
  database, one schema, records that point at each other and a governance layer that understands
  the resulting tree. An org that needs actual data-residency separation between chapters is a
  different, larger problem this proposal does not attempt to solve.

### UI (Angular, L1/L2 per the UI layering guide)

- **Federation & Chapters dashboard** (`packages/Angular/Explorer/dashboards`, `scaffold-mj-dashboard`
  pattern) — the existing `mj-hierarchy-tree` component as the primary nav, a node detail panel
  showing resolved settings (inherited vs. overridden, with a one-click "reset to inherited"), and
  a roll-up summary card row (configurable per deployment) at every non-leaf node.
- **Override editor** — inline on the node detail panel: any `Hierarchy Configurations`-enabled
  setting shows its inherited value greyed out with an "Override for this chapter" toggle, so a
  chapter admin's override is always visually distinguishable from the inherited default — never a
  silent divergence nobody can explain later.
- A relationship to this week's sibling ideas is deliberate but not load-bearing: a suppressed
  constituent (Idea 2) or an access-anomaly alert (Idea 3) at a chapter record is still just a
  record under this hierarchy — federation governs *which chapter owns and sees what*, not *how
  that chapter's data is kept safe*, which is what Ideas 2 and 3 add independently.

### Why this belongs in core, not an app

A trade association's chapters, a university's schools, a healthcare network's regional
affiliates, and a denomination's congregations are all the same shape: autonomous local units that
share a common parent, need some settings to cascade and others to diverge, and need the parent to
see a trustworthy consolidated picture without begging for exports. The mechanism (read-through
setting resolution over an existing hierarchy primitive, a roll-up aggregate reusing existing
Query/Materialization infrastructure, a permission provider that plugs into Unified Permissions) is
completely domain-agnostic. Only *which entity is the hierarchy*, *which settings cascade*, and
*which roll-ups matter* are per-deployment configuration — exactly the MJ pattern already proven by
every other metadata-driven engine in the codebase.

## Phased rollout

1. **Phase 1** — `Hierarchy Configurations` + `Hierarchy Overrides` entities,
   `FederationGovernanceEngine.ResolveSetting()`, the override editor UI. No roll-ups, no
   permission cascade yet — read-through config inheritance alone is independently valuable (a
   chapter inherits national branding/dues defaults, can override either).
2. **Phase 2** — `Roll-Up Definitions` + `ComputeRollUp()` wired to Query & Entity Materialization,
   the Federation & Chapters dashboard with roll-up summary cards.
3. **Phase 3** — `HierarchyCascadePermissionProvider` registered with Unified Permissions Phase 2,
   once that engine's provider interface has landed — sequenced deliberately after it so this
   doesn't become permission subsystem #13 while that consolidation is still in flight.

## Open questions

- Should an override at a chapter ever cascade *further down* (a chapter with sub-districts)? The
  read-through walk via `GetAncestors()` already handles arbitrary depth for free, so the answer is
  almost certainly yes with no extra design — flagged to confirm during implementation rather than
  a real open question.
- Roll-up performance at scale (a national body with 200k members across 46 chapters) needs the
  same batched/indexed evaluation caveat the 2026-08-29 Data Health proposal raised for its own
  rule engine — a naive per-chapter query loop will not scale; the materialization substrate this
  reuses already has to solve that problem generally, so this proposal inherits whatever answer
  lands there rather than solving it twice.
- Does `CascadePermissionsEnabled` need a "chapter can see its own descendants but never its
  siblings" default, or should that be one more configurable `Scope` value on the permission
  provider itself (mirroring `Roll-Up Definitions.Scope`)? Leaning toward the latter for
  consistency, deferred to the Phase 3 design.

## Mockup

See [`mockups/federation-governance-dashboard.html`](./mockups/federation-governance-dashboard.html)
— the Federation & Chapters dashboard showing the hierarchy tree, a chapter's resolved-vs-overridden
settings panel, and roll-up summary cards at the national root. Screenshot:
[`screenshots/idea-1-federation-governance-dashboard.png`](./screenshots/idea-1-federation-governance-dashboard.png).

## Sources

- ["The State of Chapter Management in 2026"](https://tidyhq.com/blog/state-of-chapter-management-2026) —
  federated organizations' data-infrastructure gap.
- [Momentive Software, "Best Association Management Software in 2026"](https://momentivesoftware.com/blog/best-association-management-software/) ·
  [i4a, "20 Best Association Management Software Options 2026"](https://www.i4a.com/best-association-management-software/) ·
  [Members Village, "Enterprise Association Software for Multi-Chapter Federations"](https://membersvillage.com/nation-builder) —
  multi-chapter support treated as a separate enterprise/premium product tier across the current
  AMS market, rather than a property every deployment gets by default.
