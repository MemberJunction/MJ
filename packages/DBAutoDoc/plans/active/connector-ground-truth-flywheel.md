# Connector Metadata Ground-Truth Flywheel

*Plan only. Written 2026-11-16 as a companion to [`improvement-roadmap.md`](improvement-roadmap.md).*

## 1. Problem Statement & Motivation

Every time a customer syncs a SaaS connector (Salesforce, HubSpot, Fonteva, MemberSuite, GrowthZone,
Sage Intacct, etc.), MemberJunction materializes tables and can run `DBAutoDoc` to document the
synced schema. Today, `DBAutoDoc` re-discovers and re-describes the entire schema from scratch per
customer—even though ~80–95% of any SaaS connector's schema consists of **standard vendor objects
and fields** whose semantics, primary keys, and foreign keys do not change from customer to customer.

Re-running LLM discovery on standard connector schemas wastes tokens, introduces run-to-run drift,
and forces every tenant to pay for knowledge we can verify once against official vendor API docs and
synced sample databases.

Meanwhile, `DBAutoDoc` stays **strictly below MemberJunction** (Principle #1 of
[`improvement-roadmap.md`](improvement-roadmap.md)): it has no dependency on MJ databases or servers.
To support connector ground truth cleanly, `DBAutoDoc` only needs generic **certified ground-truth
locking** (Phase 7.1 pulled forward), while MJ/Integrations tooling handles translating connector
metadata in and out.

---

## 2. Audit Findings (`MemberJunction/Integrations`, 2026-11-12 / 2026-11-16)

An audit across all **62 connectors** in `MemberJunction/Integrations` (55 SaaS/application
connectors + 7 generic database/platform connectors) revealed why pre-built connector metadata often
fails to reach tenant databases and metadata catalogs:

### A. Four Plumbing / Packaging Gaps

1. **Stranded foreign keys (`IsForeignKey` vs `RelatedIntegrationObjectID`):**
   On `MJ: Integration Object Fields`, the real FK column in the `__mj` database is
   `RelatedIntegrationObjectID` (plus `RelatedIntegrationObjectFieldName`). `IsForeignKey` is a
   framework-ideal authoring field that `BaseEntity.SetLocal` drops on push. Five connectors
   authored unambiguous scalar FK targets inside `Configuration.ReferencedType` without wiring
   `RelatedIntegrationObjectID` (`4,982` scalar FKs total):
   - **Salesforce:** `4,914` scalar FK fields carry `IsForeignKey: true` and
     `Configuration.ReferencedType`, with `0` setting `RelatedIntegrationObjectID`.
   - **Fonteva:** `63` scalar FK fields carry `IsForeignKey: true` and
     `Configuration.ReferencedType`, with `0` setting `RelatedIntegrationObjectID`.
   - **OpenWater:** `3` scalar FK fields (`DeletedSession.deletedByUserId`,
     `Evaluation.judgeUserId`, `FundTransaction.approvedByUserId`) carry `ReferencedType: User`
     without `RelatedIntegrationObjectID`.
   - **Impexium:** `1` scalar FK field (`CustomFieldValues.individualId`) carries
     `ReferencedType: Individuals` without `RelatedIntegrationObjectID`.
   - **HigherLogicThriveCommunity:** `1` scalar FK field (`IdeaVoters.IdeationKey`) carries
     `ReferencedType: Ideas` without `RelatedIntegrationObjectID`.
   - (*Additional non-wired entries left soft intentionally:* `YourMembership` carries `46`
     `RelatedIntegrationObjectFieldName` hints without a target object name; `type=json` / unbounded
     nested object fields in `PathLMS`/`SFMC`/`Spektrix`/`Zendesk` and explicit
     `softFKReason`/`FKDemotedReason`/cycle-breaking back-edges in `Spektrix`/`Zendesk`/`Stripe` are
     deliberately kept soft to preserve SQL Server `IDX_AUTO_MJ_FKEY` indexability and parent-door
     DAGs.)
   Because `IntegrationDiscoveryResolver.buildSourceSchemaFromPersistedRows` resolves persisted FKs
   from `RelatedIntegrationObjectID`, all static FKs for these connectors are silently dropped unless
   live discovery or naming heuristics re-infer them.
