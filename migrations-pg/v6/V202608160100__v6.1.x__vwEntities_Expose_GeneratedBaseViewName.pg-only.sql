-- ============================================================================
-- Expose Entity.GeneratedBaseViewName through __mj.vwEntities on PostgreSQL
-- ============================================================================
--
-- WHY THIS EXISTS (#3837)
--
-- V202608050100 added `GeneratedBaseViewName` to `__mj.Entity`. On SQL Server that
-- migration ALSO regenerated `vwEntities`, so the column became visible through the
-- view — its own header says so ("the regenerated vwEntities … the new columns
-- visible through vwEntities"). Its PostgreSQL counterpart added the column to the
-- table and re-granted on the view, but never recreated it.
--
-- The metadata provider reads entities through `vwEntities`, so on PostgreSQL
-- `EntityInfo.GeneratedBaseViewName` was always undefined and `HasLayeredBaseView`
-- was therefore always FALSE. Three things followed mechanically:
--
--   * both CodeGen gates — `(BaseViewGenerated || HasLayeredBaseView)` in
--     executeEntityInPhases and generateSingleEntitySQLToSeparateFiles — evaluated
--     false for a layered entity, so `generateBaseView()` was never called;
--   * `assertLayeredBaseViewSupported()` therefore could not fire, and the
--     deliberate PostgreSQL refusal documented in #3477 was unreachable;
--   * with `BaseViewGenerated = false` the entity fell to the permissions-only
--     branch, emitting `vw*.view.permissions.generated.sql` and no view.
--
-- Observed on bizapps-common: `People` and `Organizations` produced a permissions
-- file and no base view, while non-layered entities in the same schema produced
-- both, and `mj codegen` reported success either way.
--
-- WHY `CREATE OR REPLACE` AND NOT DROP/CREATE
--
-- PostgreSQL tracks a hard dependency from `spCreateEntity` / `spUpdateEntity` to
-- this view's row type, so a DROP would need CASCADE and would take the CRUD
-- functions with it (the same hazard #3477 records for vwVersionInstallations).
-- `CREATE OR REPLACE` can only APPEND columns, which is why the column lands at
-- the end of the select list rather than in the position SQL Server uses. Nothing
-- reads this view positionally — the provider maps by name — and a later
-- `mj codegen` run restores the canonical ordering.
--
-- pg-only: the SQL Server side already ships this column in its own vwEntities.
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
    e."GeneratedBaseViewName"
   FROM __mj."Entity" e
     LEFT JOIN __mj."Entity" par ON e."ParentID" = par."ID"
     LEFT JOIN __mj."SchemaInfo" si ON e."SchemaName"::text = si."SchemaName"::text;

GRANT SELECT ON __mj."vwEntities" TO "cdp_Developer";
GRANT SELECT ON __mj."vwEntities" TO "cdp_Integration";
GRANT SELECT ON __mj."vwEntities" TO "cdp_UI";
