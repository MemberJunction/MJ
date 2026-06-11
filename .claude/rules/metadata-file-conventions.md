---
description: Conventions for connector metadata JSON files.
applies_to: metadata/integrations/**/*.json
---

# Metadata file conventions

These rules apply when reading/writing files under `metadata/integrations/<vendor>/`. The structure was formalized in Phase 0 (v5.39.x); see `metadata/integrations/README.md` for the layout overview.

## Authorship

- NEVER edit metadata files directly via Write or Edit. Use the `mj-metadata` MCP's `upsert_integration_object`, `upsert_integration_object_field`, `append_provenance`, `append_code_evidence` tools.
- These tools provide atomic writes + automatic backups under `.backups/`. Direct edits skip both.

## File shape

- Each file is mj-sync-compatible. Required keys: `fields` (root), optional `relatedEntities` (nested).
- NEVER include system-generated fields: `primaryKey`, `sync`, `__mj_CreatedAt`, `__mj_UpdatedAt`. These are auto-populated by `mj sync push`.
- Use `@lookup:` / `@file:` / `@parent:` / `@root:` references.

## Reference patterns

- `@lookup:MJ: Integrations.Name=<IntegrationName>` — for top-level lookups.
- `@parent:ID` — for the IOF's reference to its **containing** IO (`IntegrationObjectID`) and the IO's reference to its Integration (`IntegrationID`). This is a parent ref, not a sibling lookup — always resolvable.

### Connector-to-connector FK — `@lookup` vs soft-FK is CONDITIONAL (pick per FK graph)

A field that references another object is a soft key (no hard DB constraint on synced data). Two valid authoring forms; the choice depends on the FK graph + whether the connector re-derives FKs at runtime. **Do NOT apply a blanket "never @lookup" — that over-generalizes from Path LMS.**

