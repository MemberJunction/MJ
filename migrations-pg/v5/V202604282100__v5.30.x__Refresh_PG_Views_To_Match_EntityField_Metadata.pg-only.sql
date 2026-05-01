-- Refresh 6 PG views that drifted behind their EntityField metadata. Caused by
-- the same root issue Task #25 fixed for vwEntities: hand-rolled views in the
-- v5.5 PG-only catch-up migration use explicit column lists instead of SELECT *,
-- so subsequent ALTER TABLE ADD COLUMN migrations leave the view stale. The
-- corresponding SQL Server views regenerate automatically because CodeGen
-- re-emits them on every run.
--
-- Audit query that found these (run against any post-v5.29 PG instance):
--   SELECT e."Name", e."BaseView", ARRAY_AGG(ef."Name")
--   FROM __mj."EntityField" ef
--   JOIN __mj."Entity" e ON ef."EntityID" = e."ID"
--   LEFT JOIN information_schema.columns c
--     ON c.table_schema = e."SchemaName" AND c.table_name = e."BaseView"
--    AND c.column_name = ef."Name"
--   WHERE c.column_name IS NULL AND ef."IsVirtual" = false
--     AND e."BaseView" IS NOT NULL AND e."SchemaName" = '__mj'
--   GROUP BY e."Name", e."BaseView";
--
-- Each view fix uses CREATE OR REPLACE which (on PG) only allows APPENDING
-- columns to the existing list. New columns are added at the end; existing
-- ordering is preserved.

-- ── 1. vwAIModels: append SupportsPrefill, PrefillFallbackText (sourced from
--      the LATERAL join on vwAIModelVendors).
CREATE OR REPLACE VIEW __mj."vwAIModels" AS
SELECT
    m."ID", m."Name", m."Description", m."AIModelTypeID", m."PowerRank", m."IsActive",
    m."__mj_CreatedAt", m."__mj_UpdatedAt", m."SpeedRank", m."CostRank",
    m."ModelSelectionInsights", m."InheritTypeModalities", m."PriorVersionID",
    amt."Name" AS "AIModelType",
    v."Name" AS "Vendor",
    mv."DriverClass", mv."DriverImportPath", mv."APIName",
    mv."MaxInputTokens" AS "InputTokenLimit",
    mv."SupportedResponseFormats", mv."SupportsEffortLevel",
    mv."SupportsPrefill", mv."PrefillFallbackText"
FROM __mj."AIModel" m
JOIN __mj."AIModelType" amt ON m."AIModelTypeID" = amt."ID"
LEFT JOIN LATERAL (
    SELECT amv."ModelID", amv."DriverClass", amv."DriverImportPath", amv."APIName",
        amv."MaxInputTokens", amv."SupportedResponseFormats", amv."SupportsEffortLevel",
        amv."SupportsPrefill", amv."PrefillFallbackText", amv."VendorID"
    FROM __mj."vwAIModelVendors" amv
    WHERE amv."ModelID" = m."ID"
      AND amv."Status"::text = 'Active'::text
      AND amv."Type"::text = 'Inference Provider'::text
    ORDER BY amv."Priority" DESC
    LIMIT 1
) mv ON true
LEFT JOIN __mj."AIVendor" v ON mv."VendorID" = v."ID";

-- ── 2. vwCompanyIntegrationRuns: append ScheduledJobRunID.
CREATE OR REPLACE VIEW __mj."vwCompanyIntegrationRuns" AS
SELECT
    cir."ID", cir."CompanyIntegrationID", cir."RunByUserID", cir."StartedAt",
    cir."EndedAt", cir."TotalRecords", cir."Comments", cir."__mj_CreatedAt",
    cir."__mj_UpdatedAt", cir."Status", cir."ErrorLog", cir."ConfigData",
    i."Name" AS "Integration",
    c."Name" AS "Company",
    u."Name" AS "RunByUser",
    cir."ScheduledJobRunID"
FROM __mj."CompanyIntegrationRun" cir
JOIN __mj."CompanyIntegration" ci ON cir."CompanyIntegrationID" = ci."ID"
JOIN __mj."Company" c ON ci."CompanyID" = c."ID"
JOIN __mj."User" u ON cir."RunByUserID" = u."ID"
JOIN __mj."Integration" i ON ci."IntegrationID" = i."ID";

-- ── 3. vwCompanyIntegrations: append the 14 scheduling/source columns added
--      across v5.8, v5.12, and later.
CREATE OR REPLACE VIEW __mj."vwCompanyIntegrations" AS
SELECT
    ci."ID", ci."CompanyID", ci."IntegrationID", ci."IsActive",
    ci."AccessToken", ci."RefreshToken", ci."TokenExpirationDate",
    ci."APIKey", ci."ExternalSystemID", ci."IsExternalSystemReadOnly",
    ci."ClientID", ci."ClientSecret", ci."CustomAttribute1",
    ci."__mj_CreatedAt", ci."__mj_UpdatedAt", ci."Name",
    c."Name" AS "Company",
    i."Name" AS "Integration",
    i."ClassName" AS "DriverClassName",
    i."ImportPath" AS "DriverImportPath",
    cir."ID" AS "LastRunID",
    cir."StartedAt" AS "LastRunStartedAt",
    cir."EndedAt" AS "LastRunEndedAt",
    ci."SourceTypeID", ci."Configuration", ci."CredentialID",
    ci."ScheduleEnabled", ci."ScheduleType", ci."ScheduleIntervalMinutes",
    ci."CronExpression", ci."NextScheduledRunAt", ci."LastScheduledRunAt",
    ci."IsLocked", ci."LockedAt", ci."LockedByInstance",
    ci."LockExpiresAt", ci."ScheduledJobID"
