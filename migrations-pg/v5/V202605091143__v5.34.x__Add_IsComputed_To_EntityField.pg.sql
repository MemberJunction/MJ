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


-- ===================== DDL: Tables, PKs, Indexes =====================

-- ============================================================================
-- Migration: Add IsComputed flag to EntityField
-- ============================================================================
-- Adds the new EntityField."IsComputed" column, updates the metadata view
-- (vwSQLColumnsAndEntityFields) to project it, and updates the sync sproc
-- (spUpdateExistingEntityFieldsFromSchema) to propagate it from the catalog.
--
-- IsComputed distinguishes SQL Server computed columns (and PostgreSQL
-- generated columns, post-conversion via SQLConverter) from view-only
-- virtual columns. Both are flagged IsVirtual = 1 today, which conflates two
-- distinct cases:
--   IsVirtual=1, IsComputed=0  → view-only (column not in base table)
--   IsVirtual=1, IsComputed=1  → SQL-computed (in base table, read-only in SQL)
--
-- The downstream consumer of the new flag is base-view JOIN target selection
-- in CodeGen — when an FK's related Name Field is computed, the join targets
-- the related entity's base table (not its view). This avoids unnecessary
-- view materialization and unblocks self-referencing FKs whose Name Field
-- is computed (which previously hit the self-virtual-NameField skip path).
--
-- See plans/computed-columns-support.md for the full design.
-- ============================================================================


-- 1. Add the IsComputed column to EntityField. Default 0 keeps existing rows
-- correct until the next CodeGen run repopulates from the catalog. Single
-- ALTER TABLE per the consolidation rule in CLAUDE.md.
ALTER TABLE __mj."EntityField"
 ADD COLUMN IF NOT EXISTS "IsComputed" BOOLEAN NOT NULL DEFAULT FALSE;


-- ===================== Views =====================

CREATE OR REPLACE VIEW __mj."vwSQLColumnsAndEntityFields" AS
SELECT
    e."EntityID",
    e."EntityName"                             AS "Entity",
    e."SchemaName",
    e."TableName",
    ef."ID"                                    AS "EntityFieldID",
    ef."Sequence"                              AS "EntityFieldSequence",
    ef."Name"                                  AS "EntityFieldName",
    a.attnum                                   AS "Sequence",
    bt_a.attnum                                AS "BaseTableSequence",
    a.attname                                  AS "FieldName",
    COALESCE(base_t.typname, t.typname)        AS "Type",
    CASE WHEN t.typtype = 'd' THEN t.typname ELSE NULL END
                                               AS "UserDefinedType",
    CASE
        WHEN t.typname IN ('varchar', 'bpchar', 'char')
            THEN CASE WHEN a.atttypmod = -1 THEN -1 ELSE a.atttypmod - 4 END
        WHEN t.typname = 'text' THEN -1
        ELSE a.attlen::integer
    END                                        AS "Length",
    CASE
        WHEN t.typname = 'numeric' AND a.atttypmod != -1
            THEN ((a.atttypmod - 4) >> 16) & 65535
        ELSE 0
    END                                        AS "Precision",
    CASE
        WHEN t.typname = 'numeric' AND a.atttypmod != -1
            THEN (a.atttypmod - 4) & 65535
        ELSE 0
    END                                        AS "Scale",
    -- AllowsNull: prefer the BASE TABLE's attnotnull when the column exists
    -- on the base table (most fields). Fall back to the view's attnotnull
    -- only for purely-virtual fields (joined/computed view-only columns),
    -- which the view never declares NOT NULL anyway, so the result is TRUE.
    -- See V202605041900 PG-only fix for the rationale.
    NOT COALESCE(bt_a.attnotnull, a.attnotnull) AS "AllowsNull",
    -- Returns BOOLEAN (not INTEGER 1/0) to match the type declared in consuming
    -- sprocs (spUpdateExistingEntityFieldsFromSchema, etc.). See V202605040100
    -- PG-only fix for the rationale.
    (COALESCE(bt_a.attidentity, '') IN ('a','d'))
                                               AS "AutoIncrement",
    a.attnum                                   AS column_id,
    -- IsVirtual: TRUE when the column is not present in the base table (view-only)
    -- OR is a PostgreSQL generated column (computed at the SQL layer). The
    -- IsComputed flag below disambiguates the two cases. Returns BOOLEAN to
    -- match consuming-sproc declarations.
    (bt_a.attnum IS NULL OR bt_a.attgenerated <> '')
                                               AS "IsVirtual",
    src_cls.oid                                AS object_id,
    NULL::text                                 AS "DefaultConstraintName",
    pg_get_expr(ad.adbin, ad.adrelid)          AS "DefaultValue",
    NULL::text                                 AS "ComputedColumnDefinition",
    COALESCE(
        col_description(src_cls.oid, a.attnum),
        col_description(bt_cls.oid, bt_a.attnum)
    )                                          AS "Description",
    col_description(src_cls.oid, a.attnum)     AS "ViewColumnDescription",
    CASE
        WHEN bt_a.attnum IS NOT NULL
            THEN col_description(bt_cls.oid, bt_a.attnum)
        ELSE NULL
    END                                        AS "TableColumnDescription",
    -- IsComputed: TRUE when the column is a PostgreSQL generated column
    -- (attgenerated is 's' for stored). Distinguishes view-only virtual columns
    -- (IsVirtual=TRUE, IsComputed=FALSE) from SQL-computed columns physically
    -- present in the base table but read-only at the SQL layer
    -- (IsVirtual=TRUE, IsComputed=TRUE). Mirrors the T-SQL view's
    -- IIF(cc.definition IS NOT NULL, 1, 0) projection.
    (COALESCE(bt_a.attgenerated, '') <> '')    AS "IsComputed"
