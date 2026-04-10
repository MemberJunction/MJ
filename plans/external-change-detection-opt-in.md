# Plan: External Change Detection Opt-In (`DetectExternalChanges` Field)

## Problem Statement

The external change detection system in MemberJunction scans all entities with `TrackRecordChanges = 1` for changes made outside the MJ framework -- direct SQL INSERTs from Flyway migrations, manual database edits, CodeGen-generated stored procedures, etc. When it finds records that have no corresponding `RecordChange` audit entry, it "replays" those changes through the MJ `Save()` flow to backfill proper audit trails.

### Why this is a problem

Many entities in the `__mj` schema are managed exclusively by SQL migrations and CodeGen. Their records are created via direct INSERT statements that bypass `entity.Save()`, so they have **zero** RecordChange entries by design. The external change detector sees "record exists but no Create entry in RecordChange" and flags every one of these as an external change requiring replay.

The result:

- **290 entities scanned** on every detection run
- **Hundreds of false positives** from migration-managed metadata tables
- **Wasted resources** replaying changes that were intentional and authoritative
- **Noise in the audit log** making it harder to find genuine external changes

### Root cause

The system uses `TrackRecordChanges` as the sole eligibility flag, but that field was designed for **audit logging** ("should we record changes to this entity?"), not for external change detection ("should we scan for changes made outside MJ?"). These are fundamentally different concerns that should have separate controls.

### Current mitigation (v5.25)

The scheduled job "Daily External Change Detection" has been disabled by setting `Status: "Disabled"` in `metadata/scheduled-jobs/.external-change-detection-job.json`. This must be re-enabled once the opt-in mechanism is in place.

---

## Solution: `DetectExternalChanges` Opt-In Field

Add a new `DetectExternalChanges BIT NOT NULL DEFAULT 0` column to the `__mj.Entity` table.

### Design principles

1. **Opt-in by default** -- No entities participate until explicitly enabled (`DEFAULT 0`).
2. **Dual-flag requirement** -- Both `TrackRecordChanges = 1` AND `DetectExternalChanges = 1` must be true for an entity to be scanned. This preserves backward compatibility: entities that had `TrackRecordChanges = 1` continue to get audit logging but are NOT automatically enrolled in external change detection.
3. **Minimal code impact** -- The `vwEntitiesWithExternalChangeTracking` view already controls which entities are scanned. Adding the filter there means the `ChangeDetector` code needs no changes.
4. **Explicit enrollment** -- Customers who want external change detection for specific entities (e.g., CRM contacts edited via a third-party tool) explicitly set `DetectExternalChanges = 1` on those entities.

---

## Implementation Steps

### 1. Database Migration (v5.26)

Create a new migration file in `migrations/v5/` following the naming convention `VYYYYMMDDHHMM__v5.26.x_Add_DetectExternalChanges_to_Entity.sql`.

```sql
-- Add the opt-in column
ALTER TABLE ${flyway:defaultSchema}.Entity ADD
    DetectExternalChanges BIT NOT NULL DEFAULT 0;

-- Document the column
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When set to 1 AND TrackRecordChanges is also 1, the external change detection system will scan this entity for changes made outside the MJ framework (direct SQL, third-party tools, etc.) and replay them through Save() to create proper RecordChange audit entries. Default is 0 (opt-out) because most entities, especially __mj schema metadata tables, are managed by migrations/CodeGen and should not be scanned.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'DetectExternalChanges';

-- Update the view to require the new flag
ALTER VIEW ${flyway:defaultSchema}.vwEntitiesWithExternalChangeTracking
AS
SELECT
    e.ID,
    e.Name,
    e.SchemaName,
    e.BaseTable,
    e.TrackRecordChanges,
    e.DetectExternalChanges
FROM
    ${flyway:defaultSchema}.Entity e
WHERE
    e.TrackRecordChanges = 1
    AND e.DetectExternalChanges = 1;
```

> **Note**: The exact view definition should match the existing `vwEntitiesWithExternalChangeTracking` columns -- verify the current definition before writing the migration. The key change is adding `AND e.DetectExternalChanges = 1` to the WHERE clause.

**Optional seed UPDATE**: For customers who were relying on external change detection, provide a commented-out UPDATE statement that enables the flag on non-`__mj` entities:

```sql
-- Uncomment the following to enable external change detection for all
-- non-__mj entities that currently have TrackRecordChanges = 1:
--
-- UPDATE ${flyway:defaultSchema}.Entity
-- SET DetectExternalChanges = 1
-- WHERE TrackRecordChanges = 1
--   AND SchemaName <> '${flyway:defaultSchema}';
```

### 2. CodeGen Run

After the migration is applied:

- Run CodeGen to generate the typed `DetectExternalChanges` property on `EntityEntity`
- CodeGen will automatically update:
  - `packages/MJCoreEntities/src/generated/entity_subclasses.ts` (getter/setter)
  - `packages/GeneratedEntities/src/generated/entity_subclasses.ts`
  - Stored procedures (`spCreateEntity`, `spUpdateEntity`)
  - Entity field metadata in the `EntityField` table
  - Angular form components for the Entity editor

### 3. ChangeDetector Code Review

**File**: `packages/ExternalChangeDetection/src/ChangeDetector.ts`

The `ChangeDetector` loads its entity list from `vwEntitiesWithExternalChangeTracking` via the `Config()` method. Since the view now filters on `DetectExternalChanges = 1`, the detector will automatically skip entities that have not opted in. **No code changes should be needed.**

However, review for:

- Any hardcoded entity lists or overrides that might bypass the view
- The `IneligibleEntities` array -- this can remain as a secondary safety net for entities that should never be scanned regardless of flags (e.g., `RecordChanges` itself)
- Logging: consider adding a log line at startup showing how many entities are enrolled vs. total with `TrackRecordChanges = 1`, so administrators can verify the filter is working

### 4. Re-enable Scheduled Job

**File**: `metadata/scheduled-jobs/.external-change-detection-job.json`

- Change `Status` from `"Disabled"` back to `"Active"`
- Push via `npx mj sync push --dir=metadata --include="scheduled-jobs"`
- This should happen **after** the migration and CodeGen are complete, so the job runs against the filtered view

### 5. Documentation

**File**: `packages/ExternalChangeDetection/README.md`

Update the README to explain:

- The opt-in model: `DetectExternalChanges` must be set to `1` on any entity you want scanned
- Why it defaults to `0` (most entities are managed by MJ framework and don't need scanning)
- How to enable it for specific entities:
  ```sql
  UPDATE __mj.Entity
  SET DetectExternalChanges = 1
  WHERE Name IN ('Contacts', 'Companies', 'Invoices');
  ```
- Which entities are good candidates (user-facing data that might be modified by external systems, ETL tools, or direct SQL)
- Which entities should NOT have it enabled (metadata tables in `__mj` schema, entities managed solely by CodeGen/migrations)

---

## Key Files

| File | Action |
|------|--------|
| `migrations/v5/VYYYYMMDDHHMM__v5.26.x_Add_DetectExternalChanges_to_Entity.sql` | New migration |
| `packages/ExternalChangeDetection/src/ChangeDetector.ts` | Review (likely no changes) |
| `packages/ExternalChangeDetection/README.md` | Update documentation |
| `metadata/scheduled-jobs/.external-change-detection-job.json` | Re-enable job (`Active`) |
| `packages/MJCoreEntities/src/generated/entity_subclasses.ts` | Auto-generated by CodeGen |
| `packages/GeneratedEntities/src/generated/entity_subclasses.ts` | Auto-generated by CodeGen |

---

## Notes

- The scheduled job is disabled in v5.25 (search-phase-2 branch). It must be re-enabled after this work lands, targeted for v5.26.
- The `IneligibleEntities` array in `ChangeDetector.ts` can remain as a secondary safety net. It provides defense-in-depth for entities like `RecordChanges` that should never be scanned regardless of metadata flags.
- Consider providing a metadata sync file or migration UPDATE statement that sets `DetectExternalChanges = 1` for common customer-facing entities that benefit from external change detection (e.g., non-`__mj` schema entities with user data). This helps customers who were previously relying on the old behavior transition smoothly.
- The `vwEntitiesWithExternalChangeTracking` view definition should be verified against the current codebase before writing the final migration, as the exact column list may have evolved.

---

## Estimated Effort

- Migration + CodeGen: ~1 hour
- Code review of ChangeDetector: ~30 minutes
- Documentation updates: ~30 minutes
- Testing (run detection with a few entities opted in): ~1 hour
- **Total: ~3 hours**
