-- ============================================================================
-- Fix ArtifactPermission Constraints & Grant UI Role Permissions
-- Migration: v2.111.x
-- Date: 2025-10-26
-- ============================================================================
-- This migration:
-- 1. Adds missing constraints to ArtifactPermission table (UNIQUE + CASCADE DELETE)
-- 2. Grants UI role Create/Update/Delete permissions for permission management entities
--
-- PART A - Database Constraints:
--   - Add UNIQUE constraint on (ArtifactID, UserID) to prevent duplicate permissions
--   - Add CASCADE DELETE on ArtifactID foreign key for automatic cleanup
--
-- PART B - Entity Permissions for UI Role:
--   - CollectionPermission: Grant Create/Update (enables sharing collections)
--   - Artifacts: Grant Create/Update/Delete (enables artifact management)
--   - ArtifactPermission: Grant Create/Update (enables sharing artifacts)
--
-- Note: UserID and SharedByUserID foreign keys intentionally DO NOT have CASCADE
-- to match CollectionPermission behavior and prevent accidental data loss.
-- ============================================================================

SET NOCOUNT ON;

-- ============================================================================
-- PART 1: ADD UNIQUE CONSTRAINT
-- ============================================================================
-- Prevent duplicate permission records for the same artifact-user combination
-- Matches CollectionPermission behavior

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_ArtifactPermission_Artifact_User'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactPermission]')
)
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[ArtifactPermission]
    ADD CONSTRAINT [UQ_ArtifactPermission_Artifact_User]
        UNIQUE NONCLUSTERED ([ArtifactID], [UserID]);

    PRINT '✓ Added UNIQUE constraint on (ArtifactID, UserID)';
END
ELSE
BEGIN
    PRINT '- UNIQUE constraint already exists, skipping';
END

-- ============================================================================
-- PART 2: ADD CASCADE DELETE ON ARTIFACTID
-- ============================================================================
-- When an artifact is deleted, automatically remove all permission records
-- Matches CollectionPermission CASCADE behavior on CollectionID

-- Drop existing foreign key
IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_ArtifactPermission_ArtifactID'
    AND parent_object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactPermission]')
)
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[ArtifactPermission]
    DROP CONSTRAINT [FK_ArtifactPermission_ArtifactID];

    PRINT '✓ Dropped existing FK_ArtifactPermission_ArtifactID';
END

-- Recreate with CASCADE DELETE
ALTER TABLE [${flyway:defaultSchema}].[ArtifactPermission]
ADD CONSTRAINT [FK_ArtifactPermission_ArtifactID]
    FOREIGN KEY ([ArtifactID])
    REFERENCES [${flyway:defaultSchema}].[Artifact]([ID])
    ON DELETE CASCADE;

PRINT '✓ Recreated FK_ArtifactPermission_ArtifactID with CASCADE DELETE';

-- ============================================================================
-- VERIFICATION
-- ============================================================================
PRINT '';
PRINT '=== Verification ===';

-- Check UNIQUE constraint
IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_ArtifactPermission_Artifact_User'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactPermission]')
)
    PRINT '✓ UNIQUE constraint: EXISTS';
ELSE
    PRINT '✗ UNIQUE constraint: MISSING';

-- Check CASCADE DELETE
IF EXISTS (
    SELECT 1 FROM sys.foreign_keys fk
    WHERE fk.name = 'FK_ArtifactPermission_ArtifactID'
    AND fk.parent_object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactPermission]')
    AND fk.delete_referential_action = 1 -- 1 = CASCADE
)
    PRINT '✓ CASCADE DELETE on ArtifactID: ENABLED';
ELSE
    PRINT '✗ CASCADE DELETE on ArtifactID: NOT ENABLED';

PRINT '';
PRINT '=== Constraint fixes completed ===';

-- ============================================================================
-- PART 3: GRANT UI ROLE PERMISSIONS FOR PERMISSION MANAGEMENT
-- ============================================================================
-- Grant Create/Update permissions to UI role for permission entities
-- Permission records should not be deleted directly by users
-- This enables users to share artifacts and collections through the UI