FROM
    __mj."vwSQLTablesAndEntities" e
-- Source class: view if it exists, otherwise the base table
INNER JOIN
    pg_catalog.pg_class src_cls
        ON src_cls.oid = COALESCE(e.view_object_id, e.object_id)
INNER JOIN
    pg_catalog.pg_attribute a
        ON a.attrelid = src_cls.oid
        AND a.attnum > 0
        AND NOT a.attisdropped
INNER JOIN
    pg_catalog.pg_type t ON a.atttypid = t.oid
LEFT JOIN
    pg_catalog.pg_type base_t
        ON t.typbasetype = base_t.oid AND t.typtype = 'd'
-- Base table class (always the table, not the view)
INNER JOIN
    pg_catalog.pg_class bt_cls ON bt_cls.oid = e.object_id
-- Base table column (NULL when column exists only in the view → IsVirtual)
LEFT JOIN
    pg_catalog.pg_attribute bt_a
        ON bt_a.attrelid = bt_cls.oid
        AND bt_a.attname = a.attname
        AND bt_a.attnum > 0
        AND NOT bt_a.attisdropped
-- Default value from base table
LEFT JOIN
    pg_catalog.pg_attrdef ad
        ON ad.adrelid = bt_cls.oid
        AND ad.adnum = bt_a.attnum
-- MemberJunction EntityField metadata
LEFT JOIN
    __mj."EntityField" ef
        ON e."EntityID" = ef."EntityID"
        AND a.attname = ef."Name";


