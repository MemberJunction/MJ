
-- ===================== DDL: Tables, PKs, Indexes =====================

CREATE TABLE __mj."IntegrationSourceType" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(200) NOT NULL,
 "Description" TEXT NULL,
 "DriverClass" VARCHAR(500) NOT NULL,
 "IconClass" VARCHAR(200) NULL,
 "Status" VARCHAR(50) NOT NULL DEFAULT 'Active',
 CONSTRAINT PK_IntegrationSourceType PRIMARY KEY ("ID"),
 CONSTRAINT UQ_IntegrationSourceType_Name UNIQUE ("Name"),
 CONSTRAINT UQ_IntegrationSourceType_DriverClass UNIQUE ("DriverClass"),
 CONSTRAINT CK_IntegrationSourceType_Status CHECK ("Status" IN ('Active', 'Inactive'))
);

----------------------------------------------------------------------
-- 2. CompanyIntegrationEntityMap
----------------------------------------------------------------------;

CREATE TABLE __mj."CompanyIntegrationEntityMap" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "CompanyIntegrationID" UUID NOT NULL,
 "ExternalObjectName" VARCHAR(500) NOT NULL,
 "ExternalObjectLabel" VARCHAR(500) NULL,
 "EntityID" UUID NOT NULL,
 "SyncDirection" VARCHAR(50) NOT NULL DEFAULT 'Pull',
 "SyncEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
 "MatchStrategy" TEXT NULL,
 "ConflictResolution" VARCHAR(50) NOT NULL DEFAULT 'SourceWins',
 "Priority" INTEGER NOT NULL DEFAULT 0,
 "DeleteBehavior" VARCHAR(50) NOT NULL DEFAULT 'SoftDelete',
 "Status" VARCHAR(50) NOT NULL DEFAULT 'Active',
 "Configuration" TEXT NULL,
 CONSTRAINT PK_CompanyIntegrationEntityMap PRIMARY KEY ("ID"),
 CONSTRAINT FK_CompanyIntegrationEntityMap_CompanyIntegration FOREIGN KEY ("CompanyIntegrationID") REFERENCES __mj."CompanyIntegration"("ID"),
 CONSTRAINT FK_CompanyIntegrationEntityMap_Entity FOREIGN KEY ("EntityID") REFERENCES __mj."Entity"("ID"),
 CONSTRAINT CK_CompanyIntegrationEntityMap_SyncDirection CHECK ("SyncDirection" IN ('Pull', 'Push', 'Bidirectional')),
 CONSTRAINT CK_CompanyIntegrationEntityMap_ConflictResolution CHECK ("ConflictResolution" IN ('SourceWins', 'DestWins', 'MostRecent', 'Manual')),
 CONSTRAINT CK_CompanyIntegrationEntityMap_DeleteBehavior CHECK ("DeleteBehavior" IN ('SoftDelete', 'DoNothing', 'HardDelete')),
 CONSTRAINT CK_CompanyIntegrationEntityMap_Status CHECK ("Status" IN ('Active', 'Inactive'))
);

----------------------------------------------------------------------
-- 3. CompanyIntegrationFieldMap
----------------------------------------------------------------------;

CREATE TABLE __mj."CompanyIntegrationFieldMap" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "EntityMapID" UUID NOT NULL,
 "SourceFieldName" VARCHAR(500) NOT NULL,
 "SourceFieldLabel" VARCHAR(500) NULL,
 "DestinationFieldName" VARCHAR(500) NOT NULL,
 "DestinationFieldLabel" VARCHAR(500) NULL,
 "Direction" VARCHAR(50) NOT NULL DEFAULT 'SourceToDest',
 "TransformPipeline" TEXT NULL,
 "IsKeyField" BOOLEAN NOT NULL DEFAULT FALSE,
 "IsRequired" BOOLEAN NOT NULL DEFAULT FALSE,
 "DefaultValue" TEXT NULL,
 "Priority" INTEGER NOT NULL DEFAULT 0,
 "Status" VARCHAR(50) NOT NULL DEFAULT 'Active',
 CONSTRAINT PK_CompanyIntegrationFieldMap PRIMARY KEY ("ID"),
 CONSTRAINT FK_CompanyIntegrationFieldMap_EntityMap FOREIGN KEY ("EntityMapID") REFERENCES __mj."CompanyIntegrationEntityMap"("ID"),
 CONSTRAINT CK_CompanyIntegrationFieldMap_Direction CHECK ("Direction" IN ('SourceToDest', 'DestToSource', 'Both')),
 CONSTRAINT CK_CompanyIntegrationFieldMap_Status CHECK ("Status" IN ('Active', 'Inactive'))
);

----------------------------------------------------------------------
-- 4. CompanyIntegrationSyncWatermark
----------------------------------------------------------------------;

CREATE TABLE __mj."CompanyIntegrationSyncWatermark" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "EntityMapID" UUID NOT NULL,
 "Direction" VARCHAR(50) NOT NULL DEFAULT 'Pull',
 "WatermarkType" VARCHAR(50) NOT NULL DEFAULT 'Timestamp',
 "WatermarkValue" TEXT NULL,
 "LastSyncAt" TIMESTAMPTZ NULL,
 "RecordsSynced" INTEGER NOT NULL DEFAULT 0,
 CONSTRAINT PK_CompanyIntegrationSyncWatermark PRIMARY KEY ("ID"),
 CONSTRAINT FK_CompanyIntegrationSyncWatermark_EntityMap FOREIGN KEY ("EntityMapID") REFERENCES __mj."CompanyIntegrationEntityMap"("ID"),
 CONSTRAINT CK_CompanyIntegrationSyncWatermark_Direction CHECK ("Direction" IN ('Pull', 'Push')),
 CONSTRAINT CK_CompanyIntegrationSyncWatermark_WatermarkType CHECK ("WatermarkType" IN ('Timestamp', 'Cursor', 'ChangeToken', 'Version')),
 CONSTRAINT UQ_CompanyIntegrationSyncWatermark_EntityMap_Direction UNIQUE ("EntityMapID", "Direction")
);

----------------------------------------------------------------------
-- 5. Add columns to CompanyIntegration
----------------------------------------------------------------------;

ALTER TABLE __mj."CompanyIntegration"
 ADD COLUMN "SourceTypeID" UUID NULL,
 ADD COLUMN "Configuration" TEXT NULL;

ALTER TABLE __mj."CompanyIntegrationEntityMap"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."CompanyIntegrationEntityMap" */

ALTER TABLE __mj."CompanyIntegrationEntityMap"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj."CompanyIntegrationSyncWatermark" */

ALTER TABLE __mj."CompanyIntegrationSyncWatermark"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."CompanyIntegrationSyncWatermark" */

ALTER TABLE __mj."CompanyIntegrationSyncWatermark"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj."IntegrationSourceType" */

ALTER TABLE __mj."IntegrationSourceType"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."IntegrationSourceType" */

ALTER TABLE __mj."IntegrationSourceType"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj."CompanyIntegrationFieldMap" */

ALTER TABLE __mj."CompanyIntegrationFieldMap"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."CompanyIntegrationFieldMap" */

ALTER TABLE __mj."CompanyIntegrationFieldMap"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

/* SQL text to insert new entity field */

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_CompanyIntegrationEntityMap_CompanyIn_905d98f1" ON __mj."CompanyIntegrationEntityMap" ("CompanyIntegrationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_CompanyIntegrationEntityMap_EntityID" ON __mj."CompanyIntegrationEntityMap" ("EntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_CompanyIntegrationFieldMap_EntityMapID" ON __mj."CompanyIntegrationFieldMap" ("EntityMapID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_CompanyIntegrationSyncWatermark_EntityMapID" ON __mj."CompanyIntegrationSyncWatermark" ("EntityMapID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_CompanyIntegration_CompanyID" ON __mj."CompanyIntegration" ("CompanyID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_CompanyIntegration_IntegrationID" ON __mj."CompanyIntegration" ("IntegrationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_CompanyIntegration_SourceTypeID" ON __mj."CompanyIntegration" ("SourceTypeID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwCompanyIntegrationFieldMaps';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwCompanyIntegrationFieldMaps"
AS SELECT
    c.*
FROM
    __mj."CompanyIntegrationFieldMap" AS c$vsql$;
  v_target_oid OID;
  v_dep RECORD;
  v_captured JSONB[] := ARRAY[]::JSONB[];
  v_n INTEGER;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- Column list changed; need CASCADE. Preserve dependent views first.
  SELECT c.oid INTO v_target_oid
  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = v_target_schema AND c.relname = v_target_name AND c.relkind = 'v';
  IF v_target_oid IS NOT NULL THEN
    FOR v_dep IN
      WITH RECURSIVE deps AS (
        SELECT c.oid, c.relname AS name, n.nspname AS schema, 1 AS depth
        FROM pg_rewrite r
        JOIN pg_depend d ON d.objid = r.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE d.refobjid = v_target_oid AND d.deptype = 'n'
          AND c.oid <> v_target_oid AND c.relkind = 'v'
        UNION
        SELECT c.oid, c.relname, n.nspname, p.depth + 1
        FROM deps p
        JOIN pg_rewrite r ON TRUE
        JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = p.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relkind = 'v' AND c.oid <> p.oid
      )
      SELECT oid, name, schema, MAX(depth) AS max_depth,
             pg_catalog.pg_get_viewdef(oid, true) AS viewdef
      FROM deps GROUP BY oid, name, schema
      ORDER BY MAX(depth) ASC
    LOOP
      v_captured := v_captured || jsonb_build_object(
        'schema', v_dep.schema, 'name', v_dep.name, 'def', v_dep.viewdef);
    END LOOP;
  END IF;
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', v_target_schema, v_target_name);
  EXECUTE vsql;
  IF v_captured IS NOT NULL AND array_length(v_captured, 1) > 0 THEN
    FOR v_n IN 1..array_length(v_captured, 1) LOOP
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', v_captured[v_n]->>'def');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not restore dependent view %.%: %',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', SQLERRM;
      END;
    END LOOP;
  END IF;
END;
$do$;

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwCompanyIntegrationEntityMaps';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwCompanyIntegrationEntityMaps"
AS SELECT
    c.*,
    "MJCompanyIntegration_CompanyIntegrationID"."Name" AS "CompanyIntegration",
    "MJEntity_EntityID"."Name" AS "Entity"
FROM
    __mj."CompanyIntegrationEntityMap" AS c
INNER JOIN
    __mj."CompanyIntegration" AS "MJCompanyIntegration_CompanyIntegrationID"
  ON
    c."CompanyIntegrationID" = "MJCompanyIntegration_CompanyIntegrationID"."ID"
INNER JOIN
    __mj."Entity" AS "MJEntity_EntityID"
  ON
    c."EntityID" = "MJEntity_EntityID"."ID"$vsql$;
  v_target_oid OID;
  v_dep RECORD;
  v_captured JSONB[] := ARRAY[]::JSONB[];
  v_n INTEGER;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- Column list changed; need CASCADE. Preserve dependent views first.
  SELECT c.oid INTO v_target_oid
  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = v_target_schema AND c.relname = v_target_name AND c.relkind = 'v';
  IF v_target_oid IS NOT NULL THEN
    FOR v_dep IN
      WITH RECURSIVE deps AS (
        SELECT c.oid, c.relname AS name, n.nspname AS schema, 1 AS depth
        FROM pg_rewrite r
        JOIN pg_depend d ON d.objid = r.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE d.refobjid = v_target_oid AND d.deptype = 'n'
          AND c.oid <> v_target_oid AND c.relkind = 'v'
        UNION
        SELECT c.oid, c.relname, n.nspname, p.depth + 1
        FROM deps p
        JOIN pg_rewrite r ON TRUE
        JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = p.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relkind = 'v' AND c.oid <> p.oid
      )
      SELECT oid, name, schema, MAX(depth) AS max_depth,
             pg_catalog.pg_get_viewdef(oid, true) AS viewdef
      FROM deps GROUP BY oid, name, schema
      ORDER BY MAX(depth) ASC
    LOOP
      v_captured := v_captured || jsonb_build_object(
        'schema', v_dep.schema, 'name', v_dep.name, 'def', v_dep.viewdef);
    END LOOP;
  END IF;
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', v_target_schema, v_target_name);
  EXECUTE vsql;
  IF v_captured IS NOT NULL AND array_length(v_captured, 1) > 0 THEN
    FOR v_n IN 1..array_length(v_captured, 1) LOOP
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', v_captured[v_n]->>'def');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not restore dependent view %.%: %',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', SQLERRM;
      END;
    END LOOP;
  END IF;
END;
$do$;

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwCompanyIntegrationSyncWatermarks';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwCompanyIntegrationSyncWatermarks"
AS SELECT
    c.*
FROM
    __mj."CompanyIntegrationSyncWatermark" AS c$vsql$;
  v_target_oid OID;
  v_dep RECORD;
  v_captured JSONB[] := ARRAY[]::JSONB[];
  v_n INTEGER;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- Column list changed; need CASCADE. Preserve dependent views first.
  SELECT c.oid INTO v_target_oid
  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = v_target_schema AND c.relname = v_target_name AND c.relkind = 'v';
  IF v_target_oid IS NOT NULL THEN
    FOR v_dep IN
      WITH RECURSIVE deps AS (
        SELECT c.oid, c.relname AS name, n.nspname AS schema, 1 AS depth
        FROM pg_rewrite r
        JOIN pg_depend d ON d.objid = r.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE d.refobjid = v_target_oid AND d.deptype = 'n'
          AND c.oid <> v_target_oid AND c.relkind = 'v'
        UNION
        SELECT c.oid, c.relname, n.nspname, p.depth + 1
        FROM deps p
        JOIN pg_rewrite r ON TRUE
        JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = p.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relkind = 'v' AND c.oid <> p.oid
      )
      SELECT oid, name, schema, MAX(depth) AS max_depth,
             pg_catalog.pg_get_viewdef(oid, true) AS viewdef
      FROM deps GROUP BY oid, name, schema
      ORDER BY MAX(depth) ASC
    LOOP
      v_captured := v_captured || jsonb_build_object(
        'schema', v_dep.schema, 'name', v_dep.name, 'def', v_dep.viewdef);
    END LOOP;
  END IF;
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', v_target_schema, v_target_name);
  EXECUTE vsql;
  IF v_captured IS NOT NULL AND array_length(v_captured, 1) > 0 THEN
    FOR v_n IN 1..array_length(v_captured, 1) LOOP
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', v_captured[v_n]->>'def');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not restore dependent view %.%: %',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', SQLERRM;
      END;
    END LOOP;
  END IF;
END;
$do$;

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwIntegrationSourceTypes';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwIntegrationSourceTypes"
AS SELECT
    i.*
FROM
    __mj."IntegrationSourceType" AS i$vsql$;
  v_target_oid OID;
  v_dep RECORD;
  v_captured JSONB[] := ARRAY[]::JSONB[];
  v_n INTEGER;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- Column list changed; need CASCADE. Preserve dependent views first.
  SELECT c.oid INTO v_target_oid
  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = v_target_schema AND c.relname = v_target_name AND c.relkind = 'v';
  IF v_target_oid IS NOT NULL THEN
    FOR v_dep IN
      WITH RECURSIVE deps AS (
        SELECT c.oid, c.relname AS name, n.nspname AS schema, 1 AS depth
        FROM pg_rewrite r
        JOIN pg_depend d ON d.objid = r.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE d.refobjid = v_target_oid AND d.deptype = 'n'
          AND c.oid <> v_target_oid AND c.relkind = 'v'
        UNION
        SELECT c.oid, c.relname, n.nspname, p.depth + 1
        FROM deps p
        JOIN pg_rewrite r ON TRUE
        JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = p.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relkind = 'v' AND c.oid <> p.oid
      )
      SELECT oid, name, schema, MAX(depth) AS max_depth,
             pg_catalog.pg_get_viewdef(oid, true) AS viewdef
      FROM deps GROUP BY oid, name, schema
      ORDER BY MAX(depth) ASC
    LOOP
      v_captured := v_captured || jsonb_build_object(
        'schema', v_dep.schema, 'name', v_dep.name, 'def', v_dep.viewdef);
    END LOOP;
  END IF;
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', v_target_schema, v_target_name);
  EXECUTE vsql;
  IF v_captured IS NOT NULL AND array_length(v_captured, 1) > 0 THEN
    FOR v_n IN 1..array_length(v_captured, 1) LOOP
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', v_captured[v_n]->>'def');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not restore dependent view %.%: %',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', SQLERRM;
      END;
    END LOOP;
  END IF;
END;
$do$;

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwCompanyIntegrationFieldMaps';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwCompanyIntegrationFieldMaps"
AS SELECT
    c.*,
    "MJCompanyIntegrationEntityMap_EntityMapID"."ExternalObjectName" AS "EntityMap"
FROM
    __mj."CompanyIntegrationFieldMap" AS c
INNER JOIN
    __mj."CompanyIntegrationEntityMap" AS "MJCompanyIntegrationEntityMap_EntityMapID"
  ON
    c."EntityMapID" = "MJCompanyIntegrationEntityMap_EntityMapID"."ID"$vsql$;
  v_target_oid OID;
  v_dep RECORD;
  v_captured JSONB[] := ARRAY[]::JSONB[];
  v_n INTEGER;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- Column list changed; need CASCADE. Preserve dependent views first.
  SELECT c.oid INTO v_target_oid
  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = v_target_schema AND c.relname = v_target_name AND c.relkind = 'v';
  IF v_target_oid IS NOT NULL THEN
    FOR v_dep IN
      WITH RECURSIVE deps AS (
        SELECT c.oid, c.relname AS name, n.nspname AS schema, 1 AS depth
        FROM pg_rewrite r
        JOIN pg_depend d ON d.objid = r.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE d.refobjid = v_target_oid AND d.deptype = 'n'
          AND c.oid <> v_target_oid AND c.relkind = 'v'
        UNION
        SELECT c.oid, c.relname, n.nspname, p.depth + 1
        FROM deps p
        JOIN pg_rewrite r ON TRUE
        JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = p.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relkind = 'v' AND c.oid <> p.oid
      )
      SELECT oid, name, schema, MAX(depth) AS max_depth,
             pg_catalog.pg_get_viewdef(oid, true) AS viewdef
      FROM deps GROUP BY oid, name, schema
      ORDER BY MAX(depth) ASC
    LOOP
      v_captured := v_captured || jsonb_build_object(
        'schema', v_dep.schema, 'name', v_dep.name, 'def', v_dep.viewdef);
    END LOOP;
  END IF;
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', v_target_schema, v_target_name);
  EXECUTE vsql;
  IF v_captured IS NOT NULL AND array_length(v_captured, 1) > 0 THEN
    FOR v_n IN 1..array_length(v_captured, 1) LOOP
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', v_captured[v_n]->>'def');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not restore dependent view %.%: %',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', SQLERRM;
      END;
    END LOOP;
  END IF;
END;
$do$;

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwCompanyIntegrationSyncWatermarks';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwCompanyIntegrationSyncWatermarks"
AS SELECT
    c.*,
    "MJCompanyIntegrationEntityMap_EntityMapID"."ExternalObjectName" AS "EntityMap"
FROM
    __mj."CompanyIntegrationSyncWatermark" AS c
