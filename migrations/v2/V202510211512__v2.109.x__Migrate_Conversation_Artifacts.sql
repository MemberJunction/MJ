-- ============================================================================
-- Conversation Artifact Data Migration
-- Part 2 of Conversation Artifact Migration
-- ============================================================================
-- Migrates legacy ConversationArtifact/ConversationArtifactVersion system
-- to new Artifact/ArtifactVersion architecture with Collections support.
--
-- Prerequisites:
-- 1. V202510211511 (Create ArtifactPermission table) must have run
-- 2. CodeGen must have been run after V202510211511
--
-- This migration:
-- - Migrates ConversationArtifact → Artifact (preserves UUIDs)
-- - Migrates ConversationArtifactVersion → ArtifactVersion (preserves UUIDs)
-- - Creates ConversationDetailArtifact M:M links
-- - Migrates ConversationArtifactPermission → ArtifactPermission
-- - Marks deprecated entities and fields in metadata
-- ============================================================================

SET NOCOUNT ON;
SET XACT_ABORT ON; -- Automatic rollback on error

BEGIN TRANSACTION;

DECLARE @DefaultEnvironmentID UNIQUEIDENTIFIER;
DECLARE @MigrationTimestamp DATETIMEOFFSET = GETUTCDATE();
DECLARE @MigratedCount INT = 0;
DECLARE @ErrorMessage NVARCHAR(4000);

BEGIN TRY

-- ============================================================================
-- STEP 1: Pre-Migration Checks
-- ============================================================================
PRINT '';
PRINT '=== Pre-Migration Checks ===';

-- Check that ArtifactPermission table exists
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ArtifactPermission' AND schema_id = SCHEMA_ID('${flyway:defaultSchema}'))
BEGIN
    RAISERROR('ArtifactPermission table does not exist. Run V202510211511 migration first.', 16, 1);
END

-- Check that old tables exist
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ConversationArtifact' AND schema_id = SCHEMA_ID('${flyway:defaultSchema}'))
BEGIN
    PRINT 'WARNING: ConversationArtifact table does not exist. No data to migrate.';
    COMMIT TRANSACTION;
    RETURN;
END

PRINT '✓ Pre-migration checks passed';

-- ============================================================================
-- STEP 2: Get Default Environment ID
-- ============================================================================
PRINT '';
PRINT '=== Getting Default Environment ===';

SELECT TOP 1 @DefaultEnvironmentID = ID
FROM [${flyway:defaultSchema}].[Environment]
ORDER BY
    CASE WHEN [Name] = 'Default' THEN 0 ELSE 1 END,
    __mj_CreatedAt ASC;

IF @DefaultEnvironmentID IS NULL
BEGIN
    RAISERROR('No environment found in database. Cannot proceed with migration.', 16, 1);
END

PRINT 'Using Environment ID: ' + CAST(@DefaultEnvironmentID AS NVARCHAR(50));

-- ============================================================================
-- STEP 3: Create Temporary Tracking Table
-- ============================================================================
PRINT '';
PRINT '=== Creating Tracking Table ===';

IF OBJECT_ID('tempdb..#MigratedArtifacts') IS NOT NULL DROP TABLE #MigratedArtifacts;

CREATE TABLE #MigratedArtifacts (
    ArtifactID UNIQUEIDENTIFIER NOT NULL,
    PRIMARY KEY (ArtifactID)
);

PRINT '✓ Tracking table created';

-- ============================================================================
-- STEP 4: Migrate ConversationArtifact → Artifact
-- ============================================================================
PRINT '';
PRINT '=== Migrating ConversationArtifact → Artifact ===';
PRINT 'NOTE: Using ConversationArtifact name directly';

