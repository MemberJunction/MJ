-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202607031200__v5.45.x__External_Data_Sources.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

/* ============================================================================
   External Data Sources — Phase 1 Schema (Metadata Foundation)
   v5.45.x

   Companion plan: /plans/external-data-sources.md (design)

   Introduces the "External Data Sources" primitive: live, runtime-proxied
   access to remote data systems (Snowflake, Oracle, MongoDB, external
   SQL Server / PostgreSQL / MySQL). Distinct from VirtualEntity (same MJ DB,
   view-backed) and from Integrations (scheduled pull-sync). Mirrors the
   Credential Types / Credentials Type/Instance split and plugs into the
   Credential Engine for secrets.

   Tables (all new; no destructive changes):
     ExternalDataSourceType  — driver-type catalog (@RegisterClass driver key
                               + capability flags). References a Credential Type
                               to constrain valid credential shapes.
     ExternalDataSource      — configured instances (-> Credential for auth,
                               -> ExternalDataSourceType for driver).

   Existing tables altered (additive, nullable only):
     Entity  + ExternalDataSourceID (FK), ExternalObjectName
     Query   + ExternalDataSourceID (FK)

   Behavior is fully additive: every entity/query with ExternalDataSourceID
   NULL (the default — i.e. all existing rows) is unchanged.

   CodeGen convention (per CLAUDE.md migrations guide):
     * NO __mj_CreatedAt / __mj_UpdatedAt columns — CodeGen adds + triggers them.
     * NO foreign-key indexes — CodeGen creates IDX_AUTO_MJ_FKEY_* automatically.
     * sp_addextendedproperty for every non-PK / non-FK column so CodeGen
       surfaces descriptions on regen.
     * Driver-type catalog rows are seeded via metadata files
       (metadata/external-data-source-types/), NOT SQL INSERTs.

   Entity metadata, views, and spCreate/Update/Delete are produced by CodeGen
   after this migration runs.
   ============================================================================ */
/* ============================================================================ */
/* 1. ExternalDataSourceType  ("MJ: External Data Source Types") — driver catalog */
/* ============================================================================ */
CREATE TABLE __mj."ExternalDataSourceType" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "Name" VARCHAR(100) NOT NULL,
  "Description" TEXT NULL,
  "DriverClass" VARCHAR(255) NOT NULL,
  "RequiredCredentialTypeID" UUID NULL,
  "MetadataIntrospectionStrategy" VARCHAR(17) NOT NULL CONSTRAINT "DF_ExternalDataSourceType_MetadataIntrospectionStrategy" DEFAULT (
    'Manual'
  ),
  "FilterDialect" VARCHAR(9) NOT NULL CONSTRAINT "DF_ExternalDataSourceType_FilterDialect" DEFAULT (
    'ansi'
  ),
  "PagingStrategy" VARCHAR(11) NOT NULL CONSTRAINT "DF_ExternalDataSourceType_PagingStrategy" DEFAULT (
    'LimitOffset'
  ),
  "SupportsSchemaIntrospection" BOOLEAN NOT NULL CONSTRAINT "DF_ExternalDataSourceType_SupportsSchemaIntrospection" DEFAULT TRUE,
  "SupportsNativeQueries" BOOLEAN NOT NULL CONSTRAINT "DF_ExternalDataSourceType_SupportsNativeQueries" DEFAULT TRUE,
  "SupportsReadWrite" BOOLEAN NOT NULL CONSTRAINT "DF_ExternalDataSourceType_SupportsReadWrite" DEFAULT FALSE,
  "Status" VARCHAR(10) NOT NULL CONSTRAINT "DF_ExternalDataSourceType_Status" DEFAULT (
    'Active'
  ),
  CONSTRAINT "PK_ExternalDataSourceType" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_ExternalDataSourceType_Name" UNIQUE (
    "Name"
  ),
  CONSTRAINT "FK_ExternalDataSourceType_CredentialType" FOREIGN KEY ("RequiredCredentialTypeID") REFERENCES __mj."CredentialType" (
    "ID"
  ),
  CONSTRAINT "CK_ExternalDataSourceType_MetadataIntrospectionStrategy" CHECK ("MetadataIntrospectionStrategy" IN ('InformationSchema', 'NativeCatalog', 'SampledDocuments', 'Manual')),
  CONSTRAINT "CK_ExternalDataSourceType_FilterDialect" CHECK ("FilterDialect" IN ('tsql', 'ansi', 'pgsql', 'mysql', 'oracle', 'mongo-ast')),
  CONSTRAINT "CK_ExternalDataSourceType_PagingStrategy" CHECK ("PagingStrategy" IN ('OffsetFetch', 'LimitOffset', 'TopSkip', 'Cursor')),
  CONSTRAINT "CK_ExternalDataSourceType_Status" CHECK ("Status" IN ('Active', 'Deprecated'))
);

COMMENT ON COLUMN __mj."ExternalDataSourceType"."Name" IS 'Display name of the external data source driver type (e.g. Snowflake, Oracle, MongoDB, PostgreSQL).';

COMMENT ON COLUMN __mj."ExternalDataSourceType"."Description" IS 'Human-readable description of the driver type and what remote systems it targets.';

COMMENT ON COLUMN __mj."ExternalDataSourceType"."DriverClass" IS 'Driver class resolved at runtime via MJGlobal.ClassFactory.CreateInstance(BaseExternalDataSourceDriver, DriverClass). MUST match the @RegisterClass key on the concrete driver (e.g. ''SnowflakeExternalDriver'').';

COMMENT ON COLUMN __mj."ExternalDataSourceType"."MetadataIntrospectionStrategy" IS 'How the metadata-introspection command hydrates Entity/EntityField rows from this driver family: InformationSchema (ANSI INFORMATION_SCHEMA), NativeCatalog (vendor catalog views), SampledDocuments (infer shape from sampled documents, e.g. MongoDB), or Manual (no automated introspection).';

COMMENT ON COLUMN __mj."ExternalDataSourceType"."FilterDialect" IS 'Dialect the driver expects for RunView filter pass-through: tsql, ansi, pgsql, mysql, oracle, or mongo-ast (MongoDB filter AST translated within the driver).';

COMMENT ON COLUMN __mj."ExternalDataSourceType"."PagingStrategy" IS 'Pagination mechanism the driver uses: OffsetFetch (SQL Server OFFSET/FETCH), LimitOffset (Postgres/MySQL LIMIT/OFFSET), TopSkip, or Cursor.';

COMMENT ON COLUMN __mj."ExternalDataSourceType"."SupportsSchemaIntrospection" IS 'Whether the driver can introspect remote schema metadata to assist Entity/EntityField generation.';

COMMENT ON COLUMN __mj."ExternalDataSourceType"."SupportsNativeQueries" IS 'Whether the driver supports native-dialect query execution for MJ Queries that set ExternalDataSourceID.';

COMMENT ON COLUMN __mj."ExternalDataSourceType"."SupportsReadWrite" IS 'Reserved for a future write-capable phase. Always 0 in the current read-only design; external entities are read-only.';

COMMENT ON COLUMN __mj."ExternalDataSourceType"."Status" IS 'Lifecycle status of the driver-type catalog entry: Active or Deprecated.';

/* ============================================================================ */
/* 2. ExternalDataSource  ("MJ: External Data Sources") — configured instances */
/* ============================================================================ */
CREATE TABLE __mj."ExternalDataSource" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "Name" VARCHAR(100) NOT NULL,
  "Description" TEXT NULL,
  "TypeID" UUID NOT NULL,
  "CredentialID" UUID NULL,
  "DefaultSchema" VARCHAR(255) NULL,
  "DefaultDatabase" VARCHAR(255) NULL,
  "ConnectionConfig" TEXT NULL,
  "DefaultCacheTTLSeconds" INT NOT NULL CONSTRAINT "DF_ExternalDataSource_DefaultCacheTTLSeconds" DEFAULT (
    300
  ),
  "Status" VARCHAR(10) NOT NULL CONSTRAINT "DF_ExternalDataSource_Status" DEFAULT (
    'Active'
  ),
  "LastConnectionTestAt" TIMESTAMPTZ NULL,
  "LastConnectionTestResult" TEXT NULL,
  CONSTRAINT "PK_ExternalDataSource" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_ExternalDataSource_Name" UNIQUE (
    "Name"
  ),
  CONSTRAINT "FK_ExternalDataSource_ExternalDataSourceType" FOREIGN KEY ("TypeID") REFERENCES __mj."ExternalDataSourceType" (
    "ID"
  ),
  CONSTRAINT "FK_ExternalDataSource_Credential" FOREIGN KEY ("CredentialID") REFERENCES __mj."Credential" (
    "ID"
  ),
  CONSTRAINT "CK_ExternalDataSource_Status" CHECK ("Status" IN ('Active', 'Disabled', 'TestFailed'))
);

COMMENT ON COLUMN __mj."ExternalDataSource"."Name" IS 'Display name of this configured external data source instance.';

COMMENT ON COLUMN __mj."ExternalDataSource"."Description" IS 'Human-readable description of what this data source connects to and what it is used for.';

COMMENT ON COLUMN __mj."ExternalDataSource"."DefaultSchema" IS 'Default schema/namespace to resolve unqualified ExternalObjectName values against on the remote system (e.g. a SQL schema, Snowflake schema).';

COMMENT ON COLUMN __mj."ExternalDataSource"."DefaultDatabase" IS 'Default database/catalog on the remote system (e.g. Snowflake database, MongoDB dbName). Nullable when the driver derives it from connection config.';

COMMENT ON COLUMN __mj."ExternalDataSource"."ConnectionConfig" IS 'JSON blob of NON-SECRET driver configuration (host, port, region, warehouse, replica-set name, pool sizing). All secrets flow through CredentialID -> Credential -> CredentialEngine; never store secrets here.';

COMMENT ON COLUMN __mj."ExternalDataSource"."DefaultCacheTTLSeconds" IS 'Default server-side cache TTL (seconds) for reads against this source. External reads use time-based TTL because no event-driven invalidation is possible on remote systems. Default 300.';

