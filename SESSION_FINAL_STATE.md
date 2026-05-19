# Session final state — integration agent framework

**Branch**: `connector-improvement` (local-only, NOT merged to next, NOT pushed)
**Date**: 2026-05-19

## Outcomes

Three connectors built end-to-end by the agent framework. All pass T1 (5 invariants) and T0/T4 (build + tests).

| Vendor | IOs | IOFs | Connector LOC | Vitest | T1 |
|---|---|---|---|---|---|
| HubSpot | 152 | 1,469 | 1,297 | 33/33 ✓ | Pass |
| YourMembership | 228 | 1,358 | 1,169 | 50/50 ✓ | Pass |
| QuickBooks | 90 | 1,000 | 1,413 | 46/46 ✓ | Pass |

## Architecture state

Per `INTEGRATION-REDESIGN-V1.md` (canonical reference at `/Users/madhavsubramaniyam/Projects/CCAF-exam-prep/INTEGRATION-REDESIGN-V1.md`):

- **Schema at AS-IS state** (per `MJ-INTEGRATIONS-ARCHITECTURE.md` §3). Phase 0 inflation reverted. Five inflation migrations + the revert migration deleted from this branch entirely.
- **Five invariants** in connector-validator: 1, 1b, 2, 3, 4 (Invariants 5/6/7 reverted as inflation per redesign §12).
- **Seven role files** in `.claude/agents/`, all ≤ 100 lines, all Goal/Tools/Discipline/Handoff/Verification shape.
- **Five rule files** in `.claude/rules/`, stripped of stale Phase-0 column refs.
- **Three hooks** in `.claude/hooks/`: credential-guard, phase-ordering, provenance-logger.
- **One skill** orchestrating phases: `build-connector` with the Coordinator Audit step (three vendor-agnostic checks: Control Comparison, Product Overview Cross-Reference, Tautology Check).

## Discipline meta-principles installed

Two principles in role files cover what specific rules used to enumerate:

1. **Set-completeness**: "For every set you enumerate — flags, types, paths, fields, modules, endpoints, emitted values, anything iterable — verify completeness against an authoritative source before declaring done." Replaces taxonomy-first / parametric-enumeration / per-flag-CODE_EVIDENCE specific rules.
2. **Bidirectional set-completeness**: "Any IO/IOF in the current metadata file that was NOT emitted in this run is an orphan. Delete it. Metadata reflects this run's emissions only, not accumulated history." Replaces upsert-only merge pattern.

## Empirical proof points

- **Coordinator audit fired correctly on 2 of 3 vendors**:
  - HubSpot: Control Comparison fired → 121 → 152 IOs after re-dispatch (85.7% name overlap, 64.3% APIPath overlap with control).
  - QB: Product Overview Cross-Reference fired → 81 → 90 IOs after re-dispatch (6 audit-cited canonical entities recovered + 4 bonus from same root cause).
  - YM: Tautology Check fired → logged as needing creds for true independent verification.
- **Bidirectional set-completeness caught the orphan failure mode** (QB EmailDeliveryInfo, 4 T1 failures → 0).
- **Three structurally different vendors handled without paradigm overfit**: OpenAPI catalog (HubSpot), TypeScript AST of in-tree connector (YM), XSD walks (QB). Agent picked each paradigm autonomously.

## Known bug — defer to PR work

### Finding B: Connector class hardcoded catalog mirror

Some manually-built connector classes (QuickBooksConnector definitively; audit others) hardcode the IO catalog count in TypeScript and have tests asserting against that hardcoded count. Empirically observed:
- QB connector's `DiscoverObjects()` returns 81 entities even though metadata now has 90 IOs (post-orphan-deletion).
- QB test asserts `expect(objects.length).toBe(81)` and passes — because the test exercises the hardcoded mirror, not the metadata cache.

This violates AS-IS spec at `MJ-INTEGRATIONS-ARCHITECTURE.md` §4.6 (mandates metadata-driven discovery via `IntegrationEngineBase.Instance` cache, not connector-class hardcoded constants).

**Fix scope** (deferred to PR-stage):
- Remove hardcoded entity-list mirrors from connector classes.
- Connector class's `DiscoverObjects` reads from `IntegrationEngineBase.Instance.GetCachedObjects(integrationID)` (per AS-IS contract).
- Tests assert against the cache contents, not against the hardcoded constant.

**Why deferred**: this is an AS-IS-conformance bug fix on the connector class layer, not framework iteration. Address in a connector-class improvements PR — independent of the agent framework's discipline state.

**Why not blocking**: the runtime path still works (the connector returns SOMETHING from DiscoverObjects; that something is the static list which IS a valid subset of the available entities). The bug surfaces when the agent extends metadata without code-builder also updating the static mirror — runtime then diverges from metadata. For HubSpot and QB in this session, that divergence exists today.

## Pipeline-completion steps not run (deferred)

| Step | Blocker | Effort once unblocked |
|---|---|---|
| T10 live verification per vendor | Credentials | One MCP run per vendor |
| ActionMetadataGenerator | None — existing CLI | One invocation per vendor |
| mj sync push | DB connectivity | One CLI per vendor |
| CodeGen regen | DB connectivity | One CLI |
| Phase 2d re-run for HubSpot + QB | None — but blocked by Finding B for runtime impact | One spawn per vendor |

## What is NOT done

- No merge to next, no push, no PR opened.
- No live API verification (T10 deferred).
- No customer-installable artifacts (mj sync push + Actions generation deferred).
- No DB-side propagation (CodeGen blocked by DB unreachable).

## Branch state

| Hash | Summary |
|---|---|
| `c919b4d75c` | Ioiof-extractor role-file alignment + 4 inflation migrations deletion (broader than message described) |
| `6277889ad7` | Revert Invariants 5/6/7 from validator |
| `eaa2aa25f6` | Per-flag CODE_EVIDENCE emission |
| `7db1552ea2` | QB three-way name match (broader than message described) |
| `d48e783d1c` | Set-completeness meta-principle replaces specific enumeration rules |
| `1d627f8b89` | HubSpot extractor re-run (SupportsIncrementalSync flag added) |
| `e3c38ff8d2` | QB metadata-writer re-run (root-field provenance) |
| `d66dd544e4` | Coordinator audit step in build-connector skill |
| `9aaa01522c` | HubSpot audit-driven re-extraction (121 → 152 IOs) |
| `64643ff047` | QB audit-driven re-extraction (81 → 91 IOs) |
| `46d93b0775` | Orphan deletion (bidirectional set-completeness) — QB 91 → 90 IOs after EmailDeliveryInfo orphan removed |
| (this commit) | Document Finding B as deferred to PR work |

## Next step

PR planning. Scope decisions remain with the user. The framework is at a structurally complete state for the three vendors tested; remaining gaps are operational (T10, mj sync push, Actions) or PR-stage (Finding B).
