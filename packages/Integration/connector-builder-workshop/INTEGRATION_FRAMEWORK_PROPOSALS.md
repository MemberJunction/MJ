# Integration-framework change proposals — NOTIFICATION (awaiting your decision, NOT implemented)

Per your instruction: agent-arc changes were made; **framework (CORE) changes are only proposed here** —
you'll likely reject some, and none is applied. Each is a real defect the credential-free runs surfaced.
Ranked by consensus × leverage. CORE = `@memberjunction/integration-engine` / CodeGen / `mj sync push`
/ RSU — time-tested code you've said to guard, hence proposal-only.

| # | Proposal | Why (evidence) | Risk you may reject on |
|---|----------|----------------|------------------------|
| 1 | **Post-commit soft-FK resolution** — after `mj sync push` commits all objects, a second pass resolves `Configuration.ReferencedType` → `RelatedIntegrationObjectID` | [SF] re-resolved 4,914 edges by hand; [HB] 62 `@lookup`s rolled back; [IM] needs two-pass. Dense forward-ref FK has NO clean deploy path today → flat DAG | touches sync-push transaction semantics |
| 2 | **Content-hash must cover overflow fields** | [IM] DB-confirmed: a delta touching only custom/overflow fields is silently dropped | global idempotency change — needs a regression test before you'd accept |
| 3 | **`additionalSchemaInfo.json` per-run dedupe-replace** (regenerate per connector, not a shared accumulator) | [IM][SF] CodeGen chokes on other connectors' PK-less entities every run | shared-file semantics; other consumers may rely on accumulation |
| 4 | **ApplyAll field-map creation falls back to declared IOFs** when live discovery is unavailable | [SF] `FieldMapCount:0` ×1,696 + 1,696 failed auths credential-free; schema path already uses persisted rows, field-map path doesn't | changes ApplyAll field-map source of truth |
| 5 | **Incremental/idempotent ApplyAll CodeGen** — a small apply must not regenerate the whole catalog | [SF] **CONFIRMED BLOCKER**: a 9-object apply re-CodeGen'd 1,696 entities and FAILED ("batch failures") after 14.5 min; [IM] predicted the scale limit | largest CORE change; touches CodeGen orchestration |
| 6 | **Default DeleteBehavior = soft-tombstone** (not hard-delete) | [HB] DB-confirmed `5002` was physically removed; loses history + record-map | behavior change to existing connectors' delete path |
| 7 | **Nested-PK → descend to scalar `.id`** | [HB] known [[project_connector_nested_pk_dupe]]; discovery picks an object-valued field as PK → duplicate rows | engine discovery change |
| 8 | **`IsReadOnly` split** — "don't write back to vendor" vs "don't store in MJ table" | [SF] read-only source fields (`SystemModstamp`, `IsDeleted`) excluded from create sproc → can't store | CodeGen sproc-generation change |
| 9 | **RecordChange logging truncation** in the change-log path on IO save | [SF] `String or binary data would be truncated` though table cols are MAX | change-log sproc |
| 10 | **Promotion value-spread** — sproc-regen lag under RSU `SkipRestart` + order-dependent `NoExplicitTypeError` on boot | [IM] minting works, auto-spread doesn't | type-graphql emission ordering |
| 11 | **`mj sync push` optional chunked data-sync** into entities | [IM][SF] your own point — native/optional batch data load | new sync-push capability |
| 12 | **`DiscoveryIsAuthoritative` respects no-refresh** — the auto-discover Save-hook ran a full 1,519-object introspect despite `refresh=false` | [SF] only an explicit *complete* refresh should ever deactivate | discovery Save-hook gating |

**If you greenlight any subset**, the natural CORE-PR split (kept OUT of the connector/feature PR per your
boundary): one PR for the deploy-path fixes (1, 3, 11), one for the sync-correctness fixes (2, 6, 7), one
for the CodeGen/ApplyAll fixes (4, 5, 8, 9, 10), one tiny for (12). Each independently revertable.

**Highest two by leverage if you only take a couple:** #1 (post-commit FK — the recurring dense-graph
deploy failure across all three runs) and #4 (field-map fallback — fixes credential-free correctness AND
kills the 1,696 failed auths). #5 is the biggest *time* win but the biggest *change*.