-- ===================== Stored Procedures (sp*) =====================

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spCreateEntityField'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateEntityField"(
    IN p_ID UUID DEFAULT NULL,
    IN p_DisplayName_Clear BOOLEAN DEFAULT FALSE,
    IN p_DisplayName VARCHAR(255) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_AutoUpdateDescription BOOLEAN DEFAULT NULL,
    IN p_IsPrimaryKey BOOLEAN DEFAULT NULL,
    IN p_IsUnique BOOLEAN DEFAULT NULL,
    IN p_Category_Clear BOOLEAN DEFAULT FALSE,
    IN p_Category VARCHAR(255) DEFAULT NULL,
    IN p_ValueListType VARCHAR(20) DEFAULT NULL,
    IN p_ExtendedType_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExtendedType VARCHAR(50) DEFAULT NULL,
    IN p_CodeType_Clear BOOLEAN DEFAULT FALSE,
    IN p_CodeType VARCHAR(50) DEFAULT NULL,
    IN p_DefaultInView BOOLEAN DEFAULT NULL,
    IN p_ViewCellTemplate_Clear BOOLEAN DEFAULT FALSE,
    IN p_ViewCellTemplate TEXT DEFAULT NULL,
    IN p_DefaultColumnWidth_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultColumnWidth INTEGER DEFAULT NULL,
    IN p_AllowUpdateAPI BOOLEAN DEFAULT NULL,
    IN p_AllowUpdateInView BOOLEAN DEFAULT NULL,
    IN p_IncludeInUserSearchAPI BOOLEAN DEFAULT NULL,
    IN p_FullTextSearchEnabled BOOLEAN DEFAULT NULL,
    IN p_UserSearchParamFormatAPI_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserSearchParamFormatAPI VARCHAR(500) DEFAULT NULL,
    IN p_IncludeInGeneratedForm BOOLEAN DEFAULT NULL,
    IN p_GeneratedFormSection VARCHAR(10) DEFAULT NULL,
    IN p_IsNameField BOOLEAN DEFAULT NULL,
    IN p_RelatedEntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_RelatedEntityID UUID DEFAULT NULL,
    IN p_RelatedEntityFieldName_Clear BOOLEAN DEFAULT FALSE,
    IN p_RelatedEntityFieldName VARCHAR(255) DEFAULT NULL,
    IN p_IncludeRelatedEntityNameFieldInBaseView BOOLEAN DEFAULT NULL,
    IN p_RelatedEntityNameFieldMap_Clear BOOLEAN DEFAULT FALSE,
    IN p_RelatedEntityNameFieldMap VARCHAR(255) DEFAULT NULL,
    IN p_RelatedEntityDisplayType VARCHAR(20) DEFAULT NULL,
    IN p_EntityIDFieldName_Clear BOOLEAN DEFAULT FALSE,
    IN p_EntityIDFieldName VARCHAR(100) DEFAULT NULL,
    IN p_ScopeDefault_Clear BOOLEAN DEFAULT FALSE,
    IN p_ScopeDefault VARCHAR(100) DEFAULT NULL,
    IN p_AutoUpdateRelatedEntityInfo BOOLEAN DEFAULT NULL,
    IN p_ValuesToPackWithSchema VARCHAR(10) DEFAULT NULL,
    IN p_Status VARCHAR(25) DEFAULT NULL,
    IN p_AutoUpdateIsNameField BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateDefaultInView BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateCategory BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateDisplayName BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateIncludeInUserSearchAPI BOOLEAN DEFAULT NULL,
    IN p_Encrypt BOOLEAN DEFAULT NULL,
    IN p_EncryptionKeyID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EncryptionKeyID UUID DEFAULT NULL,
    IN p_AllowDecryptInAPI BOOLEAN DEFAULT NULL,
    IN p_SendEncryptedValue BOOLEAN DEFAULT NULL,
    IN p_IsSoftPrimaryKey BOOLEAN DEFAULT NULL,
    IN p_IsSoftForeignKey BOOLEAN DEFAULT NULL,
    IN p_RelatedEntityJoinFields_Clear BOOLEAN DEFAULT FALSE,
    IN p_RelatedEntityJoinFields TEXT DEFAULT NULL,
    IN p_JSONType_Clear BOOLEAN DEFAULT FALSE,
    IN p_JSONType VARCHAR(255) DEFAULT NULL,
    IN p_JSONTypeIsArray BOOLEAN DEFAULT NULL,
    IN p_JSONTypeDefinition_Clear BOOLEAN DEFAULT FALSE,
    IN p_JSONTypeDefinition TEXT DEFAULT NULL,
    IN p_UserSearchPredicateAPI VARCHAR(20) DEFAULT NULL,
    IN p_AutoUpdateUserSearchPredicate BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateFullTextSearch BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateExtendedType BOOLEAN DEFAULT NULL,
    IN p_IsComputed BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityFields" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."EntityField"
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
                "IsComputed"
            )
        VALUES
            (
                p_ID,
                CASE WHEN p_DisplayName_Clear = TRUE THEN NULL ELSE COALESCE(p_DisplayName, NULL) END,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                COALESCE(p_AutoUpdateDescription, TRUE),
                COALESCE(p_IsPrimaryKey, FALSE),
                COALESCE(p_IsUnique, FALSE),
                CASE WHEN p_Category_Clear = TRUE THEN NULL ELSE COALESCE(p_Category, NULL) END,
                COALESCE(p_ValueListType, 'None'),
                CASE WHEN p_ExtendedType_Clear = TRUE THEN NULL ELSE COALESCE(p_ExtendedType, NULL) END,
                CASE WHEN p_CodeType_Clear = TRUE THEN NULL ELSE COALESCE(p_CodeType, NULL) END,
                COALESCE(p_DefaultInView, FALSE),
                CASE WHEN p_ViewCellTemplate_Clear = TRUE THEN NULL ELSE COALESCE(p_ViewCellTemplate, NULL) END,
                CASE WHEN p_DefaultColumnWidth_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultColumnWidth, NULL) END,
                COALESCE(p_AllowUpdateAPI, TRUE),
                COALESCE(p_AllowUpdateInView, TRUE),
                COALESCE(p_IncludeInUserSearchAPI, FALSE),
                COALESCE(p_FullTextSearchEnabled, FALSE),
                CASE WHEN p_UserSearchParamFormatAPI_Clear = TRUE THEN NULL ELSE COALESCE(p_UserSearchParamFormatAPI, NULL) END,
                COALESCE(p_IncludeInGeneratedForm, TRUE),
                COALESCE(p_GeneratedFormSection, 'Details'),
                COALESCE(p_IsNameField, FALSE),
                CASE WHEN p_RelatedEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_RelatedEntityID, NULL) END,
                CASE WHEN p_RelatedEntityFieldName_Clear = TRUE THEN NULL ELSE COALESCE(p_RelatedEntityFieldName, NULL) END,
                COALESCE(p_IncludeRelatedEntityNameFieldInBaseView, TRUE),
                CASE WHEN p_RelatedEntityNameFieldMap_Clear = TRUE THEN NULL ELSE COALESCE(p_RelatedEntityNameFieldMap, NULL) END,
                COALESCE(p_RelatedEntityDisplayType, 'Search'),
                CASE WHEN p_EntityIDFieldName_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityIDFieldName, NULL) END,
                CASE WHEN p_ScopeDefault_Clear = TRUE THEN NULL ELSE COALESCE(p_ScopeDefault, NULL) END,
                COALESCE(p_AutoUpdateRelatedEntityInfo, TRUE),
                COALESCE(p_ValuesToPackWithSchema, 'Auto'),
                COALESCE(p_Status, 'Active'),
                COALESCE(p_AutoUpdateIsNameField, TRUE),
                COALESCE(p_AutoUpdateDefaultInView, TRUE),
                COALESCE(p_AutoUpdateCategory, TRUE),
                COALESCE(p_AutoUpdateDisplayName, TRUE),
                COALESCE(p_AutoUpdateIncludeInUserSearchAPI, TRUE),
                COALESCE(p_Encrypt, FALSE),
                CASE WHEN p_EncryptionKeyID_Clear = TRUE THEN NULL ELSE COALESCE(p_EncryptionKeyID, NULL) END,
                COALESCE(p_AllowDecryptInAPI, FALSE),
                COALESCE(p_SendEncryptedValue, FALSE),
                COALESCE(p_IsSoftPrimaryKey, FALSE),
                COALESCE(p_IsSoftForeignKey, FALSE),
                CASE WHEN p_RelatedEntityJoinFields_Clear = TRUE THEN NULL ELSE COALESCE(p_RelatedEntityJoinFields, NULL) END,
                CASE WHEN p_JSONType_Clear = TRUE THEN NULL ELSE COALESCE(p_JSONType, NULL) END,
                COALESCE(p_JSONTypeIsArray, FALSE),
                CASE WHEN p_JSONTypeDefinition_Clear = TRUE THEN NULL ELSE COALESCE(p_JSONTypeDefinition, NULL) END,
                COALESCE(p_UserSearchPredicateAPI, 'Contains'),
                COALESCE(p_AutoUpdateUserSearchPredicate, TRUE),
                COALESCE(p_AutoUpdateFullTextSearch, TRUE),
                COALESCE(p_AutoUpdateExtendedType, TRUE),
                COALESCE(p_IsComputed, FALSE)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."EntityField"
            (
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
                "IsComputed"
            )
        VALUES
            (
                CASE WHEN p_DisplayName_Clear = TRUE THEN NULL ELSE COALESCE(p_DisplayName, NULL) END,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                COALESCE(p_AutoUpdateDescription, TRUE),
                COALESCE(p_IsPrimaryKey, FALSE),
                COALESCE(p_IsUnique, FALSE),
                CASE WHEN p_Category_Clear = TRUE THEN NULL ELSE COALESCE(p_Category, NULL) END,
                COALESCE(p_ValueListType, 'None'),
                CASE WHEN p_ExtendedType_Clear = TRUE THEN NULL ELSE COALESCE(p_ExtendedType, NULL) END,
                CASE WHEN p_CodeType_Clear = TRUE THEN NULL ELSE COALESCE(p_CodeType, NULL) END,
                COALESCE(p_DefaultInView, FALSE),
                CASE WHEN p_ViewCellTemplate_Clear = TRUE THEN NULL ELSE COALESCE(p_ViewCellTemplate, NULL) END,
                CASE WHEN p_DefaultColumnWidth_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultColumnWidth, NULL) END,
                COALESCE(p_AllowUpdateAPI, TRUE),
                COALESCE(p_AllowUpdateInView, TRUE),
                COALESCE(p_IncludeInUserSearchAPI, FALSE),
                COALESCE(p_FullTextSearchEnabled, FALSE),
                CASE WHEN p_UserSearchParamFormatAPI_Clear = TRUE THEN NULL ELSE COALESCE(p_UserSearchParamFormatAPI, NULL) END,
                COALESCE(p_IncludeInGeneratedForm, TRUE),
                COALESCE(p_GeneratedFormSection, 'Details'),
                COALESCE(p_IsNameField, FALSE),
                CASE WHEN p_RelatedEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_RelatedEntityID, NULL) END,
                CASE WHEN p_RelatedEntityFieldName_Clear = TRUE THEN NULL ELSE COALESCE(p_RelatedEntityFieldName, NULL) END,
                COALESCE(p_IncludeRelatedEntityNameFieldInBaseView, TRUE),
                CASE WHEN p_RelatedEntityNameFieldMap_Clear = TRUE THEN NULL ELSE COALESCE(p_RelatedEntityNameFieldMap, NULL) END,
                COALESCE(p_RelatedEntityDisplayType, 'Search'),
                CASE WHEN p_EntityIDFieldName_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityIDFieldName, NULL) END,
                CASE WHEN p_ScopeDefault_Clear = TRUE THEN NULL ELSE COALESCE(p_ScopeDefault, NULL) END,
                COALESCE(p_AutoUpdateRelatedEntityInfo, TRUE),
                COALESCE(p_ValuesToPackWithSchema, 'Auto'),
                COALESCE(p_Status, 'Active'),
                COALESCE(p_AutoUpdateIsNameField, TRUE),
                COALESCE(p_AutoUpdateDefaultInView, TRUE),
                COALESCE(p_AutoUpdateCategory, TRUE),
                COALESCE(p_AutoUpdateDisplayName, TRUE),
                COALESCE(p_AutoUpdateIncludeInUserSearchAPI, TRUE),
                COALESCE(p_Encrypt, FALSE),
                CASE WHEN p_EncryptionKeyID_Clear = TRUE THEN NULL ELSE COALESCE(p_EncryptionKeyID, NULL) END,
                COALESCE(p_AllowDecryptInAPI, FALSE),
                COALESCE(p_SendEncryptedValue, FALSE),
                COALESCE(p_IsSoftPrimaryKey, FALSE),
                COALESCE(p_IsSoftForeignKey, FALSE),
                CASE WHEN p_RelatedEntityJoinFields_Clear = TRUE THEN NULL ELSE COALESCE(p_RelatedEntityJoinFields, NULL) END,
                CASE WHEN p_JSONType_Clear = TRUE THEN NULL ELSE COALESCE(p_JSONType, NULL) END,
                COALESCE(p_JSONTypeIsArray, FALSE),
                CASE WHEN p_JSONTypeDefinition_Clear = TRUE THEN NULL ELSE COALESCE(p_JSONTypeDefinition, NULL) END,
                COALESCE(p_UserSearchPredicateAPI, 'Contains'),
                COALESCE(p_AutoUpdateUserSearchPredicate, TRUE),
                COALESCE(p_AutoUpdateFullTextSearch, TRUE),
                COALESCE(p_AutoUpdateExtendedType, TRUE),
                COALESCE(p_IsComputed, FALSE)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwEntityFields" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateEntityField'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateEntityField"(
    IN p_ID UUID,
    IN p_DisplayName_Clear BOOLEAN DEFAULT FALSE,
    IN p_DisplayName VARCHAR(255) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_AutoUpdateDescription BOOLEAN DEFAULT NULL,
    IN p_IsPrimaryKey BOOLEAN DEFAULT NULL,
    IN p_IsUnique BOOLEAN DEFAULT NULL,
    IN p_Category_Clear BOOLEAN DEFAULT FALSE,
    IN p_Category VARCHAR(255) DEFAULT NULL,
    IN p_ValueListType VARCHAR(20) DEFAULT NULL,
    IN p_ExtendedType_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExtendedType VARCHAR(50) DEFAULT NULL,
    IN p_CodeType_Clear BOOLEAN DEFAULT FALSE,
    IN p_CodeType VARCHAR(50) DEFAULT NULL,
    IN p_DefaultInView BOOLEAN DEFAULT NULL,
    IN p_ViewCellTemplate_Clear BOOLEAN DEFAULT FALSE,
    IN p_ViewCellTemplate TEXT DEFAULT NULL,
    IN p_DefaultColumnWidth_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultColumnWidth INTEGER DEFAULT NULL,
    IN p_AllowUpdateAPI BOOLEAN DEFAULT NULL,
    IN p_AllowUpdateInView BOOLEAN DEFAULT NULL,
    IN p_IncludeInUserSearchAPI BOOLEAN DEFAULT NULL,
    IN p_FullTextSearchEnabled BOOLEAN DEFAULT NULL,
    IN p_UserSearchParamFormatAPI_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserSearchParamFormatAPI VARCHAR(500) DEFAULT NULL,
    IN p_IncludeInGeneratedForm BOOLEAN DEFAULT NULL,
    IN p_GeneratedFormSection VARCHAR(10) DEFAULT NULL,
    IN p_IsNameField BOOLEAN DEFAULT NULL,
    IN p_RelatedEntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_RelatedEntityID UUID DEFAULT NULL,
    IN p_RelatedEntityFieldName_Clear BOOLEAN DEFAULT FALSE,
    IN p_RelatedEntityFieldName VARCHAR(255) DEFAULT NULL,
    IN p_IncludeRelatedEntityNameFieldInBaseView BOOLEAN DEFAULT NULL,
    IN p_RelatedEntityNameFieldMap_Clear BOOLEAN DEFAULT FALSE,
    IN p_RelatedEntityNameFieldMap VARCHAR(255) DEFAULT NULL,
    IN p_RelatedEntityDisplayType VARCHAR(20) DEFAULT NULL,
    IN p_EntityIDFieldName_Clear BOOLEAN DEFAULT FALSE,
    IN p_EntityIDFieldName VARCHAR(100) DEFAULT NULL,
    IN p_ScopeDefault_Clear BOOLEAN DEFAULT FALSE,
    IN p_ScopeDefault VARCHAR(100) DEFAULT NULL,
    IN p_AutoUpdateRelatedEntityInfo BOOLEAN DEFAULT NULL,
    IN p_ValuesToPackWithSchema VARCHAR(10) DEFAULT NULL,
    IN p_Status VARCHAR(25) DEFAULT NULL,
    IN p_AutoUpdateIsNameField BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateDefaultInView BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateCategory BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateDisplayName BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateIncludeInUserSearchAPI BOOLEAN DEFAULT NULL,
    IN p_Encrypt BOOLEAN DEFAULT NULL,
    IN p_EncryptionKeyID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EncryptionKeyID UUID DEFAULT NULL,
    IN p_AllowDecryptInAPI BOOLEAN DEFAULT NULL,
    IN p_SendEncryptedValue BOOLEAN DEFAULT NULL,
    IN p_IsSoftPrimaryKey BOOLEAN DEFAULT NULL,
    IN p_IsSoftForeignKey BOOLEAN DEFAULT NULL,
    IN p_RelatedEntityJoinFields_Clear BOOLEAN DEFAULT FALSE,
    IN p_RelatedEntityJoinFields TEXT DEFAULT NULL,
    IN p_JSONType_Clear BOOLEAN DEFAULT FALSE,
    IN p_JSONType VARCHAR(255) DEFAULT NULL,
    IN p_JSONTypeIsArray BOOLEAN DEFAULT NULL,
    IN p_JSONTypeDefinition_Clear BOOLEAN DEFAULT FALSE,
    IN p_JSONTypeDefinition TEXT DEFAULT NULL,
    IN p_UserSearchPredicateAPI VARCHAR(20) DEFAULT NULL,
    IN p_AutoUpdateUserSearchPredicate BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateFullTextSearch BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateExtendedType BOOLEAN DEFAULT NULL,
    IN p_IsComputed BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityFields" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."EntityField"
    SET
        "DisplayName" = CASE WHEN p_DisplayName_Clear = TRUE THEN NULL ELSE COALESCE(p_DisplayName, "DisplayName") END,
        "Description" = CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, "Description") END,
        "AutoUpdateDescription" = COALESCE(p_AutoUpdateDescription, "AutoUpdateDescription"),
        "IsPrimaryKey" = COALESCE(p_IsPrimaryKey, "IsPrimaryKey"),
        "IsUnique" = COALESCE(p_IsUnique, "IsUnique"),
        "Category" = CASE WHEN p_Category_Clear = TRUE THEN NULL ELSE COALESCE(p_Category, "Category") END,
        "ValueListType" = COALESCE(p_ValueListType, "ValueListType"),
        "ExtendedType" = CASE WHEN p_ExtendedType_Clear = TRUE THEN NULL ELSE COALESCE(p_ExtendedType, "ExtendedType") END,
        "CodeType" = CASE WHEN p_CodeType_Clear = TRUE THEN NULL ELSE COALESCE(p_CodeType, "CodeType") END,
        "DefaultInView" = COALESCE(p_DefaultInView, "DefaultInView"),
        "ViewCellTemplate" = CASE WHEN p_ViewCellTemplate_Clear = TRUE THEN NULL ELSE COALESCE(p_ViewCellTemplate, "ViewCellTemplate") END,
        "DefaultColumnWidth" = CASE WHEN p_DefaultColumnWidth_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultColumnWidth, "DefaultColumnWidth") END,
        "AllowUpdateAPI" = COALESCE(p_AllowUpdateAPI, "AllowUpdateAPI"),
        "AllowUpdateInView" = COALESCE(p_AllowUpdateInView, "AllowUpdateInView"),
        "IncludeInUserSearchAPI" = COALESCE(p_IncludeInUserSearchAPI, "IncludeInUserSearchAPI"),
        "FullTextSearchEnabled" = COALESCE(p_FullTextSearchEnabled, "FullTextSearchEnabled"),
        "UserSearchParamFormatAPI" = CASE WHEN p_UserSearchParamFormatAPI_Clear = TRUE THEN NULL ELSE COALESCE(p_UserSearchParamFormatAPI, "UserSearchParamFormatAPI") END,
        "IncludeInGeneratedForm" = COALESCE(p_IncludeInGeneratedForm, "IncludeInGeneratedForm"),
        "GeneratedFormSection" = COALESCE(p_GeneratedFormSection, "GeneratedFormSection"),
        "IsNameField" = COALESCE(p_IsNameField, "IsNameField"),
        "RelatedEntityID" = CASE WHEN p_RelatedEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_RelatedEntityID, "RelatedEntityID") END,
        "RelatedEntityFieldName" = CASE WHEN p_RelatedEntityFieldName_Clear = TRUE THEN NULL ELSE COALESCE(p_RelatedEntityFieldName, "RelatedEntityFieldName") END,
        "IncludeRelatedEntityNameFieldInBaseView" = COALESCE(p_IncludeRelatedEntityNameFieldInBaseView, "IncludeRelatedEntityNameFieldInBaseView"),
        "RelatedEntityNameFieldMap" = CASE WHEN p_RelatedEntityNameFieldMap_Clear = TRUE THEN NULL ELSE COALESCE(p_RelatedEntityNameFieldMap, "RelatedEntityNameFieldMap") END,
        "RelatedEntityDisplayType" = COALESCE(p_RelatedEntityDisplayType, "RelatedEntityDisplayType"),
        "EntityIDFieldName" = CASE WHEN p_EntityIDFieldName_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityIDFieldName, "EntityIDFieldName") END,
        "ScopeDefault" = CASE WHEN p_ScopeDefault_Clear = TRUE THEN NULL ELSE COALESCE(p_ScopeDefault, "ScopeDefault") END,
        "AutoUpdateRelatedEntityInfo" = COALESCE(p_AutoUpdateRelatedEntityInfo, "AutoUpdateRelatedEntityInfo"),
        "ValuesToPackWithSchema" = COALESCE(p_ValuesToPackWithSchema, "ValuesToPackWithSchema"),
        "Status" = COALESCE(p_Status, "Status"),
        "AutoUpdateIsNameField" = COALESCE(p_AutoUpdateIsNameField, "AutoUpdateIsNameField"),
        "AutoUpdateDefaultInView" = COALESCE(p_AutoUpdateDefaultInView, "AutoUpdateDefaultInView"),
        "AutoUpdateCategory" = COALESCE(p_AutoUpdateCategory, "AutoUpdateCategory"),
        "AutoUpdateDisplayName" = COALESCE(p_AutoUpdateDisplayName, "AutoUpdateDisplayName"),
        "AutoUpdateIncludeInUserSearchAPI" = COALESCE(p_AutoUpdateIncludeInUserSearchAPI, "AutoUpdateIncludeInUserSearchAPI"),
        "Encrypt" = COALESCE(p_Encrypt, "Encrypt"),
        "EncryptionKeyID" = CASE WHEN p_EncryptionKeyID_Clear = TRUE THEN NULL ELSE COALESCE(p_EncryptionKeyID, "EncryptionKeyID") END,
        "AllowDecryptInAPI" = COALESCE(p_AllowDecryptInAPI, "AllowDecryptInAPI"),
        "SendEncryptedValue" = COALESCE(p_SendEncryptedValue, "SendEncryptedValue"),
        "IsSoftPrimaryKey" = COALESCE(p_IsSoftPrimaryKey, "IsSoftPrimaryKey"),
        "IsSoftForeignKey" = COALESCE(p_IsSoftForeignKey, "IsSoftForeignKey"),
        "RelatedEntityJoinFields" = CASE WHEN p_RelatedEntityJoinFields_Clear = TRUE THEN NULL ELSE COALESCE(p_RelatedEntityJoinFields, "RelatedEntityJoinFields") END,
        "JSONType" = CASE WHEN p_JSONType_Clear = TRUE THEN NULL ELSE COALESCE(p_JSONType, "JSONType") END,
        "JSONTypeIsArray" = COALESCE(p_JSONTypeIsArray, "JSONTypeIsArray"),
        "JSONTypeDefinition" = CASE WHEN p_JSONTypeDefinition_Clear = TRUE THEN NULL ELSE COALESCE(p_JSONTypeDefinition, "JSONTypeDefinition") END,
        "UserSearchPredicateAPI" = COALESCE(p_UserSearchPredicateAPI, "UserSearchPredicateAPI"),
        "AutoUpdateUserSearchPredicate" = COALESCE(p_AutoUpdateUserSearchPredicate, "AutoUpdateUserSearchPredicate"),
        "AutoUpdateFullTextSearch" = COALESCE(p_AutoUpdateFullTextSearch, "AutoUpdateFullTextSearch"),
        "AutoUpdateExtendedType" = COALESCE(p_AutoUpdateExtendedType, "AutoUpdateExtendedType"),
        "IsComputed" = COALESCE(p_IsComputed, "IsComputed")
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwEntityFields" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwEntityFields" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEntityField'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityField"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityField"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateEntityField_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateEntityField" ON __mj."EntityField";
CREATE TRIGGER "trgUpdateEntityField"
    BEFORE UPDATE ON __mj."EntityField"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateEntityField_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b6ad8443-7319-451f-8e3e-a586cebe87eb' OR ("EntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'IsComputed')
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
        "IsComputed",
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
        'b6ad8443-7319-451f-8e3e-a586cebe87eb',
        'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Entity" "Fields"
        100141,
        'IsComputed',
        'Is Computed',
        'When 1, this field is a SQL Server computed column or PostgreSQL generated column — physically present in the base table but read-only at the SQL layer. Distinct from IsVirtual, which means the column is not in the base table at all (e.g., joined name lookups in the base view). A computed column has both IsVirtual=1 (read-only at the API layer) and IsComputed=1 (physically in the table). The difference matters for base-view JOIN target selection: when an FK''s related Name Field is computed, the generated view joins to the related entity''s base table instead of its view.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(0)',
        FALSE,
        TRUE,
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
                                       ('c01acf62-cab6-4617-8df6-787ef9f8fb4f', 'A261204E-3866-41B3-92EB-784C74D2F906', 1, 'BeginsWith', 'BeginsWith', NOW(), NOW());

