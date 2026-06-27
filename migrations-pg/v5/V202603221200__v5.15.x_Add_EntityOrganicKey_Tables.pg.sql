
-- ===================== DDL: Tables, PKs, Indexes =====================

CREATE TABLE __mj."EntityOrganicKey" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "EntityID" UUID NOT NULL,
 "Name" VARCHAR(255) NOT NULL,
 "Description" TEXT NULL,
 "MatchFieldNames" VARCHAR(500) NOT NULL,
 "NormalizationStrategy" VARCHAR(50) NOT NULL DEFAULT 'LowerCaseTrim',
 "CustomNormalizationExpression" TEXT NULL,
 "AutoCreateRelatedViewOnForm" BOOLEAN NOT NULL DEFAULT FALSE,
 "Sequence" INTEGER NOT NULL DEFAULT 0,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Active',
 CONSTRAINT PK_EntityOrganicKey PRIMARY KEY ("ID"),
 CONSTRAINT FK_EntityOrganicKey_Entity FOREIGN KEY ("EntityID")
 REFERENCES __mj."Entity"("ID"),
 CONSTRAINT UQ_EntityOrganicKey_EntityName UNIQUE ("EntityID", "Name"),
 CONSTRAINT CK_EntityOrganicKey_NormalizationStrategy
 CHECK ("NormalizationStrategy" IN ('LowerCaseTrim', 'Trim', 'ExactMatch', 'Custom')),
 CONSTRAINT CK_EntityOrganicKey_Status
 CHECK ("Status" IN ('Active', 'Disabled'))
);

-- Extended properties for EntityOrganicKey (table-level);

CREATE TABLE __mj."EntityOrganicKeyRelatedEntity" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "EntityOrganicKeyID" UUID NOT NULL,
 "RelatedEntityID" UUID NOT NULL,
 "RelatedEntityFieldNames" VARCHAR(500) NULL,
 "TransitiveObjectName" VARCHAR(500) NULL,
 "TransitiveObjectMatchFieldNames" VARCHAR(500) NULL,
 "TransitiveObjectOutputFieldName" VARCHAR(255) NULL,
 "RelatedEntityJoinFieldName" VARCHAR(255) NULL,
 "DisplayName" VARCHAR(255) NULL,
 "DisplayLocation" VARCHAR(50) NOT NULL DEFAULT 'After Field Tabs',
 "DisplayComponentID" UUID NULL,
 "DisplayComponentConfiguration" TEXT NULL,
 "Sequence" INTEGER NOT NULL DEFAULT 0,
 CONSTRAINT PK_EntityOrganicKeyRelatedEntity PRIMARY KEY ("ID"),
 CONSTRAINT FK_EOKRE_OrganicKey FOREIGN KEY ("EntityOrganicKeyID")
 REFERENCES __mj."EntityOrganicKey"("ID"),
 CONSTRAINT FK_EOKRE_RelatedEntity FOREIGN KEY ("RelatedEntityID")
 REFERENCES __mj."Entity"("ID"),
 CONSTRAINT UQ_EOKRE_KeyEntity UNIQUE ("EntityOrganicKeyID", "RelatedEntityID"),
 CONSTRAINT CK_EOKRE_DisplayLocation
 CHECK ("DisplayLocation" IN ('After Field Tabs', 'Before Field Tabs')),
 CONSTRAINT CK_EOKRE_MatchMode CHECK (
 -- "Either" direct match ("RelatedEntityFieldNames" set, no transitive columns)
 ("RelatedEntityFieldNames" IS NOT NULL
 AND "TransitiveObjectName" IS NULL
 AND "TransitiveObjectMatchFieldNames" IS NULL
 AND "TransitiveObjectOutputFieldName" IS NULL
 AND "RelatedEntityJoinFieldName" IS NULL)
 OR
 -- Or transitive match (all transitive columns set, no "RelatedEntityFieldNames")
 ("RelatedEntityFieldNames" IS NULL
 AND "TransitiveObjectName" IS NOT NULL
 AND "TransitiveObjectMatchFieldNames" IS NOT NULL
 AND "TransitiveObjectOutputFieldName" IS NOT NULL
 AND "RelatedEntityJoinFieldName" IS NOT NULL)
 )
);

-- Extended properties for EntityOrganicKeyRelatedEntity (table-level);

ALTER TABLE __mj."EntityOrganicKeyRelatedEntity"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."EntityOrganicKeyRelatedEntity" */

ALTER TABLE __mj."EntityOrganicKeyRelatedEntity" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();
/* SQL text to add special date field __mj_UpdatedAt to entity __mj."EntityOrganicKeyRelatedEntity" */

ALTER TABLE __mj."EntityOrganicKeyRelatedEntity"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."EntityOrganicKeyRelatedEntity" */

ALTER TABLE __mj."EntityOrganicKeyRelatedEntity" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();
/* SQL text to add special date field __mj_CreatedAt to entity __mj."EntityOrganicKey" */

ALTER TABLE __mj."EntityOrganicKey"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."EntityOrganicKey" */

ALTER TABLE __mj."EntityOrganicKey" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();
/* SQL text to add special date field __mj_UpdatedAt to entity __mj."EntityOrganicKey" */

ALTER TABLE __mj."EntityOrganicKey"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."EntityOrganicKey" */

ALTER TABLE __mj."EntityOrganicKey" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();
/* SQL text to insert new entity field */

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityOrganicKeyRelatedEntity_EntityO_05051b82" ON __mj."EntityOrganicKeyRelatedEntity" ("EntityOrganicKeyID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityOrganicKeyRelatedEntity_RelatedEntityID" ON __mj."EntityOrganicKeyRelatedEntity" ("RelatedEntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityOrganicKey_EntityID" ON __mj."EntityOrganicKey" ("EntityID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwEntityOrganicKeys';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwEntityOrganicKeys"
AS SELECT
    e.*,
    "MJEntity_EntityID"."Name" AS "Entity"
FROM
    __mj."EntityOrganicKey" AS e
INNER JOIN
    __mj."Entity" AS "MJEntity_EntityID"
  ON
    e."EntityID" = "MJEntity_EntityID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwEntityOrganicKeyRelatedEntities';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwEntityOrganicKeyRelatedEntities"
AS SELECT
    e.*,
    "MJEntityOrganicKey_EntityOrganicKeyID"."Name" AS "EntityOrganicKey",
    "MJEntity_RelatedEntityID"."Name" AS "RelatedEntity"
FROM
    __mj."EntityOrganicKeyRelatedEntity" AS e
INNER JOIN
    __mj."EntityOrganicKey" AS "MJEntityOrganicKey_EntityOrganicKeyID"
  ON
    e."EntityOrganicKeyID" = "MJEntityOrganicKey_EntityOrganicKeyID"."ID"
INNER JOIN
    __mj."Entity" AS "MJEntity_RelatedEntityID"
  ON
    e."RelatedEntityID" = "MJEntity_RelatedEntityID"."ID"$vsql$;
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