COMMENT ON COLUMN __mj."ExternalDataSource"."Status" IS 'Operational status of this data source: Active (usable), Disabled (RunView fails fast), or TestFailed (last connection test failed).';

COMMENT ON COLUMN __mj."ExternalDataSource"."LastConnectionTestAt" IS 'Timestamp of the most recent connection test against this source.';

COMMENT ON COLUMN __mj."ExternalDataSource"."LastConnectionTestResult" IS 'Result message from the most recent connection test (success detail or error text).';

ALTER TABLE __mj."Entity"
  ADD COLUMN "ExternalDataSourceID" UUID NULL,
  ADD COLUMN "ExternalObjectName" VARCHAR(255) NULL
 /* ============================================================================ */ /* 3. Entity  — add nullable external-source columns (additive) */ /*    ExternalDataSourceID NULL  => entity is backed by the MJ DB (unchanged). */ /* ============================================================================ */;

ALTER TABLE __mj."Entity"
  ADD CONSTRAINT "FK_Entity_ExternalDataSource" FOREIGN KEY ("ExternalDataSourceID") REFERENCES __mj."ExternalDataSource" (
    "ID"
  );

COMMENT ON COLUMN __mj."Entity"."ExternalObjectName" IS 'Remote object name (table / view / collection) on the external system that backs this entity. Resolved against the data source DefaultSchema/DefaultDatabase when unqualified. Only meaningful when ExternalDataSourceID is set.';

ALTER TABLE __mj."Query"
ADD COLUMN "ExternalDataSourceID" UUID NULL /* ============================================================================ */ /* 4. Query  — add nullable external-source column (additive) */ /*    ExternalDataSourceID NULL  => query runs against the MJ DB (unchanged). */ /* ============================================================================ */;

ALTER TABLE __mj."Query"
  ADD CONSTRAINT "FK_Query_ExternalDataSource" FOREIGN KEY ("ExternalDataSourceID") REFERENCES __mj."ExternalDataSource" (
    "ID"
  );