PRINT '';
PRINT '=== Granting UI Role Permissions ===';

-- Update permissions for CollectionPermission entity
UPDATE [${flyway:defaultSchema}].[EntityPermission]
SET
    CanCreate = 1,
    CanUpdate = 1
    -- CanDelete remains 0 - users should not delete permission records directly
WHERE
    EntityID = '55E5A944-6ECD-491D-A4E9-99E1453FEBDB' -- MJ: Collection Permissions
    AND RoleID = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E'; -- UI role

PRINT '✓ Granted Create/Update to UI role for CollectionPermission';

-- Update permissions for Artifacts entity
UPDATE [${flyway:defaultSchema}].[EntityPermission]
SET
    CanCreate = 1,
    CanUpdate = 1,
    CanDelete = 1
WHERE
    EntityID = 'F48D2341-8667-40BB-BCA8-87D7F80E16CD' -- MJ: Artifacts
    AND RoleID = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E'; -- UI role

PRINT '✓ Granted Create/Update/Delete to UI role for Artifacts';

-- Update permissions for ArtifactPermission entity
UPDATE [${flyway:defaultSchema}].[EntityPermission]
SET
    CanCreate = 1,
    CanUpdate = 1
    -- CanDelete remains 0 - users should not delete permission records directly
WHERE
    EntityID = '19846E1A-FD8E-405F-A0FA-42A7AA44758D' -- MJ: Artifact Permissions
    AND RoleID = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E'; -- UI role

PRINT '✓ Granted Create/Update to UI role for ArtifactPermission';

-- ============================================================================
-- FINAL VERIFICATION
-- ============================================================================
PRINT '';
PRINT '=== Final Verification ===';

-- Verify permissions were granted
DECLARE @ArtifactsFullAccess INT;
DECLARE @PermissionEntitiesCreateUpdate INT;

-- Check Artifacts has full Create/Update/Delete
SELECT @ArtifactsFullAccess = COUNT(*)
FROM [${flyway:defaultSchema}].[EntityPermission]
WHERE EntityID = 'F48D2341-8667-40BB-BCA8-87D7F80E16CD' -- Artifacts
AND RoleID = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E'
AND CanCreate = 1 AND CanUpdate = 1 AND CanDelete = 1;

-- Check permission entities have Create/Update (Delete should remain 0)
SELECT @PermissionEntitiesCreateUpdate = COUNT(*)
FROM [${flyway:defaultSchema}].[EntityPermission]
WHERE EntityID IN (
    '55E5A944-6ECD-491D-A4E9-99E1453FEBDB', -- CollectionPermission
    '19846E1A-FD8E-405F-A0FA-42A7AA44758D'  -- ArtifactPermission
)
AND RoleID = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E'
AND CanCreate = 1 AND CanUpdate = 1;

IF @ArtifactsFullAccess = 1
    PRINT '✓ Artifacts: Create/Update/Delete granted';
ELSE
    PRINT '✗ WARNING: Artifacts permissions not correct';

IF @PermissionEntitiesCreateUpdate = 2
    PRINT '✓ Permission entities: Create/Update granted (Delete=0)';
ELSE
    PRINT '✗ WARNING: Permission entities not correct';

PRINT '';
PRINT '=== Migration completed successfully ===';
PRINT '';
PRINT 'NEXT STEPS:';
PRINT '1. Run CodeGen to update generated stored procedures and views';
PRINT '2. Test constraint behavior (UNIQUE + CASCADE DELETE)';
PRINT '3. Test artifact and collection sharing UI';


