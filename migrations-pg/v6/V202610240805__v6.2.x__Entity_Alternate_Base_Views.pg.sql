-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610240805__v6.2.x__Entity_Alternate_Base_Views.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

/* ===================================================================================== */
/* Alternate Base Views (MJ Canon, Layer 1) */
/* 1. EntityAlternateBaseView: registers additional SQL views for an entity that share */
/*    its base view's column contract while returning a canonical row subset (e.g. */
/*    Active Members, Open Orders). */
/* 2. QueryEntity.AlternateBaseViewID: records which alternate base view a query reads */
/*    when a query references an alternate view, while keeping EntityID pointed at the */
/*    owning entity for permission and cache invalidation parity. */
/* Conventions (migrations/CLAUDE.md & guides/SCHEMA_AND_CODE_AUTHORING_GUIDE.md): */
/*   - Plain DDL + sp_addextendedproperty only (no existence guards). */
/*   - Timestamp columns (__mj_CreatedAt / __mj_UpdatedAt) and FK indexes are omitted; */
/*     CodeGen generates them. */
/*   - PostgreSQL counterpart is deferred to the release build engineer. */
/* ===================================================================================== */
/* ------------------------------------------------------------------------------------- */
/* 1. EntityAlternateBaseView */
/* ------------------------------------------------------------------------------------- */
CREATE TABLE __mj."EntityAlternateBaseView" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "EntityID" UUID NOT NULL,
  "ParentID" UUID NULL,
  "Name" VARCHAR(100) NOT NULL,
  "DisplayName" VARCHAR(255) NULL,
  "Description" TEXT NOT NULL,
  "SchemaName" VARCHAR(255) NULL,
  "ViewName" VARCHAR(255) NOT NULL,
  "CachePolicy" VARCHAR(20) NOT NULL DEFAULT (
    'Default'
  ),
  "Status" VARCHAR(20) NOT NULL DEFAULT (
    'Active'
  ),
  "Sequence" INT NOT NULL DEFAULT (
    0
  ),
  CONSTRAINT "PK_EntityAlternateBaseView" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_EntityAlternateBaseView_Entity" FOREIGN KEY ("EntityID") REFERENCES __mj."Entity" (
    "ID"
  ),
  CONSTRAINT "FK_EntityAlternateBaseView_Parent" FOREIGN KEY ("ParentID") REFERENCES __mj."EntityAlternateBaseView" (
    "ID"
  ),
  CONSTRAINT "UQ_EntityAlternateBaseView_EntityID_Name" UNIQUE (
    "EntityID",
    "Name"
  ),
  CONSTRAINT "CK_EntityAlternateBaseView_NoSelfParent" CHECK ("ParentID" <> "ID"),
  CONSTRAINT "CK_EntityAlternateBaseView_Name" CHECK (LENGTH(CAST(LTRIM(RTRIM("Name")) AS TEXT)) > 0
  AND "Name" NOT LIKE '%|%'
  AND "Name" NOT LIKE '%:%'
  AND LTRIM("Name") NOT LIKE '//%'),
  CONSTRAINT "CK_EntityAlternateBaseView_ViewName" CHECK (LENGTH(CAST(LTRIM(RTRIM("ViewName")) AS TEXT)) > 0
  AND LENGTH(CAST("ViewName" AS TEXT)) <= 128
  AND "ViewName" NOT LIKE '%[^A-Za-z0-9_]%'
  AND "ViewName" NOT LIKE '[^A-Za-z_]%'),
  CONSTRAINT "CK_EntityAlternateBaseView_SchemaName" CHECK ("SchemaName" IS NULL
  OR (
    LENGTH(CAST(LTRIM(RTRIM("SchemaName")) AS TEXT)) > 0
    AND LENGTH(CAST("SchemaName" AS TEXT)) <= 128
    AND "SchemaName" NOT LIKE '%[^A-Za-z0-9_]%'
    AND "SchemaName" NOT LIKE '[^A-Za-z_]%'
  )),
  CONSTRAINT "CK_EntityAlternateBaseView_CachePolicy" CHECK ("CachePolicy" IN ('Default', 'Bypass')),
  CONSTRAINT "CK_EntityAlternateBaseView_Status" CHECK ("Status" IN ('Active', 'Deprecated', 'Disabled'))
);

ALTER TABLE __mj."QueryEntity"
  ADD COLUMN "AlternateBaseViewID" UUID NULL CONSTRAINT "FK_QueryEntity_EntityAlternateBaseView" REFERENCES __mj."EntityAlternateBaseView" (
    "ID"
  ) ON DELETE SET NULL
 /* ------------------------------------------------------------------------------------- */ /* 2. QueryEntity.AlternateBaseViewID */ /* ------------------------------------------------------------------------------------- */;

COMMENT ON TABLE __mj."EntityAlternateBaseView" IS 'Registers alternate base views for an entity: SQL views that expose the same columns as the entity''s BaseView while returning a canonical row subset (such as Active Members or Open Orders).';

COMMENT ON COLUMN __mj."EntityAlternateBaseView"."EntityID" IS 'Owning entity whose column contract this alternate base view shares.';

COMMENT ON COLUMN __mj."EntityAlternateBaseView"."ParentID" IS 'Optional parent alternate base view on the same entity that this view derives from (e.g. an Active Auto-Renew Members view built on top of Active Members). NULL when the view selects directly from the entity''s BaseView. Automatically populated on save via SQL AST extraction when the view''s FROM clause references another registered alternate base view.';

COMMENT ON COLUMN __mj."EntityAlternateBaseView"."Name" IS 'Logical name of the alternate base view, unique per entity (case-insensitive). Cannot contain pipe (|) or colon (:) characters. Callers pass this name via RunViewParams.AlternateBaseView or pin it on a User View.';

COMMENT ON COLUMN __mj."EntityAlternateBaseView"."DisplayName" IS 'Human-friendly label shown in UI pickers and badges. Falls back to Name when NULL.';

COMMENT ON COLUMN __mj."EntityAlternateBaseView"."Description" IS 'Plain-language definition of which rows this alternate base view includes. Surfaced as help text in pickers and in agent and QueryGen discovery context.';

COMMENT ON COLUMN __mj."EntityAlternateBaseView"."SchemaName" IS 'Database schema of ViewName. When NULL, defaults to the owning entity''s SchemaName. Cross-schema views allow an Open App to register an alternate view in its own schema on an upstream entity.';

COMMENT ON COLUMN __mj."EntityAlternateBaseView"."ViewName" IS 'Physical SQL view name in the database. Must select all columns from the owning entity''s BaseView.';

