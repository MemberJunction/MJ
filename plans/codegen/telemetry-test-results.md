# CodeGen Telemetry — Live Test Results

Test of the proposed `CodeGenReporter` against `MJ_Local` (305 entities, SQL Server, mssql platform) before deciding next steps on PR #2342.

## TL;DR

Two CodeGen runs against the same DB:
- **Run A**: no schema changes — 86.5s total, 0 LLM calls
- **Run B**: added one nullable column to `__mj.ApplicationSetting` — 82.3s total, 2 LLM calls

The data already changes the conversation around PR #2342. Three findings worth Amith and Jordan's eyes:

1. **`applyAdvancedGeneration` already scopes to changed entities.** Run A had 0 LLM calls. Run B had 2 LLM calls — both for the one modified entity (`MJ: Application Settings`). The PR's "500 LLM calls when only 5 entities changed" framing isn't accurate today; LLM calls are already proportional to changed-entity count.

2. **`afterHooks` is 21% of every run.** ~18s of "AFTER commands" + "after-all SQL scripts" runs every time, regardless of changes. Nobody is currently looking at this.

3. **`manageMetadata` (Phase 1) is 26% of every run.** PR #2342's scoping work targets Phase 2 (`manageSQLScriptsAndExecution`) only. Phase 1 is untouched and runs ~23s every time.

If we commit to PR #2342 as written, the 6-7 day investment shaves a few seconds at most on the typical no-change run, because the LLM scoping it adds is already happening for free.

## Approach

Added a `CodeGenReporter` singleton (`packages/CodeGenLib/src/Misc/codegen-reporter.ts`, ~500 lines) that captures:

- Phase timings (nested spans)
- Per-entity work and per-call LLM telemetry (tokens, cost, latency, model)
- Counters from `ManageMetadataBase` static lists (new/modified/regenerated entities)
- Context (platform, skipDB)

Writes one JSON file per run to `~/.mj/codegen-state/` — same pattern as PR #2330's `~/.mj/sync-state/`. No new dependencies. Doesn't extend `TelemetryManager` (that's session-scoped for live apps; CodeGen needs run-scoped file artifacts for cross-run comparison).

Wired into:
- Top-level pipeline phases ([runCodeGen.ts](../../packages/CodeGenLib/src/runCodeGen.ts))
- Per-entity advanced generation loop ([manage-metadata.ts](../../packages/CodeGenLib/src/Database/manage-metadata.ts) `processEntityAdvancedGeneration` call site)
- LLM call site at [advanced_generation.ts:151](../../packages/CodeGenLib/src/Misc/advanced_generation.ts) (`executePrompt` chokepoint — every prompt the LLM sees flows through here)

22 unit tests cover phase nesting, entity attribution, LLM totals, counters, retention, list/load round-trip, crash behavior. All pass.

## Run A — baseline (no schema change)

```
Phase                                  Duration
loadMetadata                              9.2s
manageMetadata                           22.5s   ← Phase 1 — not targeted by #2342
manageSQLScriptsAndExecution             31.5s   ← Phase 2 — what #2342 scopes
generateGraphQLCore                       0.04s
generateGraphQL                            0s
generateEntitySubclassesCore              2.5s
generateEntitySubclasses                   0s
generateAngularCore                       0.08s
generateAngular                            0s
generateDBSchema                          0.03s
generateActionsCore                        0s
generateActions                            0s
systemIntegrityChecks                     1.4s
afterHooks                               18.0s   ← surprising: 21% of total
─────────────────────────────────────────────────
TOTAL                                    86.5s   305 entities, 0 LLM calls, $0
```

## Run B — added `__mj.ApplicationSetting.TelemetryDemoColumn` (one nullable NVARCHAR)

```
Phase                                  Duration   Δ vs A
loadMetadata                              9.1s    -0.1s
manageMetadata                           23.0s    +0.5s
manageSQLScriptsAndExecution             27.5s    -4.0s
  └─ entity:Application Settings:adv-gen  4.6s     —      ← per-entity span working
generateGraphQLCore                       0.05s   +0.01s
generateEntitySubclassesCore              2.6s    +0.1s
generateAngularCore                       0.09s   +0.00s
systemIntegrityChecks                     0.5s    -0.9s
afterHooks                               18.0s    +0.0s
─────────────────────────────────────────────────────────
TOTAL                                    82.3s    -4.2s   305 entities
                                                          1 modified, 2 LLM calls
```

LLM detail captured by the new hook:

```
CodeGen: Smart Field Identification    Gemini 3.1 Flash-Lite   3,897 in / 262 out   2.3s
CodeGen: Form Layout Generation        Gemini 3.1 Flash-Lite   7,480 in / 649 out   2.2s
```

Total for the schema-change run: **2 LLM calls, 11,377 tokens in, 911 tokens out, 4.5s of LLM work**. The remaining ~78s of wall time is the same regardless of how many entities changed.

## Implications for PR #2342

Three things change when we have data instead of estimates.

The advanced generation step already scopes to entities in `_newEntityList ∪ _modifiedEntityList` ([manage-metadata.ts:4276-4289](../../packages/CodeGenLib/src/Database/manage-metadata.ts:4276)). Run A's 0 LLM calls confirms this empirically. If a 500-entity DB has 5 changed entities today, advanced generation already only fires for those 5 — not 500.

Where Phase 2 *does* still do O(all) work is the SP scans (`spDeleteUnneededEntityFields`, `spCreateNewEntityFieldsFromSchema`, `spUpdateExistingEntityFieldsFromSchema`). Each of those runs once and scans ~25K `EntityField` rows. PR #2342's `@EntityID` parameter would convert those scans to seeks — that's the real win, not LLM scoping.