FROM __mj."CompanyIntegration" ci
JOIN __mj."Company" c ON ci."CompanyID" = c."ID"
JOIN __mj."Integration" i ON ci."IntegrationID" = i."ID"
LEFT JOIN __mj."CompanyIntegrationRun" cir
    ON ci."ID" = cir."CompanyIntegrationID"
    AND cir."ID" = (
        SELECT cirinner."ID" FROM __mj."CompanyIntegrationRun" cirinner
        WHERE cirinner."CompanyIntegrationID" = ci."ID"
        ORDER BY cirinner."StartedAt" DESC
        LIMIT 1
    );

-- ── 4. vwEntityFields: append 7 columns (JSON typing + auto-update flags).
CREATE OR REPLACE VIEW __mj."vwEntityFields" AS
SELECT
    ef."ID", ef."EntityID", ef."Sequence", ef."Name", ef."DisplayName",
    ef."Description", ef."AutoUpdateDescription", ef."IsPrimaryKey",
    ef."IsUnique", ef."Category", ef."Type", ef."Length", ef."Precision",
    ef."Scale", ef."AllowsNull", ef."DefaultValue", ef."AutoIncrement",
    ef."ValueListType", ef."ExtendedType", ef."CodeType", ef."DefaultInView",
    ef."ViewCellTemplate", ef."DefaultColumnWidth", ef."AllowUpdateAPI",
    ef."AllowUpdateInView", ef."IncludeInUserSearchAPI",
    ef."FullTextSearchEnabled", ef."UserSearchParamFormatAPI",
    ef."IncludeInGeneratedForm", ef."GeneratedFormSection", ef."IsVirtual",
    ef."IsNameField", ef."RelatedEntityID", ef."RelatedEntityFieldName",
    ef."IncludeRelatedEntityNameFieldInBaseView", ef."RelatedEntityNameFieldMap",
    ef."RelatedEntityDisplayType", ef."EntityIDFieldName",
    ef."__mj_CreatedAt", ef."__mj_UpdatedAt", ef."ScopeDefault",
    ef."AutoUpdateRelatedEntityInfo", ef."ValuesToPackWithSchema",
    ef."Status", ef."AutoUpdateIsNameField", ef."AutoUpdateDefaultInView",
    ef."AutoUpdateCategory", ef."AutoUpdateDisplayName",
    ef."AutoUpdateIncludeInUserSearchAPI", ef."Encrypt", ef."EncryptionKeyID",
    ef."AllowDecryptInAPI", ef."SendEncryptedValue", ef."IsSoftPrimaryKey",
    ef."IsSoftForeignKey", ef."RelatedEntityJoinFields",
    __mj."GetProgrammaticName"(REPLACE(ef."Name"::text, ' '::text, ''::text)) AS "FieldCodeName",
    e."Name" AS "Entity", e."SchemaName", e."BaseTable", e."BaseView",
    e."CodeName" AS "EntityCodeName", e."ClassName" AS "EntityClassName",
    re."Name" AS "RelatedEntity", re."SchemaName" AS "RelatedEntitySchemaName",
    re."BaseTable" AS "RelatedEntityBaseTable", re."BaseView" AS "RelatedEntityBaseView",
    re."CodeName" AS "RelatedEntityCodeName", re."ClassName" AS "RelatedEntityClassName",
    ef."JSONType", ef."JSONTypeIsArray", ef."JSONTypeDefinition",
    ef."UserSearchPredicateAPI", ef."AutoUpdateUserSearchPredicate",
    ef."AutoUpdateFullTextSearch", ef."AutoUpdateExtendedType"
FROM __mj."EntityField" ef
JOIN __mj."vwEntities" e ON ef."EntityID" = e."ID"
LEFT JOIN __mj."vwEntities" re ON ef."RelatedEntityID" = re."ID";

-- ── 5. vwUserViews: preserve existing 28-column shape, append PlatformVariants.
CREATE OR REPLACE VIEW __mj."vwUserViews" AS
SELECT
    uv."ID", uv."UserID", uv."EntityID", uv."Name", uv."Description",
    uv."CategoryID", uv."IsShared", uv."IsDefault", uv."GridState",
    uv."FilterState", uv."CustomFilterState", uv."SmartFilterEnabled",
    uv."SmartFilterPrompt", uv."SmartFilterWhereClause", uv."SmartFilterExplanation",
    uv."WhereClause", uv."CustomWhereClause", uv."SortState",
    uv."__mj_CreatedAt", uv."__mj_UpdatedAt", uv."Thumbnail",
    uv."CardState", uv."DisplayState",
    u."Name" AS "UserName",
    u."FirstLast" AS "UserFirstLast",
    u."Email" AS "UserEmail",
    u."Type" AS "UserType",
    e."Name" AS "Entity",
    e."BaseView" AS "EntityBaseView",
    uv."PlatformVariants"
FROM __mj."UserView" uv
JOIN __mj."vwUsers" u ON uv."UserID" = u."ID"
JOIN __mj."Entity" e ON uv."EntityID" = e."ID";

-- ── 6. vwRowLevelSecurityFilters: preserve 6-column shape, append PlatformVariants.
CREATE OR REPLACE VIEW __mj."vwRowLevelSecurityFilters" AS
SELECT
    "ID", "Name", "Description", "FilterText",
    "__mj_CreatedAt", "__mj_UpdatedAt",
    "PlatformVariants"
FROM __mj."RowLevelSecurityFilter";
