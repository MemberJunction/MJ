
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
    "MJRecordChange_RestoredFromID"."RecordID" AS "RestoredFrom",
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

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwVersionLabelItems';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwVersionLabelItems"
AS SELECT
    v.*,
    "MJVersionLabel_VersionLabelID"."Name" AS "VersionLabel",
    "MJRecordChange_RecordChangeID"."RecordID" AS "RecordChange",
    "MJEntity_EntityID"."Name" AS "Entity"
FROM
    __mj."VersionLabelItem" AS v
INNER JOIN
    __mj."VersionLabel" AS "MJVersionLabel_VersionLabelID"
  ON
    v."VersionLabelID" = "MJVersionLabel_VersionLabelID"."ID"
INNER JOIN
    __mj."RecordChange" AS "MJRecordChange_RecordChangeID"
  ON
    v."RecordChangeID" = "MJRecordChange_RecordChangeID"."ID"
INNER JOIN
    __mj."Entity" AS "MJEntity_EntityID"
  ON
    v."EntityID" = "MJEntity_EntityID"."ID"$vsql$;
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

CREATE OR REPLACE FUNCTION __mj."spCreateRecordChange_Internal"(
    IN p_EntityName VARCHAR(100),
    IN p_RecordID VARCHAR(750),
    IN p_UserID UUID,
    IN p_Type VARCHAR(20),
    IN p_ChangesJSON TEXT,
    IN p_ChangesDescription TEXT,
    IN p_FullRecordJSON TEXT,
    IN p_Status CHAR(15),
    IN p_Comments TEXT,
    IN p_Source VARCHAR(20) DEFAULT NULL,
    IN p_RestoredFromID UUID DEFAULT NULL,
    IN p_RestoreReason TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwRecordChanges" AS
$$
BEGIN
INSERT INTO __mj."RecordChange"
        (
            EntityID,
            RecordID,
            UserID,
            Type,
            Source,
            ChangedAt,
            ChangesJSON,
            ChangesDescription,
            FullRecordJSON,
            Status,
            Comments,
            RestoredFromID,
            RestoreReason
        )
    VALUES
        (
            (SELECT ID FROM "__mj"."Entity" WHERE Name = p_EntityName),
            p_RecordID,
            p_UserID,
            p_Type,
            COALESCE(p_Source, 'Internal'),
            NOW(),
            p_ChangesJSON,
            p_ChangesDescription,
            p_FullRecordJSON,
            p_Status,
            p_Comments,
            p_RestoredFromID,
            p_RestoreReason
        );

    -- Return the new record from the base view so calculated fields are included
    RETURN QUERY SELECT *
    FROM "__mj".vwRecordChanges
    WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

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

CREATE OR REPLACE FUNCTION __mj."spCreateVersionLabelItem"(
    IN p_ID UUID DEFAULT NULL,
    IN p_VersionLabelID UUID DEFAULT NULL,
    IN p_RecordChangeID UUID DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_RecordID VARCHAR(750) DEFAULT NULL
)
RETURNS SETOF __mj."vwVersionLabelItems" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."VersionLabelItem"
            (
                "ID",
                "VersionLabelID",
                "RecordChangeID",
                "EntityID",
                "RecordID"
            )
        VALUES
            (
                p_ID,
                p_VersionLabelID,
                p_RecordChangeID,
                p_EntityID,
                p_RecordID
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."VersionLabelItem"
            (
                "VersionLabelID",
                "RecordChangeID",
                "EntityID",
                "RecordID"
            )
        VALUES
            (
                p_VersionLabelID,
                p_RecordChangeID,
                p_EntityID,
                p_RecordID
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwVersionLabelItems" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateVersionLabelItem"(
    IN p_ID UUID,
    IN p_VersionLabelID UUID,
    IN p_RecordChangeID UUID,
    IN p_EntityID UUID,
    IN p_RecordID VARCHAR(750)
)
RETURNS SETOF __mj."vwVersionLabelItems" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."VersionLabelItem"
    SET
        "VersionLabelID" = p_VersionLabelID,
        "RecordChangeID" = p_RecordChangeID,
        "EntityID" = p_EntityID,
        "RecordID" = p_RecordID
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwVersionLabelItems" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwVersionLabelItems" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteVersionLabelItem"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."VersionLabelItem"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateVersionLabelItem_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateVersionLabelItem" ON __mj."VersionLabelItem";
CREATE TRIGGER "trgUpdateVersionLabelItem"
    BEFORE UPDATE ON __mj."VersionLabelItem"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateVersionLabelItem_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = 'CE4660A4-75E6-4CC9-914F-3F3573BC2903'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'B6273D3C-06FC-4763-AB79-7C08C08839E7'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '880C53E3-358B-4134-9584-C38C65C8C689'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'CE4660A4-75E6-4CC9-914F-3F3573BC2903'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = '48626253-5497-4805-A944-8726264F9B9A'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."Entity"
            SET "AllowUserSearchAPI" = TRUE
            WHERE "ID" = '37F31DED-1186-46E6-B3A5-052CB31A8651'
            AND "AutoUpdateAllowUserSearchAPI" = TRUE;


-- ===================== Grants =====================

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateRecordChange_Internal" TO "cdp_Developer", "cdp_Integration", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
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

DO $$ BEGIN GRANT SELECT ON __mj."vwVersionLabelItems" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Version Label Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Label Items
-- Item: Permissions for vwVersionLabelItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwVersionLabelItems" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Version Label Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Label Items
-- Item: spCreateVersionLabelItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR VersionLabelItem
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateVersionLabelItem" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Version Label Items */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateVersionLabelItem" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Version Label Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Label Items
-- Item: spUpdateVersionLabelItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR VersionLabelItem
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateVersionLabelItem" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateVersionLabelItem" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Version Label Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Label Items
-- Item: spDeleteVersionLabelItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR VersionLabelItem
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteVersionLabelItem" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Version Label Items */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteVersionLabelItem" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Set field properties for entity */


-- ===================== Other =====================

/* spUpdate Permissions for MJ: Record Changes */

/* spUpdate Permissions for MJ: Version Label Items */
