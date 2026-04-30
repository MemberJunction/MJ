
-- ===================== DDL: Tables, PKs, Indexes =====================

-- Add RecordMetadata columns to Duplicate Run Detail and Match tables.
-- Stores vector DB metadata (Name, Description, EntityIcon, etc.) captured at detection time
-- so the UI can display rich record info without additional lookups.

ALTER TABLE __mj."DuplicateRunDetail"
 ADD COLUMN "RecordMetadata" TEXT NULL;

ALTER TABLE __mj."DuplicateRunDetailMatch"
 ADD COLUMN "RecordMetadata" TEXT NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_DuplicateRunDetailMatch_DuplicateRunDetailID" ON __mj."DuplicateRunDetailMatch" ("DuplicateRunDetailID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_DuplicateRunDetailMatch_RecordMergeLogID" ON __mj."DuplicateRunDetailMatch" ("RecordMergeLogID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_DuplicateRunDetail_DuplicateRunID" ON __mj."DuplicateRunDetail" ("DuplicateRunID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwDuplicateRunDetailMatches';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwDuplicateRunDetailMatches"
AS SELECT
    d.*,
    "MJDuplicateRunDetail_DuplicateRunDetailID"."RecordID" AS "DuplicateRunDetail",
    "MJRecordMergeLog_RecordMergeLogID"."SurvivingRecordID" AS "RecordMergeLog"
FROM
    __mj."DuplicateRunDetailMatch" AS d
INNER JOIN
    __mj."DuplicateRunDetail" AS "MJDuplicateRunDetail_DuplicateRunDetailID"
  ON
    d."DuplicateRunDetailID" = "MJDuplicateRunDetail_DuplicateRunDetailID"."ID"
LEFT OUTER JOIN
    __mj."RecordMergeLog" AS "MJRecordMergeLog_RecordMergeLogID"
  ON
    d."RecordMergeLogID" = "MJRecordMergeLog_RecordMergeLogID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwDuplicateRunDetails';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwDuplicateRunDetails"
AS SELECT
    d.*,
    "MJDuplicateRun_DuplicateRunID"."Entity" AS "DuplicateRun"
FROM
    __mj."DuplicateRunDetail" AS d
INNER JOIN
    __mj."vwDuplicateRuns" AS "MJDuplicateRun_DuplicateRunID"
  ON
    d."DuplicateRunID" = "MJDuplicateRun_DuplicateRunID"."ID"$vsql$;
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

