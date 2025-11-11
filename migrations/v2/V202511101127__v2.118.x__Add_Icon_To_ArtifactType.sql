/*
   Migration: Add Icon field to ArtifactType table
   Description: Adds an Icon field to store Font Awesome icon class names for artifact types
   Version: 2.118.x
   Date: 2025-11-10
*/

-- Add Icon column to ArtifactType table
ALTER TABLE ${flyway:defaultSchema}.ArtifactType
ADD Icon NVARCHAR(255) NULL;
GO

-- Add extended property description for the Icon field
EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Font Awesome icon class name for displaying this artifact type in the UI (e.g., fa-file-code, fa-chart-line)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ArtifactType',
    @level2type = N'COLUMN', @level2name = N'Icon';
GO




































































-- CODE GEN RUN
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '011bb58c-1187-4107-a82e-d8c676a2a983'  OR 
               (EntityID = '91797885-7128-4B71-8C4B-81C5FEE24F38' AND Name = 'Icon')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '011bb58c-1187-4107-a82e-d8c676a2a983',
            '91797885-7128-4B71-8C4B-81C5FEE24F38', -- Entity: MJ: Artifact Types
            100023,
            'Icon',
            'Icon',
            'Font Awesome icon class name for displaying this artifact type in the UI (e.g., fa-file-code, fa-chart-line)',
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            1,
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
         )
      END

/* SQL text to update entity field related entity name field map for entity field ID 2E8496BA-FE6C-4E64-BA95-41DC1A84DA85 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2E8496BA-FE6C-4E64-BA95-41DC1A84DA85',
         @RelatedEntityNameFieldMap='BoardPosition'

/* SQL text to update entity field related entity name field map for entity field ID DD4816DE-61CE-4996-9AA6-1334DDF610CD */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='DD4816DE-61CE-4996-9AA6-1334DDF610CD',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID E63F338E-DFDD-4F17-8422-3D808BA69596 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E63F338E-DFDD-4F17-8422-3D808BA69596',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 34440FC4-E843-4E84-BD1C-5CC134A791B1 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='34440FC4-E843-4E84-BD1C-5CC134A791B1',
         @RelatedEntityNameFieldMap='Enrollment'

/* SQL text to update entity field related entity name field map for entity field ID 2E0ABA06-AB85-4386-A6F9-D63F657D4FBB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2E0ABA06-AB85-4386-A6F9-D63F657D4FBB',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 4BD689F5-08BE-4EC3-986D-3CBFBCA00291 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4BD689F5-08BE-4EC3-986D-3CBFBCA00291',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID AD799CD0-5191-4FD2-A0E9-ACDF7D2AE435 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='AD799CD0-5191-4FD2-A0E9-ACDF7D2AE435',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 33F0DC37-5A6A-4225-8C2B-05DFC012E8EA */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='33F0DC37-5A6A-4225-8C2B-05DFC012E8EA',
         @RelatedEntityNameFieldMap='ChairMember'

/* SQL text to update entity field related entity name field map for entity field ID B4766BDE-1F37-4EE4-AD93-0B83918F3764 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B4766BDE-1F37-4EE4-AD93-0B83918F3764',
         @RelatedEntityNameFieldMap='PrerequisiteCourse'

/* SQL text to update entity field related entity name field map for entity field ID 1416298F-8A08-42CC-8E42-ACED9E6DB5F9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1416298F-8A08-42CC-8E42-ACED9E6DB5F9',
         @RelatedEntityNameFieldMap='EmailSend'

/* SQL text to update entity field related entity name field map for entity field ID 2365D6C7-F3E1-4201-9EC8-F63789C4D0F9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2365D6C7-F3E1-4201-9EC8-F63789C4D0F9',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 5CBA8FC8-D85B-4505-97AB-34833EEBF4B7 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5CBA8FC8-D85B-4505-97AB-34833EEBF4B7',
         @RelatedEntityNameFieldMap='Course'

/* SQL text to update entity field related entity name field map for entity field ID 1E8BCD03-14C2-4224-A042-42C23C58F862 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1E8BCD03-14C2-4224-A042-42C23C58F862',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 2540E36C-937E-46BB-9645-AD6C3EEBBDEE */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2540E36C-937E-46BB-9645-AD6C3EEBBDEE',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 3B2D77F7-9FFB-4E4B-B079-F4A344F517C8 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3B2D77F7-9FFB-4E4B-B079-F4A344F517C8',
         @RelatedEntityNameFieldMap='Invoice'

/* SQL text to update entity field related entity name field map for entity field ID F27CC83D-F49C-4724-96AA-065AB5C94218 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F27CC83D-F49C-4724-96AA-065AB5C94218',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 265EAA68-CF6A-449D-9E13-27E90A16FA3A */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='265EAA68-CF6A-449D-9E13-27E90A16FA3A',
         @RelatedEntityNameFieldMap='Member'

