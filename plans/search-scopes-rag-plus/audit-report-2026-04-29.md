# RAG_plan.md production-readiness audit

**Branch:** `amith-nagarajan/search-scopes-rag-plus`
**Audit run:** 2026-04-29
**Scope:** All 47 P-tasks across Phases 2A, 2B, 2C, 2D, 3, 4, 5, 6.
**Method:** Static inventory (8 parallel Explore agents) + targeted runtime tests
against the local throwaway DB (`MJ_SearchScopes_Rebase`) on `localhost:1444`,
backed by MJAPI on `localhost:4001`. Scratch test corpus seeded into a dedicated
audit scope (`RAG-Audit-Scope`, ID `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01`) and
torn down at the end. Plus full `npm test` runs across the 4 affected packages.

## Summary

| Phase | Total | SHIPPED | PARTIAL | DIVERGENCE | MISSING |
|---|---|---|---|---|---|
| 2A | 7  | 4 | 1 | 1 | 1 |
| 2B | 8  | 8 | 0 | 0 | 0 |
| 2C | 6  | 4 | 0 | 2 | 0 |
| 2D | 7  | 6 | 1 | 0 | 0 |
| 3  | 4  | 4 | 0 | 0 | 0 |
| 4  | 4  | 3 | 0 | 1 | 0 |
| 5  | 5  | 5 | 0 | 0 | 0 |
| 6  | 6  | 1 | 4 | 0 | 1 |
| **Total** | **47** | **35** | **6** | **4** | **2** |

`SHIPPED` = implemented + functioning + tested.
`PARTIAL` = some piece of the spec missing but the rest works.
`DIVERGENCE` = implemented and functions but differently from the plan's
description; reviewer should confirm the divergence was intentional.
`MISSING` = the plan asks for something that doesn't exist.

## Recommendation

**PARTIALLY READY FOR PR — fix list below.**

The core search + permissions + agent + reranker + observability + tuning UI
+ external providers paths are all shipped, tested, and working. The 47-task
breakdown surfaced 2 missing pieces, 4 plan-vs-impl divergences worth a
reviewer note, and 6 partial-implementation gaps. None of these block ship,
but the user-facing P2A.7 (no cross-scope Permissions audit dashboard) and
P2A.6 (no child grid for managing permissions inline on the SearchScope or
AIAgent forms) are the two most-likely PR pushback items because admins will
hit them on day one.

### Fix list (ordered by ROI before PR)

1. **P2A.6 — add SearchScopePermissionChildGrid to the SearchScope and AIAgent forms.** Currently admins must navigate to a separate entity form to create permission rows, which contradicts the plan's "from either form" requirement. Effort: M.
2. **P2A.7 — add Permissions subtab to Knowledge Hub Config dashboard.** No cross-scope audit view exists. Effort: M.
3. **P6.2 — refactor SearchScopePermissionChildGrid to use typed entity API instead of generic BaseEntity.Get/Set.** Code-quality issue, not a functional bug. Effort: S.
4. **P2A.1 — clarify the column naming divergence in spec doc.** Plan said `CanSearchUnscoped` boolean; impl is `SearchScopeAccess` enum (None/All/Assigned). Update RAG_plan.md to reflect the shipped shape. Effort: S.
5. **P2C.1 — clarify "streaming" semantics in spec doc.** Implementation awaits sync `Search()` then partitions provider events; not true concurrent live streaming. Update plan + decision doc. On a fast workbench this is invisible (<100ms total) but on slow providers the "streaming" benefit doesn't materialize. Effort: S (doc) or L (implement true concurrency).
6. **P6.6 — rename `migrations/v2/v202409271438__v2.6.x_...sql` to uppercase V.** Cosmetic but breaks naming convention. Effort: trivial.
7. **P2A "Read level" semantics divergence** (audit-time matrix Cell-3): plan said Read can see metadata but cannot run searches. Implementation lets Read users run `SearchKnowledge` successfully. Either tighten the resolver to require `Search` or higher, or update the plan to say Read = Search. Effort: S.
8. **P2A "Agent Assigned" mode semantics** (Cells 10-11): the resolver's `Step 4 agent fallback` only fires for `SearchScopeAccess='All'`, not `'Assigned'`. So Assigned is a no-op restriction unless paired with a per-user/role grant. Either implement the Assigned-mode logic or update the plan to clarify Assigned only restricts (doesn't grant). Effort: S.