CREATE OR REPLACE FUNCTION __mj."spCreateDuplicateRunDetailMatch"(
    IN p_ID UUID DEFAULT NULL,
    IN p_DuplicateRunDetailID UUID DEFAULT NULL,
    IN p_MatchSource VARCHAR(20) DEFAULT NULL,
    IN p_MatchRecordID VARCHAR(500) DEFAULT NULL,
    IN p_MatchProbability NUMERIC(12,11) DEFAULT NULL,
    IN p_MatchedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_Action VARCHAR(20) DEFAULT NULL,
    IN p_ApprovalStatus VARCHAR(20) DEFAULT NULL,
    IN p_RecordMergeLogID UUID DEFAULT NULL,
    IN p_MergeStatus VARCHAR(20) DEFAULT NULL,
    IN p_MergedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_RecordMetadata TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwDuplicateRunDetailMatches" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."DuplicateRunDetailMatch"
            (
                "ID",
                "DuplicateRunDetailID",
                "MatchSource",
                "MatchRecordID",
                "MatchProbability",
                "MatchedAt",
                "Action",
                "ApprovalStatus",
                "RecordMergeLogID",
                "MergeStatus",
                "MergedAt",
                "RecordMetadata"
            )
        VALUES
            (
                p_ID,
                p_DuplicateRunDetailID,
                COALESCE(p_MatchSource, 'Vector'),
                p_MatchRecordID,
                COALESCE(p_MatchProbability, 0),
                COALESCE(p_MatchedAt, NOW()),
                COALESCE(p_Action, 'Ignore'),
                COALESCE(p_ApprovalStatus, 'Pending'),
                p_RecordMergeLogID,
                COALESCE(p_MergeStatus, 'Pending'),
                COALESCE(p_MergedAt, NOW()),
                p_RecordMetadata
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."DuplicateRunDetailMatch"
            (
                "DuplicateRunDetailID",
                "MatchSource",
                "MatchRecordID",
                "MatchProbability",
                "MatchedAt",
                "Action",
                "ApprovalStatus",
                "RecordMergeLogID",
                "MergeStatus",
                "MergedAt",
                "RecordMetadata"
            )
        VALUES
            (
                p_DuplicateRunDetailID,
                COALESCE(p_MatchSource, 'Vector'),
                p_MatchRecordID,
                COALESCE(p_MatchProbability, 0),
                COALESCE(p_MatchedAt, NOW()),
                COALESCE(p_Action, 'Ignore'),
                COALESCE(p_ApprovalStatus, 'Pending'),
                p_RecordMergeLogID,
                COALESCE(p_MergeStatus, 'Pending'),
                COALESCE(p_MergedAt, NOW()),
                p_RecordMetadata
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwDuplicateRunDetailMatches" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateDuplicateRunDetailMatch"(
    IN p_ID UUID,
    IN p_DuplicateRunDetailID UUID,
    IN p_MatchSource VARCHAR(20),
    IN p_MatchRecordID VARCHAR(500),
    IN p_MatchProbability NUMERIC(12,11),
    IN p_MatchedAt TIMESTAMPTZ,
    IN p_Action VARCHAR(20),
    IN p_ApprovalStatus VARCHAR(20),
    IN p_RecordMergeLogID UUID,
    IN p_MergeStatus VARCHAR(20),
    IN p_MergedAt TIMESTAMPTZ,
    IN p_RecordMetadata TEXT
)
RETURNS SETOF __mj."vwDuplicateRunDetailMatches" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."DuplicateRunDetailMatch"
    SET
        "DuplicateRunDetailID" = p_DuplicateRunDetailID,
        "MatchSource" = p_MatchSource,
        "MatchRecordID" = p_MatchRecordID,
        "MatchProbability" = p_MatchProbability,
        "MatchedAt" = p_MatchedAt,
        "Action" = p_Action,
        "ApprovalStatus" = p_ApprovalStatus,
        "RecordMergeLogID" = p_RecordMergeLogID,
        "MergeStatus" = p_MergeStatus,
        "MergedAt" = p_MergedAt,
        "RecordMetadata" = p_RecordMetadata
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwDuplicateRunDetailMatches" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwDuplicateRunDetailMatches" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateDuplicateRunDetail"(
    IN p_ID UUID DEFAULT NULL,
    IN p_DuplicateRunID UUID DEFAULT NULL,
    IN p_RecordID VARCHAR(500) DEFAULT NULL,
    IN p_MatchStatus VARCHAR(20) DEFAULT NULL,
    IN p_SkippedReason TEXT DEFAULT NULL,
    IN p_MatchErrorMessage TEXT DEFAULT NULL,
    IN p_MergeStatus VARCHAR(20) DEFAULT NULL,
    IN p_MergeErrorMessage TEXT DEFAULT NULL,
    IN p_RecordMetadata TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwDuplicateRunDetails" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."DuplicateRunDetail"
            (
                "ID",
                "DuplicateRunID",
                "RecordID",
                "MatchStatus",
                "SkippedReason",
                "MatchErrorMessage",
                "MergeStatus",
                "MergeErrorMessage",
                "RecordMetadata"
            )
        VALUES
            (
                p_ID,
                p_DuplicateRunID,
                p_RecordID,
                COALESCE(p_MatchStatus, 'Pending'),
                p_SkippedReason,
                p_MatchErrorMessage,
                COALESCE(p_MergeStatus, 'Not Applicable'),
                p_MergeErrorMessage,
                p_RecordMetadata
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."DuplicateRunDetail"
            (
                "DuplicateRunID",
                "RecordID",
                "MatchStatus",
                "SkippedReason",
                "MatchErrorMessage",
                "MergeStatus",
                "MergeErrorMessage",
                "RecordMetadata"
            )
        VALUES
            (
                p_DuplicateRunID,
                p_RecordID,
                COALESCE(p_MatchStatus, 'Pending'),
                p_SkippedReason,
                p_MatchErrorMessage,
                COALESCE(p_MergeStatus, 'Not Applicable'),
                p_MergeErrorMessage,
                p_RecordMetadata
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwDuplicateRunDetails" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateDuplicateRunDetail"(
    IN p_ID UUID,
    IN p_DuplicateRunID UUID,
    IN p_RecordID VARCHAR(500),
    IN p_MatchStatus VARCHAR(20),
    IN p_SkippedReason TEXT,
    IN p_MatchErrorMessage TEXT,
    IN p_MergeStatus VARCHAR(20),
    IN p_MergeErrorMessage TEXT,
    IN p_RecordMetadata TEXT
)
RETURNS SETOF __mj."vwDuplicateRunDetails" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."DuplicateRunDetail"
    SET
        "DuplicateRunID" = p_DuplicateRunID,
        "RecordID" = p_RecordID,
        "MatchStatus" = p_MatchStatus,
        "SkippedReason" = p_SkippedReason,
        "MatchErrorMessage" = p_MatchErrorMessage,
        "MergeStatus" = p_MergeStatus,
        "MergeErrorMessage" = p_MergeErrorMessage,
        "RecordMetadata" = p_RecordMetadata
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwDuplicateRunDetails" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwDuplicateRunDetails" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteDuplicateRunDetailMatch"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."DuplicateRunDetailMatch"
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

CREATE OR REPLACE FUNCTION __mj."spDeleteDuplicateRunDetail"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."DuplicateRunDetail"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateDuplicateRunDetailMatch_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateDuplicateRunDetailMatch" ON __mj."DuplicateRunDetailMatch";
CREATE TRIGGER "trgUpdateDuplicateRunDetailMatch"
    BEFORE UPDATE ON __mj."DuplicateRunDetailMatch"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateDuplicateRunDetailMatch_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateDuplicateRunDetail_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateDuplicateRunDetail" ON __mj."DuplicateRunDetail";
CREATE TRIGGER "trgUpdateDuplicateRunDetail"
    BEFORE UPDATE ON __mj."DuplicateRunDetail"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateDuplicateRunDetail_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ae512782-4687-4d46-a9a5-f64e1e385504' OR ("EntityID" = '2D248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'RecordMetadata')
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
        'ae512782-4687-4d46-a9a5-f64e1e385504',
        '2D248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Duplicate" "Run" "Detail" "Matches"
        100029,
        'RecordMetadata',
        'Record Metadata',
        'JSON metadata snapshot of the matched record from the vector database at detection time. Contains display fields (Name, Description, EntityIcon, etc.) for rich UI rendering without additional lookups.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd0181d15-798a-4aa1-82f5-d880adaffac4' OR ("EntityID" = '31248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'RecordMetadata')
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
        'd0181d15-798a-4aa1-82f5-d880adaffac4',
        '31248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Duplicate" "Run" "Details"
        100022,
        'RecordMetadata',
        'Record Metadata',
        'JSON metadata snapshot of the source record from the vector database at detection time. Contains display fields (Name, Description, EntityIcon, etc.) for rich UI rendering without additional lookups.',
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

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '3A4417F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '3C4417F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'C0659D37-75B1-4FB4-8CE4-C7EA3A243A1D'
               AND "AutoUpdateDefaultInView" = TRUE;
/* Set categories for 16 fields */
-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '284417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches."DuplicateRunDetailID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Duplicate Run Detail ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '294417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches."MatchSource"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3F4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches."MatchRecordID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Match Record ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2A4417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches."MatchProbability"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2B4417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches."MatchedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2C4417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches."RecordMetadata"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Match Results',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'AE512782-4687-4D46-A9A5-F64E1E385504' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches."DuplicateRunDetail"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Match Results',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C0659D37-75B1-4FB4-8CE4-C7EA3A243A1D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches."Action"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2D4417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches."ApprovalStatus"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2E4417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches."RecordMergeLogID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Record Merge Log ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '314417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches."MergeStatus"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2F4417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches."MergedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '304417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches."RecordMergeLog"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Resolution Management',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '064EF859-8C2F-464E-8DF0-822E69644E1B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7F5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '805817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* Set categories for 12 fields */
-- UPDATE Entity Field Category Info MJ: Duplicate Run Details."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '354417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Details."DuplicateRunID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Duplicate Run',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '364417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Details."RecordID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Source Record',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '374417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Details."DuplicateRun"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Run Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '87C64C19-39F4-46BC-B95C-265113B019DE' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Details."RecordMetadata"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Run Identification',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'D0181D15-798A-4AA1-82F5-D880ADAFFAC4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Details."MatchStatus"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '384417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Details."SkippedReason"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '394417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Details."MatchErrorMessage"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3A4417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Details."MergeStatus"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3B4417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Details."MergeErrorMessage"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3C4417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '835817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '845817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwDuplicateRunDetailMatches" TO "cdp_UI", "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Duplicate Run Detail Matches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Detail Matches
-- Item: Permissions for vwDuplicateRunDetailMatches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwDuplicateRunDetailMatches" TO "cdp_UI", "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Duplicate Run Detail Matches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Detail Matches
-- Item: spCreateDuplicateRunDetailMatch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DuplicateRunDetailMatch
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateDuplicateRunDetailMatch" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Duplicate Run Detail Matches */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateDuplicateRunDetailMatch" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Duplicate Run Detail Matches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Detail Matches
-- Item: spUpdateDuplicateRunDetailMatch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DuplicateRunDetailMatch
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateDuplicateRunDetailMatch" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateDuplicateRunDetailMatch" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: Duplicate Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Details
-- Item: vwDuplicateRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Duplicate Run Details
-----               SCHEMA:      __mj
-----               BASE TABLE:  DuplicateRunDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwDuplicateRunDetails" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Duplicate Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Details
-- Item: Permissions for vwDuplicateRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwDuplicateRunDetails" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Duplicate Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Details
-- Item: spCreateDuplicateRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DuplicateRunDetail
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateDuplicateRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Duplicate Run Details */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateDuplicateRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Duplicate Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Details
-- Item: spUpdateDuplicateRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DuplicateRunDetail
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateDuplicateRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateDuplicateRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Duplicate Run Detail Matches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Detail Matches
-- Item: spDeleteDuplicateRunDetailMatch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DuplicateRunDetailMatch
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDuplicateRunDetailMatch" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Duplicate Run Detail Matches */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDuplicateRunDetailMatch" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Duplicate Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Details
-- Item: spDeleteDuplicateRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DuplicateRunDetail
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDuplicateRunDetail" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Duplicate Run Details */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDuplicateRunDetail" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Set field properties for entity */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."DuplicateRunDetail"."RecordMetadata" IS 'JSON metadata snapshot of the source record from the vector database at detection time. Contains display fields (Name, Description, EntityIcon, etc.) for rich UI rendering without additional lookups.';

COMMENT ON COLUMN __mj."DuplicateRunDetailMatch"."RecordMetadata" IS 'JSON metadata snapshot of the matched record from the vector database at detection time. Contains display fields (Name, Description, EntityIcon, etc.) for rich UI rendering without additional lookups.';


-- ===================== Other =====================

-- Extended properties for documentation

/* spUpdate Permissions for MJ: Duplicate Run Detail Matches */

/* spUpdate Permissions for MJ: Duplicate Run Details */