INNER JOIN
    __mj."CompanyIntegrationEntityMap" AS "MJCompanyIntegrationEntityMap_EntityMapID"
  ON
    c."EntityMapID" = "MJCompanyIntegrationEntityMap_EntityMapID"."ID"$vsql$;
  v_target_oid OID;
  v_dep RECORD;
  v_captured JSONB[] := ARRAY[]::JSONB[];
  v_n INTEGER;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- Column list changed; need CASCADE. Preserve dependent views first.
  SELECT c.oid INTO v_target_oid
  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = v_target_schema AND c.relname = v_target_name AND c.relkind = 'v';
  IF v_target_oid IS NOT NULL THEN
    FOR v_dep IN
      WITH RECURSIVE deps AS (
        SELECT c.oid, c.relname AS name, n.nspname AS schema, 1 AS depth
        FROM pg_rewrite r
        JOIN pg_depend d ON d.objid = r.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE d.refobjid = v_target_oid AND d.deptype = 'n'
          AND c.oid <> v_target_oid AND c.relkind = 'v'
        UNION
        SELECT c.oid, c.relname, n.nspname, p.depth + 1
        FROM deps p
        JOIN pg_rewrite r ON TRUE
        JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = p.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relkind = 'v' AND c.oid <> p.oid
      )
      SELECT oid, name, schema, MAX(depth) AS max_depth,
             pg_catalog.pg_get_viewdef(oid, true) AS viewdef
      FROM deps GROUP BY oid, name, schema
      ORDER BY MAX(depth) ASC
    LOOP
      v_captured := v_captured || jsonb_build_object(
        'schema', v_dep.schema, 'name', v_dep.name, 'def', v_dep.viewdef);
    END LOOP;
  END IF;
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', v_target_schema, v_target_name);
  EXECUTE vsql;
  IF v_captured IS NOT NULL AND array_length(v_captured, 1) > 0 THEN
    FOR v_n IN 1..array_length(v_captured, 1) LOOP
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', v_captured[v_n]->>'def');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not restore dependent view %.%: %',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', SQLERRM;
      END;
    END LOOP;
  END IF;
END;
$do$;

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwCompanyIntegrationFieldMaps';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwCompanyIntegrationFieldMaps"
AS SELECT
    c.*,
    "MJCompanyIntegrationEntityMap_EntityMapID"."ExternalObjectName" AS "EntityMap"
FROM
    __mj."CompanyIntegrationFieldMap" AS c
INNER JOIN
    __mj."CompanyIntegrationEntityMap" AS "MJCompanyIntegrationEntityMap_EntityMapID"
  ON
    c."EntityMapID" = "MJCompanyIntegrationEntityMap_EntityMapID"."ID"$vsql$;
  v_target_oid OID;
  v_dep RECORD;
  v_captured JSONB[] := ARRAY[]::JSONB[];
  v_n INTEGER;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- Column list changed; need CASCADE. Preserve dependent views first.
  SELECT c.oid INTO v_target_oid
  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = v_target_schema AND c.relname = v_target_name AND c.relkind = 'v';
  IF v_target_oid IS NOT NULL THEN
    FOR v_dep IN
      WITH RECURSIVE deps AS (
        SELECT c.oid, c.relname AS name, n.nspname AS schema, 1 AS depth
        FROM pg_rewrite r
        JOIN pg_depend d ON d.objid = r.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE d.refobjid = v_target_oid AND d.deptype = 'n'
          AND c.oid <> v_target_oid AND c.relkind = 'v'
        UNION
        SELECT c.oid, c.relname, n.nspname, p.depth + 1
        FROM deps p
        JOIN pg_rewrite r ON TRUE
        JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = p.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relkind = 'v' AND c.oid <> p.oid
      )
      SELECT oid, name, schema, MAX(depth) AS max_depth,
             pg_catalog.pg_get_viewdef(oid, true) AS viewdef
      FROM deps GROUP BY oid, name, schema
      ORDER BY MAX(depth) ASC
    LOOP
      v_captured := v_captured || jsonb_build_object(
        'schema', v_dep.schema, 'name', v_dep.name, 'def', v_dep.viewdef);
    END LOOP;
  END IF;
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', v_target_schema, v_target_name);
  EXECUTE vsql;
  IF v_captured IS NOT NULL AND array_length(v_captured, 1) > 0 THEN
    FOR v_n IN 1..array_length(v_captured, 1) LOOP
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', v_captured[v_n]->>'def');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not restore dependent view %.%: %',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', SQLERRM;
      END;
    END LOOP;
  END IF;
END;
$do$;

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwCompanyIntegrationSyncWatermarks';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwCompanyIntegrationSyncWatermarks"
AS SELECT
    c.*,
    "MJCompanyIntegrationEntityMap_EntityMapID"."ExternalObjectName" AS "EntityMap"
FROM
    __mj."CompanyIntegrationSyncWatermark" AS c
INNER JOIN
    __mj."CompanyIntegrationEntityMap" AS "MJCompanyIntegrationEntityMap_EntityMapID"
  ON
    c."EntityMapID" = "MJCompanyIntegrationEntityMap_EntityMapID"."ID"$vsql$;
  v_target_oid OID;
  v_dep RECORD;
  v_captured JSONB[] := ARRAY[]::JSONB[];
  v_n INTEGER;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- Column list changed; need CASCADE. Preserve dependent views first.
  SELECT c.oid INTO v_target_oid
  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = v_target_schema AND c.relname = v_target_name AND c.relkind = 'v';
  IF v_target_oid IS NOT NULL THEN
    FOR v_dep IN
      WITH RECURSIVE deps AS (
        SELECT c.oid, c.relname AS name, n.nspname AS schema, 1 AS depth
        FROM pg_rewrite r
        JOIN pg_depend d ON d.objid = r.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE d.refobjid = v_target_oid AND d.deptype = 'n'
          AND c.oid <> v_target_oid AND c.relkind = 'v'
        UNION
        SELECT c.oid, c.relname, n.nspname, p.depth + 1
        FROM deps p
        JOIN pg_rewrite r ON TRUE
        JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = p.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relkind = 'v' AND c.oid <> p.oid
      )
      SELECT oid, name, schema, MAX(depth) AS max_depth,
             pg_catalog.pg_get_viewdef(oid, true) AS viewdef
      FROM deps GROUP BY oid, name, schema
      ORDER BY MAX(depth) ASC
    LOOP
      v_captured := v_captured || jsonb_build_object(
        'schema', v_dep.schema, 'name', v_dep.name, 'def', v_dep.viewdef);
    END LOOP;
  END IF;
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', v_target_schema, v_target_name);
  EXECUTE vsql;
  IF v_captured IS NOT NULL AND array_length(v_captured, 1) > 0 THEN
    FOR v_n IN 1..array_length(v_captured, 1) LOOP
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', v_captured[v_n]->>'def');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not restore dependent view %.%: %',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', SQLERRM;
      END;
    END LOOP;
  END IF;
END;
$do$;


-- ===================== Stored Procedures (sp*) =====================

