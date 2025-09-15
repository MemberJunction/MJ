-- ============================================================================
-- MemberJunction v2 to v3 Conversations Data Migration Script
-- ============================================================================
-- Purpose: Migrate existing ConversationArtifact and ConversationArtifactVersion
--          data to the new v3 schema structure with decoupled artifacts
-- 
-- Prerequisites:
--   1. v3 schema must be deployed (schema.sql)
--   2. Default Environment must exist
--   3. This script should run AFTER schema changes but BEFORE deprecating old entities
-- ============================================================================

-- Set configuration
SET NOCOUNT ON;
SET XACT_ABORT ON;

-- Variables for tracking migration
DECLARE @DefaultEnvironmentID UNIQUEIDENTIFIER = '00000000-0000-0000-0000-000000000001';
DECLARE @MigrationStartTime DATETIME2 = GETUTCDATE();
DECLARE @ArtifactCount INT = 0;
DECLARE @VersionCount INT = 0;
DECLARE @PermissionCount INT = 0;
DECLARE @ErrorMessage NVARCHAR(MAX);

BEGIN TRY
    BEGIN TRANSACTION;

    PRINT '========================================';
    PRINT 'Starting v2 to v3 Conversations Migration';
    PRINT 'Migration Start Time: ' + CONVERT(VARCHAR(30), @MigrationStartTime, 121);
    PRINT '========================================';

    -- ============================================================================
    -- STEP 1: Verify Prerequisites
    -- ============================================================================
    PRINT '';
    PRINT 'Step 1: Verifying prerequisites...';

    -- Check if default environment exists
    IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.Environment WHERE ID = @DefaultEnvironmentID)
    BEGIN
        RAISERROR('Default Environment not found. Please run schema.sql first.', 16, 1);
    END

    -- Check if source tables exist
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES 
                   WHERE TABLE_SCHEMA = '${flyway:defaultSchema}' 
                   AND TABLE_NAME = 'ConversationArtifact')
    BEGIN
        RAISERROR('ConversationArtifact table not found.', 16, 1);
    END

    -- Check if we have data to migrate
    SELECT @ArtifactCount = COUNT(*) FROM ${flyway:defaultSchema}.ConversationArtifact;
    
    IF @ArtifactCount = 0
    BEGIN
        PRINT 'No artifacts to migrate. Exiting.';
        COMMIT TRANSACTION;
        RETURN;
    END

    PRINT 'Found ' + CAST(@ArtifactCount AS VARCHAR(10)) + ' artifacts to migrate.';

    -- ============================================================================
    -- STEP 2: Consolidate Report ArtifactType to Component
    -- ============================================================================
    PRINT '';
    PRINT 'Step 2: Consolidating Report artifact type to Component...';

    -- Get the IDs for Report and Component artifact types
    DECLARE @ReportTypeID UNIQUEIDENTIFIER;
    DECLARE @ComponentTypeID UNIQUEIDENTIFIER;
    
    SELECT @ReportTypeID = ID FROM ${flyway:defaultSchema}.ArtifactType WHERE Name = 'Report';
    SELECT @ComponentTypeID = ID FROM ${flyway:defaultSchema}.ArtifactType WHERE Name = 'Component';
    
    IF @ReportTypeID IS NOT NULL AND @ComponentTypeID IS NOT NULL
    BEGIN
        -- Update all ConversationArtifacts that use Report type to use Component type
        UPDATE ${flyway:defaultSchema}.ConversationArtifact
        SET ArtifactTypeID = @ComponentTypeID
        WHERE ArtifactTypeID = @ReportTypeID;
        
        PRINT 'Updated ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' artifacts from Report to Component type.';
        
        -- Disable the Report artifact type
        UPDATE ${flyway:defaultSchema}.ArtifactType
        SET IsEnabled = 0
        WHERE ID = @ReportTypeID;
        
        PRINT 'Disabled Report artifact type.';
    END
    ELSE
    BEGIN
        IF @ReportTypeID IS NULL
            PRINT 'Report artifact type not found - skipping consolidation.';
        IF @ComponentTypeID IS NULL
            PRINT 'Component artifact type not found - skipping consolidation.';
    END

    -- ============================================================================
    -- STEP 3: Migrate Conversation Artifacts to new Artifact table
    -- ============================================================================
    PRINT '';
    PRINT 'Step 3: Migrating ConversationArtifacts to Artifact table...';

    -- Insert artifacts into new Artifact table
    -- Note: We preserve the original IDs to maintain relationships
    INSERT INTO ${flyway:defaultSchema}.Artifact (
        ID,
        EnvironmentID,
        Name,
        Description,
        TypeID,
        Content,
        Configuration,
        Comments,
        UserID,
        __mj_CreatedAt,
        __mj_UpdatedAt
    )
    SELECT 
        CA.ID,                              -- Preserve original ID
        @DefaultEnvironmentID,               -- Use default environment
        CA.Name,
        CA.Description,
        CA.ArtifactTypeID,                  -- TypeID maps to ArtifactTypeID
        -- Content is stored in the latest version, we'll update this in Step 4
        NULL AS Content,                    
        -- Configuration will be populated from latest version
        NULL AS Configuration,
        CA.Comments,
        -- UserID comes from the conversation's UserID (owner)
        C.UserID AS UserID,
        CA.__mj_CreatedAt,
        CA.__mj_UpdatedAt
    FROM ${flyway:defaultSchema}.ConversationArtifact CA
    INNER JOIN ${flyway:defaultSchema}.Conversation C ON CA.ConversationID = C.ID
    WHERE NOT EXISTS (
        -- Skip if already migrated (idempotent)
        SELECT 1 FROM ${flyway:defaultSchema}.Artifact A WHERE A.ID = CA.ID
    );

    PRINT 'Migrated ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' artifacts.';

    -- ============================================================================
    -- STEP 4: Create Artifact Links to Original Conversations
    -- ============================================================================
    PRINT '';
    PRINT 'Step 4: Creating ArtifactLink records...';

    -- Get the Entity ID for Conversations
    DECLARE @ConversationEntityID UNIQUEIDENTIFIER;
    SELECT @ConversationEntityID = ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Conversations';
    
    IF @ConversationEntityID IS NULL
    BEGIN
        RAISERROR('Conversations entity not found in Entity table.', 16, 1);
    END

    -- Link artifacts to their original conversations
    INSERT INTO ${flyway:defaultSchema}.ArtifactLink (
        ID,
        ArtifactID,
        LinkedEntityID,
        LinkedRecordID,
        LinkType,
        Sequence,
        __mj_CreatedAt,
        __mj_UpdatedAt
    )
    SELECT 
        NEWID(),
        CA.ID,
        @ConversationEntityID AS LinkedEntityID,
        CAST(CA.ConversationID AS NVARCHAR(500)) AS LinkedRecordID,
        'created' AS LinkType,              -- Original creation context
        ROW_NUMBER() OVER (PARTITION BY CA.ConversationID ORDER BY CA.__mj_CreatedAt) AS Sequence,
        CA.__mj_CreatedAt,
        CA.__mj_UpdatedAt
    FROM ${flyway:defaultSchema}.ConversationArtifact CA
    WHERE NOT EXISTS (
        -- Skip if already linked (idempotent)
        SELECT 1 FROM ${flyway:defaultSchema}.ArtifactLink AL 
        WHERE AL.ArtifactID = CA.ID 
        AND AL.LinkedEntityID = @ConversationEntityID
        AND AL.LinkedRecordID = CAST(CA.ConversationID AS NVARCHAR(500))
    );

    PRINT 'Created ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' artifact links.';

    -- ============================================================================
    -- STEP 5: Migrate Artifact Versions
    -- ============================================================================
    PRINT '';
    PRINT 'Step 5: Migrating ConversationArtifactVersions...';

    -- Migrate all versions to new ArtifactVersion table
    INSERT INTO ${flyway:defaultSchema}.ArtifactVersion (
        ID,
        ArtifactID,
        VersionNumber,
        Content,
        Configuration,
        Comments,
        UserID,
        __mj_CreatedAt,
        __mj_UpdatedAt
    )
    SELECT 
        CAV.ID,
        CAV.ConversationArtifactID AS ArtifactID,
        CAV.Version AS VersionNumber,
        CAV.Content,
        CAV.Configuration,
        CAV.Comments,
        -- Get UserID from parent artifact's conversation (user who created this version)
        C.UserID AS UserID,
        CAV.__mj_CreatedAt,
        CAV.__mj_UpdatedAt
    FROM ${flyway:defaultSchema}.ConversationArtifactVersion CAV
    INNER JOIN ${flyway:defaultSchema}.ConversationArtifact CA ON CAV.ConversationArtifactID = CA.ID
    INNER JOIN ${flyway:defaultSchema}.Conversation C ON CA.ConversationID = C.ID
    WHERE NOT EXISTS (
        -- Skip if already migrated (idempotent)
        SELECT 1 FROM ${flyway:defaultSchema}.ArtifactVersion AV 
        WHERE AV.ID = CAV.ID
    );

    SELECT @VersionCount = @@ROWCOUNT;
    PRINT 'Migrated ' + CAST(@VersionCount AS VARCHAR(10)) + ' artifact versions.';

    -- ============================================================================
    -- STEP 6: Update Artifact Content and Configuration from Latest Version
    -- ============================================================================
    PRINT '';
    PRINT 'Step 6: Updating Artifact content from latest version...';

    -- Update each artifact with content from its latest version
    WITH LatestVersions AS (
        SELECT 
            AV.ArtifactID,
            AV.Content,
            AV.Configuration,
            ROW_NUMBER() OVER (PARTITION BY AV.ArtifactID ORDER BY AV.VersionNumber DESC) AS rn
        FROM ${flyway:defaultSchema}.ArtifactVersion AV
    )
    UPDATE A
    SET 
        A.Content = LV.Content,
        A.Configuration = LV.Configuration
    FROM ${flyway:defaultSchema}.Artifact A
    INNER JOIN LatestVersions LV ON A.ID = LV.ArtifactID
    WHERE LV.rn = 1
    AND (A.Content IS NULL OR A.Configuration IS NULL);

    PRINT 'Updated ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' artifacts with latest content.';

    -- ============================================================================
    -- STEP 7: Migrate Permissions
    -- ============================================================================
    PRINT '';
    PRINT 'Step 7: Migrating artifact permissions...';

    -- Migrate ConversationArtifactPermission to new Permission table
    INSERT INTO ${flyway:defaultSchema}.Permission (
        ID,
        ResourceType,
        ResourceID,
        GranteeType,
        GranteeID,
        PermissionLevel,
        ExpiresAt,
        __mj_CreatedAt,
        __mj_UpdatedAt
    )
    SELECT 
        CAP.ID,
        'Artifact' AS ResourceType,
        CAP.ConversationArtifactID AS ResourceID,
        'User' AS GranteeType,
        CAP.UserID AS GranteeID,
        CASE 
            WHEN CAP.CanEdit = 1 THEN 'write'
            ELSE 'read'
        END AS PermissionLevel,
        NULL AS ExpiresAt,                  -- No expiration in v2
        CAP.__mj_CreatedAt,
        CAP.__mj_UpdatedAt
    FROM ${flyway:defaultSchema}.ConversationArtifactPermission CAP
    WHERE NOT EXISTS (
        -- Skip if already migrated (idempotent)
        SELECT 1 FROM ${flyway:defaultSchema}.Permission P 
        WHERE P.ID = CAP.ID
    );

    SELECT @PermissionCount = @@ROWCOUNT;
    PRINT 'Migrated ' + CAST(@PermissionCount AS VARCHAR(10)) + ' permissions.';

    -- Handle SharingScope-based permissions
    -- Create Permission records based on SharingScope values
    INSERT INTO ${flyway:defaultSchema}.Permission (
        ID,
        ResourceType,
        ResourceID,
        GranteeType,
        GranteeID,
        PermissionLevel,
        ExpiresAt,
        __mj_CreatedAt,
        __mj_UpdatedAt
    )
    SELECT 
        NEWID(),
        'Artifact' AS ResourceType,
        CA.ID AS ResourceID,
        CASE 
            WHEN CA.SharingScope = 'Everyone' THEN 'Everyone'
            WHEN CA.SharingScope = 'Public' THEN 'Public'
            ELSE NULL
        END AS GranteeType,
        NULL AS GranteeID,                  -- No specific grantee for Everyone/Public
        'read' AS PermissionLevel,
        NULL AS ExpiresAt,
        GETUTCDATE(),
        GETUTCDATE()
    FROM ${flyway:defaultSchema}.ConversationArtifact CA
    WHERE CA.SharingScope IN ('Everyone', 'Public')
    AND NOT EXISTS (
        -- Skip if permission already exists
        SELECT 1 FROM ${flyway:defaultSchema}.Permission P 
        WHERE P.ResourceType = 'Artifact'
        AND P.ResourceID = CA.ID
        AND P.GranteeType IN ('Everyone', 'Public')
    );

    PRINT 'Created ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' scope-based permissions.';

    -- ============================================================================
    -- STEP 8: Create Public Links for Public Artifacts
    -- ============================================================================
    PRINT '';
    PRINT 'Step 8: Creating public links for public artifacts...';

    -- Create PublicLink records for artifacts with Public sharing scope
    INSERT INTO ${flyway:defaultSchema}.PublicLink (
        ID,
        ResourceType,
        ResourceID,
        Token,
        PasswordHash,
        ExpiresAt,
        MaxViews,
        CurrentViews,
        IsActive,
        UserID,
        __mj_CreatedAt,
        __mj_UpdatedAt
    )
    SELECT 
        NEWID(),
        'Artifact' AS ResourceType,
        CA.ID AS ResourceID,
        -- Generate a unique token for each public artifact
        LOWER(REPLACE(CAST(NEWID() AS VARCHAR(36)), '-', '')) AS Token,
        NULL AS PasswordHash,                -- No password by default
        NULL AS ExpiresAt,                   -- No expiration by default
        NULL AS MaxViews,                    -- Unlimited views
        0 AS CurrentViews,
        1 AS IsActive,
        C.UserID AS UserID,                  -- User who created the public link
        CA.__mj_CreatedAt,
        CA.__mj_UpdatedAt
    FROM ${flyway:defaultSchema}.ConversationArtifact CA
    INNER JOIN ${flyway:defaultSchema}.Conversation C ON CA.ConversationID = C.ID
    WHERE CA.SharingScope = 'Public'
    AND NOT EXISTS (
        -- Skip if public link already exists
        SELECT 1 FROM ${flyway:defaultSchema}.PublicLink PL 
        WHERE PL.ResourceType = 'Artifact'
        AND PL.ResourceID = CA.ID
    );

    PRINT 'Created ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' public links.';

    -- ============================================================================
    -- STEP 9: Update Conversations with EnvironmentID
    -- ============================================================================
    PRINT '';
    PRINT 'Step 9: Updating Conversations with EnvironmentID...';

    -- Update all existing conversations to use the default environment
    UPDATE ${flyway:defaultSchema}.Conversation
    SET EnvironmentID = @DefaultEnvironmentID,
        LastActivityAt = __mj_UpdatedAt    -- Set initial LastActivityAt
    WHERE EnvironmentID IS NULL;

    PRINT 'Updated ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' conversations.';

    -- ============================================================================
    -- STEP 10: Update Dashboards with EnvironmentID (if they exist)
    -- ============================================================================
    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
               WHERE TABLE_SCHEMA = '${flyway:defaultSchema}' 
               AND TABLE_NAME = 'Dashboard'
               AND COLUMN_NAME = 'EnvironmentID')
    BEGIN
        PRINT '';
        PRINT 'Step 10: Updating Dashboards with EnvironmentID...';

        UPDATE ${flyway:defaultSchema}.Dashboard
        SET EnvironmentID = @DefaultEnvironmentID
        WHERE EnvironmentID IS NULL;

        PRINT 'Updated ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' dashboards.';
    END

    -- ============================================================================
    -- STEP 11: Update Reports with EnvironmentID (if they exist)
    -- ============================================================================
    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
               WHERE TABLE_SCHEMA = '${flyway:defaultSchema}' 
               AND TABLE_NAME = 'Report'
               AND COLUMN_NAME = 'EnvironmentID')
    BEGIN
        PRINT '';
        PRINT 'Step 11: Updating Reports with EnvironmentID...';

        UPDATE ${flyway:defaultSchema}.Report
        SET EnvironmentID = @DefaultEnvironmentID
        WHERE EnvironmentID IS NULL;

        PRINT 'Updated ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' reports.';
    END

    -- ============================================================================
    -- STEP 12: Create Default Project (Optional)
    -- ============================================================================
    PRINT '';
    PRINT 'Step 12: Creating default project...';

    IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.Project WHERE Name = 'Migrated Conversations')
    BEGIN
        INSERT INTO ${flyway:defaultSchema}.Project (
            ID,
            EnvironmentID,
            Name,
            Description,
            Color,
            Icon,
            IsActive,
            __mj_CreatedAt,
            __mj_UpdatedAt
        )
        VALUES (
            NEWID(),
            @DefaultEnvironmentID,
            'Migrated Conversations',
            'Auto-created project for conversations migrated from v2',
            '#6B7280',  -- Gray color
            'folder',
            1,
            GETUTCDATE(),
            GETUTCDATE()
        );

        PRINT 'Created default project for migrated conversations.';
    END

    -- ============================================================================
    -- STEP 13: Validation and Summary
    -- ============================================================================
    PRINT '';
    PRINT '========================================';
    PRINT 'Migration Validation';
    PRINT '========================================';

    -- Validate artifact migration
    DECLARE @NewArtifactCount INT;
    SELECT @NewArtifactCount = COUNT(*) FROM ${flyway:defaultSchema}.Artifact;
    
    IF @NewArtifactCount <> @ArtifactCount
    BEGIN
        SET @ErrorMessage = 'Artifact count mismatch. Expected: ' + CAST(@ArtifactCount AS VARCHAR(10)) + ', Actual: ' + CAST(@NewArtifactCount AS VARCHAR(10));
        RAISERROR(@ErrorMessage, 16, 1);
    END

    -- Validate version migration
    DECLARE @ExpectedVersionCount INT, @NewVersionCount INT;
    SELECT @ExpectedVersionCount = COUNT(*) FROM ${flyway:defaultSchema}.ConversationArtifactVersion;
    SELECT @NewVersionCount = COUNT(*) FROM ${flyway:defaultSchema}.ArtifactVersion;
    
    IF @NewVersionCount <> @ExpectedVersionCount
    BEGIN
        SET @ErrorMessage = 'Version count mismatch. Expected: ' + CAST(@ExpectedVersionCount AS VARCHAR(10)) + ', Actual: ' + CAST(@NewVersionCount AS VARCHAR(10));
        RAISERROR(@ErrorMessage, 16, 1);
    END

    PRINT 'Validation passed!';
    PRINT '';
    PRINT '========================================';
    PRINT 'Migration Summary';
    PRINT '========================================';
    PRINT 'Artifacts Migrated: ' + CAST(@ArtifactCount AS VARCHAR(10));
    PRINT 'Versions Migrated: ' + CAST(@VersionCount AS VARCHAR(10));
    PRINT 'Permissions Migrated: ' + CAST(@PermissionCount AS VARCHAR(10));
    PRINT 'Migration Duration: ' + CAST(DATEDIFF(SECOND, @MigrationStartTime, GETUTCDATE()) AS VARCHAR(10)) + ' seconds';
    PRINT '========================================';
    -- ============================================================================
    -- STEP 14: Mark Old Entities as Deprecated
    -- ============================================================================
    PRINT '';
    PRINT 'Step 14: Marking old entities as deprecated...';

    -- Mark the old conversation artifact entities as deprecated
    UPDATE ${flyway:defaultSchema}.Entity 
    SET Status = 'Deprecated',
        __mj_UpdatedAt = GETUTCDATE()
    WHERE Name IN (
        'MJ: Conversation Artifacts',
        'MJ: Conversation Artifact Versions', 
        'MJ: Conversation Artifact Permissions'
    );

    PRINT 'Marked ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' entities as deprecated.';

    PRINT '';
    PRINT '========================================';
    PRINT 'Migration completed successfully!';
    PRINT '========================================';

    COMMIT TRANSACTION;

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    PRINT '';
    PRINT '========================================';
    PRINT 'ERROR: Migration failed!';
    PRINT '========================================';
    PRINT 'Error Number: ' + CAST(ERROR_NUMBER() AS VARCHAR(10));
    PRINT 'Error Message: ' + ERROR_MESSAGE();
    PRINT 'Error Line: ' + CAST(ERROR_LINE() AS VARCHAR(10));
    PRINT '========================================';
    
    THROW;
END CATCH;

-- ============================================================================
-- POST-MIGRATION NOTES
-- ============================================================================
-- After running this migration:
-- 1. Verify all data has been migrated correctly
-- 2. Update application code to use new entities
-- 3. Monitor for any issues with deprecated entities
-- 4. Do NOT drop old tables immediately - keep for rollback capability
-- 5. The old entities are now marked as 'Deprecated' in the Entity table
--    and will not appear in standard entity lists
-- ============================================================================