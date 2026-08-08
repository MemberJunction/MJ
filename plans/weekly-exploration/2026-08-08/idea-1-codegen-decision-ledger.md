# Idea 1: CodeGen Decision Ledger — and Closing the IS-A Name-Field Gap

**Week of 2026-08-08 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world, not the codebase

Every organization that builds on MemberJunction trusts CodeGen to look at their database and correctly infer things a person would otherwise have to configure by hand — which column is the "name" of a record, which fields are searchable, what an identifier should be quoted as on a given database engine. That inference is a gift when it's right and invisible when it's right, which is most of the time. The cost shows up only when it's *wrong*, and it shows up in the worst possible place: production, during a write, for a nonprofit's grant officer or a university registrar mid-task, with a cryptic SQL error that has nothing to do with what they were doing. Two installs of the exact same open-source app — one a fresh deploy, one a database that's been running for two years — can end up with silently different ideas of what an entity's display name is, and nothing in the system today can tell an operator that this happened, when, or why. For a small nonprofit IT team with no DBA on staff, that's not a bug report, it's an unreproducible mystery.

MJ's code-generation layer is exactly the kind of high-leverage, low-visibility system where a *generic* fix — auditable decisions, not smarter guessing — helps every app built on the framework, forever, for free on every future `mj codegen` run.

## What already exists (and why this isn't starting from zero)

This is worth stating precisely, because the situation is more specific than "CodeGen's naming heuristic is non-deterministic":

- `packages/CodeGenLib/src/Database/manage-metadata.ts` already contains a **deterministic three-tier winner-selection algorithm** (`selectNameFieldWinner`, ~line 6920) that was written specifically to fix an earlier, worse incident (the function's own doc comment narrates it: 57 core entities ending up with 2–4 `IsNameField=1` rows simultaneously, `Conversation Details` flipping between `Message` and `Role` across runs). The tiers are **Stability** (an already-flagged, still-eligible field never drifts), **Repair** (multiple flagged — prefer literal `Name`, else lowest `Sequence`), and **Fresh pick** (nothing flagged — take the LLM's top-ranked candidate). This is good, working code, not a gap to be filled from scratch.
- The eligibility guardrail underneath it, `isFieldEligibleForNameField` (~line 6954), is a pure, non-AI filter: bounded text, not a PK, and — this is the load-bearing detail — **never a virtual field**, unconditionally.
- **That unconditional exclusion is the actual, still-open bug.** Issue #3551 traces the exact mechanism: an IS-A (table-per-type) child entity mirrors its parent's `Name` column as a *virtual* field — the semantically correct, and often only sensible, display value for that entity. `isFieldEligibleForNameField` rejects it categorically, so it can never be the Stability-tier winner, never a Repair candidate, never a Fresh-pick candidate. If anything ever un-flags it, no rule in the system can re-flag it, and the entity is permanently left with zero name fields — an outcome the function's own tiering was explicitly designed to prevent, defeated by a filter one layer below it.
- Issue #3608 documents the companion observability gap in the same code path: when the `AICircuitOpen` guard silently skips `ag.identifyFields()` for an entire run (credential or vendor failure), and when the Fresh-pick tier does fire and pick something, **neither event is logged anywhere.** An operator looking at two divergent databases has no artifact that says which tier fired, what it chose, or whether the LLM ran at all — "CodeGen analyzed and concluded X" and "CodeGen never asked" are indistinguishable after the fact, and there is currently no way to reconcile two already-diverged installs short of a live debugging session (which is how #3608 was found — during an incident, not before one).

This proposal is not "add determinism to CodeGen." It's: **(1) close the one specific, narrow eligibility gap that produces the worst outcome (zero name fields) on a well-understood entity shape (IS-A children), and (2) give the tiering algorithm that already exists a permanent, queryable memory, so the next divergence is a five-minute diff instead of a live incident.**

- **Query & Entity Materialization** (in flight) and **Unified Permissions** (in flight) are unrelated layers — this proposal touches CodeGen's own metadata-generation decisions, not runtime query execution or access control.
- **`plans/codegen-large-schema-improvements.md`** (in flight) addresses CodeGen's wall-clock performance and resilience at scale (2,000+ table schemas) — a different axis (speed/scale) from this proposal's axis (correctness/auditability of the decisions CodeGen makes along the way). Complementary, not overlapping.
- Not duplicated by anything in `/plans` — confirmed by a direct search of the CodeGen- and metadata-related plan docs.

## Proposed architecture

### 1. The eligibility fix (small, targeted)