CREATE OR REPLACE FUNCTION __mj."spCreateCompanyIntegrationFieldMap"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityMapID UUID DEFAULT NULL,
    IN p_SourceFieldName VARCHAR(500) DEFAULT NULL,
    IN p_SourceFieldLabel VARCHAR(500) DEFAULT NULL,
    IN p_DestinationFieldName VARCHAR(500) DEFAULT NULL,
    IN p_DestinationFieldLabel VARCHAR(500) DEFAULT NULL,
    IN p_Direction VARCHAR(50) DEFAULT NULL,
    IN p_TransformPipeline TEXT DEFAULT NULL,
    IN p_IsKeyField BOOLEAN DEFAULT NULL,
    IN p_IsRequired BOOLEAN DEFAULT NULL,
    IN p_DefaultValue TEXT DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_Status VARCHAR(50) DEFAULT NULL
)
RETURNS SETOF __mj."vwCompanyIntegrationFieldMaps" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."CompanyIntegrationFieldMap"
            (
                "ID",
                "EntityMapID",
                "SourceFieldName",
                "SourceFieldLabel",
                "DestinationFieldName",
                "DestinationFieldLabel",
                "Direction",
                "TransformPipeline",
                "IsKeyField",
                "IsRequired",
                "DefaultValue",
                "Priority",
                "Status"
            )
        VALUES
            (
                p_ID,
                p_EntityMapID,
                p_SourceFieldName,
                p_SourceFieldLabel,
                p_DestinationFieldName,
                p_DestinationFieldLabel,
                COALESCE(p_Direction, 'SourceToDest'),
                p_TransformPipeline,
                COALESCE(p_IsKeyField, FALSE),
                COALESCE(p_IsRequired, FALSE),
                p_DefaultValue,
                COALESCE(p_Priority, 0),
                COALESCE(p_Status, 'Active')
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."CompanyIntegrationFieldMap"
            (
                "EntityMapID",
                "SourceFieldName",
                "SourceFieldLabel",
                "DestinationFieldName",
                "DestinationFieldLabel",
                "Direction",
                "TransformPipeline",
                "IsKeyField",
                "IsRequired",
                "DefaultValue",
                "Priority",
                "Status"
            )
        VALUES
            (
                p_EntityMapID,
                p_SourceFieldName,
                p_SourceFieldLabel,
                p_DestinationFieldName,
                p_DestinationFieldLabel,
                COALESCE(p_Direction, 'SourceToDest'),
                p_TransformPipeline,
                COALESCE(p_IsKeyField, FALSE),
                COALESCE(p_IsRequired, FALSE),
                p_DefaultValue,
                COALESCE(p_Priority, 0),
                COALESCE(p_Status, 'Active')
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationFieldMaps" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCompanyIntegrationFieldMap"(
    IN p_ID UUID,
    IN p_EntityMapID UUID,
    IN p_SourceFieldName VARCHAR(500),
    IN p_SourceFieldLabel VARCHAR(500),
    IN p_DestinationFieldName VARCHAR(500),
    IN p_DestinationFieldLabel VARCHAR(500),
    IN p_Direction VARCHAR(50),
    IN p_TransformPipeline TEXT,
    IN p_IsKeyField BOOLEAN,
    IN p_IsRequired BOOLEAN,
    IN p_DefaultValue TEXT,
    IN p_Priority INTEGER,
    IN p_Status VARCHAR(50)
)
RETURNS SETOF __mj."vwCompanyIntegrationFieldMaps" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."CompanyIntegrationFieldMap"
    SET
        "EntityMapID" = p_EntityMapID,
        "SourceFieldName" = p_SourceFieldName,
        "SourceFieldLabel" = p_SourceFieldLabel,
        "DestinationFieldName" = p_DestinationFieldName,
        "DestinationFieldLabel" = p_DestinationFieldLabel,
        "Direction" = p_Direction,
        "TransformPipeline" = p_TransformPipeline,
        "IsKeyField" = p_IsKeyField,
        "IsRequired" = p_IsRequired,
        "DefaultValue" = p_DefaultValue,
        "Priority" = p_Priority,
        "Status" = p_Status
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationFieldMaps" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationFieldMaps" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegrationFieldMap"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CompanyIntegrationFieldMap"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCompanyIntegrationEntityMap"(
    IN p_ID UUID DEFAULT NULL,
    IN p_CompanyIntegrationID UUID DEFAULT NULL,
    IN p_ExternalObjectName VARCHAR(500) DEFAULT NULL,
    IN p_ExternalObjectLabel VARCHAR(500) DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_SyncDirection VARCHAR(50) DEFAULT NULL,
    IN p_SyncEnabled BOOLEAN DEFAULT NULL,
    IN p_MatchStrategy TEXT DEFAULT NULL,
    IN p_ConflictResolution VARCHAR(50) DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_DeleteBehavior VARCHAR(50) DEFAULT NULL,
    IN p_Status VARCHAR(50) DEFAULT NULL,
    IN p_Configuration TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwCompanyIntegrationEntityMaps" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."CompanyIntegrationEntityMap"
            (
                "ID",
                "CompanyIntegrationID",
                "ExternalObjectName",
                "ExternalObjectLabel",
                "EntityID",
                "SyncDirection",
                "SyncEnabled",
                "MatchStrategy",
                "ConflictResolution",
                "Priority",
                "DeleteBehavior",
                "Status",
                "Configuration"
            )
        VALUES
            (
                p_ID,
                p_CompanyIntegrationID,
                p_ExternalObjectName,
                p_ExternalObjectLabel,
                p_EntityID,
                COALESCE(p_SyncDirection, 'Pull'),
                COALESCE(p_SyncEnabled, TRUE),
                p_MatchStrategy,
                COALESCE(p_ConflictResolution, 'SourceWins'),
                COALESCE(p_Priority, 0),
                COALESCE(p_DeleteBehavior, 'SoftDelete'),
                COALESCE(p_Status, 'Active'),
                p_Configuration
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."CompanyIntegrationEntityMap"
            (
                "CompanyIntegrationID",
                "ExternalObjectName",
                "ExternalObjectLabel",
                "EntityID",
                "SyncDirection",
                "SyncEnabled",
                "MatchStrategy",
                "ConflictResolution",
                "Priority",
                "DeleteBehavior",
                "Status",
                "Configuration"
            )
        VALUES
            (
                p_CompanyIntegrationID,
                p_ExternalObjectName,
                p_ExternalObjectLabel,
                p_EntityID,
                COALESCE(p_SyncDirection, 'Pull'),
                COALESCE(p_SyncEnabled, TRUE),
                p_MatchStrategy,
                COALESCE(p_ConflictResolution, 'SourceWins'),
                COALESCE(p_Priority, 0),
                COALESCE(p_DeleteBehavior, 'SoftDelete'),
                COALESCE(p_Status, 'Active'),
                p_Configuration
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationEntityMaps" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCompanyIntegrationEntityMap"(
    IN p_ID UUID,
    IN p_CompanyIntegrationID UUID,
    IN p_ExternalObjectName VARCHAR(500),
    IN p_ExternalObjectLabel VARCHAR(500),
    IN p_EntityID UUID,
    IN p_SyncDirection VARCHAR(50),
    IN p_SyncEnabled BOOLEAN,
    IN p_MatchStrategy TEXT,
    IN p_ConflictResolution VARCHAR(50),
    IN p_Priority INTEGER,
    IN p_DeleteBehavior VARCHAR(50),
    IN p_Status VARCHAR(50),
    IN p_Configuration TEXT
)
RETURNS SETOF __mj."vwCompanyIntegrationEntityMaps" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."CompanyIntegrationEntityMap"
    SET
        "CompanyIntegrationID" = p_CompanyIntegrationID,
        "ExternalObjectName" = p_ExternalObjectName,
        "ExternalObjectLabel" = p_ExternalObjectLabel,
        "EntityID" = p_EntityID,
        "SyncDirection" = p_SyncDirection,
        "SyncEnabled" = p_SyncEnabled,
        "MatchStrategy" = p_MatchStrategy,
        "ConflictResolution" = p_ConflictResolution,
        "Priority" = p_Priority,
        "DeleteBehavior" = p_DeleteBehavior,
        "Status" = p_Status,
        "Configuration" = p_Configuration
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationEntityMaps" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationEntityMaps" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegrationEntityMap"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CompanyIntegrationEntityMap"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCompanyIntegration"(
    IN p_ID UUID DEFAULT NULL,
    IN p_CompanyID UUID DEFAULT NULL,
    IN p_IntegrationID UUID DEFAULT NULL,
    IN p_IsActive BOOLEAN DEFAULT NULL,
    IN p_AccessToken VARCHAR(255) DEFAULT NULL,
    IN p_RefreshToken VARCHAR(255) DEFAULT NULL,
    IN p_TokenExpirationDate TIMESTAMPTZ DEFAULT NULL,
    IN p_APIKey VARCHAR(255) DEFAULT NULL,
    IN p_ExternalSystemID VARCHAR(100) DEFAULT NULL,
    IN p_IsExternalSystemReadOnly BOOLEAN DEFAULT NULL,
    IN p_ClientID VARCHAR(255) DEFAULT NULL,
    IN p_ClientSecret VARCHAR(255) DEFAULT NULL,
    IN p_CustomAttribute1 VARCHAR(255) DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_SourceTypeID UUID DEFAULT NULL,
    IN p_Configuration TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwCompanyIntegrations" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."CompanyIntegration"
            (
                "ID",
                "CompanyID",
                "IntegrationID",
                "IsActive",
                "AccessToken",
                "RefreshToken",
                "TokenExpirationDate",
                "APIKey",
                "ExternalSystemID",
                "IsExternalSystemReadOnly",
                "ClientID",
                "ClientSecret",
                "CustomAttribute1",
                "Name",
                "SourceTypeID",
                "Configuration"
            )
        VALUES
            (
                p_ID,
                p_CompanyID,
                p_IntegrationID,
                p_IsActive,
                p_AccessToken,
                p_RefreshToken,
                p_TokenExpirationDate,
                p_APIKey,
                p_ExternalSystemID,
                COALESCE(p_IsExternalSystemReadOnly, FALSE),
                p_ClientID,
                p_ClientSecret,
                p_CustomAttribute1,
                p_Name,
                p_SourceTypeID,
                p_Configuration
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."CompanyIntegration"
            (
                "CompanyID",
                "IntegrationID",
                "IsActive",
                "AccessToken",
                "RefreshToken",
                "TokenExpirationDate",
                "APIKey",
                "ExternalSystemID",
                "IsExternalSystemReadOnly",
                "ClientID",
                "ClientSecret",
                "CustomAttribute1",
                "Name",
                "SourceTypeID",
                "Configuration"
            )
        VALUES
            (
                p_CompanyID,
                p_IntegrationID,
                p_IsActive,
                p_AccessToken,
                p_RefreshToken,
                p_TokenExpirationDate,
                p_APIKey,
                p_ExternalSystemID,
                COALESCE(p_IsExternalSystemReadOnly, FALSE),
                p_ClientID,
                p_ClientSecret,
                p_CustomAttribute1,
                p_Name,
                p_SourceTypeID,
                p_Configuration
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrations" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCompanyIntegration"(
    IN p_ID UUID,
    IN p_CompanyID UUID,
    IN p_IntegrationID UUID,
    IN p_IsActive BOOLEAN,
    IN p_AccessToken VARCHAR(255),
    IN p_RefreshToken VARCHAR(255),
    IN p_TokenExpirationDate TIMESTAMPTZ,
    IN p_APIKey VARCHAR(255),
    IN p_ExternalSystemID VARCHAR(100),
    IN p_IsExternalSystemReadOnly BOOLEAN,
    IN p_ClientID VARCHAR(255),
    IN p_ClientSecret VARCHAR(255),
    IN p_CustomAttribute1 VARCHAR(255),
    IN p_Name VARCHAR(255),
    IN p_SourceTypeID UUID,
    IN p_Configuration TEXT
)
RETURNS SETOF __mj."vwCompanyIntegrations" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."CompanyIntegration"
    SET
        "CompanyID" = p_CompanyID,
        "IntegrationID" = p_IntegrationID,
        "IsActive" = p_IsActive,
        "AccessToken" = p_AccessToken,
        "RefreshToken" = p_RefreshToken,
        "TokenExpirationDate" = p_TokenExpirationDate,
        "APIKey" = p_APIKey,
        "ExternalSystemID" = p_ExternalSystemID,
        "IsExternalSystemReadOnly" = p_IsExternalSystemReadOnly,
        "ClientID" = p_ClientID,
        "ClientSecret" = p_ClientSecret,
        "CustomAttribute1" = p_CustomAttribute1,
        "Name" = p_Name,
        "SourceTypeID" = p_SourceTypeID,
        "Configuration" = p_Configuration
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrations" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrations" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegration"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CompanyIntegration"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCompanyIntegrationSyncWatermark"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityMapID UUID DEFAULT NULL,
    IN p_Direction VARCHAR(50) DEFAULT NULL,
    IN p_WatermarkType VARCHAR(50) DEFAULT NULL,
    IN p_WatermarkValue TEXT DEFAULT NULL,
    IN p_LastSyncAt TIMESTAMPTZ DEFAULT NULL,
    IN p_RecordsSynced INTEGER DEFAULT NULL
)
RETURNS SETOF __mj."vwCompanyIntegrationSyncWatermarks" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."CompanyIntegrationSyncWatermark"
            (
                "ID",
                "EntityMapID",
                "Direction",
                "WatermarkType",
                "WatermarkValue",
                "LastSyncAt",
                "RecordsSynced"
            )
        VALUES
            (
                p_ID,
                p_EntityMapID,
                COALESCE(p_Direction, 'Pull'),
                COALESCE(p_WatermarkType, 'Timestamp'),
                p_WatermarkValue,
                p_LastSyncAt,
                COALESCE(p_RecordsSynced, 0)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."CompanyIntegrationSyncWatermark"
            (
                "EntityMapID",
                "Direction",
                "WatermarkType",
                "WatermarkValue",
                "LastSyncAt",
                "RecordsSynced"
            )
        VALUES
            (
                p_EntityMapID,
                COALESCE(p_Direction, 'Pull'),
                COALESCE(p_WatermarkType, 'Timestamp'),
                p_WatermarkValue,
                p_LastSyncAt,
                COALESCE(p_RecordsSynced, 0)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationSyncWatermarks" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCompanyIntegrationSyncWatermark"(
    IN p_ID UUID,
    IN p_EntityMapID UUID,
    IN p_Direction VARCHAR(50),
    IN p_WatermarkType VARCHAR(50),
    IN p_WatermarkValue TEXT,
    IN p_LastSyncAt TIMESTAMPTZ,
    IN p_RecordsSynced INTEGER
)
RETURNS SETOF __mj."vwCompanyIntegrationSyncWatermarks" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."CompanyIntegrationSyncWatermark"
    SET
        "EntityMapID" = p_EntityMapID,
        "Direction" = p_Direction,
        "WatermarkType" = p_WatermarkType,
        "WatermarkValue" = p_WatermarkValue,
        "LastSyncAt" = p_LastSyncAt,
        "RecordsSynced" = p_RecordsSynced
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationSyncWatermarks" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationSyncWatermarks" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegrationSyncWatermark"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CompanyIntegrationSyncWatermark"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateIntegrationSourceType"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(200) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_DriverClass VARCHAR(500) DEFAULT NULL,
    IN p_IconClass VARCHAR(200) DEFAULT NULL,
    IN p_Status VARCHAR(50) DEFAULT NULL
)
RETURNS SETOF __mj."vwIntegrationSourceTypes" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."IntegrationSourceType"
            (
                "ID",
                "Name",
                "Description",
                "DriverClass",
                "IconClass",
                "Status"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_Description,
                p_DriverClass,
                p_IconClass,
                COALESCE(p_Status, 'Active')
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."IntegrationSourceType"
            (
                "Name",
                "Description",
                "DriverClass",
                "IconClass",
                "Status"
            )
        VALUES
            (
                p_Name,
                p_Description,
                p_DriverClass,
                p_IconClass,
                COALESCE(p_Status, 'Active')
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwIntegrationSourceTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateIntegrationSourceType"(
    IN p_ID UUID,
    IN p_Name VARCHAR(200),
    IN p_Description TEXT,
    IN p_DriverClass VARCHAR(500),
    IN p_IconClass VARCHAR(200),
    IN p_Status VARCHAR(50)
)
RETURNS SETOF __mj."vwIntegrationSourceTypes" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."IntegrationSourceType"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "DriverClass" = p_DriverClass,
        "IconClass" = p_IconClass,
        "Status" = p_Status
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwIntegrationSourceTypes" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwIntegrationSourceTypes" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteIntegrationSourceType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."IntegrationSourceType"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCompanyIntegrationFieldMap"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityMapID UUID DEFAULT NULL,
    IN p_SourceFieldName VARCHAR(500) DEFAULT NULL,
    IN p_SourceFieldLabel VARCHAR(500) DEFAULT NULL,
    IN p_DestinationFieldName VARCHAR(500) DEFAULT NULL,
    IN p_DestinationFieldLabel VARCHAR(500) DEFAULT NULL,
    IN p_Direction VARCHAR(50) DEFAULT NULL,
    IN p_TransformPipeline TEXT DEFAULT NULL,
    IN p_IsKeyField BOOLEAN DEFAULT NULL,
    IN p_IsRequired BOOLEAN DEFAULT NULL,
    IN p_DefaultValue TEXT DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_Status VARCHAR(50) DEFAULT NULL
)
RETURNS SETOF __mj."vwCompanyIntegrationFieldMaps" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."CompanyIntegrationFieldMap"
            (
                "ID",
                "EntityMapID",
                "SourceFieldName",
                "SourceFieldLabel",
                "DestinationFieldName",
                "DestinationFieldLabel",
                "Direction",
                "TransformPipeline",
                "IsKeyField",
                "IsRequired",
                "DefaultValue",
                "Priority",
                "Status"
            )
        VALUES
            (
                p_ID,
                p_EntityMapID,
                p_SourceFieldName,
                p_SourceFieldLabel,
                p_DestinationFieldName,
                p_DestinationFieldLabel,
                COALESCE(p_Direction, 'SourceToDest'),
                p_TransformPipeline,
                COALESCE(p_IsKeyField, FALSE),
                COALESCE(p_IsRequired, FALSE),
                p_DefaultValue,
                COALESCE(p_Priority, 0),
                COALESCE(p_Status, 'Active')
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."CompanyIntegrationFieldMap"
            (
                "EntityMapID",
                "SourceFieldName",
                "SourceFieldLabel",
                "DestinationFieldName",
                "DestinationFieldLabel",
                "Direction",
                "TransformPipeline",
                "IsKeyField",
                "IsRequired",
                "DefaultValue",
                "Priority",
                "Status"
            )
        VALUES
            (
                p_EntityMapID,
                p_SourceFieldName,
                p_SourceFieldLabel,
                p_DestinationFieldName,
                p_DestinationFieldLabel,
                COALESCE(p_Direction, 'SourceToDest'),
                p_TransformPipeline,
                COALESCE(p_IsKeyField, FALSE),
                COALESCE(p_IsRequired, FALSE),
                p_DefaultValue,
                COALESCE(p_Priority, 0),
                COALESCE(p_Status, 'Active')
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationFieldMaps" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCompanyIntegrationFieldMap"(
    IN p_ID UUID,
    IN p_EntityMapID UUID,
    IN p_SourceFieldName VARCHAR(500),
    IN p_SourceFieldLabel VARCHAR(500),
    IN p_DestinationFieldName VARCHAR(500),
    IN p_DestinationFieldLabel VARCHAR(500),
    IN p_Direction VARCHAR(50),
    IN p_TransformPipeline TEXT,
    IN p_IsKeyField BOOLEAN,
    IN p_IsRequired BOOLEAN,
    IN p_DefaultValue TEXT,
    IN p_Priority INTEGER,
    IN p_Status VARCHAR(50)
)
RETURNS SETOF __mj."vwCompanyIntegrationFieldMaps" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."CompanyIntegrationFieldMap"
    SET
        "EntityMapID" = p_EntityMapID,
        "SourceFieldName" = p_SourceFieldName,
        "SourceFieldLabel" = p_SourceFieldLabel,
        "DestinationFieldName" = p_DestinationFieldName,
        "DestinationFieldLabel" = p_DestinationFieldLabel,
        "Direction" = p_Direction,
        "TransformPipeline" = p_TransformPipeline,
        "IsKeyField" = p_IsKeyField,
        "IsRequired" = p_IsRequired,
        "DefaultValue" = p_DefaultValue,
        "Priority" = p_Priority,
        "Status" = p_Status
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationFieldMaps" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationFieldMaps" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegrationFieldMap"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CompanyIntegrationFieldMap"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCompanyIntegrationSyncWatermark"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityMapID UUID DEFAULT NULL,
    IN p_Direction VARCHAR(50) DEFAULT NULL,
    IN p_WatermarkType VARCHAR(50) DEFAULT NULL,
    IN p_WatermarkValue TEXT DEFAULT NULL,
    IN p_LastSyncAt TIMESTAMPTZ DEFAULT NULL,
    IN p_RecordsSynced INTEGER DEFAULT NULL
)
RETURNS SETOF __mj."vwCompanyIntegrationSyncWatermarks" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."CompanyIntegrationSyncWatermark"
            (
                "ID",
                "EntityMapID",
                "Direction",
                "WatermarkType",
                "WatermarkValue",
                "LastSyncAt",
                "RecordsSynced"
            )
        VALUES
            (
                p_ID,
                p_EntityMapID,
                COALESCE(p_Direction, 'Pull'),
                COALESCE(p_WatermarkType, 'Timestamp'),
                p_WatermarkValue,
                p_LastSyncAt,
                COALESCE(p_RecordsSynced, 0)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."CompanyIntegrationSyncWatermark"
            (
                "EntityMapID",
                "Direction",
                "WatermarkType",
                "WatermarkValue",
                "LastSyncAt",
                "RecordsSynced"
            )
        VALUES
            (
                p_EntityMapID,
                COALESCE(p_Direction, 'Pull'),
                COALESCE(p_WatermarkType, 'Timestamp'),
                p_WatermarkValue,
                p_LastSyncAt,
                COALESCE(p_RecordsSynced, 0)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationSyncWatermarks" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCompanyIntegrationSyncWatermark"(
    IN p_ID UUID,
    IN p_EntityMapID UUID,
    IN p_Direction VARCHAR(50),
    IN p_WatermarkType VARCHAR(50),
    IN p_WatermarkValue TEXT,
    IN p_LastSyncAt TIMESTAMPTZ,
    IN p_RecordsSynced INTEGER
)
RETURNS SETOF __mj."vwCompanyIntegrationSyncWatermarks" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."CompanyIntegrationSyncWatermark"
    SET
        "EntityMapID" = p_EntityMapID,
        "Direction" = p_Direction,
        "WatermarkType" = p_WatermarkType,
        "WatermarkValue" = p_WatermarkValue,
        "LastSyncAt" = p_LastSyncAt,
        "RecordsSynced" = p_RecordsSynced
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationSyncWatermarks" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationSyncWatermarks" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegrationSyncWatermark"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CompanyIntegrationSyncWatermark"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCompanyIntegrationFieldMap"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityMapID UUID DEFAULT NULL,
    IN p_SourceFieldName VARCHAR(500) DEFAULT NULL,
    IN p_SourceFieldLabel VARCHAR(500) DEFAULT NULL,
    IN p_DestinationFieldName VARCHAR(500) DEFAULT NULL,
    IN p_DestinationFieldLabel VARCHAR(500) DEFAULT NULL,
    IN p_Direction VARCHAR(50) DEFAULT NULL,
    IN p_TransformPipeline TEXT DEFAULT NULL,
    IN p_IsKeyField BOOLEAN DEFAULT NULL,
    IN p_IsRequired BOOLEAN DEFAULT NULL,
    IN p_DefaultValue TEXT DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_Status VARCHAR(50) DEFAULT NULL
)
RETURNS SETOF __mj."vwCompanyIntegrationFieldMaps" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."CompanyIntegrationFieldMap"
            (
                "ID",
                "EntityMapID",
                "SourceFieldName",
                "SourceFieldLabel",
                "DestinationFieldName",
                "DestinationFieldLabel",
                "Direction",
                "TransformPipeline",
                "IsKeyField",
                "IsRequired",
                "DefaultValue",
                "Priority",
                "Status"
            )
        VALUES
            (
                p_ID,
                p_EntityMapID,
                p_SourceFieldName,
                p_SourceFieldLabel,
                p_DestinationFieldName,
                p_DestinationFieldLabel,
                COALESCE(p_Direction, 'SourceToDest'),
                p_TransformPipeline,
                COALESCE(p_IsKeyField, FALSE),
                COALESCE(p_IsRequired, FALSE),
                p_DefaultValue,
                COALESCE(p_Priority, 0),
                COALESCE(p_Status, 'Active')
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."CompanyIntegrationFieldMap"
            (
                "EntityMapID",
                "SourceFieldName",
                "SourceFieldLabel",
                "DestinationFieldName",
                "DestinationFieldLabel",
                "Direction",
                "TransformPipeline",
                "IsKeyField",
                "IsRequired",
                "DefaultValue",
                "Priority",
                "Status"
            )
        VALUES
            (
                p_EntityMapID,
                p_SourceFieldName,
                p_SourceFieldLabel,
                p_DestinationFieldName,
                p_DestinationFieldLabel,
                COALESCE(p_Direction, 'SourceToDest'),
                p_TransformPipeline,
                COALESCE(p_IsKeyField, FALSE),
                COALESCE(p_IsRequired, FALSE),
                p_DefaultValue,
                COALESCE(p_Priority, 0),
                COALESCE(p_Status, 'Active')
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationFieldMaps" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCompanyIntegrationFieldMap"(
    IN p_ID UUID,
    IN p_EntityMapID UUID,
    IN p_SourceFieldName VARCHAR(500),
    IN p_SourceFieldLabel VARCHAR(500),
    IN p_DestinationFieldName VARCHAR(500),
    IN p_DestinationFieldLabel VARCHAR(500),
    IN p_Direction VARCHAR(50),
    IN p_TransformPipeline TEXT,
    IN p_IsKeyField BOOLEAN,
    IN p_IsRequired BOOLEAN,
    IN p_DefaultValue TEXT,
    IN p_Priority INTEGER,
    IN p_Status VARCHAR(50)
)
RETURNS SETOF __mj."vwCompanyIntegrationFieldMaps" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."CompanyIntegrationFieldMap"
    SET
        "EntityMapID" = p_EntityMapID,
        "SourceFieldName" = p_SourceFieldName,
        "SourceFieldLabel" = p_SourceFieldLabel,
        "DestinationFieldName" = p_DestinationFieldName,
        "DestinationFieldLabel" = p_DestinationFieldLabel,
        "Direction" = p_Direction,
        "TransformPipeline" = p_TransformPipeline,
        "IsKeyField" = p_IsKeyField,
        "IsRequired" = p_IsRequired,
        "DefaultValue" = p_DefaultValue,
        "Priority" = p_Priority,
        "Status" = p_Status
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationFieldMaps" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationFieldMaps" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegrationFieldMap"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CompanyIntegrationFieldMap"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCompanyIntegrationSyncWatermark"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityMapID UUID DEFAULT NULL,
    IN p_Direction VARCHAR(50) DEFAULT NULL,
    IN p_WatermarkType VARCHAR(50) DEFAULT NULL,
    IN p_WatermarkValue TEXT DEFAULT NULL,
    IN p_LastSyncAt TIMESTAMPTZ DEFAULT NULL,
    IN p_RecordsSynced INTEGER DEFAULT NULL
)
RETURNS SETOF __mj."vwCompanyIntegrationSyncWatermarks" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."CompanyIntegrationSyncWatermark"
            (
                "ID",
                "EntityMapID",
                "Direction",
                "WatermarkType",
                "WatermarkValue",
                "LastSyncAt",
                "RecordsSynced"
            )
        VALUES
            (
                p_ID,
                p_EntityMapID,
                COALESCE(p_Direction, 'Pull'),
                COALESCE(p_WatermarkType, 'Timestamp'),
                p_WatermarkValue,
                p_LastSyncAt,
                COALESCE(p_RecordsSynced, 0)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."CompanyIntegrationSyncWatermark"
            (
                "EntityMapID",
                "Direction",
                "WatermarkType",
                "WatermarkValue",
                "LastSyncAt",
                "RecordsSynced"
            )
        VALUES
            (
                p_EntityMapID,
                COALESCE(p_Direction, 'Pull'),
                COALESCE(p_WatermarkType, 'Timestamp'),
                p_WatermarkValue,
                p_LastSyncAt,
                COALESCE(p_RecordsSynced, 0)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationSyncWatermarks" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCompanyIntegrationSyncWatermark"(
    IN p_ID UUID,
    IN p_EntityMapID UUID,
    IN p_Direction VARCHAR(50),
    IN p_WatermarkType VARCHAR(50),
    IN p_WatermarkValue TEXT,
    IN p_LastSyncAt TIMESTAMPTZ,
    IN p_RecordsSynced INTEGER
)
RETURNS SETOF __mj."vwCompanyIntegrationSyncWatermarks" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."CompanyIntegrationSyncWatermark"
    SET
        "EntityMapID" = p_EntityMapID,
        "Direction" = p_Direction,
        "WatermarkType" = p_WatermarkType,
        "WatermarkValue" = p_WatermarkValue,
        "LastSyncAt" = p_LastSyncAt,
        "RecordsSynced" = p_RecordsSynced
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationSyncWatermarks" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationSyncWatermarks" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegrationSyncWatermark"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CompanyIntegrationSyncWatermark"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;


-- ===================== Triggers =====================

CREATE OR REPLACE FUNCTION __mj."trgUpdateCompanyIntegrationFieldMap_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateCompanyIntegrationFieldMap" ON __mj."CompanyIntegrationFieldMap";
CREATE TRIGGER "trgUpdateCompanyIntegrationFieldMap"
    BEFORE UPDATE ON __mj."CompanyIntegrationFieldMap"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateCompanyIntegrationFieldMap_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateCompanyIntegrationEntityMap_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateCompanyIntegrationEntityMap" ON __mj."CompanyIntegrationEntityMap";
CREATE TRIGGER "trgUpdateCompanyIntegrationEntityMap"
    BEFORE UPDATE ON __mj."CompanyIntegrationEntityMap"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateCompanyIntegrationEntityMap_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateCompanyIntegration_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateCompanyIntegration" ON __mj."CompanyIntegration";
CREATE TRIGGER "trgUpdateCompanyIntegration"
    BEFORE UPDATE ON __mj."CompanyIntegration"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateCompanyIntegration_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateCompanyIntegrationSyncWatermark_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateCompanyIntegrationSyncWatermark" ON __mj."CompanyIntegrationSyncWatermark";
CREATE TRIGGER "trgUpdateCompanyIntegrationSyncWatermark"
    BEFORE UPDATE ON __mj."CompanyIntegrationSyncWatermark"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateCompanyIntegrationSyncWatermark_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateIntegrationSourceType_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateIntegrationSourceType" ON __mj."IntegrationSourceType";
CREATE TRIGGER "trgUpdateIntegrationSourceType"
    BEFORE UPDATE ON __mj."IntegrationSourceType"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateIntegrationSourceType_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateCompanyIntegrationFieldMap_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateCompanyIntegrationFieldMap" ON __mj."CompanyIntegrationFieldMap";
CREATE TRIGGER "trgUpdateCompanyIntegrationFieldMap"
    BEFORE UPDATE ON __mj."CompanyIntegrationFieldMap"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateCompanyIntegrationFieldMap_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateCompanyIntegrationSyncWatermark_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateCompanyIntegrationSyncWatermark" ON __mj."CompanyIntegrationSyncWatermark";
CREATE TRIGGER "trgUpdateCompanyIntegrationSyncWatermark"
    BEFORE UPDATE ON __mj."CompanyIntegrationSyncWatermark"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateCompanyIntegrationSyncWatermark_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateCompanyIntegrationFieldMap_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateCompanyIntegrationFieldMap" ON __mj."CompanyIntegrationFieldMap";
CREATE TRIGGER "trgUpdateCompanyIntegrationFieldMap"
    BEFORE UPDATE ON __mj."CompanyIntegrationFieldMap"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateCompanyIntegrationFieldMap_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateCompanyIntegrationSyncWatermark_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateCompanyIntegrationSyncWatermark" ON __mj."CompanyIntegrationSyncWatermark";
CREATE TRIGGER "trgUpdateCompanyIntegrationSyncWatermark"
    BEFORE UPDATE ON __mj."CompanyIntegrationSyncWatermark"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateCompanyIntegrationSyncWatermark_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

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
         "AllowUserSearchAPI"
         , "TrackRecordChanges"
         , "AuditRecordAccess"
         , "AuditViewRuns"
         , "AllowAllRowsAPI"
         , "AllowCreateAPI"
         , "AllowUpdateAPI"
         , "AllowDeleteAPI"
         , "UserViewMaxRows"
         , "__mj_CreatedAt"
         , "__mj_UpdatedAt"
      )
      VALUES (
         '57801845-6620-4cbd-993f-e4aa2d464a04',
         'MJ: Integration Source Types',
         'Integration Source Types',
         'Defines categories of integration sources such as SaaS API, Relational Database, or File Feed.',
         NULL,
         'IntegrationSourceType',
         'vwIntegrationSourceTypes',
         '__mj',
         TRUE,
         FALSE
         , TRUE
         , FALSE
         , FALSE
         , FALSE
         , TRUE
         , TRUE
         , TRUE
         , 1000
         , NOW()
         , NOW()
      );
/* SQL generated to add new entity MJ: Integration Source Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '57801845-6620-4cbd-993f-e4aa2d464a04', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Integration Source Types for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('57801845-6620-4cbd-993f-e4aa2d464a04', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Integration Source Types for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('57801845-6620-4cbd-993f-e4aa2d464a04', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Integration Source Types for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('57801845-6620-4cbd-993f-e4aa2d464a04', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL generated to create new entity MJ: Company Integration Entity Maps */

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
         "AllowUserSearchAPI"
         , "TrackRecordChanges"
         , "AuditRecordAccess"
         , "AuditViewRuns"
         , "AllowAllRowsAPI"
         , "AllowCreateAPI"
         , "AllowUpdateAPI"
         , "AllowDeleteAPI"
         , "UserViewMaxRows"
         , "__mj_CreatedAt"
         , "__mj_UpdatedAt"
      )
      VALUES (
         '41579cac-5ddc-48b4-8703-31292be0a414',
         'MJ: Company Integration Entity Maps',
         'Company Integration Entity Maps',
         'Maps an external object from a company integration to a MemberJunction entity, controlling sync direction, matching, and conflict resolution.',
         NULL,
         'CompanyIntegrationEntityMap',
         'vwCompanyIntegrationEntityMaps',
         '__mj',
         TRUE,
         FALSE
         , TRUE
         , FALSE
         , FALSE
         , FALSE
         , TRUE
         , TRUE
         , TRUE
         , 1000
         , NOW()
         , NOW()
      );
/* SQL generated to add new entity MJ: Company Integration Entity Maps to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '41579cac-5ddc-48b4-8703-31292be0a414', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Company Integration Entity Maps for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('41579cac-5ddc-48b4-8703-31292be0a414', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Company Integration Entity Maps for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('41579cac-5ddc-48b4-8703-31292be0a414', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Company Integration Entity Maps for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('41579cac-5ddc-48b4-8703-31292be0a414', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL generated to create new entity MJ: Company Integration Field Maps */

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
         "AllowUserSearchAPI"
         , "TrackRecordChanges"
         , "AuditRecordAccess"
         , "AuditViewRuns"
         , "AllowAllRowsAPI"
         , "AllowCreateAPI"
         , "AllowUpdateAPI"
         , "AllowDeleteAPI"
         , "UserViewMaxRows"
         , "__mj_CreatedAt"
         , "__mj_UpdatedAt"
      )
      VALUES (
         'feca4edd-74f9-4a1c-a284-e586e76b23fe',
         'MJ: Company Integration Field Maps',
         'Company Integration Field Maps',
         'Maps individual fields between an external source object and a MemberJunction entity, with optional transform pipeline.',
         NULL,
         'CompanyIntegrationFieldMap',
         'vwCompanyIntegrationFieldMaps',
         '__mj',
         TRUE,
         FALSE
         , TRUE
         , FALSE
         , FALSE
         , FALSE
         , TRUE
         , TRUE
         , TRUE
         , 1000
         , NOW()
         , NOW()
      );
/* SQL generated to add new entity MJ: Company Integration Field Maps to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'feca4edd-74f9-4a1c-a284-e586e76b23fe', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Company Integration Field Maps for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('feca4edd-74f9-4a1c-a284-e586e76b23fe', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Company Integration Field Maps for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('feca4edd-74f9-4a1c-a284-e586e76b23fe', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Company Integration Field Maps for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('feca4edd-74f9-4a1c-a284-e586e76b23fe', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL generated to create new entity MJ: Company Integration Sync Watermarks */

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
         "AllowUserSearchAPI"
         , "TrackRecordChanges"
         , "AuditRecordAccess"
         , "AuditViewRuns"
         , "AllowAllRowsAPI"
         , "AllowCreateAPI"
         , "AllowUpdateAPI"
         , "AllowDeleteAPI"
         , "UserViewMaxRows"
         , "__mj_CreatedAt"
         , "__mj_UpdatedAt"
      )
      VALUES (
         'd5c4fef3-21d0-4a41-893b-34f9527195f0',
         'MJ: Company Integration Sync Watermarks',
         'Company Integration Sync Watermarks',
         'Tracks incremental sync progress per entity map and direction using watermarks (timestamp, cursor, change token, or version).',
         NULL,
         'CompanyIntegrationSyncWatermark',
         'vwCompanyIntegrationSyncWatermarks',
         '__mj',
         TRUE,
         FALSE
         , TRUE
         , FALSE
         , FALSE
         , FALSE
         , TRUE
         , TRUE
         , TRUE
         , 1000
         , NOW()
         , NOW()
      );
/* SQL generated to add new entity MJ: Company Integration Sync Watermarks to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'd5c4fef3-21d0-4a41-893b-34f9527195f0', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Company Integration Sync Watermarks for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('d5c4fef3-21d0-4a41-893b-34f9527195f0', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Company Integration Sync Watermarks for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('d5c4fef3-21d0-4a41-893b-34f9527195f0', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Company Integration Sync Watermarks for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('d5c4fef3-21d0-4a41-893b-34f9527195f0', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL text to add special date field __mj_CreatedAt to entity __mj."CompanyIntegrationEntityMap" */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c91ef1ae-5036-440d-8492-121518a3d36e' OR ("EntityID" = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND "Name" = 'ID')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'c91ef1ae-5036-440d-8492-121518a3d36e',
        '41579CAC-5DDC-48B4-8703-31292BE0A414', -- "Entity": "MJ": "Company" "Integration" "Entity" "Maps"
        100001,
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        'gen_random_uuid()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ca111fe4-61fe-49d0-9106-a75de3035fb1' OR ("EntityID" = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND "Name" = 'CompanyIntegrationID')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'ca111fe4-61fe-49d0-9106-a75de3035fb1',
        '41579CAC-5DDC-48B4-8703-31292BE0A414', -- "Entity": "MJ": "Company" "Integration" "Entity" "Maps"
        100002,
        'CompanyIntegrationID',
        'Company Integration ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        'DE238F34-2837-EF11-86D4-6045BDEE16E6',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '41d1dc11-6093-4473-abf6-1b578b9a26bd' OR ("EntityID" = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND "Name" = 'ExternalObjectName')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '41d1dc11-6093-4473-abf6-1b578b9a26bd',
        '41579CAC-5DDC-48B4-8703-31292BE0A414', -- "Entity": "MJ": "Company" "Integration" "Entity" "Maps"
        100003,
        'ExternalObjectName',
        'External Object Name',
        'The name of the object in the external system (e.g. table name, API resource name).',
        'TEXT',
        1000,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '77802508-d414-4972-932d-c84439de5db4' OR ("EntityID" = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND "Name" = 'ExternalObjectLabel')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '77802508-d414-4972-932d-c84439de5db4',
        '41579CAC-5DDC-48B4-8703-31292BE0A414', -- "Entity": "MJ": "Company" "Integration" "Entity" "Maps"
        100004,
        'ExternalObjectLabel',
        'External Object Label',
        'Optional human-friendly label for the external object.',
        'TEXT',
        1000,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '749758c4-a7b3-413a-a434-4844771c7f84' OR ("EntityID" = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND "Name" = 'EntityID')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '749758c4-a7b3-413a-a434-4844771c7f84',
        '41579CAC-5DDC-48B4-8703-31292BE0A414', -- "Entity": "MJ": "Company" "Integration" "Entity" "Maps"
        100005,
        'EntityID',
        'Entity ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        'E0238F34-2837-EF11-86D4-6045BDEE16E6',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cd5a1d3c-f54b-41ff-9879-b3bcd73a231f' OR ("EntityID" = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND "Name" = 'SyncDirection')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'cd5a1d3c-f54b-41ff-9879-b3bcd73a231f',
        '41579CAC-5DDC-48B4-8703-31292BE0A414', -- "Entity": "MJ": "Company" "Integration" "Entity" "Maps"
        100006,
        'SyncDirection',
        'Sync Direction',
        'Whether data flows from external to MJ (Pull), MJ to external (Push), or both.',
        'TEXT',
        100,
        0,
        0,
        FALSE,
        'Pull',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e29e9aba-528d-4a3d-aeb7-b9625ab4362d' OR ("EntityID" = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND "Name" = 'SyncEnabled')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'e29e9aba-528d-4a3d-aeb7-b9625ab4362d',
        '41579CAC-5DDC-48B4-8703-31292BE0A414', -- "Entity": "MJ": "Company" "Integration" "Entity" "Maps"
        100007,
        'SyncEnabled',
        'Sync Enabled',
        'When true, this entity map is included in sync runs.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(1)',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1ef5faaf-4128-459f-978f-bc14223fd131' OR ("EntityID" = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND "Name" = 'MatchStrategy')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '1ef5faaf-4128-459f-978f-bc14223fd131',
        '41579CAC-5DDC-48B4-8703-31292BE0A414', -- "Entity": "MJ": "Company" "Integration" "Entity" "Maps"
        100008,
        'MatchStrategy',
        'Match Strategy',
        'JSON configuration for the match engine describing how to identify existing records (key fields, fuzzy thresholds, etc.).',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '350740c9-5552-45b2-a222-889bb91f6e3b' OR ("EntityID" = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND "Name" = 'ConflictResolution')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '350740c9-5552-45b2-a222-889bb91f6e3b',
        '41579CAC-5DDC-48B4-8703-31292BE0A414', -- "Entity": "MJ": "Company" "Integration" "Entity" "Maps"
        100009,
        'ConflictResolution',
        'Conflict Resolution',
        'How to handle conflicts when both source and destination have been modified. SourceWins, DestWins, MostRecent, or Manual.',
        'TEXT',
        100,
        0,
        0,
        FALSE,
        'SourceWins',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f1eb6c90-5caf-4a45-88b8-2ca52a3d7d83' OR ("EntityID" = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND "Name" = 'Priority')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'f1eb6c90-5caf-4a45-88b8-2ca52a3d7d83',
        '41579CAC-5DDC-48B4-8703-31292BE0A414', -- "Entity": "MJ": "Company" "Integration" "Entity" "Maps"
        100010,
        'Priority',
        'Priority',
        'Processing order when multiple entity maps exist. Lower numbers are processed first.',
        'INTEGER',
        4,
        10,
        0,
        FALSE,
        '(0)',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '81628273-7743-4dca-a036-82b8595bb2aa' OR ("EntityID" = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND "Name" = 'DeleteBehavior')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '81628273-7743-4dca-a036-82b8595bb2aa',
        '41579CAC-5DDC-48B4-8703-31292BE0A414', -- "Entity": "MJ": "Company" "Integration" "Entity" "Maps"
        100011,
        'DeleteBehavior',
        'Delete Behavior',
        'How to handle records that no longer exist in the source. SoftDelete, DoNothing, or HardDelete.',
        'TEXT',
        100,
        0,
        0,
        FALSE,
        'SoftDelete',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e6e720dd-fefd-4c82-b694-dea4fc4d308a' OR ("EntityID" = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND "Name" = 'Status')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'e6e720dd-fefd-4c82-b694-dea4fc4d308a',
        '41579CAC-5DDC-48B4-8703-31292BE0A414', -- "Entity": "MJ": "Company" "Integration" "Entity" "Maps"
        100012,
        'Status',
        'Status',
        'Whether this entity map is Active or Inactive.',
        'TEXT',
        100,
        0,
        0,
        FALSE,
        'Active',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3428aa14-3fcd-463a-8b90-29e08070c300' OR ("EntityID" = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND "Name" = 'Configuration')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '3428aa14-3fcd-463a-8b90-29e08070c300',
        '41579CAC-5DDC-48B4-8703-31292BE0A414', -- "Entity": "MJ": "Company" "Integration" "Entity" "Maps"
        100013,
        'Configuration',
        'Configuration',
        'Optional JSON configuration specific to this entity mapping.',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8a83f1a0-06f9-43d2-9151-53a5178eece2' OR ("EntityID" = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND "Name" = '__mj_CreatedAt')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '8a83f1a0-06f9-43d2-9151-53a5178eece2',
        '41579CAC-5DDC-48B4-8703-31292BE0A414', -- "Entity": "MJ": "Company" "Integration" "Entity" "Maps"
        100014,
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '88ca33db-38d1-406a-bb78-5809ac6f86eb' OR ("EntityID" = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND "Name" = '__mj_UpdatedAt')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '88ca33db-38d1-406a-bb78-5809ac6f86eb',
        '41579CAC-5DDC-48B4-8703-31292BE0A414', -- "Entity": "MJ": "Company" "Integration" "Entity" "Maps"
        100015,
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '95eb5e41-3d51-4af7-93b5-fd0466702686' OR ("EntityID" = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0' AND "Name" = 'ID')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '95eb5e41-3d51-4af7-93b5-fd0466702686',
        'D5C4FEF3-21D0-4A41-893B-34F9527195F0', -- "Entity": "MJ": "Company" "Integration" "Sync" "Watermarks"
        100001,
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        'gen_random_uuid()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '846d8888-af62-4d4b-ae06-a52c284377a7' OR ("EntityID" = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0' AND "Name" = 'EntityMapID')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '846d8888-af62-4d4b-ae06-a52c284377a7',
        'D5C4FEF3-21D0-4A41-893B-34F9527195F0', -- "Entity": "MJ": "Company" "Integration" "Sync" "Watermarks"
        100002,
        'EntityMapID',
        'Entity Map ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '41579CAC-5DDC-48B4-8703-31292BE0A414',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b060fd28-be54-42cf-bef5-fe27359e5a72' OR ("EntityID" = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0' AND "Name" = 'Direction')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'b060fd28-be54-42cf-bef5-fe27359e5a72',
        'D5C4FEF3-21D0-4A41-893B-34F9527195F0', -- "Entity": "MJ": "Company" "Integration" "Sync" "Watermarks"
        100003,
        'Direction',
        'Direction',
        'Sync direction this watermark tracks: Pull or Push.',
        'TEXT',
        100,
        0,
        0,
        FALSE,
        'Pull',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1647d6d5-b2b7-4702-acf4-faefff2d091a' OR ("EntityID" = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0' AND "Name" = 'WatermarkType')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '1647d6d5-b2b7-4702-acf4-faefff2d091a',
        'D5C4FEF3-21D0-4A41-893B-34F9527195F0', -- "Entity": "MJ": "Company" "Integration" "Sync" "Watermarks"
        100004,
        'WatermarkType',
        'Watermark Type',
        'The type of watermark: Timestamp, Cursor, ChangeToken, or Version.',
        'TEXT',
        100,
        0,
        0,
        FALSE,
        'Timestamp',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a104bf94-1f56-4b4a-a243-bd8a2a3f3ef7' OR ("EntityID" = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0' AND "Name" = 'WatermarkValue')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'a104bf94-1f56-4b4a-a243-bd8a2a3f3ef7',
        'D5C4FEF3-21D0-4A41-893B-34F9527195F0', -- "Entity": "MJ": "Company" "Integration" "Sync" "Watermarks"
        100005,
        'WatermarkValue',
        'Watermark Value',
        'The serialized watermark value used to resume incremental sync.',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '028d4ee7-1a23-4c6a-9e42-1527ba110c70' OR ("EntityID" = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0' AND "Name" = 'LastSyncAt')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '028d4ee7-1a23-4c6a-9e42-1527ba110c70',
        'D5C4FEF3-21D0-4A41-893B-34F9527195F0', -- "Entity": "MJ": "Company" "Integration" "Sync" "Watermarks"
        100006,
        'LastSyncAt',
        'Last Sync At',
        'Timestamp of the last successful sync for this watermark.',
        'TIMESTAMPTZ',
        10,
        34,
        7,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e4b0f49e-b21c-4358-8e46-ec4ba66a3a22' OR ("EntityID" = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0' AND "Name" = 'RecordsSynced')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'e4b0f49e-b21c-4358-8e46-ec4ba66a3a22',
        'D5C4FEF3-21D0-4A41-893B-34F9527195F0', -- "Entity": "MJ": "Company" "Integration" "Sync" "Watermarks"
        100007,
        'RecordsSynced',
        'Records Synced',
        'Cumulative count of records synced through this watermark.',
        'INTEGER',
        4,
        10,
        0,
        FALSE,
        '(0)',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2d349d6a-e5e1-4037-b1be-104e1bd8009e' OR ("EntityID" = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0' AND "Name" = '__mj_CreatedAt')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '2d349d6a-e5e1-4037-b1be-104e1bd8009e',
        'D5C4FEF3-21D0-4A41-893B-34F9527195F0', -- "Entity": "MJ": "Company" "Integration" "Sync" "Watermarks"
        100008,
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e87f3f8f-fb10-46c6-b42a-d41c0af3aae3' OR ("EntityID" = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0' AND "Name" = '__mj_UpdatedAt')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'e87f3f8f-fb10-46c6-b42a-d41c0af3aae3',
        'D5C4FEF3-21D0-4A41-893B-34F9527195F0', -- "Entity": "MJ": "Company" "Integration" "Sync" "Watermarks"
        100009,
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f647023e-d909-4ecb-b59d-ee477c274827' OR ("EntityID" = 'DE238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'SourceTypeID')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'f647023e-d909-4ecb-b59d-ee477c274827',
        'DE238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Company" "Integrations"
        100042,
        'SourceTypeID',
        'Source Type ID',
        'Links this integration to its source type (SaaS API, Database, File Feed, etc.).',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '57801845-6620-4CBD-993F-E4AA2D464A04',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '987eaf20-227f-4043-bd87-06c9e01598f4' OR ("EntityID" = 'DE238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'Configuration')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '987eaf20-227f-4043-bd87-06c9e01598f4',
        'DE238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Company" "Integrations"
        100043,
        'Configuration',
        'Configuration',
        'JSON configuration for the integration connection (server, database, credentials reference, etc.).',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f2882887-8d20-41cb-a1be-91e3e270d3e6' OR ("EntityID" = '57801845-6620-4CBD-993F-E4AA2D464A04' AND "Name" = 'ID')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'f2882887-8d20-41cb-a1be-91e3e270d3e6',
        '57801845-6620-4CBD-993F-E4AA2D464A04', -- "Entity": "MJ": "Integration" "Source" "Types"
        100001,
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        'gen_random_uuid()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '76cf6a33-6556-46ca-aa57-4050aa9ad647' OR ("EntityID" = '57801845-6620-4CBD-993F-E4AA2D464A04' AND "Name" = 'Name')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '76cf6a33-6556-46ca-aa57-4050aa9ad647',
        '57801845-6620-4CBD-993F-E4AA2D464A04', -- "Entity": "MJ": "Integration" "Source" "Types"
        100002,
        'Name',
        'Name',
        'Display name for this source type (e.g. SaaS API, Relational Database, File Feed).',
        'TEXT',
        400,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        TRUE,
        TRUE,
        FALSE,
        TRUE,
        FALSE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e7691951-eef3-47ee-b375-0421de28ae7a' OR ("EntityID" = '57801845-6620-4CBD-993F-E4AA2D464A04' AND "Name" = 'Description')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'e7691951-eef3-47ee-b375-0421de28ae7a',
        '57801845-6620-4CBD-993F-E4AA2D464A04', -- "Entity": "MJ": "Integration" "Source" "Types"
        100003,
        'Description',
        'Description',
        'Optional longer description of this source type.',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '16a801a3-e1ef-4f41-adbd-9af7747ade78' OR ("EntityID" = '57801845-6620-4CBD-993F-E4AA2D464A04' AND "Name" = 'DriverClass')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '16a801a3-e1ef-4f41-adbd-9af7747ade78',
        '57801845-6620-4CBD-993F-E4AA2D464A04', -- "Entity": "MJ": "Integration" "Source" "Types"
        100004,
        'DriverClass',
        'Driver Class',
        'Fully-qualified class name registered via @RegisterClass that implements BaseIntegrationConnector for this source type.',
        'TEXT',
        1000,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '254c0b4e-cc02-46bc-92e3-8a46463198cb' OR ("EntityID" = '57801845-6620-4CBD-993F-E4AA2D464A04' AND "Name" = 'IconClass')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '254c0b4e-cc02-46bc-92e3-8a46463198cb',
        '57801845-6620-4CBD-993F-E4AA2D464A04', -- "Entity": "MJ": "Integration" "Source" "Types"
        100005,
        'IconClass',
        'Icon Class',
        'Font Awesome icon class for UI display.',
        'TEXT',
        400,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6b1ff62d-f04e-42b4-85f9-02ce12e23381' OR ("EntityID" = '57801845-6620-4CBD-993F-E4AA2D464A04' AND "Name" = 'Status')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '6b1ff62d-f04e-42b4-85f9-02ce12e23381',
        '57801845-6620-4CBD-993F-E4AA2D464A04', -- "Entity": "MJ": "Integration" "Source" "Types"
        100006,
        'Status',
        'Status',
        'Whether this source type is available for use. Active or Inactive.',
        'TEXT',
        100,
        0,
        0,
        FALSE,
        'Active',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8d083aa3-60cb-41dc-82d0-26dd3e9c5ade' OR ("EntityID" = '57801845-6620-4CBD-993F-E4AA2D464A04' AND "Name" = '__mj_CreatedAt')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '8d083aa3-60cb-41dc-82d0-26dd3e9c5ade',
        '57801845-6620-4CBD-993F-E4AA2D464A04', -- "Entity": "MJ": "Integration" "Source" "Types"
        100007,
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '10ddedfe-56d3-4938-bfe4-0fd79da1d6da' OR ("EntityID" = '57801845-6620-4CBD-993F-E4AA2D464A04' AND "Name" = '__mj_UpdatedAt')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '10ddedfe-56d3-4938-bfe4-0fd79da1d6da',
        '57801845-6620-4CBD-993F-E4AA2D464A04', -- "Entity": "MJ": "Integration" "Source" "Types"
        100008,
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3dfb579f-2f81-4b1f-a357-09c7ea664ad0' OR ("EntityID" = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND "Name" = 'ID')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '3dfb579f-2f81-4b1f-a357-09c7ea664ad0',
        'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- "Entity": "MJ": "Company" "Integration" "Field" "Maps"
        100001,
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        'gen_random_uuid()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6befb401-01dd-454a-bb34-d300e78ab97d' OR ("EntityID" = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND "Name" = 'EntityMapID')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '6befb401-01dd-454a-bb34-d300e78ab97d',
        'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- "Entity": "MJ": "Company" "Integration" "Field" "Maps"
        100002,
        'EntityMapID',
        'Entity Map ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '41579CAC-5DDC-48B4-8703-31292BE0A414',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd8a8d8a6-7f09-4a3f-ade8-24d5ad46c512' OR ("EntityID" = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND "Name" = 'SourceFieldName')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'd8a8d8a6-7f09-4a3f-ade8-24d5ad46c512',
        'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- "Entity": "MJ": "Company" "Integration" "Field" "Maps"
        100003,
        'SourceFieldName',
        'Source Field Name',
        'The field/column name in the external source system.',
        'TEXT',
        1000,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cd36a432-32e7-4b66-b59c-dfaec7001a76' OR ("EntityID" = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND "Name" = 'SourceFieldLabel')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'cd36a432-32e7-4b66-b59c-dfaec7001a76',
        'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- "Entity": "MJ": "Company" "Integration" "Field" "Maps"
        100004,
        'SourceFieldLabel',
        'Source Field Label',
        'Optional human-friendly label for the source field.',
        'TEXT',
        1000,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4886f7d9-06ef-4979-9346-b689afcf5cb9' OR ("EntityID" = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND "Name" = 'DestinationFieldName')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '4886f7d9-06ef-4979-9346-b689afcf5cb9',
        'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- "Entity": "MJ": "Company" "Integration" "Field" "Maps"
        100005,
        'DestinationFieldName',
        'Destination Field Name',
        'The MJ entity field name this source field maps to.',
        'TEXT',
        1000,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4d8315d9-aed2-4e67-8743-6233f9f1c312' OR ("EntityID" = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND "Name" = 'DestinationFieldLabel')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '4d8315d9-aed2-4e67-8743-6233f9f1c312',
        'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- "Entity": "MJ": "Company" "Integration" "Field" "Maps"
        100006,
        'DestinationFieldLabel',
        'Destination Field Label',
        'Optional human-friendly label for the destination field.',
        'TEXT',
        1000,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e6d1f636-074a-44c4-9908-2f05ac0d8cea' OR ("EntityID" = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND "Name" = 'Direction')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'e6d1f636-074a-44c4-9908-2f05ac0d8cea',
        'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- "Entity": "MJ": "Company" "Integration" "Field" "Maps"
        100007,
        'Direction',
        'Direction',
        'Direction of field mapping: SourceToDest, DestToSource, or Both.',
        'TEXT',
        100,
        0,
        0,
        FALSE,
        'SourceToDest',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9be66dc5-e20a-4fee-acad-68bd018f0b86' OR ("EntityID" = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND "Name" = 'TransformPipeline')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '9be66dc5-e20a-4fee-acad-68bd018f0b86',
        'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- "Entity": "MJ": "Company" "Integration" "Field" "Maps"
        100008,
        'TransformPipeline',
        'Transform Pipeline',
        'JSON array of transform names to apply in order (e.g. ["trim", "uppercase"]). See FieldMappingEngine for available transforms.',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bb6b2fc1-8530-4229-a524-85437510b1b0' OR ("EntityID" = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND "Name" = 'IsKeyField')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'bb6b2fc1-8530-4229-a524-85437510b1b0',
        'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- "Entity": "MJ": "Company" "Integration" "Field" "Maps"
        100009,
        'IsKeyField',
        'Is Key Field',
        'When true, this field is used by the MatchEngine to find existing records during sync.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(0)',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '923b68d4-6b26-4b39-8324-f115221e6733' OR ("EntityID" = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND "Name" = 'IsRequired')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '923b68d4-6b26-4b39-8324-f115221e6733',
        'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- "Entity": "MJ": "Company" "Integration" "Field" "Maps"
        100010,
        'IsRequired',
        'Is Required',
        'When true, a sync record is rejected if this field has no value.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(0)',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5f47d2da-b34d-436f-8177-5e1ba9435288' OR ("EntityID" = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND "Name" = 'DefaultValue')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '5f47d2da-b34d-436f-8177-5e1ba9435288',
        'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- "Entity": "MJ": "Company" "Integration" "Field" "Maps"
        100011,
        'DefaultValue',
        'Default Value',
        'Default value to use when the source field is null or missing.',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '93e74709-a312-49e1-8c80-ea2909a6b5bf' OR ("EntityID" = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND "Name" = 'Priority')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '93e74709-a312-49e1-8c80-ea2909a6b5bf',
        'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- "Entity": "MJ": "Company" "Integration" "Field" "Maps"
        100012,
        'Priority',
        'Priority',
        'Processing order for this field mapping within the entity map.',
        'INTEGER',
        4,
        10,
        0,
        FALSE,
        '(0)',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2f978bf2-eea0-46e7-86c7-62d09da17b96' OR ("EntityID" = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND "Name" = 'Status')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '2f978bf2-eea0-46e7-86c7-62d09da17b96',
        'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- "Entity": "MJ": "Company" "Integration" "Field" "Maps"
        100013,
        'Status',
        'Status',
        'Whether this field mapping is Active or Inactive.',
        'TEXT',
        100,
        0,
        0,
        FALSE,
        'Active',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '93f28803-d909-4bcb-9742-08455f48ab78' OR ("EntityID" = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND "Name" = '__mj_CreatedAt')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '93f28803-d909-4bcb-9742-08455f48ab78',
        'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- "Entity": "MJ": "Company" "Integration" "Field" "Maps"
        100014,
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b4ad87ba-fb93-4118-b671-a023bd200fe3' OR ("EntityID" = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND "Name" = '__mj_UpdatedAt')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'b4ad87ba-fb93-4118-b671-a023bd200fe3',
        'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- "Entity": "MJ": "Company" "Integration" "Field" "Maps"
        100015,
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('320c7162-90a4-4db7-a5c4-e94f76fd0928', '6B1FF62D-F04E-42B4-85F9-02CE12E23381', 1, 'Active', 'Active', NOW(), NOW());
/* SQL text to insert entity field value with ID abe25d79-8370-4f9d-ab62-be616d5605bd */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('abe25d79-8370-4f9d-ab62-be616d5605bd', '6B1FF62D-F04E-42B4-85F9-02CE12E23381', 2, 'Inactive', 'Inactive', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID 6B1FF62D-F04E-42B4-85F9-02CE12E23381 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='6B1FF62D-F04E-42B4-85F9-02CE12E23381';
/* SQL text to insert entity field value with ID b4c0bb3e-3eee-40ec-b9ff-8214bd1517d8 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('b4c0bb3e-3eee-40ec-b9ff-8214bd1517d8', 'CD5A1D3C-F54B-41FF-9879-B3BCD73A231F', 1, 'Bidirectional', 'Bidirectional', NOW(), NOW());
/* SQL text to insert entity field value with ID 5f890b85-1e27-447f-8330-3e0224cb848e */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('5f890b85-1e27-447f-8330-3e0224cb848e', 'CD5A1D3C-F54B-41FF-9879-B3BCD73A231F', 2, 'Pull', 'Pull', NOW(), NOW());
/* SQL text to insert entity field value with ID 937dcb43-8274-401e-bfb5-1dec6e5c9384 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('937dcb43-8274-401e-bfb5-1dec6e5c9384', 'CD5A1D3C-F54B-41FF-9879-B3BCD73A231F', 3, 'Push', 'Push', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID CD5A1D3C-F54B-41FF-9879-B3BCD73A231F */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='CD5A1D3C-F54B-41FF-9879-B3BCD73A231F';
/* SQL text to insert entity field value with ID 9e464d63-8bd0-4804-a8c2-deb86df1298e */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('9e464d63-8bd0-4804-a8c2-deb86df1298e', '350740C9-5552-45B2-A222-889BB91F6E3B', 1, 'DestWins', 'DestWins', NOW(), NOW());
/* SQL text to insert entity field value with ID a3d7f98a-4a06-4570-9ef3-693fc15c3758 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('a3d7f98a-4a06-4570-9ef3-693fc15c3758', '350740C9-5552-45B2-A222-889BB91F6E3B', 2, 'Manual', 'Manual', NOW(), NOW());
/* SQL text to insert entity field value with ID 5afef4fe-5d6e-4cfb-888d-3e7916644cc7 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('5afef4fe-5d6e-4cfb-888d-3e7916644cc7', '350740C9-5552-45B2-A222-889BB91F6E3B', 3, 'MostRecent', 'MostRecent', NOW(), NOW());
/* SQL text to insert entity field value with ID c28e4432-57c1-4313-abad-0af695020e66 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('c28e4432-57c1-4313-abad-0af695020e66', '350740C9-5552-45B2-A222-889BB91F6E3B', 4, 'SourceWins', 'SourceWins', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID 350740C9-5552-45B2-A222-889BB91F6E3B */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='350740C9-5552-45B2-A222-889BB91F6E3B';
/* SQL text to insert entity field value with ID eba565ff-3c0a-4ed1-be06-06e078b6d3a8 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('eba565ff-3c0a-4ed1-be06-06e078b6d3a8', '81628273-7743-4DCA-A036-82B8595BB2AA', 1, 'DoNothing', 'DoNothing', NOW(), NOW());
/* SQL text to insert entity field value with ID f6f283f4-c163-40fc-aad4-af89d6a1fd14 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('f6f283f4-c163-40fc-aad4-af89d6a1fd14', '81628273-7743-4DCA-A036-82B8595BB2AA', 2, 'HardDelete', 'HardDelete', NOW(), NOW());
/* SQL text to insert entity field value with ID 5b5f2304-020c-4c1f-9a33-27ae0c8002c5 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('5b5f2304-020c-4c1f-9a33-27ae0c8002c5', '81628273-7743-4DCA-A036-82B8595BB2AA', 3, 'SoftDelete', 'SoftDelete', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID 81628273-7743-4DCA-A036-82B8595BB2AA */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='81628273-7743-4DCA-A036-82B8595BB2AA';
/* SQL text to insert entity field value with ID ce5d4081-e3a9-4089-a04d-85f56b7868ae */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('ce5d4081-e3a9-4089-a04d-85f56b7868ae', 'E6E720DD-FEFD-4C82-B694-DEA4FC4D308A', 1, 'Active', 'Active', NOW(), NOW());
/* SQL text to insert entity field value with ID c9464edc-e223-4d85-8abf-0961eee51f2f */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('c9464edc-e223-4d85-8abf-0961eee51f2f', 'E6E720DD-FEFD-4C82-B694-DEA4FC4D308A', 2, 'Inactive', 'Inactive', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID E6E720DD-FEFD-4C82-B694-DEA4FC4D308A */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='E6E720DD-FEFD-4C82-B694-DEA4FC4D308A';
/* SQL text to insert entity field value with ID 8556f387-55b5-4ebb-8eca-ab1a1bf3dc3c */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('8556f387-55b5-4ebb-8eca-ab1a1bf3dc3c', 'E6D1F636-074A-44C4-9908-2F05AC0D8CEA', 1, 'Both', 'Both', NOW(), NOW());
/* SQL text to insert entity field value with ID 57753405-bca2-4f95-a60b-0a0d3e07f1e2 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('57753405-bca2-4f95-a60b-0a0d3e07f1e2', 'E6D1F636-074A-44C4-9908-2F05AC0D8CEA', 2, 'DestToSource', 'DestToSource', NOW(), NOW());
/* SQL text to insert entity field value with ID 6db2ced8-e10e-4784-ba7a-a41f158d2603 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('6db2ced8-e10e-4784-ba7a-a41f158d2603', 'E6D1F636-074A-44C4-9908-2F05AC0D8CEA', 3, 'SourceToDest', 'SourceToDest', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID E6D1F636-074A-44C4-9908-2F05AC0D8CEA */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='E6D1F636-074A-44C4-9908-2F05AC0D8CEA';
/* SQL text to insert entity field value with ID 487705c4-5661-4688-90bb-a03ee062a41d */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('487705c4-5661-4688-90bb-a03ee062a41d', '2F978BF2-EEA0-46E7-86C7-62D09DA17B96', 1, 'Active', 'Active', NOW(), NOW());
/* SQL text to insert entity field value with ID 76558316-d6b6-4b1f-81b5-ef394c7b2144 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('76558316-d6b6-4b1f-81b5-ef394c7b2144', '2F978BF2-EEA0-46E7-86C7-62D09DA17B96', 2, 'Inactive', 'Inactive', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID 2F978BF2-EEA0-46E7-86C7-62D09DA17B96 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='2F978BF2-EEA0-46E7-86C7-62D09DA17B96';
/* SQL text to insert entity field value with ID f59b99bc-2041-487d-8fe8-936966e12f23 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('f59b99bc-2041-487d-8fe8-936966e12f23', 'B060FD28-BE54-42CF-BEF5-FE27359E5A72', 1, 'Pull', 'Pull', NOW(), NOW());
/* SQL text to insert entity field value with ID 8ca4dcae-2311-4476-9e48-971e3a8984d9 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('8ca4dcae-2311-4476-9e48-971e3a8984d9', 'B060FD28-BE54-42CF-BEF5-FE27359E5A72', 2, 'Push', 'Push', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID B060FD28-BE54-42CF-BEF5-FE27359E5A72 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='B060FD28-BE54-42CF-BEF5-FE27359E5A72';
/* SQL text to insert entity field value with ID 8b340060-d9a1-4e47-811c-f5b16c34bcc0 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('8b340060-d9a1-4e47-811c-f5b16c34bcc0', '1647D6D5-B2B7-4702-ACF4-FAEFFF2D091A', 1, 'ChangeToken', 'ChangeToken', NOW(), NOW());
/* SQL text to insert entity field value with ID 4eeb592d-dce6-4451-9078-e2a25710fd97 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('4eeb592d-dce6-4451-9078-e2a25710fd97', '1647D6D5-B2B7-4702-ACF4-FAEFFF2D091A', 2, 'Cursor', 'Cursor', NOW(), NOW());
/* SQL text to insert entity field value with ID 5a8d78d2-0cc9-4baf-8532-5e819263647c */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('5a8d78d2-0cc9-4baf-8532-5e819263647c', '1647D6D5-B2B7-4702-ACF4-FAEFFF2D091A', 3, 'Timestamp', 'Timestamp', NOW(), NOW());
/* SQL text to insert entity field value with ID ab50f84b-a598-4642-967f-d0debf74a80e */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('ab50f84b-a598-4642-967f-d0debf74a80e', '1647D6D5-B2B7-4702-ACF4-FAEFFF2D091A', 4, 'Version', 'Version', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID 1647D6D5-B2B7-4702-ACF4-FAEFFF2D091A */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='1647D6D5-B2B7-4702-ACF4-FAEFFF2D091A';
/* Update EntityRelationship join field from 'ParentRunID' to 'LastRunID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'LastRunID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '5841FDE4-13D8-4C69-B8FF-A3D2539EB0DE';


/* Update EntityRelationship join field from 'AgentID' to 'SubAgentID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'SubAgentID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '2DC5B6C7-DD43-4AA6-B29A-2742BF1D9D53';

/* Update EntityRelationship join field from 'SubAgentID' to 'AgentID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'AgentID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '5B6A8AA1-533A-494B-8C5E-12885A76A482';


/* Update EntityRelationship join field from 'SubAgentID' to 'AgentID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'AgentID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '02CF7124-B3E1-4737-A16A-82A29F3D8E97';


/* Update EntityRelationship join field from 'AgentID' to 'SubAgentID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'SubAgentID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '49B7BC13-A831-4070-ABA0-B0FF5F2C1C7B';

/* Update EntityRelationship join field from 'DestinationStepID' to 'OriginStepID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'OriginStepID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '6DD99AFE-EF4D-44E4-A70E-6ACC547F0E8D';

/* Update EntityRelationship join field from 'OriginStepID' to 'DestinationStepID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'DestinationStepID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '8F64A0FD-9E48-4C86-9F34-3A2904D05F8F';


/* Create Entity Relationship: MJ: Company Integration Entity Maps -> MJ: Company Integration Sync Watermarks (One To Many via EntityMapID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '852d0c9b-96a5-4ed0-b065-54c0b941c146'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('852d0c9b-96a5-4ed0-b065-54c0b941c146', '41579CAC-5DDC-48B4-8703-31292BE0A414', 'D5C4FEF3-21D0-4A41-893B-34F9527195F0', 'EntityMapID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'a37bc78c-21ab-4906-85df-ad04dbfa8227'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('a37bc78c-21ab-4906-85df-ad04dbfa8227', '41579CAC-5DDC-48B4-8703-31292BE0A414', 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', 'EntityMapID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'DefaultPromptForContextCompressionID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'E798F6CA-7EEE-4C3D-8A3B-7E9855EBE05A';

/* Update EntityRelationship join field from 'DefaultPromptForContextCompressionID' to 'DefaultPromptForContextSummarizationID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'DefaultPromptForContextSummarizationID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '4BC01135-879A-4E45-A8C9-77895B135F68';


/* Update EntityRelationship join field from 'PromptID' to 'ChildPromptID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'ChildPromptID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'B83EC5E5-FA9A-4F1F-8EB2-98B0550805BB';

/* Update EntityRelationship join field from 'PromptID' to 'JudgeID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'JudgeID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'B83EC5E5-FA9A-4F1F-8EB2-98B0550805BB';


/* Update EntityRelationship join field from 'CompanyName' to 'CompanyID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'CompanyID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '0780F0B9-38A7-4A74-919E-5E707DC96687';


/* Update EntityRelationship join field from 'IntegrationName' to 'IntegrationID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'IntegrationID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '99448653-DBD1-4722-AE01-79A97A3AE574';


/* Create Entity Relationship: MJ: Company Integrations -> MJ: Company Integration Entity Maps (One To Many via CompanyIntegrationID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '73e11f7d-28d5-4d9a-8e28-9b73f974b47c'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('73e11f7d-28d5-4d9a-8e28-9b73f974b47c', 'DE238F34-2837-EF11-86D4-6045BDEE16E6', '41579CAC-5DDC-48B4-8703-31292BE0A414', 'CompanyIntegrationID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'OutputEntityID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '522E7A02-9B04-44EB-9A20-5334BF8B795F';


/* Update EntityRelationship join field from 'EntityID' to 'RelatedEntityID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'RelatedEntityID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '86ED5122-2FEA-48A1-8B75-B58519890413';


/* Update EntityRelationship join field from 'EntityID' to 'CategoryEntityID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'CategoryEntityID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '53806B32-1416-44E4-BD9E-FBABD9F24806';


/* Create Entity Relationship: MJ: Entities -> MJ: Company Integration Entity Maps (One To Many via EntityID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'f4c0b17e-ca91-429e-8df1-7ee08e893fa8'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('f4c0b17e-ca91-429e-8df1-7ee08e893fa8', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '41579CAC-5DDC-48B4-8703-31292BE0A414', 'EntityID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'RelatedEntityID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '0A19F94D-6030-42B2-8E65-DDFBC95248FA';


/* Update EntityRelationship join field from 'SourceEntityID' to 'TargetEntityID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'TargetEntityID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '508F99BA-9B64-42C4-81D6-E91FF88E9767';

/* Update EntityRelationship join field from 'TargetEntityID' to 'SourceEntityID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'SourceEntityID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '48C5803E-B13B-4D36-A64C-C76A8FC4DBA2';


/* Update EntityRelationship join field from 'ResponseByUserID' to 'RequestForUserID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'RequestForUserID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'CAE3B137-2933-482D-8E76-2B2AE64AE67E';


/* Update EntityRelationship join field from 'RequestForUserID' to 'ResponseByUserID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'ResponseByUserID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '0910E31D-CEE4-4D08-80B0-51F13B0DCE85';

/* Update EntityRelationship join field from 'SharedByUserID' to 'UserID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'UserID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '4DF971E6-FBF5-4664-9809-F2CD913E11AF';

/* Update EntityRelationship join field from 'UserID' to 'SharedByUserID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'SharedByUserID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '274EC64B-6605-412C-97E2-24D54B1F7A60';

/* Update EntityRelationship join field from 'SharedByUserID' to 'UserID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'UserID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'A6996B42-5F84-4726-A513-F6E757223F6C';


/* Update EntityRelationship join field from 'UserID' to 'SharedByUserID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'SharedByUserID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '09E7FB7E-EFFF-4EFD-9DCC-E332F57B1AA5';


/* Update EntityRelationship join field from 'StartedByUserID' to 'ApprovedByUserID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'ApprovedByUserID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'C2E9FE80-1C30-4D71-8755-D705D22A214E';


/* Update EntityRelationship join field from 'OwnerUserID' to 'NotifyUserID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'NotifyUserID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'FEA0A41E-14A4-4C1D-929B-BADE744A889C';

/* Update EntityRelationship join field from 'NotifyUserID' to 'OwnerUserID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'OwnerUserID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '29B73CCF-1517-4BDA-9BB5-EE6D48E1609A';


/* Update EntityRelationship join field from 'SharedByUserID' to 'UserID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'UserID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'C5E028C8-5366-45D5-AA41-A8FBD4141B98';

/* Update EntityRelationship join field from 'UserID' to 'SharedByUserID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'SharedByUserID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'DEE326A5-8469-42FC-ACF5-3E8B95154452';


/* Update EntityRelationship join field from 'SharedByUserID' to 'UserID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'UserID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'D44E5696-7C12-4782-A719-FF3BCD827F3D';

/* Update EntityRelationship join field from 'UserID' to 'SharedByUserID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'SharedByUserID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '6C80EC70-CE3D-4A90-9838-8BAC5DBED65C';


/* Update EntityRelationship join field from 'UserID' to 'CreatedByUserID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'CreatedByUserID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '7ACCC9C0-B542-4647-8CFA-606EE9815D59';

/* Update EntityRelationship join field from 'CreatedByUserID' to 'UserID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'UserID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'ED3B0A4C-5EEA-4A6E-9933-0A2701D7241D';


/* Update EntityRelationship join field from 'InitiatedByUserID' to 'ApprovedByUserID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'ApprovedByUserID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'DB049342-E5BB-4BD9-8113-67C0A1FF2530';


/* Update EntityRelationship join field from 'DisplayUserViewGUID' to 'DisplayUserViewID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'DisplayUserViewID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'F55F183D-0522-40C8-8D45-C6F3943B24C7';


/* Update EntityRelationship join field from 'WorkflowName' to 'WorkflowID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'WorkflowID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '65EB838F-F461-4196-AD9E-BDFAA777B0C3';


/* Update EntityRelationship join field from 'WorkflowEngineName' to 'WorkflowEngineID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'WorkflowEngineID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '668382FA-E2C1-4D2C-93D3-9806E35AC02A';

/* Update EntityRelationship join field from 'ReadRLSFilterID' to 'CreateRLSFilterID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'CreateRLSFilterID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '1FA13340-C7BB-4F59-A2EF-552D6B05B344';


/* Update EntityRelationship join field from 'ReadRLSFilterID' to 'UpdateRLSFilterID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'UpdateRLSFilterID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '1FA13340-C7BB-4F59-A2EF-552D6B05B344';

/* Update EntityRelationship join field from 'ReadRLSFilterID' to 'DeleteRLSFilterID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'DeleteRLSFilterID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '1FA13340-C7BB-4F59-A2EF-552D6B05B344';

/* Update EntityRelationship join field from 'AuthorizationName' to 'AuthorizationID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'AuthorizationID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '55E0E8BE-F9BA-4E7B-A7DD-DB84F4EA1250';


/* Update EntityRelationship join field from 'AuthorizationName' to 'AuthorizationID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'AuthorizationID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'AD19291C-4C43-488D-B19B-E07B6F76C94D';

/* Update EntityRelationship join field from 'AuditLogTypeName' to 'AuditLogTypeID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'AuditLogTypeID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '12BCF651-04DF-49C7-917D-BF978E0BF8E1';


/* Update EntityRelationship join field from 'ModelID' to 'OriginalModelID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'OriginalModelID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '65F2C6F7-CAEE-4F10-A6A1-353899FECB9F';


/* Update EntityRelationship join field from 'WorkSpaceID' to 'WorkspaceID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'WorkspaceID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'BB812A13-5542-4890-B2C9-1D5D8C5AE012';

/* Update EntityRelationship join field from 'DatasetName' to 'DatasetID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'DatasetID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '50B47AB8-5508-47B2-A87C-EC2BE40A9F75';


/* Update EntityRelationship join field from 'ID' to 'VectorDatabaseID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'VectorDatabaseID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '40AC053A-48B1-466B-AB38-3854F4FF6A72';


/* Update EntityRelationship join field from 'EmailTemplateID' to 'SMSTemplateID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'SMSTemplateID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '2712A384-38A8-455F-B4BB-C6DC10274214';


/* Update EntityRelationship join field from 'SMSTemplateID' to 'EmailTemplateID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'EmailTemplateID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '1A061C05-49CD-4328-8375-6809189BC57B';


/* Update EntityRelationship join field from 'DependencyComponentID' to 'ComponentID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'ComponentID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '77CA2F71-8D7D-4048-83F1-5F704925B009';

/* Update EntityRelationship join field from 'ComponentID' to 'DependencyComponentID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'DependencyComponentID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '90CE0E3A-47C9-41B4-ABB0-B4CC24DB5A8A';


/* Update EntityRelationship join field from 'PreRestoreLabelID' to 'VersionLabelID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'VersionLabelID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'B1250534-179A-45F6-AF26-4C25E5F5AA05';

/* Update EntityRelationship join field from 'VersionLabelID' to 'PreRestoreLabelID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'PreRestoreLabelID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'CCD2C638-5D37-4A7E-9E3F-5D0690F022AF';


/* Update EntityRelationship join field from 'OpenAppID' to 'DependsOnAppID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'DependsOnAppID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '5AC78474-4F4D-479F-8DB0-46CB0CD78442';

/* Update EntityRelationship join field from 'DependsOnAppID' to 'OpenAppID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'OpenAppID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '6157799D-72AF-43C6-8512-3BC8C9663BA5';


/* Update EntityRelationship join field from 'ParentID' to 'RerunFromPromptRunID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'RerunFromPromptRunID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'D54F8E97-FD0A-47D0-A0C6-D65B281622C6';


/* Update EntityRelationship join field from 'DefaultInputModalityID' to 'DefaultOutputModalityID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'DefaultOutputModalityID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'C58517CB-380F-45BD-8DD5-58798FD2D49B';

/* Update EntityRelationship join field from 'DefaultOutputModalityID' to 'DefaultInputModalityID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'DefaultInputModalityID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'DD6D64BE-A698-4FE9-8A16-535076D45658';

/* Update EntityRelationship join field from 'DependsOnTaskID' to 'TaskID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'TaskID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'D356ECA0-D245-4088-8727-BFF97A3AB60F';

/* Update EntityRelationship join field from 'TaskID' to 'DependsOnTaskID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'DependsOnTaskID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '3B41F196-2565-4E06-8C4B-1595C33AF364';


/* Create Entity Relationship: MJ: Integration Source Types -> MJ: Company Integrations (One To Many via SourceTypeID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'b008fd00-904e-41ab-bd44-69465d99be79'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('b008fd00-904e-41ab-bd44-69465d99be79', '57801845-6620-4CBD-993F-E4AA2D464A04', 'DE238F34-2837-EF11-86D4-6045BDEE16E6', 'SourceTypeID', 'One To Many', TRUE, TRUE, 5, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8a0e85e8-8610-4949-981f-19b0c6df658f' OR ("EntityID" = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND "Name" = 'CompanyIntegration')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '8a0e85e8-8610-4949-981f-19b0c6df658f',
        '41579CAC-5DDC-48B4-8703-31292BE0A414', -- "Entity": "MJ": "Company" "Integration" "Entity" "Maps"
        100031,
        'CompanyIntegration',
        'Company Integration',
        NULL,
        'TEXT',
        510,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '63f97d2f-bd4d-4a08-b83f-cd6891788b76' OR ("EntityID" = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND "Name" = 'Entity')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '63f97d2f-bd4d-4a08-b83f-cd6891788b76',
        '41579CAC-5DDC-48B4-8703-31292BE0A414', -- "Entity": "MJ": "Company" "Integration" "Entity" "Maps"
        100032,
        'Entity',
        'Entity',
        NULL,
        'TEXT',
        510,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '3C5817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '185817F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'B34217F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
            SET "IsNameField" = TRUE
            WHERE "ID" = 'D8A8D8A6-7F09-4A3F-ADE8-24D5AD46C512'
            AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'D8A8D8A6-7F09-4A3F-ADE8-24D5AD46C512'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '4886F7D9-06EF-4979-9346-B689AFCF5CB9'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'E6D1F636-074A-44C4-9908-2F05AC0D8CEA'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'BB6B2FC1-8530-4229-A524-85437510B1B0'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '93E74709-A312-49E1-8C80-EA2909A6B5BF'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '2F978BF2-EEA0-46E7-86C7-62D09DA17B96'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'D8A8D8A6-7F09-4A3F-ADE8-24D5AD46C512'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'CD36A432-32E7-4B66-B59C-DFAEC7001A76'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '4886F7D9-06EF-4979-9346-B689AFCF5CB9'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '4D8315D9-AED2-4E67-8743-6233F9F1C312'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '16A801A3-E1EF-4F41-ADBD-9AF7747ADE78'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '6B1FF62D-F04E-42B4-85F9-02CE12E23381'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '16A801A3-E1EF-4F41-ADBD-9AF7747ADE78'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
            SET "IsNameField" = TRUE
            WHERE "ID" = '1647D6D5-B2B7-4702-ACF4-FAEFFF2D091A'
            AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'B060FD28-BE54-42CF-BEF5-FE27359E5A72'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '1647D6D5-B2B7-4702-ACF4-FAEFFF2D091A'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'A104BF94-1F56-4B4A-A243-BD8A2A3F3EF7'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '028D4EE7-1A23-4C6A-9E42-1527BA110C70'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'E4B0F49E-B21C-4358-8E46-EC4BA66A3A22'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'B060FD28-BE54-42CF-BEF5-FE27359E5A72'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '1647D6D5-B2B7-4702-ACF4-FAEFFF2D091A'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'A104BF94-1F56-4B4A-A243-BD8A2A3F3EF7'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
            SET "IsNameField" = TRUE
            WHERE "ID" = '41D1DC11-6093-4473-ABF6-1B578B9A26BD'
            AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '41D1DC11-6093-4473-ABF6-1B578B9A26BD'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'CD5A1D3C-F54B-41FF-9879-B3BCD73A231F'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'E29E9ABA-528D-4A3D-AEB7-B9625AB4362D'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'E6E720DD-FEFD-4C82-B694-DEA4FC4D308A'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '8A0E85E8-8610-4949-981F-19B0C6DF658F'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '63F97D2F-BD4D-4A08-B83F-CD6891788B76'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '41D1DC11-6093-4473-ABF6-1B578B9A26BD'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '77802508-D414-4972-932D-C84439DE5DB4'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '8A0E85E8-8610-4949-981F-19B0C6DF658F'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '63F97D2F-BD4D-4A08-B83F-CD6891788B76'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set categories for 9 fields */
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '95EB5E41-3D51-4AF7-93B5-FD0466702686' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."EntityMapID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity Map',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '846D8888-AF62-4D4B-AE06-A52C284377A7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."Direction"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B060FD28-BE54-42CF-BEF5-FE27359E5A72' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."WatermarkType"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1647D6D5-B2B7-4702-ACF4-FAEFFF2D091A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."WatermarkValue"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Progress',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A104BF94-1F56-4B4A-A243-BD8A2A3F3EF7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."LastSyncAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Progress',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '028D4EE7-1A23-4C6A-9E42-1527BA110C70' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."RecordsSynced"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Progress',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E4B0F49E-B21C-4358-8E46-EC4BA66A3A22' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2D349D6A-E5E1-4037-B1BE-104E1BD8009E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E87F3F8F-FB10-46C6-B42A-D41C0AF3AAE3' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-sync-alt */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-sync-alt', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('aef59a99-d889-4e3d-88e1-c0678b8646bd', 'D5C4FEF3-21D0-4A41-893B-34F9527195F0', 'FieldCategoryInfo', '{"Sync Configuration":{"icon":"fa fa-sliders-h","description":"Settings that define the scope, direction, and methodology of the synchronization"},"Sync Progress":{"icon":"fa fa-history","description":"Real-time tracking of sync values, timestamps, and record counts"},"System Metadata":{"icon":"fa fa-cog","description":"Internal system identifiers and audit timestamps"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('62d50040-224f-4252-96c7-3773483bb8c4', 'D5C4FEF3-21D0-4A41-893B-34F9527195F0', 'FieldCategoryIcons', '{"Sync Configuration":"fa fa-sliders-h","Sync Progress":"fa fa-history","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0';
/* Set categories for 15 fields */
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3DFB579F-2F81-4B1F-A357-09C7EA664AD0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."EntityMapID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity Map',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6BEFB401-01DD-454A-BB34-D300E78AB97D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."SourceFieldName"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Mapping Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D8A8D8A6-7F09-4A3F-ADE8-24D5AD46C512' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."SourceFieldLabel"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Mapping Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CD36A432-32E7-4B66-B59C-DFAEC7001A76' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."DestinationFieldName"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Mapping Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4886F7D9-06EF-4979-9346-B689AFCF5CB9' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."DestinationFieldLabel"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Mapping Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4D8315D9-AED2-4E67-8743-6233F9F1C312' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."Direction"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Mapping Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E6D1F636-074A-44C4-9908-2F05AC0D8CEA' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."TransformPipeline"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Logic and Validation',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '9BE66DC5-E20A-4FEE-ACAD-68BD018F0B86' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."IsKeyField"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Logic and Validation',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Key Field',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BB6B2FC1-8530-4229-A524-85437510B1B0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."IsRequired"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Logic and Validation',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Required',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '923B68D4-6B26-4B39-8324-F115221E6733' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."DefaultValue"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Logic and Validation',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5F47D2DA-B34D-436F-8177-5E1BA9435288' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."Priority"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Logic and Validation',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '93E74709-A312-49E1-8C80-EA2909A6B5BF' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."Status"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Logic and Validation',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2F978BF2-EEA0-46E7-86C7-62D09DA17B96' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '93F28803-D909-4BCB-9742-08455F48AB78' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B4AD87BA-FB93-4118-B671-A023BD200FE3' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-exchange-alt */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-exchange-alt', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('83429c79-083b-4902-9e13-bbf5ac0c2692', 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', 'FieldCategoryInfo', '{"Mapping Definition":{"icon":"fa fa-columns","description":"Fields and directions defining how data moves between the external source and destination"},"Sync Logic and Validation":{"icon":"fa fa-vial","description":"Rules for data transformation, matching, prioritization, and field-level validation"},"System Metadata":{"icon":"fa fa-cog","description":"Internal identifiers and system-managed audit timestamps"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('f3513d84-b5fe-4e79-90dc-1c6a84470d18', 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', 'FieldCategoryIcons', '{"Mapping Definition":"fa fa-columns","Sync Logic and Validation":"fa fa-vial","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: supporting, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE';
/* Set categories for 25 fields */
-- UPDATE Entity Field Category Info MJ: Company Integrations."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '115817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."CompanyID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '125817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."IntegrationID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '135817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '64799DD4-A537-4B9C-897F-EC2AFE9A28D0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."IsActive"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '145817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."IsExternalSystemReadOnly"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B24217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."Company"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Company Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '365817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."Integration"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Integration Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '375817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."SourceTypeID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Linking & Core Info',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Source Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F647023E-D909-4ECB-B59D-EE477C274827' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."AccessToken"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '155817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."RefreshToken"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '165817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."TokenExpirationDate"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '175817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."APIKey"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '185817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."ClientID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B34217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."ClientSecret"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B44217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."ExternalSystemID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '425817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."CustomAttribute1"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C44217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."DriverClassName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '385817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."DriverImportPath"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '395817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."Configuration"

UPDATE __mj."EntityField"
SET 
   "Category" = 'External System Mapping',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '987EAF20-227F-4043-BD87-06C9E01598F4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."LastRunID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3A5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."LastRunStartedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3B5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."LastRunEndedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3C5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0D5917F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E85817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* Set categories for 17 fields */
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."CompanyIntegrationID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Object Mapping',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Company Integration',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CA111FE4-61FE-49D0-9106-A75DE3035FB1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."CompanyIntegration"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Object Mapping',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Company Integration Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8A0E85E8-8610-4949-981F-19B0C6DF658F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."EntityID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Object Mapping',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '749758C4-A7B3-413A-A434-4844771C7F84' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."Entity"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Object Mapping',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '63F97D2F-BD4D-4A08-B83F-CD6891788B76' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."ExternalObjectName"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Object Mapping',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '41D1DC11-6093-4473-ABF6-1B578B9A26BD' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."ExternalObjectLabel"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Object Mapping',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '77802508-D414-4972-932D-C84439DE5DB4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."SyncDirection"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Control',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CD5A1D3C-F54B-41FF-9879-B3BCD73A231F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."SyncEnabled"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Control',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E29E9ABA-528D-4A3D-AEB7-B9625AB4362D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."Priority"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Control',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F1EB6C90-5CAF-4A45-88B8-2CA52A3D7D83' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."Status"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Control',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E6E720DD-FEFD-4C82-B694-DEA4FC4D308A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."DeleteBehavior"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Control',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '81628273-7743-4DCA-A036-82B8595BB2AA' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."MatchStrategy"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Engine Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '1EF5FAAF-4128-459F-978F-BC14223FD131' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."ConflictResolution"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Engine Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '350740C9-5552-45B2-A222-889BB91F6E3B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."Configuration"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Engine Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '3428AA14-3FCD-463A-8B90-29E08070C300' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C91EF1AE-5036-440D-8492-121518A3D36E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8A83F1A0-06F9-43D2-9151-53A5178EECE2' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '88CA33DB-38D1-406A-BB78-5809AC6F86EB' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-exchange-alt */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-exchange-alt', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '41579CAC-5DDC-48B4-8703-31292BE0A414';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('796b0a50-e0a2-47e2-9c53-9a79a23453df', '41579CAC-5DDC-48B4-8703-31292BE0A414', 'FieldCategoryInfo', '{"Object Mapping":{"icon":"fa fa-link","description":"Defines the relationship between external system objects and internal MemberJunction entities."},"Sync Control":{"icon":"fa fa-sync","description":"Operational settings that control how and when data synchronization occurs."},"Engine Configuration":{"icon":"fa fa-cogs","description":"Advanced logic for record matching, conflict handling, and custom mapping behavior."},"System Metadata":{"icon":"fa fa-database","description":"Internal record identifiers and audit tracking information."}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('b4adec7a-a565-40aa-bc6e-062eeb6bc4d4', '41579CAC-5DDC-48B4-8703-31292BE0A414', 'FieldCategoryIcons', '{"Object Mapping":"fa fa-link","Sync Control":"fa fa-sync","Engine Configuration":"fa fa-cogs","System Metadata":"fa fa-database"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '41579CAC-5DDC-48B4-8703-31292BE0A414';
/* Set categories for 8 fields */
-- UPDATE Entity Field Category Info MJ: Integration Source Types."Name"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Source Type Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '76CF6A33-6556-46CA-AA57-4050AA9AD647' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Source Types."Description"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Source Type Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E7691951-EEF3-47EE-B375-0421DE28AE7A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Source Types."Status"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Source Type Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6B1FF62D-F04E-42B4-85F9-02CE12E23381' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Source Types."DriverClass"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Technical Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '16A801A3-E1EF-4F41-ADBD-9AF7747ADE78' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Source Types."IconClass"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Technical Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '254C0B4E-CC02-46BC-92E3-8A46463198CB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Source Types."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F2882887-8D20-41CB-A1BE-91E3E270D3E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Source Types.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8D083AA3-60CB-41DC-82D0-26DD3E9C5ADE' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Source Types.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '10DDEDFE-56D3-4938-BFE4-0FD79DA1D6DA' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-plug */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-plug', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '57801845-6620-4CBD-993F-E4AA2D464A04';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('efccb55c-768d-4daf-8aba-65b635e4718a', '57801845-6620-4CBD-993F-E4AA2D464A04', 'FieldCategoryInfo', '{"Source Type Definition":{"icon":"fa fa-info-circle","description":"Basic identification and availability status for this integration source type"},"Technical Configuration":{"icon":"fa fa-cogs","description":"Technical implementation details including the driver class and UI representation"},"System Metadata":{"icon":"fa fa-database","description":"System-generated identifiers and audit timestamps"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('45f1e5cc-d371-4d52-9576-2c18810ac742', '57801845-6620-4CBD-993F-E4AA2D464A04', 'FieldCategoryIcons', '{"Source Type Definition":"fa fa-info-circle","Technical Configuration":"fa fa-cogs","System Metadata":"fa fa-database"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: reference, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '57801845-6620-4CBD-993F-E4AA2D464A04';
/* Remove stale One-To-Many EntityRelationships */

/* Remove stale EntityRelationship: undefined -> undefined (FK field 'CompanyName' no longer exists) */

DELETE FROM __mj."EntityRelationship" WHERE "ID" = '5C8442AB-9E0E-40BE-A70B-4FA0FE279992';

/* Remove stale EntityRelationship: undefined -> undefined (FK field 'ArtifactID' no longer exists) */

DELETE FROM __mj."EntityRelationship" WHERE "ID" = '947E8026-7845-4E01-BBD4-F2ED84A47E09';


--- CODE GEN RUN TO FIX ISSUES RE ORDERING

/* Create Entity Relationship: MJ: AI Agent Runs -> MJ: AI Agent Runs (One To Many via LastRunID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '77bfb3b9-ff99-4af6-92fe-5e979365052d'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('77bfb3b9-ff99-4af6-92fe-5e979365052d', '5190AF93-4C39-4429-BDAA-0AEB492A0256', '5190AF93-4C39-4429-BDAA-0AEB492A0256', 'LastRunID', 'One To Many', TRUE, TRUE, 7, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '4014c078-e011-4711-9a96-101a80d62ed4'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('4014c078-e011-4711-9a96-101a80d62ed4', '73AD0238-8B56-EF11-991A-6045BDEBA539', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', 'ChildPromptID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '818abb60-291e-4760-8a86-8da541300728'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('818abb60-291e-4760-8a86-8da541300728', '73AD0238-8B56-EF11-991A-6045BDEBA539', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', 'JudgeID', 'One To Many', TRUE, TRUE, 5, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'bac649b1-bbde-42b6-b8ac-64ab30e49ab3'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('bac649b1-bbde-42b6-b8ac-64ab30e49ab3', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '00248F34-2837-EF11-86D4-6045BDEE16E6', 'OutputEntityID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '76e32992-eb0e-4a64-a0b5-6355b746c628'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('76e32992-eb0e-4a64-a0b5-6355b746c628', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E2238F34-2837-EF11-86D4-6045BDEE16E6', 'RelatedEntityID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'a97c9ca4-5b00-4526-9680-f2336b43e07f'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('a97c9ca4-5b00-4526-9680-f2336b43e07f', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0B248F34-2837-EF11-86D4-6045BDEE16E6', 'CategoryEntityID', 'One To Many', TRUE, TRUE, 5, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '4d1a0628-a697-4463-95aa-69b5c5daaf7a'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('4d1a0628-a697-4463-95aa-69b5c5daaf7a', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'RelatedEntityID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'e3d3e66f-4358-45e4-b1c4-34df4282d6ca'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('e3d3e66f-4358-45e4-b1c4-34df4282d6ca', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '30248F34-2837-EF11-86D4-6045BDEE16E6', 'ApprovedByUserID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'd58e8135-9e85-48f8-927d-e34cae087e55'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('d58e8135-9e85-48f8-927d-e34cae087e55', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '17248F34-2837-EF11-86D4-6045BDEE16E6', 'ApprovedByUserID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '186a5e2e-6d78-41ba-9184-c3ab9772d926'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('186a5e2e-6d78-41ba-9184-c3ab9772d926', 'F7238F34-2837-EF11-86D4-6045BDEE16E6', 'EA238F34-2837-EF11-86D4-6045BDEE16E6', 'ReadRLSFilterID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '7ed2faec-6136-449a-a6e5-aae4b049785d'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('7ed2faec-6136-449a-a6e5-aae4b049785d', 'F7238F34-2837-EF11-86D4-6045BDEE16E6', 'EA238F34-2837-EF11-86D4-6045BDEE16E6', 'CreateRLSFilterID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'd69ece92-a003-4731-b3e7-d6fe6760466e'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('d69ece92-a003-4731-b3e7-d6fe6760466e', 'F7238F34-2837-EF11-86D4-6045BDEE16E6', 'EA238F34-2837-EF11-86D4-6045BDEE16E6', 'DeleteRLSFilterID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '98a4a8dd-cc85-4425-aef7-bbd762b5b0f9'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('98a4a8dd-cc85-4425-aef7-bbd762b5b0f9', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', 'OriginalModelID', 'One To Many', TRUE, TRUE, 6, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '98e22ea6-9c8e-43b2-b087-d9b6a5e3f1f8'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('98e22ea6-9c8e-43b2-b087-d9b6a5e3f1f8', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', 'RerunFromPromptRunID', 'One To Many', TRUE, TRUE, 7, NOW(), NOW());
    END IF;
END $$;

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'ParentRunID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '5841FDE4-13D8-4C69-B8FF-A3D2539EB0DE';


/* Update EntityRelationship join field from 'JudgeID' to 'PromptID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'PromptID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'B83EC5E5-FA9A-4F1F-8EB2-98B0550805BB';


/* Update EntityRelationship join field from 'OutputEntityID' to 'EntityID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'EntityID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'BAC649B1-BBDE-42B6-B8AC-64AB30E49AB3';


/* Update EntityRelationship join field from 'RelatedEntityID' to 'EntityID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'EntityID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '86ED5122-2FEA-48A1-8B75-B58519890413';


/* Update EntityRelationship join field from 'CategoryEntityID' to 'EntityID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'EntityID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '53806B32-1416-44E4-BD9E-FBABD9F24806';


/* Update EntityRelationship join field from 'RelatedEntityID' to 'EntityID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'EntityID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '0A19F94D-6030-42B2-8E65-DDFBC95248FA';


/* Update EntityRelationship join field from 'ApprovedByUserID' to 'StartedByUserID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'StartedByUserID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'C2E9FE80-1C30-4D71-8755-D705D22A214E';


/* Update EntityRelationship join field from 'ApprovedByUserID' to 'InitiatedByUserID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'InitiatedByUserID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'D58E8135-9E85-48F8-927D-E34CAE087E55';


/* Update EntityRelationship join field from 'DeleteRLSFilterID' to 'UpdateRLSFilterID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'UpdateRLSFilterID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'D69ECE92-A003-4731-B3E7-D6FE6760466E';


/* Update EntityRelationship join field from 'OriginalModelID' to 'ModelID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'ModelID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '98A4A8DD-CC85-4425-AEF7-BBD762B5B0F9';


/* Update EntityRelationship join field from 'RerunFromPromptRunID' to 'ParentID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'ParentID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '98E22EA6-9C8E-43B2-B087-D9B6A5E3F1F8';


/* SQL text to update entity field related entity name field map for entity field ID 6BEFB401-01DD-454A-BB34-D300E78AB97D */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c233a240-755e-4148-b635-fb22f47ecf5d' OR ("EntityID" = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0' AND "Name" = 'EntityMap')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'c233a240-755e-4148-b635-fb22f47ecf5d',
        'D5C4FEF3-21D0-4A41-893B-34F9527195F0', -- "Entity": "MJ": "Company" "Integration" "Sync" "Watermarks"
        100019,
        'EntityMap',
        'Entity Map',
        NULL,
        'TEXT',
        1000,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0aebc08d-8462-4897-85bf-cc4dd6b7935a' OR ("EntityID" = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND "Name" = 'EntityMap')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '0aebc08d-8462-4897-85bf-cc4dd6b7935a',
        'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- "Entity": "MJ": "Company" "Integration" "Field" "Maps"
        100031,
        'EntityMap',
        'Entity Map',
        NULL,
        'TEXT',
        1000,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

UPDATE __mj."EntityField"
            SET "IsNameField" = TRUE
            WHERE "ID" = 'C233A240-755E-4148-B635-FB22F47ECF5D'
            AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'C233A240-755E-4148-B635-FB22F47ECF5D'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'C233A240-755E-4148-B635-FB22F47ECF5D'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '0AEBC08D-8462-4897-85BF-CC4DD6B7935A'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '0AEBC08D-8462-4897-85BF-CC4DD6B7935A'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set categories for 16 fields */
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3DFB579F-2F81-4B1F-A357-09C7EA664AD0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."EntityMapID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity Map ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6BEFB401-01DD-454A-BB34-D300E78AB97D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '93F28803-D909-4BCB-9742-08455F48AB78' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B4AD87BA-FB93-4118-B671-A023BD200FE3' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."EntityMap"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Mapping Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0AEBC08D-8462-4897-85BF-CC4DD6B7935A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."SourceFieldName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D8A8D8A6-7F09-4A3F-ADE8-24D5AD46C512' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."SourceFieldLabel"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CD36A432-32E7-4B66-B59C-DFAEC7001A76' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."DestinationFieldName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4886F7D9-06EF-4979-9346-B689AFCF5CB9' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."DestinationFieldLabel"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4D8315D9-AED2-4E67-8743-6233F9F1C312' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."Direction"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E6D1F636-074A-44C4-9908-2F05AC0D8CEA' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."TransformPipeline"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '9BE66DC5-E20A-4FEE-ACAD-68BD018F0B86' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."IsKeyField"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Is Key Field',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BB6B2FC1-8530-4229-A524-85437510B1B0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."IsRequired"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Is Required',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '923B68D4-6B26-4B39-8324-F115221E6733' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."DefaultValue"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5F47D2DA-B34D-436F-8177-5E1BA9435288' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."Priority"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '93E74709-A312-49E1-8C80-EA2909A6B5BF' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."Status"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2F978BF2-EEA0-46E7-86C7-62D09DA17B96' AND "AutoUpdateCategory" = TRUE;
/* Set categories for 10 fields */
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '95EB5E41-3D51-4AF7-93B5-FD0466702686' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."EntityMapID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '846D8888-AF62-4D4B-AE06-A52C284377A7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."EntityMap"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity Map Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C233A240-755E-4148-B635-FB22F47ECF5D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."Direction"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B060FD28-BE54-42CF-BEF5-FE27359E5A72' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."WatermarkType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1647D6D5-B2B7-4702-ACF4-FAEFFF2D091A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."WatermarkValue"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A104BF94-1F56-4B4A-A243-BD8A2A3F3EF7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."LastSyncAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '028D4EE7-1A23-4C6A-9E42-1527BA110C70' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."RecordsSynced"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E4B0F49E-B21C-4358-8E46-EC4BA66A3A22' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2D349D6A-E5E1-4037-B1BE-104E1BD8009E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E87F3F8F-FB10-46C6-B42A-D41C0AF3AAE3' AND "AutoUpdateCategory" = TRUE;
/* Update EntityRelationship join field from 'LastRunID' to 'ParentRunID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'ParentRunID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '5841FDE4-13D8-4C69-B8FF-A3D2539EB0DE';


/* Update EntityRelationship join field from 'JudgeID' to 'PromptID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'PromptID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'B83EC5E5-FA9A-4F1F-8EB2-98B0550805BB';


/* Update EntityRelationship join field from 'OutputEntityID' to 'EntityID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'EntityID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'BAC649B1-BBDE-42B6-B8AC-64AB30E49AB3';


/* Update EntityRelationship join field from 'RelatedEntityID' to 'EntityID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'EntityID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '86ED5122-2FEA-48A1-8B75-B58519890413';


/* Update EntityRelationship join field from 'CategoryEntityID' to 'EntityID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'EntityID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '53806B32-1416-44E4-BD9E-FBABD9F24806';


/* Update EntityRelationship join field from 'RelatedEntityID' to 'EntityID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'EntityID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '0A19F94D-6030-42B2-8E65-DDFBC95248FA';


/* Update EntityRelationship join field from 'ApprovedByUserID' to 'StartedByUserID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'StartedByUserID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'C2E9FE80-1C30-4D71-8755-D705D22A214E';


/* Update EntityRelationship join field from 'ApprovedByUserID' to 'InitiatedByUserID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'InitiatedByUserID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'D58E8135-9E85-48F8-927D-E34CAE087E55';


/* Update EntityRelationship join field from 'DeleteRLSFilterID' to 'UpdateRLSFilterID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'UpdateRLSFilterID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'D69ECE92-A003-4731-B3E7-D6FE6760466E';


/* Update EntityRelationship join field from 'OriginalModelID' to 'ModelID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'ModelID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '98A4A8DD-CC85-4425-AEF7-BBD762B5B0F9';


/* Update EntityRelationship join field from 'RerunFromPromptRunID' to 'ParentID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'ParentID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '98E22EA6-9C8E-43B2-B087-D9B6A5E3F1F8';


/* SQL text to update entity field related entity name field map for entity field ID 6BEFB401-01DD-454A-BB34-D300E78AB97D */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c233a240-755e-4148-b635-fb22f47ecf5d' OR ("EntityID" = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0' AND "Name" = 'EntityMap')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'c233a240-755e-4148-b635-fb22f47ecf5d',
        'D5C4FEF3-21D0-4A41-893B-34F9527195F0', -- "Entity": "MJ": "Company" "Integration" "Sync" "Watermarks"
        100020, -- auto-bumped from 100019 (UQ_EntityField_EntityID_Sequence dedup),
        'EntityMap',
        'Entity Map',
        NULL,
        'TEXT',
        1000,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0aebc08d-8462-4897-85bf-cc4dd6b7935a' OR ("EntityID" = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND "Name" = 'EntityMap')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '0aebc08d-8462-4897-85bf-cc4dd6b7935a',
        'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- "Entity": "MJ": "Company" "Integration" "Field" "Maps"
        100032, -- auto-bumped from 100031 (UQ_EntityField_EntityID_Sequence dedup),
        'EntityMap',
        'Entity Map',
        NULL,
        'TEXT',
        1000,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

UPDATE __mj."EntityField"
            SET "IsNameField" = TRUE
            WHERE "ID" = 'C233A240-755E-4148-B635-FB22F47ECF5D'
            AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'C233A240-755E-4148-B635-FB22F47ECF5D'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'C233A240-755E-4148-B635-FB22F47ECF5D'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '0AEBC08D-8462-4897-85BF-CC4DD6B7935A'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '0AEBC08D-8462-4897-85BF-CC4DD6B7935A'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;


-- ===================== FK & CHECK Constraints =====================


-- Flush any pending deferred trigger events from prior DML so DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE __mj."CompanyIntegration"
 ADD CONSTRAINT "FK_CompanyIntegration_IntegrationSourceType"
    FOREIGN KEY ("SourceTypeID") REFERENCES __mj."IntegrationSourceType"("ID");

----------------------------------------------------------------------
-- 6. Extended Properties — Table Descriptions
---------------------------------------------------------------------- DEFERRABLE INITIALLY DEFERRED;


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwCompanyIntegrationFieldMaps" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: Permissions for vwCompanyIntegrationFieldMaps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwCompanyIntegrationFieldMaps" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: spCreateCompanyIntegrationFieldMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationFieldMap
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationFieldMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Company Integration Field Maps */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationFieldMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: spUpdateCompanyIntegrationFieldMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationFieldMap
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationFieldMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationFieldMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: spDeleteCompanyIntegrationFieldMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationFieldMap
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationFieldMap" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Company Integration Field Maps */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationFieldMap" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to update entity field related entity name field map for entity field ID 749758C4-A7B3-413A-A434-4844771C7F84 */

DO $$ BEGIN GRANT SELECT ON __mj."vwCompanyIntegrationEntityMaps" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Company Integration Entity Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Entity Maps
-- Item: Permissions for vwCompanyIntegrationEntityMaps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwCompanyIntegrationEntityMaps" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Company Integration Entity Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Entity Maps
-- Item: spCreateCompanyIntegrationEntityMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationEntityMap
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationEntityMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Company Integration Entity Maps */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationEntityMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Company Integration Entity Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Entity Maps
-- Item: spUpdateCompanyIntegrationEntityMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationEntityMap
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationEntityMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationEntityMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Company Integration Entity Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Entity Maps
-- Item: spDeleteCompanyIntegrationEntityMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationEntityMap
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationEntityMap" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Company Integration Entity Maps */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationEntityMap" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for CompanyIntegrationSyncWatermark */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityMapID in table CompanyIntegrationSyncWatermark;

DO $$ BEGIN GRANT SELECT ON __mj."vwCompanyIntegrations" TO "cdp_UI", "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integrations
-- Item: spCreateCompanyIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegration
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegration" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Company Integrations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegration" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integrations
-- Item: spUpdateCompanyIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegration
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegration" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegration" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integrations
-- Item: spDeleteCompanyIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegration
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegration" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Company Integrations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegration" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: vwCompanyIntegrationSyncWatermarks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Company Integration Sync Watermarks
-----               SCHEMA:      __mj
-----               BASE TABLE:  CompanyIntegrationSyncWatermark
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwCompanyIntegrationSyncWatermarks" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: Permissions for vwCompanyIntegrationSyncWatermarks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwCompanyIntegrationSyncWatermarks" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: spCreateCompanyIntegrationSyncWatermark
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationSyncWatermark
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationSyncWatermark" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Company Integration Sync Watermarks */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationSyncWatermark" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: spUpdateCompanyIntegrationSyncWatermark
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationSyncWatermark
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationSyncWatermark" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationSyncWatermark" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: spDeleteCompanyIntegrationSyncWatermark
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationSyncWatermark
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationSyncWatermark" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Company Integration Sync Watermarks */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationSyncWatermark" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for IntegrationSourceType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Source Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for MJ: Integration Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Source Types
-- Item: vwIntegrationSourceTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Integration Source Types
-----               SCHEMA:      __mj
-----               BASE TABLE:  IntegrationSourceType
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwIntegrationSourceTypes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Integration Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Source Types
-- Item: Permissions for vwIntegrationSourceTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwIntegrationSourceTypes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Integration Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Source Types
-- Item: spCreateIntegrationSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR IntegrationSourceType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateIntegrationSourceType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Integration Source Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateIntegrationSourceType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Integration Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Source Types
-- Item: spUpdateIntegrationSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR IntegrationSourceType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateIntegrationSourceType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateIntegrationSourceType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Integration Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Source Types
-- Item: spDeleteIntegrationSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR IntegrationSourceType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteIntegrationSourceType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Integration Source Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteIntegrationSourceType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */

DO $$ BEGIN GRANT SELECT ON __mj."vwCompanyIntegrationFieldMaps" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: Permissions for vwCompanyIntegrationFieldMaps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwCompanyIntegrationFieldMaps" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: spCreateCompanyIntegrationFieldMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationFieldMap
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationFieldMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Company Integration Field Maps */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationFieldMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: spUpdateCompanyIntegrationFieldMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationFieldMap
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationFieldMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationFieldMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: spDeleteCompanyIntegrationFieldMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationFieldMap
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationFieldMap" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Company Integration Field Maps */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationFieldMap" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to update entity field related entity name field map for entity field ID 846D8888-AF62-4D4B-AE06-A52C284377A7 */

DO $$ BEGIN GRANT SELECT ON __mj."vwCompanyIntegrationSyncWatermarks" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: Permissions for vwCompanyIntegrationSyncWatermarks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwCompanyIntegrationSyncWatermarks" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: spCreateCompanyIntegrationSyncWatermark
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationSyncWatermark
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationSyncWatermark" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Company Integration Sync Watermarks */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationSyncWatermark" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: spUpdateCompanyIntegrationSyncWatermark
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationSyncWatermark
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationSyncWatermark" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationSyncWatermark" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: spDeleteCompanyIntegrationSyncWatermark
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationSyncWatermark
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationSyncWatermark" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Company Integration Sync Watermarks */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationSyncWatermark" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */

DO $$ BEGIN GRANT SELECT ON __mj."vwCompanyIntegrationFieldMaps" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: Permissions for vwCompanyIntegrationFieldMaps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwCompanyIntegrationFieldMaps" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: spCreateCompanyIntegrationFieldMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationFieldMap
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationFieldMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Company Integration Field Maps */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationFieldMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: spUpdateCompanyIntegrationFieldMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationFieldMap
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationFieldMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationFieldMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: spDeleteCompanyIntegrationFieldMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationFieldMap
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationFieldMap" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Company Integration Field Maps */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationFieldMap" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to update entity field related entity name field map for entity field ID 846D8888-AF62-4D4B-AE06-A52C284377A7 */

DO $$ BEGIN GRANT SELECT ON __mj."vwCompanyIntegrationSyncWatermarks" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: Permissions for vwCompanyIntegrationSyncWatermarks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwCompanyIntegrationSyncWatermarks" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: spCreateCompanyIntegrationSyncWatermark
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationSyncWatermark
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationSyncWatermark" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Company Integration Sync Watermarks */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationSyncWatermark" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: spUpdateCompanyIntegrationSyncWatermark
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationSyncWatermark
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationSyncWatermark" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationSyncWatermark" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: spDeleteCompanyIntegrationSyncWatermark
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationSyncWatermark
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationSyncWatermark" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Company Integration Sync Watermarks */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationSyncWatermark" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */


-- ===================== Comments =====================

COMMENT ON TABLE __mj."IntegrationSourceType" IS 'Defines categories of integration sources such as SaaS API, Relational Database, or File Feed.';

COMMENT ON TABLE __mj."CompanyIntegrationEntityMap" IS 'Maps an external object from a company integration to a MemberJunction entity, controlling sync direction, matching, and conflict resolution.';

COMMENT ON TABLE __mj."CompanyIntegrationFieldMap" IS 'Maps individual fields between an external source object and a MemberJunction entity, with optional transform pipeline.';

COMMENT ON TABLE __mj."CompanyIntegrationSyncWatermark" IS 'Tracks incremental sync progress per entity map and direction using watermarks (timestamp, cursor, change token, or version).';

COMMENT ON COLUMN __mj."IntegrationSourceType"."Name" IS 'Display name for this source type (e.g. SaaS API, Relational Database, File Feed).';

COMMENT ON COLUMN __mj."IntegrationSourceType"."Description" IS 'Optional longer description of this source type.';

COMMENT ON COLUMN __mj."IntegrationSourceType"."DriverClass" IS 'Fully-qualified class name registered via @RegisterClass that implements BaseIntegrationConnector for this source type.';

COMMENT ON COLUMN __mj."IntegrationSourceType"."IconClass" IS 'Font Awesome icon class for UI display.';

COMMENT ON COLUMN __mj."IntegrationSourceType"."Status" IS 'Whether this source type is available for use. Active or Inactive.';

COMMENT ON COLUMN __mj."CompanyIntegrationEntityMap"."ExternalObjectName" IS 'The name of the object in the external system (e.g. table name, API resource name).';

COMMENT ON COLUMN __mj."CompanyIntegrationEntityMap"."ExternalObjectLabel" IS 'Optional human-friendly label for the external object.';

COMMENT ON COLUMN __mj."CompanyIntegrationEntityMap"."SyncDirection" IS 'Whether data flows from external to MJ (Pull), MJ to external (Push), or both.';

COMMENT ON COLUMN __mj."CompanyIntegrationEntityMap"."SyncEnabled" IS 'When true, this entity map is included in sync runs.';

COMMENT ON COLUMN __mj."CompanyIntegrationEntityMap"."MatchStrategy" IS 'JSON configuration for the match engine describing how to identify existing records (key fields, fuzzy thresholds, etc.).';

COMMENT ON COLUMN __mj."CompanyIntegrationEntityMap"."ConflictResolution" IS 'How to handle conflicts when both source and destination have been modified. SourceWins, DestWins, MostRecent, or Manual.';

COMMENT ON COLUMN __mj."CompanyIntegrationEntityMap"."Priority" IS 'Processing order when multiple entity maps exist. Lower numbers are processed first.';

COMMENT ON COLUMN __mj."CompanyIntegrationEntityMap"."DeleteBehavior" IS 'How to handle records that no longer exist in the source. SoftDelete, DoNothing, or HardDelete.';

COMMENT ON COLUMN __mj."CompanyIntegrationEntityMap"."Status" IS 'Whether this entity map is Active or Inactive.';

COMMENT ON COLUMN __mj."CompanyIntegrationEntityMap"."Configuration" IS 'Optional JSON configuration specific to this entity mapping.';

COMMENT ON COLUMN __mj."CompanyIntegrationFieldMap"."SourceFieldName" IS 'The field/column name in the external source system.';

COMMENT ON COLUMN __mj."CompanyIntegrationFieldMap"."SourceFieldLabel" IS 'Optional human-friendly label for the source field.';

COMMENT ON COLUMN __mj."CompanyIntegrationFieldMap"."DestinationFieldName" IS 'The MJ entity field name this source field maps to.';

COMMENT ON COLUMN __mj."CompanyIntegrationFieldMap"."DestinationFieldLabel" IS 'Optional human-friendly label for the destination field.';

COMMENT ON COLUMN __mj."CompanyIntegrationFieldMap"."Direction" IS 'Direction of field mapping: SourceToDest, DestToSource, or Both.';

COMMENT ON COLUMN __mj."CompanyIntegrationFieldMap"."TransformPipeline" IS 'JSON array of transform names to apply in order (e.g. ["trim", "uppercase"]). See FieldMappingEngine for available transforms.';

COMMENT ON COLUMN __mj."CompanyIntegrationFieldMap"."IsKeyField" IS 'When true, this field is used by the MatchEngine to find existing records during sync.';

COMMENT ON COLUMN __mj."CompanyIntegrationFieldMap"."IsRequired" IS 'When true, a sync record is rejected if this field has no value.';

COMMENT ON COLUMN __mj."CompanyIntegrationFieldMap"."DefaultValue" IS 'Default value to use when the source field is null or missing.';

COMMENT ON COLUMN __mj."CompanyIntegrationFieldMap"."Priority" IS 'Processing order for this field mapping within the entity map.';

COMMENT ON COLUMN __mj."CompanyIntegrationFieldMap"."Status" IS 'Whether this field mapping is Active or Inactive.';

COMMENT ON COLUMN __mj."CompanyIntegrationSyncWatermark"."Direction" IS 'Sync direction this watermark tracks: Pull or Push.';

COMMENT ON COLUMN __mj."CompanyIntegrationSyncWatermark"."WatermarkType" IS 'The type of watermark: Timestamp, Cursor, ChangeToken, or Version.';

COMMENT ON COLUMN __mj."CompanyIntegrationSyncWatermark"."WatermarkValue" IS 'The serialized watermark value used to resume incremental sync.';

COMMENT ON COLUMN __mj."CompanyIntegrationSyncWatermark"."LastSyncAt" IS 'Timestamp of the last successful sync for this watermark.';

COMMENT ON COLUMN __mj."CompanyIntegrationSyncWatermark"."RecordsSynced" IS 'Cumulative count of records synced through this watermark.';

COMMENT ON COLUMN __mj."CompanyIntegration"."SourceTypeID" IS 'Links this integration to its source type (SaaS API, Database, File Feed, etc.).';

COMMENT ON COLUMN __mj."CompanyIntegration"."Configuration" IS 'JSON configuration for the integration connection (server, database, credentials reference, etc.).';


-- ===================== Other =====================

-- Migration: Integration System tables
-- Creates IntegrationSourceType, CompanyIntegrationEntityMap, CompanyIntegrationFieldMap,
-- CompanyIntegrationSyncWatermark, and adds SourceTypeID/Configuration to CompanyIntegration.

----------------------------------------------------------------------
-- 1. IntegrationSourceType
----------------------------------------------------------------------

/* spUpdate Permissions for MJ: Company Integration Field Maps */

/* spUpdate Permissions for MJ: Company Integration Entity Maps */

/* spUpdate Permissions for MJ: Company Integrations */

/* spUpdate Permissions for MJ: Company Integration Sync Watermarks */

/* spUpdate Permissions for MJ: Integration Source Types */

/* spUpdate Permissions for MJ: Company Integration Field Maps */

/* spUpdate Permissions for MJ: Company Integration Sync Watermarks */

/* spUpdate Permissions for MJ: Company Integration Field Maps */

/* spUpdate Permissions for MJ: Company Integration Sync Watermarks */


-- ===================== Refresh hand-rolled view to expose SourceTypeID =====================
-- The SourceTypeID column was added to __mj."CompanyIntegration" earlier in this migration,
-- but __mj."vwCompanyIntegrations" is hand-rolled (BaseViewGenerated=FALSE) so CodeGen does
-- not regenerate it. SQL Server's counterpart of this migration uses EXEC sp_refreshview;
-- PG has no sp_refreshview equivalent for hand-rolled views, so we must rewrite the view
-- explicitly. Plain CREATE OR REPLACE VIEW with the column appended at the end — PG accepts
-- the new column list as a superset of the old as long as existing column positions/types/
-- names are preserved. No 42P16, no DROP CASCADE, no dependent disturbance.
CREATE OR REPLACE VIEW __mj."vwCompanyIntegrations" AS
 SELECT ci."ID",
    ci."CompanyID",
    ci."IntegrationID",
    ci."IsActive",
    ci."AccessToken",
    ci."RefreshToken",
    ci."TokenExpirationDate",
    ci."APIKey",
    ci."ExternalSystemID",
    ci."IsExternalSystemReadOnly",
    ci."ClientID",
    ci."ClientSecret",
    ci."CustomAttribute1",
    ci."__mj_CreatedAt",
    ci."__mj_UpdatedAt",
    ci."Name",
    c."Name" AS "Company",
    i."Name" AS "Integration",
    i."ClassName" AS "DriverClassName",
    i."ImportPath" AS "DriverImportPath",
    cir."ID" AS "LastRunID",
    cir."StartedAt" AS "LastRunStartedAt",
    cir."EndedAt" AS "LastRunEndedAt",
    -- New column appended (v5.8.x): expose SourceTypeID added to CompanyIntegration above.
    ci."SourceTypeID"
   FROM __mj."CompanyIntegration" ci
     JOIN __mj."Company" c ON ci."CompanyID" = c."ID"
     JOIN __mj."Integration" i ON ci."IntegrationID" = i."ID"
     LEFT JOIN __mj."CompanyIntegrationRun" cir ON ci."ID" = cir."CompanyIntegrationID" AND cir."ID" = (( SELECT cirinner."ID"
           FROM __mj."CompanyIntegrationRun" cirinner
          WHERE cirinner."CompanyIntegrationID" = ci."ID"
          ORDER BY cirinner."StartedAt" DESC
         LIMIT 1));
