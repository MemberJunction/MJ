-- Add ParentID column to Action table for hierarchical action support
-- This allows actions to inherit from and specialize other actions

-- Add ParentID column with foreign key constraint
ALTER TABLE ${flyway:defaultSchema}.Action 
ADD ParentID uniqueidentifier NULL,
    CONSTRAINT FK_Action_ParentID 
    FOREIGN KEY (ParentID) REFERENCES ${flyway:defaultSchema}.Action(ID);
GO

-- Add index for performance
CREATE NONCLUSTERED INDEX IX_Action_ParentID 
ON ${flyway:defaultSchema}.Action(ParentID)
WHERE ParentID IS NOT NULL;
GO

-- Add extended property description
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Optional ID of the parent action this action inherits from. Used for hierarchical action composition where child actions can specialize parent actions.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE',  @level1name = N'Action',
    @level2type = N'COLUMN', @level2name = N'ParentID';
GO
 

/*********** CODE GEN RUN **********/
 /* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9d70def5-99e8-4952-9663-4e437ef9d869'  OR 
               (EntityID = '38248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ParentID')
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
            '9d70def5-99e8-4952-9663-4e437ef9d869',
            '38248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Actions
            100021,
            'ParentID',
            'Parent ID',
            'Optional ID of the parent action this action inherits from. Used for hierarchical action composition where child actions can specialize parent actions.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '38248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '3b5cf145-7da7-496f-97d0-b5b05b3dcb76'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('3b5cf145-7da7-496f-97d0-b5b05b3dcb76', '38248F34-2837-EF11-86D4-6045BDEE16E6', '38248F34-2837-EF11-86D4-6045BDEE16E6', 'ParentID', 'One To Many', 1, 1, 'Actions', 10);
   END
                              

/* Index for Foreign Keys for Action */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Actions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CategoryID in table Action
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Action_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Action]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Action_CategoryID ON [${flyway:defaultSchema}].[Action] ([CategoryID]);

-- Index for foreign key CodeApprovedByUserID in table Action
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Action_CodeApprovedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Action]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Action_CodeApprovedByUserID ON [${flyway:defaultSchema}].[Action] ([CodeApprovedByUserID]);

-- Index for foreign key ParentID in table Action
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Action_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Action]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Action_ParentID ON [${flyway:defaultSchema}].[Action] ([ParentID]);

