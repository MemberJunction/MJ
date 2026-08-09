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

-- =============================================================================
-- EntityRelationship.RelatedRecordCollection — declare a relationship as a
-- first-class, code-generated related-record collection.
-- =============================================================================
--
-- WHAT THIS ENABLES. MemberJunction 6.2 adds composite entity graphs: a parent
-- record and its related rows that load, validate and persist as one unit, on
-- both tiers, from a single `entity.Save()`. Today a developer opts in by hand,
-- on a shared (client + server) entity subclass:
--
--     public readonly Lines = this.DeclareRelatedRecords<OrderLineEntity>({
--         Name: 'Lines',
--         RelatedEntity: 'MJ_BizApps_Orders: Order Lines',
--         RelatedEntityJoinField: 'OrderHeaderID',
--         OrderBy: 'LineNumber ',
--         Load: 'explicit',
--         OnRemove: 'delete',
--         Sequence: { Field: 'LineNumber', From: 1 },
--     });
--
-- Two of those properties — `RelatedEntity` and `RelatedEntityJoinField` — are
-- already columns on this table. The rest are behavioural policy that has
-- nowhere to live. This column is that home, so CodeGen can emit the whole
-- declaration onto the generated entity subclass instead of every application
-- hand-writing it.
--
-- WHY A JSONType RATHER THAN COLUMNS. The declaration is a small, evolving
-- policy object, not a set of independent facts to query or index. `Sequence` is
-- itself a nested object; `Load` and `OnRemove` are closed value lists that will
-- grow. Modelling it as six-plus nullable scalar columns would mean a migration
-- for every new option and a table where most columns are NULL on most rows —
-- while giving up the one thing that actually matters here, which is a single
-- typed shape that the runtime option type and the generated code both agree on.
--
-- A JSONType gives that: `EntityField.JSONTypeDefinition` holds the TypeScript
-- interface, CodeGen emits a strongly-typed `RelatedRecordCollectionObject`
-- accessor, and adding an option is an interface edit plus `mj sync push` — no
-- schema change at all. This mirrors how `UserView.GridState`, `FilterState` and
-- `CardState` are already modelled.
--
-- ADDITIVE ON PURPOSE. NULL — every existing row — means "this relationship is
-- not a declared collection", which is exactly today's behaviour. Nothing is
-- generated, nothing is loaded eagerly, and no existing consumer changes. Opting
-- in is a per-relationship decision.
--
-- WHO READS IT. `EntitySubClassGeneratorBase.GenerateRelatedRecordCollections()`
-- reads this column together with `RelatedEntity` and `RelatedEntityJoinField`
-- from the same row, and emits the `DeclareRelatedRecords(...)` field initialiser
-- onto the generated entity subclass. Rows with a NULL or malformed value are
-- skipped with a logged error rather than aborting the run — one bad row must not
-- leave the repo with zero generated entities. Hand-written declarations remain
-- valid and are unaffected.
--
-- SEE ALSO. guides/TRANSACTIONS_AND_BATCHING_GUIDE.md — when to use a related
-- record collection versus a provider transaction versus a TransactionGroup.
-- =============================================================================

ALTER TABLE __mj."EntityRelationship"
 ADD COLUMN IF NOT EXISTS "RelatedRecordCollection" TEXT NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityRelationship_EntityID" ON __mj."EntityRelationship" ("EntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityRelationship_RelatedEntityID" ON __mj."EntityRelationship" ("RelatedEntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayUserViewID" ON __mj."EntityRelationship" ("DisplayUserViewID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayComponentID" ON __mj."EntityRelationship" ("DisplayComponentID");


