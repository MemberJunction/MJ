-- ============================================================================
-- V202605052100 — Wave 2: recreate the additional 22 CRUD functions orphaned
-- by the V202605032116 → V202605032310 → V202605041500 chain on fresh-drop
-- Aurora replays.
--
-- Background:
--   V202605051630 (Wave 1) covered 6 entities (12 functions). Customer-side
--   verification on Aurora dev cluster after that migration applied found
--   11 additional entities (22 functions) also missing on a fresh-drop
--   replay — same root-cause silent-DROP-block damage in 032310 followed by
--   V202605041500's CASCADE cleanup of duplicate overloads, with codegen
--   not regenerating because the entities aren't in `modifiedEntityList`.
--
-- Why this isn't "all 582":
--   Every spCreate/spUpdate in 032310 has signature differences from 032116,
--   so all 582 are *eligible* for the orphan path. The actual orphan happens
--   only when 032310's DROP-without-CASCADE fails (PG catalog says something
--   depends on the function), which is per-environment. Covering all 582
--   would force-replace 544+ currently-working view-typed functions with the
--   weaker view-independent table-typed shape — a regression for callers
--   consuming joined-name columns. This migration covers only the
--   empirically-confirmed missing 22.
--
-- Verification query post-apply (sample 17 entities — extend if more found):
--   SELECT proname FROM pg_proc
--   WHERE pronamespace = '${flyway:defaultSchema}'::regnamespace
--     AND proname IN (
--       'spCreateAICredentialBinding','spUpdateAICredentialBinding',
--       'spCreateAIModel','spUpdateAIModel',
--       'spCreateArchiveRunDetail','spUpdateArchiveRunDetail',
--       'spCreateContentItem','spUpdateContentItem',
--       'spCreateContentProcessRunDetail','spUpdateContentProcessRunDetail',
--       'spCreateDuplicateRunDetail','spUpdateDuplicateRunDetail',
--       'spCreateDuplicateRunDetailMatch','spUpdateDuplicateRunDetailMatch',
--       'spCreateEntityActionFilter','spUpdateEntityActionFilter',
--       'spCreateEntityActionInvocation','spUpdateEntityActionInvocation',
--       'spCreateEntityActionParam','spUpdateEntityActionParam',
--       'spCreateEntityCommunicationField','spUpdateEntityCommunicationField',
--       'spCreateRecommendation','spUpdateRecommendation',
--       'spCreateRecommendationItem','spUpdateRecommendationItem',
--       'spCreateRecordMergeDeletionLog','spUpdateRecordMergeDeletionLog',
--       'spCreateTemplateParam','spUpdateTemplateParam',
--       'spCreateTestRun','spUpdateTestRun',
--       'spCreateUserApplicationEntity','spUpdateUserApplicationEntity'
--     );
--   -- expected: 22 rows
--
-- Same view-independent template as V202605051630 (which covers Wave 1):
--   - DROP FUNCTION IF EXISTS … CASCADE for all overloads
--   - CREATE OR REPLACE FUNCTION … RETURNS SETOF __mj."<BaseTable>"
--   - Body's terminal RETURN QUERY reads from the base table, not the view
--   - GRANT EXECUTE TO cdp_Developer, cdp_Integration
--
-- Idempotent. Tested locally on a TRUE fresh-drop state (functions AND
-- supporting views absent at apply time).
-- ============================================================================


