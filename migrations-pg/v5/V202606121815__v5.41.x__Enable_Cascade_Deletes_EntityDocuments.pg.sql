-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- NOTE: Earlier converter versions made INTEGER to BOOLEAN cast implicit by
-- modifying the system catalog so SS-style INSERT INTO bool_col VALUES (1)
-- would work. That modification required pg_catalog write privileges, which
-- managed PG (RDS, Aurora, Cloud SQL, Azure) does not grant. As of v5.30 all
-- bulk INSERTs are emitted with native TRUE/FALSE values directly, so the
-- cast modification is no longer needed. Removed to support managed-PG
-- installs out of the box.


-- ===================== Stored Procedures (sp*) =====================

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEntityDocument'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityDocument"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJContentSources_EntityDocumentIDID UUID;
    p_MJContentSources_EntityDocumentID_Name VARCHAR(255);
    p_MJContentSources_EntityDocumentID_ContentTypeID UUID;
    p_MJContentSources_EntityDocumentID_ContentSourceTypeID UUID;
    p_MJContentSources_EntityDocumentID_ContentFileTypeID UUID;
    p_MJContentSources_EntityDocumentID_URL VARCHAR(2000);
    p_MJContentSources_EntityDocumentID_EmbeddingModelID UUID;
    p_MJContentSources_EntityDocumentID_VectorIndexID UUID;
    p_MJContentSources_EntityDocumentID_Configuration TEXT;
    p_MJContentSources_EntityDocumentID_EntityID UUID;
    p_MJContentSources_EntityDocumentID_EntityDocumentID UUID;
    p_MJContentSources_EntityDocumentID_ScheduledActionID UUID;
    p_MJEntityDocumentRuns_EntityDocumentIDID UUID;
    p_MJEntityDocumentSettings_EntityDocumentIDID UUID;
    p_MJEntityRecordDocuments_EntityDocumentIDID UUID;
BEGIN
-- Cascade update on ContentSource using cursor to call spUpdateContentSource


    FOR _rec IN SELECT "ID", "Name", "ContentTypeID", "ContentSourceTypeID", "ContentFileTypeID", "URL", "EmbeddingModelID", "VectorIndexID", "Configuration", "EntityID", "EntityDocumentID", "ScheduledActionID" FROM __mj."ContentSource" WHERE "EntityDocumentID" = p_ID
    LOOP
        p_MJContentSources_EntityDocumentIDID := _rec."ID";
        p_MJContentSources_EntityDocumentID_Name := _rec."Name";
        p_MJContentSources_EntityDocumentID_ContentTypeID := _rec."ContentTypeID";
        p_MJContentSources_EntityDocumentID_ContentSourceTypeID := _rec."ContentSourceTypeID";
        p_MJContentSources_EntityDocumentID_ContentFileTypeID := _rec."ContentFileTypeID";
        p_MJContentSources_EntityDocumentID_URL := _rec."URL";
        p_MJContentSources_EntityDocumentID_EmbeddingModelID := _rec."EmbeddingModelID";
        p_MJContentSources_EntityDocumentID_VectorIndexID := _rec."VectorIndexID";
        p_MJContentSources_EntityDocumentID_Configuration := _rec."Configuration";
        p_MJContentSources_EntityDocumentID_EntityID := _rec."EntityID";
        p_MJContentSources_EntityDocumentID_EntityDocumentID := _rec."EntityDocumentID";
        p_MJContentSources_EntityDocumentID_ScheduledActionID := _rec."ScheduledActionID";
        -- Set the FK field to NULL
        p_MJContentSources_EntityDocumentID_EntityDocumentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateContentSource"(p_ID => p_MJContentSources_EntityDocumentIDID, p_Name => p_MJContentSources_EntityDocumentID_Name, p_ContentTypeID => p_MJContentSources_EntityDocumentID_ContentTypeID, p_ContentSourceTypeID => p_MJContentSources_EntityDocumentID_ContentSourceTypeID, p_ContentFileTypeID => p_MJContentSources_EntityDocumentID_ContentFileTypeID, p_URL => p_MJContentSources_EntityDocumentID_URL, p_EmbeddingModelID => p_MJContentSources_EntityDocumentID_EmbeddingModelID, p_VectorIndexID => p_MJContentSources_EntityDocumentID_VectorIndexID, p_Configuration => p_MJContentSources_EntityDocumentID_Configuration, p_EntityID => p_MJContentSources_EntityDocumentID_EntityID, p_EntityDocumentID_Clear => 1, p_EntityDocumentID => p_MJContentSources_EntityDocumentID_EntityDocumentID, p_ScheduledActionID => p_MJContentSources_EntityDocumentID_ScheduledActionID);

    END LOOP;

    
    -- Cascade delete from EntityDocumentRun using cursor to call spDeleteEntityDocumentRun

    FOR _rec IN SELECT "ID" FROM __mj."EntityDocumentRun" WHERE "EntityDocumentID" = p_ID
    LOOP
        p_MJEntityDocumentRuns_EntityDocumentIDID := _rec."ID";
        PERFORM __mj."spDeleteEntityDocumentRun"(p_ID => p_MJEntityDocumentRuns_EntityDocumentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from EntityDocumentSetting using cursor to call spDeleteEntityDocumentSetting

    FOR _rec IN SELECT "ID" FROM __mj."EntityDocumentSetting" WHERE "EntityDocumentID" = p_ID
    LOOP
        p_MJEntityDocumentSettings_EntityDocumentIDID := _rec."ID";
        PERFORM __mj."spDeleteEntityDocumentSetting"(p_ID => p_MJEntityDocumentSettings_EntityDocumentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from EntityRecordDocument using cursor to call spDeleteEntityRecordDocument

    FOR _rec IN SELECT "ID" FROM __mj."EntityRecordDocument" WHERE "EntityDocumentID" = p_ID
    LOOP
        p_MJEntityRecordDocuments_EntityDocumentIDID := _rec."ID";
        PERFORM __mj."spDeleteEntityRecordDocument"(p_ID => p_MJEntityRecordDocuments_EntityDocumentIDID);
        
    END LOOP;
    
    

    DELETE FROM
        __mj."EntityDocument"
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

UPDATE __mj."Entity"
SET "CascadeDeletes" = TRUE
WHERE "ID" = '22248F34-2837-EF11-86D4-6045BDEE16E6';


/* spDelete SQL for MJ: Entity Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Documents
-- Item: spDeleteEntityDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityDocument
------------------------------------------------------------


-- ===================== Grants =====================

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityDocument" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
-- ===================== Other =====================

-- Migration: Enable Cascade Deletes for MJ: Entity Documents
-- Description: Setting CascadeDeletes = 1 on Entity Documents so that deleting an
--              EntityDocument automatically cleans up its child Entity Record Documents
--              (which currently blocks the delete via FK constraint).
--
-- Child entities of MJ: Entity Documents:
--   - MJ: Entity Record Documents (EntityDocumentID, NOT NULL) -> DELETE cascade
--
-- After this UPDATE runs, the next CodeGen run will regenerate spDeleteEntityDocument
-- to first delete the dependent EntityRecordDocument rows via spDeleteEntityRecordDocument,
-- then delete the parent EntityDocument row -- all within a single transaction with
-- proper RecordChanges audit entries.

-- ============================================================================
-- Entity metadata CascadeDeletes flag
-- ============================================================================

-- MJ: Entity Documents