-- codegen
/* SQL text to update entity field related entity name field map for entity field ID C47F433E-F36B-1410-848C-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C47F433E-F36B-1410-848C-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID E07F433E-F36B-1410-848C-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E07F433E-F36B-1410-848C-00E2629BC298',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID AC7F433E-F36B-1410-848C-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='AC7F433E-F36B-1410-848C-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 3E7F433E-F36B-1410-848C-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3E7F433E-F36B-1410-848C-00E2629BC298',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID 5E7F433E-F36B-1410-848C-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5E7F433E-F36B-1410-848C-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID B27F433E-F36B-1410-848C-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B27F433E-F36B-1410-848C-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID B47F433E-F36B-1410-848C-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B47F433E-F36B-1410-848C-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID B67F433E-F36B-1410-848C-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B67F433E-F36B-1410-848C-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 507F433E-F36B-1410-848C-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='507F433E-F36B-1410-848C-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 887F433E-F36B-1410-848C-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='887F433E-F36B-1410-848C-00E2629BC298',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID 527F433E-F36B-1410-848C-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='527F433E-F36B-1410-848C-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 547F433E-F36B-1410-848C-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='547F433E-F36B-1410-848C-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentFileType'

/* Index for Foreign Keys for EntityRelationship */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_EntityID ON [${flyway:defaultSchema}].[EntityRelationship] ([EntityID]);

-- Index for foreign key RelatedEntityID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_RelatedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_RelatedEntityID ON [${flyway:defaultSchema}].[EntityRelationship] ([RelatedEntityID]);

-- Index for foreign key DisplayUserViewID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayUserViewID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayUserViewID ON [${flyway:defaultSchema}].[EntityRelationship] ([DisplayUserViewID]);

-- Index for foreign key DisplayComponentID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayComponentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayComponentID ON [${flyway:defaultSchema}].[EntityRelationship] ([DisplayComponentID]);

