-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202609191814__v6.2.x__WebSearchProvider.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

/* ===================================================================================== */
/* Web Search Provider registry */
/* Creates the metadata table behind @memberjunction/web-search-engine: one row per external */
/* web search vendor, carrying the ClassFactory driver key, an admin on/off switch, ordering, */
/* and an optional credential link. */
/* Deliberately a near-mirror of __mj.SearchProvider so the two are learnable */
/* together. The tables are separate because the engines are: SearchProvider feeds the internal */
/* search engine, whose SearchResultItem requires EntityName and RecordID (the primary key of a */
/* source record). A web result has a URL and neither of those. */
/* Capability flags are NOT columns. Whether a driver can return a synthesized answer or honour */
/* a domain filter is a property of the driver implementation, declared on the class — exactly */
/* as SearchProvider declares SourceType. This table holds configuration only. */
/* ===================================================================================== */
CREATE TABLE __mj."WebSearchProvider" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "Name" VARCHAR(200) NOT NULL,
  "Description" TEXT NULL,
  "DriverClass" VARCHAR(500) NOT NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT 'Active',
  "Priority" INT NOT NULL DEFAULT 0,
  "CredentialID" UUID NULL,
  "ProviderConfig" TEXT NULL,
  "MaxResultsOverride" INT NULL,
  "AllowResultCaching" BOOLEAN NOT NULL DEFAULT FALSE,
  "DisplayName" VARCHAR(200) NULL,
  "Icon" VARCHAR(200) NULL,
  "Comments" TEXT NULL,
  CONSTRAINT "PK_WebSearchProvider" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_WebSearchProvider_Name" UNIQUE (
    "Name"
  ),
  CONSTRAINT "FK_WebSearchProvider_Credential" FOREIGN KEY ("CredentialID") REFERENCES __mj."Credential" (
    "ID"
  ),
  CONSTRAINT "CK_WebSearchProvider_Status" CHECK ("Status" IN ('Pending', 'Active', 'Terminated')),
  CONSTRAINT "CK_WebSearchProvider_Priority" CHECK ("Priority" >= 0),
  CONSTRAINT "CK_WebSearchProvider_MaxResultsOverride" CHECK ("MaxResultsOverride" IS NULL OR "MaxResultsOverride" > 0)
);

COMMENT ON TABLE __mj."WebSearchProvider" IS 'Registry of external web search vendors available to @memberjunction/web-search-engine. Each row configures one driver: whether it is active, its position in the failover order, and where its credential lives. Provider capabilities (answer synthesis, domain filtering, freshness) are declared by the driver class, not stored here.';

COMMENT ON COLUMN __mj."WebSearchProvider"."Name" IS 'Administrator-facing name for this provider, e.g. "Brave" or "Tavily". Unique, and usable as the Provider value when a caller pins a search to one vendor.';

COMMENT ON COLUMN __mj."WebSearchProvider"."Description" IS 'What this provider searches, what it costs, and when it is the right choice.';

COMMENT ON COLUMN __mj."WebSearchProvider"."DriverClass" IS 'ClassFactory key used with @RegisterClass(BaseWebSearchProvider, DriverClass) to instantiate the driver at runtime, e.g. "BraveWebSearchProvider". A value with no matching registration leaves the provider unavailable and is logged at engine startup.';

COMMENT ON COLUMN __mj."WebSearchProvider"."Status" IS 'Provider lifecycle status: Pending (configured but not yet in use), Active (participates in searches), Terminated (disabled). Only Active providers are loaded. Matches the vocabulary used by SearchProvider.';

COMMENT ON COLUMN __mj."WebSearchProvider"."Priority" IS 'Failover order: LOWER values are tried FIRST. The engine serves a search from the first available provider in this order, moving on only when one fails transiently. Must be >= 0.';

COMMENT ON COLUMN __mj."WebSearchProvider"."CredentialID" IS 'Optional FK to the Credential record holding this provider''s API key. When NULL the driver falls back to its documented environment variable, so a host that has not yet migrated its secrets into the Credential store keeps working.';

COMMENT ON COLUMN __mj."WebSearchProvider"."ProviderConfig" IS 'Optional JSON blob of non-secret, driver-specific settings (endpoint overrides, tier flags, answer model). Schema is defined by each driver; invalid JSON is logged and ignored rather than disabling the provider.';