INSERT INTO [${flyway:defaultSchema}].[Artifact] (
    [ID],
    [EnvironmentID],
    [Name],
    [Description],
    [TypeID],
    [Comments],
    [UserID],
    [__mj_CreatedAt],
    [__mj_UpdatedAt]
)
OUTPUT inserted.[ID] INTO #MigratedArtifacts (ArtifactID)
SELECT
    ca.[ID], -- Preserve original UUID
    @DefaultEnvironmentID AS [EnvironmentID],
    ca.[Name], -- Use ConversationArtifact's name directly
    ca.[Description],
    'E8BA10A3-019F-4C51-A8AA-397AB124F212' AS [TypeID], -- hard code to Component type
    ca.[Comments],
    -- Get UserID from Conversation (ConversationArtifact doesn't have it)
    c.[UserID],
    ca.[__mj_CreatedAt],
    ca.[__mj_UpdatedAt]
FROM [${flyway:defaultSchema}].[ConversationArtifact] ca
INNER JOIN [${flyway:defaultSchema}].[Conversation] c ON c.[ID] = ca.[ConversationID]
WHERE NOT EXISTS (
    -- Skip if already migrated (idempotency check)
    SELECT 1 FROM [${flyway:defaultSchema}].[Artifact] existing
    WHERE existing.[ID] = ca.[ID]
);

SET @MigratedCount = @@ROWCOUNT;
PRINT '✓ Migrated ' + CAST(@MigratedCount AS NVARCHAR(10)) + ' artifacts';

-- ============================================================================
-- STEP 5: Migrate ConversationArtifactVersion → ArtifactVersion
-- ============================================================================
PRINT '';
PRINT '=== Migrating ConversationArtifactVersion → ArtifactVersion ===';
PRINT 'NOTE: Extracting componentOptions[0].option from Configuration JSON';
PRINT '      Skip wrapped ComponentSpec inside response envelope - unwrapping it';

INSERT INTO [${flyway:defaultSchema}].[ArtifactVersion] (
    [ID],
    [ArtifactID],
    [VersionNumber],
    [Content],
    [Configuration],
    [Comments],
    [UserID],
    [ContentHash],
    [Name],
    [Description],
    [__mj_CreatedAt],
    [__mj_UpdatedAt]
)
SELECT
    cav.[ID], -- Preserve original UUID
    cav.[ConversationArtifactID] AS [ArtifactID], -- UUID preserved, FK works
    cav.[Version] AS [VersionNumber],
    -- IMPORTANT: Extract componentOptions[0].option from Configuration JSON
    -- Skip components wrapped the actual ComponentSpec inside this structure
    CASE
        WHEN cav.[Configuration] IS NOT NULL AND ISJSON(cav.[Configuration]) = 1
        THEN
            -- Try to extract componentOptions[0].option (the actual ComponentSpec)
            COALESCE(
                JSON_QUERY(cav.[Configuration], '$.componentOptions[0].option'),
                cav.[Configuration]  -- Fallback to full Configuration if extraction fails
            )
        ELSE
            -- No Configuration, use Content as fallback
            cav.[Content]
    END AS [Content],
    NULL AS [Configuration], -- Not used in new system
    cav.[Comments],
    -- Get UserID from Conversation (version doesn't have it)
    c.[UserID],
    -- Generate SHA-256 hash based on the extracted ComponentSpec
    CASE
        WHEN cav.[Configuration] IS NOT NULL AND ISJSON(cav.[Configuration]) = 1
        THEN CONVERT(NVARCHAR(500), HASHBYTES('SHA2_256', CAST(
            COALESCE(
                JSON_QUERY(cav.[Configuration], '$.componentOptions[0].option'),
                cav.[Configuration]
            ) AS NVARCHAR(MAX))), 2)
        WHEN cav.[Content] IS NOT NULL
        THEN CONVERT(NVARCHAR(500), HASHBYTES('SHA2_256', CAST(cav.[Content] AS NVARCHAR(MAX))), 2)
        ELSE NULL
    END AS [ContentHash],
    -- Copy Name/Description from parent artifact
    ca.[Name],
    ca.[Description],
    cav.[__mj_CreatedAt],
    cav.[__mj_UpdatedAt]
FROM [${flyway:defaultSchema}].[ConversationArtifactVersion] cav
INNER JOIN [${flyway:defaultSchema}].[ConversationArtifact] ca ON ca.[ID] = cav.[ConversationArtifactID]
INNER JOIN [${flyway:defaultSchema}].[Conversation] c ON c.[ID] = ca.[ConversationID]
WHERE NOT EXISTS (
    -- Skip if already migrated (idempotency check)
    SELECT 1 FROM [${flyway:defaultSchema}].[ArtifactVersion] existing
    WHERE existing.[ID] = cav.[ID]
);

SET @MigratedCount = @@ROWCOUNT;
PRINT '✓ Migrated ' + CAST(@MigratedCount AS NVARCHAR(10)) + ' artifact versions';

-- ============================================================================
-- STEP 6: Create ConversationDetailArtifact M:M Links
-- ============================================================================
PRINT '';
PRINT '=== Creating ConversationDetailArtifact Links ===';

INSERT INTO [${flyway:defaultSchema}].[ConversationDetailArtifact] (
    [ConversationDetailID],
    [ArtifactVersionID],
    [Direction],
    [__mj_CreatedAt],
    [__mj_UpdatedAt]
)
SELECT DISTINCT
    cd.[ID] AS [ConversationDetailID],
    cd.[ArtifactVersionID], -- UUID preserved, can use directly
    'Output' AS [Direction], -- All legacy artifacts are agent outputs
    cd.[__mj_CreatedAt], -- Preserve original timestamp
    cd.[__mj_UpdatedAt]
FROM [${flyway:defaultSchema}].[ConversationDetail] cd
WHERE cd.[ArtifactVersionID] IS NOT NULL
  AND NOT EXISTS (
      -- Skip if link already exists (idempotency check)
      SELECT 1 FROM [${flyway:defaultSchema}].[ConversationDetailArtifact] existing
      WHERE existing.[ConversationDetailID] = cd.[ID]
        AND existing.[ArtifactVersionID] = cd.[ArtifactVersionID]
  );

SET @MigratedCount = @@ROWCOUNT;
PRINT '✓ Created ' + CAST(@MigratedCount AS NVARCHAR(10)) + ' conversation-artifact links';

-- ============================================================================
-- STEP 6b: Update ConversationDetail.Message for artifact references
-- ============================================================================
PRINT '';
PRINT '=== Updating ConversationDetail.Message ===';
PRINT 'NOTE: Replacing JSON content with artifact names for cleaner chat history';

-- Update ConversationDetail.Message to show artifact name instead of full JSON
UPDATE cd
SET cd.[Message] = 'Generated component: ' + COALESCE(a.[Name], 'Unnamed Component')
FROM [${flyway:defaultSchema}].[ConversationDetail] cd
INNER JOIN [${flyway:defaultSchema}].[ConversationArtifactVersion] cav ON cav.[ID] = cd.[ArtifactVersionID]
INNER JOIN [${flyway:defaultSchema}].[ConversationArtifact] ca ON ca.[ID] = cav.[ConversationArtifactID]
INNER JOIN [${flyway:defaultSchema}].[Artifact] a ON a.[ID] = ca.[ID]
WHERE cd.[ArtifactVersionID] IS NOT NULL
  AND cd.[Message] IS NOT NULL
  AND (
      -- Only update if Message contains JSON (starts with { or [)
      cd.[Message] LIKE '{%' OR cd.[Message] LIKE '[%'
  );

SET @MigratedCount = @@ROWCOUNT;
PRINT '✓ Updated ' + CAST(@MigratedCount AS NVARCHAR(10)) + ' conversation detail messages';

-- ============================================================================
-- STEP 7: Migrate ConversationArtifactPermission → ArtifactPermission
-- ============================================================================
PRINT '';
PRINT '=== Migrating Permissions ===';

INSERT INTO [${flyway:defaultSchema}].[ArtifactPermission] (
    [ArtifactID],
    [UserID],
    [CanRead],
    [CanEdit],
    [CanDelete],
    [CanShare],
    [SharedByUserID],
    [__mj_CreatedAt],
    [__mj_UpdatedAt]
)
SELECT
    cap.[ConversationArtifactID] AS [ArtifactID], -- UUID preserved
    cap.[UserID],
    1 AS [CanRead], -- All permission levels include read
    CASE WHEN cap.[AccessLevel] IN ('Edit', 'Owner') THEN 1 ELSE 0 END AS [CanEdit],
    CASE WHEN cap.[AccessLevel] = 'Owner' THEN 1 ELSE 0 END AS [CanDelete],
    CASE WHEN cap.[AccessLevel] = 'Owner' THEN 1 ELSE 0 END AS [CanShare],
    NULL AS [SharedByUserID], -- Legacy system didn't track this
    cap.[__mj_CreatedAt],
    cap.[__mj_UpdatedAt]
FROM [${flyway:defaultSchema}].[ConversationArtifactPermission] cap
WHERE NOT EXISTS (
    -- Skip if permission already exists (idempotency check)
    SELECT 1 FROM [${flyway:defaultSchema}].[ArtifactPermission] existing
    WHERE existing.[ArtifactID] = cap.[ConversationArtifactID]
      AND existing.[UserID] = cap.[UserID]
);

SET @MigratedCount = @@ROWCOUNT;
PRINT '✓ Migrated ' + CAST(@MigratedCount AS NVARCHAR(10)) + ' permissions';

-- ============================================================================
-- STEP 8: Mark Deprecated Fields in Metadata
-- ============================================================================
PRINT '';
PRINT '=== Marking Deprecated Fields ===';

UPDATE [${flyway:defaultSchema}].[EntityField]
SET
    [Status] = 'Deprecated',
    [Description] = CASE
        WHEN [Description] LIKE '%[DEPRECATED%' THEN [Description]
        ELSE COALESCE([Description], '') +
            ' [DEPRECATED: Migrated to ConversationDetailArtifact M:M table. Use ConversationDetailArtifact junction instead.]'
    END
WHERE [EntityID] IN (
    SELECT [ID] FROM [${flyway:defaultSchema}].[Entity] WHERE [Name] = 'Conversation Details'
)
AND [Name] IN ('ArtifactID', 'ArtifactVersionID')
AND [Status] <> 'Deprecated'; -- Only update if not already deprecated

SET @MigratedCount = @@ROWCOUNT;
PRINT '✓ Marked ' + CAST(@MigratedCount AS NVARCHAR(10)) + ' fields as deprecated';

-- ============================================================================
-- STEP 9: Mark Deprecated Entities in Metadata
-- ============================================================================
PRINT '';
PRINT '=== Marking Deprecated Entities ===';

UPDATE [${flyway:defaultSchema}].[Entity]
SET
    [Status] = 'Deprecated',
    [Description] = CASE
        WHEN [Description] LIKE '%[DEPRECATED%' THEN [Description]
        ELSE COALESCE([Description], '') +
            ' [DEPRECATED: Migrated to Artifact/ArtifactVersion tables. Data preserved in migration.]'
    END
WHERE [Name] IN (
    'MJ: Conversation Artifacts',
    'MJ: Conversation Artifact Versions',
    'MJ: Conversation Artifact Permissions'
)
AND [Status] <> 'Deprecated'; -- Only update if not already deprecated

SET @MigratedCount = @@ROWCOUNT;
PRINT '✓ Marked ' + CAST(@MigratedCount AS NVARCHAR(10)) + ' entities as deprecated';

-- ============================================================================
-- STEP 10: Validation
-- ============================================================================
PRINT '';
PRINT '=== Migration Validation ===';

DECLARE @OldArtifactCount INT, @NewArtifactCount INT;
DECLARE @OldVersionCount INT, @NewVersionCount INT;
DECLARE @OldPermissionCount INT, @NewPermissionCount INT;
DECLARE @ConversationDetailLinkCount INT;

SELECT @OldArtifactCount = COUNT(*) FROM [${flyway:defaultSchema}].[ConversationArtifact];
SELECT @NewArtifactCount = COUNT(*) FROM [${flyway:defaultSchema}].[Artifact]
    WHERE [ID] IN (SELECT [ArtifactID] FROM #MigratedArtifacts);
PRINT 'Artifacts: ' + CAST(@OldArtifactCount AS NVARCHAR(10)) + ' old → ' +
      CAST(@NewArtifactCount AS NVARCHAR(10)) + ' new (this run)';

SELECT @OldVersionCount = COUNT(*) FROM [${flyway:defaultSchema}].[ConversationArtifactVersion];
SELECT @NewVersionCount = COUNT(*) FROM [${flyway:defaultSchema}].[ArtifactVersion]
    WHERE [ArtifactID] IN (SELECT [ArtifactID] FROM #MigratedArtifacts);
PRINT 'Versions: ' + CAST(@OldVersionCount AS NVARCHAR(10)) + ' old → ' +
      CAST(@NewVersionCount AS NVARCHAR(10)) + ' new (this run)';

SELECT @OldPermissionCount = COUNT(*) FROM [${flyway:defaultSchema}].[ConversationArtifactPermission];
SELECT @NewPermissionCount = COUNT(*) FROM [${flyway:defaultSchema}].[ArtifactPermission]
    WHERE [ArtifactID] IN (SELECT [ArtifactID] FROM #MigratedArtifacts);
PRINT 'Permissions: ' + CAST(@OldPermissionCount AS NVARCHAR(10)) + ' old → ' +
      CAST(@NewPermissionCount AS NVARCHAR(10)) + ' new (this run)';

SELECT @ConversationDetailLinkCount = COUNT(*)
FROM [${flyway:defaultSchema}].[ConversationDetailArtifact] cda
WHERE cda.[ArtifactVersionID] IN (
    SELECT av.[ID]
    FROM [${flyway:defaultSchema}].[ArtifactVersion] av
    WHERE av.[ArtifactID] IN (SELECT [ArtifactID] FROM #MigratedArtifacts)
);
PRINT 'Conversation links: ' + CAST(@ConversationDetailLinkCount AS NVARCHAR(10)) + ' (total for migrated artifacts)';

-- Validation: Check total counts match
DECLARE @TotalOldArtifacts INT, @TotalNewArtifacts INT;
SELECT @TotalOldArtifacts = COUNT(*) FROM [${flyway:defaultSchema}].[ConversationArtifact];
SELECT @TotalNewArtifacts = COUNT(*) FROM [${flyway:defaultSchema}].[Artifact]
    WHERE [ID] IN (SELECT [ID] FROM [${flyway:defaultSchema}].[ConversationArtifact]);

IF @TotalOldArtifacts <> @TotalNewArtifacts
BEGIN
    SET @ErrorMessage = 'Artifact count mismatch! Expected ' +
        CAST(@TotalOldArtifacts AS NVARCHAR(10)) + ' but got ' +
        CAST(@TotalNewArtifacts AS NVARCHAR(10));
    RAISERROR(@ErrorMessage, 16, 1);
END

DECLARE @TotalOldVersions INT, @TotalNewVersions INT;
SELECT @TotalOldVersions = COUNT(*) FROM [${flyway:defaultSchema}].[ConversationArtifactVersion];
SELECT @TotalNewVersions = COUNT(*) FROM [${flyway:defaultSchema}].[ArtifactVersion]
    WHERE [ID] IN (SELECT [ID] FROM [${flyway:defaultSchema}].[ConversationArtifactVersion]);

IF @TotalOldVersions <> @TotalNewVersions
BEGIN
    SET @ErrorMessage = 'Version count mismatch! Expected ' +
        CAST(@TotalOldVersions AS NVARCHAR(10)) + ' but got ' +
        CAST(@TotalNewVersions AS NVARCHAR(10));
    RAISERROR(@ErrorMessage, 16, 1);
END

PRINT '';
PRINT '✓ All validation checks passed';
PRINT 'Total artifacts: ' + CAST(@TotalNewArtifacts AS NVARCHAR(10));
PRINT 'Total versions: ' + CAST(@TotalNewVersions AS NVARCHAR(10));

-- ============================================================================
-- STEP 11: Cleanup
-- ============================================================================
DROP TABLE #MigratedArtifacts;

-- ============================================================================
-- COMMIT TRANSACTION
-- ============================================================================
COMMIT TRANSACTION;

PRINT '';
PRINT '=== ✓ Migration Completed Successfully ===';
PRINT 'Timestamp: ' + CONVERT(NVARCHAR(30), @MigrationTimestamp, 120);
PRINT '';
PRINT 'Note: Old ConversationArtifact tables are preserved (not deleted)';
PRINT 'They are marked as deprecated and can be removed in a future release.';

END TRY
BEGIN CATCH
    -- Rollback on error
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    -- Report error
    DECLARE @ErrorNumber INT = ERROR_NUMBER();
    DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
    DECLARE @ErrorState INT = ERROR_STATE();
    DECLARE @ErrorLine INT = ERROR_LINE();
    SET @ErrorMessage = ERROR_MESSAGE();

    PRINT '';
    PRINT '=== ❌ Migration Failed ===';
    PRINT 'Error Number: ' + CAST(@ErrorNumber AS NVARCHAR(10));
    PRINT 'Error Line: ' + CAST(@ErrorLine AS NVARCHAR(10));
    PRINT 'Error Message: ' + @ErrorMessage;
    PRINT '';
    PRINT 'Transaction has been rolled back. No changes were made.';

    -- Re-throw error
    RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
END CATCH
