
-- ===================== DDL: Tables, PKs, Indexes =====================

-- Add AllowCaching and DetectExternalChanges columns to Entity table.
--
-- AllowCaching: When false (default), the entire cache code path is
-- short-circuited for that entity. This column is the single source of
-- truth at runtime. Schema-level opt-in is handled at CodeGen time via
-- the `newEntityDefaults."AllowCachingBySchema"` config, which flips this
-- flag when an entity is first inserted into the metadata. Existing
-- core (__mj) entities are backfilled below so they remain cacheable
-- after this migration.
--
-- DetectExternalChanges: When true AND TrackRecordChanges is also true,
-- the external change detection system scans this entity for changes
-- made outside the MJ framework. Default is 0 (opt-out) because most
-- entities are managed by migrations/CodeGen and should not be scanned.

ALTER TABLE __mj."Entity"
 ADD COLUMN "AllowCaching" BOOLEAN NOT NULL CONSTRAINT DF_Entity_AllowCaching DEFAULT FALSE,
 ADD COLUMN "DetectExternalChanges" BOOLEAN NOT NULL CONSTRAINT DF_Entity_DetectExternalChanges DEFAULT FALSE;

-- Note: vwEntities may not include the new columns yet (PG views with computed
-- columns can't be refreshed without DROP CASCADE). The view below queries the
-- Entity base table directly to access the new columns. CodeGen will regenerate
-- vwEntities with the full column set on the next run.

-- ===================== Views =====================

DO $do$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwEntitiesWithExternalChangeTracking"
AS SELECT
  e.*
FROM
  __mj."Entity" e
WHERE
  e."TrackRecordChanges" = TRUE
  AND e."DetectExternalChanges" = TRUE
  AND EXISTS (
    SELECT 1
    FROM __mj."EntityField" ef
    WHERE ef."Name" = '__mj_UpdatedAt' AND ef."EntityID" = e."ID"
  )
  AND EXISTS (
    SELECT 1
    FROM __mj."EntityField" ef
    WHERE ef."Name" = '__mj_CreatedAt' AND ef."EntityID" = e."ID"
  )$vsql$;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  DROP VIEW IF EXISTS __mj."vwEntitiesWithExternalChangeTracking" CASCADE;
  EXECUTE vsql;
END;
$do$;


-- ===================== Stored Procedures (sp*) =====================

-- SKIPPED: References view "vwEntities" not created in this file (CodeGen will recreate)

-- SKIPPED: References view "vwEntities" not created in this file (CodeGen will recreate)


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- Backfill AllowCaching for core schema entities so the existing caching
-- behavior (previously granted by the removed cacheSettings.enableForSchemas
-- runtime override) is preserved after this migration.
UPDATE __mj."Entity"
SET "AllowCaching" = 1
WHERE "SchemaName" = '__mj';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4F750011-FEAF-4635-A017-344C1F3851E6' OR ("EntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'AllowCaching')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType"
        )
        VALUES
        (
        '4F750011-FEAF-4635-A017-344C1F3851E6',
        'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Entities"
        100013,
        'AllowCaching',
        'Allow Caching',
        'Controls whether this entity participates in server-side and client-side caching. When false, all cache operations (PreRunView checks, auto-cache storage, BaseEntity event fingerprint scans, client-side IndexedDB cache) are skipped entirely. This column is the single source of truth at runtime; schema-level defaults are applied at CodeGen time via newEntityDefaults."AllowCachingBySchema".',
        'BOOLEAN',
        1,
        1,
        0,
        0, -- "AllowsNull"
        '((0))',
        0, -- "AutoIncrement"
        1, -- "AllowUpdateAPI"
        0, -- "IsVirtual"
        0, -- "IsNameField"
        0, -- "IncludeInUserSearchAPI"
        0, -- "IncludeRelatedEntityNameFieldInBaseView"
        0, -- "DefaultInView"
        0, -- "IsPrimaryKey"
        0, -- "IsUnique"
        'Search'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'A507B1C9-ABA5-4ECF-8137-36BC6FEFA018' OR ("EntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'DetectExternalChanges')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType"
        )
        VALUES
        (
        'A507B1C9-ABA5-4ECF-8137-36BC6FEFA018',
        'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Entities"
        100014,
        'DetectExternalChanges',
        'Detect External Changes',
        'When set to 1 AND TrackRecordChanges is also 1, the external change detection system will scan this entity for changes made outside the MJ framework (direct SQL, third-party tools, etc.) and replay them through Save() to create proper RecordChange audit entries. Default is 0 (opt-out) because most entities, especially __mj schema metadata tables, are managed by migrations/CodeGen and should not be scanned.',
        'BOOLEAN',
        1,
        1,
        0,
        0, -- "AllowsNull"
        '((0))',
        0, -- "AutoIncrement"
        1, -- "AllowUpdateAPI"
        0, -- "IsVirtual"
        0, -- "IsNameField"
        0, -- "IncludeInUserSearchAPI"
        0, -- "IncludeRelatedEntityNameFieldInBaseView"
        0, -- "DefaultInView"
        0, -- "IsPrimaryKey"
        0, -- "IsUnique"
        'Search'
        );
    END IF;
END $$;


-- ===================== Grants =====================

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spCreateEntity" TO "cdp_Developer", "cdp_Integration"

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spUpdateEntity" TO "cdp_Developer", "cdp_Integration"


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."Entity"."AllowCaching" IS 'Controls whether this entity participates in server-side and client-side caching. When false, all cache operations (PreRunView checks, auto-cache storage, BaseEntity event fingerprint scans, client-side IndexedDB cache) are skipped entirely. This column is the single source of truth at runtime; schema-level defaults are applied at CodeGen time via newEntityDefaults."AllowCachingBySchema".';

COMMENT ON COLUMN __mj."Entity"."DetectExternalChanges" IS 'When set to 1 AND TrackRecordChanges is also 1, the external change detection system will scan this entity for changes made outside the MJ framework (direct SQL, third-party tools, etc.) and replay them through Save() to create proper RecordChange audit entries. Default is 0 (opt-out) because most entities, especially __mj schema metadata tables, are managed by migrations/CodeGen and should not be scanned.';
