# MemberJunction Hot-Path Performance Optimization Plan

> **Status:** REVIEWED — feedback incorporated (PR #2839, 2026-06-14); ready to implement
> **Branch:** `claude/code-hotspot-analysis-dmoocz`
> **Author:** Code-hotspot analysis (2026-06-14)
> **Scope:** Net-new, high-frequency hot-path optimizations across the core data layer, GraphQL client/cache, Angular render path, and the AI agent/prompt runtime.

> **Review outcome (PR #2839):** Waves 1, 2, 3 approved. Decisions folded in below:
> - Cache size estimate (#5): **lazy + estimate by stringifying only the first row × row count** (§4.1).
> - `gatherPromptTemplateData` (#12): replaced per-run memoization with a **cross-run base cache on `AIEngineBase` + BaseEntity-event invalidation + per-run override clone**, and **adds runtime `subAgentChanges`** mirroring `actionChanges` (§5.1).
> - Sequencing: **Waves 1-3 ship as ONE PR; Wave 4 is its own PR** (§8).

## Implementation Progress (live)

| Item | Status | Notes |
|------|--------|-------|
| Wave 1 (#1-#4, #18) | ✅ done, tested, pushed | MJCore 1262/1262, MJGlobal 457+6 green |
| Wave 2 cache (#5, #6) | ✅ done, tested, pushed | +5 size-estimate tests; 117 cache tests green |
| Wave 2 GraphQL (#7, #10) | ✅ done, tested, pushed | shared FieldMapper + EntityByName; 265 green |
| Wave 2 server (#8, #9-O(F²)) | ✅ done, tested, pushed | GenericDB 795, SQLServer 74 green |
| Wave 3 payload (#13, #14) | ✅ done, tested, pushed | ai-agents 1216/1216 green |
| Wave 3 #15 | ⛔ skipped (rationale) | `CopyScalarsAndArrays(.,true)` is a serialization-safety **filter**, not a throwaway clone; removing it changes persisted `OutputData` and risks circular-ref throws |
| Wave 3 #16 | ⛔ skipped (rationale) | child templates render with their **own** `params.prompt`; system placeholders (output example/format) are prompt-specific, so "resolve once & share" would inject parent placeholders into children. Probe's own correction notes these are cheap synchronous formatters |
| Wave 3 #12 (catalog cache + `subAgentChanges`) | ✅ done, tested, pushed | cache on **`AIEngine`** (server-only) per your call; +13 sub-agent-changes, +5 cache tests; ai-agents 1229 / AIEngine 80 / ai-core-plus 168 green |

> **#12 micro-benchmark:** deferred — a meaningful benchmark needs a populated `AIEngine`/`ActionEngineServer` (DB-backed), which this sandbox doesn't have. Measurement approach + expected savings (~0.5–8 ms/step, GC-jitter the bigger win) are documented in §5.1; to be captured against a live env.

### #12 placement (RESOLVED)
Per your call, the cache lives on **`AIEngine`** (server-only `@memberjunction/aiengine`), which already depends on `actions-base` and is the right home for agent-internals — `AIEngineBase` (client+server) can't take an actions dependency. The catalog is stored loosely and read back via a caller-supplied generic so `AIEngine` needs no compile-time edge to the action/sub-agent domain types (no `any`). Everything else is exactly as reviewed: lazy build, coarse BaseEntity-event wipe (4 entities) + reload wipe, no-override fast path, clone-and-reformat on override, and the new `subAgentChanges` API mirroring `actionChanges`.

#### (historical) the placement question that was resolved
The reviewed design said cache the base catalog on **`AIEngineBase`**. In implementation the catalog necessarily contains **BaseAgent-domain objects** — resolved `MJActionEntityExtended[]` and the **formatted markdown** produced by `BaseAgent.formatSubAgentDetails`/`formatActionDetails`. `AIEngineBase` (`@memberjunction/ai-engine-base`) does not depend on `@memberjunction/actions` and has no access to those formatters, so housing the cache there forces either a new cross-package dependency or loose typing (against the no-`any` rule).

**Recommended adjustment:** keep the **process-wide cache + coarse BaseEntity-event invalidation** exactly as designed, but house it as a `protected static` on **`BaseAgent`** (where the action/sub-agent types and the formatters already live). Invalidation still fires on save/delete of `AI Agents` / `MJ: AI Agent Actions` / `MJ: AI Agent Relationships` / `MJ: AI Agent Types` (subscribe once via MJGlobal BaseEntity events) **and** on `AIEngine` reload (`AdditionalLoading`). Same semantics, clean typing, no new package edges. `subAgentChanges` (new `ExecuteAgentParams` API) still lands in this PR.



---

## 1. Purpose & Method

This plan captures **net-new** performance opportunities found by auditing the code paths that execute *most frequently* — per field read, per row, per object construction, per query, per change-detection cycle, and per agent step. The emphasis is deliberately on **hot spots used constantly**, not rarely-run code.

The audit was performed by five focused probes (core entity path, GraphQL client + cache, server RunView pipeline, Angular render path, AI agent/prompt runtime) plus a deep dive on the BaseAgent step loop. Findings below were each confirmed by reading the actual source; several were independently corroborated by more than one probe (noted inline).

### 1.1 Explicitly Excluded — Already Done (do NOT re-implement)

These are already shipped or finished and must not be restated as new work:

**Merged / in `next`:**
- Request coalescing, dedup + linger window, FastStartupMode, metadata stale-while-revalidate, dataset-status batching/coalescing, `TrustLocalCacheCompletely`, circular-JSON cache fix, `ComponentCache` LRU eviction, metadata refresh debounce (PRs #2088, `PERFORMANCE_AUDIT.md`).
- `BaseEntity._fieldCache`/`_codeNameCache` for `GetFieldByName`/`GetFieldByCodeName` (PR #2405 — **hydrated path only**; see §3.1 for why the raw path is still open).
- `BaseInfo.copyInitData` DefaultValue length-guard fast path (PR #2406).
- `SQLCodeGenBase` O(n²) filter fix (#2508), batched IDB reads via `GetItems<T>` (#2511), Universal Search optimization (#2532), component-loading pipeline (#2566), metadata-loading/cache-invalidation optimization (#2684), `FieldMappingEngine` `new Function` compile cache (#2717).

**Finished inside the (unmerged) Realtime Bridges PR #2836 — three perf commits:**
- `adfe5564f` — AIPromptRunner/model-selection hot-path: lazy O(1) BaseAIEngine indexes (`ModelsByID`, `VendorsByID`, `ModelTypesByID`, `ConfigurationsByID`, `ModelVendorsByModelID`, `PromptModelsByPromptID`), memoized `InferenceProviderTypeID` + `IsInferenceProvider`, cached parsed `OutputExample`, fire-and-forget `AIPromptRun` persistence (`queuePromptRunSave`), credential-eval short-circuit. **→ Removes the model/vendor lookup-map, `IsInferenceProvider`, `OutputExample`-parse, and blocking-`createPromptRun.Save()` items from scope.**
- `6ec4556f9` — fire-and-forget observability persistence for `ActionEngine` logs + `AIModelRunner` embedding runs (`plans/fire-and-forget-logging-audit.md`).
- `86faac817` — `SyncMetadataEngine` reuses loaded engine caches via `BaseEngineRegistry`.

> ⚠️ Risk note: #2836's prompt-runner optimizations are **unmerged** and bundled into a large feature PR. If that PR stalls they are at risk. This plan does **not** duplicate them, but we should track that they land.

**Planned-but-deferred items NOT in this plan's first waves** (acknowledged, may be folded later): systematic OnPush migration, `@for track` audit, engine-startup data consolidation, incremental metadata updates, GraphQL null-field elision, `ResultType: 'simple'` audit, `Promise.all`→`RunViews` conversion. These remain documented in `PERFORMANCE_OPTIMIZATION_PLAN.md` / `agent-latency-optimization.md`.

---

## 2. Findings Summary (priority order)

| # | Area | Finding | Impact | Wave |
|---|------|---------|--------|------|
| 1 | Core | `EntityInfo` field-by-name `Map` (raw-mode `Get()` O(N) `.find()`) | HIGH | 1 |
| 2 | Core | `EntityFieldInfo.TSType` uncached getter | HIGH | 1 |
| 3 | Core | `ClassFactory.CreateInstance(EntityField)` no-op global scan per field | HIGH | 1 |
| 4 | Core | Memoize immutable `EntityInfo`-derived arrays (`PrimaryKeys`/`NameField`/etc.) | MED-HIGH | 1 |
| 5 | Cache | `LocalCacheManager` size-estimate `JSON.stringify` on every write | HIGH | 2 |
| 6 | Cache | `LocalCacheManager` full-array Map rebuild on single-row upsert/remove | HIGH | 2 |
| 7 | Server | `Entities.find` → `EntityByName` in provider RunView path | MED | 2 |
| 8 | Server | Memoize per-query datetime/encrypted field scans; in-place datetime adjust | MED | 2 |
| 9 | Server | Cache full-field SELECT string per entity | MED | 2 |
| 10 | GraphQL | Shared `FieldMapper` + targeted `__mj_` key rename (per-row alloc) | MED | 2 |
| 11 | GraphQL | Memoize `getViewRunTimeFieldList` field-string; `Set`-based dedup | MED | 2 |
| 12 | Agent | `AIEngineBase` base sub-agent/action catalog cache + event invalidation + new `subAgentChanges` runtime override | HIGH | 3 |
| 13 | Agent | Remove duplicate `PayloadAtStart` serialize; reuse unchanged `PayloadAtEnd` | HIGH | 3 |
| 14 | Agent | `finalizeAgentRun` triple-stringify → single | MED | 3 |
| 15 | Agent | `finalizeStepEntity` throwaway deep-clone before stringify | LOW-MED | 3 |
| 16 | Prompt | `resolveAllPlaceholders()` re-run per child template | MED | 3 |
| 17 | Angular | Template-bound getters allocating/scanning per CD cycle | HIGH-MED | 4 |
| 18 | Core | `UUIDsEqual` `===` fast-path short-circuit | LOW | 1 |

> **PR grouping (review-decided):** Waves 1-3 ship together in **PR A**; Wave 4 ships in **PR B**. (`UUIDsEqual` #18 lands with Wave 1 in PR A — the "Wave" column reflects logical grouping, not a 4th PR.)

---

## 3. Wave 1 — Core entity hot path (MJCore)

**Why first:** smallest, lowest-risk changes hitting the genuinely hottest paths; corroborated by multiple probes; several later waves depend on the field-index from #1.

### 3.1 EntityInfo field-by-name index (#1) — *corroborated by 2 probes*
- **Where:** `packages/MJCore/src/generic/baseEntity.ts:1787` (raw-mode `Get()`), also reused by server `getRunTimeViewFieldArray` (`GenericDatabaseProvider.ts:1794`) and Angular `join-grid`.
- **Problem:** `this._EntityInfo?.Fields.find(f => f.Name === FieldName)` is an O(N) linear scan on **every field read** before memoization. PR #2405's cache covers only the *hydrated* `GetFieldByName`; the raw fast path bypasses it, and `EntityInfo` itself has no name index.
- **Fix:** add a lazily-built `Map<string, EntityFieldInfo>` on `EntityInfo` keyed by exact name **and** a lowercased variant; expose `EntityInfo.FieldByName(name)`. `Fields` is immutable post metadata-load, so build once; invalidate if/when `_Fields` is reassigned.
- **Note:** this is *field-within-entity* indexing — distinct from the *entity-level* "Map-backed entity lookups" item that CLAUDE.md marked SKIPPED (~500 entities). Document that distinction in the code comment to avoid future confusion.

### 3.2 `EntityFieldInfo.TSType` memoization (#2)
- **Where:** `entityInfo.ts:922-933` → `util.ts:37-42` (`TypeScriptTypeFromSQLType`).
- **Problem:** uncached getter re-runs up to 5 SQL-type classifiers + `.toLowerCase()` on every access; referenced per-field in value getters/setters, `Set()`, `SetMany()`, dirty-tracking, hydration, raw-mode date check.
- **Fix:** compute once into private `_tsType` on first access (`Type` is immutable post-load).

### 3.3 `EntityField` direct construction (#3)
- **Where:** `baseEntity.ts:2116` (`hydrateFieldsIfNeeded`) → `ClassFactory.GetRegistration`/`GetAllRegistrations`.
- **Problem:** `CreateInstance(EntityField, …)` does a `.filter()` over the *entire* global registration list per field; `EntityField` is never `@RegisterClass`-registered, so the scan always matches nothing → pure waste on the most-allocated object in the framework.
- **Fix (two options, decide in review):**
  - (a) Replace the per-field `CreateInstance` with `new EntityField(rawField)` directly (correct today since it's never subclassed).
  - (b) Add a per-`(baseClassName, key)` memo `Map` inside `ClassFactory.GetRegistration` (broader win — also speeds `GetEntityObject` and every other `CreateInstance` consumer).
  - **Recommendation:** do **both** — (a) for the field hot path, (b) as a general factory hardening. Flagging for reviewer preference.

### 3.4 Memoize immutable `EntityInfo`-derived arrays (#4)
- **Where:** `entityInfo.ts:1744/1752/1760/1769/1887` (`PrimaryKeys`, `UniqueKeys`, `ForeignKeys`, `EncryptedFields`, `NameField`).
- **Problem:** each re-`.filter()`s the field array per access; `PrimaryKeys` is on every load + save-state check and feeds `BaseEntity.PrimaryKeys.map(GetFieldByName)`.
- **Fix:** lazy-cache on the `EntityInfo` instance, following the existing `ParentEntityFieldNames` pattern (`entityInfo.ts:2012`). Invalidate only on `_Fields` reassignment.

### 3.5 `UUIDsEqual` fast path (#18, folded here as it's MJGlobal)
- **Where:** `packages/MJGlobal/src/util/UUIDUtils.ts:48`.
- **Fix:** `if (uuid1 === uuid2) return true;` before normalizing (eliminates 2 string allocations for the common same-value/same-platform case). Zero-risk one-liner.

### Wave 1 testing
- **Modify/extend:** existing `baseEntity` and `entityInfo` test suites in `packages/MJCore/src/__tests__/` — add assertions that memoized getters return **referentially stable** results across calls and **invalidate correctly** on `_Fields` reassignment.
- **New tests:**
  - `EntityInfo.FieldByName`: hit/miss, case-insensitive lookup, whitespace, unknown field returns undefined, parity with `Fields.find`, rebuild after `_Fields` set.
  - `TSType`: memoization (same reference/value across calls), correctness for every SQL type branch (string/uuid/binary/date/bool/numeric), and that it does not recompute (spy on `TypeScriptTypeFromSQLType`).
  - `EntityField` construction path: confirm a real `EntityField` instance is produced; if option (b) chosen, add `ClassFactory` memo tests (registered subclass still wins; unregistered falls through; cache invalidation semantics).
  - `UUIDsEqual`: identical refs, same value diff case, diff length, null/undefined, trimmed equivalence — keep existing semantics exactly.
- **Coverage goal:** raise `entityInfo.ts` / `UUIDUtils.ts` branch coverage; assert no behavioral regressions via existing 789-test MJCore suite.

---

## 4. Wave 2 — Server RunView + GraphQL client/cache

### 4.1 LocalCacheManager write-path (#5, #6) — *the per-mutation invalidation hot path*
- **Where:** `packages/MJCore/src/generic/localCacheManager.ts` — `:1341/1759/1869/959` (size estimate), `:1672-1685` (`UpsertSingleEntity`), `:1720-1736` (`RemoveSingleEntity`).
- **Problem:**
  - `estimateSize(JSON.stringify(data))` fully serializes the entire result array just for a byte count (`length*2`), on every cache write incl. the per-save/delete `storeCachedResults`.
  - Single-row upsert/remove rebuilds a `Map` from the entire array (a `CompositeKey` + concatenated string per existing row), then re-stringifies (compounds with above).
- **Fix:**
  - Size (**review-decided**): compute **lazily**, estimating from a **random sample** of rows rather than the full set. Sample count = `clamp(ceil(rowCount × 0.10), 3, 10)`; pick that many **distinct random indexes**, average `JSON.stringify(row).length` across them, and multiply by `rowCount`. Edge cases: `rowCount === 0` → size 0; `rowCount ≤ 3` → use all rows (no sampling). Random (not first-N) sampling avoids systematic skew from heterogeneous rows (e.g. a nullable large JSON/text column where the head rows happen to be null or oversized). Eviction accounting is already documented as approximate, so a ~10% sample is more than sufficient.
  - Mutation: linear `findIndex` by PK + splice/replace; avoid per-row `CompositeKey` allocation and full Map rebuild.

### 4.2 `Entities.find` → `EntityByName` (#7) — *corroborated by 2 probes*
- **Where:** `graphQLDataProvider.ts:817/983/1925`, `databaseProviderBase.ts:994`.
- **Fix:** use the existing O(1), case-insensitive `EntityByName` map (the documented MJ convention). In `InternalRunViews` this removes a linear scan *per view per batch*. Also pass the already-resolved `entityInfo` into `CheckUserReadPermissions` to drop a redundant re-lookup.

### 4.3 Per-query field scans + datetime adjust (#8)
- **Where:** `GenericDatabaseProvider.ts:709/716` (`PostProcessRows` re-filters datetime/encrypted fields per query), `SQLServerDataProvider.ts:1377-1411` (`AdjustDatetimeFields` full `{...row}` spread + per-field `.toLowerCase()` per row).
- **Fix:** lazy-cache `DatetimeFields`/`EncryptedFields` on `EntityInfo`; early-out when both empty (common case); precompute a datetime descriptor once per query and mutate rows in place.

### 4.4 Cache full-field SELECT string (#9)
- **Where:** `providerBase.ts:1924`, `GenericDatabaseProvider.ts:1763-1816`.
- **Fix:** memoize the joined full-field SELECT string + resolved `EntityFieldInfo[]` per entity; return directly for the widened entity_object case. (The §3.1 field index also kills the O(F²) name→field resolution.)

### 4.5 GraphQL per-row allocation (#10, #11)
- **Where:** `graphQLDataProvider.ts:1914` (`ConvertBackToMJFields` allocates `new FieldMapper()` per row), `FieldMapper.ts:71-80` (`ReverseMapFields` scans all keys per row), `graphQLDataProvider.ts:1308-1359` (`getViewRunTimeFieldList` rebuild + O(col²) `.find` dedup).
- **Fix:** shared/static `FieldMapper`; precompute the per-entity `__mj_`-prefixed field list once and rename only those keys; memoize the field-list string keyed by entity+view(+Fields signature); `Set`-based dedup.

### Wave 2 testing
- **Modify/extend:** `providerBase.dedup.test.ts` and any cache tests — ensure the new size estimate and in-place mutation don't change cache *correctness* (hit/miss, eviction, invalidation).
- **New tests:**
  - LocalCacheManager: single-row upsert (new + existing PK), single-row remove (present + absent), size-estimate bounds (non-zero, monotonic with row count), eviction still fires under the new estimate, **save/delete event drives in-place update without full rebuild** (spy to assert no Map rebuild on the hot path).
  - `EntityByName` substitution: case-insensitive resolution parity, batch RunViews resolves each view, unknown entity behavior unchanged.
  - Datetime adjust: datetime2/datetimeoffset/datetime correctness, no-datetime-field early-out, in-place mutation doesn't corrupt other fields; encrypted-field early-out.
  - SELECT-string memoization: identical output to current builder for dynamic views, saved views, explicit `Fields`; cache invalidation on metadata reload.
  - GraphQL row mapping: `__mj_`-prefixed fields renamed correctly with shared mapper; entities with zero `__mj_` fields short-circuit; CodeName≠Name still mapped.
- **Coverage goal:** add edge cases for empty result sets, single-row sets, wide entities, composite-PK entities, and platform UUID-case differences (SQL Server upper / Postgres lower).

---

## 5. Wave 3 — AI agent / prompt runtime

> Excludes everything done in #2836 `adfe5564f`/`6ec4556f9` (see §1.1). These are in untouched files/paths.

### 5.1 Cache the agent "base" sub-agent/action catalog on `AIEngineBase` (#12) — *corroborated by 2 probes; design per review*
- **Where:** `packages/AI/Agents/src/base-agent.ts:4998-5088`, called per prompt step via `preparePromptParams` (`:2819`); cache lives in `packages/AI/BaseAIEngine` (delegated by `packages/AI/Engine`), alongside the indexes added in #2836 `adfe5564f`.
- **Problem:** rebuilds the entire sub-agent/action catalog every step — `Agents.filter().sort()` + O(subAgents×allAgents) `.map(find)`, O(actions×agentActions) action resolution, `JSON.parse(agentType.PromptParamsSchema)` + `JSON.parse(agent.AgentTypePromptParams)` every step, plus `formatSubAgentDetails`/`formatActionDetails` markdown rebuilds.
- **Why not a simple per-run memo:** actions (and, once added, sub-agents) can be **overridden per run** via `ExecuteAgentParams`, so the catalog is not globally invariant. The right layering is a process-lifetime *base* cache + per-run override application.
- **Fix (3 parts):**
  1. **`AIEngineBase` base cache.** Add a lazily-built, per-agent cache of the agent's **base** sub-agents + actions and their **formatted markdown** (`subAgentDetails`, `actionDetails`, parsed `agentTypePromptParams`). Built the first time a given agent is run; held until end of process. **Coarse-invalidated** via BaseEntity events on any change to `AI Agents`, `MJ: AI Agent Actions`, `MJ: AI Agent Relationships`, or **`MJ: AI Agent Types`** — the last because the cached `agentTypePromptParams` is `JSON.parse(agentType.PromptParamsSchema)` and would otherwise go stale on a type-schema change. On any such event, **wipe the whole base-catalog cache** and let it rebuild on next exec (rebuild cost is small — see savings note below; no fine-grained per-agent invalidation needed). This mirrors how #2836's BaseAIEngine indexes invalidate in `AdditionalLoading`, but adds event-driven invalidation since these entities can change mid-process.
  2. **Add runtime `subAgentChanges`** to `ExecuteAgentParams`, mirroring the existing `actionChanges` (`agent-types.ts:1271`) — we support runtime action overrides but **not** sub-agent overrides today (confirmed: no `subAgentChanges` exists). Add the `SubAgentChange` type + the same scope/propagation semantics (`global`/`root`/`all-subagents`/`specific`) and the application logic in the agent hierarchy. This is a **net-new feature** delivered as part of this work.
  3. **Per-run application.** In `gatherPromptTemplateData`: if there is **no** runtime `actionChanges`/`subAgentChanges` override (the optimized fast path — the overwhelming majority of runs), use the cached base catalog **directly**, including its formatted markdown — zero rebuild. If overrides are present, **clone the cached base set, apply the add/remove changes, and re-run `formatSubAgentDetails`/`formatActionDetails` on the mutated set** (the cached markdown describes the *base* set, so it can't be reused verbatim once the set changes). Never mutate the shared cache. Even the override path still skips the expensive `Agents.filter().sort()` / `.map(find)` / `JSON.parse` work — it only re-formats the delta. Move the two `JSON.parse` calls into the base-cache build so they run once per agent, not per step. Per-step variation (`extraData`, scratchpad/artifact vars, client tools) is still merged on top each step.
- **Estimated savings (no-override fast path):** `gatherPromptTemplateData` is pure in-memory JS. Array filters over engine caches + the two `JSON.parse` are tens of µs each; the dominant cost is the markdown assembly (`formatSubAgentDetails`/`formatActionDetails`), which scales with #actions × #params + result codes. Realistic per-step CPU: **~0.5–2 ms for a typical agent (5–15 actions), ~3–8 ms for a heavy agent (30–50 actions)** — i.e. well under the 20–50 ms upper guess. Cumulatively **~10–60 ms over a 10–20-step loop**. The larger qualitative win is **reduced GC/allocation churn** (no per-step throwaway arrays + multi-KB strings), which matters most on the **realtime/voice latency path** where jitter predictability beats mean CPU. A micro-benchmark will be added during the build to confirm the real number.
- **Open sub-question (resolve during build):** confirm the cleanest place to subscribe to the BaseEntity events (engine-level subscription at first cache build) and that a global wipe is acceptable vs. per-agent keyed invalidation — review steer is "global wipe is fine."

### 5.2 Payload serialization (#13, #14, #15)
- **#13:** delete the duplicate `PayloadAtStart` serialize (`base-agent.ts:6936-6937` — `createStepEntity` at `:6401` already serialized it); reuse `PayloadAtStart` string for `PayloadAtEnd` when `finalPayload === payload` (no change request applied); add a `{ref, json}` memo so step N's end and step N+1's start (same object ref) serialize once.
- **#14:** `finalizeAgentRun` (`:10790/10795/10796`) stringifies the final payload 3× — compute once, set `Result` + `FinalPayloadObject` (setter writes `FinalPayload`), delete the redundant `:10796`.
- **#15:** `finalizeStepEntity` (`:6497-6504`) deep-clones `outputData` via `CopyScalarsAndArrays` then immediately stringifies — drop the throwaway clone (`JSON.stringify` handles non-serializables).

### 5.3 Resolve placeholders once per render (#16)
- **Where:** `AIPromptRunner.ts:1530` (`renderPromptWithChildTemplates`), `:2923` (`renderPromptTemplate`).
- **Problem:** `SystemPlaceholderManager.resolveAllPlaceholders()` runs once for the parent and once per child template — K+1 resolutions of an identical placeholder set.
- **Fix:** resolve once at the top of the render phase; thread the resolved set into child renders via `params.templateData` / a private field.

### Wave 3 testing
- **Modify/extend:** existing `base-agent` and `AIPromptRunner` suites — update any test that asserted per-step recomputation or counted serialize calls.
- **New tests:**
  - **Base-catalog cache:** built once per agent across N steps **and across multiple runs** (spy on `JSON.parse`/format helpers → called once per agent, not per step/run); cache **wiped and rebuilt** after a simulated BaseEntity event on `AI Agents` / `MJ: AI Agent Actions` / `MJ: AI Agent Relationships`; output identical to pre-refactor for a fixture agent.
  - **`subAgentChanges` (new feature):** parity with `actionChanges` — scope semantics (`global`/`root`/`all-subagents`/`specific`), propagation to sub-agents, add/remove modes; mirror the existing `action-changes.test.ts` coverage in a new `sub-agent-changes.test.ts`.
  - **Per-run override application:** no override → cached base used directly (cache object **not** mutated — assert reference identity preserved); override present → a **clone** is mutated and the shared cache stays intact (assert the base cache is unchanged after a run with overrides).
  - Payload serialization: `PayloadAtStart` serialized exactly once per step; `PayloadAtEnd` reuses string when unchanged; re-serializes when a `payloadChangeRequest` mutates; cross-step ref memo correctness; `finalizeAgentRun` produces identical `Result`/`FinalPayload`/`FinalPayloadObject` with a single stringify.
  - Placeholder resolution: resolved once for a K-child prompt (spy), child renders receive the same resolved values, single-template prompts unaffected.
- **Determinism:** all new tests mock LLM + DB; assert no behavior change in rendered prompt text / persisted records (golden-fixture comparison).

---

## 6. Wave 4 — Angular render path

The systematic OnPush / `@for track` migration stays out of scope (separately planned). This wave targets **specific egregious template-bound getters** that allocate/scan every change-detection cycle. Canonical fix pattern: compute into a backing field on input change (see the correct example at `message-item.component.ts:842`).

| Component | Site | Fix |
|-----------|------|-----|
| `shell.component.ts:150/159` | `leftOfSwitcherApps`/`leftOfUserMenuApps` — `.filter(UUIDsEqual)` every tick, **whole-app CD** | recompute on `activeApp`/nav change → field |
| `single-list-detail.component.ts:1336`, `list-form.component.ts:727` | `isViewSelected()` `.some(UUIDsEqual)` per row ×2 | `Set<NormalizeUUID(id)>` |
| `entity-cards.component.ts` | per-card `highlightMatch` (regex ×4), `buildPkString` (`CompositeKey` ×4-5), duplicate title | per-record view-model precompute; highlight as pure pipe |
| `whiteboard-board.component.ts:372-389` | 4 `.filter()` getters per CD on a drag surface | partition items once on state change |
| `ai-analytics-resource.component.ts:363` | `analyticsFilterFields` rebuild + 4 chained `.filter().map().sort()`, bound ×2 | precompute on engine/section change |
| `join-grid.component.ts:675-688` | `GetJoinEntityField` `EntityByName`+`Fields.find` ×2-3 per cell | `Map<colName, EntityFieldInfo>` + values map (also helped by §3.1) |
| `mcp-dashboard.component.ts:2708` | `getToolsForServer/Connection` `.filter()` in outer `@for` | `Map<id, Tool[]>` on load |
| `deep-diff.component.ts:203` | `filteredItems` recursive rebuild + per-node alloc, bound ×2 | memoize on `(items, filterState)` |
| `ng-record-changes.component.ts:602` | `getRestoredFromSourceChange` `viewData.find(UUIDsEqual)` per row ×2 | `Map<NormalizeUUID(ID), …>` on load |
| `entity-permissions-grid.component.ts:135`, `entity-form.component.ts:1013/1021`, `search-results.component.ts` | `getRoleName`, `AvailableParentEntities`/`SiblingEntities`, `GetResolvedLinks` | Map precompute / memoize on data change |

### Wave 4 testing
- **Modify/extend:** existing component specs to assert the precomputed fields update on the relevant `@Input()`/data change.
- **New tests:** for each converted component — (a) the backing field recomputes exactly when its inputs change and not otherwise (spy on the heavy work), (b) rendered output matches the pre-refactor getter for representative data, (c) `Set`/`Map` lookups handle UUID case variance (SQL Server vs Postgres). Add a couple of **render-count / no-allocation-on-CD** regression tests where the harness allows.
- **Note:** Angular packages use Vitest specs already; follow the package's existing test patterns. Where a component has no spec today, add a focused one for the converted method only.

---

## 7. Cross-Cutting Requirements (apply to EVERY wave)

### 7.1 Unit tests — review, modify, and deepen (mandatory)
This is a first-class deliverable, not an afterthought:
1. **Review existing tests** in each touched package and **update** any that assumed the old behavior (call counts, sync saves, per-call recomputation).
2. **Add extensive new tests** for richer/deeper/edge-case coverage: empty inputs, single-element, large N, composite-PK entities, UUID case variance, memo invalidation, referential stability, and golden-fixture equivalence (output identical pre/post refactor).
3. **Run and report** per-package results (pass/fail/skip counts) per CLAUDE.md rule #6 — never leave drift.
4. Use `@memberjunction/test-utils` mocks; no DB connections; deterministic and fast.
5. Where coverage is thin on a touched file, raise it meaningfully (target: cover every new branch + the hot path being changed).

### 7.2 Documentation — update as we go
- `guides/CACHING_AND_PUBSUB_GUIDE.md` — LocalCacheManager write-path changes (size estimate + in-place single-row mutation).
- `guides/DASHBOARD_BEST_PRACTICES.md` / Angular CLAUDE.md — codify the "precompute into a backing field; never allocate/scan in a template-bound getter" pattern with the `message-item` reference.
- Add a short `guides/` note (or extend an existing perf guide) on the **EntityInfo field index** and **memoized derived arrays** so future code uses `FieldByName` instead of `Fields.find`.
- Update package READMEs for any package whose public behavior/notes change.
- On completion, write a results summary (before/after where measurable) into this plan file, mirroring `PERFORMANCE_AUDIT.md`'s format.

### 7.3 Build & verification per package
- After each change: `npm run build` in the affected package (per CLAUDE.md), fix all TS errors before moving on.
- Each wave should build + test green independently so it can ship as its own reviewable PR.

### 7.4 Measurement (where feasible)
- Micro-benchmarks for the core hot paths (§3.1 `Get()`, §3.2 `TSType`, §4.1 cache write) using representative row/field counts, captured before/after.
- For Angular, use the existing Playwright CLI workflow to sanity-check no functional regression on the affected surfaces.

---

## 8. Sequencing & PR Strategy

**Review-decided grouping:** Waves **1-3 ship together as ONE PR**; Wave **4 is its own PR**.

1. **PR A — Waves 1+2+3 (core + server/cache + agent/prompt runtime):**
   - Wave 1 (MJCore core path): field index, `TSType`, `EntityField` construction, derived-array memoization, `UUIDsEqual` fast path.
   - Wave 2 (server + GraphQL/cache): builds on Wave 1's field index — LocalCacheManager, `EntityByName`, per-query scans, SELECT-string memo, FieldMapper.
   - Wave 3 (agent/prompt runtime): `AIEngineBase` base-catalog cache + `subAgentChanges` feature, payload serialization, placeholder resolution.
   - Internally sequence the commits 1 → 2 → 3 so each builds/tests green on its own, but land them in a single PR.
2. **PR B — Wave 4 (Angular):** separate PR; can run in parallel. Component-by-component conversion (split further only if it gets large).

> Order rationale within PR A: Wave 1 is the dependency root and the safest; Wave 2 consumes its field index; Wave 3 is independent of 1/2 but bundled per review. Wave 4 (Angular) is fully independent and isolated in PR B.

---

## 9. Risks & Mitigations

- **Memoization staleness:** all caches invalidate on the existing reassignment/reload hooks (`_Fields` set, `AdditionalLoading`, metadata reload). Tests must assert invalidation explicitly.
- **Cache size-estimate accuracy (#5):** eviction is approximate by design; sampling risks under/over-count for highly heterogeneous rows — mitigate with first-N averaging if review prefers.
- **In-place row mutation (#6, #8):** must confirm the rows are pipeline-owned (freshly produced) and not shared with the caller before mutating in place; keep a copy where ownership is unclear.
- **Behavioral equivalence:** every refactor is output-preserving — enforced by golden-fixture tests comparing pre/post output.
- **#2836 overlap:** if PR #2836 merges first, re-base and re-verify the agent/prompt areas it touched (it does **not** touch the files in Waves 1, 2, 4, or the BaseAgent payload paths in Wave 3).

---

## 10. Open Questions — Resolutions

1. **#3 `EntityField` construction** — *Decision:* do **both** (direct `new` on the field hot path **and** the `ClassFactory.GetRegistration` memo for general hardening). Wave 1 approved as written.
2. **#5 cache size estimate** — *Resolved (review):* lazy + **random-sample** estimate — `clamp(ceil(rows × 0.10), 3, 10)` distinct random rows, average stringified length × row count (use all rows when `rows ≤ 3`, size 0 when empty). No exact-path debug flag needed.
3. **Sequencing** — *Resolved (review):* Waves 1-3 in one PR, Wave 4 in its own PR.
4. **#12 agent catalog caching** — *Resolved (review):* `AIEngineBase` base cache + BaseEntity-event coarse wipe (on `AI Agents` / `MJ: AI Agent Actions` / `MJ: AI Agent Relationships` / `MJ: AI Agent Types`) + per-run override clone (re-format markdown on the override path); **add `subAgentChanges`** to mirror `actionChanges`. Global wipe on invalidation is acceptable (no per-agent keying required). Estimated fast-path saving ~0.5–8 ms/step (catalog-size dependent); primary value is GC-jitter reduction on the realtime path.

### Still open (carry into implementation, not blockers)
- Wave 4 component list — flag any additions/removals; current list in §6 stands unless told otherwise.
- Micro-benchmark harnesses (§7.4) — commit as artifacts, or one-off measurement only? Defaulting to one-off unless you want them committed.