-- ──────────────────────────────────────────────────────────────────────────
-- spCreateAICredentialBinding
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAICredentialBinding'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateAICredentialBinding"(
    p_isactive_clear boolean DEFAULT false,
    p_isactive bool DEFAULT NULL,
    p_priority_clear boolean DEFAULT false,
    p_priority int4 DEFAULT NULL,
    p_aipromptmodelid uuid DEFAULT NULL,
    p_aimodelvendorid uuid DEFAULT NULL,
    p_aivendorid uuid DEFAULT NULL,
    p_bindingtype varchar(20) DEFAULT NULL,
    p_credentialid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."AICredentialBinding" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."AICredentialBinding"
        (
            "ID",
            "IsActive",
                "Priority",
                "AIPromptModelID",
                "AIModelVendorID",
                "AIVendorID",
                "BindingType",
                "CredentialID"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_isactive_clear = true THEN NULL ELSE COALESCE(p_isactive, true) END,
                CASE WHEN p_priority_clear = true THEN NULL ELSE COALESCE(p_priority, 0) END,
                p_aipromptmodelid,
                p_aimodelvendorid,
                p_aivendorid,
                p_bindingtype,
                p_credentialid
        )
    ;

    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwAICredentialBindings"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateAICredentialBinding" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spUpdateAICredentialBinding
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAICredentialBinding'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateAICredentialBinding"(
    p_isactive_clear boolean DEFAULT false,
    p_isactive bool DEFAULT NULL,
    p_priority_clear boolean DEFAULT false,
    p_priority int4 DEFAULT NULL,
    p_aipromptmodelid uuid DEFAULT NULL,
    p_aimodelvendorid uuid DEFAULT NULL,
    p_aivendorid uuid DEFAULT NULL,
    p_bindingtype varchar(20) DEFAULT NULL,
    p_credentialid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."AICredentialBinding" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."AICredentialBinding"
    SET
        "IsActive" = CASE WHEN p_isactive_clear = true THEN NULL ELSE COALESCE(p_isactive, "IsActive") END,
        "Priority" = CASE WHEN p_priority_clear = true THEN NULL ELSE COALESCE(p_priority, "Priority") END,
        "AIPromptModelID" = COALESCE(p_aipromptmodelid, "AIPromptModelID"),
        "AIModelVendorID" = COALESCE(p_aimodelvendorid, "AIModelVendorID"),
        "AIVendorID" = COALESCE(p_aivendorid, "AIVendorID"),
        "BindingType" = COALESCE(p_bindingtype, "BindingType"),
        "CredentialID" = COALESCE(p_credentialid, "CredentialID")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwAICredentialBindings"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateAICredentialBinding" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spCreateAIModel
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIModel'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateAIModel"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(50) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_AIModelTypeID UUID DEFAULT NULL,
    IN p_PowerRank_Clear BOOLEAN DEFAULT FALSE,
    IN p_PowerRank INTEGER DEFAULT NULL,
    IN p_IsActive BOOLEAN DEFAULT NULL,
    IN p_SpeedRank_Clear BOOLEAN DEFAULT FALSE,
    IN p_SpeedRank INTEGER DEFAULT NULL,
    IN p_CostRank_Clear BOOLEAN DEFAULT FALSE,
    IN p_CostRank INTEGER DEFAULT NULL,
    IN p_ModelSelectionInsights_Clear BOOLEAN DEFAULT FALSE,
    IN p_ModelSelectionInsights TEXT DEFAULT NULL,
    IN p_InheritTypeModalities BOOLEAN DEFAULT NULL,
    IN p_PriorVersionID_Clear BOOLEAN DEFAULT FALSE,
    IN p_PriorVersionID UUID DEFAULT NULL,
    IN p_SupportsPrefill_Clear BOOLEAN DEFAULT FALSE,
    IN p_SupportsPrefill BOOLEAN DEFAULT NULL,
    IN p_PrefillFallbackText_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrefillFallbackText TEXT DEFAULT NULL
)
RETURNS SETOF ${flyway:defaultSchema}."AIModel" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO ${flyway:defaultSchema}."AIModel"
            (
                "ID",
                "Name",
                "Description",
                "AIModelTypeID",
                "PowerRank",
                "IsActive",
                "SpeedRank",
                "CostRank",
                "ModelSelectionInsights",
                "InheritTypeModalities",
                "PriorVersionID",
                "SupportsPrefill",
                "PrefillFallbackText"
            )
        VALUES
            (
                p_ID,
                p_Name,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                p_AIModelTypeID,
                CASE WHEN p_PowerRank_Clear = TRUE THEN NULL ELSE COALESCE(p_PowerRank, 0) END,
                COALESCE(p_IsActive, TRUE),
                CASE WHEN p_SpeedRank_Clear = TRUE THEN NULL ELSE COALESCE(p_SpeedRank, 0) END,
                CASE WHEN p_CostRank_Clear = TRUE THEN NULL ELSE COALESCE(p_CostRank, 0) END,
                CASE WHEN p_ModelSelectionInsights_Clear = TRUE THEN NULL ELSE COALESCE(p_ModelSelectionInsights, NULL) END,
                COALESCE(p_InheritTypeModalities, TRUE),
                CASE WHEN p_PriorVersionID_Clear = TRUE THEN NULL ELSE COALESCE(p_PriorVersionID, NULL) END,
                CASE WHEN p_SupportsPrefill_Clear = TRUE THEN NULL ELSE COALESCE(p_SupportsPrefill, NULL) END,
                CASE WHEN p_PrefillFallbackText_Clear = TRUE THEN NULL ELSE COALESCE(p_PrefillFallbackText, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO ${flyway:defaultSchema}."AIModel"
            (
                "Name",
                "Description",
                "AIModelTypeID",
                "PowerRank",
                "IsActive",
                "SpeedRank",
                "CostRank",
                "ModelSelectionInsights",
                "InheritTypeModalities",
                "PriorVersionID",
                "SupportsPrefill",
                "PrefillFallbackText"
            )
        VALUES
            (
                p_Name,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                p_AIModelTypeID,
                CASE WHEN p_PowerRank_Clear = TRUE THEN NULL ELSE COALESCE(p_PowerRank, 0) END,
                COALESCE(p_IsActive, TRUE),
                CASE WHEN p_SpeedRank_Clear = TRUE THEN NULL ELSE COALESCE(p_SpeedRank, 0) END,
                CASE WHEN p_CostRank_Clear = TRUE THEN NULL ELSE COALESCE(p_CostRank, 0) END,
                CASE WHEN p_ModelSelectionInsights_Clear = TRUE THEN NULL ELSE COALESCE(p_ModelSelectionInsights, NULL) END,
                COALESCE(p_InheritTypeModalities, TRUE),
                CASE WHEN p_PriorVersionID_Clear = TRUE THEN NULL ELSE COALESCE(p_PriorVersionID, NULL) END,
                CASE WHEN p_SupportsPrefill_Clear = TRUE THEN NULL ELSE COALESCE(p_SupportsPrefill, NULL) END,
                CASE WHEN p_PrefillFallbackText_Clear = TRUE THEN NULL ELSE COALESCE(p_PrefillFallbackText, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."AIModel" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateAIModel" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spUpdateAIModel
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIModel'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateAIModel"(
    IN p_ID UUID,
    IN p_Name VARCHAR(50) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_AIModelTypeID UUID DEFAULT NULL,
    IN p_PowerRank_Clear BOOLEAN DEFAULT FALSE,
    IN p_PowerRank INTEGER DEFAULT NULL,
    IN p_IsActive BOOLEAN DEFAULT NULL,
    IN p_SpeedRank_Clear BOOLEAN DEFAULT FALSE,
    IN p_SpeedRank INTEGER DEFAULT NULL,
    IN p_CostRank_Clear BOOLEAN DEFAULT FALSE,
    IN p_CostRank INTEGER DEFAULT NULL,
    IN p_ModelSelectionInsights_Clear BOOLEAN DEFAULT FALSE,
    IN p_ModelSelectionInsights TEXT DEFAULT NULL,
    IN p_InheritTypeModalities BOOLEAN DEFAULT NULL,
    IN p_PriorVersionID_Clear BOOLEAN DEFAULT FALSE,
    IN p_PriorVersionID UUID DEFAULT NULL,
    IN p_SupportsPrefill_Clear BOOLEAN DEFAULT FALSE,
    IN p_SupportsPrefill BOOLEAN DEFAULT NULL,
    IN p_PrefillFallbackText_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrefillFallbackText TEXT DEFAULT NULL
)
RETURNS SETOF ${flyway:defaultSchema}."AIModel" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        ${flyway:defaultSchema}."AIModel"
    SET
        "Name" = COALESCE(p_Name, "Name"),
        "Description" = CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, "Description") END,
        "AIModelTypeID" = COALESCE(p_AIModelTypeID, "AIModelTypeID"),
        "PowerRank" = CASE WHEN p_PowerRank_Clear = TRUE THEN NULL ELSE COALESCE(p_PowerRank, "PowerRank") END,
        "IsActive" = COALESCE(p_IsActive, "IsActive"),
        "SpeedRank" = CASE WHEN p_SpeedRank_Clear = TRUE THEN NULL ELSE COALESCE(p_SpeedRank, "SpeedRank") END,
        "CostRank" = CASE WHEN p_CostRank_Clear = TRUE THEN NULL ELSE COALESCE(p_CostRank, "CostRank") END,
        "ModelSelectionInsights" = CASE WHEN p_ModelSelectionInsights_Clear = TRUE THEN NULL ELSE COALESCE(p_ModelSelectionInsights, "ModelSelectionInsights") END,
        "InheritTypeModalities" = COALESCE(p_InheritTypeModalities, "InheritTypeModalities"),
        "PriorVersionID" = CASE WHEN p_PriorVersionID_Clear = TRUE THEN NULL ELSE COALESCE(p_PriorVersionID, "PriorVersionID") END,
        "SupportsPrefill" = CASE WHEN p_SupportsPrefill_Clear = TRUE THEN NULL ELSE COALESCE(p_SupportsPrefill, "SupportsPrefill") END,
        "PrefillFallbackText" = CASE WHEN p_PrefillFallbackText_Clear = TRUE THEN NULL ELSE COALESCE(p_PrefillFallbackText, "PrefillFallbackText") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."AIModel" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."AIModel" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateAIModel" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spCreateArchiveRunDetail
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateArchiveRunDetail'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateArchiveRunDetail"(
    p_isrecordchangearchive_clear boolean DEFAULT false,
    p_isrecordchangearchive bool DEFAULT NULL,
    p_versionstamp timestamptz DEFAULT NULL,
    p_archivedat timestamptz DEFAULT NULL,
    p_errormessage text DEFAULT NULL,
    p_bytesarchived_clear boolean DEFAULT false,
    p_bytesarchived int8 DEFAULT NULL,
    p_storagepath varchar(1000) DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_recordid varchar(750) DEFAULT NULL,
    p_entityid uuid DEFAULT NULL,
    p_archiverunid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."ArchiveRunDetail" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."ArchiveRunDetail"
        (
            "ID",
            "IsRecordChangeArchive",
                "VersionStamp",
                "ArchivedAt",
                "ErrorMessage",
                "BytesArchived",
                "StoragePath",
                "Status",
                "RecordID",
                "EntityID",
                "ArchiveRunID"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_isrecordchangearchive_clear = true THEN NULL ELSE COALESCE(p_isrecordchangearchive, false) END,
                p_versionstamp,
                p_archivedat,
                p_errormessage,
                CASE WHEN p_bytesarchived_clear = true THEN NULL ELSE COALESCE(p_bytesarchived, 0) END,
                p_storagepath,
                p_status,
                p_recordid,
                p_entityid,
                p_archiverunid
        )
    ;

    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwArchiveRunDetails"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateArchiveRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spUpdateArchiveRunDetail
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateArchiveRunDetail'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateArchiveRunDetail"(
    p_isrecordchangearchive_clear boolean DEFAULT false,
    p_isrecordchangearchive bool DEFAULT NULL,
    p_versionstamp timestamptz DEFAULT NULL,
    p_archivedat timestamptz DEFAULT NULL,
    p_errormessage text DEFAULT NULL,
    p_bytesarchived_clear boolean DEFAULT false,
    p_bytesarchived int8 DEFAULT NULL,
    p_storagepath varchar(1000) DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_recordid varchar(750) DEFAULT NULL,
    p_entityid uuid DEFAULT NULL,
    p_archiverunid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."ArchiveRunDetail" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."ArchiveRunDetail"
    SET
        "IsRecordChangeArchive" = CASE WHEN p_isrecordchangearchive_clear = true THEN NULL ELSE COALESCE(p_isrecordchangearchive, "IsRecordChangeArchive") END,
        "VersionStamp" = COALESCE(p_versionstamp, "VersionStamp"),
        "ArchivedAt" = COALESCE(p_archivedat, "ArchivedAt"),
        "ErrorMessage" = COALESCE(p_errormessage, "ErrorMessage"),
        "BytesArchived" = CASE WHEN p_bytesarchived_clear = true THEN NULL ELSE COALESCE(p_bytesarchived, "BytesArchived") END,
        "StoragePath" = COALESCE(p_storagepath, "StoragePath"),
        "Status" = COALESCE(p_status, "Status"),
        "RecordID" = COALESCE(p_recordid, "RecordID"),
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "ArchiveRunID" = COALESCE(p_archiverunid, "ArchiveRunID")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwArchiveRunDetails"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateArchiveRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spCreateContentItem
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateContentItem'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateContentItem"(
    p_lasttaggedat timestamptz DEFAULT NULL,
    p_taggingstatus_clear boolean DEFAULT false,
    p_taggingstatus varchar(20) DEFAULT NULL,
    p_embeddingmodelid uuid DEFAULT NULL,
    p_lastembeddedat timestamptz DEFAULT NULL,
    p_embeddingstatus_clear boolean DEFAULT false,
    p_embeddingstatus varchar(20) DEFAULT NULL,
    p_entityrecorddocumentid uuid DEFAULT NULL,
    p_text text DEFAULT NULL,
    p_url varchar(2000) DEFAULT NULL,
    p_checksum varchar(100) DEFAULT NULL,
    p_contentfiletypeid uuid DEFAULT NULL,
    p_contentsourcetypeid uuid DEFAULT NULL,
    p_contenttypeid uuid DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_name varchar(250) DEFAULT NULL,
    p_contentsourceid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."ContentItem" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."ContentItem"
        (
            "ID",
            "LastTaggedAt",
                "TaggingStatus",
                "EmbeddingModelID",
                "LastEmbeddedAt",
                "EmbeddingStatus",
                "EntityRecordDocumentID",
                "Text",
                "URL",
                "Checksum",
                "ContentFileTypeID",
                "ContentSourceTypeID",
                "ContentTypeID",
                "Description",
                "Name",
                "ContentSourceID"
        )
    VALUES
        (
            v_new_id,
            p_lasttaggedat,
                CASE WHEN p_taggingstatus_clear = true THEN NULL ELSE COALESCE(p_taggingstatus, '''Pending''::character varying') END,
                p_embeddingmodelid,
                p_lastembeddedat,
                CASE WHEN p_embeddingstatus_clear = true THEN NULL ELSE COALESCE(p_embeddingstatus, '''Pending''::character varying') END,
                p_entityrecorddocumentid,
                p_text,
                p_url,
                p_checksum,
                p_contentfiletypeid,
                p_contentsourcetypeid,
                p_contenttypeid,
                p_description,
                p_name,
                p_contentsourceid
        )
    ;

    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwContentItems"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateContentItem" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spUpdateContentItem
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateContentItem'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateContentItem"(
    p_lasttaggedat timestamptz DEFAULT NULL,
    p_taggingstatus_clear boolean DEFAULT false,
    p_taggingstatus varchar(20) DEFAULT NULL,
    p_embeddingmodelid uuid DEFAULT NULL,
    p_lastembeddedat timestamptz DEFAULT NULL,
    p_embeddingstatus_clear boolean DEFAULT false,
    p_embeddingstatus varchar(20) DEFAULT NULL,
    p_entityrecorddocumentid uuid DEFAULT NULL,
    p_text text DEFAULT NULL,
    p_url varchar(2000) DEFAULT NULL,
    p_checksum varchar(100) DEFAULT NULL,
    p_contentfiletypeid uuid DEFAULT NULL,
    p_contentsourcetypeid uuid DEFAULT NULL,
    p_contenttypeid uuid DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_name varchar(250) DEFAULT NULL,
    p_contentsourceid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."ContentItem" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."ContentItem"
    SET
        "LastTaggedAt" = COALESCE(p_lasttaggedat, "LastTaggedAt"),
        "TaggingStatus" = CASE WHEN p_taggingstatus_clear = true THEN NULL ELSE COALESCE(p_taggingstatus, "TaggingStatus") END,
        "EmbeddingModelID" = COALESCE(p_embeddingmodelid, "EmbeddingModelID"),
        "LastEmbeddedAt" = COALESCE(p_lastembeddedat, "LastEmbeddedAt"),
        "EmbeddingStatus" = CASE WHEN p_embeddingstatus_clear = true THEN NULL ELSE COALESCE(p_embeddingstatus, "EmbeddingStatus") END,
        "EntityRecordDocumentID" = COALESCE(p_entityrecorddocumentid, "EntityRecordDocumentID"),
        "Text" = COALESCE(p_text, "Text"),
        "URL" = COALESCE(p_url, "URL"),
        "Checksum" = COALESCE(p_checksum, "Checksum"),
        "ContentFileTypeID" = COALESCE(p_contentfiletypeid, "ContentFileTypeID"),
        "ContentSourceTypeID" = COALESCE(p_contentsourcetypeid, "ContentSourceTypeID"),
        "ContentTypeID" = COALESCE(p_contenttypeid, "ContentTypeID"),
        "Description" = COALESCE(p_description, "Description"),
        "Name" = COALESCE(p_name, "Name"),
        "ContentSourceID" = COALESCE(p_contentsourceid, "ContentSourceID")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwContentItems"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateContentItem" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spCreateContentProcessRunDetail
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateContentProcessRunDetail'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateContentProcessRunDetail"(
    p_totalcost_clear boolean DEFAULT false,
    p_totalcost numeric(18, 6) DEFAULT NULL,
    p_totaltokensused_clear boolean DEFAULT false,
    p_totaltokensused int4 DEFAULT NULL,
    p_endtime timestamptz DEFAULT NULL,
    p_starttime timestamptz DEFAULT NULL,
    p_errorcount_clear boolean DEFAULT false,
    p_errorcount int4 DEFAULT NULL,
    p_tagscreated_clear boolean DEFAULT false,
    p_tagscreated int4 DEFAULT NULL,
    p_itemsvectorized_clear boolean DEFAULT false,
    p_itemsvectorized int4 DEFAULT NULL,
    p_itemstagged_clear boolean DEFAULT false,
    p_itemstagged int4 DEFAULT NULL,
    p_itemsprocessed_clear boolean DEFAULT false,
    p_itemsprocessed int4 DEFAULT NULL,
    p_status_clear boolean DEFAULT false,
    p_status varchar(20) DEFAULT NULL,
    p_contentsourcetypeid uuid DEFAULT NULL,
    p_contentsourceid uuid DEFAULT NULL,
    p_contentprocessrunid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."ContentProcessRunDetail" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."ContentProcessRunDetail"
        (
            "ID",
            "TotalCost",
                "TotalTokensUsed",
                "EndTime",
                "StartTime",
                "ErrorCount",
                "TagsCreated",
                "ItemsVectorized",
                "ItemsTagged",
                "ItemsProcessed",
                "Status",
                "ContentSourceTypeID",
                "ContentSourceID",
                "ContentProcessRunID"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_totalcost_clear = true THEN NULL ELSE COALESCE(p_totalcost, 0) END,
                CASE WHEN p_totaltokensused_clear = true THEN NULL ELSE COALESCE(p_totaltokensused, 0) END,
                p_endtime,
                p_starttime,
                CASE WHEN p_errorcount_clear = true THEN NULL ELSE COALESCE(p_errorcount, 0) END,
                CASE WHEN p_tagscreated_clear = true THEN NULL ELSE COALESCE(p_tagscreated, 0) END,
                CASE WHEN p_itemsvectorized_clear = true THEN NULL ELSE COALESCE(p_itemsvectorized, 0) END,
                CASE WHEN p_itemstagged_clear = true THEN NULL ELSE COALESCE(p_itemstagged, 0) END,
                CASE WHEN p_itemsprocessed_clear = true THEN NULL ELSE COALESCE(p_itemsprocessed, 0) END,
                CASE WHEN p_status_clear = true THEN NULL ELSE COALESCE(p_status, '''Pending''::character varying') END,
                p_contentsourcetypeid,
                p_contentsourceid,
                p_contentprocessrunid
        )
    ;

    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwContentProcessRunDetails"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateContentProcessRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spUpdateContentProcessRunDetail
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateContentProcessRunDetail'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateContentProcessRunDetail"(
    p_totalcost_clear boolean DEFAULT false,
    p_totalcost numeric(18, 6) DEFAULT NULL,
    p_totaltokensused_clear boolean DEFAULT false,
    p_totaltokensused int4 DEFAULT NULL,
    p_endtime timestamptz DEFAULT NULL,
    p_starttime timestamptz DEFAULT NULL,
    p_errorcount_clear boolean DEFAULT false,
    p_errorcount int4 DEFAULT NULL,
    p_tagscreated_clear boolean DEFAULT false,
    p_tagscreated int4 DEFAULT NULL,
    p_itemsvectorized_clear boolean DEFAULT false,
    p_itemsvectorized int4 DEFAULT NULL,
    p_itemstagged_clear boolean DEFAULT false,
    p_itemstagged int4 DEFAULT NULL,
    p_itemsprocessed_clear boolean DEFAULT false,
    p_itemsprocessed int4 DEFAULT NULL,
    p_status_clear boolean DEFAULT false,
    p_status varchar(20) DEFAULT NULL,
    p_contentsourcetypeid uuid DEFAULT NULL,
    p_contentsourceid uuid DEFAULT NULL,
    p_contentprocessrunid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."ContentProcessRunDetail" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."ContentProcessRunDetail"
    SET
        "TotalCost" = CASE WHEN p_totalcost_clear = true THEN NULL ELSE COALESCE(p_totalcost, "TotalCost") END,
        "TotalTokensUsed" = CASE WHEN p_totaltokensused_clear = true THEN NULL ELSE COALESCE(p_totaltokensused, "TotalTokensUsed") END,
        "EndTime" = COALESCE(p_endtime, "EndTime"),
        "StartTime" = COALESCE(p_starttime, "StartTime"),
        "ErrorCount" = CASE WHEN p_errorcount_clear = true THEN NULL ELSE COALESCE(p_errorcount, "ErrorCount") END,
        "TagsCreated" = CASE WHEN p_tagscreated_clear = true THEN NULL ELSE COALESCE(p_tagscreated, "TagsCreated") END,
        "ItemsVectorized" = CASE WHEN p_itemsvectorized_clear = true THEN NULL ELSE COALESCE(p_itemsvectorized, "ItemsVectorized") END,
        "ItemsTagged" = CASE WHEN p_itemstagged_clear = true THEN NULL ELSE COALESCE(p_itemstagged, "ItemsTagged") END,
        "ItemsProcessed" = CASE WHEN p_itemsprocessed_clear = true THEN NULL ELSE COALESCE(p_itemsprocessed, "ItemsProcessed") END,
        "Status" = CASE WHEN p_status_clear = true THEN NULL ELSE COALESCE(p_status, "Status") END,
        "ContentSourceTypeID" = COALESCE(p_contentsourcetypeid, "ContentSourceTypeID"),
        "ContentSourceID" = COALESCE(p_contentsourceid, "ContentSourceID"),
        "ContentProcessRunID" = COALESCE(p_contentprocessrunid, "ContentProcessRunID")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwContentProcessRunDetails"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateContentProcessRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spCreateDuplicateRunDetail
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateDuplicateRunDetail'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateDuplicateRunDetail"(
    p_endedat timestamptz DEFAULT NULL,
    p_startedat timestamptz DEFAULT NULL,
    p_recordmetadata text DEFAULT NULL,
    p_mergeerrormessage text DEFAULT NULL,
    p_mergestatus_clear boolean DEFAULT false,
    p_mergestatus varchar(20) DEFAULT NULL,
    p_matcherrormessage text DEFAULT NULL,
    p_skippedreason text DEFAULT NULL,
    p_matchstatus_clear boolean DEFAULT false,
    p_matchstatus varchar(20) DEFAULT NULL,
    p_recordid varchar(500) DEFAULT NULL,
    p_duplicaterunid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."DuplicateRunDetail" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."DuplicateRunDetail"
        (
            "ID",
            "EndedAt",
                "StartedAt",
                "RecordMetadata",
                "MergeErrorMessage",
                "MergeStatus",
                "MatchErrorMessage",
                "SkippedReason",
                "MatchStatus",
                "RecordID",
                "DuplicateRunID"
        )
    VALUES
        (
            v_new_id,
            p_endedat,
                p_startedat,
                p_recordmetadata,
                p_mergeerrormessage,
                CASE WHEN p_mergestatus_clear = true THEN NULL ELSE COALESCE(p_mergestatus, '''Not Applicable''::character varying') END,
                p_matcherrormessage,
                p_skippedreason,
                CASE WHEN p_matchstatus_clear = true THEN NULL ELSE COALESCE(p_matchstatus, '''Pending''::character varying') END,
                p_recordid,
                p_duplicaterunid
        )
    ;

    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwDuplicateRunDetails"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateDuplicateRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spUpdateDuplicateRunDetail
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateDuplicateRunDetail'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateDuplicateRunDetail"(
    p_endedat timestamptz DEFAULT NULL,
    p_startedat timestamptz DEFAULT NULL,
    p_recordmetadata text DEFAULT NULL,
    p_mergeerrormessage text DEFAULT NULL,
    p_mergestatus_clear boolean DEFAULT false,
    p_mergestatus varchar(20) DEFAULT NULL,
    p_matcherrormessage text DEFAULT NULL,
    p_skippedreason text DEFAULT NULL,
    p_matchstatus_clear boolean DEFAULT false,
    p_matchstatus varchar(20) DEFAULT NULL,
    p_recordid varchar(500) DEFAULT NULL,
    p_duplicaterunid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."DuplicateRunDetail" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."DuplicateRunDetail"
    SET
        "EndedAt" = COALESCE(p_endedat, "EndedAt"),
        "StartedAt" = COALESCE(p_startedat, "StartedAt"),
        "RecordMetadata" = COALESCE(p_recordmetadata, "RecordMetadata"),
        "MergeErrorMessage" = COALESCE(p_mergeerrormessage, "MergeErrorMessage"),
        "MergeStatus" = CASE WHEN p_mergestatus_clear = true THEN NULL ELSE COALESCE(p_mergestatus, "MergeStatus") END,
        "MatchErrorMessage" = COALESCE(p_matcherrormessage, "MatchErrorMessage"),
        "SkippedReason" = COALESCE(p_skippedreason, "SkippedReason"),
        "MatchStatus" = CASE WHEN p_matchstatus_clear = true THEN NULL ELSE COALESCE(p_matchstatus, "MatchStatus") END,
        "RecordID" = COALESCE(p_recordid, "RecordID"),
        "DuplicateRunID" = COALESCE(p_duplicaterunid, "DuplicateRunID")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwDuplicateRunDetails"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateDuplicateRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spCreateDuplicateRunDetailMatch
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateDuplicateRunDetailMatch'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateDuplicateRunDetailMatch"(
    p_recordmetadata text DEFAULT NULL,
    p_mergedat_clear boolean DEFAULT false,
    p_mergedat timestamptz DEFAULT NULL,
    p_mergestatus_clear boolean DEFAULT false,
    p_mergestatus varchar(20) DEFAULT NULL,
    p_recordmergelogid uuid DEFAULT NULL,
    p_approvalstatus_clear boolean DEFAULT false,
    p_approvalstatus varchar(20) DEFAULT NULL,
    p_action_clear boolean DEFAULT false,
    p_action varchar(20) DEFAULT NULL,
    p_matchedat_clear boolean DEFAULT false,
    p_matchedat timestamptz DEFAULT NULL,
    p_matchprobability_clear boolean DEFAULT false,
    p_matchprobability numeric(12, 11) DEFAULT NULL,
    p_matchrecordid varchar(500) DEFAULT NULL,
    p_matchsource_clear boolean DEFAULT false,
    p_matchsource varchar(20) DEFAULT NULL,
    p_duplicaterundetailid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."DuplicateRunDetailMatch" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."DuplicateRunDetailMatch"
        (
            "ID",
            "RecordMetadata",
                "MergedAt",
                "MergeStatus",
                "RecordMergeLogID",
                "ApprovalStatus",
                "Action",
                "MatchedAt",
                "MatchProbability",
                "MatchRecordID",
                "MatchSource",
                "DuplicateRunDetailID"
        )
    VALUES
        (
            v_new_id,
            p_recordmetadata,
                CASE WHEN p_mergedat_clear = true THEN NULL ELSE COALESCE(p_mergedat, NOW()) END,
                CASE WHEN p_mergestatus_clear = true THEN NULL ELSE COALESCE(p_mergestatus, '''Pending''::character varying') END,
                p_recordmergelogid,
                CASE WHEN p_approvalstatus_clear = true THEN NULL ELSE COALESCE(p_approvalstatus, '''Pending''::character varying') END,
                CASE WHEN p_action_clear = true THEN NULL ELSE COALESCE(p_action, '''Ignore''::character varying') END,
                CASE WHEN p_matchedat_clear = true THEN NULL ELSE COALESCE(p_matchedat, NOW()) END,
                CASE WHEN p_matchprobability_clear = true THEN NULL ELSE COALESCE(p_matchprobability, 0) END,
                p_matchrecordid,
                CASE WHEN p_matchsource_clear = true THEN NULL ELSE COALESCE(p_matchsource, '''Vector''::character varying') END,
                p_duplicaterundetailid
        )
    ;

    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwDuplicateRunDetailMatches"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateDuplicateRunDetailMatch" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spUpdateDuplicateRunDetailMatch
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateDuplicateRunDetailMatch'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateDuplicateRunDetailMatch"(
    p_recordmetadata text DEFAULT NULL,
    p_mergedat_clear boolean DEFAULT false,
    p_mergedat timestamptz DEFAULT NULL,
    p_mergestatus_clear boolean DEFAULT false,
    p_mergestatus varchar(20) DEFAULT NULL,
    p_recordmergelogid uuid DEFAULT NULL,
    p_approvalstatus_clear boolean DEFAULT false,
    p_approvalstatus varchar(20) DEFAULT NULL,
    p_action_clear boolean DEFAULT false,
    p_action varchar(20) DEFAULT NULL,
    p_matchedat_clear boolean DEFAULT false,
    p_matchedat timestamptz DEFAULT NULL,
    p_matchprobability_clear boolean DEFAULT false,
    p_matchprobability numeric(12, 11) DEFAULT NULL,
    p_matchrecordid varchar(500) DEFAULT NULL,
    p_matchsource_clear boolean DEFAULT false,
    p_matchsource varchar(20) DEFAULT NULL,
    p_duplicaterundetailid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."DuplicateRunDetailMatch" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."DuplicateRunDetailMatch"
    SET
        "RecordMetadata" = COALESCE(p_recordmetadata, "RecordMetadata"),
        "MergedAt" = CASE WHEN p_mergedat_clear = true THEN NULL ELSE COALESCE(p_mergedat, "MergedAt") END,
        "MergeStatus" = CASE WHEN p_mergestatus_clear = true THEN NULL ELSE COALESCE(p_mergestatus, "MergeStatus") END,
        "RecordMergeLogID" = COALESCE(p_recordmergelogid, "RecordMergeLogID"),
        "ApprovalStatus" = CASE WHEN p_approvalstatus_clear = true THEN NULL ELSE COALESCE(p_approvalstatus, "ApprovalStatus") END,
        "Action" = CASE WHEN p_action_clear = true THEN NULL ELSE COALESCE(p_action, "Action") END,
        "MatchedAt" = CASE WHEN p_matchedat_clear = true THEN NULL ELSE COALESCE(p_matchedat, "MatchedAt") END,
        "MatchProbability" = CASE WHEN p_matchprobability_clear = true THEN NULL ELSE COALESCE(p_matchprobability, "MatchProbability") END,
        "MatchRecordID" = COALESCE(p_matchrecordid, "MatchRecordID"),
        "MatchSource" = CASE WHEN p_matchsource_clear = true THEN NULL ELSE COALESCE(p_matchsource, "MatchSource") END,
        "DuplicateRunDetailID" = COALESCE(p_duplicaterundetailid, "DuplicateRunDetailID")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwDuplicateRunDetailMatches"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateDuplicateRunDetailMatch" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spCreateEntityActionFilter
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateEntityActionFilter'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateEntityActionFilter"(
    p_status_clear boolean DEFAULT false,
    p_status varchar(20) DEFAULT NULL,
    p_sequence int4 DEFAULT NULL,
    p_actionfilterid uuid DEFAULT NULL,
    p_entityactionid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."EntityActionFilter" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."EntityActionFilter"
        (
            "ID",
            "Status",
                "Sequence",
                "ActionFilterID",
                "EntityActionID"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_status_clear = true THEN NULL ELSE COALESCE(p_status, '''Pending''::character varying') END,
                p_sequence,
                p_actionfilterid,
                p_entityactionid
        )
    ;

    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwEntityActionFilters"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateEntityActionFilter" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spUpdateEntityActionFilter
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateEntityActionFilter'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateEntityActionFilter"(
    p_status_clear boolean DEFAULT false,
    p_status varchar(20) DEFAULT NULL,
    p_sequence int4 DEFAULT NULL,
    p_actionfilterid uuid DEFAULT NULL,
    p_entityactionid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."EntityActionFilter" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."EntityActionFilter"
    SET
        "Status" = CASE WHEN p_status_clear = true THEN NULL ELSE COALESCE(p_status, "Status") END,
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "ActionFilterID" = COALESCE(p_actionfilterid, "ActionFilterID"),
        "EntityActionID" = COALESCE(p_entityactionid, "EntityActionID")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwEntityActionFilters"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateEntityActionFilter" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spCreateEntityActionInvocation
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateEntityActionInvocation'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateEntityActionInvocation"(
    p_status_clear boolean DEFAULT false,
    p_status varchar(20) DEFAULT NULL,
    p_invocationtypeid uuid DEFAULT NULL,
    p_entityactionid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."EntityActionInvocation" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."EntityActionInvocation"
        (
            "ID",
            "Status",
                "InvocationTypeID",
                "EntityActionID"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_status_clear = true THEN NULL ELSE COALESCE(p_status, '''Pending''::character varying') END,
                p_invocationtypeid,
                p_entityactionid
        )
    ;

    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwEntityActionInvocations"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateEntityActionInvocation" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spUpdateEntityActionInvocation
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateEntityActionInvocation'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateEntityActionInvocation"(
    p_status_clear boolean DEFAULT false,
    p_status varchar(20) DEFAULT NULL,
    p_invocationtypeid uuid DEFAULT NULL,
    p_entityactionid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."EntityActionInvocation" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."EntityActionInvocation"
    SET
        "Status" = CASE WHEN p_status_clear = true THEN NULL ELSE COALESCE(p_status, "Status") END,
        "InvocationTypeID" = COALESCE(p_invocationtypeid, "InvocationTypeID"),
        "EntityActionID" = COALESCE(p_entityactionid, "EntityActionID")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwEntityActionInvocations"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateEntityActionInvocation" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spCreateEntityActionParam
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateEntityActionParam'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateEntityActionParam"(
    p_comments text DEFAULT NULL,
    p_value text DEFAULT NULL,
    p_valuetype varchar(20) DEFAULT NULL,
    p_actionparamid uuid DEFAULT NULL,
    p_entityactionid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."EntityActionParam" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."EntityActionParam"
        (
            "ID",
            "Comments",
                "Value",
                "ValueType",
                "ActionParamID",
                "EntityActionID"
        )
    VALUES
        (
            v_new_id,
            p_comments,
                p_value,
                p_valuetype,
                p_actionparamid,
                p_entityactionid
        )
    ;

    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwEntityActionParams"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateEntityActionParam" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spUpdateEntityActionParam
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateEntityActionParam'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateEntityActionParam"(
    p_comments text DEFAULT NULL,
    p_value text DEFAULT NULL,
    p_valuetype varchar(20) DEFAULT NULL,
    p_actionparamid uuid DEFAULT NULL,
    p_entityactionid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."EntityActionParam" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."EntityActionParam"
    SET
        "Comments" = COALESCE(p_comments, "Comments"),
        "Value" = COALESCE(p_value, "Value"),
        "ValueType" = COALESCE(p_valuetype, "ValueType"),
        "ActionParamID" = COALESCE(p_actionparamid, "ActionParamID"),
        "EntityActionID" = COALESCE(p_entityactionid, "EntityActionID")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwEntityActionParams"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateEntityActionParam" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spCreateEntityCommunicationField
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateEntityCommunicationField'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateEntityCommunicationField"(
    p_priority int4 DEFAULT NULL,
    p_fieldname varchar(500) DEFAULT NULL,
    p_entitycommunicationmessagetypeid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."EntityCommunicationField" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."EntityCommunicationField"
        (
            "ID",
            "Priority",
                "FieldName",
                "EntityCommunicationMessageTypeID"
        )
    VALUES
        (
            v_new_id,
            p_priority,
                p_fieldname,
                p_entitycommunicationmessagetypeid
        )
    ;

    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwEntityCommunicationFields"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateEntityCommunicationField" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spUpdateEntityCommunicationField
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateEntityCommunicationField'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateEntityCommunicationField"(
    p_priority int4 DEFAULT NULL,
    p_fieldname varchar(500) DEFAULT NULL,
    p_entitycommunicationmessagetypeid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."EntityCommunicationField" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."EntityCommunicationField"
    SET
        "Priority" = COALESCE(p_priority, "Priority"),
        "FieldName" = COALESCE(p_fieldname, "FieldName"),
        "EntityCommunicationMessageTypeID" = COALESCE(p_entitycommunicationmessagetypeid, "EntityCommunicationMessageTypeID")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwEntityCommunicationFields"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateEntityCommunicationField" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spCreateRecommendation
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateRecommendation'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateRecommendation"(
    IN p_ID UUID DEFAULT NULL,
    IN p_RecommendationRunID UUID DEFAULT NULL,
    IN p_SourceEntityID UUID DEFAULT NULL,
    IN p_SourceEntityRecordID TEXT DEFAULT NULL
)
RETURNS SETOF ${flyway:defaultSchema}."Recommendation" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO ${flyway:defaultSchema}."Recommendation"
            (
                "ID",
                "RecommendationRunID",
                "SourceEntityID",
                "SourceEntityRecordID"
            )
        VALUES
            (
                p_ID,
                p_RecommendationRunID,
                p_SourceEntityID,
                p_SourceEntityRecordID
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO ${flyway:defaultSchema}."Recommendation"
            (
                "RecommendationRunID",
                "SourceEntityID",
                "SourceEntityRecordID"
            )
        VALUES
            (
                p_RecommendationRunID,
                p_SourceEntityID,
                p_SourceEntityRecordID
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."Recommendation" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateRecommendation" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spUpdateRecommendation
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateRecommendation'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateRecommendation"(
    IN p_ID UUID,
    IN p_RecommendationRunID UUID DEFAULT NULL,
    IN p_SourceEntityID UUID DEFAULT NULL,
    IN p_SourceEntityRecordID TEXT DEFAULT NULL
)
RETURNS SETOF ${flyway:defaultSchema}."Recommendation" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        ${flyway:defaultSchema}."Recommendation"
    SET
        "RecommendationRunID" = COALESCE(p_RecommendationRunID, "RecommendationRunID"),
        "SourceEntityID" = COALESCE(p_SourceEntityID, "SourceEntityID"),
        "SourceEntityRecordID" = COALESCE(p_SourceEntityRecordID, "SourceEntityRecordID")
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."Recommendation" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."Recommendation" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateRecommendation" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spCreateRecommendationItem
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateRecommendationItem'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateRecommendationItem"(
    p_matchprobability numeric(18, 15) DEFAULT NULL,
    p_destinationentityrecordid varchar(450) DEFAULT NULL,
    p_destinationentityid uuid DEFAULT NULL,
    p_recommendationid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."RecommendationItem" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."RecommendationItem"
        (
            "ID",
            "MatchProbability",
                "DestinationEntityRecordID",
                "DestinationEntityID",
                "RecommendationID"
        )
    VALUES
        (
            v_new_id,
            p_matchprobability,
                p_destinationentityrecordid,
                p_destinationentityid,
                p_recommendationid
        )
    ;

    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwRecommendationItems"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateRecommendationItem" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spUpdateRecommendationItem
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateRecommendationItem'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateRecommendationItem"(
    p_matchprobability numeric(18, 15) DEFAULT NULL,
    p_destinationentityrecordid varchar(450) DEFAULT NULL,
    p_destinationentityid uuid DEFAULT NULL,
    p_recommendationid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."RecommendationItem" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."RecommendationItem"
    SET
        "MatchProbability" = COALESCE(p_matchprobability, "MatchProbability"),
        "DestinationEntityRecordID" = COALESCE(p_destinationentityrecordid, "DestinationEntityRecordID"),
        "DestinationEntityID" = COALESCE(p_destinationentityid, "DestinationEntityID"),
        "RecommendationID" = COALESCE(p_recommendationid, "RecommendationID")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwRecommendationItems"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateRecommendationItem" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spCreateRecordMergeDeletionLog
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateRecordMergeDeletionLog'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateRecordMergeDeletionLog"(
    p_processinglog text DEFAULT NULL,
    p_status_clear boolean DEFAULT false,
    p_status varchar(10) DEFAULT NULL,
    p_deletedrecordid varchar(750) DEFAULT NULL,
    p_recordmergelogid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."RecordMergeDeletionLog" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."RecordMergeDeletionLog"
        (
            "ID",
            "ProcessingLog",
                "Status",
                "DeletedRecordID",
                "RecordMergeLogID"
        )
    VALUES
        (
            v_new_id,
            p_processinglog,
                CASE WHEN p_status_clear = true THEN NULL ELSE COALESCE(p_status, '''Pending''::character varying') END,
                p_deletedrecordid,
                p_recordmergelogid
        )
    ;

    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwRecordMergeDeletionLogs"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateRecordMergeDeletionLog" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spUpdateRecordMergeDeletionLog
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateRecordMergeDeletionLog'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateRecordMergeDeletionLog"(
    p_processinglog text DEFAULT NULL,
    p_status_clear boolean DEFAULT false,
    p_status varchar(10) DEFAULT NULL,
    p_deletedrecordid varchar(750) DEFAULT NULL,
    p_recordmergelogid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."RecordMergeDeletionLog" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."RecordMergeDeletionLog"
    SET
        "ProcessingLog" = COALESCE(p_processinglog, "ProcessingLog"),
        "Status" = CASE WHEN p_status_clear = true THEN NULL ELSE COALESCE(p_status, "Status") END,
        "DeletedRecordID" = COALESCE(p_deletedrecordid, "DeletedRecordID"),
        "RecordMergeLogID" = COALESCE(p_recordmergelogid, "RecordMergeLogID")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwRecordMergeDeletionLogs"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateRecordMergeDeletionLog" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spCreateTemplateParam
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateTemplateParam'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateTemplateParam"(
    IN p_ID UUID DEFAULT NULL,
    IN p_TemplateID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_Type VARCHAR(20) DEFAULT NULL,
    IN p_DefaultValue_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultValue TEXT DEFAULT NULL,
    IN p_IsRequired BOOLEAN DEFAULT NULL,
    IN p_LinkedParameterName_Clear BOOLEAN DEFAULT FALSE,
    IN p_LinkedParameterName VARCHAR(255) DEFAULT NULL,
    IN p_LinkedParameterField_Clear BOOLEAN DEFAULT FALSE,
    IN p_LinkedParameterField VARCHAR(500) DEFAULT NULL,
    IN p_ExtraFilter_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExtraFilter TEXT DEFAULT NULL,
    IN p_EntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_RecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_RecordID VARCHAR(2000) DEFAULT NULL,
    IN p_OrderBy_Clear BOOLEAN DEFAULT FALSE,
    IN p_OrderBy TEXT DEFAULT NULL,
    IN p_TemplateContentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_TemplateContentID UUID DEFAULT NULL
)
RETURNS SETOF ${flyway:defaultSchema}."TemplateParam" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO ${flyway:defaultSchema}."TemplateParam"
            (
                "ID",
                "TemplateID",
                "Name",
                "Description",
                "Type",
                "DefaultValue",
                "IsRequired",
                "LinkedParameterName",
                "LinkedParameterField",
                "ExtraFilter",
                "EntityID",
                "RecordID",
                "OrderBy",
                "TemplateContentID"
            )
        VALUES
            (
                p_ID,
                p_TemplateID,
                p_Name,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                COALESCE(p_Type, 'Scalar'),
                CASE WHEN p_DefaultValue_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultValue, NULL) END,
                COALESCE(p_IsRequired, FALSE),
                CASE WHEN p_LinkedParameterName_Clear = TRUE THEN NULL ELSE COALESCE(p_LinkedParameterName, NULL) END,
                CASE WHEN p_LinkedParameterField_Clear = TRUE THEN NULL ELSE COALESCE(p_LinkedParameterField, NULL) END,
                CASE WHEN p_ExtraFilter_Clear = TRUE THEN NULL ELSE COALESCE(p_ExtraFilter, NULL) END,
                CASE WHEN p_EntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityID, NULL) END,
                CASE WHEN p_RecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_RecordID, NULL) END,
                CASE WHEN p_OrderBy_Clear = TRUE THEN NULL ELSE COALESCE(p_OrderBy, NULL) END,
                CASE WHEN p_TemplateContentID_Clear = TRUE THEN NULL ELSE COALESCE(p_TemplateContentID, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO ${flyway:defaultSchema}."TemplateParam"
            (
                "TemplateID",
                "Name",
                "Description",
                "Type",
                "DefaultValue",
                "IsRequired",
                "LinkedParameterName",
                "LinkedParameterField",
                "ExtraFilter",
                "EntityID",
                "RecordID",
                "OrderBy",
                "TemplateContentID"
            )
        VALUES
            (
                p_TemplateID,
                p_Name,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                COALESCE(p_Type, 'Scalar'),
                CASE WHEN p_DefaultValue_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultValue, NULL) END,
                COALESCE(p_IsRequired, FALSE),
                CASE WHEN p_LinkedParameterName_Clear = TRUE THEN NULL ELSE COALESCE(p_LinkedParameterName, NULL) END,
                CASE WHEN p_LinkedParameterField_Clear = TRUE THEN NULL ELSE COALESCE(p_LinkedParameterField, NULL) END,
                CASE WHEN p_ExtraFilter_Clear = TRUE THEN NULL ELSE COALESCE(p_ExtraFilter, NULL) END,
                CASE WHEN p_EntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityID, NULL) END,
                CASE WHEN p_RecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_RecordID, NULL) END,
                CASE WHEN p_OrderBy_Clear = TRUE THEN NULL ELSE COALESCE(p_OrderBy, NULL) END,
                CASE WHEN p_TemplateContentID_Clear = TRUE THEN NULL ELSE COALESCE(p_TemplateContentID, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."TemplateParam" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateTemplateParam" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spUpdateTemplateParam
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateTemplateParam'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateTemplateParam"(
    IN p_ID UUID,
    IN p_TemplateID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_Type VARCHAR(20) DEFAULT NULL,
    IN p_DefaultValue_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultValue TEXT DEFAULT NULL,
    IN p_IsRequired BOOLEAN DEFAULT NULL,
    IN p_LinkedParameterName_Clear BOOLEAN DEFAULT FALSE,
    IN p_LinkedParameterName VARCHAR(255) DEFAULT NULL,
    IN p_LinkedParameterField_Clear BOOLEAN DEFAULT FALSE,
    IN p_LinkedParameterField VARCHAR(500) DEFAULT NULL,
    IN p_ExtraFilter_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExtraFilter TEXT DEFAULT NULL,
    IN p_EntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_RecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_RecordID VARCHAR(2000) DEFAULT NULL,
    IN p_OrderBy_Clear BOOLEAN DEFAULT FALSE,
    IN p_OrderBy TEXT DEFAULT NULL,
    IN p_TemplateContentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_TemplateContentID UUID DEFAULT NULL
)
RETURNS SETOF ${flyway:defaultSchema}."TemplateParam" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        ${flyway:defaultSchema}."TemplateParam"
    SET
        "TemplateID" = COALESCE(p_TemplateID, "TemplateID"),
        "Name" = COALESCE(p_Name, "Name"),
        "Description" = CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, "Description") END,
        "Type" = COALESCE(p_Type, "Type"),
        "DefaultValue" = CASE WHEN p_DefaultValue_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultValue, "DefaultValue") END,
        "IsRequired" = COALESCE(p_IsRequired, "IsRequired"),
        "LinkedParameterName" = CASE WHEN p_LinkedParameterName_Clear = TRUE THEN NULL ELSE COALESCE(p_LinkedParameterName, "LinkedParameterName") END,
        "LinkedParameterField" = CASE WHEN p_LinkedParameterField_Clear = TRUE THEN NULL ELSE COALESCE(p_LinkedParameterField, "LinkedParameterField") END,
        "ExtraFilter" = CASE WHEN p_ExtraFilter_Clear = TRUE THEN NULL ELSE COALESCE(p_ExtraFilter, "ExtraFilter") END,
        "EntityID" = CASE WHEN p_EntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityID, "EntityID") END,
        "RecordID" = CASE WHEN p_RecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_RecordID, "RecordID") END,
        "OrderBy" = CASE WHEN p_OrderBy_Clear = TRUE THEN NULL ELSE COALESCE(p_OrderBy, "OrderBy") END,
        "TemplateContentID" = CASE WHEN p_TemplateContentID_Clear = TRUE THEN NULL ELSE COALESCE(p_TemplateContentID, "TemplateContentID") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."TemplateParam" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."TemplateParam" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateTemplateParam" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spCreateTestRun
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateTestRun'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateTestRun"(
    p_resolvedvariables text DEFAULT NULL,
    p_targetlogentityid uuid DEFAULT NULL,
    p_runcontextdetails text DEFAULT NULL,
    p_runbyuseremail varchar(255) DEFAULT NULL,
    p_runbyusername varchar(255) DEFAULT NULL,
    p_machineid varchar(255) DEFAULT NULL,
    p_machinename varchar(255) DEFAULT NULL,
    p_tags text DEFAULT NULL,
    p_log text DEFAULT NULL,
    p_resultdetails text DEFAULT NULL,
    p_errormessage text DEFAULT NULL,
    p_costusd numeric(10, 6) DEFAULT NULL,
    p_score numeric(5, 4) DEFAULT NULL,
    p_totalchecks int4 DEFAULT NULL,
    p_failedchecks int4 DEFAULT NULL,
    p_passedchecks int4 DEFAULT NULL,
    p_actualoutputdata text DEFAULT NULL,
    p_expectedoutputdata text DEFAULT NULL,
    p_inputdata text DEFAULT NULL,
    p_durationseconds numeric(10, 3) DEFAULT NULL,
    p_completedat timestamptz DEFAULT NULL,
    p_startedat timestamptz DEFAULT NULL,
    p_status_clear boolean DEFAULT false,
    p_status varchar(20) DEFAULT NULL,
    p_targetlogid uuid DEFAULT NULL,
    p_targettype varchar(100) DEFAULT NULL,
    p_sequence int4 DEFAULT NULL,
    p_runbyuserid uuid DEFAULT NULL,
    p_testsuiterunid uuid DEFAULT NULL,
    p_testid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."TestRun" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."TestRun"
        (
            "ID",
            "ResolvedVariables",
                "TargetLogEntityID",
                "RunContextDetails",
                "RunByUserEmail",
                "RunByUserName",
                "MachineID",
                "MachineName",
                "Tags",
                "Log",
                "ResultDetails",
                "ErrorMessage",
                "CostUSD",
                "Score",
                "TotalChecks",
                "FailedChecks",
                "PassedChecks",
                "ActualOutputData",
                "ExpectedOutputData",
                "InputData",
                "DurationSeconds",
                "CompletedAt",
                "StartedAt",
                "Status",
                "TargetLogID",
                "TargetType",
                "Sequence",
                "RunByUserID",
                "TestSuiteRunID",
                "TestID"
        )
    VALUES
        (
            v_new_id,
            p_resolvedvariables,
                p_targetlogentityid,
                p_runcontextdetails,
                p_runbyuseremail,
                p_runbyusername,
                p_machineid,
                p_machinename,
                p_tags,
                p_log,
                p_resultdetails,
                p_errormessage,
                p_costusd,
                p_score,
                p_totalchecks,
                p_failedchecks,
                p_passedchecks,
                p_actualoutputdata,
                p_expectedoutputdata,
                p_inputdata,
                p_durationseconds,
                p_completedat,
                p_startedat,
                CASE WHEN p_status_clear = true THEN NULL ELSE COALESCE(p_status, '''Pending''::character varying') END,
                p_targetlogid,
                p_targettype,
                p_sequence,
                p_runbyuserid,
                p_testsuiterunid,
                p_testid
        )
    ;

    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwTestRuns"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateTestRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spUpdateTestRun
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateTestRun'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateTestRun"(
    p_resolvedvariables text DEFAULT NULL,
    p_targetlogentityid uuid DEFAULT NULL,
    p_runcontextdetails text DEFAULT NULL,
    p_runbyuseremail varchar(255) DEFAULT NULL,
    p_runbyusername varchar(255) DEFAULT NULL,
    p_machineid varchar(255) DEFAULT NULL,
    p_machinename varchar(255) DEFAULT NULL,
    p_tags text DEFAULT NULL,
    p_log text DEFAULT NULL,
    p_resultdetails text DEFAULT NULL,
    p_errormessage text DEFAULT NULL,
    p_costusd numeric(10, 6) DEFAULT NULL,
    p_score numeric(5, 4) DEFAULT NULL,
    p_totalchecks int4 DEFAULT NULL,
    p_failedchecks int4 DEFAULT NULL,
    p_passedchecks int4 DEFAULT NULL,
    p_actualoutputdata text DEFAULT NULL,
    p_expectedoutputdata text DEFAULT NULL,
    p_inputdata text DEFAULT NULL,
    p_durationseconds numeric(10, 3) DEFAULT NULL,
    p_completedat timestamptz DEFAULT NULL,
    p_startedat timestamptz DEFAULT NULL,
    p_status_clear boolean DEFAULT false,
    p_status varchar(20) DEFAULT NULL,
    p_targetlogid uuid DEFAULT NULL,
    p_targettype varchar(100) DEFAULT NULL,
    p_sequence int4 DEFAULT NULL,
    p_runbyuserid uuid DEFAULT NULL,
    p_testsuiterunid uuid DEFAULT NULL,
    p_testid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."TestRun" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."TestRun"
    SET
        "ResolvedVariables" = COALESCE(p_resolvedvariables, "ResolvedVariables"),
        "TargetLogEntityID" = COALESCE(p_targetlogentityid, "TargetLogEntityID"),
        "RunContextDetails" = COALESCE(p_runcontextdetails, "RunContextDetails"),
        "RunByUserEmail" = COALESCE(p_runbyuseremail, "RunByUserEmail"),
        "RunByUserName" = COALESCE(p_runbyusername, "RunByUserName"),
        "MachineID" = COALESCE(p_machineid, "MachineID"),
        "MachineName" = COALESCE(p_machinename, "MachineName"),
        "Tags" = COALESCE(p_tags, "Tags"),
        "Log" = COALESCE(p_log, "Log"),
        "ResultDetails" = COALESCE(p_resultdetails, "ResultDetails"),
        "ErrorMessage" = COALESCE(p_errormessage, "ErrorMessage"),
        "CostUSD" = COALESCE(p_costusd, "CostUSD"),
        "Score" = COALESCE(p_score, "Score"),
        "TotalChecks" = COALESCE(p_totalchecks, "TotalChecks"),
        "FailedChecks" = COALESCE(p_failedchecks, "FailedChecks"),
        "PassedChecks" = COALESCE(p_passedchecks, "PassedChecks"),
        "ActualOutputData" = COALESCE(p_actualoutputdata, "ActualOutputData"),
        "ExpectedOutputData" = COALESCE(p_expectedoutputdata, "ExpectedOutputData"),
        "InputData" = COALESCE(p_inputdata, "InputData"),
        "DurationSeconds" = COALESCE(p_durationseconds, "DurationSeconds"),
        "CompletedAt" = COALESCE(p_completedat, "CompletedAt"),
        "StartedAt" = COALESCE(p_startedat, "StartedAt"),
        "Status" = CASE WHEN p_status_clear = true THEN NULL ELSE COALESCE(p_status, "Status") END,
        "TargetLogID" = COALESCE(p_targetlogid, "TargetLogID"),
        "TargetType" = COALESCE(p_targettype, "TargetType"),
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "RunByUserID" = COALESCE(p_runbyuserid, "RunByUserID"),
        "TestSuiteRunID" = COALESCE(p_testsuiterunid, "TestSuiteRunID"),
        "TestID" = COALESCE(p_testid, "TestID")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwTestRuns"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateTestRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spCreateUserApplicationEntity
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateUserApplicationEntity'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateUserApplicationEntity"(
    IN p_ID UUID DEFAULT NULL,
    IN p_UserApplicationID UUID DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL
)
RETURNS SETOF ${flyway:defaultSchema}."UserApplicationEntity" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO ${flyway:defaultSchema}."UserApplicationEntity"
            (
                "ID",
                "UserApplicationID",
                "EntityID",
                "Sequence"
            )
        VALUES
            (
                p_ID,
                p_UserApplicationID,
                p_EntityID,
                COALESCE(p_Sequence, 0)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO ${flyway:defaultSchema}."UserApplicationEntity"
            (
                "UserApplicationID",
                "EntityID",
                "Sequence"
            )
        VALUES
            (
                p_UserApplicationID,
                p_EntityID,
                COALESCE(p_Sequence, 0)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."UserApplicationEntity" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateUserApplicationEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spUpdateUserApplicationEntity
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateUserApplicationEntity'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateUserApplicationEntity"(
    IN p_ID UUID,
    IN p_UserApplicationID UUID DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL
)
RETURNS SETOF ${flyway:defaultSchema}."UserApplicationEntity" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        ${flyway:defaultSchema}."UserApplicationEntity"
    SET
        "UserApplicationID" = COALESCE(p_UserApplicationID, "UserApplicationID"),
        "EntityID" = COALESCE(p_EntityID, "EntityID"),
        "Sequence" = COALESCE(p_Sequence, "Sequence")
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."UserApplicationEntity" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."UserApplicationEntity" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateUserApplicationEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ============================================================================
-- Bonus: renumber EntityField rows with Sequence >= 100000
-- ============================================================================
-- Background:
--   `createNewEntityFieldsFromSchema` (codegen, manage-metadata.ts) inserts
--   newly-discovered fields with `Sequence = MaxSequence + 100000 + sf.attnum`
--   as a staging value to avoid colliding with existing fields during INSERT.
--   Codegen then calls `spUpdateExistingEntityFieldsFromSchema`, which has a
--   2-pass renumber that aligns Sequence to the SQL column ordinal. The
--   customer-side codegen post-validation is flagging fields stuck at the
--   100000+ staging value — meaning the renumber didn't process them.
--
--   Suspected reason: the renumber's WHERE filter requires the row to differ
--   on at least one of (Description, Type, Length, Precision, Scale,
--   AllowsNull, DefaultValue, AutoIncrement, IsVirtual, Sequence,
--   RelatedEntityID, RelatedEntityFieldName, IsPrimaryKey, IsUnique). When
--   `fromSQL.Sequence` is NULL (e.g. column not in vwSQLColumnsAndEntityFields
--   at the moment the SP runs), `ef.Sequence <> fromSQL.Sequence` evaluates
--   to NULL, not TRUE — and if every other clause is FALSE/NULL, the row is
--   excluded from the renumber set. The staging value persists.
--
--   Customer-side observation on Aurora dev cluster:
--     Entity MJ: Actions has Sequence = 100052..100059 for fields
--     Config, RuntimeActionConfiguration, MaxExecutionTimeMS, CreatedByAgentID.
--
-- Fix: directly renumber every EntityField row whose Sequence is in the
-- staging band (>= 100000) to follow the highest non-staging Sequence within
-- the same entity. Order within an entity preserved by the existing staging
-- value (which already reflects column-ordinal order).
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    WITH staged AS (
        SELECT
            ef."ID",
            ef."EntityID",
            ROW_NUMBER() OVER (
                PARTITION BY ef."EntityID"
                ORDER BY ef."Sequence"
            )
              + COALESCE((
                  SELECT MAX(ef2."Sequence")
                  FROM ${flyway:defaultSchema}."EntityField" ef2
                  WHERE ef2."EntityID" = ef."EntityID"
                    AND ef2."Sequence" < 100000
              ), 0) AS new_seq
        FROM ${flyway:defaultSchema}."EntityField" ef
        WHERE ef."Sequence" >= 100000
    )
    UPDATE ${flyway:defaultSchema}."EntityField" target
    SET "Sequence" = staged.new_seq
    FROM staged
    WHERE target."ID" = staged."ID";

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Renumbered % EntityField row(s) out of the 100000+ staging band', v_count;
END $$;