2. **Orphaned `metadata/additionalSchemaInfo.json` files (14 connectors):**
   `scripts/add-connector-metadata.mjs` sliced old core `additionalSchemaInfo.json` entries into 14
   connector directories keyed to hardcoded vendor slugs (e.g., `"salesforce": [...]`), even though
   nothing in `OpenApp` or `IntegrationEngine` reads those files (`SchemaBuilder` + `SoftFKConfigEmitter`
   regenerate soft PK/FK config dynamically from `IntegrationObjectField` rows).
3. **Envelope-only static catalogs + lost column descriptions on `ALTER TABLE ADD COLUMN`:**
   Connectors such as HubSpot statically declare only the `SimplePublicObject` wrapper envelope on
   CRM objects (`id`, `properties`, `createdAt`, `updatedAt`, `archived`, `archivedAt`, `url`,
   `hs_object_id`) rather than standard built-in CRM properties (`hubspotDefined=true`). Standard
   fields are therefore discovered at runtime or promoted from `__mj_integration_CustomOverflow` via
   `ALTER TABLE ADD COLUMN`. However, `@memberjunction/integration-schema-builder`'s
   `DDLGenerator.GenerateAlterTableAddColumn` (used by `SchemaEvolution` and `CustomColumnPromoter`)
   previously emitted no `MS_Description` or `COMMENT ON COLUMN`, and `GenerateCreateTable` omitted
   PostgreSQL `COMMENT ON` statements.
4. **`DBAutoDoc`'s `GroundTruthConfig` only locks descriptions today:**
   `GroundTruthConfig` (`packages/DBAutoDoc/src/types/config.ts`) accepts table/column descriptions
   and notes, not verified primary keys or foreign keys.

### B. Content Coverage Tiers Across the 55 Application Connectors

- **Primary Keys (`IsPrimaryKey`):** Strong coverage across active objects (enforced by CI gates).
- **Foreign Keys (`RelatedIntegrationObjectID`):** 21+ SaaS connectors currently have **zero**
  wired `RelatedIntegrationObjectID` links (including Salesforce `0/4,914`, MemberSuite `0/196`
  objects, Sage Intacct `0/163` objects, Fonteva `0/28` objects, YourMembership `0/228` objects,
  Aptify, NimbleAMS, Wicket). Strongest wired examples today: Dynamics Dataverse (`3,849`),
  QuickBooks (`163`), HubSpot (`133`), HigherLogicVanilla (`110`), Rhythm (`108`), Business Central
  (`106`), Cvent (`104`).
- **Descriptions:**
  1. **Rich API-sourced:** Dynamics Dataverse (`17,896`), Salesforce (`31,465`, though standard audit
     fields repeat generic `"System field (read-only)"`), Sage Intacct (`3,823/3,825`), Cvent (`2,193`),
     Business Central (`1,333`), Stripe (`1,207`).
  2. **Boilerplate placeholder strings:** MemberSuite has `6,008/6,008` fields populated with
     `"Field '<x>' on MemberSuite <Obj> (Swagger events v1 definition property)"`; Fonteva PKs read
     `"Assignment.id"`.
  3. **Missing / sparse:** YourMembership (`0/5,159` fields), Wicket (`1/145`), PheedLoop (`46/489`),
     GrowthZone (`89/715`), Aptify (`25/121`), NeonCRM (`309/1,079`), WildApricot (`0/25` objects).

---

## 3. Target Architecture: Two-Repo Flywheel

```
  Vendor API Docs (OpenAPI / WSDL / Official Ref)
         │  [1. Opus / Argon studies Tier-1 docs]
         ▼
  MemberJunction/Integrations (Source = 'Declared', IsCustom = false)
         │  [2. Seed & upgrade migrations → __mj.IntegrationObject / Field]
         │
         ├──► Tenant Runtime Schema Builder (CREATE + ALTER ADD COLUMN emit descriptions & soft PK/FKs)
         │
         └──► Export Ground Truth JSON ──► DBAutoDoc (locks certified tables/PKs/FKs/descriptions;
                                                      analyzes ONLY uncertified/custom tables & columns,
                                                      still allowing FKs → certified standard tables)
                                                 │
                                                 ▼ [3. Verify additions on synced sandbox DB]
                                          Import Verified Standard Metadata Back
                                          (HARD EXCLUSION GATE: never push IsCustom=true / *__c /
                                           CustomOverflow / hubspotDefined=false back to Integrations)
```

