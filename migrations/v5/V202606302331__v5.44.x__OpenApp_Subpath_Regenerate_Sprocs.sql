-- =============================================================================================
-- Follow-up fix for GitHub issue #2998
-- "mj app install fails on SQL Server (v5.43.x+) — V202606260000__OpenApp_Subpath.sql adds the
--  Subpath column but never regenerates spCreateOpenApp/spUpdateOpenApp"
-- =============================================================================================
--
-- ROOT CAUSE
--   V202606260000__v5.43.x__OpenApp_Subpath.sql (SQL Server) added the __mj.OpenApp.Subpath
--   COLUMN only. Unlike its Postgres twin (migrations-pg/v5/V202606260000...pg.sql) and its
--   SQL Server sibling V202606031813__v5.39.x__AIAgentRun_LastHeartbeatAt.sql, it did NOT
--   insert the EntityField metadata or regenerate the CRUD sprocs. Once Subpath is present in
--   the OpenApp metadata, the SQL Server BaseEntity provider emits
--       EXEC spCreateOpenApp ... @Subpath = ...
--   but the deployed spCreateOpenApp (last defined in V202602171919__v5.1.x, pre-Subpath) has
--   no @Subpath parameter, so SQL Server rejects the call and any OpenApp create — notably
--   `mj app install` (RecordInstallationAtomically) — rolls back.
--
-- WHAT THIS MIGRATION DOES (self-contained; does NOT depend on deploy-time CodeGen running over __mj)
--   1. Inserts the EntityField metadata row for OpenApp.Subpath (idempotent — skipped when a
--      deploy-time CodeGen already created it). Uses the SAME EntityField ID as the Postgres
--      twin so SS and PG metadata stay in lockstep.
--   2. Regenerates spCreateOpenApp and spUpdateOpenApp WITH @Subpath, in the current CodeGen
--      shape (the _Clear-companion pattern used by AIAgentRun_LastHeartbeatAt and the PG twin),
--      faithfully translated from the PG twin's regenerated OpenApp artifacts.
--
-- NOTES
--   * The Subpath COLUMN and its MS_Description already exist (V202606260000) — not re-added.
--   * The base view vwOpenApps is `SELECT o.*` (v5.1.x), so it already exposes Subpath — no
--     view regeneration is required for the sprocs' SELECT-back to return the new column.
--   * Grants match the OpenApp entity permission set (cdp_Developer, cdp_Integration — no cdp_UI),
--     consistent with the original v5.1.x grants and the PG twin.
--   * This migration intentionally bakes EntityField + sproc SQL that CodeGen normally owns. That
--     is the documented remedy for the "the SS source itself is the anomaly" case
--     (migrations-pg/MIGRATION_DECISION_TREE.md Q5) for a __mj core-schema change that must be
--     self-contained across deployments that treat migrations as the source of truth.
-- =============================================================================================


-- ---------------------------------------------------------------------------------------------
-- 1) EntityField metadata for the new OpenApp.Subpath column
--    (idempotent: no-op when deploy-time CodeGen already introspected the column)
-- ---------------------------------------------------------------------------------------------
IF NOT EXISTS (
        SELECT 1 FROM [${flyway:defaultSchema}].[EntityField]
        WHERE [ID] = 'C7E3A1F0-5B2D-4E88-9A1C-0F3B6D8E2A14'
           OR ([EntityID] = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND [Name] = 'Subpath'))
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[EntityField]
    (
        [ID],
        [EntityID],
        [Sequence],
        [Name],
        [DisplayName],
        [Description],
        [Type],
        [Length],
        [Precision],
        [Scale],
        [AllowsNull],
        [DefaultValue],
        [AutoIncrement],
        [AllowUpdateAPI],
        [IsVirtual],
        [IsComputed],
        [RelatedEntityID],
        [RelatedEntityFieldName],
        [IsNameField],
        [IncludeInUserSearchAPI],
        [IncludeRelatedEntityNameFieldInBaseView],
        [DefaultInView],
        [IsPrimaryKey],
        [IsUnique],
        [RelatedEntityDisplayType]
    )
    VALUES
    (
        'C7E3A1F0-5B2D-4E88-9A1C-0F3B6D8E2A14',
        'AC4A2799-454B-4395-AA56-A42241F32C12', -- Entity: MJ: Open Apps
        100021,
        'Subpath',
        'Subpath',
        'In-repo subdirectory the app was installed from for multi-app repositories (e.g. ''CRM/HubSpot''). NULL when the app''s mj-app.json is at the repository root.',
        'nvarchar',
        1000,
        0,
        0,
        1,
        NULL,
        0,
        1,
        0,
        0,
        NULL,
        NULL,
        0,
        0,
        0,
        0,
        0,
        0,
        'Search'
    );