/* SQL text to update entity field related entity name field map for entity field ID 9D70DEF5-99E8-4952-9663-4E437EF9D869 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9D70DEF5-99E8-4952-9663-4E437EF9D869',
         @RelatedEntityNameFieldMap='Parent'

/* Base View SQL for Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Actions
-- Item: vwActions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Actions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Action
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwActions]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwActions]
AS
SELECT
    a.*,
    ActionCategory_CategoryID.[Name] AS [Category],
    User_CodeApprovedByUserID.[Name] AS [CodeApprovedByUser],
    Action_ParentID.[Name] AS [Parent]
FROM
    [${flyway:defaultSchema}].[Action] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ActionCategory] AS ActionCategory_CategoryID
  ON
    [a].[CategoryID] = ActionCategory_CategoryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_CodeApprovedByUserID
  ON
    [a].[CodeApprovedByUserID] = User_CodeApprovedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Action] AS Action_ParentID
  ON
    [a].[ParentID] = Action_ParentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwActions] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* Base View Permissions SQL for Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Actions
-- Item: Permissions for vwActions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwActions] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Actions
-- Item: spCreateAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Action
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAction]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAction]
    @ID uniqueidentifier = NULL,
    @CategoryID uniqueidentifier,
    @Name nvarchar(425),
    @Description nvarchar(MAX),
    @Type nvarchar(20),
    @UserPrompt nvarchar(MAX),
    @UserComments nvarchar(MAX),
    @Code nvarchar(MAX),
    @CodeComments nvarchar(MAX),
    @CodeApprovalStatus nvarchar(20),
    @CodeApprovalComments nvarchar(MAX),
    @CodeApprovedByUserID uniqueidentifier,
    @CodeApprovedAt datetime,
    @CodeLocked bit,
    @ForceCodeGeneration bit,
    @RetentionPeriod int,
    @Status nvarchar(20),
    @DriverClass nvarchar(255),
    @ParentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Action]
            (
                [ID],
                [CategoryID],
                [Name],
                [Description],
                [Type],
                [UserPrompt],
                [UserComments],
                [Code],
                [CodeComments],
                [CodeApprovalStatus],
                [CodeApprovalComments],
                [CodeApprovedByUserID],
                [CodeApprovedAt],
                [CodeLocked],
                [ForceCodeGeneration],
                [RetentionPeriod],
                [Status],
                [__mj_CreatedAt],
                [__mj_UpdatedAt],
                [DriverClass],
                [ParentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CategoryID,
                @Name,
                @Description,
                @Type,
                @UserPrompt,
                @UserComments,
                @Code,
                @CodeComments,
                @CodeApprovalStatus,
                @CodeApprovalComments,
                @CodeApprovedByUserID,
                @CodeApprovedAt,
                @CodeLocked,
                @ForceCodeGeneration,
                @RetentionPeriod,
                @Status,
                GETUTCDATE(),
                GETUTCDATE(),
                @DriverClass,
                @ParentID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Action]
            (
                [CategoryID],
                [Name],
                [Description],
                [Type],
                [UserPrompt],
                [UserComments],
                [Code],
                [CodeComments],
                [CodeApprovalStatus],
                [CodeApprovalComments],
                [CodeApprovedByUserID],
                [CodeApprovedAt],
                [CodeLocked],
                [ForceCodeGeneration],
                [RetentionPeriod],
                [Status],
                [__mj_CreatedAt],
                [__mj_UpdatedAt],
                [DriverClass],
                [ParentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CategoryID,
                @Name,
                @Description,
                @Type,
                @UserPrompt,
                @UserComments,
                @Code,
                @CodeComments,
                @CodeApprovalStatus,
                @CodeApprovalComments,
                @CodeApprovedByUserID,
                @CodeApprovedAt,
                @CodeLocked,
                @ForceCodeGeneration,
                @RetentionPeriod,
                @Status,
                GETUTCDATE(),
                GETUTCDATE(),
                @DriverClass,
                @ParentID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwActions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAction] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAction] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Actions
-- Item: spUpdateAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Action
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAction]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAction]
    @ID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @Name nvarchar(425),
    @Description nvarchar(MAX),
    @Type nvarchar(20),
    @UserPrompt nvarchar(MAX),
    @UserComments nvarchar(MAX),
    @Code nvarchar(MAX),
    @CodeComments nvarchar(MAX),
    @CodeApprovalStatus nvarchar(20),
    @CodeApprovalComments nvarchar(MAX),
    @CodeApprovedByUserID uniqueidentifier,
    @CodeApprovedAt datetime,
    @CodeLocked bit,
    @ForceCodeGeneration bit,
    @RetentionPeriod int,
    @Status nvarchar(20),
    @DriverClass nvarchar(255),
    @ParentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Action]
    SET
        [CategoryID] = @CategoryID,
        [Name] = @Name,
        [Description] = @Description,
        [Type] = @Type,
        [UserPrompt] = @UserPrompt,
        [UserComments] = @UserComments,
        [Code] = @Code,
        [CodeComments] = @CodeComments,
        [CodeApprovalStatus] = @CodeApprovalStatus,
        [CodeApprovalComments] = @CodeApprovalComments,
        [CodeApprovedByUserID] = @CodeApprovedByUserID,
        [CodeApprovedAt] = @CodeApprovedAt,
        [CodeLocked] = @CodeLocked,
        [ForceCodeGeneration] = @ForceCodeGeneration,
        [RetentionPeriod] = @RetentionPeriod,
        [Status] = @Status,
        [DriverClass] = @DriverClass,
        [ParentID] = @ParentID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwActions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAction] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Action table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAction
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAction
ON [${flyway:defaultSchema}].[Action]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Action]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Action] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAction] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Actions
-- Item: spDeleteAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Action
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAction]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAction]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Action]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAction] TO [cdp_Integration]
    

/* spDelete Permissions for Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAction] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c334f7b5-ee51-4b08-9437-ad3c8ef5fe4a'  OR 
               (EntityID = '38248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Parent')
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
            'c334f7b5-ee51-4b08-9437-ad3c8ef5fe4a',
            '38248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Actions
            100024,
            'Parent',
            'Parent',
            NULL,
            'nvarchar',
            850,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
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