---

## 4. Phased Implementation Plan

### Stage A — Plumbing & Immediate Correctness Fixes
1. **`@memberjunction/integration-schema-builder` (`MJ` repo):**
   - Emit idempotent `MS_Description` (SQL Server) and `COMMENT ON COLUMN` (PostgreSQL) in
     `DDLGenerator.GenerateAlterTableAddColumn`, plus `COMMENT ON TABLE/COLUMN` in
     `GenerateCreateTable` for PostgreSQL and descriptions on backfilled standard columns in
     `SchemaEvolution.ensureStandardColumns`.
2. **`MemberJunction/Integrations` (`Integrations` repo):**
   - Run a deterministic script (`scripts/wire-declared-foreign-keys.mjs`) that wires unambiguous
     scalar, non-demoted `Configuration.ReferencedType` FK declarations (`4,982` fields across
     `Salesforce`, `Fonteva`, `OpenWater`, `Impexium`, and `HigherLogicThriveCommunity`) to real
     `RelatedIntegrationObjectID` `@lookup` references + `RelatedIntegrationObjectFieldName` while
     preserving SQL Server indexability (`json`/unbounded excluded) and explicit cycle-breaking soft
     FKs, emitting Flyway delta migrations (`.sql` + `.pg.sql`) per connector.
   - Retire the 14 unused `metadata/additionalSchemaInfo.json` files and stop `add-connector-metadata.mjs`
     from regenerating them.

### Stage B — Standalone Ground-Truth Key Locking in `DBAutoDoc` (Phase 7.1 Pulled Forward)
- Extend `DBAutoDoc`'s `GroundTruthConfig` (keeping `DBAutoDoc` completely independent of MJ) with
  optional per-table `primaryKey` and `foreignKeys` plus certification status:
  - Certified table descriptions, column descriptions, PKs, and FKs are locked immediately with zero
    re-prompting or key overwriting.
  - Certified standard tables remain visible in the schema graph and candidate target index so
    custom tables and custom columns discovered on a customer database can still link to standard
    tables via FK (e.g., a custom object `Custom_Project__c` referencing standard `Account.Id`).

### Stage C — Bridge & Hard Custom-Schema Exclusion Gate
- Build an `export-ground-truth` / `import-autodoc` workflow translating between `Integrations`
  authoring metadata (`metadata/integration/*.integration.json`) and `DBAutoDoc` ground-truth /
  state JSON.
- Enforce a strict **non-custom pushback filter** before writing anything back to `Integrations`:
  - Reject any object or field where `IsCustom === true` or `MetadataSource === 'Custom'`.
  - Reject any column promoted from `__mj_integration_CustomOverflow` (`CustomColumnPromotion`).
  - Reject any object/field matching the connector's declared `CustomObjectMarkerPattern` /
    `CustomFieldMarkerPattern` in `Integration.Configuration` (e.g., Salesforce `*__c`, HubSpot
    `hubspotDefined=false` or `p_<portalId>_*`).

### Stage D — Pilot Connectors (4-Step Argon / Opus Loop)
Validate the full 4-step loop (1. study API docs → 2. declare standard metadata → 3. run
`DBAutoDoc` on synced demo DB with ground truth locked → 4. push verified standard descriptions/PKs/FKs
and delta migrations back to `Integrations`) on three distinct connector shapes before scaling fleet-wide:
1. **`CRM/Salesforce`** — Wire the 4,914 declared FKs and enrich generic `"System field"` descriptions.
2. **`CRM/HubSpot`** — Seed standard CRM built-in properties (`hubspotDefined=true`) and association
   FKs beyond the 8 `SimplePublicObject` wrapper columns.
3. **`AMS/YourMembership`** — Populate the `0/5,159` missing field descriptions and wire FKs from
   vendor API docs + `DBAutoDoc`.
