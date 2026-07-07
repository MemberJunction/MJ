-- Migration: OpenApp.LastCompletedStep + LastCompletedStepTargetVersion
-- Description: Adds a checkpoint so a crashed/failed `mj app install|upgrade|remove` can be
--              resumed on retry instead of restarting from scratch. The orchestrator persists
--              the name of the last step that completed successfully while an app's Status is
--              Installing/Upgrading/Removing, and reads it back on re-entry to skip steps that
--              already succeeded.
--
--              LastCompletedStepTargetVersion pairs with the checkpoint for Upgrade specifically:
--              Version stays at the PRE-upgrade value until the very end of a successful upgrade,
--              so the checkpoint alone can't tell "resume THIS upgrade" apart from "a fresh
--              upgrade request arrived to a DIFFERENT target version while one was mid-flight."
--              Without it, interrupting an upgrade to 1.2 after PackagesInstalled and then running
--              `mj app upgrade` targeting 1.3 would skip 1.3's migrations/packages (the checkpoint
--              says PackagesInstalled) yet still stamp Version=1.3 — the app ends up claiming 1.3
--              while running 1.2's packages. The orchestrator only trusts a checkpoint when this
--              column matches the version it is about to upgrade to.

ALTER TABLE [${flyway:defaultSchema}].[OpenApp] ADD
    [LastCompletedStep] NVARCHAR(50) NULL,
    [LastCompletedStepTargetVersion] NVARCHAR(20) NULL;
GO

-- Value-list CHECK per repo convention: the CHECK is the source of truth CodeGen derives the
-- generated TS union from, so InstallStep|UpgradeStep|RemoveStep in open-app-types.ts can't
-- silently drift from what the column actually accepts. Union of every step name across all
-- three operations (RecordCreated/PackagesInstalled/ConfigUpdated/AngularExcludesUpdated/
-- Finalized/HooksRun for Install; MigrationsApplied/RecordUpdated/DependenciesReplaced added for
-- Upgrade; DbCleanupDone/FilesRemoved for Remove) plus NULL for "no operation in flight."
ALTER TABLE [${flyway:defaultSchema}].[OpenApp] ADD CONSTRAINT [CK_OpenApp_LastCompletedStep]
    CHECK ([LastCompletedStep] IS NULL OR [LastCompletedStep] IN (
        N'RecordCreated', N'PackagesInstalled', N'ConfigUpdated', N'AngularExcludesUpdated', N'Finalized', N'HooksRun',
        N'MigrationsApplied', N'RecordUpdated', N'DependenciesReplaced',
        N'DbCleanupDone', N'FilesRemoved'
    ));

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The last install/upgrade/remove step that completed successfully for this app while Status is Installing, Upgrading, or Removing. Used to resume a crashed or failed operation from the correct point instead of restarting it entirely. Cleared (NULL) once the operation reaches a terminal state (Active/Disabled/Removed/Error).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenApp',
    @level2type = N'COLUMN', @level2name = N'LastCompletedStep';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The version this app was being upgraded TO when LastCompletedStep was last written, for Upgrade only. A resume only trusts LastCompletedStep when this matches the version currently being requested — otherwise a checkpoint from an interrupted upgrade to a different version could wrongly skip steps for the new target. Cleared alongside LastCompletedStep.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenApp',
    @level2type = N'COLUMN', @level2name = N'LastCompletedStepTargetVersion';