COMMENT ON COLUMN __mj."EntityAlternateBaseView"."CachePolicy" IS 'Controls RunView caching for this alternate view: Default caches results under an isolated abv: fingerprint segment and invalidates on entity writes; Bypass disables caching for views whose predicates depend on the clock or other tables.';

COMMENT ON COLUMN __mj."EntityAlternateBaseView"."Status" IS 'Lifecycle status of the alternate view: Active (selectable and shown in pickers and agent context), Deprecated (executable with a warning, hidden from pickers and agents), or Disabled (rejected at runtime).';

COMMENT ON COLUMN __mj."EntityAlternateBaseView"."Sequence" IS 'Display ordering of this alternate view within its owning entity (lower numbers appear first).';

COMMENT ON COLUMN __mj."QueryEntity"."AlternateBaseViewID" IS 'When this query references an alternate base view rather than the entity''s primary BaseView, records the specific MJ: Entity Alternate Base Views row while EntityID continues to reference the owning entity.';

/* ------------------------------------------------------------------------------------- */
/* 4. Out-of-the-Box Alternate Base Views (MJ Core) */
/*    Metadata registrations live in metadata/entities/.alternate-base-views.json */
/* ------------------------------------------------------------------------------------- */
/* 4a. MJ: Users -> Active (vwUsersActive) */
CREATE OR REPLACE VIEW __mj."vwUsersActive" AS
SELECT
  "u".*
FROM __mj."vwUsers" AS "u"
WHERE
  "u"."IsActive" = TRUE;

GRANT SELECT ON __mj."vwUsersActive" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* 4b. MJ: AI Agents -> Active (vwAIAgentsActive) */
CREATE OR REPLACE VIEW __mj."vwAIAgentsActive" AS
SELECT
  "a".*
FROM __mj."vwAIAgents" AS "a"
WHERE
  "a"."Status" = 'Active' AND "a"."IsRestricted" = FALSE;

GRANT SELECT ON __mj."vwAIAgentsActive" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* 4c. MJ: AI Prompts -> Active (vwAIPromptsActive) */
CREATE OR REPLACE VIEW __mj."vwAIPromptsActive" AS
SELECT
  "p".*
FROM __mj."vwAIPrompts" AS "p"
WHERE
  "p"."Status" = 'Active';

GRANT SELECT ON __mj."vwAIPromptsActive" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* 4d. MJ: Actions -> Active (vwActionsActive) */
CREATE OR REPLACE VIEW __mj."vwActionsActive" AS
SELECT
  "a".*
FROM __mj."vwActions" AS "a"
WHERE
  "a"."Status" = 'Active';

GRANT SELECT ON __mj."vwActionsActive" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* 4e. MJ: Scheduled Jobs -> Active (vwScheduledJobsActive) */
CREATE OR REPLACE VIEW __mj."vwScheduledJobsActive" AS
SELECT
  "j".*
FROM __mj."vwScheduledJobs" AS "j"
WHERE
  "j"."Status" = 'Active';

GRANT SELECT ON __mj."vwScheduledJobsActive" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* 4f. MJ: Scheduled Jobs -> DueNow (vwScheduledJobsDueNow, derived from vwScheduledJobsActive) */
CREATE OR REPLACE VIEW __mj."vwScheduledJobsDueNow" AS
SELECT
  "j".*
FROM __mj."vwScheduledJobsActive" AS "j"
WHERE
  NOT "j"."NextRunAt" IS NULL AND "j"."NextRunAt" <= NOW();