/* ============================================================================ */
/* CodeGen output (entity metadata, views, spCreate/Update/Delete, permissions) */
/* Generated by mj codegen for the External Data Sources entities; folded into */
/* this migration per repo convention (single V-named migration per feature). */
/* ============================================================================ */
/* SQL generated to create new entity MJ: External Data Source Types */
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
    'cdade3e4-d00a-42e7-b385-ce24d533101e',
    'MJ: External Data Source Types',
    'External Data Source Types',
    NULL,
    NULL,
    'ExternalDataSourceType',
    'vwExternalDataSourceTypes',
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
/* SQL generated to add new entity MJ: External Data Source Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'cdade3e4-d00a-42e7-b385-ce24d533101e',
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
/* SQL generated to add new permission for entity MJ: External Data Source Types for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'cdade3e4-d00a-42e7-b385-ce24d533101e',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: External Data Source Types for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'cdade3e4-d00a-42e7-b385-ce24d533101e',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: External Data Source Types for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'cdade3e4-d00a-42e7-b385-ce24d533101e',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to create new entity MJ: External Data Sources */
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
    '078e485b-0cc4-4e2a-adb8-52fe8e571e88',
    'MJ: External Data Sources',
    'External Data Sources',
    NULL,
    NULL,
    'ExternalDataSource',
    'vwExternalDataSources',
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
/* SQL generated to add new entity MJ: External Data Sources to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '078e485b-0cc4-4e2a-adb8-52fe8e571e88',
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
/* SQL generated to add new permission for entity MJ: External Data Sources for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '078e485b-0cc4-4e2a-adb8-52fe8e571e88',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: External Data Sources for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '078e485b-0cc4-4e2a-adb8-52fe8e571e88',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: External Data Sources for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '078e485b-0cc4-4e2a-adb8-52fe8e571e88',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
ALTER TABLE __mj."ExternalDataSource"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.ExternalDataSource */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.ExternalDataSource */
UPDATE __mj."ExternalDataSource" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'ExternalDataSource' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."ExternalDataSource" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."ExternalDataSource" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."ExternalDataSource"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.ExternalDataSource */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.ExternalDataSource */
UPDATE __mj."ExternalDataSource" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'ExternalDataSource' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."ExternalDataSource" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."ExternalDataSource" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."ExternalDataSourceType"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.ExternalDataSourceType */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.ExternalDataSourceType */
UPDATE __mj."ExternalDataSourceType" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'ExternalDataSourceType' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."ExternalDataSourceType" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."ExternalDataSourceType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."ExternalDataSourceType"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.ExternalDataSourceType */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.ExternalDataSourceType */
UPDATE __mj."ExternalDataSourceType" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'ExternalDataSourceType' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."ExternalDataSourceType" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."ExternalDataSourceType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd6073a31-6099-4cb8-90bd-764a3f3382b9' OR ("EntityID" = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d6073a31-6099-4cb8-90bd-764a3f3382b9', '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' /* Entity: MJ: External Data Sources */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a3403700-67f4-4863-b46a-44b4e1eb7487' OR ("EntityID" = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a3403700-67f4-4863-b46a-44b4e1eb7487', '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' /* Entity: MJ: External Data Sources */, 100002, 'Name', 'Name', 'Display name of this configured external data source instance.', 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '27bea194-5df9-4c96-a599-51f27fe862dc' OR ("EntityID" = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('27bea194-5df9-4c96-a599-51f27fe862dc', '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' /* Entity: MJ: External Data Sources */, 100003, 'Description', 'Description', 'Human-readable description of what this data source connects to and what it is used for.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6aafa18f-a053-49ca-9277-88cc7d74dca7' OR ("EntityID" = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND "Name" = 'TypeID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6aafa18f-a053-49ca-9277-88cc7d74dca7', '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' /* Entity: MJ: External Data Sources */, 100004, 'TypeID', 'Type ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'CDADE3E4-D00A-42E7-B385-CE24D533101E', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5625762c-9349-45ed-ac3a-fc69477f9f68' OR ("EntityID" = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND "Name" = 'CredentialID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5625762c-9349-45ed-ac3a-fc69477f9f68', '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' /* Entity: MJ: External Data Sources */, 100005, 'CredentialID', 'Credential ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '77dbb445-ec5d-4a83-9fed-70a377d61cf6' OR ("EntityID" = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND "Name" = 'DefaultSchema')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('77dbb445-ec5d-4a83-9fed-70a377d61cf6', '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' /* Entity: MJ: External Data Sources */, 100006, 'DefaultSchema', 'Default Schema', 'Default schema/namespace to resolve unqualified ExternalObjectName values against on the remote system (e.g. a SQL schema, Snowflake schema).', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1dafdef8-3233-4516-a637-79480f58453c' OR ("EntityID" = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND "Name" = 'DefaultDatabase')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1dafdef8-3233-4516-a637-79480f58453c', '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' /* Entity: MJ: External Data Sources */, 100007, 'DefaultDatabase', 'Default Database', 'Default database/catalog on the remote system (e.g. Snowflake database, MongoDB dbName). Nullable when the driver derives it from connection config.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '723f7529-11d7-48af-b83e-98e405747fab' OR ("EntityID" = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND "Name" = 'ConnectionConfig')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('723f7529-11d7-48af-b83e-98e405747fab', '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' /* Entity: MJ: External Data Sources */, 100008, 'ConnectionConfig', 'Connection Config', 'JSON blob of NON-SECRET driver configuration (host, port, region, warehouse, replica-set name, pool sizing). All secrets flow through CredentialID -> Credential -> CredentialEngine; never store secrets here.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'afaa651d-9cec-40f2-aa8d-eb6bd2420d7d' OR ("EntityID" = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND "Name" = 'DefaultCacheTTLSeconds')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('afaa651d-9cec-40f2-aa8d-eb6bd2420d7d', '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' /* Entity: MJ: External Data Sources */, 100009, 'DefaultCacheTTLSeconds', 'Default Cache TTL Seconds', 'Default server-side cache TTL (seconds) for reads against this source. External reads use time-based TTL because no event-driven invalidation is possible on remote systems. Default 300.', 'int', 4, 10, 0, FALSE, '(300)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6c0236eb-792e-4a66-a780-1c5c96932aeb' OR ("EntityID" = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6c0236eb-792e-4a66-a780-1c5c96932aeb', '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' /* Entity: MJ: External Data Sources */, 100010, 'Status', 'Status', 'Operational status of this data source: Active (usable), Disabled (RunView fails fast), or TestFailed (last connection test failed).', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '48af73c5-cb4f-49fc-81bf-e6feef4a9101' OR ("EntityID" = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND "Name" = 'LastConnectionTestAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('48af73c5-cb4f-49fc-81bf-e6feef4a9101', '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' /* Entity: MJ: External Data Sources */, 100011, 'LastConnectionTestAt', 'Last Connection Test At', 'Timestamp of the most recent connection test against this source.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bb311195-2b60-4079-a546-a2e96dba0a02' OR ("EntityID" = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND "Name" = 'LastConnectionTestResult')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bb311195-2b60-4079-a546-a2e96dba0a02', '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' /* Entity: MJ: External Data Sources */, 100012, 'LastConnectionTestResult', 'Last Connection Test Result', 'Result message from the most recent connection test (success detail or error text).', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1c9f2d93-8433-4af4-8d54-daf305cb487e' OR ("EntityID" = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1c9f2d93-8433-4af4-8d54-daf305cb487e', '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' /* Entity: MJ: External Data Sources */, 100013, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fddf0eec-6a23-430c-b2cd-85335cfa3bb7' OR ("EntityID" = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fddf0eec-6a23-430c-b2cd-85335cfa3bb7', '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' /* Entity: MJ: External Data Sources */, 100014, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3c919dae-c8e3-46be-a0b7-a7c96b56dfa8' OR ("EntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'ExternalDataSourceID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3c919dae-c8e3-46be-a0b7-a7c96b56dfa8', 'E0238F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Entities */, 100139, 'ExternalDataSourceID', 'External Data Source ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '078E485B-0CC4-4E2A-ADB8-52FE8E571E88', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f1ec0ed5-1bfa-4170-8ab5-67d57e63375e' OR ("EntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'ExternalObjectName')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f1ec0ed5-1bfa-4170-8ab5-67d57e63375e', 'E0238F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Entities */, 100140, 'ExternalObjectName', 'External Object Name', 'Remote object name (table / view / collection) on the external system that backs this entity. Resolved against the data source DefaultSchema/DefaultDatabase when unqualified. Only meaningful when ExternalDataSourceID is set.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a0dc54c5-5cf5-4753-94f7-bf85b38c4a35' OR ("EntityID" = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'ExternalDataSourceID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a0dc54c5-5cf5-4753-94f7-bf85b38c4a35', '1B248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Queries */, 100053, 'ExternalDataSourceID', 'External Data Source ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '078E485B-0CC4-4E2A-ADB8-52FE8E571E88', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7d64f1b8-273c-4ade-bc2a-15919cc1f0aa' OR ("EntityID" = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7d64f1b8-273c-4ade-bc2a-15919cc1f0aa', 'CDADE3E4-D00A-42E7-B385-CE24D533101E' /* Entity: MJ: External Data Source Types */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bf3525c4-6278-483d-9ad8-4ccb8a01f205' OR ("EntityID" = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bf3525c4-6278-483d-9ad8-4ccb8a01f205', 'CDADE3E4-D00A-42E7-B385-CE24D533101E' /* Entity: MJ: External Data Source Types */, 100002, 'Name', 'Name', 'Display name of the external data source driver type (e.g. Snowflake, Oracle, MongoDB, PostgreSQL).', 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7ead289c-ac6a-494b-bbf4-f45f7e0d2489' OR ("EntityID" = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7ead289c-ac6a-494b-bbf4-f45f7e0d2489', 'CDADE3E4-D00A-42E7-B385-CE24D533101E' /* Entity: MJ: External Data Source Types */, 100003, 'Description', 'Description', 'Human-readable description of the driver type and what remote systems it targets.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f8d853c5-4361-4101-a0e9-398ace90071a' OR ("EntityID" = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND "Name" = 'DriverClass')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f8d853c5-4361-4101-a0e9-398ace90071a', 'CDADE3E4-D00A-42E7-B385-CE24D533101E' /* Entity: MJ: External Data Source Types */, 100004, 'DriverClass', 'Driver Class', 'Driver class resolved at runtime via MJGlobal.ClassFactory.CreateInstance(BaseExternalDataSourceDriver, DriverClass). MUST match the @RegisterClass key on the concrete driver (e.g. ''SnowflakeExternalDriver'').', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '40913359-7e31-4c54-a11c-298c83b3d5e5' OR ("EntityID" = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND "Name" = 'RequiredCredentialTypeID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('40913359-7e31-4c54-a11c-298c83b3d5e5', 'CDADE3E4-D00A-42E7-B385-CE24D533101E' /* Entity: MJ: External Data Source Types */, 100005, 'RequiredCredentialTypeID', 'Required Credential Type ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'D512FF2E-A140-45A2-979A-20657AB77137', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3b2d92bc-b258-4f84-9822-fb33ba1f86ef' OR ("EntityID" = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND "Name" = 'MetadataIntrospectionStrategy')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3b2d92bc-b258-4f84-9822-fb33ba1f86ef', 'CDADE3E4-D00A-42E7-B385-CE24D533101E' /* Entity: MJ: External Data Source Types */, 100006, 'MetadataIntrospectionStrategy', 'Metadata Introspection Strategy', 'How the metadata-introspection command hydrates Entity/EntityField rows from this driver family: InformationSchema (ANSI INFORMATION_SCHEMA), NativeCatalog (vendor catalog views), SampledDocuments (infer shape from sampled documents, e.g. MongoDB), or Manual (no automated introspection).', 'nvarchar', 100, 0, 0, FALSE, 'Manual', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd6a19099-6c1b-4bfa-a888-cb5d0a888a79' OR ("EntityID" = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND "Name" = 'FilterDialect')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d6a19099-6c1b-4bfa-a888-cb5d0a888a79', 'CDADE3E4-D00A-42E7-B385-CE24D533101E' /* Entity: MJ: External Data Source Types */, 100007, 'FilterDialect', 'Filter Dialect', 'Dialect the driver expects for RunView filter pass-through: tsql, ansi, pgsql, mysql, oracle, or mongo-ast (MongoDB filter AST translated within the driver).', 'nvarchar', 100, 0, 0, FALSE, 'ansi', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '148e0d1d-551e-4519-a4b8-3f210733b808' OR ("EntityID" = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND "Name" = 'PagingStrategy')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('148e0d1d-551e-4519-a4b8-3f210733b808', 'CDADE3E4-D00A-42E7-B385-CE24D533101E' /* Entity: MJ: External Data Source Types */, 100008, 'PagingStrategy', 'Paging Strategy', 'Pagination mechanism the driver uses: OffsetFetch (SQL Server OFFSET/FETCH), LimitOffset (Postgres/MySQL LIMIT/OFFSET), TopSkip, or Cursor.', 'nvarchar', 100, 0, 0, FALSE, 'LimitOffset', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8754fded-3db8-4fd4-8980-4e7cb9569e2e' OR ("EntityID" = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND "Name" = 'SupportsSchemaIntrospection')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8754fded-3db8-4fd4-8980-4e7cb9569e2e', 'CDADE3E4-D00A-42E7-B385-CE24D533101E' /* Entity: MJ: External Data Source Types */, 100009, 'SupportsSchemaIntrospection', 'Supports Schema Introspection', 'Whether the driver can introspect remote schema metadata to assist Entity/EntityField generation.', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7d7c10f6-1488-4d9f-b3e6-ab9430cd580a' OR ("EntityID" = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND "Name" = 'SupportsNativeQueries')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7d7c10f6-1488-4d9f-b3e6-ab9430cd580a', 'CDADE3E4-D00A-42E7-B385-CE24D533101E' /* Entity: MJ: External Data Source Types */, 100010, 'SupportsNativeQueries', 'Supports Native Queries', 'Whether the driver supports native-dialect query execution for MJ Queries that set ExternalDataSourceID.', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5fb10937-e957-44d5-b690-416fb5dd79cc' OR ("EntityID" = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND "Name" = 'SupportsReadWrite')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5fb10937-e957-44d5-b690-416fb5dd79cc', 'CDADE3E4-D00A-42E7-B385-CE24D533101E' /* Entity: MJ: External Data Source Types */, 100011, 'SupportsReadWrite', 'Supports Read Write', 'Reserved for a future write-capable phase. Always 0 in the current read-only design; external entities are read-only.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '14efec98-67bd-4f62-9391-f47895b7b4a9' OR ("EntityID" = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('14efec98-67bd-4f62-9391-f47895b7b4a9', 'CDADE3E4-D00A-42E7-B385-CE24D533101E' /* Entity: MJ: External Data Source Types */, 100012, 'Status', 'Status', 'Lifecycle status of the driver-type catalog entry: Active or Deprecated.', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0ad3b84f-9847-4375-b451-50fc836b0fe9' OR ("EntityID" = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0ad3b84f-9847-4375-b451-50fc836b0fe9', 'CDADE3E4-D00A-42E7-B385-CE24D533101E' /* Entity: MJ: External Data Source Types */, 100013, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c5077a27-6b66-4656-9fb4-eef56f45d792' OR ("EntityID" = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c5077a27-6b66-4656-9fb4-eef56f45d792', 'CDADE3E4-D00A-42E7-B385-CE24D533101E' /* Entity: MJ: External Data Source Types */, 100014, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID 39f46dfe-cff6-4d60-9267-5f2ebf7d98e9 */
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
    '39f46dfe-cff6-4d60-9267-5f2ebf7d98e9',
    '3B2D92BC-B258-4F84-9822-FB33BA1F86EF',
    1,
    'InformationSchema',
    'InformationSchema',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 88160840-1171-4d8b-931c-c67566bb4ce2 */
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
    '88160840-1171-4d8b-931c-c67566bb4ce2',
    '3B2D92BC-B258-4F84-9822-FB33BA1F86EF',
    2,
    'Manual',
    'Manual',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID f1b28864-c688-4030-b4ae-6e4c055b5ad2 */
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
    'f1b28864-c688-4030-b4ae-6e4c055b5ad2',
    '3B2D92BC-B258-4F84-9822-FB33BA1F86EF',
    3,
    'NativeCatalog',
    'NativeCatalog',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 0ad7e34a-f1b3-49d1-8355-6bf209723f6c */
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
    '0ad7e34a-f1b3-49d1-8355-6bf209723f6c',
    '3B2D92BC-B258-4F84-9822-FB33BA1F86EF',
    4,
    'SampledDocuments',
    'SampledDocuments',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 3B2D92BC-B258-4F84-9822-FB33BA1F86EF */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '3B2D92BC-B258-4F84-9822-FB33BA1F86EF';
/* SQL text to insert entity field value with ID 2ff4652d-7304-4ba5-8502-fc0b1dd53999 */
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
    '2ff4652d-7304-4ba5-8502-fc0b1dd53999',
    'D6A19099-6C1B-4BFA-A888-CB5D0A888A79',
    1,
    'ansi',
    'ansi',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 89415e8d-cd5e-4e86-801f-fe00db2f7a52 */
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
    '89415e8d-cd5e-4e86-801f-fe00db2f7a52',
    'D6A19099-6C1B-4BFA-A888-CB5D0A888A79',
    2,
    'mongo-ast',
    'mongo-ast',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID dc537248-18cf-4634-8e33-132f9a7f3f7a */
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
    'dc537248-18cf-4634-8e33-132f9a7f3f7a',
    'D6A19099-6C1B-4BFA-A888-CB5D0A888A79',
    3,
    'mysql',
    'mysql',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID ae5d4906-3417-4406-ae54-bf94f60f1046 */
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
    'ae5d4906-3417-4406-ae54-bf94f60f1046',
    'D6A19099-6C1B-4BFA-A888-CB5D0A888A79',
    4,
    'oracle',
    'oracle',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 100a5314-97a6-4aaf-9855-e06ae522c0f7 */
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
    '100a5314-97a6-4aaf-9855-e06ae522c0f7',
    'D6A19099-6C1B-4BFA-A888-CB5D0A888A79',
    5,
    'pgsql',
    'pgsql',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 93655491-92ee-4567-87b5-13021a55e2f7 */
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
    '93655491-92ee-4567-87b5-13021a55e2f7',
    'D6A19099-6C1B-4BFA-A888-CB5D0A888A79',
    6,
    'tsql',
    'tsql',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID D6A19099-6C1B-4BFA-A888-CB5D0A888A79 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'D6A19099-6C1B-4BFA-A888-CB5D0A888A79';
/* SQL text to insert entity field value with ID 4a5d72bd-e9d6-4ee6-9104-5d04a1d312d8 */
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
    '4a5d72bd-e9d6-4ee6-9104-5d04a1d312d8',
    '148E0D1D-551E-4519-A4B8-3F210733B808',
    1,
    'Cursor',
    'Cursor',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 6a859c35-05fc-4863-b4ea-0458ce81b199 */
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
    '6a859c35-05fc-4863-b4ea-0458ce81b199',
    '148E0D1D-551E-4519-A4B8-3F210733B808',
    2,
    'LimitOffset',
    'LimitOffset',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 05b21524-ac55-47b4-bc29-c602e038dd74 */
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
    '05b21524-ac55-47b4-bc29-c602e038dd74',
    '148E0D1D-551E-4519-A4B8-3F210733B808',
    3,
    'OffsetFetch',
    'OffsetFetch',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID cf5516cc-6358-42d4-8897-e4b707b6b7a9 */
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
    'cf5516cc-6358-42d4-8897-e4b707b6b7a9',
    '148E0D1D-551E-4519-A4B8-3F210733B808',
    4,
    'TopSkip',
    'TopSkip',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 148E0D1D-551E-4519-A4B8-3F210733B808 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '148E0D1D-551E-4519-A4B8-3F210733B808';
/* SQL text to insert entity field value with ID 76c93713-8d79-4bdf-a250-f50c465d01c4 */
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
    '76c93713-8d79-4bdf-a250-f50c465d01c4',
    '14EFEC98-67BD-4F62-9391-F47895B7B4A9',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 968bb886-0701-41e2-80dd-661ae3bc03e6 */
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
    '968bb886-0701-41e2-80dd-661ae3bc03e6',
    '14EFEC98-67BD-4F62-9391-F47895B7B4A9',
    2,
    'Deprecated',
    'Deprecated',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 14EFEC98-67BD-4F62-9391-F47895B7B4A9 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '14EFEC98-67BD-4F62-9391-F47895B7B4A9';
/* SQL text to insert entity field value with ID a0beb3c7-eac2-4fdf-89c3-51accdc48590 */
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
    'a0beb3c7-eac2-4fdf-89c3-51accdc48590',
    '6C0236EB-792E-4A66-A780-1C5C96932AEB',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 8387838c-4c47-4736-95bb-997788b94183 */
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
    '8387838c-4c47-4736-95bb-997788b94183',
    '6C0236EB-792E-4A66-A780-1C5C96932AEB',
    2,
    'Disabled',
    'Disabled',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID b170bc1d-0157-4aad-8d2c-6196a58ecc5e */
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
    'b170bc1d-0157-4aad-8d2c-6196a58ecc5e',
    '6C0236EB-792E-4A66-A780-1C5C96932AEB',
    3,
    'TestFailed',
    'TestFailed',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 6C0236EB-792E-4A66-A780-1C5C96932AEB */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '6C0236EB-792E-4A66-A780-1C5C96932AEB';
/* Create Entity Relationship: MJ: Credential Types -> MJ: External Data Source Types (One To Many via RequiredCredentialTypeID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'cccf715d-2712-4e46-9ea0-6ec825bf80f0') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cccf715d-2712-4e46-9ea0-6ec825bf80f0', 'D512FF2E-A140-45A2-979A-20657AB77137', 'CDADE3E4-D00A-42E7-B385-CE24D533101E', 'RequiredCredentialTypeID', 'One To Many', TRUE, TRUE, 5, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '9e00884a-f97a-4b05-a3ae-45aa8e26958b') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9e00884a-f97a-4b05-a3ae-45aa8e26958b', '078E485B-0CC4-4E2A-ADB8-52FE8E571E88', '1B248F34-2837-EF11-86D4-6045BDEE16E6', 'ExternalDataSourceID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'cdca657b-1e6f-443e-8369-f043a772d012') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cdca657b-1e6f-443e-8369-f043a772d012', '078E485B-0CC4-4E2A-ADB8-52FE8E571E88', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ExternalDataSourceID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '2b763a98-6684-40d0-aad9-73d618e205e4') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2b763a98-6684-40d0-aad9-73d618e205e4', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', '078E485B-0CC4-4E2A-ADB8-52FE8E571E88', 'CredentialID', 'One To Many', TRUE, TRUE, 9, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '9b131f8e-b389-4d3a-8941-9ecef5c4bad5') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9b131f8e-b389-4d3a-8941-9ecef5c4bad5', 'CDADE3E4-D00A-42E7-B385-CE24D533101E', '078E485B-0CC4-4E2A-ADB8-52FE8E571E88', 'TypeID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2c373866-c3d1-416d-a104-3a049981e125' OR ("EntityID" = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND "Name" = 'Type')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2c373866-c3d1-416d-a104-3a049981e125', '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' /* Entity: MJ: External Data Sources */, 100029, 'Type', 'Type', NULL, 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '31445afd-4067-4a95-8794-f40b9e27c145' OR ("EntityID" = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND "Name" = 'Credential')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('31445afd-4067-4a95-8794-f40b9e27c145', '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' /* Entity: MJ: External Data Sources */, 100030, 'Credential', 'Credential', NULL, 'nvarchar', 400, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '71c80e4f-6b53-4e83-87c5-f964f76a8468' OR ("EntityID" = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'ExternalDataSource')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('71c80e4f-6b53-4e83-87c5-f964f76a8468', '1B248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Queries */, 100057, 'ExternalDataSource', 'External Data Source', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c3770f28-703b-4e79-b7cb-d90f71c1d173' OR ("EntityID" = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND "Name" = 'RequiredCredentialType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c3770f28-703b-4e79-b7cb-d90f71c1d173', 'CDADE3E4-D00A-42E7-B385-CE24D533101E' /* Entity: MJ: External Data Source Types */, 100029, 'RequiredCredentialType', 'Required Credential Type', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entities
-- Item: Index for Foreign Keys
-- ============================================================
-- Flush any pending deferred trigger events from prior DML so DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_parent_id"
    ON __mj."Entity" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_external_data_source_id"
    ON __mj."Entity" ("ExternalDataSourceID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entities
-- Item: Permissions for vwEntities
-- ============================================================
GRANT SELECT ON __mj."vwEntities" TO "cdp_Developer";
GRANT SELECT ON __mj."vwEntities" TO "cdp_Integration";
GRANT SELECT ON __mj."vwEntities" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entities
-- Item: spCreateEntity
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Entity
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateEntity'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateEntity"(
    p_id UUID DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_namesuffix_clear boolean DEFAULT false,
    p_namesuffix varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_autoupdatedescription BOOLEAN DEFAULT NULL,
    p_baseview varchar(255) DEFAULT NULL,
    p_baseviewgenerated BOOLEAN DEFAULT NULL,
    p_virtualentity BOOLEAN DEFAULT NULL,
    p_trackrecordchanges BOOLEAN DEFAULT NULL,
    p_auditrecordaccess BOOLEAN DEFAULT NULL,
    p_auditviewruns BOOLEAN DEFAULT NULL,
    p_includeinapi BOOLEAN DEFAULT NULL,
    p_allowallrowsapi BOOLEAN DEFAULT NULL,
    p_allowupdateapi BOOLEAN DEFAULT NULL,
    p_allowcreateapi BOOLEAN DEFAULT NULL,
    p_allowdeleteapi BOOLEAN DEFAULT NULL,
    p_customresolverapi BOOLEAN DEFAULT NULL,
    p_allowusersearchapi BOOLEAN DEFAULT NULL,
    p_fulltextsearchenabled BOOLEAN DEFAULT NULL,
    p_fulltextcatalog_clear boolean DEFAULT false,
    p_fulltextcatalog varchar(255) DEFAULT NULL,
    p_fulltextcataloggenerated BOOLEAN DEFAULT NULL,
    p_fulltextindex_clear boolean DEFAULT false,
    p_fulltextindex varchar(255) DEFAULT NULL,
    p_fulltextindexgenerated BOOLEAN DEFAULT NULL,
    p_fulltextsearchfunction_clear boolean DEFAULT false,
    p_fulltextsearchfunction varchar(255) DEFAULT NULL,
    p_fulltextsearchfunctiongenerated BOOLEAN DEFAULT NULL,
    p_userviewmaxrows_clear boolean DEFAULT false,
    p_userviewmaxrows int DEFAULT NULL,
    p_spcreate_clear boolean DEFAULT false,
    p_spcreate varchar(255) DEFAULT NULL,
    p_spupdate_clear boolean DEFAULT false,
    p_spupdate varchar(255) DEFAULT NULL,
    p_spdelete_clear boolean DEFAULT false,
    p_spdelete varchar(255) DEFAULT NULL,
    p_spcreategenerated BOOLEAN DEFAULT NULL,
    p_spupdategenerated BOOLEAN DEFAULT NULL,
    p_spdeletegenerated BOOLEAN DEFAULT NULL,
    p_cascadedeletes BOOLEAN DEFAULT NULL,
    p_deletetype varchar(10) DEFAULT NULL,
    p_allowrecordmerge BOOLEAN DEFAULT NULL,
    p_spmatch_clear boolean DEFAULT false,
    p_spmatch varchar(255) DEFAULT NULL,
    p_relationshipdefaultdisplaytype varchar(20) DEFAULT NULL,
    p_userformgenerated BOOLEAN DEFAULT NULL,
    p_entityobjectsubclassname_clear boolean DEFAULT false,
    p_entityobjectsubclassname varchar(255) DEFAULT NULL,
    p_entityobjectsubclassimport_clear boolean DEFAULT false,
    p_entityobjectsubclassimport varchar(255) DEFAULT NULL,
    p_preferredcommunicationfield_clear boolean DEFAULT false,
    p_preferredcommunicationfield varchar(255) DEFAULT NULL,
    p_icon_clear boolean DEFAULT false,
    p_icon varchar(500) DEFAULT NULL,
    p_scopedefault_clear boolean DEFAULT false,
    p_scopedefault varchar(100) DEFAULT NULL,
    p_rowstopackwithschema varchar(20) DEFAULT NULL,
    p_rowstopacksamplemethod varchar(20) DEFAULT NULL,
    p_rowstopacksamplecount int DEFAULT NULL,
    p_rowstopacksampleorder_clear boolean DEFAULT false,
    p_rowstopacksampleorder TEXT DEFAULT NULL,
    p_autorowcountfrequency_clear boolean DEFAULT false,
    p_autorowcountfrequency int DEFAULT NULL,
    p_rowcount_clear boolean DEFAULT false,
    p_rowcount bigint DEFAULT NULL,
    p_rowcountrunat_clear boolean DEFAULT false,
    p_rowcountrunat TIMESTAMPTZ DEFAULT NULL,
    p_status varchar(25) DEFAULT NULL,
    p_displayname_clear boolean DEFAULT false,
    p_displayname varchar(255) DEFAULT NULL,
    p_allowmultiplesubtypes BOOLEAN DEFAULT NULL,
    p_autoupdatefulltextsearch BOOLEAN DEFAULT NULL,
    p_autoupdateallowusersearchapi BOOLEAN DEFAULT NULL,
    p_trustservercachecompletely BOOLEAN DEFAULT NULL,
    p_supportsgeocoding BOOLEAN DEFAULT NULL,
    p_autoupdatesupportsgeocoding BOOLEAN DEFAULT NULL,
    p_allowcaching BOOLEAN DEFAULT NULL,
    p_detectexternalchanges BOOLEAN DEFAULT NULL,
    p_externaldatasourceid_clear boolean DEFAULT false,
    p_externaldatasourceid UUID DEFAULT NULL,
    p_externalobjectname_clear boolean DEFAULT false,
    p_externalobjectname varchar(255) DEFAULT NULL
) RETURNS SETOF __mj."vwEntities" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."Entity"
        (
            "ID",
            "ParentID",
                "Name",
                "NameSuffix",
                "Description",
                "AutoUpdateDescription",
                "BaseView",
                "BaseViewGenerated",
                "VirtualEntity",
                "TrackRecordChanges",
                "AuditRecordAccess",
                "AuditViewRuns",
                "IncludeInAPI",
                "AllowAllRowsAPI",
                "AllowUpdateAPI",
                "AllowCreateAPI",
                "AllowDeleteAPI",
                "CustomResolverAPI",
                "AllowUserSearchAPI",
                "FullTextSearchEnabled",
                "FullTextCatalog",
                "FullTextCatalogGenerated",
                "FullTextIndex",
                "FullTextIndexGenerated",
                "FullTextSearchFunction",
                "FullTextSearchFunctionGenerated",
                "UserViewMaxRows",
                "spCreate",
                "spUpdate",
                "spDelete",
                "spCreateGenerated",
                "spUpdateGenerated",
                "spDeleteGenerated",
                "CascadeDeletes",
                "DeleteType",
                "AllowRecordMerge",
                "spMatch",
                "RelationshipDefaultDisplayType",
                "UserFormGenerated",
                "EntityObjectSubclassName",
                "EntityObjectSubclassImport",
                "PreferredCommunicationField",
                "Icon",
                "ScopeDefault",
                "RowsToPackWithSchema",
                "RowsToPackSampleMethod",
                "RowsToPackSampleCount",
                "RowsToPackSampleOrder",
                "AutoRowCountFrequency",
                "RowCount",
                "RowCountRunAt",
                "Status",
                "DisplayName",
                "AllowMultipleSubtypes",
                "AutoUpdateFullTextSearch",
                "AutoUpdateAllowUserSearchAPI",
                "TrustServerCacheCompletely",
                "SupportsGeoCoding",
                "AutoUpdateSupportsGeoCoding",
                "AllowCaching",
                "DetectExternalChanges",
                "ExternalDataSourceID",
                "ExternalObjectName"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, NULL) END,
                p_name,
                CASE WHEN p_namesuffix_clear = true THEN NULL ELSE COALESCE(p_namesuffix, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_autoupdatedescription, TRUE),
                p_baseview,
                COALESCE(p_baseviewgenerated, TRUE),
                COALESCE(p_virtualentity, FALSE),
                COALESCE(p_trackrecordchanges, TRUE),
                COALESCE(p_auditrecordaccess, TRUE),
                COALESCE(p_auditviewruns, TRUE),
                COALESCE(p_includeinapi, FALSE),
                COALESCE(p_allowallrowsapi, FALSE),
                COALESCE(p_allowupdateapi, FALSE),
                COALESCE(p_allowcreateapi, FALSE),
                COALESCE(p_allowdeleteapi, FALSE),
                COALESCE(p_customresolverapi, FALSE),
                COALESCE(p_allowusersearchapi, FALSE),
                COALESCE(p_fulltextsearchenabled, FALSE),
                CASE WHEN p_fulltextcatalog_clear = true THEN NULL ELSE COALESCE(p_fulltextcatalog, NULL) END,
                COALESCE(p_fulltextcataloggenerated, TRUE),
                CASE WHEN p_fulltextindex_clear = true THEN NULL ELSE COALESCE(p_fulltextindex, NULL) END,
                COALESCE(p_fulltextindexgenerated, TRUE),
                CASE WHEN p_fulltextsearchfunction_clear = true THEN NULL ELSE COALESCE(p_fulltextsearchfunction, NULL) END,
                COALESCE(p_fulltextsearchfunctiongenerated, TRUE),
                CASE WHEN p_userviewmaxrows_clear = true THEN NULL ELSE COALESCE(p_userviewmaxrows, 1000) END,
                CASE WHEN p_spcreate_clear = true THEN NULL ELSE COALESCE(p_spcreate, NULL) END,
                CASE WHEN p_spupdate_clear = true THEN NULL ELSE COALESCE(p_spupdate, NULL) END,
                CASE WHEN p_spdelete_clear = true THEN NULL ELSE COALESCE(p_spdelete, NULL) END,
                COALESCE(p_spcreategenerated, TRUE),
                COALESCE(p_spupdategenerated, TRUE),
                COALESCE(p_spdeletegenerated, TRUE),
                COALESCE(p_cascadedeletes, FALSE),
                COALESCE(p_deletetype, 'Hard'),
                COALESCE(p_allowrecordmerge, FALSE),
                CASE WHEN p_spmatch_clear = true THEN NULL ELSE COALESCE(p_spmatch, NULL) END,
                COALESCE(p_relationshipdefaultdisplaytype, 'Search'),
                COALESCE(p_userformgenerated, TRUE),
                CASE WHEN p_entityobjectsubclassname_clear = true THEN NULL ELSE COALESCE(p_entityobjectsubclassname, NULL) END,
                CASE WHEN p_entityobjectsubclassimport_clear = true THEN NULL ELSE COALESCE(p_entityobjectsubclassimport, NULL) END,
                CASE WHEN p_preferredcommunicationfield_clear = true THEN NULL ELSE COALESCE(p_preferredcommunicationfield, NULL) END,
                CASE WHEN p_icon_clear = true THEN NULL ELSE COALESCE(p_icon, NULL) END,
                CASE WHEN p_scopedefault_clear = true THEN NULL ELSE COALESCE(p_scopedefault, NULL) END,
                COALESCE(p_rowstopackwithschema, 'None'),
                COALESCE(p_rowstopacksamplemethod, 'random'),
                COALESCE(p_rowstopacksamplecount, 0),
                CASE WHEN p_rowstopacksampleorder_clear = true THEN NULL ELSE COALESCE(p_rowstopacksampleorder, NULL) END,
                CASE WHEN p_autorowcountfrequency_clear = true THEN NULL ELSE COALESCE(p_autorowcountfrequency, NULL) END,
                CASE WHEN p_rowcount_clear = true THEN NULL ELSE COALESCE(p_rowcount, NULL) END,
                CASE WHEN p_rowcountrunat_clear = true THEN NULL ELSE COALESCE(p_rowcountrunat, NULL) END,
                COALESCE(p_status, 'Active'),
                CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, NULL) END,
                COALESCE(p_allowmultiplesubtypes, FALSE),
                COALESCE(p_autoupdatefulltextsearch, TRUE),
                COALESCE(p_autoupdateallowusersearchapi, TRUE),
                COALESCE(p_trustservercachecompletely, TRUE),
                COALESCE(p_supportsgeocoding, FALSE),
                COALESCE(p_autoupdatesupportsgeocoding, TRUE),
                COALESCE(p_allowcaching, FALSE),
                COALESCE(p_detectexternalchanges, FALSE),
                CASE WHEN p_externaldatasourceid_clear = true THEN NULL ELSE COALESCE(p_externaldatasourceid, NULL) END,
                CASE WHEN p_externalobjectname_clear = true THEN NULL ELSE COALESCE(p_externalobjectname, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwEntities"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateEntity" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateEntity" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entities
-- Item: spUpdateEntity
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Entity
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateEntity'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntity"(
    p_id UUID,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_namesuffix_clear boolean DEFAULT false,
    p_namesuffix varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_autoupdatedescription BOOLEAN DEFAULT NULL,
    p_baseview varchar(255) DEFAULT NULL,
    p_baseviewgenerated BOOLEAN DEFAULT NULL,
    p_virtualentity BOOLEAN DEFAULT NULL,
    p_trackrecordchanges BOOLEAN DEFAULT NULL,
    p_auditrecordaccess BOOLEAN DEFAULT NULL,
    p_auditviewruns BOOLEAN DEFAULT NULL,
    p_includeinapi BOOLEAN DEFAULT NULL,
    p_allowallrowsapi BOOLEAN DEFAULT NULL,
    p_allowupdateapi BOOLEAN DEFAULT NULL,
    p_allowcreateapi BOOLEAN DEFAULT NULL,
    p_allowdeleteapi BOOLEAN DEFAULT NULL,
    p_customresolverapi BOOLEAN DEFAULT NULL,
    p_allowusersearchapi BOOLEAN DEFAULT NULL,
    p_fulltextsearchenabled BOOLEAN DEFAULT NULL,
    p_fulltextcatalog_clear boolean DEFAULT false,
    p_fulltextcatalog varchar(255) DEFAULT NULL,
    p_fulltextcataloggenerated BOOLEAN DEFAULT NULL,
    p_fulltextindex_clear boolean DEFAULT false,
    p_fulltextindex varchar(255) DEFAULT NULL,
    p_fulltextindexgenerated BOOLEAN DEFAULT NULL,
    p_fulltextsearchfunction_clear boolean DEFAULT false,
    p_fulltextsearchfunction varchar(255) DEFAULT NULL,
    p_fulltextsearchfunctiongenerated BOOLEAN DEFAULT NULL,
    p_userviewmaxrows_clear boolean DEFAULT false,
    p_userviewmaxrows int DEFAULT NULL,
    p_spcreate_clear boolean DEFAULT false,
    p_spcreate varchar(255) DEFAULT NULL,
    p_spupdate_clear boolean DEFAULT false,
    p_spupdate varchar(255) DEFAULT NULL,
    p_spdelete_clear boolean DEFAULT false,
    p_spdelete varchar(255) DEFAULT NULL,
    p_spcreategenerated BOOLEAN DEFAULT NULL,
    p_spupdategenerated BOOLEAN DEFAULT NULL,
    p_spdeletegenerated BOOLEAN DEFAULT NULL,
    p_cascadedeletes BOOLEAN DEFAULT NULL,
    p_deletetype varchar(10) DEFAULT NULL,
    p_allowrecordmerge BOOLEAN DEFAULT NULL,
    p_spmatch_clear boolean DEFAULT false,
    p_spmatch varchar(255) DEFAULT NULL,
    p_relationshipdefaultdisplaytype varchar(20) DEFAULT NULL,
    p_userformgenerated BOOLEAN DEFAULT NULL,
    p_entityobjectsubclassname_clear boolean DEFAULT false,
    p_entityobjectsubclassname varchar(255) DEFAULT NULL,
    p_entityobjectsubclassimport_clear boolean DEFAULT false,
    p_entityobjectsubclassimport varchar(255) DEFAULT NULL,
    p_preferredcommunicationfield_clear boolean DEFAULT false,
    p_preferredcommunicationfield varchar(255) DEFAULT NULL,
    p_icon_clear boolean DEFAULT false,
    p_icon varchar(500) DEFAULT NULL,
    p_scopedefault_clear boolean DEFAULT false,
    p_scopedefault varchar(100) DEFAULT NULL,
    p_rowstopackwithschema varchar(20) DEFAULT NULL,
    p_rowstopacksamplemethod varchar(20) DEFAULT NULL,
    p_rowstopacksamplecount int DEFAULT NULL,
    p_rowstopacksampleorder_clear boolean DEFAULT false,
    p_rowstopacksampleorder TEXT DEFAULT NULL,
    p_autorowcountfrequency_clear boolean DEFAULT false,
    p_autorowcountfrequency int DEFAULT NULL,
    p_rowcount_clear boolean DEFAULT false,
    p_rowcount bigint DEFAULT NULL,
    p_rowcountrunat_clear boolean DEFAULT false,
    p_rowcountrunat TIMESTAMPTZ DEFAULT NULL,
    p_status varchar(25) DEFAULT NULL,
    p_displayname_clear boolean DEFAULT false,
    p_displayname varchar(255) DEFAULT NULL,
    p_allowmultiplesubtypes BOOLEAN DEFAULT NULL,
    p_autoupdatefulltextsearch BOOLEAN DEFAULT NULL,
    p_autoupdateallowusersearchapi BOOLEAN DEFAULT NULL,
    p_trustservercachecompletely BOOLEAN DEFAULT NULL,
    p_supportsgeocoding BOOLEAN DEFAULT NULL,
    p_autoupdatesupportsgeocoding BOOLEAN DEFAULT NULL,
    p_allowcaching BOOLEAN DEFAULT NULL,
    p_detectexternalchanges BOOLEAN DEFAULT NULL,
    p_externaldatasourceid_clear boolean DEFAULT false,
    p_externaldatasourceid UUID DEFAULT NULL,
    p_externalobjectname_clear boolean DEFAULT false,
    p_externalobjectname varchar(255) DEFAULT NULL
) RETURNS SETOF __mj."vwEntities" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."Entity"
    SET
        "ParentID" = CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, "ParentID") END,
        "Name" = COALESCE(p_name, "Name"),
        "NameSuffix" = CASE WHEN p_namesuffix_clear = true THEN NULL ELSE COALESCE(p_namesuffix, "NameSuffix") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "AutoUpdateDescription" = COALESCE(p_autoupdatedescription, "AutoUpdateDescription"),
        "BaseView" = COALESCE(p_baseview, "BaseView"),
        "BaseViewGenerated" = COALESCE(p_baseviewgenerated, "BaseViewGenerated"),
        "VirtualEntity" = COALESCE(p_virtualentity, "VirtualEntity"),
        "TrackRecordChanges" = COALESCE(p_trackrecordchanges, "TrackRecordChanges"),
        "AuditRecordAccess" = COALESCE(p_auditrecordaccess, "AuditRecordAccess"),
        "AuditViewRuns" = COALESCE(p_auditviewruns, "AuditViewRuns"),
        "IncludeInAPI" = COALESCE(p_includeinapi, "IncludeInAPI"),
        "AllowAllRowsAPI" = COALESCE(p_allowallrowsapi, "AllowAllRowsAPI"),
        "AllowUpdateAPI" = COALESCE(p_allowupdateapi, "AllowUpdateAPI"),
        "AllowCreateAPI" = COALESCE(p_allowcreateapi, "AllowCreateAPI"),
        "AllowDeleteAPI" = COALESCE(p_allowdeleteapi, "AllowDeleteAPI"),
        "CustomResolverAPI" = COALESCE(p_customresolverapi, "CustomResolverAPI"),
        "AllowUserSearchAPI" = COALESCE(p_allowusersearchapi, "AllowUserSearchAPI"),
        "FullTextSearchEnabled" = COALESCE(p_fulltextsearchenabled, "FullTextSearchEnabled"),
        "FullTextCatalog" = CASE WHEN p_fulltextcatalog_clear = true THEN NULL ELSE COALESCE(p_fulltextcatalog, "FullTextCatalog") END,
        "FullTextCatalogGenerated" = COALESCE(p_fulltextcataloggenerated, "FullTextCatalogGenerated"),
        "FullTextIndex" = CASE WHEN p_fulltextindex_clear = true THEN NULL ELSE COALESCE(p_fulltextindex, "FullTextIndex") END,
        "FullTextIndexGenerated" = COALESCE(p_fulltextindexgenerated, "FullTextIndexGenerated"),
        "FullTextSearchFunction" = CASE WHEN p_fulltextsearchfunction_clear = true THEN NULL ELSE COALESCE(p_fulltextsearchfunction, "FullTextSearchFunction") END,
        "FullTextSearchFunctionGenerated" = COALESCE(p_fulltextsearchfunctiongenerated, "FullTextSearchFunctionGenerated"),
        "UserViewMaxRows" = CASE WHEN p_userviewmaxrows_clear = true THEN NULL ELSE COALESCE(p_userviewmaxrows, "UserViewMaxRows") END,
        "spCreate" = CASE WHEN p_spcreate_clear = true THEN NULL ELSE COALESCE(p_spcreate, "spCreate") END,
        "spUpdate" = CASE WHEN p_spupdate_clear = true THEN NULL ELSE COALESCE(p_spupdate, "spUpdate") END,
        "spDelete" = CASE WHEN p_spdelete_clear = true THEN NULL ELSE COALESCE(p_spdelete, "spDelete") END,
        "spCreateGenerated" = COALESCE(p_spcreategenerated, "spCreateGenerated"),
        "spUpdateGenerated" = COALESCE(p_spupdategenerated, "spUpdateGenerated"),
        "spDeleteGenerated" = COALESCE(p_spdeletegenerated, "spDeleteGenerated"),
        "CascadeDeletes" = COALESCE(p_cascadedeletes, "CascadeDeletes"),
        "DeleteType" = COALESCE(p_deletetype, "DeleteType"),
        "AllowRecordMerge" = COALESCE(p_allowrecordmerge, "AllowRecordMerge"),
        "spMatch" = CASE WHEN p_spmatch_clear = true THEN NULL ELSE COALESCE(p_spmatch, "spMatch") END,
        "RelationshipDefaultDisplayType" = COALESCE(p_relationshipdefaultdisplaytype, "RelationshipDefaultDisplayType"),
        "UserFormGenerated" = COALESCE(p_userformgenerated, "UserFormGenerated"),
        "EntityObjectSubclassName" = CASE WHEN p_entityobjectsubclassname_clear = true THEN NULL ELSE COALESCE(p_entityobjectsubclassname, "EntityObjectSubclassName") END,
        "EntityObjectSubclassImport" = CASE WHEN p_entityobjectsubclassimport_clear = true THEN NULL ELSE COALESCE(p_entityobjectsubclassimport, "EntityObjectSubclassImport") END,
        "PreferredCommunicationField" = CASE WHEN p_preferredcommunicationfield_clear = true THEN NULL ELSE COALESCE(p_preferredcommunicationfield, "PreferredCommunicationField") END,
        "Icon" = CASE WHEN p_icon_clear = true THEN NULL ELSE COALESCE(p_icon, "Icon") END,
        "ScopeDefault" = CASE WHEN p_scopedefault_clear = true THEN NULL ELSE COALESCE(p_scopedefault, "ScopeDefault") END,
        "RowsToPackWithSchema" = COALESCE(p_rowstopackwithschema, "RowsToPackWithSchema"),
        "RowsToPackSampleMethod" = COALESCE(p_rowstopacksamplemethod, "RowsToPackSampleMethod"),
        "RowsToPackSampleCount" = COALESCE(p_rowstopacksamplecount, "RowsToPackSampleCount"),
        "RowsToPackSampleOrder" = CASE WHEN p_rowstopacksampleorder_clear = true THEN NULL ELSE COALESCE(p_rowstopacksampleorder, "RowsToPackSampleOrder") END,
        "AutoRowCountFrequency" = CASE WHEN p_autorowcountfrequency_clear = true THEN NULL ELSE COALESCE(p_autorowcountfrequency, "AutoRowCountFrequency") END,
        "RowCount" = CASE WHEN p_rowcount_clear = true THEN NULL ELSE COALESCE(p_rowcount, "RowCount") END,
        "RowCountRunAt" = CASE WHEN p_rowcountrunat_clear = true THEN NULL ELSE COALESCE(p_rowcountrunat, "RowCountRunAt") END,
        "Status" = COALESCE(p_status, "Status"),
        "DisplayName" = CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, "DisplayName") END,
        "AllowMultipleSubtypes" = COALESCE(p_allowmultiplesubtypes, "AllowMultipleSubtypes"),
        "AutoUpdateFullTextSearch" = COALESCE(p_autoupdatefulltextsearch, "AutoUpdateFullTextSearch"),
        "AutoUpdateAllowUserSearchAPI" = COALESCE(p_autoupdateallowusersearchapi, "AutoUpdateAllowUserSearchAPI"),
        "TrustServerCacheCompletely" = COALESCE(p_trustservercachecompletely, "TrustServerCacheCompletely"),
        "SupportsGeoCoding" = COALESCE(p_supportsgeocoding, "SupportsGeoCoding"),
        "AutoUpdateSupportsGeoCoding" = COALESCE(p_autoupdatesupportsgeocoding, "AutoUpdateSupportsGeoCoding"),
        "AllowCaching" = COALESCE(p_allowcaching, "AllowCaching"),
        "DetectExternalChanges" = COALESCE(p_detectexternalchanges, "DetectExternalChanges"),
        "ExternalDataSourceID" = CASE WHEN p_externaldatasourceid_clear = true THEN NULL ELSE COALESCE(p_externaldatasourceid, "ExternalDataSourceID") END,
        "ExternalObjectName" = CASE WHEN p_externalobjectname_clear = true THEN NULL ELSE COALESCE(p_externalobjectname, "ExternalObjectName") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwEntities"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateEntity" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateEntity" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Entity table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_entity"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_entity" ON __mj."Entity";

CREATE TRIGGER "trg_update_entity"
BEFORE UPDATE ON __mj."Entity"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_entity"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entities
-- Item: spDeleteEntity
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Entity
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteEntity'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntity"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."Entity"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteEntity" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteEntity" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: External Data Source Types
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_external_data_source_type_required_credential_"
    ON __mj."ExternalDataSourceType" ("RequiredCredentialTypeID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: External Data Source Types
-- Item: vwExternalDataSourceTypes
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: External Data Source Types
-----               SCHEMA:      __mj
-----               BASE TABLE:  ExternalDataSourceType
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwExternalDataSourceTypes"
AS
SELECT
    e.*,
    MJCredentialType_RequiredCredentialTypeID."Name" AS "RequiredCredentialType"
FROM
    __mj."ExternalDataSourceType" AS e
LEFT OUTER JOIN
    __mj."CredentialType" AS MJCredentialType_RequiredCredentialTypeID
  ON
    "e"."RequiredCredentialTypeID" = MJCredentialType_RequiredCredentialTypeID."ID"
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
    AND tc.relname = 'vwExternalDataSourceTypes'
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
    AND tc.relname = 'vwExternalDataSourceTypes'
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
        AND tc.relname = 'vwExternalDataSourceTypes'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwExternalDataSourceTypes" CASCADE;
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
GRANT SELECT ON __mj."vwExternalDataSourceTypes" TO "cdp_UI";
GRANT SELECT ON __mj."vwExternalDataSourceTypes" TO "cdp_Developer";
GRANT SELECT ON __mj."vwExternalDataSourceTypes" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: External Data Source Types
-- Item: spCreateExternalDataSourceType
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ExternalDataSourceType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateExternalDataSourceType'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateExternalDataSourceType"(
    p_id UUID DEFAULT NULL,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_driverclass varchar(255) DEFAULT NULL,
    p_requiredcredentialtypeid_clear boolean DEFAULT false,
    p_requiredcredentialtypeid UUID DEFAULT NULL,
    p_metadataintrospectionstrategy varchar(50) DEFAULT NULL,
    p_filterdialect varchar(50) DEFAULT NULL,
    p_pagingstrategy varchar(50) DEFAULT NULL,
    p_supportsschemaintrospection BOOLEAN DEFAULT NULL,
    p_supportsnativequeries BOOLEAN DEFAULT NULL,
    p_supportsreadwrite BOOLEAN DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL
) RETURNS SETOF __mj."vwExternalDataSourceTypes" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."ExternalDataSourceType"
        (
            "ID",
            "Name",
                "Description",
                "DriverClass",
                "RequiredCredentialTypeID",
                "MetadataIntrospectionStrategy",
                "FilterDialect",
                "PagingStrategy",
                "SupportsSchemaIntrospection",
                "SupportsNativeQueries",
                "SupportsReadWrite",
                "Status"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_driverclass,
                CASE WHEN p_requiredcredentialtypeid_clear = true THEN NULL ELSE COALESCE(p_requiredcredentialtypeid, NULL) END,
                COALESCE(p_metadataintrospectionstrategy, 'Manual'),
                COALESCE(p_filterdialect, 'ansi'),
                COALESCE(p_pagingstrategy, 'LimitOffset'),
                COALESCE(p_supportsschemaintrospection, TRUE),
                COALESCE(p_supportsnativequeries, TRUE),
                COALESCE(p_supportsreadwrite, FALSE),
                COALESCE(p_status, 'Active')
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwExternalDataSourceTypes"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateExternalDataSourceType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateExternalDataSourceType" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: External Data Source Types
-- Item: spUpdateExternalDataSourceType
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ExternalDataSourceType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateExternalDataSourceType'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateExternalDataSourceType"(
    p_id UUID,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_driverclass varchar(255) DEFAULT NULL,
    p_requiredcredentialtypeid_clear boolean DEFAULT false,
    p_requiredcredentialtypeid UUID DEFAULT NULL,
    p_metadataintrospectionstrategy varchar(50) DEFAULT NULL,
    p_filterdialect varchar(50) DEFAULT NULL,
    p_pagingstrategy varchar(50) DEFAULT NULL,
    p_supportsschemaintrospection BOOLEAN DEFAULT NULL,
    p_supportsnativequeries BOOLEAN DEFAULT NULL,
    p_supportsreadwrite BOOLEAN DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL
) RETURNS SETOF __mj."vwExternalDataSourceTypes" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."ExternalDataSourceType"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "DriverClass" = COALESCE(p_driverclass, "DriverClass"),
        "RequiredCredentialTypeID" = CASE WHEN p_requiredcredentialtypeid_clear = true THEN NULL ELSE COALESCE(p_requiredcredentialtypeid, "RequiredCredentialTypeID") END,
        "MetadataIntrospectionStrategy" = COALESCE(p_metadataintrospectionstrategy, "MetadataIntrospectionStrategy"),
        "FilterDialect" = COALESCE(p_filterdialect, "FilterDialect"),
        "PagingStrategy" = COALESCE(p_pagingstrategy, "PagingStrategy"),
        "SupportsSchemaIntrospection" = COALESCE(p_supportsschemaintrospection, "SupportsSchemaIntrospection"),
        "SupportsNativeQueries" = COALESCE(p_supportsnativequeries, "SupportsNativeQueries"),
        "SupportsReadWrite" = COALESCE(p_supportsreadwrite, "SupportsReadWrite"),
        "Status" = COALESCE(p_status, "Status")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwExternalDataSourceTypes"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateExternalDataSourceType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateExternalDataSourceType" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ExternalDataSourceType table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_external_data_source_type"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_external_data_source_type" ON __mj."ExternalDataSourceType";

CREATE TRIGGER "trg_update_external_data_source_type"
BEFORE UPDATE ON __mj."ExternalDataSourceType"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_external_data_source_type"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: External Data Source Types
-- Item: spDeleteExternalDataSourceType
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ExternalDataSourceType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteExternalDataSourceType'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteExternalDataSourceType"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."ExternalDataSourceType"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteExternalDataSourceType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteExternalDataSourceType" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: External Data Sources
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_external_data_source_type_id"
    ON __mj."ExternalDataSource" ("TypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_external_data_source_credential_id"
    ON __mj."ExternalDataSource" ("CredentialID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: External Data Sources
-- Item: vwExternalDataSources
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: External Data Sources
-----               SCHEMA:      __mj
-----               BASE TABLE:  ExternalDataSource
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwExternalDataSources"
AS
SELECT
    e.*,
    MJExternalDataSourceType_TypeID."Name" AS "Type",
    MJCredential_CredentialID."Name" AS "Credential"
FROM
    __mj."ExternalDataSource" AS e
INNER JOIN
    __mj."ExternalDataSourceType" AS MJExternalDataSourceType_TypeID
  ON
    "e"."TypeID" = MJExternalDataSourceType_TypeID."ID"
LEFT OUTER JOIN
    __mj."Credential" AS MJCredential_CredentialID
  ON
    "e"."CredentialID" = MJCredential_CredentialID."ID"
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
    AND tc.relname = 'vwExternalDataSources'
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
    AND tc.relname = 'vwExternalDataSources'
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
        AND tc.relname = 'vwExternalDataSources'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwExternalDataSources" CASCADE;
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
GRANT SELECT ON __mj."vwExternalDataSources" TO "cdp_UI";
GRANT SELECT ON __mj."vwExternalDataSources" TO "cdp_Developer";
GRANT SELECT ON __mj."vwExternalDataSources" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: External Data Sources
-- Item: spCreateExternalDataSource
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ExternalDataSource
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateExternalDataSource'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateExternalDataSource"(
    p_id UUID DEFAULT NULL,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_typeid UUID DEFAULT NULL,
    p_credentialid_clear boolean DEFAULT false,
    p_credentialid UUID DEFAULT NULL,
    p_defaultschema_clear boolean DEFAULT false,
    p_defaultschema varchar(255) DEFAULT NULL,
    p_defaultdatabase_clear boolean DEFAULT false,
    p_defaultdatabase varchar(255) DEFAULT NULL,
    p_connectionconfig_clear boolean DEFAULT false,
    p_connectionconfig TEXT DEFAULT NULL,
    p_defaultcachettlseconds int DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_lastconnectiontestat_clear boolean DEFAULT false,
    p_lastconnectiontestat TIMESTAMPTZ DEFAULT NULL,
    p_lastconnectiontestresult_clear boolean DEFAULT false,
    p_lastconnectiontestresult TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwExternalDataSources" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."ExternalDataSource"
        (
            "ID",
            "Name",
                "Description",
                "TypeID",
                "CredentialID",
                "DefaultSchema",
                "DefaultDatabase",
                "ConnectionConfig",
                "DefaultCacheTTLSeconds",
                "Status",
                "LastConnectionTestAt",
                "LastConnectionTestResult"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_typeid,
                CASE WHEN p_credentialid_clear = true THEN NULL ELSE COALESCE(p_credentialid, NULL) END,
                CASE WHEN p_defaultschema_clear = true THEN NULL ELSE COALESCE(p_defaultschema, NULL) END,
                CASE WHEN p_defaultdatabase_clear = true THEN NULL ELSE COALESCE(p_defaultdatabase, NULL) END,
                CASE WHEN p_connectionconfig_clear = true THEN NULL ELSE COALESCE(p_connectionconfig, NULL) END,
                COALESCE(p_defaultcachettlseconds, 300),
                COALESCE(p_status, 'Active'),
                CASE WHEN p_lastconnectiontestat_clear = true THEN NULL ELSE COALESCE(p_lastconnectiontestat, NULL) END,
                CASE WHEN p_lastconnectiontestresult_clear = true THEN NULL ELSE COALESCE(p_lastconnectiontestresult, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwExternalDataSources"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateExternalDataSource" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateExternalDataSource" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: External Data Sources
-- Item: spUpdateExternalDataSource
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ExternalDataSource
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateExternalDataSource'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateExternalDataSource"(
    p_id UUID,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_typeid UUID DEFAULT NULL,
    p_credentialid_clear boolean DEFAULT false,
    p_credentialid UUID DEFAULT NULL,
    p_defaultschema_clear boolean DEFAULT false,
    p_defaultschema varchar(255) DEFAULT NULL,
    p_defaultdatabase_clear boolean DEFAULT false,
    p_defaultdatabase varchar(255) DEFAULT NULL,
    p_connectionconfig_clear boolean DEFAULT false,
    p_connectionconfig TEXT DEFAULT NULL,
    p_defaultcachettlseconds int DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_lastconnectiontestat_clear boolean DEFAULT false,
    p_lastconnectiontestat TIMESTAMPTZ DEFAULT NULL,
    p_lastconnectiontestresult_clear boolean DEFAULT false,
    p_lastconnectiontestresult TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwExternalDataSources" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."ExternalDataSource"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "TypeID" = COALESCE(p_typeid, "TypeID"),
        "CredentialID" = CASE WHEN p_credentialid_clear = true THEN NULL ELSE COALESCE(p_credentialid, "CredentialID") END,
        "DefaultSchema" = CASE WHEN p_defaultschema_clear = true THEN NULL ELSE COALESCE(p_defaultschema, "DefaultSchema") END,
        "DefaultDatabase" = CASE WHEN p_defaultdatabase_clear = true THEN NULL ELSE COALESCE(p_defaultdatabase, "DefaultDatabase") END,
        "ConnectionConfig" = CASE WHEN p_connectionconfig_clear = true THEN NULL ELSE COALESCE(p_connectionconfig, "ConnectionConfig") END,
        "DefaultCacheTTLSeconds" = COALESCE(p_defaultcachettlseconds, "DefaultCacheTTLSeconds"),
        "Status" = COALESCE(p_status, "Status"),
        "LastConnectionTestAt" = CASE WHEN p_lastconnectiontestat_clear = true THEN NULL ELSE COALESCE(p_lastconnectiontestat, "LastConnectionTestAt") END,
        "LastConnectionTestResult" = CASE WHEN p_lastconnectiontestresult_clear = true THEN NULL ELSE COALESCE(p_lastconnectiontestresult, "LastConnectionTestResult") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwExternalDataSources"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateExternalDataSource" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateExternalDataSource" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ExternalDataSource table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_external_data_source"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_external_data_source" ON __mj."ExternalDataSource";

CREATE TRIGGER "trg_update_external_data_source"
BEFORE UPDATE ON __mj."ExternalDataSource"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_external_data_source"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: External Data Sources
-- Item: spDeleteExternalDataSource
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ExternalDataSource
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteExternalDataSource'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteExternalDataSource"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."ExternalDataSource"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteExternalDataSource" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteExternalDataSource" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queries
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_query_category_id"
    ON __mj."Query" ("CategoryID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_query_embedding_model_id"
    ON __mj."Query" ("EmbeddingModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_query_sql_dialect_id"
    ON __mj."Query" ("SQLDialectID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_query_external_data_source_id"
    ON __mj."Query" ("ExternalDataSourceID");

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
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwQueries"
AS
SELECT
    q.*,
    MJQueryCategory_CategoryID."Name" AS "Category",
    MJAIModel_EmbeddingModelID."Name" AS "EmbeddingModel",
    MJSQLDialect_SQLDialectID."Name" AS "SQLDialect",
    MJExternalDataSource_ExternalDataSourceID."Name" AS "ExternalDataSource"
FROM
    __mj."Query" AS q
LEFT OUTER JOIN
    __mj."QueryCategory" AS MJQueryCategory_CategoryID
  ON
    "q"."CategoryID" = MJQueryCategory_CategoryID."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS MJAIModel_EmbeddingModelID
  ON
    "q"."EmbeddingModelID" = MJAIModel_EmbeddingModelID."ID"
INNER JOIN
    __mj."SQLDialect" AS MJSQLDialect_SQLDialectID
  ON
    "q"."SQLDialectID" = MJSQLDialect_SQLDialectID."ID"
LEFT OUTER JOIN
    __mj."ExternalDataSource" AS MJExternalDataSource_ExternalDataSourceID
  ON
    "q"."ExternalDataSourceID" = MJExternalDataSource_ExternalDataSourceID."ID"
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
    AND tc.relname = 'vwQueries'
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
    AND tc.relname = 'vwQueries'
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
        AND tc.relname = 'vwQueries'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwQueries" CASCADE;
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
GRANT SELECT ON __mj."vwQueries" TO "cdp_Developer";
GRANT SELECT ON __mj."vwQueries" TO "cdp_UI";
GRANT SELECT ON __mj."vwQueries" TO "cdp_Integration";

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

CREATE OR REPLACE FUNCTION __mj."spCreateQuery"(
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
    p_externaldatasourceid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwQueries" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."Query"
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
                "ExternalDataSourceID"
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
                CASE WHEN p_externaldatasourceid_clear = true THEN NULL ELSE COALESCE(p_externaldatasourceid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwQueries"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateQuery" TO "cdp_Integration";


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

CREATE OR REPLACE FUNCTION __mj."spUpdateQuery"(
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
    p_externaldatasourceid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwQueries" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."Query"
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
        "ExternalDataSourceID" = CASE WHEN p_externaldatasourceid_clear = true THEN NULL ELSE COALESCE(p_externaldatasourceid, "ExternalDataSourceID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwQueries"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateQuery" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Query table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_query"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_query" ON __mj."Query";

CREATE TRIGGER "trg_update_query"
BEFORE UPDATE ON __mj."Query"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_query"();



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

CREATE OR REPLACE FUNCTION __mj."spDeleteQuery"(
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
        FROM __mj."DataContextItem"
        WHERE "QueryID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."DataContextItem"
        SET "QueryID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Query Dependencies records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."QueryDependency"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM __mj."spDeleteQueryDependency"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Dependencies records via DependsOnQueryID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."QueryDependency"
        WHERE "DependsOnQueryID" = p_id
    LOOP
        PERFORM __mj."spDeleteQueryDependency"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Entities records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."QueryEntity"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM __mj."spDeleteQueryEntity"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Fields records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."QueryField"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM __mj."spDeleteQueryField"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Parameters records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."QueryParameter"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM __mj."spDeleteQueryParameter"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Permissions records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."QueryPermission"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM __mj."spDeleteQueryPermission"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query SQLs records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."QuerySQL"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM __mj."spDeleteQuerySQL"(v_rec."ID");
    END LOOP;

    
    DELETE FROM __mj."Query"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteQuery" TO "cdp_Integration";