-- ============================================================================
-- CodeGen output — regenerated for real via 'mj codegen' against a fresh SQL Server DB
-- migrated through this file (single clean run, appended verbatim). Scoped entirely to
-- MJ: Open Apps: EntityField creation for the two new columns, EntityFieldValue rows for
-- the LastCompletedStep value list, the FK index, vwOpenApps, and the three CRUD procedures.
-- ============================================================================

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a4f18f7c-f327-4600-92c6-c76a140f52a7' OR (EntityID = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND Name = 'LastCompletedStep')) BEGIN
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
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a4f18f7c-f327-4600-92c6-c76a140f52a7',
            'AC4A2799-454B-4395-AA56-A42241F32C12', -- Entity: MJ: Open Apps
            100046,
            'LastCompletedStep',
            'Last Completed Step',
            'The last install/upgrade/remove step that completed successfully for this app while Status is Installing, Upgrading, or Removing. Used to resume a crashed or failed operation from the correct point instead of restarting it entirely. Cleared (NULL) once the operation reaches a terminal state (Active/Disabled/Removed/Error).',
            'nvarchar',
            100,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '07b14444-1b90-46d8-9d42-7c2d45cafb2f' OR (EntityID = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND Name = 'LastCompletedStepTargetVersion')) BEGIN
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
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '07b14444-1b90-46d8-9d42-7c2d45cafb2f',
            'AC4A2799-454B-4395-AA56-A42241F32C12', -- Entity: MJ: Open Apps
            100047,
            'LastCompletedStepTargetVersion',
            'Last Completed Step Target Version',
            'The version this app was being upgraded TO when LastCompletedStep was last written, for Upgrade only. A resume only trusts LastCompletedStep when this matches the version currently being requested — otherwise a checkpoint from an interrupted upgrade to a different version could wrongly skip steps for the new target. Cleared alongside LastCompletedStep.',
            'nvarchar',
            40,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert entity field value with ID 7309297b-ed66-40e4-ba99-e844160a9b30 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7309297b-ed66-40e4-ba99-e844160a9b30', 'A4F18F7C-F327-4600-92C6-C76A140F52A7', 1, 'AngularExcludesUpdated', 'AngularExcludesUpdated', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e790af24-d6a3-4a3d-8224-e27f0b00244f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e790af24-d6a3-4a3d-8224-e27f0b00244f', 'A4F18F7C-F327-4600-92C6-C76A140F52A7', 2, 'ConfigUpdated', 'ConfigUpdated', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 74089b17-3716-45db-8500-deb6cb24bfd3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('74089b17-3716-45db-8500-deb6cb24bfd3', 'A4F18F7C-F327-4600-92C6-C76A140F52A7', 3, 'DbCleanupDone', 'DbCleanupDone', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 79aaa7d7-aad3-42fa-a091-9d1ea60c1650 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('79aaa7d7-aad3-42fa-a091-9d1ea60c1650', 'A4F18F7C-F327-4600-92C6-C76A140F52A7', 4, 'DependenciesReplaced', 'DependenciesReplaced', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 96e57f15-6d9d-4243-a2c6-0aae3a533006 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('96e57f15-6d9d-4243-a2c6-0aae3a533006', 'A4F18F7C-F327-4600-92C6-C76A140F52A7', 5, 'FilesRemoved', 'FilesRemoved', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID eaff6b46-e11a-4d9e-9655-342c5b3b639a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('eaff6b46-e11a-4d9e-9655-342c5b3b639a', 'A4F18F7C-F327-4600-92C6-C76A140F52A7', 6, 'Finalized', 'Finalized', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f4a9ac61-f2c3-4d95-8531-18e37e1ca695 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f4a9ac61-f2c3-4d95-8531-18e37e1ca695', 'A4F18F7C-F327-4600-92C6-C76A140F52A7', 7, 'HooksRun', 'HooksRun', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7a4e5d90-bc20-4938-8ae7-607598d5b967 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7a4e5d90-bc20-4938-8ae7-607598d5b967', 'A4F18F7C-F327-4600-92C6-C76A140F52A7', 8, 'MigrationsApplied', 'MigrationsApplied', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c761c315-e268-4335-bab1-48d91d54c034 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c761c315-e268-4335-bab1-48d91d54c034', 'A4F18F7C-F327-4600-92C6-C76A140F52A7', 9, 'PackagesInstalled', 'PackagesInstalled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a09f50dd-9aaf-41d3-aa67-d62a2a8d18e0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a09f50dd-9aaf-41d3-aa67-d62a2a8d18e0', 'A4F18F7C-F327-4600-92C6-C76A140F52A7', 10, 'RecordCreated', 'RecordCreated', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b7aa474b-390e-4e3a-b309-f6ce4017d79f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b7aa474b-390e-4e3a-b309-f6ce4017d79f', 'A4F18F7C-F327-4600-92C6-C76A140F52A7', 11, 'RecordUpdated', 'RecordUpdated', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID A4F18F7C-F327-4600-92C6-C76A140F52A7 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='A4F18F7C-F327-4600-92C6-C76A140F52A7';

/* Index for Foreign Keys for OpenApp */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key InstalledByUserID in table OpenApp
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OpenApp_InstalledByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OpenApp]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OpenApp_InstalledByUserID ON [${flyway:defaultSchema}].[OpenApp] ([InstalledByUserID]);

/* Base View SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: vwOpenApps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Open Apps
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OpenApp
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOpenApps]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOpenApps];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOpenApps]
AS
SELECT
    o.*,
    MJUser_InstalledByUserID.[Name] AS [InstalledByUser]
FROM
    [${flyway:defaultSchema}].[OpenApp] AS o
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_InstalledByUserID
  ON
    [o].[InstalledByUserID] = MJUser_InstalledByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwOpenApps] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: Permissions for vwOpenApps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwOpenApps] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: spCreateOpenApp
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OpenApp
------------------------------------------------------------
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
    @Subpath nvarchar(500) = NULL,
    @LastCompletedStep_Clear bit = 0,
    @LastCompletedStep nvarchar(50) = NULL,
    @LastCompletedStepTargetVersion_Clear bit = 0,
    @LastCompletedStepTargetVersion nvarchar(20) = NULL
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
                [Subpath],
                [LastCompletedStep],
                [LastCompletedStepTargetVersion]
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
                CASE WHEN @Subpath_Clear = 1 THEN NULL ELSE ISNULL(@Subpath, NULL) END,
                CASE WHEN @LastCompletedStep_Clear = 1 THEN NULL ELSE ISNULL(@LastCompletedStep, NULL) END,
                CASE WHEN @LastCompletedStepTargetVersion_Clear = 1 THEN NULL ELSE ISNULL(@LastCompletedStepTargetVersion, NULL) END
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
                [Subpath],
                [LastCompletedStep],
                [LastCompletedStepTargetVersion]
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
                CASE WHEN @Subpath_Clear = 1 THEN NULL ELSE ISNULL(@Subpath, NULL) END,
                CASE WHEN @LastCompletedStep_Clear = 1 THEN NULL ELSE ISNULL(@LastCompletedStep, NULL) END,
                CASE WHEN @LastCompletedStepTargetVersion_Clear = 1 THEN NULL ELSE ISNULL(@LastCompletedStepTargetVersion, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOpenApps] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOpenApp] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Open Apps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOpenApp] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: spUpdateOpenApp
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OpenApp
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOpenApp]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOpenApp];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOpenApp]
    @ID uniqueidentifier,
    @Name nvarchar(64) = NULL,
    @DisplayName nvarchar(200) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Version nvarchar(50) = NULL,
    @Publisher nvarchar(200) = NULL,
    @PublisherEmail_Clear bit = 0,
    @PublisherEmail nvarchar(255) = NULL,
    @PublisherURL_Clear bit = 0,
    @PublisherURL nvarchar(500) = NULL,
    @RepositoryURL nvarchar(500) = NULL,
    @SchemaName_Clear bit = 0,
    @SchemaName nvarchar(128) = NULL,
    @MJVersionRange nvarchar(100) = NULL,
    @License_Clear bit = 0,
    @License nvarchar(50) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(100) = NULL,
    @Color_Clear bit = 0,
    @Color nvarchar(20) = NULL,
    @ManifestJSON nvarchar(MAX) = NULL,
    @ConfigurationSchemaJSON_Clear bit = 0,
    @ConfigurationSchemaJSON nvarchar(MAX) = NULL,
    @InstalledByUserID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @Subpath_Clear bit = 0,
    @Subpath nvarchar(500) = NULL,
    @LastCompletedStep_Clear bit = 0,
    @LastCompletedStep nvarchar(50) = NULL,
    @LastCompletedStepTargetVersion_Clear bit = 0,
    @LastCompletedStepTargetVersion nvarchar(20) = NULL
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
        [Subpath] = CASE WHEN @Subpath_Clear = 1 THEN NULL ELSE ISNULL(@Subpath, [Subpath]) END,
        [LastCompletedStep] = CASE WHEN @LastCompletedStep_Clear = 1 THEN NULL ELSE ISNULL(@LastCompletedStep, [LastCompletedStep]) END,
        [LastCompletedStepTargetVersion] = CASE WHEN @LastCompletedStepTargetVersion_Clear = 1 THEN NULL ELSE ISNULL(@LastCompletedStepTargetVersion, [LastCompletedStepTargetVersion]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOpenApps] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOpenApps]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOpenApp] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OpenApp table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOpenApp]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOpenApp];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOpenApp
ON [${flyway:defaultSchema}].[OpenApp]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OpenApp]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OpenApp] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Open Apps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOpenApp] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: spDeleteOpenApp
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OpenApp
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOpenApp]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOpenApp];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOpenApp]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OpenApp]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOpenApp] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Open Apps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOpenApp] TO [cdp_Developer], [cdp_Integration];