Give `isFieldEligibleForNameField` a narrow carve-out: a virtual field is eligible **only** when it is the declared IS-A mirror of a name-eligible column on its parent entity (i.e., CodeGen already knows the provenance of every virtual field it creates via `additionalSchemaInfo.ISARelationships` — this is metadata CodeGen already has in hand, not new inference). Every other virtual field stays ineligible, exactly as today. This alone fixes #3551 without weakening the guardrail for the cases it correctly protects.

### 2. `MJ: CodeGen Decision Log` (new entity, `__mj` core schema)

| Field | Purpose |
|---|---|
| `RunID` | Groups every decision emitted by one `mj codegen` invocation |
| `EntityID` | Which entity the decision concerns |
| `DecisionType` | FK to `MJ: CodeGen Decision Types` — starts with `NameFieldSelection`, extensible later to `SearchFieldFlags`, `PostgresIdentifierQuoting` (#3604 is the same silent-heuristic-decision pattern applied to keyword quoting), etc. |
| `Tier` | `Stability` \| `Repair` \| `FreshPick` \| `SkippedCircuitOpen` \| `SkippedNoCandidate` |
| `PreviousValue` / `NewValue` | e.g. the field that lost/gained `IsNameField` |
| `Source` | `Deterministic` \| `LLM` \| `UserPinned` |
| `Confidence` | Nullable — populated only when `Source = LLM`, straight from `ag.identifyFields()`'s ranking |
| `OccurredAt` | Timestamp |

Written by `applyNameFieldUpdates` and `processEntityAdvancedGeneration` as one extra `INSERT` alongside the SQL they already batch per entity — no new execution path, just a new row emitted where a decision is already being made.

### 3. CLI + Admin surfaces

- **CLI**: `mj codegen` prints one summary line per run — *"312 entities analyzed · 4 fresh-picks · 1 skipped (AI circuit open) · 0 left with no name field"* — turning defect 2 from #3608 (silent skip) into something that would have been impossible to miss.
- **Admin UI — "CodeGen Run Report"** (`packages/Angular/Explorer/dashboards`, new dashboard): browse decisions by run or by entity; the killer feature is a **two-environment diff** — paste or select two `RunID`s (or two exported logs, one per database) and see exactly which entities disagree and which tier produced each side's answer. This directly answers the question #3608 shows nobody could currently answer: *why do these two "identical" databases disagree?*

### Why this belongs in core, not an app

CodeGen is the one piece of MJ every single app depends on identically, regardless of domain — an alumni-network app, a healthcare-referral app, and a B2B SaaS app all run the exact same `manage-metadata.ts` code path. A decision-ledger fix here is inherited by every app that re-runs CodeGen, at zero cost to the app builder, the same leverage the accessibility-by-default work (last week's Idea 3, now in flight as PR #3609) already established for a different CodeGen choke point.

## Phased rollout

1. **Phase 1** — The `isFieldEligibleForNameField` IS-A carve-out (fixes #3551 directly), plus the "log when Fresh-pick or a skip fires" half of #3608 as plain structured log lines (no new entity yet — the cheapest version of "not silent" ships first).
2. **Phase 2** — `MJ: CodeGen Decision Log` entity + `MJ: CodeGen Decision Types`, wired into `applyNameFieldUpdates`/`processEntityAdvancedGeneration`, CLI run-summary line.
3. **Phase 3** — "CodeGen Run Report" dashboard with the two-environment diff view; extend `DecisionType` coverage to `SearchFieldFlags`/`DefaultInView`/`IncludeInUserSearchAPI` (the sibling fields #3551 flags as needing the same "never clear without replacing" guard) and to `PostgresIdentifierQuoting` (#3604).

## Open questions

- Should "no eligible candidate" become sticky (per #3608's suggestion), so an entity doesn't oscillate between having and not having a name field run-to-run? Leaning yes, as a fourth tier (`Sticky-None`) — but it needs a way for a human to force a re-evaluation once a schema legitimately changes, so it doesn't get permanently stuck the way the *opposite* problem (Stability tier) currently can.
- The Decision Log should probably itself be exportable/comparable across repos, not just within one database's history — worth scoping in Phase 3 whether the diff view needs to read a log file shipped alongside a captured migration, not just two live databases.

## Mockup

See [`mockups/codegen-decision-ledger.html`](./mockups/codegen-decision-ledger.html) — the "CodeGen Run Report" dashboard, showing a two-environment decision diff for the exact `AssessmentSession`-style entity described in #3608. Screenshot: [`screenshots/idea-1-codegen-decision-ledger.png`](./screenshots/idea-1-codegen-decision-ledger.png).