/* Base View Permissions SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: Permissions for vwEntityRelationships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityRelationships] TO [cdp_Integration], [cdp_Developer], [cdp_UI]

/* spCreate SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: spCreateEntityRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityRelationship
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityRelationship]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityRelationship];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityRelationship]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @Sequence int = NULL,
    @RelatedEntityID uniqueidentifier,
    @BundleInAPI bit = NULL,
    @IncludeInParentAllQuery bit = NULL,
    @Type nchar(20) = NULL,
    @EntityKeyField nvarchar(255),
    @RelatedEntityJoinField nvarchar(255),
    @JoinView nvarchar(255),
    @JoinEntityJoinField nvarchar(255),
    @JoinEntityInverseJoinField nvarchar(255),
    @DisplayInForm bit = NULL,
    @DisplayLocation nvarchar(50) = NULL,
    @DisplayName nvarchar(255),
    @DisplayIconType nvarchar(50) = NULL,
    @DisplayIcon nvarchar(255),
    @DisplayComponentID uniqueidentifier,
    @DisplayComponentConfiguration nvarchar(MAX),
    @AutoUpdateFromSchema bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityRelationship]
            (
                [ID],
                [EntityID],
                [Sequence],
                [RelatedEntityID],
                [BundleInAPI],
                [IncludeInParentAllQuery],
                [Type],
                [EntityKeyField],
                [RelatedEntityJoinField],
                [JoinView],
                [JoinEntityJoinField],
                [JoinEntityInverseJoinField],
                [DisplayInForm],
                [DisplayLocation],
                [DisplayName],
                [DisplayIconType],
                [DisplayIcon],
                [DisplayComponentID],
                [DisplayComponentConfiguration],
                [AutoUpdateFromSchema]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                ISNULL(@Sequence, 0),
                @RelatedEntityID,
                ISNULL(@BundleInAPI, 1),
                ISNULL(@IncludeInParentAllQuery, 0),
                ISNULL(@Type, 'One To Many'),
                @EntityKeyField,
                @RelatedEntityJoinField,
                @JoinView,
                @JoinEntityJoinField,
                @JoinEntityInverseJoinField,
                ISNULL(@DisplayInForm, 1),
                ISNULL(@DisplayLocation, 'After Field Tabs'),
                @DisplayName,
                ISNULL(@DisplayIconType, 'Related Entity Icon'),
                @DisplayIcon,
                @DisplayComponentID,
                @DisplayComponentConfiguration,
                ISNULL(@AutoUpdateFromSchema, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityRelationship]
            (
                [EntityID],
                [Sequence],
                [RelatedEntityID],
                [BundleInAPI],
                [IncludeInParentAllQuery],
                [Type],
                [EntityKeyField],
                [RelatedEntityJoinField],
                [JoinView],
                [JoinEntityJoinField],
                [JoinEntityInverseJoinField],
                [DisplayInForm],
                [DisplayLocation],
                [DisplayName],
                [DisplayIconType],
                [DisplayIcon],
                [DisplayComponentID],
                [DisplayComponentConfiguration],
                [AutoUpdateFromSchema]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                ISNULL(@Sequence, 0),
                @RelatedEntityID,
                ISNULL(@BundleInAPI, 1),
                ISNULL(@IncludeInParentAllQuery, 0),
                ISNULL(@Type, 'One To Many'),
                @EntityKeyField,
                @RelatedEntityJoinField,
                @JoinView,
                @JoinEntityJoinField,
                @JoinEntityInverseJoinField,
                ISNULL(@DisplayInForm, 1),
                ISNULL(@DisplayLocation, 'After Field Tabs'),
                @DisplayName,
                ISNULL(@DisplayIconType, 'Related Entity Icon'),
                @DisplayIcon,
                @DisplayComponentID,
                @DisplayComponentConfiguration,
                ISNULL(@AutoUpdateFromSchema, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityRelationships] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityRelationship] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Entity Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityRelationship] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: spUpdateEntityRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityRelationship
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityRelationship]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityRelationship];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityRelationship]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Sequence int,
    @RelatedEntityID uniqueidentifier,
    @BundleInAPI bit,
    @IncludeInParentAllQuery bit,
    @Type nchar(20),
    @EntityKeyField nvarchar(255),
    @RelatedEntityJoinField nvarchar(255),
    @JoinView nvarchar(255),
    @JoinEntityJoinField nvarchar(255),
    @JoinEntityInverseJoinField nvarchar(255),
    @DisplayInForm bit,
    @DisplayLocation nvarchar(50),
    @DisplayName nvarchar(255),
    @DisplayIconType nvarchar(50),
    @DisplayIcon nvarchar(255),
    @DisplayComponentID uniqueidentifier,
    @DisplayComponentConfiguration nvarchar(MAX),
    @AutoUpdateFromSchema bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityRelationship]
    SET
        [EntityID] = @EntityID,
        [Sequence] = @Sequence,
        [RelatedEntityID] = @RelatedEntityID,
        [BundleInAPI] = @BundleInAPI,
        [IncludeInParentAllQuery] = @IncludeInParentAllQuery,
        [Type] = @Type,
        [EntityKeyField] = @EntityKeyField,
        [RelatedEntityJoinField] = @RelatedEntityJoinField,
        [JoinView] = @JoinView,
        [JoinEntityJoinField] = @JoinEntityJoinField,
        [JoinEntityInverseJoinField] = @JoinEntityInverseJoinField,
        [DisplayInForm] = @DisplayInForm,
        [DisplayLocation] = @DisplayLocation,
        [DisplayName] = @DisplayName,
        [DisplayIconType] = @DisplayIconType,
        [DisplayIcon] = @DisplayIcon,
        [DisplayComponentID] = @DisplayComponentID,
        [DisplayComponentConfiguration] = @DisplayComponentConfiguration,
        [AutoUpdateFromSchema] = @AutoUpdateFromSchema
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityRelationships] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityRelationships]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityRelationship] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityRelationship table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityRelationship]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityRelationship];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityRelationship
ON [${flyway:defaultSchema}].[EntityRelationship]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityRelationship]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityRelationship] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Entity Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityRelationship] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: spDeleteEntityRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityRelationship
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityRelationship]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityRelationship];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityRelationship]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityRelationship]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityRelationship] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for Entity Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityRelationship] TO [cdp_Integration], [cdp_Developer]



/* SQL text to update entity field related entity name field map for entity field ID C280433E-F36B-1410-848C-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C280433E-F36B-1410-848C-00E2629BC298',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 4A80433E-F36B-1410-848C-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4A80433E-F36B-1410-848C-00E2629BC298',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 6280433E-F36B-1410-848C-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6280433E-F36B-1410-848C-00E2629BC298',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID C580433E-F36B-1410-848C-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C580433E-F36B-1410-848C-00E2629BC298',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 6880433E-F36B-1410-848C-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6880433E-F36B-1410-848C-00E2629BC298',
         @RelatedEntityNameFieldMap='User'

/* Index for Foreign Keys for UserRecordLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Record Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table UserRecordLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserRecordLog_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserRecordLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserRecordLog_UserID ON [${flyway:defaultSchema}].[UserRecordLog] ([UserID]);

-- Index for foreign key EntityID in table UserRecordLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserRecordLog_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserRecordLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserRecordLog_EntityID ON [${flyway:defaultSchema}].[UserRecordLog] ([EntityID]);

/* Base View Permissions SQL for User Record Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Record Logs
-- Item: Permissions for vwUserRecordLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUserRecordLogs] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for User Record Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Record Logs
-- Item: spCreateUserRecordLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserRecordLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUserRecordLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUserRecordLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserRecordLog]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @EarliestAt datetime = NULL,
    @LatestAt datetime = NULL,
    @TotalCount int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[UserRecordLog]
            (
                [ID],
                [UserID],
                [EntityID],
                [RecordID],
                [EarliestAt],
                [LatestAt],
                [TotalCount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                @EntityID,
                @RecordID,
                ISNULL(@EarliestAt, getdate()),
                ISNULL(@LatestAt, getdate()),
                ISNULL(@TotalCount, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[UserRecordLog]
            (
                [UserID],
                [EntityID],
                [RecordID],
                [EarliestAt],
                [LatestAt],
                [TotalCount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                @EntityID,
                @RecordID,
                ISNULL(@EarliestAt, getdate()),
                ISNULL(@LatestAt, getdate()),
                ISNULL(@TotalCount, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserRecordLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserRecordLog] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for User Record Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserRecordLog] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for User Record Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Record Logs
-- Item: spUpdateUserRecordLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserRecordLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUserRecordLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUserRecordLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserRecordLog]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @EarliestAt datetime,
    @LatestAt datetime,
    @TotalCount int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserRecordLog]
    SET
        [UserID] = @UserID,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [EarliestAt] = @EarliestAt,
        [LatestAt] = @LatestAt,
        [TotalCount] = @TotalCount
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUserRecordLogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserRecordLogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserRecordLog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserRecordLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUserRecordLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUserRecordLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserRecordLog
ON [${flyway:defaultSchema}].[UserRecordLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserRecordLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserRecordLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for User Record Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserRecordLog] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for User Record Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Record Logs
-- Item: spDeleteUserRecordLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserRecordLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUserRecordLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUserRecordLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserRecordLog]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserRecordLog]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserRecordLog] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for User Record Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserRecordLog] TO [cdp_Developer], [cdp_Integration]



/* Index for Foreign Keys for UserView */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Views
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table UserView
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserView_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserView]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserView_UserID ON [${flyway:defaultSchema}].[UserView] ([UserID]);