GRANT SELECT ON __mj."vwScheduledJobsDueNow" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* ============================================================================= */
/* GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND */
/* Contains Entity / EntityField / EntityPermission / EntityRelationship inserts, */
/* regenerated base views, spCreate / spUpdate / spDelete procedures, FK indexes, */
/* and permission grants for EntityAlternateBaseView and QueryEntity.AlternateBaseViewID. */
/* If the hand-written DDL above changes, re-run CodeGen and replace this section. */
/* ============================================================================= */
/* SQL generated to create new entity MJ: Entity Alternate Base Views */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "SchemaName",
  "IncludeInAPI",
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '38b82609-4b90-477b-801b-bc4154a8de39',
    'MJ: Entity Alternate Base Views',
    'Entity Alternate Base Views',
    'Registers alternate base views for an entity: SQL views that expose the same columns as the entity''s BaseView while returning a canonical row subset (such as Active Members or Open Orders).',
    NULL,
    'EntityAlternateBaseView',
    'vwEntityAlternateBaseViews',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add new entity MJ: Entity Alternate Base Views to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    '38b82609-4b90-477b-801b-bc4154a8de39',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Entity Alternate Base Views for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('38b82609-4b90-477b-801b-bc4154a8de39' AS UUID),
  CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('38b82609-4b90-477b-801b-bc4154a8de39' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Entity Alternate Base Views for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('38b82609-4b90-477b-801b-bc4154a8de39' AS UUID),
  CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('38b82609-4b90-477b-801b-bc4154a8de39' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Entity Alternate Base Views for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('38b82609-4b90-477b-801b-bc4154a8de39' AS UUID),
  CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('38b82609-4b90-477b-801b-bc4154a8de39' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
ALTER TABLE __mj."EntityAlternateBaseView"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.EntityAlternateBaseView */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.EntityAlternateBaseView */
UPDATE __mj."EntityAlternateBaseView" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'EntityAlternateBaseView' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."EntityAlternateBaseView" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."EntityAlternateBaseView" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."EntityAlternateBaseView"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.EntityAlternateBaseView */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.EntityAlternateBaseView */
UPDATE __mj."EntityAlternateBaseView" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'EntityAlternateBaseView' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."EntityAlternateBaseView" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."EntityAlternateBaseView" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '437e22c7-73a2-42a4-964f-50e5ee71e3f7' OR ("EntityID" = 'EFB0FD56-7AD5-4BFE-BE31-74628FF77265' AND "Name" = 'AlternateBaseViewID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('437e22c7-73a2-42a4-964f-50e5ee71e3f7', 'EFB0FD56-7AD5-4BFE-BE31-74628FF77265' /* Entity: MJ: Query Entities */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'EFB0FD56-7AD5-4BFE-BE31-74628FF77265'), 'AlternateBaseViewID', 'Alternate Base View ID', 'When this query references an alternate base view rather than the entity''s primary BaseView, records the specific MJ: Entity Alternate Base Views row while EntityID continues to reference the owning entity.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '38B82609-4B90-477B-801B-BC4154A8DE39', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '362d67eb-0158-48e9-89a7-3d2df8d6c86c' OR ("EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('362d67eb-0158-48e9-89a7-3d2df8d6c86c', '38B82609-4B90-477B-801B-BC4154A8DE39' /* Entity: MJ: Entity Alternate Base Views */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '531ff067-9622-4fb4-8117-677fa6bb35fb' OR ("EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39' AND "Name" = 'EntityID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('531ff067-9622-4fb4-8117-677fa6bb35fb', '38B82609-4B90-477B-801B-BC4154A8DE39' /* Entity: MJ: Entity Alternate Base Views */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39'), 'EntityID', 'Entity ID', 'Owning entity whose column contract this alternate base view shares.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4f8ee735-3e4d-49ee-a543-81e7cc5df95b' OR ("EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39' AND "Name" = 'ParentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4f8ee735-3e4d-49ee-a543-81e7cc5df95b', '38B82609-4B90-477B-801B-BC4154A8DE39' /* Entity: MJ: Entity Alternate Base Views */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39'), 'ParentID', 'Parent ID', 'Optional parent alternate base view on the same entity that this view derives from (e.g. an Active Auto-Renew Members view built on top of Active Members). NULL when the view selects directly from the entity''s BaseView. Automatically populated on save via SQL AST extraction when the view''s FROM clause references another registered alternate base view.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '38B82609-4B90-477B-801B-BC4154A8DE39', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c4879b44-18a3-4648-88dc-c94be3e6db99' OR ("EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c4879b44-18a3-4648-88dc-c94be3e6db99', '38B82609-4B90-477B-801B-BC4154A8DE39' /* Entity: MJ: Entity Alternate Base Views */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39'), 'Name', 'Name', 'Logical name of the alternate base view, unique per entity (case-insensitive). Cannot contain pipe (|) or colon (:) characters. Callers pass this name via RunViewParams.AlternateBaseView or pin it on a User View.', 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2a3e6d40-74ce-4b1a-8343-12d0e7d5db9e' OR ("EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39' AND "Name" = 'DisplayName')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2a3e6d40-74ce-4b1a-8343-12d0e7d5db9e', '38B82609-4B90-477B-801B-BC4154A8DE39' /* Entity: MJ: Entity Alternate Base Views */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39'), 'DisplayName', 'Display Name', 'Human-friendly label shown in UI pickers and badges. Falls back to Name when NULL.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7d045dea-83b0-4a60-8cb2-7335082ce8b5' OR ("EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7d045dea-83b0-4a60-8cb2-7335082ce8b5', '38B82609-4B90-477B-801B-BC4154A8DE39' /* Entity: MJ: Entity Alternate Base Views */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39'), 'Description', 'Description', 'Plain-language definition of which rows this alternate base view includes. Surfaced as help text in pickers and in agent and QueryGen discovery context.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3487a094-478c-4920-8c3d-fe0f7cdce862' OR ("EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39' AND "Name" = 'SchemaName')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3487a094-478c-4920-8c3d-fe0f7cdce862', '38B82609-4B90-477B-801B-BC4154A8DE39' /* Entity: MJ: Entity Alternate Base Views */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39'), 'SchemaName', 'Schema Name', 'Database schema of ViewName. When NULL, defaults to the owning entity''s SchemaName. Cross-schema views allow an Open App to register an alternate view in its own schema on an upstream entity.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ad8f0456-815e-46bf-87c6-945374f44168' OR ("EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39' AND "Name" = 'ViewName')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ad8f0456-815e-46bf-87c6-945374f44168', '38B82609-4B90-477B-801B-BC4154A8DE39' /* Entity: MJ: Entity Alternate Base Views */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39'), 'ViewName', 'View Name', 'Physical SQL view name in the database. Must select all columns from the owning entity''s BaseView.', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '119bb279-ff18-4cf7-a54f-2513cd2d7f27' OR ("EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39' AND "Name" = 'CachePolicy')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('119bb279-ff18-4cf7-a54f-2513cd2d7f27', '38B82609-4B90-477B-801B-BC4154A8DE39' /* Entity: MJ: Entity Alternate Base Views */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39'), 'CachePolicy', 'Cache Policy', 'Controls RunView caching for this alternate view: Default caches results under an isolated abv: fingerprint segment and invalidates on entity writes; Bypass disables caching for views whose predicates depend on the clock or other tables.', 'nvarchar', 40, 0, 0, FALSE, 'Default', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '51eb5d80-f53e-46e6-936b-cd12982f6143' OR ("EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('51eb5d80-f53e-46e6-936b-cd12982f6143', '38B82609-4B90-477B-801B-BC4154A8DE39' /* Entity: MJ: Entity Alternate Base Views */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39'), 'Status', 'Status', 'Lifecycle status of the alternate view: Active (selectable and shown in pickers and agent context), Deprecated (executable with a warning, hidden from pickers and agents), or Disabled (rejected at runtime).', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7ae4e47a-5e9f-4f4c-a150-c88eecb14969' OR ("EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39' AND "Name" = 'Sequence')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7ae4e47a-5e9f-4f4c-a150-c88eecb14969', '38B82609-4B90-477B-801B-BC4154A8DE39' /* Entity: MJ: Entity Alternate Base Views */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39'), 'Sequence', 'Sequence', 'Display ordering of this alternate view within its owning entity (lower numbers appear first).', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '00986856-d0ff-48cd-9ddc-6f30c698f717' OR ("EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('00986856-d0ff-48cd-9ddc-6f30c698f717', '38B82609-4B90-477B-801B-BC4154A8DE39' /* Entity: MJ: Entity Alternate Base Views */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '68b795ed-bf33-4be6-a036-564812532211' OR ("EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('68b795ed-bf33-4be6-a036-564812532211', '38B82609-4B90-477B-801B-BC4154A8DE39' /* Entity: MJ: Entity Alternate Base Views */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID 3359365f-e44b-49ed-b617-20baefda817d */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '3359365f-e44b-49ed-b617-20baefda817d',
    '119BB279-FF18-4CF7-A54F-2513CD2D7F27',
    1,
    'Bypass',
    'Bypass',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 8cc5408e-917b-4efe-a17e-e909361da93f */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '8cc5408e-917b-4efe-a17e-e909361da93f',
    '119BB279-FF18-4CF7-A54F-2513CD2D7F27',
    2,
    'Default',
    'Default',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 119BB279-FF18-4CF7-A54F-2513CD2D7F27 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '119BB279-FF18-4CF7-A54F-2513CD2D7F27';
/* SQL text to insert entity field value with ID e5648c8e-1bf9-4c32-847f-1e001dc54ca1 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'e5648c8e-1bf9-4c32-847f-1e001dc54ca1',
    '51EB5D80-F53E-46E6-936B-CD12982F6143',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID ac6230a2-ecd7-43ad-8aed-c1ddf3ac6ede */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'ac6230a2-ecd7-43ad-8aed-c1ddf3ac6ede',
    '51EB5D80-F53E-46E6-936B-CD12982F6143',
    2,
    'Deprecated',
    'Deprecated',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 212030d9-3d2c-46e4-8691-132efd0a0b56 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '212030d9-3d2c-46e4-8691-132efd0a0b56',
    '51EB5D80-F53E-46E6-936B-CD12982F6143',
    3,
    'Disabled',
    'Disabled',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 51EB5D80-F53E-46E6-936B-CD12982F6143 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '51EB5D80-F53E-46E6-936B-CD12982F6143';
/* Create Entity Relationship: MJ: Entities -> MJ: Entity Alternate Base Views (One To Many via EntityID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '952dce9c-fdfa-4320-b077-6e5e5c9b35c6') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('952dce9c-fdfa-4320-b077-6e5e5c9b35c6', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '38B82609-4B90-477B-801B-BC4154A8DE39', 'EntityID', 'One To Many', TRUE, TRUE, 88, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '0836f8a5-e945-4705-9923-7743b42beb92') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0836f8a5-e945-4705-9923-7743b42beb92', '38B82609-4B90-477B-801B-BC4154A8DE39', 'EFB0FD56-7AD5-4BFE-BE31-74628FF77265', 'AlternateBaseViewID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '4780068f-2bf3-45c2-8a45-970fab302fb3') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4780068f-2bf3-45c2-8a45-970fab302fb3', '38B82609-4B90-477B-801B-BC4154A8DE39', '38B82609-4B90-477B-801B-BC4154A8DE39', 'ParentID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '958b20e1-32b7-4750-a48d-6409951aa3a7' OR ("EntityID" = 'EFB0FD56-7AD5-4BFE-BE31-74628FF77265' AND "Name" = 'AlternateBaseView')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('958b20e1-32b7-4750-a48d-6409951aa3a7', 'EFB0FD56-7AD5-4BFE-BE31-74628FF77265' /* Entity: MJ: Query Entities */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'EFB0FD56-7AD5-4BFE-BE31-74628FF77265'), 'AlternateBaseView', 'Alternate Base View', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c8404b7f-5d29-4b16-82f1-10bb42b3f77c' OR ("EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39' AND "Name" = 'Entity')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c8404b7f-5d29-4b16-82f1-10bb42b3f77c', '38B82609-4B90-477B-801B-BC4154A8DE39' /* Entity: MJ: Entity Alternate Base Views */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39'), 'Entity', 'Entity', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b830b4d3-a481-4011-98a7-a359b7f79b9d' OR ("EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39' AND "Name" = 'Parent')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b830b4d3-a481-4011-98a7-a359b7f79b9d', '38B82609-4B90-477B-801B-BC4154A8DE39' /* Entity: MJ: Entity Alternate Base Views */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39'), 'Parent', 'Parent', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '51EB5D80-F53E-46E6-936B-CD12982F6143'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '7AE4E47A-5E9F-4F4C-A150-C88EECB14969'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'C8404B7F-5D29-4B16-82F1-10BB42B3F77C'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = FALSE
WHERE
  "ID" = '38B82609-4B90-477B-801B-BC4154A8DE39'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set categories for 15 fields */
/* UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '362D67EB-0158-48E9-89A7-3D2DF8D6C86C';
/* UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.EntityID */
UPDATE __mj."EntityField" SET "Category" = 'View Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'Entity'
WHERE
  "ID" = '531FF067-9622-4FB4-8117-677FA6BB35FB';
/* UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.ParentID */
UPDATE __mj."EntityField" SET "Category" = 'View Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'Parent'
WHERE
  "ID" = '4F8EE735-3E4D-49EE-A543-81E7CC5DF95B';
/* UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.Name */
UPDATE __mj."EntityField" SET "Category" = 'View Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C4879B44-18A3-4648-88DC-C94BE3E6DB99';
/* UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.DisplayName */
UPDATE __mj."EntityField" SET "Category" = 'View Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '2A3E6D40-74CE-4B1A-8343-12D0E7D5DB9E';
/* UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.Description */
UPDATE __mj."EntityField" SET "Category" = 'View Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '7D045DEA-83B0-4A60-8CB2-7335082CE8B5';
/* UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.SchemaName */
UPDATE __mj."EntityField" SET "Category" = 'Database Properties', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '3487A094-478C-4920-8C3D-FE0F7CDCE862';
/* UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.ViewName */
UPDATE __mj."EntityField" SET "Category" = 'Database Properties', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'AD8F0456-815E-46BF-87C6-945374F44168';
/* UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.CachePolicy */
UPDATE __mj."EntityField" SET "Category" = 'Behavior and Status', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '119BB279-FF18-4CF7-A54F-2513CD2D7F27';
/* UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.Status */
UPDATE __mj."EntityField" SET "Category" = 'Behavior and Status', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '51EB5D80-F53E-46E6-936B-CD12982F6143';
/* UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.Sequence */
UPDATE __mj."EntityField" SET "Category" = 'Behavior and Status', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '7AE4E47A-5E9F-4F4C-A150-C88EECB14969';
/* UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.Entity */
UPDATE __mj."EntityField" SET "Category" = 'View Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'Entity Text'
WHERE
  "ID" = 'C8404B7F-5D29-4B16-82F1-10BB42B3F77C';
/* UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.Parent */
UPDATE __mj."EntityField" SET "Category" = 'View Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'Parent Text'
WHERE
  "ID" = 'B830B4D3-A481-4011-98A7-A359B7F79B9D';
/* UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '00986856-D0FF-48CD-9DDC-6F30C698F717';
/* UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '68B795ED-BF33-4BE6-A036-564812532211';

/* Set entity icon to fa fa-eye */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-eye', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '38B82609-4B90-477B-801B-BC4154A8DE39';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5283f6b0-5c08-533f-b9cf-b547f6a02a14', '38B82609-4B90-477B-801B-BC4154A8DE39', 'FieldCategoryInfo', '{
  "Behavior and Status": {
    "description": "Runtime caching, status configuration, and display sequence settings",
    "icon": "fa fa-cog"
  },
  "Database Properties": {
    "description": "Physical database mapping properties including schema and view names",
    "icon": "fa fa-database"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-shield-alt"
  },
  "View Configuration": {
    "description": "Core identifying attributes, names, and relationships of the alternate base view",
    "icon": "fa fa-sliders-h"
  }
}', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('024008df-fd40-5e90-b1a6-ccf89cf53e5b', '38B82609-4B90-477B-801B-BC4154A8DE39', 'FieldCategoryIcons', '{
  "Behavior and Status": "fa fa-cog",
  "Database Properties": "fa fa-database",
  "System Metadata": "fa fa-shield-alt",
  "View Configuration": "fa fa-sliders-h"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '38B82609-4B90-477B-801B-BC4154A8DE39';

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '958B20E1-32B7-4750-A48D-6409951AA3A7'
  AND "AutoUpdateDefaultInView" = TRUE;

/* Set categories for 2 fields */
/* UPDATE Entity Field Category Info MJ: Query Entities.AlternateBaseViewID */
UPDATE __mj."EntityField" SET "Category" = 'Identifiers', "GeneratedFormSection" = 'Category', "DisplayName" = 'Alternate Base View'
WHERE
  "ID" = '437E22C7-73A2-42A4-964F-50E5EE71E3F7';
/* UPDATE Entity Field Category Info MJ: Query Entities.AlternateBaseView */
UPDATE __mj."EntityField" SET "Category" = 'Query Mapping', "GeneratedFormSection" = 'Category', "DisplayName" = 'Alternate Base View Name'
WHERE
  "ID" = '958B20E1-32B7-4750-A48D-6409951AA3A7';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Alternate Base Views
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_alternate_base_view_entity_id"
    ON "__mj"."EntityAlternateBaseView" ("EntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_alternate_base_view_parent_id"
    ON "__mj"."EntityAlternateBaseView" ("ParentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Alternate Base Views
-- Item: vwEntityAlternateBaseViews
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Alternate Base Views
-----               SCHEMA:      __mj
-----               BASE TABLE:  EntityAlternateBaseView
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwEntityAlternateBaseViews"
AS
SELECT
    e.*,
    MJEntity_EntityID."Name" AS "Entity",
    MJEntityAlternateBaseView_ParentID."Name" AS "Parent"
FROM
    "__mj"."EntityAlternateBaseView" AS e
INNER JOIN
    "__mj"."Entity" AS MJEntity_EntityID
  ON
    "e"."EntityID" = MJEntity_EntityID."ID"
LEFT OUTER JOIN
    "__mj"."EntityAlternateBaseView" AS MJEntityAlternateBaseView_ParentID
  ON
    "e"."ParentID" = MJEntityAlternateBaseView_ParentID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwEntityAlternateBaseViews'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwEntityAlternateBaseViews'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwEntityAlternateBaseViews" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwEntityAlternateBaseViews" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwEntityAlternateBaseViews" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwEntityAlternateBaseViews" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Alternate Base Views
-- Item: spCreateEntityAlternateBaseView
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR EntityAlternateBaseView
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateEntityAlternateBaseView'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateEntityAlternateBaseView"(
    p_id UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_name varchar(100) DEFAULT NULL,
    p_displayname_clear boolean DEFAULT false,
    p_displayname varchar(255) DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_schemaname_clear boolean DEFAULT false,
    p_schemaname varchar(255) DEFAULT NULL,
    p_viewname varchar(255) DEFAULT NULL,
    p_cachepolicy varchar(20) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_sequence int DEFAULT NULL
) RETURNS SETOF "__mj"."vwEntityAlternateBaseViews" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."EntityAlternateBaseView"
        (
            "ID",
            "EntityID",
                "ParentID",
                "Name",
                "DisplayName",
                "Description",
                "SchemaName",
                "ViewName",
                "CachePolicy",
                "Status",
                "Sequence"
        )
    VALUES
        (
            v_new_id,
            p_entityid,
                CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, NULL) END,
                p_name,
                CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, NULL) END,
                p_description,
                CASE WHEN p_schemaname_clear = true THEN NULL ELSE COALESCE(p_schemaname, NULL) END,
                p_viewname,
                COALESCE(p_cachepolicy, 'Default'),
                COALESCE(p_status, 'Active'),
                COALESCE(p_sequence, 0)
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwEntityAlternateBaseViews"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityAlternateBaseView" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityAlternateBaseView" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Alternate Base Views
-- Item: spUpdateEntityAlternateBaseView
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR EntityAlternateBaseView
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateEntityAlternateBaseView'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateEntityAlternateBaseView"(
    p_id UUID,
    p_entityid UUID DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_name varchar(100) DEFAULT NULL,
    p_displayname_clear boolean DEFAULT false,
    p_displayname varchar(255) DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_schemaname_clear boolean DEFAULT false,
    p_schemaname varchar(255) DEFAULT NULL,
    p_viewname varchar(255) DEFAULT NULL,
    p_cachepolicy varchar(20) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_sequence int DEFAULT NULL
) RETURNS SETOF "__mj"."vwEntityAlternateBaseViews" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."EntityAlternateBaseView"
    SET
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "ParentID" = CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, "ParentID") END,
        "Name" = COALESCE(p_name, "Name"),
        "DisplayName" = CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, "DisplayName") END,
        "Description" = COALESCE(p_description, "Description"),
        "SchemaName" = CASE WHEN p_schemaname_clear = true THEN NULL ELSE COALESCE(p_schemaname, "SchemaName") END,
        "ViewName" = COALESCE(p_viewname, "ViewName"),
        "CachePolicy" = COALESCE(p_cachepolicy, "CachePolicy"),
        "Status" = COALESCE(p_status, "Status"),
        "Sequence" = COALESCE(p_sequence, "Sequence")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwEntityAlternateBaseViews"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntityAlternateBaseView" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntityAlternateBaseView" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityAlternateBaseView table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_entity_alternate_base_view"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_entity_alternate_base_view" ON "__mj"."EntityAlternateBaseView";