/* SQL text to insert entity field value with ID 209a1857-c326-4704-bd07-241230c9760f */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('209a1857-c326-4704-bd07-241230c9760f', 'A261204E-3866-41B3-92EB-784C74D2F906', 2, 'Contains', 'Contains', NOW(), NOW());

/* SQL text to insert entity field value with ID 51719ae9-cf64-47eb-96b1-8e3ce002098b */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('51719ae9-cf64-47eb-96b1-8e3ce002098b', 'A261204E-3866-41B3-92EB-784C74D2F906', 3, 'EndsWith', 'EndsWith', NOW(), NOW());

/* SQL text to insert entity field value with ID 3c28291f-27ab-4120-ab5b-8f344f096362 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('3c28291f-27ab-4120-ab5b-8f344f096362', 'A261204E-3866-41B3-92EB-784C74D2F906', 4, 'Exact', 'Exact', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID A261204E-3866-41B3-92EB-784C74D2F906 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='A261204E-3866-41B3-92EB-784C74D2F906';

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityField
------------------------------------------------------------

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '414D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."EntityID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FA5717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Field Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FC5717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."IsPrimaryKey"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '754317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."IsUnique"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5E4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AutoIncrement"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '045817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."IsVirtual"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '075817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."IsSoftPrimaryKey"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F31790E1-FAA3-425A-B020-AEACAFCB2B6E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."IsSoftForeignKey"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5203089E-9FFC-4BB7-B23C-91F2555504D1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."FieldCodeName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '07AD23D5-DEBD-4657-8E3C-7F1F1342BCE3' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."IsComputed"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Identification & Keys',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B6AD8443-7319-451F-8E3E-A586CEBE87EB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."Sequence"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FB5717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."DisplayName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FD5717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FE5717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AutoUpdateDescription"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '044417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."Category"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F24217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."DefaultInView"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '065817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."ViewCellTemplate"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F34217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."DefaultColumnWidth"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5C4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AllowUpdateInView"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F44217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."IncludeInGeneratedForm"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Include In Form',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F54217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."GeneratedFormSection"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Form Section',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F64217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."RelatedEntityDisplayType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F05717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."ScopeDefault"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0C2449FB-1BDA-4BE9-A059-7224C05A14B9' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AutoUpdateDisplayName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8486168A-5082-48DC-BE13-EF53F49922CB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."Type"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'SQL Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FF5717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."Length"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '005817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."Precision"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '015817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."Scale"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '025817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AllowsNull"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '035817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."DefaultValue"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D74217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."ValueListType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C64D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."ExtendedType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '055817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."CodeType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'TypeScript'
WHERE 
   "ID" = 'B04C17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AllowUpdateAPI"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '404F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."IncludeInUserSearchAPI"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Include In Search',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '424F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."FullTextSearchEnabled"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5E4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."UserSearchParamFormatAPI"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '434F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."IsNameField"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B64217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AutoUpdateIncludeInUserSearchAPI"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9E1D732F-E33E-40FE-AFAD-477623AC9DEA' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."JSONType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D97C0BEC-3B59-4BA2-BAB5-432944AD257B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."JSONTypeIsArray"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'JSON Is Array',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B94F8690-5226-48A9-9C89-4549F141FBB7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."JSONTypeDefinition"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'TypeScript'
WHERE 
   "ID" = '1187C2FF-0226-4790-8D0D-036D9F8A15C1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."UserSearchPredicateAPI"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Search Predicate',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A261204E-3866-41B3-92EB-784C74D2F906' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."RelatedEntityID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '954D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."RelatedEntityFieldName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B74217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."IncludeRelatedEntityNameFieldInBaseView"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '974D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."RelatedEntityNameFieldMap"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F74217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."EntityIDFieldName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '35A18EA5-5641-EF11-86C3-00224821D189' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AutoUpdateRelatedEntityInfo"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FFC3C691-2E33-46D0-B11C-AB348997E08C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."RelatedEntityJoinFields"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Related Join Fields',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EE0B81ED-767A-4BCE-9E6E-E4E48711B482' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."RelatedEntity"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B84217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."RelatedEntitySchemaName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9B4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."RelatedEntityBaseTable"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Related Entity Base Table',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9C4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."RelatedEntityBaseView"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Related Entity Base View',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9D4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."RelatedEntityCodeName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9E4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."RelatedEntityClassName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9F4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."Encrypt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '04C52058-4E01-4316-ABAE-9958AFB71B5C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."EncryptionKeyID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B24D31A6-A3BE-449C-9FE7-98C87E40DA55' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AllowDecryptInAPI"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7C097F3D-79AC-4144-A3B6-A8BFF64EDF3C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."SendEncryptedValue"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '901EE131-BC99-4B80-B5E5-D974057EEA8A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CE5717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CF5717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."ValuesToPackWithSchema"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Values To Pack',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '20818E34-47E7-4371-A51E-3D29BCC4B4B8' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."Status"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '407A96C8-580A-4427-BEED-ABB46F015586' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AutoUpdateIsNameField"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Auto Update Name Field',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5EFD956B-0DB1-491B-9153-0891A7B1835D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AutoUpdateDefaultInView"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Auto Update View Default',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E9707755-1A43-4DE3-815D-37E41CA7C7D0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AutoUpdateCategory"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D64DD327-8057-4DF5-A24C-F951932C1A26' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AutoUpdateUserSearchPredicate"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '292A1BED-3CA2-4C24-8B8E-CAB2A4B2125C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AutoUpdateFullTextSearch"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Auto Update Full Text',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C3CAF473-D086-44CF-AD6C-99A5CCA926DD' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AutoUpdateExtendedType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '58A3A9F6-EE7A-409F-BF3D-AD34C153B84A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."Entity"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '584D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."SchemaName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BA4217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."BaseTable"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '594D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."BaseView"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5A4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."EntityCodeName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A04D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."EntityClassName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B94217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

/* Refresh custom base views for modified entities so schema changes are picked up */