1. **`@lookup:MJ: Integration Objects.Name=<sibling>&IntegrationID=@parent:ID` on `RelatedIntegrationObjectID`** — the push-time UUID pointer. Correct and preferred for MOST connectors. It only breaks when the FK graph **forward-references a sibling not yet committed in the same push transaction** (mj-sync resolves `@lookup` via a DB RunView that can't see same-transaction uncommitted rows → rollback; `?allowDefer` does NOT help — the retry is in the same transaction). That rollback hits a **dense, forward-referencing** graph (Path LMS, 84 cross-linked objects). A **sparse / backward-ordered** graph pushes clean in one shot (ORCID, 11 FKs all pointing at earlier objects) — KEEP the `@lookup`; it's load-bearing and dropping it buys nothing.
2. **Soft-FK by NAME** — `IsForeignKey=true` + target object name in `Configuration.ReferencedType`, NO `@lookup`. Avoids the rollback, BUT only "free" when the connector **re-derives `ForeignKeyTarget` at runtime from a re-parseable source** (e.g. Path LMS parses its public SpectaQL SDL — `PublicFieldToSchema`, independent of the seeded pointer). `IntegrationSchemaSync.resolveFK(ForeignKeyTarget)` only fills `RelatedIntegrationObjectID` from what `DiscoverFields` emits — so for a **Declared** connector whose `DeclaredFieldToSchema` reads `f.RelatedIntegrationObjectID`, dropping the `@lookup` makes that null and **the FKs vanish** unless the FK-derivation is changed to read `Configuration.ReferencedType`. That is a `BaseRESTIntegrationConnector` change and **belongs in its own framework PR, never a connector PR**.

**Rule:** sparse/ordered FK graph → keep the `@lookup` (connector-only, zero framework touch). Dense forward-ref graph → soft-FK, viable for free only if the connector re-derives FKs from a re-parseable schema; otherwise soft-FK requires a separate framework PR first. A clean `mj sync push` proves the metadata DEPLOYS, not that FKs RESOLVE at runtime — verify the latter separately. See memory `feedback_connector_metadata_deploys_cleanly`.

## MetadataSource (v5.39.x enum)

The `MetadataSource` enum on both `MJ: Integration Objects` and `MJ: Integration Object Fields` is `{Declared, Discovered, Custom}`:
- **Declared** — content authored in this folder. mj sync push sets it on insert.
- **Discovered** — added by the live `IntegrationConnectorCreationPipeline` (D0+D1) during its Introspect+Persist stages.
- **Custom** — added by a customer's runtime extension.

Metadata files should NOT set `MetadataSource` explicitly. The persistence layer enforces the right value based on the write path.

## Hard-constraint fields (require evidence)

The following MUST have a provenance OR code-evidence entry. Without it, `verify-claim` rejects the row at floor-check time:

**Integration row:**
- `Name`, `Description`, `ClassName`, `ImportPath`, `CredentialTypeID`
- `BatchMaxRequestCount`, `BatchRequestWaitTime`

**MJ: Integration Objects row:**
- `Name`, `APIPath`, `PaginationType`
- `SupportsPagination`, `SupportsIncrementalSync`, `SupportsWrite`
- `IncrementalWatermarkField` (REQUIRED when `SupportsIncrementalSync=true`)
- Per-operation write columns, per capability flag set:
  - Create (when `SupportsCreate`): `CreateAPIPath`, `CreateMethod`, `CreateBodyShape` (`flat|wrapped|literal`), `CreateBodyKey` (required when `wrapped`), `CreateIDLocation` (`body|header|n/a|path`)
  - Update (when `SupportsUpdate`): `UpdateAPIPath`, `UpdateMethod`, `UpdateBodyShape`, `UpdateBodyKey`, `UpdateIDLocation`
  - Delete (when `SupportsDelete`): `DeleteAPIPath`, `DeleteMethod` (the verb — NOT assumed `DELETE`), `DeleteIDLocation`. Delete has NO BodyShape/BodyKey.
- `Status`

**MJ: Integration Object Fields row:**
- `Name`, `Type`, `IsPrimaryKey`, `IsRequired`, `IsReadOnly`, `IsUniqueKey`
- `RelatedIntegrationObjectID` (FK target reference, when set)
- `Status`

`EvidenceStrength` ladder:
- Hard constraints accept `ExplicitStatement` (preferred) or `ImpliedFromExample` (with warning).
- `InferredFromContext` is REJECTED for hard constraints — leave the field unset rather than guessing.
- Soft / descriptive fields accept any `EvidenceStrength`.

## Per-flag CODE_EVIDENCE granularity

Every hard-constraint flag emission gets a per-IO or per-IOF CODE_EVIDENCE entry citing the source signal. The workshop's `extract-iiof-pipeline` enforces this — it walks each emitted row and rejects ones without per-flag evidence.

Multi-field grouped emissions are allowed when the source clearly co-states them (e.g. an OpenAPI POST operation simultaneously declares path + method + request body shape).

## Bijection floor-check alignment

The slot table at `packages/Integration/connector-builder-workshop/floor/phase0-slots.json` is the source of truth for required-vs-nullable. Every non-nullable slot must have an entry in this metadata file OR a documented `skip-logged` reason (needs-auth / docs-unscrapable / deprecated / vendor-confirmed-absent).

## Preflight: reconcile authored metadata to the DEPLOYED schema before any test push (REQUIRED)

Most reseed-push failures trace to ONE root cause: the connector metadata was authored against the framework's *ideal* schema, but `mj sync push` writes to the **deployed** DB schema. Before the test/reseed push, reconcile the metadata to the actual schema. Each bullet below was a real, separate PropFuel failure (2026-06-09) — check all of them:

1. **Every field must be a real column.** Diff the IO/IOF field names against the actual `__mj.IntegrationObject` / `__mj.IntegrationObjectField` columns. Fields that exist only in the framework's ideal-but-unmigrated schema — `SupportsCreate/Update/Delete`, `SyncStrategy`, `StableOrderingKey`, `IsMutable`, `IsAppendOnly`, `ContentHashApplicable`, `IncludeInActionGeneration`, and `Source` (the column is `MetadataSource`) — are **silently dropped** (`BaseEntity.SetLocal` no-ops on unknown fields). They will NOT persist; don't rely on them, and put any live-relevant semantics in `Configuration`.
2. **Enum / CHECK-constrained values must be valid.** Read the table's CHECK constraints + `EntityFieldValue` value lists FIRST. `PaginationType` ∈ `{None, Cursor, Offset, PageNumber}` — a custom value like `file-feed` violates `CK_IntegrationObject_PaginationType` and fails the save. Encode custom pagination in `Configuration` and pick the closest valid enum (`None` for a list-all/file feed). Same for `Status`, `Create/Update BodyShape`, `*IDLocation`, `MetadataSource`.
3. **Nested records MUST carry their parent FK.** Every IO under an Integration needs `"IntegrationID": "@parent:ID"`; every IOF under an IO needs `"IntegrationObjectID": "@parent:ID"`. Omitting it → `IntegrationID cannot be null` save failure. Confirm against a known-good vendor file.
4. **`@lookup` targets must already exist at push time.** The integration's `CredentialTypeID` `@lookup:MJ: Credential Types.Name=…` only resolves if that credential-type row exists in the DB. Include the needed credential type in the same scoped push (ordered before `integrations` via the root `.mj-sync.json` `directoryOrder`), or confirm it's already seeded — otherwise the push rolls back on `Lookup failed`.

## Rebuilding a connector that was ALREADY seeded — delete the prior metadata first (REQUIRED)

If the integration **already exists** in the target DB (seeded by a prior migration, or a prior build of this same connector), a plain `mj sync push` will **not** reconcile it to the new metadata — `mj sync push` is upsert-by-`primaryKey` with **NO prune**. Stale IO/IOF that are no longer in the metadata are left behind, and re-seeding a same-named IO collides on `UQ_IntegrationObject_Name`. So a rebuild of a previously-seeded connector MUST explicitly delete the prior IO/IOF before/while laying down the new. The proven recipe (learned on the PropFuel rebuild, 2026-06-09):

1. **Detect the prior state first.** Query the DB for the existing Integration + its IO/IOF (and the `CredentialTypeID` it points at). Decide which rows are stale (absent from the corrected metadata) — those are the delete set.
2. **Delete via the `deleteRecord` feature, not hand-SQL.** Each stale row gets `"deleteRecord": { "delete": true }` + its `"primaryKey": { "ID": "…" }`. (Hand-run SQL fixes only the local DB and is not reproducible — see production note below.)
3. **The deletes MUST be TOP-LEVEL records.** The deletion-audit *gate* (`PushService` quick-scan) only inspects top-level array elements for `deleteRecord`. A delete **nested** under `relatedEntities` (e.g. an IO under its Integration) is **silently skipped** unless some other top-level delete in the same push trips the gate. So express IO/IOF deletions as top-level records in their own entity dir (`MJ: Integration Objects` / `MJ: Integration Object Fields`) — NOT nested under the integration.
4. **Pass `--delete-db-only`.** DB-only dependents (IOF that reference a deleted IO but aren't in the metadata) are only swept with this flag. `CascadeDeletes=0` on these entities, so they do not auto-cascade; the audit reverse-topo-orders them (IOF deleted before IO).
5. **Separate delete from upsert when the corrected rows already exist.** Re-upserting an existing IO whose `primaryKey` isn't in the metadata triggers a `UQ_IntegrationObject_Name` violation and rolls back the whole transaction. Run a delete-only push for the stale rows; let the already-correct rows stand.
6. **Scope the push** (isolated temp dir mirroring `<root>/<entityDir>/…`, or `--include`) so the other vendors' files — and unrelated `deleteRecord` markers elsewhere in `metadata/` — are never dragged into the transactional push.
7. **Production durability.** A fresh install replays the *original* (wrong-seed) migration, so the local cleanup above does not reach production. The durable fix is a **forward-fix migration** performing the same deletes, OR committing the top-level `deleteRecord` file so a deploy-time `mj sync push` applies it.

## DO NOT

- Don't author IO/IOF rows by hand. Use the extractor script. Hand-transcription bypasses `verify-claim`.
- Don't put credentials in metadata files. They live in CompanyIntegration entity rows + the credential-store; the agent never sees them.
- Don't hardcode UUIDs. Use `@lookup:` references and let mj-sync resolve at push time.
- Don't set `MetadataSource` explicitly. The pipeline enforces the value at persist time.