CREATE OR REPLACE FUNCTION __mj."spCreateEntityOrganicKey"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_MatchFieldNames VARCHAR(500) DEFAULT NULL,
    IN p_NormalizationStrategy VARCHAR(50) DEFAULT NULL,
    IN p_CustomNormalizationExpression TEXT DEFAULT NULL,
    IN p_AutoCreateRelatedViewOnForm BOOLEAN DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityOrganicKeys" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."EntityOrganicKey"
            (
                "ID",
                "EntityID",
                "Name",
                "Description",
                "MatchFieldNames",
                "NormalizationStrategy",
                "CustomNormalizationExpression",
                "AutoCreateRelatedViewOnForm",
                "Sequence",
                "Status"
            )
        VALUES
            (
                p_ID,
                p_EntityID,
                p_Name,
                p_Description,
                p_MatchFieldNames,
                COALESCE(p_NormalizationStrategy, 'LowerCaseTrim'),
                p_CustomNormalizationExpression,
                COALESCE(p_AutoCreateRelatedViewOnForm, FALSE),
                COALESCE(p_Sequence, 0),
                COALESCE(p_Status, 'Active')
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."EntityOrganicKey"
            (
                "EntityID",
                "Name",
                "Description",
                "MatchFieldNames",
                "NormalizationStrategy",
                "CustomNormalizationExpression",
                "AutoCreateRelatedViewOnForm",
                "Sequence",
                "Status"
            )
        VALUES
            (
                p_EntityID,
                p_Name,
                p_Description,
                p_MatchFieldNames,
                COALESCE(p_NormalizationStrategy, 'LowerCaseTrim'),
                p_CustomNormalizationExpression,
                COALESCE(p_AutoCreateRelatedViewOnForm, FALSE),
                COALESCE(p_Sequence, 0),
                COALESCE(p_Status, 'Active')
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwEntityOrganicKeys" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityOrganicKey"(
    IN p_ID UUID,
    IN p_EntityID UUID,
    IN p_Name VARCHAR(255),
    IN p_Description TEXT,
    IN p_MatchFieldNames VARCHAR(500),
    IN p_NormalizationStrategy VARCHAR(50),
    IN p_CustomNormalizationExpression TEXT,
    IN p_AutoCreateRelatedViewOnForm BOOLEAN,
    IN p_Sequence INTEGER,
    IN p_Status VARCHAR(20)
)
RETURNS SETOF __mj."vwEntityOrganicKeys" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."EntityOrganicKey"
    SET
        "EntityID" = p_EntityID,
        "Name" = p_Name,
        "Description" = p_Description,
        "MatchFieldNames" = p_MatchFieldNames,
        "NormalizationStrategy" = p_NormalizationStrategy,
        "CustomNormalizationExpression" = p_CustomNormalizationExpression,
        "AutoCreateRelatedViewOnForm" = p_AutoCreateRelatedViewOnForm,
        "Sequence" = p_Sequence,
        "Status" = p_Status
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwEntityOrganicKeys" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwEntityOrganicKeys" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityOrganicKey"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityOrganicKey"
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

CREATE OR REPLACE FUNCTION __mj."spCreateEntityOrganicKeyRelatedEntity"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityOrganicKeyID UUID DEFAULT NULL,
    IN p_RelatedEntityID UUID DEFAULT NULL,
    IN p_RelatedEntityFieldNames VARCHAR(500) DEFAULT NULL,
    IN p_TransitiveObjectName VARCHAR(500) DEFAULT NULL,
    IN p_TransitiveObjectMatchFieldNames VARCHAR(500) DEFAULT NULL,
    IN p_TransitiveObjectOutputFieldName VARCHAR(255) DEFAULT NULL,
    IN p_RelatedEntityJoinFieldName VARCHAR(255) DEFAULT NULL,
    IN p_DisplayName VARCHAR(255) DEFAULT NULL,
    IN p_DisplayLocation VARCHAR(50) DEFAULT NULL,
    IN p_DisplayComponentID UUID DEFAULT NULL,
    IN p_DisplayComponentConfiguration TEXT DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityOrganicKeyRelatedEntities" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."EntityOrganicKeyRelatedEntity"
            (
                "ID",
                "EntityOrganicKeyID",
                "RelatedEntityID",
                "RelatedEntityFieldNames",
                "TransitiveObjectName",
                "TransitiveObjectMatchFieldNames",
                "TransitiveObjectOutputFieldName",
                "RelatedEntityJoinFieldName",
                "DisplayName",
                "DisplayLocation",
                "DisplayComponentID",
                "DisplayComponentConfiguration",
                "Sequence"
            )
        VALUES
            (
                p_ID,
                p_EntityOrganicKeyID,
                p_RelatedEntityID,
                p_RelatedEntityFieldNames,
                p_TransitiveObjectName,
                p_TransitiveObjectMatchFieldNames,
                p_TransitiveObjectOutputFieldName,
                p_RelatedEntityJoinFieldName,
                p_DisplayName,
                COALESCE(p_DisplayLocation, 'After Field Tabs'),
                p_DisplayComponentID,
                p_DisplayComponentConfiguration,
                COALESCE(p_Sequence, 0)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."EntityOrganicKeyRelatedEntity"
            (
                "EntityOrganicKeyID",
                "RelatedEntityID",
                "RelatedEntityFieldNames",
                "TransitiveObjectName",
                "TransitiveObjectMatchFieldNames",
                "TransitiveObjectOutputFieldName",
                "RelatedEntityJoinFieldName",
                "DisplayName",
                "DisplayLocation",
                "DisplayComponentID",
                "DisplayComponentConfiguration",
                "Sequence"
            )
        VALUES
            (
                p_EntityOrganicKeyID,
                p_RelatedEntityID,
                p_RelatedEntityFieldNames,
                p_TransitiveObjectName,
                p_TransitiveObjectMatchFieldNames,
                p_TransitiveObjectOutputFieldName,
                p_RelatedEntityJoinFieldName,
                p_DisplayName,
                COALESCE(p_DisplayLocation, 'After Field Tabs'),
                p_DisplayComponentID,
                p_DisplayComponentConfiguration,
                COALESCE(p_Sequence, 0)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwEntityOrganicKeyRelatedEntities" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityOrganicKeyRelatedEntity"(
    IN p_ID UUID,
    IN p_EntityOrganicKeyID UUID,
    IN p_RelatedEntityID UUID,
    IN p_RelatedEntityFieldNames VARCHAR(500),
    IN p_TransitiveObjectName VARCHAR(500),
    IN p_TransitiveObjectMatchFieldNames VARCHAR(500),
    IN p_TransitiveObjectOutputFieldName VARCHAR(255),
    IN p_RelatedEntityJoinFieldName VARCHAR(255),
    IN p_DisplayName VARCHAR(255),
    IN p_DisplayLocation VARCHAR(50),
    IN p_DisplayComponentID UUID,
    IN p_DisplayComponentConfiguration TEXT,
    IN p_Sequence INTEGER
)
RETURNS SETOF __mj."vwEntityOrganicKeyRelatedEntities" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."EntityOrganicKeyRelatedEntity"
    SET
        "EntityOrganicKeyID" = p_EntityOrganicKeyID,
        "RelatedEntityID" = p_RelatedEntityID,
        "RelatedEntityFieldNames" = p_RelatedEntityFieldNames,
        "TransitiveObjectName" = p_TransitiveObjectName,
        "TransitiveObjectMatchFieldNames" = p_TransitiveObjectMatchFieldNames,
        "TransitiveObjectOutputFieldName" = p_TransitiveObjectOutputFieldName,
        "RelatedEntityJoinFieldName" = p_RelatedEntityJoinFieldName,
        "DisplayName" = p_DisplayName,
        "DisplayLocation" = p_DisplayLocation,
        "DisplayComponentID" = p_DisplayComponentID,
        "DisplayComponentConfiguration" = p_DisplayComponentConfiguration,
        "Sequence" = p_Sequence
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwEntityOrganicKeyRelatedEntities" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwEntityOrganicKeyRelatedEntities" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityOrganicKeyRelatedEntity"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityOrganicKeyRelatedEntity"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateEntityOrganicKey_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateEntityOrganicKey" ON __mj."EntityOrganicKey";
CREATE TRIGGER "trgUpdateEntityOrganicKey"
    BEFORE UPDATE ON __mj."EntityOrganicKey"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateEntityOrganicKey_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateEntityOrganicKeyRelatedEntity_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateEntityOrganicKeyRelatedEntity" ON __mj."EntityOrganicKeyRelatedEntity";
CREATE TRIGGER "trgUpdateEntityOrganicKeyRelatedEntity"
    BEFORE UPDATE ON __mj."EntityOrganicKeyRelatedEntity"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateEntityOrganicKeyRelatedEntity_func"();


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
         '03716ac0-1509-471c-9159-c67d1be6971e',
         'MJ: Entity Organic Keys',
         'Entity Organic Keys',
         'Defines organic keys on entities — sets of fields that constitute natural identifiers for cross-system matching (e.g., email, phone, SSN). Enables related record views across integration boundaries without foreign keys.',
         NULL,
         'EntityOrganicKey',
         'vwEntityOrganicKeys',
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
/* SQL generated to add new entity MJ: Entity Organic Keys to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '03716ac0-1509-471c-9159-c67d1be6971e', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Entity Organic Keys for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('03716ac0-1509-471c-9159-c67d1be6971e', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Entity Organic Keys for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('03716ac0-1509-471c-9159-c67d1be6971e', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Entity Organic Keys for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('03716ac0-1509-471c-9159-c67d1be6971e', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL generated to create new entity MJ: Entity Organic Key Related Entities */

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
         'ed243f59-106c-4020-a334-5bad0ccf7987',
         'MJ: Entity Organic Key Related Entities',
         'Entity Organic Key Related Entities',
         'Maps a related entity to an organic key, defining how records are matched — either by direct field comparison or transitively via a SQL view/table that bridges multiple hops.',
         NULL,
         'EntityOrganicKeyRelatedEntity',
         'vwEntityOrganicKeyRelatedEntities',
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
/* SQL generated to add new entity MJ: Entity Organic Key Related Entities to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ed243f59-106c-4020-a334-5bad0ccf7987', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Entity Organic Key Related Entities for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('ed243f59-106c-4020-a334-5bad0ccf7987', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Entity Organic Key Related Entities for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('ed243f59-106c-4020-a334-5bad0ccf7987', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Entity Organic Key Related Entities for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('ed243f59-106c-4020-a334-5bad0ccf7987', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL text to add special date field __mj_CreatedAt to entity __mj."EntityOrganicKeyRelatedEntity" */

UPDATE __mj."EntityOrganicKeyRelatedEntity" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;
/* SQL text to add special date field __mj_CreatedAt to entity __mj."EntityOrganicKeyRelatedEntity" */

ALTER TABLE __mj."EntityOrganicKeyRelatedEntity" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."EntityOrganicKeyRelatedEntity" */

UPDATE __mj."EntityOrganicKeyRelatedEntity" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;
/* SQL text to add special date field __mj_UpdatedAt to entity __mj."EntityOrganicKeyRelatedEntity" */

ALTER TABLE __mj."EntityOrganicKeyRelatedEntity" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."EntityOrganicKeyRelatedEntity" */

UPDATE __mj."EntityOrganicKey" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;
/* SQL text to add special date field __mj_CreatedAt to entity __mj."EntityOrganicKey" */

ALTER TABLE __mj."EntityOrganicKey" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."EntityOrganicKey" */

UPDATE __mj."EntityOrganicKey" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;
/* SQL text to add special date field __mj_UpdatedAt to entity __mj."EntityOrganicKey" */

ALTER TABLE __mj."EntityOrganicKey" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."EntityOrganicKey" */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '83983333-ad6b-4979-94c1-54d11a0f230d' OR ("EntityID" = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND "Name" = 'ID')
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
        '83983333-ad6b-4979-94c1-54d11a0f230d',
        'ED243F59-106C-4020-A334-5BAD0CCF7987', -- "Entity": "MJ": "Entity" "Organic" Key "Related" "Entities"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8823d767-db27-4f35-b204-f585085cf840' OR ("EntityID" = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND "Name" = 'EntityOrganicKeyID')
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
        '8823d767-db27-4f35-b204-f585085cf840',
        'ED243F59-106C-4020-A334-5BAD0CCF7987', -- "Entity": "MJ": "Entity" "Organic" Key "Related" "Entities"
        100002,
        'EntityOrganicKeyID',
        'Entity Organic Key ID',
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
        '03716AC0-1509-471C-9159-C67D1BE6971E',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fbd92aee-b9a9-4ffe-9afd-23d08e2b9158' OR ("EntityID" = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND "Name" = 'RelatedEntityID')
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
        'fbd92aee-b9a9-4ffe-9afd-23d08e2b9158',
        'ED243F59-106C-4020-A334-5BAD0CCF7987', -- "Entity": "MJ": "Entity" "Organic" Key "Related" "Entities"
        100003,
        'RelatedEntityID',
        'Related Entity ID',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '79ab1e17-d3f7-4b12-839a-0e96ddd9bf7d' OR ("EntityID" = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND "Name" = 'RelatedEntityFieldNames')
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
        '79ab1e17-d3f7-4b12-839a-0e96ddd9bf7d',
        'ED243F59-106C-4020-A334-5BAD0CCF7987', -- "Entity": "MJ": "Entity" "Organic" Key "Related" "Entities"
        100004,
        'RelatedEntityFieldNames',
        'Related Entity Field Names',
        'Comma-delimited field names in the related entity, positionally matching MatchFieldNames on the parent key. NULL when using transitive matching.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b26c64a0-d7fe-4a76-820b-7ecb2420ccce' OR ("EntityID" = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND "Name" = 'TransitiveObjectName')
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
        'b26c64a0-d7fe-4a76-820b-7ecb2420ccce',
        'ED243F59-106C-4020-A334-5BAD0CCF7987', -- "Entity": "MJ": "Entity" "Organic" Key "Related" "Entities"
        100005,
        'TransitiveObjectName',
        'Transitive Object Name',
        'Schema-qualified name of a SQL view or table that bridges the organic key to the related entity (e.g., "dbo.vwContactRecipientBridge"). This object encapsulates any number of join hops. NULL for direct matches.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c50caa30-df0c-4d4a-bc24-772a0bb1cd7a' OR ("EntityID" = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND "Name" = 'TransitiveObjectMatchFieldNames')
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
        'c50caa30-df0c-4d4a-bc24-772a0bb1cd7a',
        'ED243F59-106C-4020-A334-5BAD0CCF7987', -- "Entity": "MJ": "Entity" "Organic" Key "Related" "Entities"
        100006,
        'TransitiveObjectMatchFieldNames',
        'Transitive Object Match Field Names',
        'Comma-delimited field names in the transitive object that match the organic key values, positionally aligned with MatchFieldNames. NULL for direct matches.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '97aaf30c-7b7d-4b42-abd6-35b8b73d4d4d' OR ("EntityID" = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND "Name" = 'TransitiveObjectOutputFieldName')
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
        '97aaf30c-7b7d-4b42-abd6-35b8b73d4d4d',
        'ED243F59-106C-4020-A334-5BAD0CCF7987', -- "Entity": "MJ": "Entity" "Organic" Key "Related" "Entities"
        100007,
        'TransitiveObjectOutputFieldName',
        'Transitive Object Output Field Name',
        'The field in the transitive object that produces the value to join against the related entity. NULL for direct matches.',
        'TEXT',
        510,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5346851e-131c-48c7-bebc-2562f358a90f' OR ("EntityID" = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND "Name" = 'RelatedEntityJoinFieldName')
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
        '5346851e-131c-48c7-bebc-2562f358a90f',
        'ED243F59-106C-4020-A334-5BAD0CCF7987', -- "Entity": "MJ": "Entity" "Organic" Key "Related" "Entities"
        100008,
        'RelatedEntityJoinFieldName',
        'Related Entity Join Field Name',
        'The field in the related entity that matches TransitiveObjectOutputFieldName. NULL for direct matches.',
        'TEXT',
        510,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd864a352-8165-4918-91c0-938488d9aab3' OR ("EntityID" = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND "Name" = 'DisplayName')
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
        'd864a352-8165-4918-91c0-938488d9aab3',
        'ED243F59-106C-4020-A334-5BAD0CCF7987', -- "Entity": "MJ": "Entity" "Organic" Key "Related" "Entities"
        100009,
        'DisplayName',
        'Display Name',
        'Tab/section label override. If NULL, defaults to the related entity''s display name.',
        'TEXT',
        510,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '608206c5-ace6-4f97-8656-56fbbb99f9bf' OR ("EntityID" = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND "Name" = 'DisplayLocation')
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
        '608206c5-ace6-4f97-8656-56fbbb99f9bf',
        'ED243F59-106C-4020-A334-5BAD0CCF7987', -- "Entity": "MJ": "Entity" "Organic" Key "Related" "Entities"
        100010,
        'DisplayLocation',
        'Display Location',
        'Where to render the organic key tab relative to FK relationship tabs. After Field Tabs or Before Field Tabs.',
        'TEXT',
        100,
        0,
        0,
        FALSE,
        'After Field Tabs',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '97087b14-68a4-4eec-9ba6-ac1de795c552' OR ("EntityID" = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND "Name" = 'DisplayComponentID')
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
        '97087b14-68a4-4eec-9ba6-ac1de795c552',
        'ED243F59-106C-4020-A334-5BAD0CCF7987', -- "Entity": "MJ": "Entity" "Organic" Key "Related" "Entities"
        100011,
        'DisplayComponentID',
        'Display Component ID',
        'FK to component registry for a custom display component. NULL uses the default EntityDataGrid.',
        'UUID',
        16,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '85caed4a-9f18-4b6e-a5fd-1f968ff3a53a' OR ("EntityID" = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND "Name" = 'DisplayComponentConfiguration')
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
        '85caed4a-9f18-4b6e-a5fd-1f968ff3a53a',
        'ED243F59-106C-4020-A334-5BAD0CCF7987', -- "Entity": "MJ": "Entity" "Organic" Key "Related" "Entities"
        100012,
        'DisplayComponentConfiguration',
        'Display Component Configuration',
        'JSON configuration passed to the display component.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '96d996f0-ef09-4acf-adc8-67635eb4f0c6' OR ("EntityID" = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND "Name" = 'Sequence')
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
        '96d996f0-ef09-4acf-adc8-67635eb4f0c6',
        'ED243F59-106C-4020-A334-5BAD0CCF7987', -- "Entity": "MJ": "Entity" "Organic" Key "Related" "Entities"
        100013,
        'Sequence',
        'Sequence',
        'Tab ordering within this organic key''s related entities. Lower values appear first.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4d0e6469-e42c-4b1c-88d3-1fd33b07e253' OR ("EntityID" = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND "Name" = '__mj_CreatedAt')
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
        '4d0e6469-e42c-4b1c-88d3-1fd33b07e253',
        'ED243F59-106C-4020-A334-5BAD0CCF7987', -- "Entity": "MJ": "Entity" "Organic" Key "Related" "Entities"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a6ac76c8-59e4-4978-bad6-5f9fbcbfe649' OR ("EntityID" = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND "Name" = '__mj_UpdatedAt')
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
        'a6ac76c8-59e4-4978-bad6-5f9fbcbfe649',
        'ED243F59-106C-4020-A334-5BAD0CCF7987', -- "Entity": "MJ": "Entity" "Organic" Key "Related" "Entities"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bd963c32-d465-47d2-b08b-1a21dfc1e577' OR ("EntityID" = '03716AC0-1509-471C-9159-C67D1BE6971E' AND "Name" = 'ID')
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
        'bd963c32-d465-47d2-b08b-1a21dfc1e577',
        '03716AC0-1509-471C-9159-C67D1BE6971E', -- "Entity": "MJ": "Entity" "Organic" "Keys"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9e5658b0-59ab-49c9-bc9f-efd91c00a789' OR ("EntityID" = '03716AC0-1509-471C-9159-C67D1BE6971E' AND "Name" = 'EntityID')
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
        '9e5658b0-59ab-49c9-bc9f-efd91c00a789',
        '03716AC0-1509-471C-9159-C67D1BE6971E', -- "Entity": "MJ": "Entity" "Organic" "Keys"
        100002,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cd56f3e1-ed5f-43e0-b5bf-d34e268f3e6b' OR ("EntityID" = '03716AC0-1509-471C-9159-C67D1BE6971E' AND "Name" = 'Name')
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
        'cd56f3e1-ed5f-43e0-b5bf-d34e268f3e6b',
        '03716AC0-1509-471C-9159-C67D1BE6971E', -- "Entity": "MJ": "Entity" "Organic" "Keys"
        100003,
        'Name',
        'Name',
        'Human-readable label for this organic key (e.g., "Email Match", "SSN Match"). Must be unique per entity.',
        'TEXT',
        510,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'db3a2c89-6e45-4a78-8bde-3e222b5ab2c7' OR ("EntityID" = '03716AC0-1509-471C-9159-C67D1BE6971E' AND "Name" = 'Description')
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
        'db3a2c89-6e45-4a78-8bde-3e222b5ab2c7',
        '03716AC0-1509-471C-9159-C67D1BE6971E', -- "Entity": "MJ": "Entity" "Organic" "Keys"
        100004,
        'Description',
        'Description',
        'Optional explanation of the key''s purpose and matching semantics.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9c395cf1-c60d-485e-926f-894bc1f43ac8' OR ("EntityID" = '03716AC0-1509-471C-9159-C67D1BE6971E' AND "Name" = 'MatchFieldNames')
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
        '9c395cf1-c60d-485e-926f-894bc1f43ac8',
        '03716AC0-1509-471C-9159-C67D1BE6971E', -- "Entity": "MJ": "Entity" "Organic" "Keys"
        100005,
        'MatchFieldNames',
        'Match Field Names',
        'Comma-delimited field names in the owning entity that constitute the key. Single value for simple keys (e.g., "EmailAddress"), multiple for compound keys (e.g., "FirstName,LastName,DateOfBirth"). Field names must match EntityField."Name" values.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '93fa954e-8112-435f-a544-f9c91534b64b' OR ("EntityID" = '03716AC0-1509-471C-9159-C67D1BE6971E' AND "Name" = 'NormalizationStrategy')
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
        '93fa954e-8112-435f-a544-f9c91534b64b',
        '03716AC0-1509-471C-9159-C67D1BE6971E', -- "Entity": "MJ": "Entity" "Organic" "Keys"
        100006,
        'NormalizationStrategy',
        'Normalization Strategy',
        'How field values are normalized before comparison. LowerCaseTrim = LOWER(TRIM(x)), Trim = TRIM(x), ExactMatch = no transformation, Custom = uses CustomNormalizationExpression.',
        'TEXT',
        100,
        0,
        0,
        FALSE,
        'LowerCaseTrim',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6cde899d-3a4f-4b24-b566-9d8ab7445c06' OR ("EntityID" = '03716AC0-1509-471C-9159-C67D1BE6971E' AND "Name" = 'CustomNormalizationExpression')
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
        '6cde899d-3a4f-4b24-b566-9d8ab7445c06',
        '03716AC0-1509-471C-9159-C67D1BE6971E', -- "Entity": "MJ": "Entity" "Organic" "Keys"
        100007,
        'CustomNormalizationExpression',
        'Custom Normalization Expression',
        'SQL expression template when NormalizationStrategy is Custom. Uses {{FieldName}} as placeholder. Example: "REPLACE(REPLACE({{FieldName}}, ''-'', ''''), '' '', '''')" for phone number normalization.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ffcb358c-c3a6-43a3-ad6f-cc8e5edc85db' OR ("EntityID" = '03716AC0-1509-471C-9159-C67D1BE6971E' AND "Name" = 'AutoCreateRelatedViewOnForm')
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
        'ffcb358c-c3a6-43a3-ad6f-cc8e5edc85db',
        '03716AC0-1509-471C-9159-C67D1BE6971E', -- "Entity": "MJ": "Entity" "Organic" "Keys"
        100008,
        'AutoCreateRelatedViewOnForm',
        'Auto Create Related View On Form',
        'When true, a future discovery process will automatically scan entities and create EntityOrganicKeyRelatedEntity rows for entities with matching field patterns.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e15be827-03ea-478c-a8ac-07510c14b69c' OR ("EntityID" = '03716AC0-1509-471C-9159-C67D1BE6971E' AND "Name" = 'Sequence')
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
        'e15be827-03ea-478c-a8ac-07510c14b69c',
        '03716AC0-1509-471C-9159-C67D1BE6971E', -- "Entity": "MJ": "Entity" "Organic" "Keys"
        100009,
        'Sequence',
        'Sequence',
        'Ordering when an entity has multiple organic keys. Lower values = higher priority.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7bf9464a-ae37-4710-983e-666806542ab6' OR ("EntityID" = '03716AC0-1509-471C-9159-C67D1BE6971E' AND "Name" = 'Status')
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
        '7bf9464a-ae37-4710-983e-666806542ab6',
        '03716AC0-1509-471C-9159-C67D1BE6971E', -- "Entity": "MJ": "Entity" "Organic" "Keys"
        100010,
        'Status',
        'Status',
        'Active or Disabled. Disabled keys are ignored at runtime.',
        'TEXT',
        40,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '71dba4a8-0884-4914-915a-c191e40aa1a1' OR ("EntityID" = '03716AC0-1509-471C-9159-C67D1BE6971E' AND "Name" = '__mj_CreatedAt')
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
        '71dba4a8-0884-4914-915a-c191e40aa1a1',
        '03716AC0-1509-471C-9159-C67D1BE6971E', -- "Entity": "MJ": "Entity" "Organic" "Keys"
        100011,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '30c05840-bd02-41d7-84df-de9a8718ce98' OR ("EntityID" = '03716AC0-1509-471C-9159-C67D1BE6971E' AND "Name" = '__mj_UpdatedAt')
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
        '30c05840-bd02-41d7-84df-de9a8718ce98',
        '03716AC0-1509-471C-9159-C67D1BE6971E', -- "Entity": "MJ": "Entity" "Organic" "Keys"
        100012,
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
                                       ('d3650e04-c312-4997-b437-d63512d4b4f5', '93FA954E-8112-435F-A544-F9C91534B64B', 1, 'Custom', 'Custom', NOW(), NOW());
/* SQL text to insert entity field value with ID 41fcf708-179f-454e-b5bc-1d53a4495ba2 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('41fcf708-179f-454e-b5bc-1d53a4495ba2', '93FA954E-8112-435F-A544-F9C91534B64B', 2, 'ExactMatch', 'ExactMatch', NOW(), NOW());
/* SQL text to insert entity field value with ID d883f0e1-416f-4d2e-b5fc-d607873f1f7b */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('d883f0e1-416f-4d2e-b5fc-d607873f1f7b', '93FA954E-8112-435F-A544-F9C91534B64B', 3, 'LowerCaseTrim', 'LowerCaseTrim', NOW(), NOW());
/* SQL text to insert entity field value with ID 26222ecc-29f6-4b59-8816-ca3c3a549f32 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('26222ecc-29f6-4b59-8816-ca3c3a549f32', '93FA954E-8112-435F-A544-F9C91534B64B', 4, 'Trim', 'Trim', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID 93FA954E-8112-435F-A544-F9C91534B64B */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='93FA954E-8112-435F-A544-F9C91534B64B';
/* SQL text to insert entity field value with ID 76226f83-8e2f-4328-93ee-8cfb97ee472f */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('76226f83-8e2f-4328-93ee-8cfb97ee472f', '7BF9464A-AE37-4710-983E-666806542AB6', 1, 'Active', 'Active', NOW(), NOW());
/* SQL text to insert entity field value with ID db63811e-b58c-4948-a335-e36b82c53134 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('db63811e-b58c-4948-a335-e36b82c53134', '7BF9464A-AE37-4710-983E-666806542AB6', 2, 'Disabled', 'Disabled', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID 7BF9464A-AE37-4710-983E-666806542AB6 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='7BF9464A-AE37-4710-983E-666806542AB6';
/* SQL text to insert entity field value with ID 32dfcbbb-5c39-48e4-afb0-b2f258e490fb */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('32dfcbbb-5c39-48e4-afb0-b2f258e490fb', '608206C5-ACE6-4F97-8656-56FBBB99F9BF', 1, 'After Field Tabs', 'After Field Tabs', NOW(), NOW());
/* SQL text to insert entity field value with ID e79adea9-c24e-4fa8-8ab1-2e419faccd46 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('e79adea9-c24e-4fa8-8ab1-2e419faccd46', '608206C5-ACE6-4F97-8656-56FBBB99F9BF', 2, 'Before Field Tabs', 'Before Field Tabs', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID 608206C5-ACE6-4F97-8656-56FBBB99F9BF */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='608206C5-ACE6-4F97-8656-56FBBB99F9BF';
/* Create Entity Relationship: MJ: Entities -> MJ: Entity Organic Key Related Entities (One To Many via RelatedEntityID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '466af6ae-fa39-4ead-b207-0754bd13305a'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('466af6ae-fa39-4ead-b207-0754bd13305a', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ED243F59-106C-4020-A334-5BAD0CCF7987', 'RelatedEntityID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'ca92f539-c6df-4fef-a4d3-58a04bb84084'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('ca92f539-c6df-4fef-a4d3-58a04bb84084', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '03716AC0-1509-471C-9159-C67D1BE6971E', 'EntityID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'f5cd9fe7-de1c-4b34-9361-a0067110c479'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('f5cd9fe7-de1c-4b34-9361-a0067110c479', '03716AC0-1509-471C-9159-C67D1BE6971E', 'ED243F59-106C-4020-A334-5BAD0CCF7987', 'EntityOrganicKeyID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c3f536c9-3559-4916-a833-4e51a7cac5db' OR ("EntityID" = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND "Name" = 'EntityOrganicKey')
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
        'c3f536c9-3559-4916-a833-4e51a7cac5db',
        'ED243F59-106C-4020-A334-5BAD0CCF7987', -- "Entity": "MJ": "Entity" "Organic" Key "Related" "Entities"
        100031,
        'EntityOrganicKey',
        'Entity Organic Key',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b532133e-d742-4d4d-95e2-e3fad228bae8' OR ("EntityID" = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND "Name" = 'RelatedEntity')
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
        'b532133e-d742-4d4d-95e2-e3fad228bae8',
        'ED243F59-106C-4020-A334-5BAD0CCF7987', -- "Entity": "MJ": "Entity" "Organic" Key "Related" "Entities"
        100032,
        'RelatedEntity',
        'Related Entity',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '01a093f5-9743-457b-ac21-b862a0236693' OR ("EntityID" = '03716AC0-1509-471C-9159-C67D1BE6971E' AND "Name" = 'Entity')
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
        '01a093f5-9743-457b-ac21-b862a0236693',
        '03716AC0-1509-471C-9159-C67D1BE6971E', -- "Entity": "MJ": "Entity" "Organic" "Keys"
        100025,
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
               WHERE "ID" = '9C395CF1-C60D-485E-926F-894BC1F43AC8'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'E15BE827-03EA-478C-A8AC-07510C14B69C'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '7BF9464A-AE37-4710-983E-666806542AB6'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '01A093F5-9743-457B-AC21-B862A0236693'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'DB3A2C89-6E45-4A78-8BDE-3E222B5AB2C7'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '9C395CF1-C60D-485E-926F-894BC1F43AC8'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '01A093F5-9743-457B-AC21-B862A0236693'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
            SET "IsNameField" = TRUE
            WHERE "ID" = 'B532133E-D742-4D4D-95E2-E3FAD228BAE8'
            AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'D864A352-8165-4918-91C0-938488D9AAB3'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '608206C5-ACE6-4F97-8656-56FBBB99F9BF'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '96D996F0-EF09-4ACF-ADC8-67635EB4F0C6'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'C3F536C9-3559-4916-A833-4E51A7CAC5DB'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'B532133E-D742-4D4D-95E2-E3FAD228BAE8'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'B26C64A0-D7FE-4A76-820B-7ECB2420CCCE'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'D864A352-8165-4918-91C0-938488D9AAB3'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'C3F536C9-3559-4916-A833-4E51A7CAC5DB'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'B532133E-D742-4D4D-95E2-E3FAD228BAE8'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set categories for 13 fields */
-- UPDATE Entity Field Category Info MJ: Entity Organic Keys."EntityID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Key Identity',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9E5658B0-59AB-49C9-BC9F-EFD91C00A789' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Keys."Entity"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Key Identity',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '01A093F5-9743-457B-AC21-B862A0236693' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Keys."Name"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Key Identity',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CD56F3E1-ED5F-43E0-B5BF-D34E268F3E6B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Keys."Description"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Key Identity',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DB3A2C89-6E45-4A78-8BDE-3E222B5AB2C7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Keys."MatchFieldNames"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Matching Logic',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Match Fields',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9C395CF1-C60D-485E-926F-894BC1F43AC8' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Keys."NormalizationStrategy"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Matching Logic',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '93FA954E-8112-435F-A544-F9C91534B64B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Keys."CustomNormalizationExpression"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Matching Logic',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'SQL'
WHERE 
   "ID" = '6CDE899D-3A4F-4B24-B566-9D8AB7445C06' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Keys."AutoCreateRelatedViewOnForm"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Configuration & Priority',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Auto Create Related View',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FFCB358C-C3A6-43A3-AD6F-CC8E5EDC85DB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Keys."Sequence"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Configuration & Priority',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E15BE827-03EA-478C-A8AC-07510C14B69C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Keys."Status"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Configuration & Priority',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7BF9464A-AE37-4710-983E-666806542AB6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Keys."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BD963C32-D465-47D2-B08B-1A21DFC1E577' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Keys.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '71DBA4A8-0884-4914-915A-C191E40AA1A1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Keys.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '30C05840-BD02-41D7-84DF-DE9A8718CE98' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-fingerprint */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-fingerprint', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '03716AC0-1509-471C-9159-C67D1BE6971E';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('6457de0c-779d-4d60-adf1-ea41e373150d', '03716AC0-1509-471C-9159-C67D1BE6971E', 'FieldCategoryInfo', '{"Key Identity":{"icon":"fa fa-id-card","description":"Basic identification and descriptive information for the organic key"},"Matching Logic":{"icon":"fa fa-equals","description":"Technical settings defining which fields are matched and how they are normalized"},"Configuration & Priority":{"icon":"fa fa-sliders-h","description":"Operational settings including status, evaluation order, and automation triggers"},"System Metadata":{"icon":"fa fa-cog","description":"Internal system identifiers and audit timestamps"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('aa24ffa7-b467-4421-ac3e-a6da4f4552ac', '03716AC0-1509-471C-9159-C67D1BE6971E', 'FieldCategoryIcons', '{"Key Identity":"fa fa-id-card","Matching Logic":"fa fa-equals","Configuration & Priority":"fa fa-sliders-h","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '03716AC0-1509-471C-9159-C67D1BE6971E';
/* Set categories for 17 fields */
-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities."EntityOrganicKeyID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Entity Mapping',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Organic Key ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8823D767-DB27-4F35-B204-F585085CF840' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities."RelatedEntityID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Entity Mapping',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FBD92AEE-B9A9-4FFE-9AFD-23D08E2B9158' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities."EntityOrganicKey"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Entity Mapping',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Organic Key',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C3F536C9-3559-4916-A833-4E51A7CAC5DB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities."RelatedEntity"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Entity Mapping',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B532133E-D742-4D4D-95E2-E3FAD228BAE8' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities."RelatedEntityFieldNames"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Matching Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Related Entity Fields',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '79AB1E17-D3F7-4B12-839A-0E96DDD9BF7D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities."TransitiveObjectName"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Matching Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B26C64A0-D7FE-4A76-820B-7ECB2420CCCE' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities."TransitiveObjectMatchFieldNames"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Matching Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Transitive Match Fields',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C50CAA30-DF0C-4D4A-BC24-772A0BB1CD7A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities."TransitiveObjectOutputFieldName"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Matching Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Transitive Output Field',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '97AAF30C-7B7D-4B42-ABD6-35B8B73D4D4D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities."RelatedEntityJoinFieldName"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Matching Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Related Entity Join Field',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5346851E-131C-48C7-BEBC-2562F358A90F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities."DisplayName"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Display Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D864A352-8165-4918-91C0-938488D9AAB3' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities."DisplayLocation"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Display Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '608206C5-ACE6-4F97-8656-56FBBB99F9BF' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities."DisplayComponentID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Display Settings',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Display Component',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '97087B14-68A4-4EEC-9BA6-AC1DE795C552' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities."DisplayComponentConfiguration"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Display Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '85CAED4A-9F18-4B6E-A5FD-1F968FF3A53A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities."Sequence"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Display Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '96D996F0-EF09-4ACF-ADC8-67635EB4F0C6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '83983333-AD6B-4979-94C1-54D11A0F230D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4D0E6469-E42C-4B1C-88D3-1FD33B07E253' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A6AC76C8-59E4-4978-BAD6-5F9FBCBFE649' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-project-diagram */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-project-diagram', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = 'ED243F59-106C-4020-A334-5BAD0CCF7987';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('d12713e5-a81b-430c-8951-7f9d0db64936', 'ED243F59-106C-4020-A334-5BAD0CCF7987', 'FieldCategoryInfo', '{"Entity Mapping":{"icon":"fa fa-link","description":"Core identifiers and names linking the organic key to its related entities"},"Matching Configuration":{"icon":"fa fa-cogs","description":"Technical settings defining how records are matched, including direct and transitive SQL logic"},"Display Settings":{"icon":"fa fa-desktop","description":"UI presentation settings including labels, locations, custom components, and ordering"},"System Metadata":{"icon":"fa fa-database","description":"System-managed identifiers and audit timestamps"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('d57a9541-0023-44d9-a90a-9230810c51aa', 'ED243F59-106C-4020-A334-5BAD0CCF7987', 'FieldCategoryIcons', '{"Entity Mapping":"fa fa-link","Matching Configuration":"fa fa-cogs","Display Settings":"fa fa-desktop","System Metadata":"fa fa-database"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = 'ED243F59-106C-4020-A334-5BAD0CCF7987';
/* Generated Validation Functions for MJ: Entity Organic Key Related Entities */
-- CHECK constraint for MJ: Entity Organic Key Related Entities @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function

INSERT INTO __mj."GeneratedCode" ("CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
                      VALUES ((SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), '7B31F48E-EDA3-47B4-9602-D98B7EB1AF45', NOW(), 'TypeScript','Approved', '([RelatedEntityFieldNames] IS NOT NULL AND [TransitiveObjectName] IS NULL AND [TransitiveObjectMatchFieldNames] IS NULL AND [TransitiveObjectOutputFieldName] IS NULL AND [RelatedEntityJoinFieldName] IS NULL OR [RelatedEntityFieldNames] IS NULL AND [TransitiveObjectName] IS NOT NULL AND [TransitiveObjectMatchFieldNames] IS NOT NULL AND [TransitiveObjectOutputFieldName] IS NOT NULL AND [RelatedEntityJoinFieldName] IS NOT NULL)', 'public ValidateRelatedEntityOrTransitiveMapping(result: ValidationResult) {
	const hasRelatedFields = this."RelatedEntityFieldNames" != null;
	const hasTransitiveName = this."TransitiveObjectName" != null;
	const hasTransitiveMatch = this."TransitiveObjectMatchFieldNames" != null;
	const hasTransitiveOutput = this."TransitiveObjectOutputFieldName" != null;
	const hasJoinField = this."RelatedEntityJoinFieldName" != null;

	// Option 1: Only RelatedEntityFieldNames is provided
	const isDirectMapping = hasRelatedFields && !hasTransitiveName && !hasTransitiveMatch && !hasTransitiveOutput && !hasJoinField;
	
	// Option 2: All transitive fields are provided and RelatedEntityFieldNames is null
	const isTransitiveMapping = !hasRelatedFields && hasTransitiveName && hasTransitiveMatch && hasTransitiveOutput && hasJoinField;

	if (!isDirectMapping && !isTransitiveMapping) {
		result."Errors".push(new ValidationErrorInfo(
			"RelatedEntityFieldNames",
			"You must provide either only the Related Entity Field Names OR a complete set of Transitive Object fields (Object Name, Match Fields, Output Field, and Join Field). Partial or overlapping configurations are not allowed.",
			this."RelatedEntityFieldNames",
			ValidationErrorType."Failure"
		));
	}
}', 'To ensure clear data mapping, you must define a relationship using either the Related Entity Field Names or a complete Transitive Object configuration. This constraint prevents ambiguous setups by ensuring that only one of these two methods is used and that all required fields for a transitive relationship are provided together.', 'ValidateRelatedEntityOrTransitiveMapping', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ED243F59-106C-4020-A334-5BAD0CCF7987');


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwEntityOrganicKeys" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Entity Organic Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Organic Keys
-- Item: Permissions for vwEntityOrganicKeys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwEntityOrganicKeys" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Entity Organic Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Organic Keys
-- Item: spCreateEntityOrganicKey
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityOrganicKey
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntityOrganicKey" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Entity Organic Keys */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntityOrganicKey" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Entity Organic Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Organic Keys
-- Item: spUpdateEntityOrganicKey
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityOrganicKey
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityOrganicKey" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityOrganicKey" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Organic Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Organic Keys
-- Item: spDeleteEntityOrganicKey
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityOrganicKey
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityOrganicKey" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Organic Keys */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityOrganicKey" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to update entity field related entity name field map for entity field ID FBD92AEE-B9A9-4FFE-9AFD-23D08E2B9158 */

DO $$ BEGIN GRANT SELECT ON __mj."vwEntityOrganicKeyRelatedEntities" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Entity Organic Key Related Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Organic Key Related Entities
-- Item: Permissions for vwEntityOrganicKeyRelatedEntities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwEntityOrganicKeyRelatedEntities" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Entity Organic Key Related Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Organic Key Related Entities
-- Item: spCreateEntityOrganicKeyRelatedEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityOrganicKeyRelatedEntity
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntityOrganicKeyRelatedEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Entity Organic Key Related Entities */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntityOrganicKeyRelatedEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Entity Organic Key Related Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Organic Key Related Entities
-- Item: spUpdateEntityOrganicKeyRelatedEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityOrganicKeyRelatedEntity
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityOrganicKeyRelatedEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityOrganicKeyRelatedEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Organic Key Related Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Organic Key Related Entities
-- Item: spDeleteEntityOrganicKeyRelatedEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityOrganicKeyRelatedEntity
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityOrganicKeyRelatedEntity" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Organic Key Related Entities */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityOrganicKeyRelatedEntity" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */


-- ===================== Comments =====================

COMMENT ON TABLE __mj."EntityOrganicKey" IS 'Defines organic keys on entities — sets of fields that constitute natural identifiers for cross-system matching (e.g., email, phone, SSN). Enables related record views across integration boundaries without foreign keys.';

COMMENT ON COLUMN __mj."EntityOrganicKey"."Name" IS 'Human-readable label for this organic key (e.g., "Email Match", "SSN Match"). Must be unique per entity.';

COMMENT ON COLUMN __mj."EntityOrganicKey"."Description" IS 'Optional explanation of the key';

COMMENT ON COLUMN __mj."EntityOrganicKey"."MatchFieldNames" IS 'Comma-delimited field names in the owning entity that constitute the key. Single value for simple keys (e.g., "EmailAddress"), multiple for compound keys (e.g., "FirstName,LastName,DateOfBirth"). Field names must match EntityField."Name" values.';

COMMENT ON COLUMN __mj."EntityOrganicKey"."NormalizationStrategy" IS 'How field values are normalized before comparison. LowerCaseTrim = LOWER(TRIM(x)), Trim = TRIM(x), ExactMatch = no transformation, Custom = uses CustomNormalizationExpression.';

COMMENT ON COLUMN __mj."EntityOrganicKey"."CustomNormalizationExpression" IS 'SQL expression template when NormalizationStrategy is Custom. Uses {{FieldName}} as placeholder. Example: "REPLACE(REPLACE({{FieldName}}, ';

COMMENT ON COLUMN __mj."EntityOrganicKey"."AutoCreateRelatedViewOnForm" IS 'When true, a future discovery process will automatically scan entities and create EntityOrganicKeyRelatedEntity rows for entities with matching field patterns.';

COMMENT ON COLUMN __mj."EntityOrganicKey"."Sequence" IS 'Ordering when an entity has multiple organic keys. Lower values = higher priority.';

COMMENT ON COLUMN __mj."EntityOrganicKey"."Status" IS 'Active or Disabled. Disabled keys are ignored at runtime.';

COMMENT ON TABLE __mj."EntityOrganicKeyRelatedEntity" IS 'Maps a related entity to an organic key, defining how records are matched — either by direct field comparison or transitively via a SQL view/table that bridges multiple hops.';

COMMENT ON COLUMN __mj."EntityOrganicKeyRelatedEntity"."RelatedEntityFieldNames" IS 'Comma-delimited field names in the related entity, positionally matching MatchFieldNames on the parent key. NULL when using transitive matching.';

COMMENT ON COLUMN __mj."EntityOrganicKeyRelatedEntity"."TransitiveObjectName" IS 'Schema-qualified name of a SQL view or table that bridges the organic key to the related entity (e.g., "dbo.vwContactRecipientBridge"). This object encapsulates any number of join hops. NULL for direct matches.';

COMMENT ON COLUMN __mj."EntityOrganicKeyRelatedEntity"."TransitiveObjectMatchFieldNames" IS 'Comma-delimited field names in the transitive object that match the organic key values, positionally aligned with MatchFieldNames. NULL for direct matches.';

COMMENT ON COLUMN __mj."EntityOrganicKeyRelatedEntity"."TransitiveObjectOutputFieldName" IS 'The field in the transitive object that produces the value to join against the related entity. NULL for direct matches.';

COMMENT ON COLUMN __mj."EntityOrganicKeyRelatedEntity"."RelatedEntityJoinFieldName" IS 'The field in the related entity that matches TransitiveObjectOutputFieldName. NULL for direct matches.';

COMMENT ON COLUMN __mj."EntityOrganicKeyRelatedEntity"."DisplayName" IS 'Tab/section label override. If NULL, defaults to the related entity';

COMMENT ON COLUMN __mj."EntityOrganicKeyRelatedEntity"."DisplayLocation" IS 'Where to render the organic key tab relative to FK relationship tabs. After Field Tabs or Before Field Tabs.';

COMMENT ON COLUMN __mj."EntityOrganicKeyRelatedEntity"."DisplayComponentID" IS 'FK to component registry for a custom display component. NULL uses the default EntityDataGrid.';

COMMENT ON COLUMN __mj."EntityOrganicKeyRelatedEntity"."DisplayComponentConfiguration" IS 'JSON configuration passed to the display component.';

COMMENT ON COLUMN __mj."EntityOrganicKeyRelatedEntity"."Sequence" IS 'Tab ordering within this organic key';


-- ===================== Other =====================

-- Migration: Add EntityOrganicKey and EntityOrganicKeyRelatedEntity tables
-- Description: Introduces "Organic Keys" — cross-entity relationships based on shared
--              business data (email, phone, SSN, etc.) rather than foreign key references.
--              Enables automatic "related records" views across integration boundaries.

-- Table 1: EntityOrganicKey
-- Defines an organic key on an entity — the set of fields that constitute a natural
-- identifier for cross-system matching.

/* spUpdate Permissions for MJ: Entity Organic Keys */

/* spUpdate Permissions for MJ: Entity Organic Key Related Entities */