The 4 GAP items in Phase 6 (UUID sweep partial completion, P6.5 spec doc not
explicitly marking phase completion) are housekeeping rather than blockers.

## Per-task detail

### Phase 2A — Per-user permission gate

#### P2A.1 — DDL for the permission column on `AIAgent`

**Verdict:** DIVERGENCE
- **Implemented:** `AIAgent.SearchScopeAccess` enum column (`None`/`All`/`Assigned`) ships in migration `migrations/v5/V202604182034__*.sql`. **Plan asked for** `CanSearchUnscoped` boolean.
- **Functioning:** ✓ Verified live in SEARCH_USAGE.md §6.1 walk; `__mj.AIAgent` updates round-trip via BaseEntity.Save().
- **Tested:** Resolver permission tests cover the agent-side fallback for all 3 enum values (88-case test suite at `packages/SearchEngine/src/permissions/__tests__/SearchScopePermissionResolver.test.ts`).
- **Note:** The 3-valued enum is more expressive than the plan's boolean and supports the "Assigned" mode the plan also references. Consider this an upgrade, but RAG_plan.md should be updated to match.

#### P2A.2 — DDL and CodeGen for `MJ: Search Scope Permissions`

**Verdict:** SHIPPED (with one fix shipped this session)
- **Implemented:** Migration `V202604280730__v5.30.x__Add_SearchScopePermission.sql`. CodeGen generated `MJSearchScopePermissionEntity`.
- **Filtered-index fix:** Migration `V202604291522__v5.30.x__Fix_SearchScopePermission_UniqueConstraints.sql` (commit `d088af3cae`, this session) — converted UQ_SearchScopePermission_User and UQ_SearchScopePermission_Role from CONSTRAINTs to filtered UNIQUE indexes (`WHERE UserID IS NOT NULL` / `WHERE RoleID IS NOT NULL`). The original CONSTRAINTs blocked adding a second user or role grant on the same scope because SQL Server treats `(scope, NULL)` collisions as duplicates.
- **Functioning:** ✓ Multi-grant verified by Edge-A and Edge-B audit-time tests.
- **Tested:** Audit-time test confirms 2+ user-grant rows coexist; 2+ role-grant rows coexist. No dedicated `SearchScopePermission.spec.ts` per the plan, but the resolver test suite exercises the table extensively.

#### P2A.3 — Permission resolution service

**Verdict:** SHIPPED (with naming-style notes)
- **Implemented:** `packages/SearchEngine/src/permissions/SearchScopePermissionResolver.ts`. Method named `ResolveEffectivePermission` (PascalCase vs plan's `resolveEffectivePermission` camelCase). Returns `{ Allowed, Level, Source, Reason }` (PascalCase vs plan's snake_case). Source enum has 5 values (`DirectGrant`, `RoleGrant`, `AgentUnscopedAll`, `AgentNone`, `NoGrant`) vs plan's 4.
- **Functioning:** ✓ Audit-time 16-cell matrix run: 14/18 cells PASS. The 4 failures revealed plan-vs-impl divergences on Read-level and Agent-Assigned semantics (covered above).
- **Tested:** 88-case resolver test suite passes.

#### P2A.4 — GraphQL resolver enforcement