CREATE TRIGGER "trg_update_entity_alternate_base_view"
BEFORE UPDATE ON "__mj"."EntityAlternateBaseView"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_entity_alternate_base_view"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Alternate Base Views
-- Item: spDeleteEntityAlternateBaseView
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR EntityAlternateBaseView
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteEntityAlternateBaseView'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteEntityAlternateBaseView"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."EntityAlternateBaseView"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityAlternateBaseView" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityAlternateBaseView" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Query Entities
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_query_entity_query_id"
    ON "__mj"."QueryEntity" ("QueryID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_query_entity_entity_id"
    ON "__mj"."QueryEntity" ("EntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_query_entity_alternate_base_view_id"
    ON "__mj"."QueryEntity" ("AlternateBaseViewID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Query Entities
-- Item: vwQueryEntities
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Query Entities
-----               SCHEMA:      __mj
-----               BASE TABLE:  QueryEntity
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwQueryEntities"
AS
SELECT
    q.*,
    MJQuery_QueryID."Name" AS "Query",
    MJEntity_EntityID."Name" AS "Entity",
    MJEntityAlternateBaseView_AlternateBaseViewID."Name" AS "AlternateBaseView"
FROM
    "__mj"."QueryEntity" AS q
INNER JOIN
    "__mj"."Query" AS MJQuery_QueryID
  ON
    "q"."QueryID" = MJQuery_QueryID."ID"
INNER JOIN
    "__mj"."Entity" AS MJEntity_EntityID
  ON
    "q"."EntityID" = MJEntity_EntityID."ID"
LEFT OUTER JOIN
    "__mj"."EntityAlternateBaseView" AS MJEntityAlternateBaseView_AlternateBaseViewID
  ON
    "q"."AlternateBaseViewID" = MJEntityAlternateBaseView_AlternateBaseViewID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwQueryEntities'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwQueryEntities'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwQueryEntities" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwQueryEntities" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwQueryEntities" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwQueryEntities" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Query Entities
-- Item: spCreateQueryEntity
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR QueryEntity
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateQueryEntity'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateQueryEntity"(
    p_id UUID DEFAULT NULL,
    p_queryid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_detectionmethod varchar(50) DEFAULT NULL,
    p_autodetectconfidencescore_clear boolean DEFAULT false,
    p_autodetectconfidencescore decimal(3, 2) DEFAULT NULL,
    p_alternatebaseviewid_clear boolean DEFAULT false,
    p_alternatebaseviewid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwQueryEntities" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."QueryEntity"
        (
            "ID",
            "QueryID",
                "EntityID",
                "DetectionMethod",
                "AutoDetectConfidenceScore",
                "AlternateBaseViewID"
        )
    VALUES
        (
            v_new_id,
            p_queryid,
                p_entityid,
                COALESCE(p_detectionmethod, 'Manual'),
                CASE WHEN p_autodetectconfidencescore_clear = true THEN NULL ELSE COALESCE(p_autodetectconfidencescore, NULL) END,
                CASE WHEN p_alternatebaseviewid_clear = true THEN NULL ELSE COALESCE(p_alternatebaseviewid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwQueryEntities"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateQueryEntity" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateQueryEntity" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Query Entities
-- Item: spUpdateQueryEntity
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR QueryEntity
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateQueryEntity'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateQueryEntity"(
    p_id UUID,
    p_queryid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_detectionmethod varchar(50) DEFAULT NULL,
    p_autodetectconfidencescore_clear boolean DEFAULT false,
    p_autodetectconfidencescore decimal(3, 2) DEFAULT NULL,
    p_alternatebaseviewid_clear boolean DEFAULT false,
    p_alternatebaseviewid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwQueryEntities" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."QueryEntity"
    SET
        "QueryID" = COALESCE(p_queryid, "QueryID"),
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "DetectionMethod" = COALESCE(p_detectionmethod, "DetectionMethod"),
        "AutoDetectConfidenceScore" = CASE WHEN p_autodetectconfidencescore_clear = true THEN NULL ELSE COALESCE(p_autodetectconfidencescore, "AutoDetectConfidenceScore") END,
        "AlternateBaseViewID" = CASE WHEN p_alternatebaseviewid_clear = true THEN NULL ELSE COALESCE(p_alternatebaseviewid, "AlternateBaseViewID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwQueryEntities"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateQueryEntity" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateQueryEntity" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the QueryEntity table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_query_entity"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_query_entity" ON "__mj"."QueryEntity";

CREATE TRIGGER "trg_update_query_entity"
BEFORE UPDATE ON "__mj"."QueryEntity"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_query_entity"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Query Entities
-- Item: spDeleteQueryEntity
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR QueryEntity
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteQueryEntity'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteQueryEntity"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."QueryEntity"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteQueryEntity" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteQueryEntity" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queries
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_query_category_id"
    ON "__mj"."Query" ("CategoryID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_query_embedding_model_id"
    ON "__mj"."Query" ("EmbeddingModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_query_sql_dialect_id"
    ON "__mj"."Query" ("SQLDialectID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_query_external_data_source_id"
    ON "__mj"."Query" ("ExternalDataSourceID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_query_approved_by_user_id"
    ON "__mj"."Query" ("ApprovedByUserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queries
-- Item: vwQueries
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Queries
-----               SCHEMA:      __mj
-----               BASE TABLE:  Query
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwQueries"
AS
SELECT
    q.*,
    MJQueryCategory_CategoryID."Name" AS "Category",
    MJAIModel_EmbeddingModelID."Name" AS "EmbeddingModel",
    MJSQLDialect_SQLDialectID."Name" AS "SQLDialect",
    MJExternalDataSource_ExternalDataSourceID."Name" AS "ExternalDataSource",
    MJUser_ApprovedByUserID."Name" AS "ApprovedByUser"
FROM
    "__mj"."Query" AS q
LEFT OUTER JOIN
    "__mj"."QueryCategory" AS MJQueryCategory_CategoryID
  ON
    "q"."CategoryID" = MJQueryCategory_CategoryID."ID"
LEFT OUTER JOIN
    "__mj"."AIModel" AS MJAIModel_EmbeddingModelID
  ON
    "q"."EmbeddingModelID" = MJAIModel_EmbeddingModelID."ID"
INNER JOIN
    "__mj"."SQLDialect" AS MJSQLDialect_SQLDialectID
  ON
    "q"."SQLDialectID" = MJSQLDialect_SQLDialectID."ID"
LEFT OUTER JOIN
    "__mj"."ExternalDataSource" AS MJExternalDataSource_ExternalDataSourceID
  ON
    "q"."ExternalDataSourceID" = MJExternalDataSource_ExternalDataSourceID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_ApprovedByUserID
  ON
    "q"."ApprovedByUserID" = MJUser_ApprovedByUserID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwQueries'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwQueries'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwQueries" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwQueries" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwQueries" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwQueries" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queries
-- Item: spCreateQuery
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Query
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateQuery'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateQuery"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_userquestion_clear boolean DEFAULT false,
    p_userquestion TEXT DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_sql_clear boolean DEFAULT false,
    p_sql TEXT DEFAULT NULL,
    p_technicaldescription_clear boolean DEFAULT false,
    p_technicaldescription TEXT DEFAULT NULL,
    p_originalsql_clear boolean DEFAULT false,
    p_originalsql TEXT DEFAULT NULL,
    p_feedback_clear boolean DEFAULT false,
    p_feedback TEXT DEFAULT NULL,
    p_status varchar(15) DEFAULT NULL,
    p_qualityrank_clear boolean DEFAULT false,
    p_qualityrank int DEFAULT NULL,
    p_executioncostrank_clear boolean DEFAULT false,
    p_executioncostrank int DEFAULT NULL,
    p_usestemplate_clear boolean DEFAULT false,
    p_usestemplate BOOLEAN DEFAULT NULL,
    p_auditqueryruns BOOLEAN DEFAULT NULL,
    p_cacheenabled BOOLEAN DEFAULT NULL,
    p_cachettlminutes_clear boolean DEFAULT false,
    p_cachettlminutes int DEFAULT NULL,
    p_cachemaxsize_clear boolean DEFAULT false,
    p_cachemaxsize int DEFAULT NULL,
    p_embeddingvector_clear boolean DEFAULT false,
    p_embeddingvector TEXT DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_cachevalidationsql_clear boolean DEFAULT false,
    p_cachevalidationsql TEXT DEFAULT NULL,
    p_sqldialectid UUID DEFAULT NULL,
    p_reusable BOOLEAN DEFAULT NULL,
    p_externaldatasourceid_clear boolean DEFAULT false,
    p_externaldatasourceid UUID DEFAULT NULL,
    p_ismaterialized BOOLEAN DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_embeddingvectorbinary_clear boolean DEFAULT false,
    p_embeddingvectorbinary BYTEA DEFAULT NULL,
    p_approvalcomments_clear boolean DEFAULT false,
    p_approvalcomments TEXT DEFAULT NULL,
    p_approvedbyuserid_clear boolean DEFAULT false,
    p_approvedbyuserid UUID DEFAULT NULL,
    p_approvedat_clear boolean DEFAULT false,
    p_approvedat TIMESTAMPTZ DEFAULT NULL,
    p_approvedfingerprint_clear boolean DEFAULT false,
    p_approvedfingerprint varchar(100) DEFAULT NULL
) RETURNS SETOF "__mj"."vwQueries" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."Query"
        (
            "ID",
            "Name",
                "CategoryID",
                "UserQuestion",
                "Description",
                "SQL",
                "TechnicalDescription",
                "OriginalSQL",
                "Feedback",
                "Status",
                "QualityRank",
                "ExecutionCostRank",
                "UsesTemplate",
                "AuditQueryRuns",
                "CacheEnabled",
                "CacheTTLMinutes",
                "CacheMaxSize",
                "EmbeddingVector",
                "EmbeddingModelID",
                "CacheValidationSQL",
                "SQLDialectID",
                "Reusable",
                "ExternalDataSourceID",
                "IsMaterialized",
                "Configuration",
                "EmbeddingVectorBinary",
                "ApprovalComments",
                "ApprovedByUserID",
                "ApprovedAt",
                "ApprovedFingerprint"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, NULL) END,
                CASE WHEN p_userquestion_clear = true THEN NULL ELSE COALESCE(p_userquestion, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_sql_clear = true THEN NULL ELSE COALESCE(p_sql, NULL) END,
                CASE WHEN p_technicaldescription_clear = true THEN NULL ELSE COALESCE(p_technicaldescription, NULL) END,
                CASE WHEN p_originalsql_clear = true THEN NULL ELSE COALESCE(p_originalsql, NULL) END,
                CASE WHEN p_feedback_clear = true THEN NULL ELSE COALESCE(p_feedback, NULL) END,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_qualityrank_clear = true THEN NULL ELSE COALESCE(p_qualityrank, 0) END,
                CASE WHEN p_executioncostrank_clear = true THEN NULL ELSE COALESCE(p_executioncostrank, NULL) END,
                CASE WHEN p_usestemplate_clear = true THEN NULL ELSE COALESCE(p_usestemplate, FALSE) END,
                COALESCE(p_auditqueryruns, FALSE),
                COALESCE(p_cacheenabled, FALSE),
                CASE WHEN p_cachettlminutes_clear = true THEN NULL ELSE COALESCE(p_cachettlminutes, NULL) END,
                CASE WHEN p_cachemaxsize_clear = true THEN NULL ELSE COALESCE(p_cachemaxsize, NULL) END,
                CASE WHEN p_embeddingvector_clear = true THEN NULL ELSE COALESCE(p_embeddingvector, NULL) END,
                CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, NULL) END,
                CASE WHEN p_cachevalidationsql_clear = true THEN NULL ELSE COALESCE(p_cachevalidationsql, NULL) END,
                CASE WHEN p_sqldialectid = '00000000-0000-0000-0000-000000000000'::UUID THEN '1F203987-A37B-4BC1-85B3-BA50DC33C3E0' ELSE COALESCE(p_sqldialectid, '1F203987-A37B-4BC1-85B3-BA50DC33C3E0') END,
                COALESCE(p_reusable, FALSE),
                CASE WHEN p_externaldatasourceid_clear = true THEN NULL ELSE COALESCE(p_externaldatasourceid, NULL) END,
                COALESCE(p_ismaterialized, FALSE),
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                CASE WHEN p_embeddingvectorbinary_clear = true THEN NULL ELSE COALESCE(p_embeddingvectorbinary, NULL) END,
                CASE WHEN p_approvalcomments_clear = true THEN NULL ELSE COALESCE(p_approvalcomments, NULL) END,
                CASE WHEN p_approvedbyuserid_clear = true THEN NULL ELSE COALESCE(p_approvedbyuserid, NULL) END,
                CASE WHEN p_approvedat_clear = true THEN NULL ELSE COALESCE(p_approvedat, NULL) END,
                CASE WHEN p_approvedfingerprint_clear = true THEN NULL ELSE COALESCE(p_approvedfingerprint, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwQueries"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateQuery" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queries
-- Item: spUpdateQuery
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Query
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateQuery'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateQuery"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_userquestion_clear boolean DEFAULT false,
    p_userquestion TEXT DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_sql_clear boolean DEFAULT false,
    p_sql TEXT DEFAULT NULL,
    p_technicaldescription_clear boolean DEFAULT false,
    p_technicaldescription TEXT DEFAULT NULL,
    p_originalsql_clear boolean DEFAULT false,
    p_originalsql TEXT DEFAULT NULL,
    p_feedback_clear boolean DEFAULT false,
    p_feedback TEXT DEFAULT NULL,
    p_status varchar(15) DEFAULT NULL,
    p_qualityrank_clear boolean DEFAULT false,
    p_qualityrank int DEFAULT NULL,
    p_executioncostrank_clear boolean DEFAULT false,
    p_executioncostrank int DEFAULT NULL,
    p_usestemplate_clear boolean DEFAULT false,
    p_usestemplate BOOLEAN DEFAULT NULL,
    p_auditqueryruns BOOLEAN DEFAULT NULL,
    p_cacheenabled BOOLEAN DEFAULT NULL,
    p_cachettlminutes_clear boolean DEFAULT false,
    p_cachettlminutes int DEFAULT NULL,
    p_cachemaxsize_clear boolean DEFAULT false,
    p_cachemaxsize int DEFAULT NULL,
    p_embeddingvector_clear boolean DEFAULT false,
    p_embeddingvector TEXT DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_cachevalidationsql_clear boolean DEFAULT false,
    p_cachevalidationsql TEXT DEFAULT NULL,
    p_sqldialectid UUID DEFAULT NULL,
    p_reusable BOOLEAN DEFAULT NULL,
    p_externaldatasourceid_clear boolean DEFAULT false,
    p_externaldatasourceid UUID DEFAULT NULL,
    p_ismaterialized BOOLEAN DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_embeddingvectorbinary_clear boolean DEFAULT false,
    p_embeddingvectorbinary BYTEA DEFAULT NULL,
    p_approvalcomments_clear boolean DEFAULT false,
    p_approvalcomments TEXT DEFAULT NULL,
    p_approvedbyuserid_clear boolean DEFAULT false,
    p_approvedbyuserid UUID DEFAULT NULL,
    p_approvedat_clear boolean DEFAULT false,
    p_approvedat TIMESTAMPTZ DEFAULT NULL,
    p_approvedfingerprint_clear boolean DEFAULT false,
    p_approvedfingerprint varchar(100) DEFAULT NULL
) RETURNS SETOF "__mj"."vwQueries" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."Query"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "CategoryID" = CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, "CategoryID") END,
        "UserQuestion" = CASE WHEN p_userquestion_clear = true THEN NULL ELSE COALESCE(p_userquestion, "UserQuestion") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "SQL" = CASE WHEN p_sql_clear = true THEN NULL ELSE COALESCE(p_sql, "SQL") END,
        "TechnicalDescription" = CASE WHEN p_technicaldescription_clear = true THEN NULL ELSE COALESCE(p_technicaldescription, "TechnicalDescription") END,
        "OriginalSQL" = CASE WHEN p_originalsql_clear = true THEN NULL ELSE COALESCE(p_originalsql, "OriginalSQL") END,
        "Feedback" = CASE WHEN p_feedback_clear = true THEN NULL ELSE COALESCE(p_feedback, "Feedback") END,
        "Status" = COALESCE(p_status, "Status"),
        "QualityRank" = CASE WHEN p_qualityrank_clear = true THEN NULL ELSE COALESCE(p_qualityrank, "QualityRank") END,
        "ExecutionCostRank" = CASE WHEN p_executioncostrank_clear = true THEN NULL ELSE COALESCE(p_executioncostrank, "ExecutionCostRank") END,
        "UsesTemplate" = CASE WHEN p_usestemplate_clear = true THEN NULL ELSE COALESCE(p_usestemplate, "UsesTemplate") END,
        "AuditQueryRuns" = COALESCE(p_auditqueryruns, "AuditQueryRuns"),
        "CacheEnabled" = COALESCE(p_cacheenabled, "CacheEnabled"),
        "CacheTTLMinutes" = CASE WHEN p_cachettlminutes_clear = true THEN NULL ELSE COALESCE(p_cachettlminutes, "CacheTTLMinutes") END,
        "CacheMaxSize" = CASE WHEN p_cachemaxsize_clear = true THEN NULL ELSE COALESCE(p_cachemaxsize, "CacheMaxSize") END,
        "EmbeddingVector" = CASE WHEN p_embeddingvector_clear = true THEN NULL ELSE COALESCE(p_embeddingvector, "EmbeddingVector") END,
        "EmbeddingModelID" = CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, "EmbeddingModelID") END,
        "CacheValidationSQL" = CASE WHEN p_cachevalidationsql_clear = true THEN NULL ELSE COALESCE(p_cachevalidationsql, "CacheValidationSQL") END,
        "SQLDialectID" = COALESCE(p_sqldialectid, "SQLDialectID"),
        "Reusable" = COALESCE(p_reusable, "Reusable"),
        "ExternalDataSourceID" = CASE WHEN p_externaldatasourceid_clear = true THEN NULL ELSE COALESCE(p_externaldatasourceid, "ExternalDataSourceID") END,
        "IsMaterialized" = COALESCE(p_ismaterialized, "IsMaterialized"),
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END,
        "EmbeddingVectorBinary" = CASE WHEN p_embeddingvectorbinary_clear = true THEN NULL ELSE COALESCE(p_embeddingvectorbinary, "EmbeddingVectorBinary") END,
        "ApprovalComments" = CASE WHEN p_approvalcomments_clear = true THEN NULL ELSE COALESCE(p_approvalcomments, "ApprovalComments") END,
        "ApprovedByUserID" = CASE WHEN p_approvedbyuserid_clear = true THEN NULL ELSE COALESCE(p_approvedbyuserid, "ApprovedByUserID") END,
        "ApprovedAt" = CASE WHEN p_approvedat_clear = true THEN NULL ELSE COALESCE(p_approvedat, "ApprovedAt") END,
        "ApprovedFingerprint" = CASE WHEN p_approvedfingerprint_clear = true THEN NULL ELSE COALESCE(p_approvedfingerprint, "ApprovedFingerprint") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwQueries"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateQuery" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Query table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_query"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_query" ON "__mj"."Query";

CREATE TRIGGER "trg_update_query"
BEFORE UPDATE ON "__mj"."Query"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_query"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queries
-- Item: spDeleteQuery
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Query
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteQuery'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteQuery"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: Data Context Items.QueryID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."DataContextItem"
        WHERE "QueryID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."DataContextItem"
        SET "QueryID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Materialized Result Queries records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."MaterializedResultQuery"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteMaterializedResultQuery"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Dependencies records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QueryDependency"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQueryDependency"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Dependencies records via DependsOnQueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QueryDependency"
        WHERE "DependsOnQueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQueryDependency"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Entities records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QueryEntity"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQueryEntity"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Fields records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QueryField"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQueryField"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Parameters records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QueryParameter"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQueryParameter"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Permissions records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QueryPermission"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQueryPermission"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query SQLs records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QuerySQL"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQuerySQL"(v_rec."ID");
    END LOOP;

    
    DELETE FROM "__mj"."Query"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteQuery" TO "cdp_Integration";
