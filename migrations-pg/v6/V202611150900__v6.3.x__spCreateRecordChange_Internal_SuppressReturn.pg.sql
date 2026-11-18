-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202611150900__v6.3.x__spCreateRecordChange_Internal_SuppressReturn.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ===================== HAND-FINISHED (v6.3.0-edge.1 release build) =====================
-- spCreateRecordChange_Internal gains p_EntityID and p_SuppressReturn (SQL Server parity).
--
-- The split converter classifies `CREATE OR ALTER PROCEDURE spCreateRecordChange_Internal` as a
-- CodeGen object (spCreate* name) and drops it, writing "no DDL to translate". It is hand-written
-- (V202609302340 ported it by hand), so it is ported by hand again here.
--
-- PostgreSQLDataProvider writes Record Changes with its own INSERT, so this function is kept for
-- parity with SQL Server. As in V202609302340, every existing overload is dropped first: adding two
-- defaulted arguments with CREATE OR REPLACE would create a second overload and make every
-- 13-argument call ambiguous.
--   p_EntityID       when given, used instead of the Entity lookup by Name.
--   p_SuppressReturn when TRUE, inserts and returns no row (SQL Server: RETURN before the
--                    vwRecordChanges readback); otherwise returns the inserted row as before.
DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spCreateRecordChange_Internal'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
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
    IN p_RestoreReason TEXT DEFAULT NULL,
    IN p_ChangeContext TEXT DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_SuppressReturn BOOLEAN DEFAULT FALSE
)
RETURNS SETOF __mj."vwRecordChanges" AS
$$
DECLARE
    v_ID UUID;
    v_ResolvedEntityID UUID;
BEGIN
    v_ResolvedEntityID := COALESCE(
        p_EntityID,
        (SELECT "ID" FROM __mj."Entity" WHERE "Name" = p_EntityName)
    );

    INSERT INTO __mj."RecordChange"
        ("EntityID", "RecordID", "UserID", "Type", "Source", "ChangedAt", "ChangesJSON",
         "ChangesDescription", "FullRecordJSON", "Status", "Comments", "RestoredFromID",
         "RestoreReason", "ChangeContext")
    VALUES
        (v_ResolvedEntityID,
         p_RecordID, p_UserID, p_Type, COALESCE(p_Source, 'Internal'), NOW(), p_ChangesJSON,
         p_ChangesDescription, p_FullRecordJSON, p_Status, p_Comments, p_RestoredFromID,
         p_RestoreReason, p_ChangeContext)
    RETURNING "ID" INTO v_ID;

    IF COALESCE(p_SuppressReturn, FALSE) THEN
        RETURN;
    END IF;

    -- Return the new record from the base view so calculated fields are included
    RETURN QUERY SELECT * FROM __mj."vwRecordChanges" WHERE "ID" = v_ID;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION __mj."spCreateRecordChange_Internal" TO "cdp_Developer", "cdp_Integration", "cdp_UI";