-- ===================== Stored Procedures (sp*) =====================

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spCreateEntityRelationship'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateEntityRelationship"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_RelatedEntityID UUID DEFAULT NULL,
    IN p_BundleInAPI BOOLEAN DEFAULT NULL,
    IN p_IncludeInParentAllQuery BOOLEAN DEFAULT NULL,
    IN p_Type CHAR(20) DEFAULT NULL,
    IN p_EntityKeyField_Clear BOOLEAN DEFAULT FALSE,
    IN p_EntityKeyField VARCHAR(255) DEFAULT NULL,
    IN p_RelatedEntityJoinField VARCHAR(255) DEFAULT NULL,
    IN p_JoinView_Clear BOOLEAN DEFAULT FALSE,
    IN p_JoinView VARCHAR(255) DEFAULT NULL,
    IN p_JoinEntityJoinField_Clear BOOLEAN DEFAULT FALSE,
    IN p_JoinEntityJoinField VARCHAR(255) DEFAULT NULL,
    IN p_JoinEntityInverseJoinField_Clear BOOLEAN DEFAULT FALSE,
    IN p_JoinEntityInverseJoinField VARCHAR(255) DEFAULT NULL,
    IN p_DisplayInForm BOOLEAN DEFAULT NULL,
    IN p_DisplayLocation VARCHAR(50) DEFAULT NULL,
    IN p_DisplayName_Clear BOOLEAN DEFAULT FALSE,
    IN p_DisplayName VARCHAR(255) DEFAULT NULL,
    IN p_DisplayIconType VARCHAR(50) DEFAULT NULL,
    IN p_DisplayIcon_Clear BOOLEAN DEFAULT FALSE,
    IN p_DisplayIcon VARCHAR(255) DEFAULT NULL,
    IN p_DisplayComponentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_DisplayComponentID UUID DEFAULT NULL,
    IN p_DisplayComponentConfiguration_Clear BOOLEAN DEFAULT FALSE,
    IN p_DisplayComponentConfiguration TEXT DEFAULT NULL,
    IN p_AutoUpdateFromSchema BOOLEAN DEFAULT NULL,
    IN p_AdditionalFieldsToInclude_Clear BOOLEAN DEFAULT FALSE,
    IN p_AdditionalFieldsToInclude TEXT DEFAULT NULL,
    IN p_AutoUpdateAdditionalFieldsToInclude BOOLEAN DEFAULT NULL,
    IN p_RelatedRecordCollection_Clear BOOLEAN DEFAULT FALSE,
    IN p_RelatedRecordCollection TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityRelationships" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."EntityRelationship"
            (
                "ID",
                "EntityID",
                "Sequence",
                "RelatedEntityID",
                "BundleInAPI",
                "IncludeInParentAllQuery",
                "Type",
                "EntityKeyField",
                "RelatedEntityJoinField",
                "JoinView",
                "JoinEntityJoinField",
                "JoinEntityInverseJoinField",
                "DisplayInForm",
                "DisplayLocation",
                "DisplayName",
                "DisplayIconType",
                "DisplayIcon",
                "DisplayComponentID",
                "DisplayComponentConfiguration",
                "AutoUpdateFromSchema",
                "AdditionalFieldsToInclude",
                "AutoUpdateAdditionalFieldsToInclude",
                "RelatedRecordCollection"
            )
        VALUES
            (
                p_ID,
                p_EntityID,
                COALESCE(p_Sequence, 0),
                p_RelatedEntityID,
                COALESCE(p_BundleInAPI, TRUE),
                COALESCE(p_IncludeInParentAllQuery, FALSE),
                COALESCE(p_Type, 'One To Many'),
                CASE WHEN p_EntityKeyField_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityKeyField, NULL) END,
                p_RelatedEntityJoinField,
                CASE WHEN p_JoinView_Clear = TRUE THEN NULL ELSE COALESCE(p_JoinView, NULL) END,
                CASE WHEN p_JoinEntityJoinField_Clear = TRUE THEN NULL ELSE COALESCE(p_JoinEntityJoinField, NULL) END,
                CASE WHEN p_JoinEntityInverseJoinField_Clear = TRUE THEN NULL ELSE COALESCE(p_JoinEntityInverseJoinField, NULL) END,
                COALESCE(p_DisplayInForm, TRUE),
                COALESCE(p_DisplayLocation, 'After Field Tabs'),
                CASE WHEN p_DisplayName_Clear = TRUE THEN NULL ELSE COALESCE(p_DisplayName, NULL) END,
                COALESCE(p_DisplayIconType, 'Related Entity Icon'),
                CASE WHEN p_DisplayIcon_Clear = TRUE THEN NULL ELSE COALESCE(p_DisplayIcon, NULL) END,
                CASE WHEN p_DisplayComponentID_Clear = TRUE THEN NULL ELSE COALESCE(p_DisplayComponentID, NULL) END,
                CASE WHEN p_DisplayComponentConfiguration_Clear = TRUE THEN NULL ELSE COALESCE(p_DisplayComponentConfiguration, NULL) END,
                COALESCE(p_AutoUpdateFromSchema, TRUE),
                CASE WHEN p_AdditionalFieldsToInclude_Clear = TRUE THEN NULL ELSE COALESCE(p_AdditionalFieldsToInclude, NULL) END,
                COALESCE(p_AutoUpdateAdditionalFieldsToInclude, TRUE),
                CASE WHEN p_RelatedRecordCollection_Clear = TRUE THEN NULL ELSE COALESCE(p_RelatedRecordCollection, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."EntityRelationship"
            (
                "EntityID",
                "Sequence",
                "RelatedEntityID",
                "BundleInAPI",
                "IncludeInParentAllQuery",
                "Type",
                "EntityKeyField",
                "RelatedEntityJoinField",
                "JoinView",
                "JoinEntityJoinField",
                "JoinEntityInverseJoinField",
                "DisplayInForm",
                "DisplayLocation",
                "DisplayName",
                "DisplayIconType",
                "DisplayIcon",
                "DisplayComponentID",
                "DisplayComponentConfiguration",
                "AutoUpdateFromSchema",
                "AdditionalFieldsToInclude",
                "AutoUpdateAdditionalFieldsToInclude",
                "RelatedRecordCollection"
            )
        VALUES
            (
                p_EntityID,
                COALESCE(p_Sequence, 0),
                p_RelatedEntityID,
                COALESCE(p_BundleInAPI, TRUE),
                COALESCE(p_IncludeInParentAllQuery, FALSE),
                COALESCE(p_Type, 'One To Many'),
                CASE WHEN p_EntityKeyField_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityKeyField, NULL) END,
                p_RelatedEntityJoinField,
                CASE WHEN p_JoinView_Clear = TRUE THEN NULL ELSE COALESCE(p_JoinView, NULL) END,
                CASE WHEN p_JoinEntityJoinField_Clear = TRUE THEN NULL ELSE COALESCE(p_JoinEntityJoinField, NULL) END,
                CASE WHEN p_JoinEntityInverseJoinField_Clear = TRUE THEN NULL ELSE COALESCE(p_JoinEntityInverseJoinField, NULL) END,
                COALESCE(p_DisplayInForm, TRUE),
                COALESCE(p_DisplayLocation, 'After Field Tabs'),
                CASE WHEN p_DisplayName_Clear = TRUE THEN NULL ELSE COALESCE(p_DisplayName, NULL) END,
                COALESCE(p_DisplayIconType, 'Related Entity Icon'),
                CASE WHEN p_DisplayIcon_Clear = TRUE THEN NULL ELSE COALESCE(p_DisplayIcon, NULL) END,
                CASE WHEN p_DisplayComponentID_Clear = TRUE THEN NULL ELSE COALESCE(p_DisplayComponentID, NULL) END,
                CASE WHEN p_DisplayComponentConfiguration_Clear = TRUE THEN NULL ELSE COALESCE(p_DisplayComponentConfiguration, NULL) END,
                COALESCE(p_AutoUpdateFromSchema, TRUE),
                CASE WHEN p_AdditionalFieldsToInclude_Clear = TRUE THEN NULL ELSE COALESCE(p_AdditionalFieldsToInclude, NULL) END,
                COALESCE(p_AutoUpdateAdditionalFieldsToInclude, TRUE),
                CASE WHEN p_RelatedRecordCollection_Clear = TRUE THEN NULL ELSE COALESCE(p_RelatedRecordCollection, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwEntityRelationships" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateEntityRelationship'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateEntityRelationship"(
    IN p_ID UUID,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_RelatedEntityID UUID DEFAULT NULL,
    IN p_BundleInAPI BOOLEAN DEFAULT NULL,
    IN p_IncludeInParentAllQuery BOOLEAN DEFAULT NULL,
    IN p_Type CHAR(20) DEFAULT NULL,
    IN p_EntityKeyField_Clear BOOLEAN DEFAULT FALSE,
    IN p_EntityKeyField VARCHAR(255) DEFAULT NULL,
    IN p_RelatedEntityJoinField VARCHAR(255) DEFAULT NULL,
    IN p_JoinView_Clear BOOLEAN DEFAULT FALSE,
    IN p_JoinView VARCHAR(255) DEFAULT NULL,
    IN p_JoinEntityJoinField_Clear BOOLEAN DEFAULT FALSE,
    IN p_JoinEntityJoinField VARCHAR(255) DEFAULT NULL,
    IN p_JoinEntityInverseJoinField_Clear BOOLEAN DEFAULT FALSE,
    IN p_JoinEntityInverseJoinField VARCHAR(255) DEFAULT NULL,
    IN p_DisplayInForm BOOLEAN DEFAULT NULL,
    IN p_DisplayLocation VARCHAR(50) DEFAULT NULL,
    IN p_DisplayName_Clear BOOLEAN DEFAULT FALSE,
    IN p_DisplayName VARCHAR(255) DEFAULT NULL,
    IN p_DisplayIconType VARCHAR(50) DEFAULT NULL,
    IN p_DisplayIcon_Clear BOOLEAN DEFAULT FALSE,
    IN p_DisplayIcon VARCHAR(255) DEFAULT NULL,
    IN p_DisplayComponentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_DisplayComponentID UUID DEFAULT NULL,
    IN p_DisplayComponentConfiguration_Clear BOOLEAN DEFAULT FALSE,
    IN p_DisplayComponentConfiguration TEXT DEFAULT NULL,
    IN p_AutoUpdateFromSchema BOOLEAN DEFAULT NULL,
    IN p_AdditionalFieldsToInclude_Clear BOOLEAN DEFAULT FALSE,
    IN p_AdditionalFieldsToInclude TEXT DEFAULT NULL,
    IN p_AutoUpdateAdditionalFieldsToInclude BOOLEAN DEFAULT NULL,
    IN p_RelatedRecordCollection_Clear BOOLEAN DEFAULT FALSE,
    IN p_RelatedRecordCollection TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityRelationships" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."EntityRelationship"
    SET
        "EntityID" = COALESCE(p_EntityID, "EntityID"),
        "Sequence" = COALESCE(p_Sequence, "Sequence"),
        "RelatedEntityID" = COALESCE(p_RelatedEntityID, "RelatedEntityID"),
        "BundleInAPI" = COALESCE(p_BundleInAPI, "BundleInAPI"),
        "IncludeInParentAllQuery" = COALESCE(p_IncludeInParentAllQuery, "IncludeInParentAllQuery"),
        "Type" = COALESCE(p_Type, "Type"),
        "EntityKeyField" = CASE WHEN p_EntityKeyField_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityKeyField, "EntityKeyField") END,
        "RelatedEntityJoinField" = COALESCE(p_RelatedEntityJoinField, "RelatedEntityJoinField"),
        "JoinView" = CASE WHEN p_JoinView_Clear = TRUE THEN NULL ELSE COALESCE(p_JoinView, "JoinView") END,
        "JoinEntityJoinField" = CASE WHEN p_JoinEntityJoinField_Clear = TRUE THEN NULL ELSE COALESCE(p_JoinEntityJoinField, "JoinEntityJoinField") END,
        "JoinEntityInverseJoinField" = CASE WHEN p_JoinEntityInverseJoinField_Clear = TRUE THEN NULL ELSE COALESCE(p_JoinEntityInverseJoinField, "JoinEntityInverseJoinField") END,
        "DisplayInForm" = COALESCE(p_DisplayInForm, "DisplayInForm"),
        "DisplayLocation" = COALESCE(p_DisplayLocation, "DisplayLocation"),
        "DisplayName" = CASE WHEN p_DisplayName_Clear = TRUE THEN NULL ELSE COALESCE(p_DisplayName, "DisplayName") END,
        "DisplayIconType" = COALESCE(p_DisplayIconType, "DisplayIconType"),
        "DisplayIcon" = CASE WHEN p_DisplayIcon_Clear = TRUE THEN NULL ELSE COALESCE(p_DisplayIcon, "DisplayIcon") END,
        "DisplayComponentID" = CASE WHEN p_DisplayComponentID_Clear = TRUE THEN NULL ELSE COALESCE(p_DisplayComponentID, "DisplayComponentID") END,
        "DisplayComponentConfiguration" = CASE WHEN p_DisplayComponentConfiguration_Clear = TRUE THEN NULL ELSE COALESCE(p_DisplayComponentConfiguration, "DisplayComponentConfiguration") END,
        "AutoUpdateFromSchema" = COALESCE(p_AutoUpdateFromSchema, "AutoUpdateFromSchema"),
        "AdditionalFieldsToInclude" = CASE WHEN p_AdditionalFieldsToInclude_Clear = TRUE THEN NULL ELSE COALESCE(p_AdditionalFieldsToInclude, "AdditionalFieldsToInclude") END,
        "AutoUpdateAdditionalFieldsToInclude" = COALESCE(p_AutoUpdateAdditionalFieldsToInclude, "AutoUpdateAdditionalFieldsToInclude"),
        "RelatedRecordCollection" = CASE WHEN p_RelatedRecordCollection_Clear = TRUE THEN NULL ELSE COALESCE(p_RelatedRecordCollection, "RelatedRecordCollection") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwEntityRelationships" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwEntityRelationships" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEntityRelationship'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityRelationship"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityRelationship"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateEntityRelationship_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateEntityRelationship" ON __mj."EntityRelationship";
CREATE TRIGGER "trgUpdateEntityRelationship"
    BEFORE UPDATE ON __mj."EntityRelationship"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateEntityRelationship_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '63d34842-09ba-47e6-8467-ae8783446cec' OR ("EntityID" = 'E2238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'RelatedRecordCollection')
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
        '63d34842-09ba-47e6-8467-ae8783446cec',
        'E2238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Entity" "Relationships"
        100062,
        'RelatedRecordCollection',
        'Related Record Collection',
        'Optional JSON policy object that declares this relationship as a first-class related-record collection, so CodeGen can emit a typed DeclareRelatedRecords(...) declaration on the entity subclass. Shape is IRelatedRecordCollectionConfig: Name (the generated property name, e.g. "Lines"), Load (''explicit'' | ''immediate'' | ''lazy'' | ''never''), Source (''database'' | ''cache''), ReadOnly, OnRemove (''delete'' | ''orphan'' | ''refuse''), OrderBy, Sequence ({ Field, From }), and ClearAfterSave. Source ''cache'' reads the related records from whichever loaded BaseEngine already holds that entity, costing no query, and defaults ReadOnly to true because those are the engine''s own instances; ''lazy'' fills on first access and requires both. RelatedEntity and RelatedEntityJoinField are NOT repeated here — they are read from this row''s own columns. NULL means the relationship is not a declared collection, which is the default and reproduces pre-6.2 behaviour exactly.',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
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

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5D4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.EntityID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5E4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.Sequence

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '104F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.RelatedEntityID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Related Entity',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5F4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.Type

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Relationship Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '614D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.EntityKeyField

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '824D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.RelatedEntityJoinField

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '624D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.JoinView

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '634D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.JoinEntityJoinField

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '644D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.JoinEntityInverseJoinField

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '654D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.Entity

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '205817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.EntityBaseTable

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '215817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.EntityBaseView

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '225817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.RelatedEntity

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Related Entity Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '235817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.RelatedEntityBaseTable

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '245817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.RelatedEntityBaseView

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '255817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.RelatedEntityClassName

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BB4217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.RelatedEntityCodeName

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BC4217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.RelatedEntityBaseTableCodeName

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BD4217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.BundleInAPI

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '604D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.IncludeInParentAllQuery

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Include In Parent Query',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '944D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.AdditionalFieldsToInclude

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Additional Fields',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '77AF286F-1A6B-4119-B569-86664154F757' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.AutoUpdateAdditionalFieldsToInclude

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Auto-Update Additional Fields',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AC4AB7A1-6B60-4D47-8443-BFAFC15B0E6A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.RelatedRecordCollection

UPDATE __mj."EntityField"
SET 
   "Category" = 'API & Query Settings',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Related Record Collection Policy',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '63D34842-09BA-47E6-8467-AE8783446CEC' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.DisplayInForm

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '984D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.DisplayLocation

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2F4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.DisplayName

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '994D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.DisplayIconType

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '304D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.DisplayIcon

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EE5717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.DisplayUserViewID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Display User View',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3E4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.DisplayComponentID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Display Component',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F15717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.DisplayComponentConfiguration

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Display Component Config',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'F25717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.DisplayUserViewName

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3D4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Created At',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D25717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Updated At',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D35717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.AutoUpdateFromSchema

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Auto-Update From Schema',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7E307D9F-A7FE-44A8-85D9-A97C85EF1C71' AND "AutoUpdateCategory" = TRUE;

/* Refresh custom base views for modified entities so schema changes are picked up */


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwEntityRelationships" TO "cdp_Integration", "cdp_Developer", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Relationships
-- Item: spCreateEntityRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityRelationship
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntityRelationship" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Entity Relationships */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntityRelationship" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Relationships
-- Item: spUpdateEntityRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityRelationship
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityRelationship" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityRelationship" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Relationships
-- Item: spDeleteEntityRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityRelationship
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityRelationship" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Relationships */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityRelationship" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* Set categories for 36 fields */

-- UPDATE Entity Field Category Info MJ: Entity Relationships.ID;


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."EntityRelationship"."RelatedRecordCollection" IS 'Optional JSON policy object that declares this relationship as a first-class related-record collection, so CodeGen can emit a typed DeclareRelatedRecords(...) declaration on the entity subclass. Shape is IRelatedRecordCollectionConfig: Name (the generated property name, e.g. "Lines"), Load (''explicit'' | ''immediate'' | ''lazy'' | ''never''), Source (''database'' | ''cache''), ReadOnly, OnRemove (''delete'' | ''orphan'' | ''refuse''), OrderBy, Sequence ({ Field, From }), and ClearAfterSave. Source ''cache'' reads the related records from whichever loaded BaseEngine already holds that entity, costing no query, and defaults ReadOnly to true because those are the engine''s own instances; ''lazy'' fills on first access and requires both. RelatedEntity and RelatedEntityJoinField are NOT repeated here — they are read from this row''s own columns. NULL means the relationship is not a declared collection, which is the default and reproduces pre-6.2 behaviour exactly.';


-- ===================== Other =====================

/*
================================================================================================
================================================================================================
====                                                                                        ====
====                  GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL                          ====
====                          DO NOT EDIT BY HAND                                           ====
====                                                                                        ====
================================================================================================
================================================================================================

Everything below this block was produced by `mj codegen` against a database carrying the
hand-written DDL above. It is the generated counterpart of that DDL.

HOW IT WAS GENERATED
  A dedicated database (MJ_6_1_0_BaseEntity) was built from this branch's full migration set --
  `next` plus the DDL above -- so the output is attributable to this migration alone and carries
  no in-flight work from any other branch.

WHAT IT CONTAINS
  * The new EntityField row for MJ: Entity Relationships.RelatedRecordCollection. This row is
    what makes the column visible to the metadata layer at all: without it
    `EntityRelationshipInfo.RelatedRecordCollection` is always null and CodeGen's
    `GenerateRelatedRecordCollections()` has nothing to read.
  * 36 EntityField category/display updates for MJ: Entity Relationships (GeneratedFormSection,
    DisplayName, ExtendedType, CodeType), each guarded by `AutoUpdateCategory = 1` so a field a
    deployment has deliberately pinned is left alone.
  * Regenerated spCreateEntityRelationship / spUpdateEntityRelationship / spDeleteEntityRelationship
    plus their permission grants, so the new column round-trips through the write path.
  * `sp_refreshview` on vwEntityRelationships -- that view is a custom base view, so it is rebound
    rather than regenerated, which is how the new column reaches the read path.

Verified on generation: references __mj throughout with no hardcoded schema
name, and every statement is attributable to the DDL above.

IF THE HAND-WRITTEN DDL ABOVE CHANGES, DO NOT PATCH THIS SECTION BY HAND.
Re-run CodeGen and replace this entire generated section wholesale.
================================================================================================
*/

/* SQL text to insert 1 new entity field(s) */

/* spUpdate Permissions for MJ: Entity Relationships */
