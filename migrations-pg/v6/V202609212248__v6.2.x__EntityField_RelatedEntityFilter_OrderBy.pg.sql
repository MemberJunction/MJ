-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202609212248__v6.2.x__EntityField_RelatedEntityFilter_OrderBy.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."EntityField"
  ADD COLUMN "RelatedEntityFilter" TEXT NULL,
  ADD COLUMN "RelatedEntityOrderBy" VARCHAR(500) NULL
 /* ============================================================================= */ /* EntityField.RelatedEntityFilter / RelatedEntityOrderBy — scope and order a */ /* foreign-key picker from metadata instead of from every form that renders it. */ /* ============================================================================= */ /* WHAT THIS ENABLES. A foreign key currently offers every row of the related */ /* entity. On a directory with hundreds of thousands of rows that means a user */ /* typing three letters is shown an arbitrary twenty records containing those */ /* letters, most of which are not plausible values for the field. The app knows */ /* which rows are plausible and has nowhere to say so: RelatedEntityID and */ /* RelatedEntityDisplayType are already on this row, but neither narrows or */ /* orders the population. */ /*     RelatedEntityFilter  = N'Status = ''Active''' */ /*     RelatedEntityOrderBy = N'[Name]' */ /* RelatedEntityFilter is AND-ed with whatever the user types, on both the */ /* browse list and the search path. RelatedEntityOrderBy orders the browse list */ /* the user sees on focus; the search path is ranked by relevance instead. */ /* WHY COLUMNS RATHER THAN A JSONType. Unlike EmbeddedRecord, these are not an */ /* evolving policy object — they are two SQL fragments with no options and no */ /* foreseeable third sibling. A JSONType would buy nothing and cost every */ /* consumer a parse. */ /* WHY AUTHORED, NOT DERIVED. CodeGen discovers foreign keys from the catalog, */ /* but the catalog cannot know which rows of the target are plausible for a */ /* given field — that is a statement about the business, not the schema. So */ /* these two columns are hand-set (metadata JSON or the Entity Field form) and */ /* CodeGen must leave them alone, exactly as RelatedEntityNameFieldMap is. */ /* ADDITIVE ON PURPOSE. NULL — every existing row — means no filter and order */ /* by the related entity's name field, which is the behaviour a picker already */ /* has. Nothing changes for a field nobody configures. */ /* SEE ALSO. MemberJunction/MJ#4639 and the FKLookupStrategy seam in */ /* @memberjunction/ng-base-forms, which is what reads these. */ /* ============================================================================= */;

COMMENT ON COLUMN __mj."EntityField"."RelatedEntityFilter" IS 'Optional SQL WHERE fragment applied to every lookup on this foreign key (e.g. Status = ''Active''), AND-ed with whatever the user types, on both the browse list and the search path. Lets a picker be scoped from metadata rather than from every form template that renders the field. Authored by hand — CodeGen never derives or overwrites it. NULL means no filter, which is the pre-feature behaviour.';

COMMENT ON COLUMN __mj."EntityField"."RelatedEntityOrderBy" IS 'Optional ORDER BY fragment for the empty-query browse list on this foreign key, e.g. [Name] or [LastActivityDate] DESC. Does not affect the typed-query path, which is ordered by search relevance. Authored by hand — CodeGen never derives or overwrites it. NULL means order by the related entity''s name field.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd66d3ff4-b743-4b07-a0a3-3491db80dc88' OR ("EntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'RelatedEntityFilter')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d66d3ff4-b743-4b07-a0a3-3491db80dc88', 'DF238F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Entity Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6'), 'RelatedEntityFilter', 'Related Entity Filter', 'Optional SQL WHERE fragment applied to every lookup on this foreign key (e.g. Status = ''Active''), AND-ed with whatever the user types, on both the browse list and the search path. Lets a picker be scoped from metadata rather than from every form template that renders the field. Authored by hand — CodeGen never derives or overwrites it. NULL means no filter, which is the pre-feature behaviour.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c0cfaf1e-d95b-4b46-996f-d00adfb2d31a' OR ("EntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'RelatedEntityOrderBy')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c0cfaf1e-d95b-4b46-996f-d00adfb2d31a', 'DF238F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Entity Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6'), 'RelatedEntityOrderBy', 'Related Entity Order By', 'Optional ORDER BY fragment for the empty-query browse list on this foreign key, e.g. [Name] or [LastActivityDate] DESC. Does not affect the typed-query path, which is ordered by search relevance. Authored by hand — CodeGen never derives or overwrites it. NULL means order by the related entity''s name field.', 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

