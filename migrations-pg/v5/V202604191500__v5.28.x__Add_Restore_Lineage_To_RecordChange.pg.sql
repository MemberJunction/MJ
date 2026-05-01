
-- ===================== DDL: Tables, PKs, Indexes =====================

-- Manual fix: the converter places ALTER TABLE ADD COLUMN (with FK REFERENCES)
-- in the FK/CHECK section, which runs AFTER indexes and functions. That order
-- breaks when the new column is referenced by the CREATE INDEX below and the
-- CREATE FUNCTION later. Add the columns first.
ALTER TABLE __mj."RecordChange"
 ADD COLUMN "RestoredFromID" UUID NULL,
 ADD COLUMN "RestoreReason" TEXT NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_RecordChange_EntityID" ON __mj."RecordChange" ("EntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_RecordChange_UserID" ON __mj."RecordChange" ("UserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_RecordChange_ReplayRunID" ON __mj."RecordChange" ("ReplayRunID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_RecordChange_IntegrationID" ON __mj."RecordChange" ("IntegrationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_RecordChange_RestoredFromID" ON __mj."RecordChange" ("RestoredFromID");


-- ===================== Helper Functions (fn*) =====================

CREATE OR REPLACE FUNCTION __mj."fnRecordChangeRestoredFromID_GetRootID"(
    p_RecordID UUID,
    p_ParentID UUID
)
RETURNS TABLE("RootID" UUID) AS $$
WITH RECURSIVE CTE_RootParent AS (
        SELECT
            "ID",
            "RestoredFromID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."RecordChange"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        SELECT
            c."ID",
            c."RestoredFromID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."RecordChange" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."RestoredFromID"
        WHERE
            p."Depth" < 100
    )
    SELECT         "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "RestoredFromID" IS NULL
    ORDER BY
        "RootParentID"

LIMIT 1
$$ LANGUAGE sql;


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwRecordChanges';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwRecordChanges"
AS SELECT
    r.*,
    "MJEntity_EntityID"."Name" AS "Entity",
    "MJUser_UserID"."Name" AS "User",
    "MJRecordChangeReplayRun_ReplayRunID"."User" AS "ReplayRun",
    "MJIntegration_IntegrationID"."Name" AS "Integration",
    "MJRecordChange_RestoredFromID"."ChangesDescription" AS "RestoredFrom",
    "root_RestoredFromID"."RootID" AS "RootRestoredFromID"
FROM
    __mj."RecordChange" AS r
INNER JOIN
    __mj."Entity" AS "MJEntity_EntityID"
  ON
    r."EntityID" = "MJEntity_EntityID"."ID"
INNER JOIN
    __mj."User" AS "MJUser_UserID"
  ON
    r."UserID" = "MJUser_UserID"."ID"
LEFT OUTER JOIN
    __mj."vwRecordChangeReplayRuns" AS "MJRecordChangeReplayRun_ReplayRunID"
  ON
    r."ReplayRunID" = "MJRecordChangeReplayRun_ReplayRunID"."ID"
LEFT OUTER JOIN
    __mj."Integration" AS "MJIntegration_IntegrationID"
  ON
    r."IntegrationID" = "MJIntegration_IntegrationID"."ID"
LEFT OUTER JOIN
    __mj."RecordChange" AS "MJRecordChange_RestoredFromID"
  ON
    r."RestoredFromID" = "MJRecordChange_RestoredFromID"."ID"
LEFT JOIN LATERAL (SELECT * FROM __mj."fnRecordChangeRestoredFromID_GetRootID"(r."ID", r."RestoredFromID")) AS "root_RestoredFromID" ON TRUE$vsql$;
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