-- Index for foreign key EntityID in table UserView
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserView_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserView]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserView_EntityID ON [${flyway:defaultSchema}].[UserView] ([EntityID]);

-- Index for foreign key CategoryID in table UserView
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserView_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserView]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserView_CategoryID ON [${flyway:defaultSchema}].[UserView] ([CategoryID]);

/* Base View Permissions SQL for User Views */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Views
-- Item: Permissions for vwUserViews
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUserViews] TO [cdp_Integration], [cdp_Developer], [cdp_UI]

/* spCreate SQL for User Views */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Views
-- Item: spCreateUserView
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserView
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUserView]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUserView];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserView]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
    @IsShared bit = NULL,
    @IsDefault bit = NULL,
    @GridState nvarchar(MAX),
    @FilterState nvarchar(MAX),
    @CustomFilterState bit = NULL,
    @SmartFilterEnabled bit = NULL,
    @SmartFilterPrompt nvarchar(MAX),
    @SmartFilterWhereClause nvarchar(MAX),
    @SmartFilterExplanation nvarchar(MAX),
    @WhereClause nvarchar(MAX),
    @CustomWhereClause bit = NULL,
    @SortState nvarchar(MAX),
    @Thumbnail nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[UserView]
            (
                [ID],
                [UserID],
                [EntityID],
                [Name],
                [Description],
                [CategoryID],
                [IsShared],
                [IsDefault],
                [GridState],
                [FilterState],
                [CustomFilterState],
                [SmartFilterEnabled],
                [SmartFilterPrompt],
                [SmartFilterWhereClause],
                [SmartFilterExplanation],
                [WhereClause],
                [CustomWhereClause],
                [SortState],
                [Thumbnail]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                @EntityID,
                @Name,
                @Description,
                @CategoryID,
                ISNULL(@IsShared, 0),
                ISNULL(@IsDefault, 0),
                @GridState,
                @FilterState,
                ISNULL(@CustomFilterState, 0),
                ISNULL(@SmartFilterEnabled, 0),
                @SmartFilterPrompt,
                @SmartFilterWhereClause,
                @SmartFilterExplanation,
                @WhereClause,
                ISNULL(@CustomWhereClause, 0),
                @SortState,
                @Thumbnail
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[UserView]
            (
                [UserID],
                [EntityID],
                [Name],
                [Description],
                [CategoryID],
                [IsShared],
                [IsDefault],
                [GridState],
                [FilterState],
                [CustomFilterState],
                [SmartFilterEnabled],
                [SmartFilterPrompt],
                [SmartFilterWhereClause],
                [SmartFilterExplanation],
                [WhereClause],
                [CustomWhereClause],
                [SortState],
                [Thumbnail]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                @EntityID,
                @Name,
                @Description,
                @CategoryID,
                ISNULL(@IsShared, 0),
                ISNULL(@IsDefault, 0),
                @GridState,
                @FilterState,
                ISNULL(@CustomFilterState, 0),
                ISNULL(@SmartFilterEnabled, 0),
                @SmartFilterPrompt,
                @SmartFilterWhereClause,
                @SmartFilterExplanation,
                @WhereClause,
                ISNULL(@CustomWhereClause, 0),
                @SortState,
                @Thumbnail
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserViews] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* spCreate Permissions for User Views */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* spUpdate SQL for User Views */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Views
-- Item: spUpdateUserView
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserView
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUserView]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUserView];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserView]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
    @IsShared bit,
    @IsDefault bit,
    @GridState nvarchar(MAX),
    @FilterState nvarchar(MAX),
    @CustomFilterState bit,
    @SmartFilterEnabled bit,
    @SmartFilterPrompt nvarchar(MAX),
    @SmartFilterWhereClause nvarchar(MAX),
    @SmartFilterExplanation nvarchar(MAX),
    @WhereClause nvarchar(MAX),
    @CustomWhereClause bit,
    @SortState nvarchar(MAX),
    @Thumbnail nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserView]
    SET
        [UserID] = @UserID,
        [EntityID] = @EntityID,
        [Name] = @Name,
        [Description] = @Description,
        [CategoryID] = @CategoryID,
        [IsShared] = @IsShared,
        [IsDefault] = @IsDefault,
        [GridState] = @GridState,
        [FilterState] = @FilterState,
        [CustomFilterState] = @CustomFilterState,
        [SmartFilterEnabled] = @SmartFilterEnabled,
        [SmartFilterPrompt] = @SmartFilterPrompt,
        [SmartFilterWhereClause] = @SmartFilterWhereClause,
        [SmartFilterExplanation] = @SmartFilterExplanation,
        [WhereClause] = @WhereClause,
        [CustomWhereClause] = @CustomWhereClause,
        [SortState] = @SortState,
        [Thumbnail] = @Thumbnail
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUserViews] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserViews]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserView table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUserView]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUserView];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserView
ON [${flyway:defaultSchema}].[UserView]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserView]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserView] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for User Views */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* spDelete SQL for User Views */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Views
-- Item: spDeleteUserView
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserView
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUserView]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUserView];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserView]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserView]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* spDelete Permissions for User Views */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI]