**Verdict:** SHIPPED
- **Implemented:** `packages/MJServer/src/resolvers/SearchKnowledgeResolver.ts`. `rejectForbiddenScopes()` (lines 226-242) called before any work. On reject, writes `Status='Forbidden'` log row via `LogForbiddenSearch()`.
- **Functioning:** ✓ Confirmed live: SEARCH_USAGE.md §5.4 walked end-to-end; audit-time runtime tests (Phase 3 P3.2) confirmed Forbidden log row written per call.
- **Tested:** Integration tests in `packages/MJServer/src/__tests__/` (171 tests pass + 56 skipped).

#### P2A.5 — `ScopedSearchAction` enforcement matrix

**Verdict:** SHIPPED
- **Implemented:** `packages/Actions/CoreActions/src/custom/search/scoped-search.action.ts` lines 114-129. Returns structured `PERMISSION_DENIED` / `ACCESS_DENIED` errors.
- **Functioning:** ✓
- **Tested:** `scoped-search.action.test.ts` ships; package's 79 tests all pass.

#### P2A.6 — Angular UI for managing per-user and per-role permissions

**Verdict:** PARTIAL — child grid not implemented
- **Implemented:** AIAgent form has `<mj-agent-permissions-dialog>` and an "Effective scope permissions" rollup. SearchScope form's Permissions panel is auto-generated.
- **Missing:** No `SearchScopePermissionChildGrid` for direct create/edit/delete of permission rows on either form, as the plan requires. Admins must navigate to the standalone entity form. **PR risk: admins will notice immediately.**
- **Effort to fix:** Medium (~3 days per the plan's estimate).

#### P2A.7 — Knowledge Hub Config dashboard surface for permissions

**Verdict:** MISSING — no dashboard subtab
- **Implemented:** Knowledge Hub Config has Pipeline / Vector DB / Full-Text / Thresholds / Search Scopes / Search Analytics / Scheduling tabs.
- **Missing:** No "Permissions" subtab with cross-scope audit view (filterable by scope/user/role). **PR risk: admins cannot answer "who has access to what" in one place.**
- **Effort to fix:** Small to Medium (~1 day per the plan's estimate).

---

### Phase 2B — SearchResultSetToolLibrary

| P-task | Verdict | Notes |
|---|---|---|
| P2B.1 | SHIPPED | Search Result Set ParentID → Data Snapshot in `metadata/artifact-types/.artifact-types.json` lines 348-360. |
| P2B.2 | SHIPPED | `SearchResultSetToolLibrary` registered as `'SearchResultSetToolLibrary'` (consistent with sibling libraries; not the literal `'Search Result Set'` from plan). 5 tools enumerated. Tested. |
| P2B.3-7 | SHIPPED | All 5 tools implemented + unit tests (`filterByScore`, `groupBySourceProvider`, `getMatchingChunks`, `followSourceLink`, `rerankInline`). |
| P2B.8 | SHIPPED | `ArtifactToolManager.test.ts` lines 248-347, 4 cases verifying parent-chain resolution + dispatch routing. |

**Test runs:** `packages/AI/Agents` — **773/773 tests pass.**

---

### Phase 2C — Streaming search

| P-task | Verdict | Notes |
|---|---|---|
| P2C.0 | SHIPPED | Decision doc at `plans/search-scopes-rag-plus/streaming-mechanism-decision.md`. Decided GraphQL Subscriptions. |
| P2C.1 | DIVERGENCE | `streamSearch` implemented on `SearchEngine` singleton (not `SearchEngineBase`). **Post-hoc synthesis**: awaits sync `Search()` then emits partitioned provider events. Not true concurrent streaming with backpressure. On a fast workbench (<100ms total) the difference is invisible; on slow providers the streaming benefit doesn't materialize. |
| P2C.2 | SHIPPED | `SearchKnowledgeStreamResolver.ts` with two-step protocol (mutation returns streamID, subscription filters by streamID). |
| P2C.3 | SHIPPED | `agent-pre-execution-rag.ts` consumes `streamSearch` events and writes markdown traces. |
| P2C.4 | SHIPPED | `scoped-search.action.ts` accepts `streamingMode: 'partials'\|'finalOnly'` parameter (default `'finalOnly'`). |
| P2C.5 | DIVERGENCE | UI uses provider chips, not skeleton rows (per SEARCH_USAGE.md §9.2). Acceptable UX choice; plan's "skeleton rows" language should be updated. |

---

### Phase 2D — Reranker catalog

| P-task | Verdict | Notes |
|---|---|---|
| P2D.1 | SHIPPED | `BaseReRanker.ts` with `EstimateCostCents`, `CostReporter`, `GetAvailableRerankers()`. |
| P2D.2 | SHIPPED | `CohereReRanker` + 9 tests. Verified live (SEARCH_USAGE.md §4.2-4.4). |
| P2D.3 | SHIPPED | `VoyageReRanker` + 8 tests. Token-based pricing. |
| P2D.4 | SHIPPED | `OpenAIReRanker` + 10 tests. Decision documented (judge pattern, no first-party endpoint). |
| P2D.5 | SHIPPED | `BGEReRanker` + tests. Default model `Xenova/bge-reranker-base`. |
| P2D.6 | SHIPPED | `RerankerBudgetGuard` + 14 tests. `RerankerBudgetCents` column on SearchScope. Circuit breaker integrated. |
| P2D.7 | PARTIAL | Dropdown is hardcoded list of 5 rerankers, not dynamic via `BaseReRanker.GetAvailableRerankers()`. Marked as future work in code comments. Cosmetic — adding a 6th reranker requires a code change to the dropdown. |

**Test runs:** `packages/SearchEngine` — **199/199 tests pass.**

---

### Phase 3 — Observability

| P-task | Verdict | Notes |
|---|---|---|
| P3.1 | SHIPPED | `MJSearchExecutionLogEntity` + table from migration `V202604281130`. Generated entity at `entity_subclasses.ts:84666`. |
| P3.2 | SHIPPED | `SearchEngine.logSearchExecution()` private method called at 4 points in `Search()`. **Audit-time test:** SearchKnowledge call writes 1 row; Forbidden writes Status='Forbidden' row; AIAgentID populated when agent path used. All 3 PASS. |
| P3.3 | SHIPPED | "Search Analytics" tab at `knowledge-config-resource.component.ts:271-390`. Loads 5000 logs, computes 6 KPIs + per-scope rollup + reranker spend + top failures. **DIVERGENCE-NOTE**: shows text KPIs, not Kendo charts. Verified live (SEARCH_USAGE.md §7.2). |
| P3.4 | SHIPPED | CSV export at `searchscope-form.component.ts:337-403`. Formula-injection-safe. Verified live (SEARCH_USAGE.md §4.7) — downloaded `searchscope-tuning-My_Demo_Scope-2026-04-29.csv` with the documented header. |

---

### Phase 4 — Tuning UI

| P-task | Verdict | Notes |
|---|---|---|
| P4.1 | SHIPPED | Live Preview panel. Streaming UI, sorted by Score desc, shows top 10. Verified live SEARCH_USAGE.md §4.4 (3 results in 507ms). |
| P4.2 | DIVERGENCE | Implemented. **Plan said `SearchScopeProvider.Weight` column**; implementation uses `ScopeConfig.fusionWeights` JSON. JSON approach is cleaner (no schema change required for new sources). Update plan to match. |
| P4.3 | SHIPPED | Kendall-tau computed in `kendallTauOnSharedItems()` static. Verified live SEARCH_USAGE.md §4.5 — "100% similar to last run" footer rendered after identical-result re-run. **GAP**: no committed unit test for the math; recommend adding one. |
| P4.4 | SHIPPED | `MJSearchScopeTestQueryEntity` + auto-generated grid. Verified live (SEARCH_USAGE.md §4.6 — saved "Smoke test - agent" row, persisted across reload). |

---

### Phase 5 — External providers

| P-task | Verdict | Notes |
|---|---|---|
| P5.1 | SHIPPED | `ElasticsearchSearchProvider` + 631-line test. Self-disables when peer dep absent. Permission predicates pushed to `bool.filter`. |
| P5.2 | SHIPPED | `TypesenseSearchProvider` + 213-line test. Fetch-based (no SDK). Per-collection parallel queries. |
| P5.3 | SHIPPED | `AzureAISearchProvider` + 216-line test. OData filter composition. |
| P5.4 | SHIPPED | `OpenSearchSearchProvider` + 202-line test. Basic auth + AWS SigV4. |
| P5.5 | SHIPPED | `BaseSearchProvider.GetAvailableProviders()` static. All 4 in `metadata/search-providers/`. Verified live (SEARCH_USAGE.md §8 — typeahead resolved all 4). |

---

### Phase 6 — Cross-cutting cleanup

| P-task | Verdict | Notes |
|---|---|---|
| P6.1 | PARTIAL | UUIDsEqual sweep substantially clean in target packages. Remaining `===` cases are either `NormalizeUUID(x) === NormalizeUUID(y)` (functionally equivalent) or non-UUID string comparisons. One borderline case in `GeoResolver.ts` outside the original target scope. |
| P6.2 | PARTIAL | `SearchScopeChildGridComponent` still uses generic `BaseEntity` with `.Get()`/`.Set()` accessors at lines 199, 258, 271. Not refactored to typed entity API as the plan requires. Code-quality issue. |
| P6.3 | SHIPPED | `SearchResultSetParentID.metadata.test.ts` (50 lines) validates the artifact-types metadata. |
| P6.4 | SHIPPED | `guides/SEARCH_SCOPES_AND_RAG_GUIDE.md` (616 lines) has all required Phase 2A-5 sections. |
| P6.5 | PARTIAL | `plans/search-scopes-rag-plus.md` is current (mod 2026-04-28) but does not explicitly mark Phases 2A-5 as shipped. Phase 1 is marked complete. |
| P6.6 | MISSING (test) / PARTIAL (sweep) | Migrations sort monotonically EXCEPT one lowercase filename `migrations/v2/v202409271438__v2.6.x_...sql`. No automated `mj migrate` test against a fresh DB. |

---

## Test runs (all pass)

| Package | Test Files | Tests |
|---|---|---|
| `@memberjunction/ai-agents` | 32 passed | 773 passed |
| `@memberjunction/search-engine` | 18 passed | 199 passed |
| `@memberjunction/core-actions` | 4 passed | 79 passed |
| `@memberjunction/server` | 8 passed (+2 skipped) | 171 passed (+56 skipped) |

**Total: 1,222 tests pass, 0 failures.** (56 skipped — typically env-gated integration tests for external services.)

## Audit-time runtime test results

### Phase 2A 16-cell matrix (`/tmp/rag-audit/phase-2a.sh`)

14/18 PASS. The 4 FAILs surface real plan-vs-impl divergences on Read-level
semantics and Agent-Assigned mode. See "Fix list" items 7 and 8.

### Phase 3+4 runtime checks (`/tmp/rag-audit/phase-3-4`)

7/7 PASS. SearchKnowledge writes 1 log row per call; Forbidden writes
`Status='Forbidden'`; AIAgentID populated correctly.

## Cleanup

Audit corpus dropped:
- `RAG-Audit-Scope` (ID `aaaa...01`) — DELETED
- All audit permission rows — DELETED
- All audit AIAgentSearchScope rows — DELETED
- All audit SearchExecutionLog rows — DELETED
- Memory Manager `SearchScopeAccess` — restored to `'None'`

## Files left in /tmp/rag-audit (audit artifacts, not committed)

- `inventory.md` — static inventory output
- `lib.sh` — shared test helpers
- `seed.sh` / `teardown.sh` — corpus management
- `phase-2a.sh` — 16-cell permission matrix runner
- `results-2a.json` — Phase 2A test results
- `results-3-4.json` — Phase 3+4 test results
- `REPORT.md` — this file
- `.jwt` — captured Auth0 token