-- ===================== Grants =====================

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntityField" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Entity Fields */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntityField" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
-- Item: spUpdateEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityField
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityField" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityField" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
-- Item: spDeleteEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityField
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityField" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Fields */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityField" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
-- ===================== Comments =====================

COMMENT ON COLUMN __mj."EntityField"."IsComputed" IS 'When 1, this field is a SQL Server computed column or PostgreSQL generated column — physically present in the base table but read-only at the SQL layer. Distinct from IsVirtual, which means the column is not in the base table at all (e.g., joined name lookups in the base view). A computed column has both IsVirtual=1 (read-only at the API layer) and IsComputed=1 (physically in the table). The difference matters for base-view JOIN target selection: when an FK';

COMMENT ON COLUMN __mj."EntityField"."IsVirtual" IS 'When 1, this field is read-only at the API layer (excluded from spCreate / spUpdate / GraphQL input types). Set automatically when the column is either (a) not present in the base table — e.g., a joined name lookup in the base view, or (b) a SQL Server computed column or PostgreSQL generated column. Cases (a) and (b) are distinguished by the IsComputed flag: IsVirtual=1, IsComputed=0 means view-only; IsVirtual=1, IsComputed=1 means computed/generated and physically present in the base table.';


-- ===================== Other =====================

/* Codegen Script */

/* SQL text to insert new entity field */

/* spUpdate Permissions for MJ: Entity Fields */

/* Set categories for 77 fields */

-- UPDATE Entity Field Category Info MJ: Entity Fields."ID"