COMMENT ON COLUMN __mj."WebSearchProvider"."MaxResultsOverride" IS 'Optional per-provider cap on results per request, for pay-per-query vendors. The effective cap is the smallest of the caller''s request, this value, and the vendor''s own hard limit. NULL means the driver''s own limit applies.';

COMMENT ON COLUMN __mj."WebSearchProvider"."AllowResultCaching" IS 'Whether this vendor''s terms permit storing returned results. Defaults to 0 (deny), because caching rights differ sharply between vendors and violating them is silent: some sell storage rights as a plan tier, others forbid persistent caching outright. Nothing in the engine caches today; this column exists so the first caching layer reads a per-provider gate instead of inventing one.';

COMMENT ON COLUMN __mj."WebSearchProvider"."DisplayName" IS 'UI display name shown in admin surfaces and result attribution. When NULL, falls back to the Name column.';

COMMENT ON COLUMN __mj."WebSearchProvider"."Icon" IS 'CSS icon class for UI display, e.g. "fa-brands fa-brave". Supports any CSS-based icon library. When NULL a default icon is used.';

COMMENT ON COLUMN __mj."WebSearchProvider"."Comments" IS 'Free-form administrator notes, e.g. contract terms, billing owner, or why this provider sits at its priority.';

/* ============================================================================= */
/* GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND */
/* ============================================================================= */
/* Everything below this block was produced by MemberJunction CodeGen after */
/* the hand-written DDL above. It contains: */
/*   * Entity record for WebSearchProvider (MJ: Web Search Providers) */
/*   * ApplicationEntity & EntityPermission grants */
/*   * EntityField records (apply-time dynamic Sequence) */
/*   * Auto-generated foreign key indexes */
/*   * Generated CRUD stored procedures (spCreate/spUpdate/spDelete) and update triggers */
/*   * Base view (vwWebSearchProviders) */
/* ============================================================================= */
/* SQL generated to create new entity MJ: Web Search Providers */
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
    '7b7d65a1-bf9f-4174-b4c7-0a98b0cd1f56',
    'MJ: Web Search Providers',
    'Web Search Providers',
    'Registry of external web search vendors available to @memberjunction/web-search-engine. Each row configures one driver: whether it is active, its position in the failover order, and where its credential lives. Provider capabilities (answer synthesis, domain filtering, freshness) are declared by the driver class, not stored here.',
    NULL,
    'WebSearchProvider',
    'vwWebSearchProviders',
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
/* SQL generated to add new entity MJ: Web Search Providers to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '7b7d65a1-bf9f-4174-b4c7-0a98b0cd1f56',
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
/* SQL generated to add new permission for entity MJ: Web Search Providers for role UI */
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
  CAST('7b7d65a1-bf9f-4174-b4c7-0a98b0cd1f56' AS UUID),
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
      "EntityID" = CAST('7b7d65a1-bf9f-4174-b4c7-0a98b0cd1f56' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Web Search Providers for role Developer */
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
  CAST('7b7d65a1-bf9f-4174-b4c7-0a98b0cd1f56' AS UUID),
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
      "EntityID" = CAST('7b7d65a1-bf9f-4174-b4c7-0a98b0cd1f56' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Web Search Providers for role Integration */
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
  CAST('7b7d65a1-bf9f-4174-b4c7-0a98b0cd1f56' AS UUID),
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
      "EntityID" = CAST('7b7d65a1-bf9f-4174-b4c7-0a98b0cd1f56' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
ALTER TABLE __mj."WebSearchProvider"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.WebSearchProvider */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.WebSearchProvider */
UPDATE __mj."WebSearchProvider" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'WebSearchProvider' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."WebSearchProvider" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."WebSearchProvider" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."WebSearchProvider"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.WebSearchProvider */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.WebSearchProvider */
UPDATE __mj."WebSearchProvider" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'WebSearchProvider' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."WebSearchProvider" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."WebSearchProvider" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c38c8218-02c0-4d7c-8fe6-daf0834e81a8' OR ("EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c38c8218-02c0-4d7c-8fe6-daf0834e81a8', '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' /* Entity: MJ: Web Search Providers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd7982d88-ba05-4374-bd81-e8938d3ab09c' OR ("EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d7982d88-ba05-4374-bd81-e8938d3ab09c', '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' /* Entity: MJ: Web Search Providers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'), 'Name', 'Name', 'Administrator-facing name for this provider, e.g. "Brave" or "Tavily". Unique, and usable as the Provider value when a caller pins a search to one vendor.', 'nvarchar', 400, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '11384fc5-8bfd-4bcd-a455-564b89d6d763' OR ("EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('11384fc5-8bfd-4bcd-a455-564b89d6d763', '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' /* Entity: MJ: Web Search Providers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'), 'Description', 'Description', 'What this provider searches, what it costs, and when it is the right choice.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9eead17c-322a-4c71-9ec5-25f099e64222' OR ("EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND "Name" = 'DriverClass')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9eead17c-322a-4c71-9ec5-25f099e64222', '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' /* Entity: MJ: Web Search Providers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'), 'DriverClass', 'Driver Class', 'ClassFactory key used with @RegisterClass(BaseWebSearchProvider, DriverClass) to instantiate the driver at runtime, e.g. "BraveWebSearchProvider". A value with no matching registration leaves the provider unavailable and is logged at engine startup.', 'nvarchar', 1000, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0a02e01a-501b-4b28-b237-248626a34eb8' OR ("EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0a02e01a-501b-4b28-b237-248626a34eb8', '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' /* Entity: MJ: Web Search Providers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'), 'Status', 'Status', 'Provider lifecycle status: Pending (configured but not yet in use), Active (participates in searches), Terminated (disabled). Only Active providers are loaded. Matches the vocabulary used by SearchProvider.', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1b80a062-a8e5-4710-8c8e-6925157df040' OR ("EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND "Name" = 'Priority')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1b80a062-a8e5-4710-8c8e-6925157df040', '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' /* Entity: MJ: Web Search Providers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'), 'Priority', 'Priority', 'Failover order: LOWER values are tried FIRST. The engine serves a search from the first available provider in this order, moving on only when one fails transiently. Must be >= 0.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5d9769bd-7f8b-47e5-866a-a76b90d0090c' OR ("EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND "Name" = 'CredentialID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5d9769bd-7f8b-47e5-866a-a76b90d0090c', '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' /* Entity: MJ: Web Search Providers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'), 'CredentialID', 'Credential ID', 'Optional FK to the Credential record holding this provider''s API key. When NULL the driver falls back to its documented environment variable, so a host that has not yet migrated its secrets into the Credential store keeps working.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f3e7c203-2ea2-451b-a07b-9aee0b99004a' OR ("EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND "Name" = 'ProviderConfig')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f3e7c203-2ea2-451b-a07b-9aee0b99004a', '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' /* Entity: MJ: Web Search Providers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'), 'ProviderConfig', 'Provider Config', 'Optional JSON blob of non-secret, driver-specific settings (endpoint overrides, tier flags, answer model). Schema is defined by each driver; invalid JSON is logged and ignored rather than disabling the provider.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '719177fb-3a1e-4b34-87e5-31a376222a02' OR ("EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND "Name" = 'MaxResultsOverride')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('719177fb-3a1e-4b34-87e5-31a376222a02', '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' /* Entity: MJ: Web Search Providers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'), 'MaxResultsOverride', 'Max Results Override', 'Optional per-provider cap on results per request, for pay-per-query vendors. The effective cap is the smallest of the caller''s request, this value, and the vendor''s own hard limit. NULL means the driver''s own limit applies.', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4ab5bca2-5d24-4e4e-b6d5-3be5ed36816e' OR ("EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND "Name" = 'AllowResultCaching')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4ab5bca2-5d24-4e4e-b6d5-3be5ed36816e', '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' /* Entity: MJ: Web Search Providers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'), 'AllowResultCaching', 'Allow Result Caching', 'Whether this vendor''s terms permit storing returned results. Defaults to 0 (deny), because caching rights differ sharply between vendors and violating them is silent: some sell storage rights as a plan tier, others forbid persistent caching outright. Nothing in the engine caches today; this column exists so the first caching layer reads a per-provider gate instead of inventing one.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '003c9848-beaf-42a7-9b88-fcbd1a3298b1' OR ("EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND "Name" = 'DisplayName')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('003c9848-beaf-42a7-9b88-fcbd1a3298b1', '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' /* Entity: MJ: Web Search Providers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'), 'DisplayName', 'Display Name', 'UI display name shown in admin surfaces and result attribution. When NULL, falls back to the Name column.', 'nvarchar', 400, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '32607248-aad9-4797-88eb-8b86294746e9' OR ("EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND "Name" = 'Icon')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('32607248-aad9-4797-88eb-8b86294746e9', '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' /* Entity: MJ: Web Search Providers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'), 'Icon', 'Icon', 'CSS icon class for UI display, e.g. "fa-brands fa-brave". Supports any CSS-based icon library. When NULL a default icon is used.', 'nvarchar', 400, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '187854f9-2870-459b-a089-0fc30b9d845e' OR ("EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND "Name" = 'Comments')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('187854f9-2870-459b-a089-0fc30b9d845e', '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' /* Entity: MJ: Web Search Providers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'), 'Comments', 'Comments', 'Free-form administrator notes, e.g. contract terms, billing owner, or why this provider sits at its priority.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8a4a3001-c450-41f2-b67f-bec55c01f3a1' OR ("EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8a4a3001-c450-41f2-b67f-bec55c01f3a1', '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' /* Entity: MJ: Web Search Providers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b5813667-6134-4ab2-8027-45b0a6c708d5' OR ("EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b5813667-6134-4ab2-8027-45b0a6c708d5', '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' /* Entity: MJ: Web Search Providers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID 506babc9-0bdb-4661-8432-86e7cc9de726 */
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
    '506babc9-0bdb-4661-8432-86e7cc9de726',
    '0A02E01A-501B-4B28-B237-248626A34EB8',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID ab48db5b-1285-4a31-acbd-b9477248906e */
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
    'ab48db5b-1285-4a31-acbd-b9477248906e',
    '0A02E01A-501B-4B28-B237-248626A34EB8',
    2,
    'Pending',
    'Pending',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID a7b64548-d511-4889-9f07-388819ade434 */
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
    'a7b64548-d511-4889-9f07-388819ade434',
    '0A02E01A-501B-4B28-B237-248626A34EB8',
    3,
    'Terminated',
    'Terminated',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 0A02E01A-501B-4B28-B237-248626A34EB8 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '0A02E01A-501B-4B28-B237-248626A34EB8';
/* Create Entity Relationship: MJ: Credentials -> MJ: Web Search Providers (One To Many via CredentialID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '3865902d-bc19-403e-bbf3-d181f5437a02') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3865902d-bc19-403e-bbf3-d181f5437a02', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56', 'CredentialID', 'One To Many', TRUE, TRUE, 12, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e366c33e-76b4-44fe-b1ee-04edb1188493' OR ("EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND "Name" = 'Credential')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e366c33e-76b4-44fe-b1ee-04edb1188493', '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' /* Entity: MJ: Web Search Providers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'), 'Credential', 'Credential', NULL, 'nvarchar', 400, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Web Search Providers
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_web_search_provider_credential_id"
    ON "__mj"."WebSearchProvider" ("CredentialID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Web Search Providers
-- Item: vwWebSearchProviders
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Web Search Providers
-----               SCHEMA:      __mj
-----               BASE TABLE:  WebSearchProvider
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwWebSearchProviders"
AS
SELECT
    w.*,
    MJCredential_CredentialID."Name" AS "Credential"
FROM
    "__mj"."WebSearchProvider" AS w
LEFT OUTER JOIN
    "__mj"."Credential" AS MJCredential_CredentialID
  ON
    "w"."CredentialID" = MJCredential_CredentialID."ID"
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
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwWebSearchProviders'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

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
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwWebSearchProviders'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwWebSearchProviders'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "__mj"."vwWebSearchProviders" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
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
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwWebSearchProviders" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwWebSearchProviders" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwWebSearchProviders" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Web Search Providers
-- Item: spCreateWebSearchProvider
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR WebSearchProvider
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateWebSearchProvider'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateWebSearchProvider"(
    p_id UUID DEFAULT NULL,
    p_name varchar(200) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_driverclass varchar(500) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_priority int DEFAULT NULL,
    p_credentialid_clear boolean DEFAULT false,
    p_credentialid UUID DEFAULT NULL,
    p_providerconfig_clear boolean DEFAULT false,
    p_providerconfig TEXT DEFAULT NULL,
    p_maxresultsoverride_clear boolean DEFAULT false,
    p_maxresultsoverride int DEFAULT NULL,
    p_allowresultcaching BOOLEAN DEFAULT NULL,
    p_displayname_clear boolean DEFAULT false,
    p_displayname varchar(200) DEFAULT NULL,
    p_icon_clear boolean DEFAULT false,
    p_icon varchar(200) DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwWebSearchProviders" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."WebSearchProvider"
        (
            "ID",
            "Name",
                "Description",
                "DriverClass",
                "Status",
                "Priority",
                "CredentialID",
                "ProviderConfig",
                "MaxResultsOverride",
                "AllowResultCaching",
                "DisplayName",
                "Icon",
                "Comments"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_driverclass,
                COALESCE(p_status, 'Active'),
                COALESCE(p_priority, 0),
                CASE WHEN p_credentialid_clear = true THEN NULL ELSE COALESCE(p_credentialid, NULL) END,
                CASE WHEN p_providerconfig_clear = true THEN NULL ELSE COALESCE(p_providerconfig, NULL) END,
                CASE WHEN p_maxresultsoverride_clear = true THEN NULL ELSE COALESCE(p_maxresultsoverride, NULL) END,
                COALESCE(p_allowresultcaching, FALSE),
                CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, NULL) END,
                CASE WHEN p_icon_clear = true THEN NULL ELSE COALESCE(p_icon, NULL) END,
                CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwWebSearchProviders"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateWebSearchProvider" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateWebSearchProvider" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Web Search Providers
-- Item: spUpdateWebSearchProvider
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR WebSearchProvider
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateWebSearchProvider'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateWebSearchProvider"(
    p_id UUID,
    p_name varchar(200) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_driverclass varchar(500) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_priority int DEFAULT NULL,
    p_credentialid_clear boolean DEFAULT false,
    p_credentialid UUID DEFAULT NULL,
    p_providerconfig_clear boolean DEFAULT false,
    p_providerconfig TEXT DEFAULT NULL,
    p_maxresultsoverride_clear boolean DEFAULT false,
    p_maxresultsoverride int DEFAULT NULL,
    p_allowresultcaching BOOLEAN DEFAULT NULL,
    p_displayname_clear boolean DEFAULT false,
    p_displayname varchar(200) DEFAULT NULL,
    p_icon_clear boolean DEFAULT false,
    p_icon varchar(200) DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwWebSearchProviders" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."WebSearchProvider"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "DriverClass" = COALESCE(p_driverclass, "DriverClass"),
        "Status" = COALESCE(p_status, "Status"),
        "Priority" = COALESCE(p_priority, "Priority"),
        "CredentialID" = CASE WHEN p_credentialid_clear = true THEN NULL ELSE COALESCE(p_credentialid, "CredentialID") END,
        "ProviderConfig" = CASE WHEN p_providerconfig_clear = true THEN NULL ELSE COALESCE(p_providerconfig, "ProviderConfig") END,
        "MaxResultsOverride" = CASE WHEN p_maxresultsoverride_clear = true THEN NULL ELSE COALESCE(p_maxresultsoverride, "MaxResultsOverride") END,
        "AllowResultCaching" = COALESCE(p_allowresultcaching, "AllowResultCaching"),
        "DisplayName" = CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, "DisplayName") END,
        "Icon" = CASE WHEN p_icon_clear = true THEN NULL ELSE COALESCE(p_icon, "Icon") END,
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwWebSearchProviders"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateWebSearchProvider" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateWebSearchProvider" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the WebSearchProvider table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_web_search_provider"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_web_search_provider" ON "__mj"."WebSearchProvider";

CREATE TRIGGER "trg_update_web_search_provider"
BEFORE UPDATE ON "__mj"."WebSearchProvider"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_web_search_provider"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Web Search Providers
-- Item: spDeleteWebSearchProvider
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR WebSearchProvider
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteWebSearchProvider'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteWebSearchProvider"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."WebSearchProvider"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteWebSearchProvider" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteWebSearchProvider" TO "cdp_Integration";
