-- ============================================================================
-- Expose the remaining declared EntityFields through their base views (PostgreSQL)
-- ============================================================================
--
-- WHY THIS EXISTS (#3869)
--
-- An audit of a clean PostgreSQL install — MJ's own EntityField metadata cross-
-- referenced against the catalog — found five fields declared in metadata and present
-- on their base TABLE, but not selected by their base VIEW. V202608160100 exposed the
-- first (Entity.GeneratedBaseViewName, #3837, because it made #3477's guard
-- unreachable); this migration exposes the other four:
--
--   Entity.AllowDirectSQLInsert
--   Entity.AllowDirectSQLUpdate
--   Entity.AllowDirectSQLDelete
--   EntityRelationship.RelatedRecordCollection
--
-- All are IsVirtual = false, AllowUpdateAPI = true and present on the base table, so
-- none is a deliberate omission. Entity.ExternalDataSourceID and
-- Entity.ExternalObjectName are ALSO absent from vwEntities and are correctly absent —
-- they carry no EntityField row on Entity, matching #3514's note that
-- vwEntities.ExternalDataSourceID was deliberately dropped. "Declared as an
-- EntityField" is the filter that separates a defect from an intentional omission, and
-- is why this set is five and not seven: regenerating the view wholesale would have
-- quietly reinstated that pair.
--
-- CAUSE. The SQL Server migration that adds such a column also regenerates the view;
-- the PostgreSQL counterpart adds the column and does not (#3837 has the traced
-- mechanism). The remaining four have no traced symptom yet, which is the concern
-- rather than the reassurance.
--
-- ORDERING — LOAD-BEARING. This runs AFTER V202608160100, and its view definition
-- INCLUDES the GeneratedBaseViewName column that migration appended. `CREATE OR
-- REPLACE VIEW` may only APPEND columns: it cannot rename or reorder existing ones.
-- Rebuilding this from the pre-0100 definition would try to put AllowDirectSQLInsert
-- where GeneratedBaseViewName now sits and fail with
--   cannot change name of view column "GeneratedBaseViewName" to "AllowDirectSQLInsert"
-- Timestamp order guarantees 0100 first; do not reorder these two.
--
-- DROP/CREATE is not an option: PostgreSQL tracks a hard dependency from the generated
-- CRUD functions to each view's row type, so a DROP needs CASCADE and takes them with
-- it (the hazard #3477 records for vwVersionInstallations). Nothing reads these views
-- positionally — the provider maps by name — and a later `mj codegen` restores
-- canonical ordering.
--
-- vwEntities is replaced first because vwEntityRelationships selects from it.
--
-- pg-only: the SQL Server side already ships these columns in its own views.
-- ============================================================================

CREATE OR REPLACE VIEW __mj."vwEntities" AS
SELECT e."ID",
    e."ParentID",
    e."Name",
    e."NameSuffix",
    e."Description",
    e."AutoUpdateDescription",
    e."BaseTable",
    e."BaseView",
    e."BaseViewGenerated",
    e."SchemaName",
    e."VirtualEntity",
    e."TrackRecordChanges",
    e."AuditRecordAccess",
    e."AuditViewRuns",
    e."IncludeInAPI",
    e."AllowAllRowsAPI",
    e."AllowUpdateAPI",
    e."AllowCreateAPI",
    e."AllowDeleteAPI",
    e."CustomResolverAPI",
    e."AllowUserSearchAPI",
    e."FullTextSearchEnabled",
    e."FullTextCatalog",
    e."FullTextCatalogGenerated",
    e."FullTextIndex",
    e."FullTextIndexGenerated",
    e."FullTextSearchFunction",
    e."FullTextSearchFunctionGenerated",
    e."UserViewMaxRows",
    e."spCreate",
    e."spUpdate",
    e."spDelete",
    e."spCreateGenerated",
    e."spUpdateGenerated",
    e."spDeleteGenerated",
    e."CascadeDeletes",
    e."DeleteType",
    e."AllowRecordMerge",
    e."spMatch",
    e."RelationshipDefaultDisplayType",
    e."UserFormGenerated",
    e."EntityObjectSubclassName",
    e."EntityObjectSubclassImport",
    e."PreferredCommunicationField",
    e."Icon",
    e."__mj_CreatedAt",
    e."__mj_UpdatedAt",
    e."ScopeDefault",
    e."RowsToPackWithSchema",
    e."RowsToPackSampleMethod",
    e."RowsToPackSampleCount",
    e."RowsToPackSampleOrder",
    e."AutoRowCountFrequency",
    e."RowCount",
    e."RowCountRunAt",
    e."Status",
    e."DisplayName",
    e."AllowMultipleSubtypes",
    e."AutoUpdateFullTextSearch",
    e."AutoUpdateAllowUserSearchAPI",
    e."TrustServerCacheCompletely",
    e."SupportsGeoCoding",
    e."AutoUpdateSupportsGeoCoding",
    e."AllowCaching",
    e."DetectExternalChanges",
    __mj."GetProgrammaticName"(__mj."GetClassNameSchemaPrefix"(COALESCE(si."CanonicalSchemaName", e."SchemaName"))::text || replace(
        CASE
            WHEN si."EntityNamePrefix" IS NOT NULL THEN replace(e."Name"::text, si."EntityNamePrefix"::text, ''::text)::character varying
            ELSE e."Name"
        END::text, ' '::text, ''::text)) AS "CodeName",
    __mj."GetProgrammaticName"((__mj."GetClassNameSchemaPrefix"(COALESCE(si."CanonicalSchemaName", e."SchemaName"))::text || e."BaseTable"::text) || COALESCE(e."NameSuffix", ''::character varying)::text) AS "ClassName",
    __mj."GetProgrammaticName"(e."BaseTable"::text || COALESCE(e."NameSuffix", ''::character varying)::text) AS "BaseTableCodeName",
    par."Name" AS "ParentEntity",
    par."BaseTable" AS "ParentBaseTable",
    par."BaseView" AS "ParentBaseView",
    si."CanonicalSchemaName",
    e."GeneratedBaseViewName",
    e."AllowDirectSQLInsert",
    e."AllowDirectSQLUpdate",
    e."AllowDirectSQLDelete"
   FROM __mj."Entity" e
     LEFT JOIN __mj."Entity" par ON e."ParentID" = par."ID"
     LEFT JOIN __mj."SchemaInfo" si ON e."SchemaName"::text = si."SchemaName"::text;

CREATE OR REPLACE VIEW __mj."vwEntityRelationships" AS
SELECT er."ID",
    er."EntityID",
    er."Sequence",
    er."RelatedEntityID",
    er."BundleInAPI",
    er."IncludeInParentAllQuery",
    er."Type",
    er."EntityKeyField",
    er."RelatedEntityJoinField",
    er."JoinView",
    er."JoinEntityJoinField",
    er."JoinEntityInverseJoinField",
    er."DisplayInForm",
    er."DisplayLocation",
    er."DisplayName",
    er."DisplayIconType",
    er."DisplayIcon",
    er."DisplayUserViewID",
    er."DisplayComponentID",
    er."DisplayComponentConfiguration",
    er."__mj_CreatedAt",
    er."__mj_UpdatedAt",
    er."AutoUpdateFromSchema",
    er."AdditionalFieldsToInclude",
    er."AutoUpdateAdditionalFieldsToInclude",
    e."Name" AS "Entity",
    e."BaseTable" AS "EntityBaseTable",
    e."BaseView" AS "EntityBaseView",
    relatedentity."Name" AS "RelatedEntity",
    relatedentity."BaseTable" AS "RelatedEntityBaseTable",
    relatedentity."BaseView" AS "RelatedEntityBaseView",
    relatedentity."ClassName" AS "RelatedEntityClassName",
    relatedentity."CodeName" AS "RelatedEntityCodeName",
    relatedentity."BaseTableCodeName" AS "RelatedEntityBaseTableCodeName",
    uv."Name" AS "DisplayUserViewName",
    er."RelatedRecordCollection"
   FROM __mj."EntityRelationship" er
     JOIN __mj."Entity" e ON er."EntityID" = e."ID"
     JOIN __mj."vwEntities" relatedentity ON er."RelatedEntityID" = relatedentity."ID"
     LEFT JOIN __mj."UserView" uv ON er."DisplayUserViewID" = uv."ID";

GRANT SELECT ON __mj."vwEntities" TO "cdp_Developer";
GRANT SELECT ON __mj."vwEntities" TO "cdp_Integration";
GRANT SELECT ON __mj."vwEntities" TO "cdp_UI";
GRANT SELECT ON __mj."vwEntityRelationships" TO "cdp_Developer";
GRANT SELECT ON __mj."vwEntityRelationships" TO "cdp_Integration";
GRANT SELECT ON __mj."vwEntityRelationships" TO "cdp_UI";