-- Flush any pending deferred trigger events from prior DML so the index DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = '__mj' AND tablename = 'EntityField' AND indexname = 'IDX_AUTO_MJ_FKEY_EntityField_EntityID') THEN
    CREATE INDEX "IDX_AUTO_MJ_FKEY_EntityField_EntityID" ON __mj."EntityField"("EntityID");
  END IF;
END $$;

-- Flush any pending deferred trigger events from prior DML so the index DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = '__mj' AND tablename = 'EntityField' AND indexname = 'IDX_AUTO_MJ_FKEY_EntityField_RelatedEntityID') THEN
    CREATE INDEX "IDX_AUTO_MJ_FKEY_EntityField_RelatedEntityID" ON __mj."EntityField"("RelatedEntityID");
  END IF;
END $$;

-- Flush any pending deferred trigger events from prior DML so the index DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = '__mj' AND tablename = 'EntityField' AND indexname = 'IDX_AUTO_MJ_FKEY_EntityField_EncryptionKeyID') THEN
    CREATE INDEX "IDX_AUTO_MJ_FKEY_EntityField_EncryptionKeyID" ON __mj."EntityField"("EncryptionKeyID");
  END IF;
END $$;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Fields
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_field_entity_id"
    ON "__mj"."EntityField" ("EntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_field_related_entity_id"
    ON "__mj"."EntityField" ("RelatedEntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_field_encryption_key_id"
    ON "__mj"."EntityField" ("EncryptionKeyID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Fields
-- Item: Permissions for vwEntityFields
-- ============================================================
GRANT SELECT ON "__mj"."vwEntityFields" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwEntityFields" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwEntityFields" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Fields
-- Item: spCreateEntityField
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR EntityField
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateEntityField'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateEntityField"(
    p_id UUID DEFAULT NULL,
    p_displayname_clear boolean DEFAULT false,
    p_displayname varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_autoupdatedescription BOOLEAN DEFAULT NULL,
    p_isprimarykey BOOLEAN DEFAULT NULL,
    p_isunique BOOLEAN DEFAULT NULL,
    p_category_clear boolean DEFAULT false,
    p_category varchar(255) DEFAULT NULL,
    p_valuelisttype varchar(20) DEFAULT NULL,
    p_extendedtype_clear boolean DEFAULT false,
    p_extendedtype varchar(50) DEFAULT NULL,
    p_codetype_clear boolean DEFAULT false,
    p_codetype varchar(50) DEFAULT NULL,
    p_defaultinview BOOLEAN DEFAULT NULL,
    p_viewcelltemplate_clear boolean DEFAULT false,
    p_viewcelltemplate TEXT DEFAULT NULL,
    p_defaultcolumnwidth_clear boolean DEFAULT false,
    p_defaultcolumnwidth int DEFAULT NULL,
    p_allowupdateapi BOOLEAN DEFAULT NULL,
    p_allowupdateinview BOOLEAN DEFAULT NULL,
    p_includeinusersearchapi BOOLEAN DEFAULT NULL,
    p_fulltextsearchenabled BOOLEAN DEFAULT NULL,
    p_usersearchparamformatapi_clear boolean DEFAULT false,
    p_usersearchparamformatapi varchar(500) DEFAULT NULL,
    p_includeingeneratedform BOOLEAN DEFAULT NULL,
    p_generatedformsection varchar(10) DEFAULT NULL,
    p_isnamefield BOOLEAN DEFAULT NULL,
    p_relatedentityid_clear boolean DEFAULT false,
    p_relatedentityid UUID DEFAULT NULL,
    p_relatedentityfieldname_clear boolean DEFAULT false,
    p_relatedentityfieldname varchar(255) DEFAULT NULL,
    p_includerelatedentitynamefieldinbaseview BOOLEAN DEFAULT NULL,
    p_relatedentitynamefieldmap_clear boolean DEFAULT false,
    p_relatedentitynamefieldmap varchar(255) DEFAULT NULL,
    p_relatedentitydisplaytype varchar(20) DEFAULT NULL,
    p_entityidfieldname_clear boolean DEFAULT false,
    p_entityidfieldname varchar(100) DEFAULT NULL,
    p_scopedefault_clear boolean DEFAULT false,
    p_scopedefault varchar(100) DEFAULT NULL,
    p_autoupdaterelatedentityinfo BOOLEAN DEFAULT NULL,
    p_valuestopackwithschema varchar(10) DEFAULT NULL,
    p_status varchar(25) DEFAULT NULL,
    p_autoupdateisnamefield BOOLEAN DEFAULT NULL,
    p_autoupdatedefaultinview BOOLEAN DEFAULT NULL,
    p_autoupdatecategory BOOLEAN DEFAULT NULL,
    p_autoupdatedisplayname BOOLEAN DEFAULT NULL,
    p_autoupdateincludeinusersearchapi BOOLEAN DEFAULT NULL,
    p_encrypt BOOLEAN DEFAULT NULL,
    p_encryptionkeyid_clear boolean DEFAULT false,
    p_encryptionkeyid UUID DEFAULT NULL,
    p_allowdecryptinapi BOOLEAN DEFAULT NULL,
    p_sendencryptedvalue BOOLEAN DEFAULT NULL,
    p_issoftprimarykey BOOLEAN DEFAULT NULL,
    p_issoftforeignkey BOOLEAN DEFAULT NULL,
    p_relatedentityjoinfields_clear boolean DEFAULT false,
    p_relatedentityjoinfields TEXT DEFAULT NULL,
    p_jsontype_clear boolean DEFAULT false,
    p_jsontype varchar(255) DEFAULT NULL,
    p_jsontypeisarray BOOLEAN DEFAULT NULL,
    p_jsontypedefinition_clear boolean DEFAULT false,
    p_jsontypedefinition TEXT DEFAULT NULL,
    p_usersearchpredicateapi varchar(20) DEFAULT NULL,
    p_autoupdateusersearchpredicate BOOLEAN DEFAULT NULL,
    p_autoupdatefulltextsearch BOOLEAN DEFAULT NULL,
    p_autoupdateextendedtype BOOLEAN DEFAULT NULL,
    p_iscomputed BOOLEAN DEFAULT NULL,
    p_embeddedrecord_clear boolean DEFAULT false,
    p_embeddedrecord TEXT DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_relatedentityfilter_clear boolean DEFAULT false,
    p_relatedentityfilter TEXT DEFAULT NULL,
    p_relatedentityorderby_clear boolean DEFAULT false,
    p_relatedentityorderby varchar(500) DEFAULT NULL
) RETURNS SETOF "__mj"."vwEntityFields" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."EntityField"
        (
            "ID",
            "DisplayName",
                "Description",
                "AutoUpdateDescription",
                "IsPrimaryKey",
                "IsUnique",
                "Category",
                "ValueListType",
                "ExtendedType",
                "CodeType",
                "DefaultInView",
                "ViewCellTemplate",
                "DefaultColumnWidth",
                "AllowUpdateAPI",
                "AllowUpdateInView",
                "IncludeInUserSearchAPI",
                "FullTextSearchEnabled",
                "UserSearchParamFormatAPI",
                "IncludeInGeneratedForm",
                "GeneratedFormSection",
                "IsNameField",
                "RelatedEntityID",
                "RelatedEntityFieldName",
                "IncludeRelatedEntityNameFieldInBaseView",
                "RelatedEntityNameFieldMap",
                "RelatedEntityDisplayType",
                "EntityIDFieldName",
                "ScopeDefault",
                "AutoUpdateRelatedEntityInfo",
                "ValuesToPackWithSchema",
                "Status",
                "AutoUpdateIsNameField",
                "AutoUpdateDefaultInView",
                "AutoUpdateCategory",
                "AutoUpdateDisplayName",
                "AutoUpdateIncludeInUserSearchAPI",
                "Encrypt",
                "EncryptionKeyID",
                "AllowDecryptInAPI",
                "SendEncryptedValue",
                "IsSoftPrimaryKey",
                "IsSoftForeignKey",
                "RelatedEntityJoinFields",
                "JSONType",
                "JSONTypeIsArray",
                "JSONTypeDefinition",
                "UserSearchPredicateAPI",
                "AutoUpdateUserSearchPredicate",
                "AutoUpdateFullTextSearch",
                "AutoUpdateExtendedType",
                "IsComputed",
                "EmbeddedRecord",
                "Configuration",
                "RelatedEntityFilter",
                "RelatedEntityOrderBy"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_autoupdatedescription, TRUE),
                COALESCE(p_isprimarykey, FALSE),
                COALESCE(p_isunique, FALSE),
                CASE WHEN p_category_clear = true THEN NULL ELSE COALESCE(p_category, NULL) END,
                COALESCE(p_valuelisttype, 'None'),
                CASE WHEN p_extendedtype_clear = true THEN NULL ELSE COALESCE(p_extendedtype, NULL) END,
                CASE WHEN p_codetype_clear = true THEN NULL ELSE COALESCE(p_codetype, NULL) END,
                COALESCE(p_defaultinview, FALSE),
                CASE WHEN p_viewcelltemplate_clear = true THEN NULL ELSE COALESCE(p_viewcelltemplate, NULL) END,
                CASE WHEN p_defaultcolumnwidth_clear = true THEN NULL ELSE COALESCE(p_defaultcolumnwidth, NULL) END,
                COALESCE(p_allowupdateapi, TRUE),
                COALESCE(p_allowupdateinview, TRUE),
                COALESCE(p_includeinusersearchapi, FALSE),
                COALESCE(p_fulltextsearchenabled, FALSE),
                CASE WHEN p_usersearchparamformatapi_clear = true THEN NULL ELSE COALESCE(p_usersearchparamformatapi, NULL) END,
                COALESCE(p_includeingeneratedform, TRUE),
                COALESCE(p_generatedformsection, 'Details'),
                COALESCE(p_isnamefield, FALSE),
                CASE WHEN p_relatedentityid_clear = true THEN NULL ELSE COALESCE(p_relatedentityid, NULL) END,
                CASE WHEN p_relatedentityfieldname_clear = true THEN NULL ELSE COALESCE(p_relatedentityfieldname, NULL) END,
                COALESCE(p_includerelatedentitynamefieldinbaseview, TRUE),
                CASE WHEN p_relatedentitynamefieldmap_clear = true THEN NULL ELSE COALESCE(p_relatedentitynamefieldmap, NULL) END,
                COALESCE(p_relatedentitydisplaytype, 'Search'),
                CASE WHEN p_entityidfieldname_clear = true THEN NULL ELSE COALESCE(p_entityidfieldname, NULL) END,
                CASE WHEN p_scopedefault_clear = true THEN NULL ELSE COALESCE(p_scopedefault, NULL) END,
                COALESCE(p_autoupdaterelatedentityinfo, TRUE),
                COALESCE(p_valuestopackwithschema, 'Auto'),
                COALESCE(p_status, 'Active'),
                COALESCE(p_autoupdateisnamefield, TRUE),
                COALESCE(p_autoupdatedefaultinview, TRUE),
                COALESCE(p_autoupdatecategory, TRUE),
                COALESCE(p_autoupdatedisplayname, TRUE),
                COALESCE(p_autoupdateincludeinusersearchapi, TRUE),
                COALESCE(p_encrypt, FALSE),
                CASE WHEN p_encryptionkeyid_clear = true THEN NULL ELSE COALESCE(p_encryptionkeyid, NULL) END,
                COALESCE(p_allowdecryptinapi, FALSE),
                COALESCE(p_sendencryptedvalue, FALSE),
                COALESCE(p_issoftprimarykey, FALSE),
                COALESCE(p_issoftforeignkey, FALSE),
                CASE WHEN p_relatedentityjoinfields_clear = true THEN NULL ELSE COALESCE(p_relatedentityjoinfields, NULL) END,
                CASE WHEN p_jsontype_clear = true THEN NULL ELSE COALESCE(p_jsontype, NULL) END,
                COALESCE(p_jsontypeisarray, FALSE),
                CASE WHEN p_jsontypedefinition_clear = true THEN NULL ELSE COALESCE(p_jsontypedefinition, NULL) END,
                COALESCE(p_usersearchpredicateapi, 'Contains'),
                COALESCE(p_autoupdateusersearchpredicate, TRUE),
                COALESCE(p_autoupdatefulltextsearch, TRUE),
                COALESCE(p_autoupdateextendedtype, TRUE),
                COALESCE(p_iscomputed, FALSE),
                CASE WHEN p_embeddedrecord_clear = true THEN NULL ELSE COALESCE(p_embeddedrecord, NULL) END,
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                CASE WHEN p_relatedentityfilter_clear = true THEN NULL ELSE COALESCE(p_relatedentityfilter, NULL) END,
                CASE WHEN p_relatedentityorderby_clear = true THEN NULL ELSE COALESCE(p_relatedentityorderby, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwEntityFields"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityField" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityField" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Fields
-- Item: spUpdateEntityField
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR EntityField
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateEntityField'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateEntityField"(
    p_id UUID,
    p_displayname_clear boolean DEFAULT false,
    p_displayname varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_autoupdatedescription BOOLEAN DEFAULT NULL,
    p_isprimarykey BOOLEAN DEFAULT NULL,
    p_isunique BOOLEAN DEFAULT NULL,
    p_category_clear boolean DEFAULT false,
    p_category varchar(255) DEFAULT NULL,
    p_valuelisttype varchar(20) DEFAULT NULL,
    p_extendedtype_clear boolean DEFAULT false,
    p_extendedtype varchar(50) DEFAULT NULL,
    p_codetype_clear boolean DEFAULT false,
    p_codetype varchar(50) DEFAULT NULL,
    p_defaultinview BOOLEAN DEFAULT NULL,
    p_viewcelltemplate_clear boolean DEFAULT false,
    p_viewcelltemplate TEXT DEFAULT NULL,
    p_defaultcolumnwidth_clear boolean DEFAULT false,
    p_defaultcolumnwidth int DEFAULT NULL,
    p_allowupdateapi BOOLEAN DEFAULT NULL,
    p_allowupdateinview BOOLEAN DEFAULT NULL,
    p_includeinusersearchapi BOOLEAN DEFAULT NULL,
    p_fulltextsearchenabled BOOLEAN DEFAULT NULL,
    p_usersearchparamformatapi_clear boolean DEFAULT false,
    p_usersearchparamformatapi varchar(500) DEFAULT NULL,
    p_includeingeneratedform BOOLEAN DEFAULT NULL,
    p_generatedformsection varchar(10) DEFAULT NULL,
    p_isnamefield BOOLEAN DEFAULT NULL,
    p_relatedentityid_clear boolean DEFAULT false,
    p_relatedentityid UUID DEFAULT NULL,
    p_relatedentityfieldname_clear boolean DEFAULT false,
    p_relatedentityfieldname varchar(255) DEFAULT NULL,
    p_includerelatedentitynamefieldinbaseview BOOLEAN DEFAULT NULL,
    p_relatedentitynamefieldmap_clear boolean DEFAULT false,
    p_relatedentitynamefieldmap varchar(255) DEFAULT NULL,
    p_relatedentitydisplaytype varchar(20) DEFAULT NULL,
    p_entityidfieldname_clear boolean DEFAULT false,
    p_entityidfieldname varchar(100) DEFAULT NULL,
    p_scopedefault_clear boolean DEFAULT false,
    p_scopedefault varchar(100) DEFAULT NULL,
    p_autoupdaterelatedentityinfo BOOLEAN DEFAULT NULL,
    p_valuestopackwithschema varchar(10) DEFAULT NULL,
    p_status varchar(25) DEFAULT NULL,
    p_autoupdateisnamefield BOOLEAN DEFAULT NULL,
    p_autoupdatedefaultinview BOOLEAN DEFAULT NULL,
    p_autoupdatecategory BOOLEAN DEFAULT NULL,
    p_autoupdatedisplayname BOOLEAN DEFAULT NULL,
    p_autoupdateincludeinusersearchapi BOOLEAN DEFAULT NULL,
    p_encrypt BOOLEAN DEFAULT NULL,
    p_encryptionkeyid_clear boolean DEFAULT false,
    p_encryptionkeyid UUID DEFAULT NULL,
    p_allowdecryptinapi BOOLEAN DEFAULT NULL,
    p_sendencryptedvalue BOOLEAN DEFAULT NULL,
    p_issoftprimarykey BOOLEAN DEFAULT NULL,
    p_issoftforeignkey BOOLEAN DEFAULT NULL,
    p_relatedentityjoinfields_clear boolean DEFAULT false,
    p_relatedentityjoinfields TEXT DEFAULT NULL,
    p_jsontype_clear boolean DEFAULT false,
    p_jsontype varchar(255) DEFAULT NULL,
    p_jsontypeisarray BOOLEAN DEFAULT NULL,
    p_jsontypedefinition_clear boolean DEFAULT false,
    p_jsontypedefinition TEXT DEFAULT NULL,
    p_usersearchpredicateapi varchar(20) DEFAULT NULL,
    p_autoupdateusersearchpredicate BOOLEAN DEFAULT NULL,
    p_autoupdatefulltextsearch BOOLEAN DEFAULT NULL,
    p_autoupdateextendedtype BOOLEAN DEFAULT NULL,
    p_iscomputed BOOLEAN DEFAULT NULL,
    p_embeddedrecord_clear boolean DEFAULT false,
    p_embeddedrecord TEXT DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_relatedentityfilter_clear boolean DEFAULT false,
    p_relatedentityfilter TEXT DEFAULT NULL,
    p_relatedentityorderby_clear boolean DEFAULT false,
    p_relatedentityorderby varchar(500) DEFAULT NULL
) RETURNS SETOF "__mj"."vwEntityFields" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."EntityField"
    SET
        "DisplayName" = CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, "DisplayName") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "AutoUpdateDescription" = COALESCE(p_autoupdatedescription, "AutoUpdateDescription"),
        "IsPrimaryKey" = COALESCE(p_isprimarykey, "IsPrimaryKey"),
        "IsUnique" = COALESCE(p_isunique, "IsUnique"),
        "Category" = CASE WHEN p_category_clear = true THEN NULL ELSE COALESCE(p_category, "Category") END,
        "ValueListType" = COALESCE(p_valuelisttype, "ValueListType"),
        "ExtendedType" = CASE WHEN p_extendedtype_clear = true THEN NULL ELSE COALESCE(p_extendedtype, "ExtendedType") END,
        "CodeType" = CASE WHEN p_codetype_clear = true THEN NULL ELSE COALESCE(p_codetype, "CodeType") END,
        "DefaultInView" = COALESCE(p_defaultinview, "DefaultInView"),
        "ViewCellTemplate" = CASE WHEN p_viewcelltemplate_clear = true THEN NULL ELSE COALESCE(p_viewcelltemplate, "ViewCellTemplate") END,
        "DefaultColumnWidth" = CASE WHEN p_defaultcolumnwidth_clear = true THEN NULL ELSE COALESCE(p_defaultcolumnwidth, "DefaultColumnWidth") END,
        "AllowUpdateAPI" = COALESCE(p_allowupdateapi, "AllowUpdateAPI"),
        "AllowUpdateInView" = COALESCE(p_allowupdateinview, "AllowUpdateInView"),
        "IncludeInUserSearchAPI" = COALESCE(p_includeinusersearchapi, "IncludeInUserSearchAPI"),
        "FullTextSearchEnabled" = COALESCE(p_fulltextsearchenabled, "FullTextSearchEnabled"),
        "UserSearchParamFormatAPI" = CASE WHEN p_usersearchparamformatapi_clear = true THEN NULL ELSE COALESCE(p_usersearchparamformatapi, "UserSearchParamFormatAPI") END,
        "IncludeInGeneratedForm" = COALESCE(p_includeingeneratedform, "IncludeInGeneratedForm"),
        "GeneratedFormSection" = COALESCE(p_generatedformsection, "GeneratedFormSection"),
        "IsNameField" = COALESCE(p_isnamefield, "IsNameField"),
        "RelatedEntityID" = CASE WHEN p_relatedentityid_clear = true THEN NULL ELSE COALESCE(p_relatedentityid, "RelatedEntityID") END,
        "RelatedEntityFieldName" = CASE WHEN p_relatedentityfieldname_clear = true THEN NULL ELSE COALESCE(p_relatedentityfieldname, "RelatedEntityFieldName") END,
        "IncludeRelatedEntityNameFieldInBaseView" = COALESCE(p_includerelatedentitynamefieldinbaseview, "IncludeRelatedEntityNameFieldInBaseView"),
        "RelatedEntityNameFieldMap" = CASE WHEN p_relatedentitynamefieldmap_clear = true THEN NULL ELSE COALESCE(p_relatedentitynamefieldmap, "RelatedEntityNameFieldMap") END,
        "RelatedEntityDisplayType" = COALESCE(p_relatedentitydisplaytype, "RelatedEntityDisplayType"),
        "EntityIDFieldName" = CASE WHEN p_entityidfieldname_clear = true THEN NULL ELSE COALESCE(p_entityidfieldname, "EntityIDFieldName") END,
        "ScopeDefault" = CASE WHEN p_scopedefault_clear = true THEN NULL ELSE COALESCE(p_scopedefault, "ScopeDefault") END,
        "AutoUpdateRelatedEntityInfo" = COALESCE(p_autoupdaterelatedentityinfo, "AutoUpdateRelatedEntityInfo"),
        "ValuesToPackWithSchema" = COALESCE(p_valuestopackwithschema, "ValuesToPackWithSchema"),
        "Status" = COALESCE(p_status, "Status"),
        "AutoUpdateIsNameField" = COALESCE(p_autoupdateisnamefield, "AutoUpdateIsNameField"),
        "AutoUpdateDefaultInView" = COALESCE(p_autoupdatedefaultinview, "AutoUpdateDefaultInView"),
        "AutoUpdateCategory" = COALESCE(p_autoupdatecategory, "AutoUpdateCategory"),
        "AutoUpdateDisplayName" = COALESCE(p_autoupdatedisplayname, "AutoUpdateDisplayName"),
        "AutoUpdateIncludeInUserSearchAPI" = COALESCE(p_autoupdateincludeinusersearchapi, "AutoUpdateIncludeInUserSearchAPI"),
        "Encrypt" = COALESCE(p_encrypt, "Encrypt"),
        "EncryptionKeyID" = CASE WHEN p_encryptionkeyid_clear = true THEN NULL ELSE COALESCE(p_encryptionkeyid, "EncryptionKeyID") END,
        "AllowDecryptInAPI" = COALESCE(p_allowdecryptinapi, "AllowDecryptInAPI"),
        "SendEncryptedValue" = COALESCE(p_sendencryptedvalue, "SendEncryptedValue"),
        "IsSoftPrimaryKey" = COALESCE(p_issoftprimarykey, "IsSoftPrimaryKey"),
        "IsSoftForeignKey" = COALESCE(p_issoftforeignkey, "IsSoftForeignKey"),
        "RelatedEntityJoinFields" = CASE WHEN p_relatedentityjoinfields_clear = true THEN NULL ELSE COALESCE(p_relatedentityjoinfields, "RelatedEntityJoinFields") END,
        "JSONType" = CASE WHEN p_jsontype_clear = true THEN NULL ELSE COALESCE(p_jsontype, "JSONType") END,
        "JSONTypeIsArray" = COALESCE(p_jsontypeisarray, "JSONTypeIsArray"),
        "JSONTypeDefinition" = CASE WHEN p_jsontypedefinition_clear = true THEN NULL ELSE COALESCE(p_jsontypedefinition, "JSONTypeDefinition") END,
        "UserSearchPredicateAPI" = COALESCE(p_usersearchpredicateapi, "UserSearchPredicateAPI"),
        "AutoUpdateUserSearchPredicate" = COALESCE(p_autoupdateusersearchpredicate, "AutoUpdateUserSearchPredicate"),
        "AutoUpdateFullTextSearch" = COALESCE(p_autoupdatefulltextsearch, "AutoUpdateFullTextSearch"),
        "AutoUpdateExtendedType" = COALESCE(p_autoupdateextendedtype, "AutoUpdateExtendedType"),
        "IsComputed" = COALESCE(p_iscomputed, "IsComputed"),
        "EmbeddedRecord" = CASE WHEN p_embeddedrecord_clear = true THEN NULL ELSE COALESCE(p_embeddedrecord, "EmbeddedRecord") END,
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END,
        "RelatedEntityFilter" = CASE WHEN p_relatedentityfilter_clear = true THEN NULL ELSE COALESCE(p_relatedentityfilter, "RelatedEntityFilter") END,
        "RelatedEntityOrderBy" = CASE WHEN p_relatedentityorderby_clear = true THEN NULL ELSE COALESCE(p_relatedentityorderby, "RelatedEntityOrderBy") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwEntityFields"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntityField" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntityField" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityField table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_entity_field"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_entity_field" ON "__mj"."EntityField";

CREATE TRIGGER "trg_update_entity_field"
BEFORE UPDATE ON "__mj"."EntityField"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_entity_field"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Fields
-- Item: spDeleteEntityField
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR EntityField
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteEntityField'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteEntityField"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."EntityField"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityField" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityField" TO "cdp_Developer";