END
GO


-- ---------------------------------------------------------------------------------------------
-- 2) spCreateOpenApp — regenerated WITH @Subpath (current CodeGen _Clear-companion shape)
-- ---------------------------------------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOpenApp]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOpenApp];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOpenApp]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(64),
    @DisplayName nvarchar(200),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Version nvarchar(50),
    @Publisher nvarchar(200),
    @PublisherEmail_Clear bit = 0,
    @PublisherEmail nvarchar(255) = NULL,
    @PublisherURL_Clear bit = 0,
    @PublisherURL nvarchar(500) = NULL,
    @RepositoryURL nvarchar(500),
    @SchemaName_Clear bit = 0,
    @SchemaName nvarchar(128) = NULL,
    @MJVersionRange nvarchar(100),
    @License_Clear bit = 0,
    @License nvarchar(50) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(100) = NULL,
    @Color_Clear bit = 0,
    @Color nvarchar(20) = NULL,
    @ManifestJSON nvarchar(MAX),
    @ConfigurationSchemaJSON_Clear bit = 0,
    @ConfigurationSchemaJSON nvarchar(MAX) = NULL,
    @InstalledByUserID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @Subpath_Clear bit = 0,
    @Subpath nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OpenApp]
            (
                [ID],
                [Name],
                [DisplayName],
                [Description],
                [Version],
                [Publisher],
                [PublisherEmail],
                [PublisherURL],
                [RepositoryURL],
                [SchemaName],
                [MJVersionRange],
                [License],
                [Icon],
                [Color],
                [ManifestJSON],
                [ConfigurationSchemaJSON],
                [InstalledByUserID],
                [Status],
                [Subpath]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @DisplayName,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @Version,
                @Publisher,
                CASE WHEN @PublisherEmail_Clear = 1 THEN NULL ELSE ISNULL(@PublisherEmail, NULL) END,
                CASE WHEN @PublisherURL_Clear = 1 THEN NULL ELSE ISNULL(@PublisherURL, NULL) END,
                @RepositoryURL,
                CASE WHEN @SchemaName_Clear = 1 THEN NULL ELSE ISNULL(@SchemaName, NULL) END,
                @MJVersionRange,
                CASE WHEN @License_Clear = 1 THEN NULL ELSE ISNULL(@License, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                CASE WHEN @Color_Clear = 1 THEN NULL ELSE ISNULL(@Color, NULL) END,
                @ManifestJSON,
                CASE WHEN @ConfigurationSchemaJSON_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationSchemaJSON, NULL) END,
                @InstalledByUserID,
                ISNULL(@Status, 'Active'),
                CASE WHEN @Subpath_Clear = 1 THEN NULL ELSE ISNULL(@Subpath, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OpenApp]
            (
                [Name],
                [DisplayName],
                [Description],
                [Version],
                [Publisher],
                [PublisherEmail],
                [PublisherURL],
                [RepositoryURL],
                [SchemaName],
                [MJVersionRange],
                [License],
                [Icon],
                [Color],
                [ManifestJSON],
                [ConfigurationSchemaJSON],
                [InstalledByUserID],
                [Status],
                [Subpath]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @DisplayName,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @Version,
                @Publisher,
                CASE WHEN @PublisherEmail_Clear = 1 THEN NULL ELSE ISNULL(@PublisherEmail, NULL) END,
                CASE WHEN @PublisherURL_Clear = 1 THEN NULL ELSE ISNULL(@PublisherURL, NULL) END,
                @RepositoryURL,
                CASE WHEN @SchemaName_Clear = 1 THEN NULL ELSE ISNULL(@SchemaName, NULL) END,
                @MJVersionRange,
                CASE WHEN @License_Clear = 1 THEN NULL ELSE ISNULL(@License, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                CASE WHEN @Color_Clear = 1 THEN NULL ELSE ISNULL(@Color, NULL) END,
                @ManifestJSON,
                CASE WHEN @ConfigurationSchemaJSON_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationSchemaJSON, NULL) END,
                @InstalledByUserID,
                ISNULL(@Status, 'Active'),
                CASE WHEN @Subpath_Clear = 1 THEN NULL ELSE ISNULL(@Subpath, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOpenApps] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOpenApp] TO [cdp_Developer], [cdp_Integration];
GO


-- ---------------------------------------------------------------------------------------------
-- 3) spUpdateOpenApp — regenerated WITH @Subpath (current CodeGen _Clear-companion shape)
-- ---------------------------------------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOpenApp]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOpenApp];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOpenApp]
    @ID uniqueidentifier,
    @Name nvarchar(64),
    @DisplayName nvarchar(200),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Version nvarchar(50),
    @Publisher nvarchar(200),
    @PublisherEmail_Clear bit = 0,
    @PublisherEmail nvarchar(255) = NULL,
    @PublisherURL_Clear bit = 0,
    @PublisherURL nvarchar(500) = NULL,
    @RepositoryURL nvarchar(500),
    @SchemaName_Clear bit = 0,
    @SchemaName nvarchar(128) = NULL,
    @MJVersionRange nvarchar(100),
    @License_Clear bit = 0,
    @License nvarchar(50) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(100) = NULL,
    @Color_Clear bit = 0,
    @Color nvarchar(20) = NULL,
    @ManifestJSON nvarchar(MAX),
    @ConfigurationSchemaJSON_Clear bit = 0,
    @ConfigurationSchemaJSON nvarchar(MAX) = NULL,
    @InstalledByUserID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @Subpath_Clear bit = 0,
    @Subpath nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OpenApp]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [DisplayName] = ISNULL(@DisplayName, [DisplayName]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Version] = ISNULL(@Version, [Version]),
        [Publisher] = ISNULL(@Publisher, [Publisher]),
        [PublisherEmail] = CASE WHEN @PublisherEmail_Clear = 1 THEN NULL ELSE ISNULL(@PublisherEmail, [PublisherEmail]) END,
        [PublisherURL] = CASE WHEN @PublisherURL_Clear = 1 THEN NULL ELSE ISNULL(@PublisherURL, [PublisherURL]) END,
        [RepositoryURL] = ISNULL(@RepositoryURL, [RepositoryURL]),
        [SchemaName] = CASE WHEN @SchemaName_Clear = 1 THEN NULL ELSE ISNULL(@SchemaName, [SchemaName]) END,
        [MJVersionRange] = ISNULL(@MJVersionRange, [MJVersionRange]),
        [License] = CASE WHEN @License_Clear = 1 THEN NULL ELSE ISNULL(@License, [License]) END,
        [Icon] = CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, [Icon]) END,
        [Color] = CASE WHEN @Color_Clear = 1 THEN NULL ELSE ISNULL(@Color, [Color]) END,
        [ManifestJSON] = ISNULL(@ManifestJSON, [ManifestJSON]),
        [ConfigurationSchemaJSON] = CASE WHEN @ConfigurationSchemaJSON_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationSchemaJSON, [ConfigurationSchemaJSON]) END,
        [InstalledByUserID] = ISNULL(@InstalledByUserID, [InstalledByUserID]),
        [Status] = ISNULL(@Status, [Status]),
        [Subpath] = CASE WHEN @Subpath_Clear = 1 THEN NULL ELSE ISNULL(@Subpath, [Subpath]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOpenApps] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT * FROM [${flyway:defaultSchema}].[vwOpenApps] WHERE [ID] = @ID
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOpenApp] TO [cdp_Developer], [cdp_Integration];
GO