CREATE OR REPLACE FUNCTION __mj."spCreateRecordChange"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_RecordID VARCHAR(750) DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_Type VARCHAR(20) DEFAULT NULL,
    IN p_Source VARCHAR(20) DEFAULT NULL,
    IN p_ChangedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_ChangesJSON TEXT DEFAULT NULL,
    IN p_ChangesDescription TEXT DEFAULT NULL,
    IN p_FullRecordJSON TEXT DEFAULT NULL,
    IN p_Status VARCHAR(50) DEFAULT NULL,
    IN p_ErrorLog TEXT DEFAULT NULL,
    IN p_ReplayRunID UUID DEFAULT NULL,
    IN p_IntegrationID UUID DEFAULT NULL,
    IN p_Comments TEXT DEFAULT NULL,
    IN p_RestoredFromID UUID DEFAULT NULL,
    IN p_RestoreReason TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwRecordChanges" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."RecordChange"
            (
                "ID",
                "EntityID",
                "RecordID",
                "UserID",
                "Type",
                "Source",
                "ChangedAt",
                "ChangesJSON",
                "ChangesDescription",
                "FullRecordJSON",
                "Status",
                "ErrorLog",
                "ReplayRunID",
                "IntegrationID",
                "Comments",
                "RestoredFromID",
                "RestoreReason"
            )
        VALUES
            (
                p_ID,
                p_EntityID,
                p_RecordID,
                p_UserID,
                COALESCE(p_Type, 'Create'),
                COALESCE(p_Source, 'Internal'),
                COALESCE(p_ChangedAt, NOW()),
                p_ChangesJSON,
                p_ChangesDescription,
                p_FullRecordJSON,
                COALESCE(p_Status, 'Complete'),
                p_ErrorLog,
                p_ReplayRunID,
                p_IntegrationID,
                p_Comments,
                p_RestoredFromID,
                p_RestoreReason
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."RecordChange"
            (
                "EntityID",
                "RecordID",
                "UserID",
                "Type",
                "Source",
                "ChangedAt",
                "ChangesJSON",
                "ChangesDescription",
                "FullRecordJSON",
                "Status",
                "ErrorLog",
                "ReplayRunID",
                "IntegrationID",
                "Comments",
                "RestoredFromID",
                "RestoreReason"
            )
        VALUES
            (
                p_EntityID,
                p_RecordID,
                p_UserID,
                COALESCE(p_Type, 'Create'),
                COALESCE(p_Source, 'Internal'),
                COALESCE(p_ChangedAt, NOW()),
                p_ChangesJSON,
                p_ChangesDescription,
                p_FullRecordJSON,
                COALESCE(p_Status, 'Complete'),
                p_ErrorLog,
                p_ReplayRunID,
                p_IntegrationID,
                p_Comments,
                p_RestoredFromID,
                p_RestoreReason
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwRecordChanges" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateRecordChange"(
    IN p_ID UUID,
    IN p_EntityID UUID,
    IN p_RecordID VARCHAR(750),
    IN p_UserID UUID,
    IN p_Type VARCHAR(20),
    IN p_Source VARCHAR(20),
    IN p_ChangedAt TIMESTAMPTZ,
    IN p_ChangesJSON TEXT,
    IN p_ChangesDescription TEXT,
    IN p_FullRecordJSON TEXT,
    IN p_Status VARCHAR(50),
    IN p_ErrorLog TEXT,
    IN p_ReplayRunID UUID,
    IN p_IntegrationID UUID,
    IN p_Comments TEXT,
    IN p_RestoredFromID UUID,
    IN p_RestoreReason TEXT
)
RETURNS SETOF __mj."vwRecordChanges" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."RecordChange"
    SET
        "EntityID" = p_EntityID,
        "RecordID" = p_RecordID,
        "UserID" = p_UserID,
        "Type" = p_Type,
        "Source" = p_Source,
        "ChangedAt" = p_ChangedAt,
        "ChangesJSON" = p_ChangesJSON,
        "ChangesDescription" = p_ChangesDescription,
        "FullRecordJSON" = p_FullRecordJSON,
        "Status" = p_Status,
        "ErrorLog" = p_ErrorLog,
        "ReplayRunID" = p_ReplayRunID,
        "IntegrationID" = p_IntegrationID,
        "Comments" = p_Comments,
        "RestoredFromID" = p_RestoredFromID,
        "RestoreReason" = p_RestoreReason
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwRecordChanges" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwRecordChanges" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteRecordChange"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."RecordChange"
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


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f3896b5f-5caa-4c47-95ca-0c95d67b6c58' OR ("EntityID" = 'F5238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'RestoredFromID')
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
        'f3896b5f-5caa-4c47-95ca-0c95d67b6c58',
        'F5238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Record" "Changes"
        100039,
        'RestoredFromID',
        'Restored From ID',
        'When this RecordChange was produced by a restore operation, points at the historical RecordChange whose state was restored. NULL for ordinary changes. Together with Source=''Restore'' this builds the version-chain lineage for auditing and timeline navigation.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        'F5238F34-2837-EF11-86D4-6045BDEE16E6',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f68a6734-5b76-4a35-8652-09e51dbae5a2' OR ("EntityID" = 'F5238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'RestoreReason')
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
        'f68a6734-5b76-4a35-8652-09e51dbae5a2',
        'F5238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Record" "Changes"
        100050, -- auto-bumped from 100040 (UQ_EntityField_EntityID_Sequence dedup),
        'RestoreReason',
        'Restore Reason',
        'Optional user-entered explanation captured at restore time. Persisted for audit purposes (regulated industries often require a reason for every reversal). NULL when the user did not enter one or when the change was not a restore.',
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

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('ca0c7411-739a-480b-b084-3667c501525d', 'B85717F0-6F36-EF11-86D4-6045BDEE16E6', 3, 'Restore', 'Restore', NOW(), NOW());
/* Create Entity Relationship: MJ: Record Changes -> MJ: Record Changes (One To Many via RestoredFromID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '02b3513a-c5d8-46fc-9033-5bafd03052df'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('02b3513a-c5d8-46fc-9033-5bafd03052df', 'F5238F34-2837-EF11-86D4-6045BDEE16E6', 'F5238F34-2837-EF11-86D4-6045BDEE16E6', 'RestoredFromID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3c5f84e1-ec19-4c26-a79e-e08164ee3c6b' OR ("EntityID" = 'F5238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'RestoredFrom')
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
        '3c5f84e1-ec19-4c26-a79e-e08164ee3c6b',
        'F5238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Record" "Changes"
        100047,
        'RestoredFrom',
        'Restored From',
        NULL,
        'TEXT',
        -1,
        0,
        0,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9ca6ccb4-4562-4ac1-9de0-6ec951cdac91' OR ("EntityID" = 'F5238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'RootRestoredFromID')
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
        '9ca6ccb4-4562-4ac1-9de0-6ec951cdac91',
        'F5238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Record" "Changes"
        100048,
        'RootRestoredFromID',
        'Root Restored From ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        TRUE,
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
               WHERE "ID" = '145917F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = 'DD4217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '145917F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = 'DD4217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = 'B75717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = 'B85717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = 'B24D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."Entity"
            SET "AllowUserSearchAPI" = TRUE
            WHERE "ID" = 'F5238F34-2837-EF11-86D4-6045BDEE16E6'
            AND "AutoUpdateAllowUserSearchAPI" = TRUE;
/* Set categories for 25 fields */
-- UPDATE Entity Field Category Info MJ: Record Changes."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DB4217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Changes."CreatedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F14C17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Changes."UpdatedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F24C17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Changes."EntityID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DC4217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Changes."RecordID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DD4217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Changes."UserID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0A4317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Changes."ReplayRunID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F34C17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Changes."IntegrationID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EF4C17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Changes."Comments"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B64D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Changes."Entity"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '145917F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Changes."User"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EF5717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Changes."ReplayRun"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DDF2790F-BB2A-4895-9CFB-82D50116830F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Changes."Integration"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E7A8FEEC-7840-EF11-86C3-00224821D189' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Changes."Type"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B75717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Changes."Source"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B85717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Changes."ChangedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DA4217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Changes."Status"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B24D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Changes."ErrorLog"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F04C17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Changes."ChangesJSON"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'B34D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Changes."ChangesDescription"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B44D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Changes."FullRecordJSON"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Full Record JSON',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'B54D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Changes."RestoredFromID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Audit Lineage',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F3896B5F-5CAA-4C47-95CA-0C95D67B6C58' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Changes."RestoreReason"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Audit Lineage',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F68A6734-5B76-4A35-8652-09E51DBAE5A2' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Changes."RestoredFrom"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Audit Lineage',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3C5F84E1-EC19-4C26-A79E-E08164EE3C6B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Changes."RootRestoredFromID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Audit Lineage',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9CA6CCB4-4562-4AC1-9DE0-6EC951CDAC91' AND "AutoUpdateCategory" = TRUE;
/* Update FieldCategoryInfo setting for entity */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Audit Lineage":{"icon":"fa fa-code-branch","description":"Historical versioning and restoration chain information"}}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = 'F5238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'FieldCategoryInfo';
/* Update FieldCategoryIcons setting (legacy) */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Audit Lineage":"fa fa-code-branch"}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = 'F5238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'FieldCategoryIcons';


-- ===================== FK & CHECK Constraints =====================


-- Flush any pending deferred trigger events from prior DML so DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;

-- =====================================================================
-- Add Restore Lineage to RecordChange
-- =====================================================================
-- Adds the columns needed to support a first-class "Restore record to
-- this version" capability on top of the existing change-tracking system.
--
-- 1. RestoredFromID (FK -> RecordChange."ID")
--    When a RecordChange row was produced by a restore operation, this
--    points at the historical change whose state was restored. Builds the
--    version-chain lineage that auditors can follow.
--
-- 2. RestoreReason (TEXT)
--    Optional user-entered explanation captured at restore time and
--    persisted alongside the audit row. Useful for regulated-industry
--    workflows where every reversal needs justification.
--
-- 3. Source enum extension
--    Adds 'Restore' to the existing Internal/External CHECK so the
--    timeline can distinguish restore operations from regular edits and
--    from external-system imports.
--
-- ReplayRunID is intentionally untouched -- it tracks the unrelated
-- external-change-detection replay run, not user-initiated restore.
-- =====================================================================

-----------------------------------------------------------------------
-- 1. Extend RecordChange."Source" CHECK to allow 'Restore'
-----------------------------------------------------------------------
ALTER TABLE __mj."RecordChange" DROP CONSTRAINT "CHK_RecordChange_Source";

ALTER TABLE __mj."RecordChange"
 ADD CONSTRAINT "CHK_RecordChange_Source"
    CHECK ("Source" IN ('Internal', 'External', 'Restore')) NOT VALID;

-----------------------------------------------------------------------
-- 2. Add FK constraint for RestoredFromID (columns added at top of file
--    so index + function + view above can reference them).
-----------------------------------------------------------------------
ALTER TABLE __mj."RecordChange"
 ADD CONSTRAINT "FK_RecordChange_RestoredFromID"
 FOREIGN KEY ("RestoredFromID") REFERENCES __mj."RecordChange"("ID") DEFERRABLE INITIALLY DEFERRED;


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwRecordChanges" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Record Changes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Changes
-- Item: Permissions for vwRecordChanges
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwRecordChanges" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Record Changes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Changes
-- Item: spCreateRecordChange
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RecordChange
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateRecordChange" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Record Changes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateRecordChange" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Record Changes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Changes
-- Item: spUpdateRecordChange
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RecordChange
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateRecordChange" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateRecordChange" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Record Changes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Changes
-- Item: spDeleteRecordChange
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RecordChange
------------------------------------------------------------;


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."RecordChange"."RestoredFromID" IS 'When this RecordChange was produced by a restore operation, points at the historical RecordChange whose state was restored. NULL for ordinary changes. Together with Source=';

COMMENT ON COLUMN __mj."RecordChange"."RestoreReason" IS 'Optional user-entered explanation captured at restore time. Persisted for audit purposes (regulated industries often require a reason for every reversal). NULL when the user did not enter one or when the change was not a restore.';


-- ===================== Other =====================

-----------------------------------------------------------------------
-- 3. Extended properties (descriptions used by CodeGen)
-----------------------------------------------------------------------

/* spUpdate Permissions for MJ: Record Changes */

/* spDelete Permissions for MJ: Record Changes */


/* SQL text to insert new entity field */