/* Index for Foreign Keys for ArtifactType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table ArtifactType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArtifactType_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArtifactType_ParentID ON [${flyway:defaultSchema}].[ArtifactType] ([ParentID]);

/* Root ID Function SQL for MJ: Artifact Types.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: fnArtifactTypeParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [ArtifactType].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnArtifactTypeParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnArtifactTypeParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnArtifactTypeParentID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        -- Anchor: Start from @ParentID if not null, otherwise start from @RecordID
        SELECT
            [ID],
            [ParentID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[ArtifactType]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[ArtifactType] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentID]
        WHERE
            p.[Depth] < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentID] IS NULL
    ORDER BY
        [RootParentID]
);
GO


/* Base View SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: vwArtifactTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Artifact Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ArtifactType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwArtifactTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwArtifactTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwArtifactTypes]
AS
SELECT
    a.*,
    ArtifactType_ParentID.[Name] AS [Parent],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[ArtifactType] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ArtifactType] AS ArtifactType_ParentID
  ON
    [a].[ParentID] = ArtifactType_ParentID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnArtifactTypeParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: Permissions for vwArtifactTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: spCreateArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArtifactType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateArtifactType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateArtifactType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateArtifactType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ContentType nvarchar(100),
    @IsEnabled bit = NULL,
    @ParentID uniqueidentifier,
    @ExtractRules nvarchar(MAX),
    @DriverClass nvarchar(255),
    @Icon nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ActualID UNIQUEIDENTIFIER = ISNULL(@ID, NEWID())
    INSERT INTO
    [${flyway:defaultSchema}].[ArtifactType]
        (
            [Name],
                [Description],
                [ContentType],
                [IsEnabled],
                [ParentID],
                [ExtractRules],
                [DriverClass],
                [Icon],
                [ID]
        )
    VALUES
        (
            @Name,
                @Description,
                @ContentType,
                ISNULL(@IsEnabled, 1),
                @ParentID,
                @ExtractRules,
                @DriverClass,
                @Icon,
                @ActualID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwArtifactTypes] WHERE [ID] = @ActualID
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Artifact Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: spUpdateArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArtifactType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateArtifactType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifactType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifactType]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ContentType nvarchar(100),
    @IsEnabled bit,
    @ParentID uniqueidentifier,
    @ExtractRules nvarchar(MAX),
    @DriverClass nvarchar(255),
    @Icon nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactType]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ContentType] = @ContentType,
        [IsEnabled] = @IsEnabled,
        [ParentID] = @ParentID,
        [ExtractRules] = @ExtractRules,
        [DriverClass] = @DriverClass,
        [Icon] = @Icon
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwArtifactTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwArtifactTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ArtifactType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateArtifactType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateArtifactType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateArtifactType
ON [${flyway:defaultSchema}].[ArtifactType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ArtifactType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Artifact Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: spDeleteArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArtifactType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteArtifactType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifactType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifactType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ArtifactType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Artifact Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactType] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 4F889675-EF49-4008-B010-AD84E1270FFB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4F889675-EF49-4008-B010-AD84E1270FFB',
         @RelatedEntityNameFieldMap='Invoice'

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '79A9CC18-2F29-4D9C-93CB-82D9ED497B05'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '79A9CC18-2F29-4D9C-93CB-82D9ED497B05'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B7B428EF-DE10-4882-8517-28636332C6DB'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A0B16E34-7C24-4811-84E6-75CCA5C499FB'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '011BB58C-1187-4107-A82E-D8C676A2A983'
            AND AutoUpdateDefaultInView = 1
         

/* Set categories for 13 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Artifact Type Definition',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E3C8A690-7E75-499E-B603-3F900AB94704'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Artifact Type Definition',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '79A9CC18-2F29-4D9C-93CB-82D9ED497B05'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Artifact Type Definition',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '874E9B47-A201-4C78-896A-D41A607B1840'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Artifact Type Definition',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B7B428EF-DE10-4882-8517-28636332C6DB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Artifact Type Definition',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A0B16E34-7C24-4811-84E6-75CCA5C499FB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Artifact Type Definition',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '011BB58C-1187-4107-A82E-D8C676A2A983'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Artifact Type Definition',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2FEDE9AF-F0FE-438C-A369-93AC24A882C1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy & Inheritance',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '02B6383F-BAE6-465C-BBB4-652E6F75A74C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy & Inheritance',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '63D25BCF-550E-4013-AB1F-03657369B0E9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy & Inheritance',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6C369578-B099-4E25-98B5-8218CE90A432'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy & Inheritance',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6CACE3BF-BDF2-4443-9D2C-E28E4FE4E489'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A8CC25C6-C9DE-4726-9BA5-81E0C4749281'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6AE8938F-5656-4CC8-89BC-1CCAAC9DF213'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryIcons setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Artifact Type Definition":"fa fa-wrench","Hierarchy & Inheritance":"fa fa-sitemap","System Metadata":"fa fa-database"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '91797885-7128-4B71-8C4B-81C5FEE24F38' AND Name = 'FieldCategoryIcons'
            

