-- Add IconClass field to AI Agents table
ALTER TABLE ${flyway:defaultSchema}.AIAgent
ADD IconClass NVARCHAR(100) NULL;
GO

-- Drop extended property for LogoURL if it exists
IF EXISTS (
    SELECT 1 
    FROM sys.extended_properties 
    WHERE major_id = OBJECT_ID('${flyway:defaultSchema}.AIAgent') 
    AND minor_id = (
        SELECT column_id 
        FROM sys.columns 
        WHERE object_id = OBJECT_ID('${flyway:defaultSchema}.AIAgent') 
        AND name = 'LogoURL'
    )
    AND name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty 
        @name = N'MS_Description',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'AIAgent',
        @level2type = N'COLUMN', @level2name = N'LogoURL';
END
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'URL to an image file or base64 data URI (e.g., data:image/png;base64,...) for the agent logo. Takes precedence over IconClass in UI display.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgent',
    @level2type = N'COLUMN', @level2name = N'LogoURL';
GO

-- Add extended property for new IconClass field in AI Agents
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Font Awesome icon class (e.g., fa-robot, fa-brain) for the agent. Used as fallback when LogoURL is not set or fails to load.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgent',
    @level2type = N'COLUMN', @level2name = N'IconClass';
GO

-- Add IconClass field to Actions table
ALTER TABLE ${flyway:defaultSchema}.Action
ADD IconClass NVARCHAR(100) NULL;
GO

-- Add extended property for IconClass field in Actions
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Font Awesome icon class (e.g., fa-cog, fa-play, fa-search) for visual representation of the action.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Action',
    @level2type = N'COLUMN', @level2name = N'IconClass';
GO
 



/**** CODE GEN RUN ****/

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e3e05e29-cdaf-4bfe-9fc8-4450eebe05e5'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'IconClass')
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
            'e3e05e29-cdaf-4bfe-9fc8-4450eebe05e5',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            100018,
            'IconClass',
            'Icon Class',
            'Font Awesome icon class (e.g., fa-robot, fa-brain) for the agent. Used as fallback when LogoURL is not set or fails to load.',
            'nvarchar',
            200,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '72b41f11-f880-45b3-ae45-9b264146f35f'  OR 
               (EntityID = '38248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'IconClass')
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
            '72b41f11-f880-45b3-ae45-9b264146f35f',
            '38248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Actions
            100022,
            'IconClass',
            'Icon Class',
            'Font Awesome icon class (e.g., fa-cog, fa-play, fa-search) for visual representation of the action.',
            'nvarchar',
            200,
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

/* Index for Foreign Keys for AIAgent */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_ParentID ON [${flyway:defaultSchema}].[AIAgent] ([ParentID]);

-- Index for foreign key ContextCompressionPromptID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_ContextCompressionPromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_ContextCompressionPromptID ON [${flyway:defaultSchema}].[AIAgent] ([ContextCompressionPromptID]);

-- Index for foreign key TypeID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_TypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_TypeID ON [${flyway:defaultSchema}].[AIAgent] ([TypeID]);

/* Base View SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: vwAIAgents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AI Agents
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgent
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIAgents]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgents]
AS
SELECT
    a.*,
    AIAgent_ParentID.[Name] AS [Parent],
    AIPrompt_ContextCompressionPromptID.[Name] AS [ContextCompressionPrompt],
    AIAgentType_TypeID.[Name] AS [Type]
FROM
    [${flyway:defaultSchema}].[AIAgent] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_ParentID
  ON
    [a].[ParentID] = AIAgent_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_ContextCompressionPromptID
  ON
    [a].[ContextCompressionPromptID] = AIPrompt_ContextCompressionPromptID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentType] AS AIAgentType_TypeID
  ON
    [a].[TypeID] = AIAgentType_TypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgents] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: Permissions for vwAIAgents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgents] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: spCreateAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgent
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIAgent]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgent]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @LogoURL nvarchar(255),
    @ParentID uniqueidentifier,
    @ExposeAsAction bit,
    @ExecutionOrder int,
    @ExecutionMode nvarchar(20),
    @EnableContextCompression bit,
    @ContextCompressionMessageThreshold int,
    @ContextCompressionPromptID uniqueidentifier,
    @ContextCompressionMessageRetentionCount int,
    @TypeID uniqueidentifier,
    @Status nvarchar(20),
    @DriverClass nvarchar(255),
    @IconClass nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgent]
            (
                [ID],
                [Name],
                [Description],
                [LogoURL],
                [ParentID],
                [ExposeAsAction],
                [ExecutionOrder],
                [ExecutionMode],
                [EnableContextCompression],
                [ContextCompressionMessageThreshold],
                [ContextCompressionPromptID],
                [ContextCompressionMessageRetentionCount],
                [TypeID],
                [Status],
                [DriverClass],
                [IconClass]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @LogoURL,
                @ParentID,
                @ExposeAsAction,
                @ExecutionOrder,
                @ExecutionMode,
                @EnableContextCompression,
                @ContextCompressionMessageThreshold,
                @ContextCompressionPromptID,
                @ContextCompressionMessageRetentionCount,
                @TypeID,
                @Status,
                @DriverClass,
                @IconClass
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgent]
            (
                [Name],
                [Description],
                [LogoURL],
                [ParentID],
                [ExposeAsAction],
                [ExecutionOrder],
                [ExecutionMode],
                [EnableContextCompression],
                [ContextCompressionMessageThreshold],
                [ContextCompressionPromptID],
                [ContextCompressionMessageRetentionCount],
                [TypeID],
                [Status],
                [DriverClass],
                [IconClass]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @LogoURL,
                @ParentID,
                @ExposeAsAction,
                @ExecutionOrder,
                @ExecutionMode,
                @EnableContextCompression,
                @ContextCompressionMessageThreshold,
                @ContextCompressionPromptID,
                @ContextCompressionMessageRetentionCount,
                @TypeID,
                @Status,
                @DriverClass,
                @IconClass
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgents] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgent] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgent] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: spUpdateAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgent
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIAgent]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgent]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @LogoURL nvarchar(255),
    @ParentID uniqueidentifier,
    @ExposeAsAction bit,
    @ExecutionOrder int,
    @ExecutionMode nvarchar(20),
    @EnableContextCompression bit,
    @ContextCompressionMessageThreshold int,
    @ContextCompressionPromptID uniqueidentifier,
    @ContextCompressionMessageRetentionCount int,
    @TypeID uniqueidentifier,
    @Status nvarchar(20),
    @DriverClass nvarchar(255),
    @IconClass nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgent]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [LogoURL] = @LogoURL,
        [ParentID] = @ParentID,
        [ExposeAsAction] = @ExposeAsAction,
        [ExecutionOrder] = @ExecutionOrder,
        [ExecutionMode] = @ExecutionMode,
        [EnableContextCompression] = @EnableContextCompression,
        [ContextCompressionMessageThreshold] = @ContextCompressionMessageThreshold,
        [ContextCompressionPromptID] = @ContextCompressionPromptID,
        [ContextCompressionMessageRetentionCount] = @ContextCompressionMessageRetentionCount,
        [TypeID] = @TypeID,
        [Status] = @Status,
        [DriverClass] = @DriverClass,
        [IconClass] = @IconClass
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgents]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgent] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgent table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIAgent
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgent
ON [${flyway:defaultSchema}].[AIAgent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgent]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgent] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgent] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: spDeleteAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgent
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIAgent]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgent]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgent]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Integration]
    

/* spDelete Permissions for AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Integration]



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
    @ParentID uniqueidentifier,
    @IconClass nvarchar(100)
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
                [ParentID],
                [IconClass]
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
                @ParentID,
                @IconClass
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
                [ParentID],
                [IconClass]
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
                @ParentID,
                @IconClass
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
    @ParentID uniqueidentifier,
    @IconClass nvarchar(100)
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
        [ParentID] = @ParentID,
        [IconClass] = @IconClass
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





/****************************************************************/
/****************************************************************/
/****************************************************************/
/****************************************************************/
/****************************************************************/
   /** METADATA SYNC PUSH OPERATION **/
/****************************************************************/
/****************************************************************/
/****************************************************************/
/****************************************************************/
/****************************************************************/
/****************************************************************/
-- SQL Logging Session
-- Session ID: c714c885-89fc-4b67-8e81-83d91b26ac92
-- Started: 2025-06-23T18:54:37.073Z
-- Description: MetadataSync Push Operation
-- Generated by MemberJunction SQLServerDataProvider

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '15E03732-607E-4125-86F4-8C846EE88749',
@Name = 'Autotag and Vectorize Content',
@Description = 'Autotag Content and create vectors of the content items that are created.',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__AutotagAndVectorizeContent',
@ParentID = NULL,
@IconClass = 'fa-tag',
@ID = 'D8781B41-9C76-EF11-9C36-000D3A9EBD44';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '65E048AA-5220-4E4D-920A-A3D9349902A7',
@Name = 'Send Single Message',
@Description = 'Sends a single message via the MJ Communication Framework',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__SendSingleMessage',
@ParentID = NULL,
@IconClass = 'fa-envelope',
@ID = 'DC4C7E64-2D93-43E4-9F02-F5D7E702784A';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = 'B51957C7-990F-4CA7-BBFF-93ED507CE466',
@Name = 'Get Weather',
@Description = 'Retrieves current weather information for a specified location using free public weather APIs',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__GetWeather',
@ParentID = NULL,
@IconClass = 'fa-cloud-sun',
@ID = '6C88FED2-679A-4FDD-A31A-7F38D0457F22';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = 'B51957C7-990F-4CA7-BBFF-93ED507CE466',
@Name = 'Get Stock Price',
@Description = 'Retrieves current stock price and related information for a specified ticker symbol',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__GetStockPrice',
@ParentID = NULL,
@IconClass = 'fa-chart-area',
@ID = '296E03AE-6EDC-4C5E-9506-BC98ACCDA2E1';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = 'B51957C7-990F-4CA7-BBFF-93ED507CE466',
@Name = 'Color Converter',
@Description = 'Converts colors between different formats (HEX, RGB, HSL, HSV) and provides color analysis',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__ColorConverter',
@ParentID = NULL,
@IconClass = 'fa-palette',
@ID = 'D402FFD6-C7D1-48AD-A3AC-CF8BEE0A3127';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = 'B51957C7-990F-4CA7-BBFF-93ED507CE466',
@Name = 'Text Analyzer',
@Description = 'Analyzes text content providing statistics, readability scores, and word frequency analysis',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__TextAnalyzer',
@ParentID = NULL,
@IconClass = 'fa-microscope',
@ID = '154255C2-76D4-492C-88D9-C80614EDD703';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = 'E959A850-7842-456D-AB51-F232DF12E709',
@Name = 'Business Days Calculator',
@Description = 'Calculates business days between dates, accounting for weekends and holidays. Can add/subtract business days from a date',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__BusinessDaysCalculator',
@ParentID = NULL,
@IconClass = 'fa-calendar-alt',
@ID = '25A3DA96-66C7-43CE-B39B-DE0D4DD5FFBA';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = 'E959A850-7842-456D-AB51-F232DF12E709',
@Name = 'Census Data Lookup',
@Description = 'Retrieves US Census demographic and economic data for a given ZIP code or city/state location',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__CensusDataLookup',
@ParentID = NULL,
@IconClass = 'fa-users',
@ID = '08E0742A-5DB9-4A5F-BA47-ED39374EE213';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '095EC184-0AAB-4122-A9B9-B64F0215F7DA',
@Name = 'Web Search',
@Description = 'Performs web search using DuckDuckGo''s search API and returns search results with titles, URLs, and snippets',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__WebSearch',
@ParentID = NULL,
@IconClass = 'fa-search',
@ID = '82169F64-8566-4AE7-9C87-190A885C98A9';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '095EC184-0AAB-4122-A9B9-B64F0215F7DA',
@Name = 'Web Page Content',
@Description = 'Retrieves and processes web page content with various output formats including text extraction, HTML parsing, and document conversion',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__WebPageContent',
@ParentID = NULL,
@IconClass = 'fa-globe',
@ID = '81F96534-03F5-49E9-81B0-D8902A7645A3';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '095EC184-0AAB-4122-A9B9-B64F0215F7DA',
@Name = 'URL Link Validator',
@Description = 'Validates URLs by checking accessibility, response codes, and performing health checks with detailed status information',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__URLLinkValidator',
@ParentID = NULL,
@IconClass = 'fa-check-double',
@ID = 'D0FABBEF-C505-446B-B746-B5A38541985A';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '095EC184-0AAB-4122-A9B9-B64F0215F7DA',
@Name = 'URL Metadata Extractor',
@Description = 'Extracts comprehensive metadata from web pages including OpenGraph, Twitter Cards, Schema.org structured data, and standard HTML meta tags',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__URLMetadataExtractor',
@ParentID = NULL,
@IconClass = 'fa-tags',
@ID = 'A2455679-1370-4298-AC9E-0BA48DE2432E';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = 'E959A850-7842-456D-AB51-F232DF12E709',
@Name = 'QR Code',
@Description = 'Generates and reads QR codes with customizable options for size, error correction, and styling',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__QRCode',
@ParentID = NULL,
@IconClass = 'fa-qrcode',
@ID = '2C9DCA8E-76E2-4F01-9A0D-C1678C364FBB';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '0AC137DD-7E2F-4A57-AFE3-688D097B594F',
@Name = 'Create Agent',
@Description = 'Creates a new AI agent with specified configuration. Supports creating both top-level agents and sub-agents. Optionally creates and associates a system prompt if PromptText is provided. Restricted to Agent Manager agent only.',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = 'Create Agent',
@ParentID = NULL,
@IconClass = 'fa-plus-circle',
@ID = 'AD6C84E7-20FF-405D-BD61-24759B2C6700';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '0AC137DD-7E2F-4A57-AFE3-688D097B594F',
@Name = 'Update Agent',
@Description = 'Updates an existing AI agent''s configuration. Optionally updates the agent''s prompt text if provided. Restricted to Agent Manager agent only.',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = 'Update Agent',
@ParentID = NULL,
@IconClass = 'fa-pen',
@ID = 'DA51A9CA-F7FA-40DC-85D1-556A178E1E4E';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '0AC137DD-7E2F-4A57-AFE3-688D097B594F',
@Name = 'List Agents',
@Description = 'Lists AI agents with optional filtering. Restricted to Agent Manager agent only.',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = 'List Agents',
@ParentID = NULL,
@IconClass = 'fa-list',
@ID = '63498D60-8EA5-4C8E-8D82-3E190D6CE078';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '0AC137DD-7E2F-4A57-AFE3-688D097B594F',
@Name = 'Deactivate Agent',
@Description = 'Marks an agent as inactive (soft delete). Restricted to Agent Manager agent only.',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__DeactivateAgent',
@ParentID = NULL,
@IconClass = 'fa-power-off',
@ID = '14A913E6-D6D7-4A03-B7E6-55C782D1ECA3';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '0AC137DD-7E2F-4A57-AFE3-688D097B594F',
@Name = 'Associate Action With Agent',
@Description = 'Associates an action with an agent. Restricted to Agent Manager agent only.',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = 'Associate Action With Agent',
@ParentID = NULL,
@IconClass = 'fa-link',
@ID = '9C4674A4-154D-455D-882F-5894B17B4BF8';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '0AC137DD-7E2F-4A57-AFE3-688D097B594F',
@Name = 'Create Sub Agent',
@Description = 'Creates a new agent as a child of another agent. Optionally creates and associates a system prompt if PromptText is provided. Restricted to Agent Manager agent only.',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = 'Create Sub Agent',
@ParentID = NULL,
@IconClass = 'fa-plus-square',
@ID = 'BEC27BD2-6008-46E8-9A8E-204772DF2517';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '0AC137DD-7E2F-4A57-AFE3-688D097B594F',
@Name = 'Set Agent Prompt',
@Description = 'Associates or updates a prompt for an agent. Restricted to Agent Manager agent only.',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__SetAgentPrompt',
@ParentID = NULL,
@IconClass = 'fa-comment-dots',
@ID = '00A65017-2C4A-420D-9043-F7E4AC5A35C4';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '0AC137DD-7E2F-4A57-AFE3-688D097B594F',
@Name = 'Validate Agent Configuration',
@Description = 'Validates that an agent has all required prompts and actions configured. Restricted to Agent Manager agent only.',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__ValidateAgentConfiguration',
@ParentID = NULL,
@IconClass = 'fa-check-circle',
@ID = '5D2C0B7D-93A0-42A1-B0EB-CDC5E60F090E';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '0AC137DD-7E2F-4A57-AFE3-688D097B594F',
@Name = 'Export Agent Bundle',
@Description = 'Exports an agent with all sub-agents and configurations as metadata. Restricted to Agent Manager agent only.',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__ExportAgentBundle',
@ParentID = NULL,
@IconClass = 'fa-download',
@ID = '85F25A20-B62C-4BF2-9767-287105EC299C';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '0AC137DD-7E2F-4A57-AFE3-688D097B594F',
@Name = 'List Actions',
@Description = 'Lists available actions that can be associated with agents. Used by Planning Designer Agent.',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = 'List Actions',
@ParentID = NULL,
@IconClass = 'fa-th-list',
@ID = '05A12211-BDF9-420B-BC6F-0BEFFF7654DD';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '0AC137DD-7E2F-4A57-AFE3-688D097B594F',
@Name = 'Get Agent Details',
@Description = 'Gets detailed information about a specific agent including its full hierarchy (sub-agents, sub-sub-agents, etc.) and associated actions at each level. Restricted to Agent Manager agent only.',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = 'Get Agent Details',
@ParentID = NULL,
@IconClass = 'fa-info-circle',
@ID = 'AF87C1F0-C94D-4A99-97A4-9638C56536DC';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '0AC137DD-7E2F-4A57-AFE3-688D097B594F',
@Name = 'Get Action Details',
@Description = 'Gets detailed information about a specific action including all metadata, parameters, and result codes. Restricted to Agent Manager agent only.',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = 'Get Action Details',
@ParentID = NULL,
@IconClass = 'fa-info',
@ID = 'CA8DBEE4-2A48-4F0A-B74D-A200671EBE68';

GO

-- Save Template Contents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateTemplateContent @TemplateID = '33AF5671-077E-46A9-94AB-340783733024',
@TypeID = 'E7AFCCEC-6A37-EF11-86D4-000D3A4E707E',
@TemplateText = 'You are an expert at parsing Nunjucks templates. Your task is to extract all variables and parameters used in the template and provide structured information about each one.

## Template to Analyze:
{{ templateText }}

## Instructions:
Identify ALL variables used in the template, including:
1. Simple variables: {% raw %}{{ variableName }}{% endraw %}
2. Object properties: {% raw %}{{ user.email }}{% endraw %}, {% raw %}{{ data.items[0].name }}{% endraw %}
3. Variables in conditionals: {% raw %}{% if isActive %}{% endraw %}, {% raw %}{% if user.role == "admin" %}{% endraw %}
4. Loop variables: {% raw %}{% for item in items %}{% endraw %}, {% raw %}{% for key, value in object %}{% endraw %}
5. Variables in filters: {% raw %}{{ name | default(userName) }}{% endraw %}
6. Variables in function calls: {% raw %}{{ formatDate(createdAt) }}{% endraw %}
7. Variables in assignments: {% raw %}{% set total = price * quantity %}{% endraw %}

## **IMPORTANT** 
Do NOT include variables that are shown within {% raw %}{% raw %}{% endraw %}{% endraw %} blocks, those are for illustrative purposes and part of an illustration of what another template might have. Only consider variables that are **NOT** part of raw blocks to be valid for the purpose of this request.

For nested object references (like user.email), extract only the TOP-LEVEL variable name (user).

## Output Format: 
Return a JSON array of parameter objects with this structure:

```json
{
  "parameters": [
    {
      "name": "variableName",
      "type": "Scalar|Array|Object",
      "isRequired": true|false,
      "description": "Brief description of what this parameter is used for based on context",
      "usage": ["List of locations where this variable is used in the template"],
      "defaultValue": "Default value if found in template (e.g., from default filter)"
    }
  ]
}
```

## Rules:
1. Only include each variable ONCE (deduplicate)
2. Ignore Nunjucks built-in variables (loop, super, etc.)
3. For type detection:
   - If used in {% raw %}{% for x in variable %}{% endraw %} → type is "Array"
   - If properties are accessed (variable.property) → type is "Object"
   - Otherwise → type is "Scalar"
4. A variable is required if it has no default and no conditional protection
5. Include meaningful descriptions based on usage context
6. Sort parameters alphabetically by name

## Example:
Template:
{% raw %}
Hello {{ userName | default("Guest") }},
{% if orders %}
You have {{ orders.length }} orders.
{% for order in orders %}
- Order #{{ order.id }}: {{ order.total }}
{% endfor %}
{% endif %}
{% endraw %}

Output:
```json
{
  "parameters": [
    {
      "name": "orders",
      "type": "Array",
      "isRequired": false,
      "description": "List of user orders with id and total properties",
      "usage": ["if condition line 2", "for loop line 4", "length property line 3"],
      "defaultValue": null
    },
    {
      "name": "userName",
      "type": "Scalar",
      "isRequired": false,
      "description": "Name of the user to greet",
      "usage": ["greeting line 1"],
      "defaultValue": "Guest"
    }
  ]
}
```',
@Priority = 1,
@IsActive = 1,
@ID = '87E7401E-1AB6-4A41-A257-20ED3AE2CDA5';

GO

-- Save MJ: AI Prompt Models (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIPromptModel @PromptID = '96BCAE1C-B1F0-4FC4-9988-54B067BC962A',
@ModelID = 'C496B988-4EA4-4D7E-A6DD-255F56D93933',
@VendorID = 'E3A5CCEC-6A37-EF11-86D4-000D3A4E707E',
@ConfigurationID = NULL,
@Priority = 11,
@ExecutionGroup = 0,
@ModelParameters = NULL,
@Status = 'Active',
@ParallelizationMode = 'None',
@ParallelCount = 1,
@ParallelConfigParam = NULL,
@ID = '7AB18736-0371-41F8-8408-46903C1B3ECC';

GO

-- Save MJ: AI Prompt Models (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIPromptModel @PromptID = '96BCAE1C-B1F0-4FC4-9988-54B067BC962A',
@ModelID = '287E317F-BF26-F011-A770-AC1A3D21423D',
@VendorID = 'D8A5CCEC-6A37-EF11-86D4-000D3A4E707E',
@ConfigurationID = NULL,
@Priority = 10,
@ExecutionGroup = 0,
@ModelParameters = NULL,
@Status = 'Active',
@ParallelizationMode = 'None',
@ParallelCount = 1,
@ParallelConfigParam = NULL,
@ID = '3BF5F393-10C4-4470-8783-2131F18E4196';

GO

-- Save AI Agents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIAgent @Name = 'Demo Loop Agent',
@Description = 'Simple Agent Demo! This agent demonstrates the basic functionality of a loop agent, capable of executing multiple actions in paralell with no determined path - the AI determines the pathway.',
@LogoURL = NULL,
@ParentID = NULL,
@ExposeAsAction = 1,
@ExecutionOrder = 0,
@ExecutionMode = 'Sequential',
@EnableContextCompression = 0,
@ContextCompressionMessageThreshold = NULL,
@ContextCompressionPromptID = NULL,
@ContextCompressionMessageRetentionCount = NULL,
@TypeID = 'F7926101-5099-4FA5-836A-479D9707C818',
@Status = 'Active',
@DriverClass = NULL,
@IconClass = 'fa-infinity',
@ID = '55399C30-C59B-47D2-A856-640DA89C46E4';

GO

-- Save AI Agents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIAgent @Name = 'Marketing Agent',
@Description = 'Strategic orchestrator for marketing content creation workflows, managing sub-agents to deliver high-quality marketing materials.',
@LogoURL = NULL,
@ParentID = NULL,
@ExposeAsAction = 1,
@ExecutionOrder = 1,
@ExecutionMode = 'Sequential',
@EnableContextCompression = 0,
@ContextCompressionMessageThreshold = NULL,
@ContextCompressionPromptID = NULL,
@ContextCompressionMessageRetentionCount = NULL,
@TypeID = 'F7926101-5099-4FA5-836A-479D9707C818',
@Status = 'Active',
@DriverClass = NULL,
@IconClass = 'fa-bullhorn',
@ID = '4A7B4F1D-C536-409F-9206-F36FDEE64EDF';

GO

-- Save AI Agents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIAgent @Name = 'Copywriter Agent',
@Description = 'Creative wordsmith specializing in crafting compelling initial drafts of marketing content with persuasive messaging.',
@LogoURL = NULL,
@ParentID = '4A7B4F1D-C536-409F-9206-F36FDEE64EDF',
@ExposeAsAction = 0,
@ExecutionOrder = 1,
@ExecutionMode = 'Sequential',
@EnableContextCompression = 0,
@ContextCompressionMessageThreshold = NULL,
@ContextCompressionPromptID = NULL,
@ContextCompressionMessageRetentionCount = NULL,
@TypeID = 'F7926101-5099-4FA5-836A-479D9707C818',
@Status = 'Active',
@DriverClass = NULL,
@IconClass = 'fa-feather',
@ID = '8A322A1B-27EE-4A89-A6C4-A47C856E5842';

GO

-- Save AI Agents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIAgent @Name = 'SEO AIEO Specialist Agent',
@Description = 'Expert in optimizing content for both traditional search engines and AI-powered discovery platforms.',
@LogoURL = NULL,
@ParentID = '4A7B4F1D-C536-409F-9206-F36FDEE64EDF',
@ExposeAsAction = 0,
@ExecutionOrder = 1,
@ExecutionMode = 'Sequential',
@EnableContextCompression = 0,
@ContextCompressionMessageThreshold = NULL,
@ContextCompressionPromptID = NULL,
@ContextCompressionMessageRetentionCount = NULL,
@TypeID = 'F7926101-5099-4FA5-836A-479D9707C818',
@Status = 'Active',
@DriverClass = NULL,
@IconClass = 'fa-chart-line',
@ID = '62CF643B-18E5-4C3B-BD0A-B3206E87BCE8';

GO

-- Save AI Agents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIAgent @Name = 'Editor Agent',
@Description = 'Meticulous content professional ensuring quality, accuracy, and effectiveness of all marketing materials.',
@LogoURL = NULL,
@ParentID = '4A7B4F1D-C536-409F-9206-F36FDEE64EDF',
@ExposeAsAction = 0,
@ExecutionOrder = 1,
@ExecutionMode = 'Sequential',
@EnableContextCompression = 0,
@ContextCompressionMessageThreshold = NULL,
@ContextCompressionPromptID = NULL,
@ContextCompressionMessageRetentionCount = NULL,
@TypeID = 'F7926101-5099-4FA5-836A-479D9707C818',
@Status = 'Active',
@DriverClass = NULL,
@IconClass = 'fa-edit',
@ID = '383FA7A1-E654-4D65-BC88-6CFE1C90086E';

GO

-- Save AI Agents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIAgent @Name = 'Brand Guardian Agent',
@Description = 'Final checkpoint ensuring all marketing content aligns with brand values, voice, and visual identity.',
@LogoURL = NULL,
@ParentID = '4A7B4F1D-C536-409F-9206-F36FDEE64EDF',
@ExposeAsAction = 0,
@ExecutionOrder = 1,
@ExecutionMode = 'Sequential',
@EnableContextCompression = 0,
@ContextCompressionMessageThreshold = NULL,
@ContextCompressionPromptID = NULL,
@ContextCompressionMessageRetentionCount = NULL,
@TypeID = 'F7926101-5099-4FA5-836A-479D9707C818',
@Status = 'Active',
@DriverClass = NULL,
@IconClass = 'fa-shield-alt',
@ID = '414901EA-0BAE-43C1-9B9F-0A6B48B6B768';

GO

-- Save AI Agents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIAgent @Name = 'Publisher Agent',
@Description = 'Handles final content distribution with platform-specific optimization (publishing tools under development).',
@LogoURL = NULL,
@ParentID = '4A7B4F1D-C536-409F-9206-F36FDEE64EDF',
@ExposeAsAction = 0,
@ExecutionOrder = 1,
@ExecutionMode = 'Sequential',
@EnableContextCompression = 0,
@ContextCompressionMessageThreshold = NULL,
@ContextCompressionPromptID = NULL,
@ContextCompressionMessageRetentionCount = NULL,
@TypeID = 'F7926101-5099-4FA5-836A-479D9707C818',
@Status = 'Active',
@DriverClass = NULL,
@IconClass = 'fa-paper-plane',
@ID = '6AD5B39D-CC3B-45E3-90F2-A00E2BC42E6D';

GO

-- Save AI Agents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIAgent @Name = 'Agent Manager',
@Description = 'Top-level orchestrator agent responsible for creating, editing, and managing other AI agents in the MemberJunction system. Uses specialized sub-agents to gather requirements, design architecture, and craft prompts.',
@LogoURL = NULL,
@ParentID = NULL,
@ExposeAsAction = 1,
@ExecutionOrder = 0,
@ExecutionMode = 'Sequential',
@EnableContextCompression = 0,
@ContextCompressionMessageThreshold = NULL,
@ContextCompressionPromptID = NULL,
@ContextCompressionMessageRetentionCount = NULL,
@TypeID = 'F7926101-5099-4FA5-836A-479D9707C818',
@Status = 'Active',
@DriverClass = NULL,
@IconClass = 'fa-robot',
@ID = 'E1691AE0-00BB-4414-A74D-F7F36D348A06';

GO

-- Save AI Agent Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spCreateAIAgentAction @ID = '9e6e5ca6-f357-45e0-b8fa-05a4e1967ea2',
@AgentID = 'E1691AE0-00BB-4414-A74D-F7F36D348A06',
@ActionID = '05A12211-BDF9-420B-BC6F-0BEFFF7654DD',
@Status = 'Active';

GO

-- Save AI Agent Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spCreateAIAgentAction @ID = 'cdad6d7f-a1a2-40e4-a34c-a133b6dcba1e',
@AgentID = 'E1691AE0-00BB-4414-A74D-F7F36D348A06',
@ActionID = '82169F64-8566-4AE7-9C87-190A885C98A9',
@Status = 'Active';

GO

-- Save AI Agent Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spCreateAIAgentAction @ID = 'b9848425-ae9e-4d55-944d-721a2d3bea06',
@AgentID = 'E1691AE0-00BB-4414-A74D-F7F36D348A06',
@ActionID = '154255C2-76D4-492C-88D9-C80614EDD703',
@Status = 'Active';

GO

-- Save AI Agent Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spCreateAIAgentAction @ID = 'd9c16645-1c1b-4b2f-ab38-c6bd00f2eff6',
@AgentID = 'E1691AE0-00BB-4414-A74D-F7F36D348A06',
@ActionID = '81F96534-03F5-49E9-81B0-D8902A7645A3',
@Status = 'Active';

GO

-- Save AI Agents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIAgent @Name = 'Requirements Analyst Agent',
@Description = 'MBA-type business analyst with technical expertise, specialized in gathering and clarifying detailed requirements through iterative conversations. Ensures clear definition of agent objectives before design begins.',
@LogoURL = NULL,
@ParentID = 'E1691AE0-00BB-4414-A74D-F7F36D348A06',
@ExposeAsAction = 0,
@ExecutionOrder = 1,
@ExecutionMode = 'Sequential',
@EnableContextCompression = 0,
@ContextCompressionMessageThreshold = NULL,
@ContextCompressionPromptID = NULL,
@ContextCompressionMessageRetentionCount = NULL,
@TypeID = 'F7926101-5099-4FA5-836A-479D9707C818',
@Status = 'Active',
@DriverClass = NULL,
@IconClass = 'fa-clipboard-list',
@ID = 'A15E6AC3-CE68-4D08-A52A-505019BB2099';

GO

-- Save AI Agent Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spCreateAIAgentAction @ID = '2ea67fad-e5f5-45b7-9cb0-574f2084ad55',
@AgentID = 'A15E6AC3-CE68-4D08-A52A-505019BB2099',
@ActionID = '05A12211-BDF9-420B-BC6F-0BEFFF7654DD',
@Status = 'Active';

GO

-- Save AI Agent Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spCreateAIAgentAction @ID = '80761138-b0da-4a63-94b4-ec89b45e6f2e',
@AgentID = 'A15E6AC3-CE68-4D08-A52A-505019BB2099',
@ActionID = '82169F64-8566-4AE7-9C87-190A885C98A9',
@Status = 'Active';

GO

-- Save AI Agent Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spCreateAIAgentAction @ID = 'c34dcd7b-1172-4eeb-96ff-6f91bccef826',
@AgentID = 'A15E6AC3-CE68-4D08-A52A-505019BB2099',
@ActionID = '81F96534-03F5-49E9-81B0-D8902A7645A3',
@Status = 'Active';

GO

-- Save AI Agents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIAgent @Name = 'Planning Designer Agent',
@Description = 'System architect specialized in designing agent hierarchies, selecting appropriate actions from the library, and creating optimal agent structures based on requirements.',
@LogoURL = NULL,
@ParentID = 'E1691AE0-00BB-4414-A74D-F7F36D348A06',
@ExposeAsAction = 0,
@ExecutionOrder = 2,
@ExecutionMode = 'Sequential',
@EnableContextCompression = 0,
@ContextCompressionMessageThreshold = NULL,
@ContextCompressionPromptID = NULL,
@ContextCompressionMessageRetentionCount = NULL,
@TypeID = 'F7926101-5099-4FA5-836A-479D9707C818',
@Status = 'Active',
@DriverClass = NULL,
@IconClass = 'fa-sitemap',
@ID = '644674DB-7791-44C4-8360-3914111C0E10';

GO

-- Save AI Agent Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spCreateAIAgentAction @ID = 'ab097138-fc39-439b-add4-ea0a8f7bbb24',
@AgentID = '644674DB-7791-44C4-8360-3914111C0E10',
@ActionID = '154255C2-76D4-492C-88D9-C80614EDD703',
@Status = 'Active';

GO

-- Save AI Agent Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spCreateAIAgentAction @ID = '658b7296-90d7-4c2f-beff-1485e981e46b',
@AgentID = '644674DB-7791-44C4-8360-3914111C0E10',
@ActionID = '82169F64-8566-4AE7-9C87-190A885C98A9',
@Status = 'Active';

GO

-- Save AI Agent Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spCreateAIAgentAction @ID = '11b2d45a-fd00-47b1-bf61-62b9f9d27f91',
@AgentID = '644674DB-7791-44C4-8360-3914111C0E10',
@ActionID = '81F96534-03F5-49E9-81B0-D8902A7645A3',
@Status = 'Active';

GO

-- Save AI Agents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIAgent @Name = 'Prompt Designer Agent',
@Description = 'Expert prompt engineer specialized in crafting high-quality, effective prompts for AI agents. Creates system prompts that leverage agent type control structures and business logic.',
@LogoURL = NULL,
@ParentID = 'E1691AE0-00BB-4414-A74D-F7F36D348A06',
@ExposeAsAction = 0,
@ExecutionOrder = 3,
@ExecutionMode = 'Sequential',
@EnableContextCompression = 0,
@ContextCompressionMessageThreshold = NULL,
@ContextCompressionPromptID = NULL,
@ContextCompressionMessageRetentionCount = NULL,
@TypeID = 'F7926101-5099-4FA5-836A-479D9707C818',
@Status = 'Active',
@DriverClass = NULL,
@IconClass = 'fa-pen-fancy',
@ID = '82323658-FD6D-4F06-BAE5-39A0945C9DC0';

GO

-- Save AI Agent Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spCreateAIAgentAction @ID = '0a8acfee-6c1e-448b-857e-4f027e1a45cd',
@AgentID = '82323658-FD6D-4F06-BAE5-39A0945C9DC0',
@ActionID = '05A12211-BDF9-420B-BC6F-0BEFFF7654DD',
@Status = 'Active';

GO

-- Save AI Agent Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spCreateAIAgentAction @ID = '5a60fae6-500f-4e3c-98c9-47cdbe4db1e8',
@AgentID = '82323658-FD6D-4F06-BAE5-39A0945C9DC0',
@ActionID = '82169F64-8566-4AE7-9C87-190A885C98A9',
@Status = 'Active';

GO

-- Save AI Agent Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spCreateAIAgentAction @ID = 'c5d131bd-064f-497d-ad70-461f6a626573',
@AgentID = '82323658-FD6D-4F06-BAE5-39A0945C9DC0',
@ActionID = '81F96534-03F5-49E9-81B0-D8902A7645A3',
@Status = 'Active';

GO


-- End of SQL Logging Session
-- Session ID: c714c885-89fc-4b67-8e81-83d91b26ac92
-- Completed: 2025-06-23T18:54:44.128Z
-- Duration: 7055ms
-- Total Statements: 52


-- SQL Logging Session
-- Session ID: 1aa3fa63-f184-4ad1-a10d-2db06a35c323
-- Started: 2025-06-23T19:20:30.598Z
-- Description: MetadataSync Push Operation
-- Generated by MemberJunction SQLServerDataProvider

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '15E03732-607E-4125-86F4-8C846EE88749',
@Name = 'Autotag and Vectorize Content',
@Description = 'Autotag Content and create vectors of the content items that are created.',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__AutotagAndVectorizeContent',
@ParentID = NULL,
@IconClass = 'fa-solid fa-tag',
@ID = 'D8781B41-9C76-EF11-9C36-000D3A9EBD44';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '65E048AA-5220-4E4D-920A-A3D9349902A7',
@Name = 'Send Single Message',
@Description = 'Sends a single message via the MJ Communication Framework',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__SendSingleMessage',
@ParentID = NULL,
@IconClass = 'fa-solid fa-envelope',
@ID = 'DC4C7E64-2D93-43E4-9F02-F5D7E702784A';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = 'B51957C7-990F-4CA7-BBFF-93ED507CE466',
@Name = 'Get Weather',
@Description = 'Retrieves current weather information for a specified location using free public weather APIs',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__GetWeather',
@ParentID = NULL,
@IconClass = 'fa-solid fa-cloud-sun',
@ID = '6C88FED2-679A-4FDD-A31A-7F38D0457F22';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = 'B51957C7-990F-4CA7-BBFF-93ED507CE466',
@Name = 'Get Stock Price',
@Description = 'Retrieves current stock price and related information for a specified ticker symbol',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__GetStockPrice',
@ParentID = NULL,
@IconClass = 'fa-solid fa-chart-area',
@ID = '296E03AE-6EDC-4C5E-9506-BC98ACCDA2E1';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = 'B51957C7-990F-4CA7-BBFF-93ED507CE466',
@Name = 'Color Converter',
@Description = 'Converts colors between different formats (HEX, RGB, HSL, HSV) and provides color analysis',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__ColorConverter',
@ParentID = NULL,
@IconClass = 'fa-solid fa-palette',
@ID = 'D402FFD6-C7D1-48AD-A3AC-CF8BEE0A3127';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = 'B51957C7-990F-4CA7-BBFF-93ED507CE466',
@Name = 'Text Analyzer',
@Description = 'Analyzes text content providing statistics, readability scores, and word frequency analysis',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__TextAnalyzer',
@ParentID = NULL,
@IconClass = 'fa-solid fa-microscope',
@ID = '154255C2-76D4-492C-88D9-C80614EDD703';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = 'E959A850-7842-456D-AB51-F232DF12E709',
@Name = 'Business Days Calculator',
@Description = 'Calculates business days between dates, accounting for weekends and holidays. Can add/subtract business days from a date',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__BusinessDaysCalculator',
@ParentID = NULL,
@IconClass = 'fa-solid fa-calendar-alt',
@ID = '25A3DA96-66C7-43CE-B39B-DE0D4DD5FFBA';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = 'E959A850-7842-456D-AB51-F232DF12E709',
@Name = 'Census Data Lookup',
@Description = 'Retrieves US Census demographic and economic data for a given ZIP code or city/state location',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__CensusDataLookup',
@ParentID = NULL,
@IconClass = 'fa-solid fa-users',
@ID = '08E0742A-5DB9-4A5F-BA47-ED39374EE213';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '095EC184-0AAB-4122-A9B9-B64F0215F7DA',
@Name = 'Web Search',
@Description = 'Performs web search using DuckDuckGo''s search API and returns search results with titles, URLs, and snippets',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__WebSearch',
@ParentID = NULL,
@IconClass = 'fa-solid fa-search',
@ID = '82169F64-8566-4AE7-9C87-190A885C98A9';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '095EC184-0AAB-4122-A9B9-B64F0215F7DA',
@Name = 'Web Page Content',
@Description = 'Retrieves and processes web page content with various output formats including text extraction, HTML parsing, and document conversion',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__WebPageContent',
@ParentID = NULL,
@IconClass = 'fa-solid fa-globe',
@ID = '81F96534-03F5-49E9-81B0-D8902A7645A3';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '095EC184-0AAB-4122-A9B9-B64F0215F7DA',
@Name = 'URL Link Validator',
@Description = 'Validates URLs by checking accessibility, response codes, and performing health checks with detailed status information',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__URLLinkValidator',
@ParentID = NULL,
@IconClass = 'fa-solid fa-check-double',
@ID = 'D0FABBEF-C505-446B-B746-B5A38541985A';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '095EC184-0AAB-4122-A9B9-B64F0215F7DA',
@Name = 'URL Metadata Extractor',
@Description = 'Extracts comprehensive metadata from web pages including OpenGraph, Twitter Cards, Schema.org structured data, and standard HTML meta tags',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__URLMetadataExtractor',
@ParentID = NULL,
@IconClass = 'fa-solid fa-tags',
@ID = 'A2455679-1370-4298-AC9E-0BA48DE2432E';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = 'E959A850-7842-456D-AB51-F232DF12E709',
@Name = 'QR Code',
@Description = 'Generates and reads QR codes with customizable options for size, error correction, and styling',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__QRCode',
@ParentID = NULL,
@IconClass = 'fa-solid fa-qrcode',
@ID = '2C9DCA8E-76E2-4F01-9A0D-C1678C364FBB';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '0AC137DD-7E2F-4A57-AFE3-688D097B594F',
@Name = 'Create Agent',
@Description = 'Creates a new AI agent with specified configuration. Supports creating both top-level agents and sub-agents. Optionally creates and associates a system prompt if PromptText is provided. Restricted to Agent Manager agent only.',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = 'Create Agent',
@ParentID = NULL,
@IconClass = 'fa-solid fa-plus-circle',
@ID = 'AD6C84E7-20FF-405D-BD61-24759B2C6700';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '0AC137DD-7E2F-4A57-AFE3-688D097B594F',
@Name = 'Update Agent',
@Description = 'Updates an existing AI agent''s configuration. Optionally updates the agent''s prompt text if provided. Restricted to Agent Manager agent only.',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = 'Update Agent',
@ParentID = NULL,
@IconClass = 'fa-solid fa-pen',
@ID = 'DA51A9CA-F7FA-40DC-85D1-556A178E1E4E';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '0AC137DD-7E2F-4A57-AFE3-688D097B594F',
@Name = 'List Agents',
@Description = 'Lists AI agents with optional filtering. Restricted to Agent Manager agent only.',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = 'List Agents',
@ParentID = NULL,
@IconClass = 'fa-solid fa-list',
@ID = '63498D60-8EA5-4C8E-8D82-3E190D6CE078';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '0AC137DD-7E2F-4A57-AFE3-688D097B594F',
@Name = 'Deactivate Agent',
@Description = 'Marks an agent as inactive (soft delete). Restricted to Agent Manager agent only.',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__DeactivateAgent',
@ParentID = NULL,
@IconClass = 'fa-solid fa-power-off',
@ID = '14A913E6-D6D7-4A03-B7E6-55C782D1ECA3';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '0AC137DD-7E2F-4A57-AFE3-688D097B594F',
@Name = 'Associate Action With Agent',
@Description = 'Associates an action with an agent. Restricted to Agent Manager agent only.',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = 'Associate Action With Agent',
@ParentID = NULL,
@IconClass = 'fa-solid fa-link',
@ID = '9C4674A4-154D-455D-882F-5894B17B4BF8';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '0AC137DD-7E2F-4A57-AFE3-688D097B594F',
@Name = 'Create Sub Agent',
@Description = 'Creates a new agent as a child of another agent. Optionally creates and associates a system prompt if PromptText is provided. Restricted to Agent Manager agent only.',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = 'Create Sub Agent',
@ParentID = NULL,
@IconClass = 'fa-solid fa-plus-square',
@ID = 'BEC27BD2-6008-46E8-9A8E-204772DF2517';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '0AC137DD-7E2F-4A57-AFE3-688D097B594F',
@Name = 'Set Agent Prompt',
@Description = 'Associates or updates a prompt for an agent. Restricted to Agent Manager agent only.',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__SetAgentPrompt',
@ParentID = NULL,
@IconClass = 'fa-solid fa-comment-dots',
@ID = '00A65017-2C4A-420D-9043-F7E4AC5A35C4';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '0AC137DD-7E2F-4A57-AFE3-688D097B594F',
@Name = 'Validate Agent Configuration',
@Description = 'Validates that an agent has all required prompts and actions configured. Restricted to Agent Manager agent only.',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__ValidateAgentConfiguration',
@ParentID = NULL,
@IconClass = 'fa-solid fa-check-circle',
@ID = '5D2C0B7D-93A0-42A1-B0EB-CDC5E60F090E';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '0AC137DD-7E2F-4A57-AFE3-688D097B594F',
@Name = 'Export Agent Bundle',
@Description = 'Exports an agent with all sub-agents and configurations as metadata. Restricted to Agent Manager agent only.',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = '__ExportAgentBundle',
@ParentID = NULL,
@IconClass = 'fa-solid fa-download',
@ID = '85F25A20-B62C-4BF2-9767-287105EC299C';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '0AC137DD-7E2F-4A57-AFE3-688D097B594F',
@Name = 'List Actions',
@Description = 'Lists available actions that can be associated with agents. Used by Planning Designer Agent.',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = 'List Actions',
@ParentID = NULL,
@IconClass = 'fa-solid fa-th-list',
@ID = '05A12211-BDF9-420B-BC6F-0BEFFF7654DD';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '0AC137DD-7E2F-4A57-AFE3-688D097B594F',
@Name = 'Get Agent Details',
@Description = 'Gets detailed information about a specific agent including its full hierarchy (sub-agents, sub-sub-agents, etc.) and associated actions at each level. Restricted to Agent Manager agent only.',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = 'Get Agent Details',
@ParentID = NULL,
@IconClass = 'fa-solid fa-info-circle',
@ID = 'AF87C1F0-C94D-4A99-97A4-9638C56536DC';

GO

-- Save Actions (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = '0AC137DD-7E2F-4A57-AFE3-688D097B594F',
@Name = 'Get Action Details',
@Description = 'Gets detailed information about a specific action including all metadata, parameters, and result codes. Restricted to Agent Manager agent only.',
@Type = 'Custom',
@UserPrompt = NULL,
@UserComments = NULL,
@Code = NULL,
@CodeComments = NULL,
@CodeApprovalStatus = 'Pending',
@CodeApprovalComments = NULL,
@CodeApprovedByUserID = NULL,
@CodeApprovedAt = NULL,
@CodeLocked = 0,
@ForceCodeGeneration = 0,
@RetentionPeriod = NULL,
@Status = 'Active',
@DriverClass = 'Get Action Details',
@ParentID = NULL,
@IconClass = 'fa-solid fa-info',
@ID = 'CA8DBEE4-2A48-4F0A-B74D-A200671EBE68';

GO

-- Save Template Contents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateTemplateContent @TemplateID = '33AF5671-077E-46A9-94AB-340783733024',
@TypeID = 'E7AFCCEC-6A37-EF11-86D4-000D3A4E707E',
@TemplateText = 'You are an expert at parsing Nunjucks templates. Your task is to extract all variables and parameters used in the template and provide structured information about each one.

## Template to Analyze:
{{ templateText }}

## Instructions:
Identify ALL variables used in the template, including:
1. Simple variables: {% raw %}{{ variableName }}{% endraw %}
2. Object properties: {% raw %}{{ user.email }}{% endraw %}, {% raw %}{{ data.items[0].name }}{% endraw %}
3. Variables in conditionals: {% raw %}{% if isActive %}{% endraw %}, {% raw %}{% if user.role == "admin" %}{% endraw %}
4. Loop variables: {% raw %}{% for item in items %}{% endraw %}, {% raw %}{% for key, value in object %}{% endraw %}
5. Variables in filters: {% raw %}{{ name | default(userName) }}{% endraw %}
6. Variables in function calls: {% raw %}{{ formatDate(createdAt) }}{% endraw %}
7. Variables in assignments: {% raw %}{% set total = price * quantity %}{% endraw %}

## **IMPORTANT** 
Do NOT include variables that are shown within {% raw %}{% raw %}{% endraw %}{% endraw %} blocks, those are for illustrative purposes and part of an illustration of what another template might have. Only consider variables that are **NOT** part of raw blocks to be valid for the purpose of this request.

For nested object references (like user.email), extract only the TOP-LEVEL variable name (user).

## Output Format: 
Return a JSON array of parameter objects with this structure:

```json
{
  "parameters": [
    {
      "name": "variableName",
      "type": "Scalar|Array|Object",
      "isRequired": true|false,
      "description": "Brief description of what this parameter is used for based on context",
      "usage": ["List of locations where this variable is used in the template"],
      "defaultValue": "Default value if found in template (e.g., from default filter)"
    }
  ]
}
```

## Rules:
1. Only include each variable ONCE (deduplicate)
2. Ignore Nunjucks built-in variables (loop, super, etc.)
3. For type detection:
   - If used in {% raw %}{% for x in variable %}{% endraw %} → type is "Array"
   - If properties are accessed (variable.property) → type is "Object"
   - Otherwise → type is "Scalar"
4. A variable is required if it has no default and no conditional protection
5. Include meaningful descriptions based on usage context
6. Sort parameters alphabetically by name

## Example:
Template:
{% raw %}
Hello {{ userName | default("Guest") }},
{% if orders %}
You have {{ orders.length }} orders.
{% for order in orders %}
- Order #{{ order.id }}: {{ order.total }}
{% endfor %}
{% endif %}
{% endraw %}

Output:
```json
{
  "parameters": [
    {
      "name": "orders",
      "type": "Array",
      "isRequired": false,
      "description": "List of user orders with id and total properties",
      "usage": ["if condition line 2", "for loop line 4", "length property line 3"],
      "defaultValue": null
    },
    {
      "name": "userName",
      "type": "Scalar",
      "isRequired": false,
      "description": "Name of the user to greet",
      "usage": ["greeting line 1"],
      "defaultValue": "Guest"
    }
  ]
}
```',
@Priority = 1,
@IsActive = 1,
@ID = '87E7401E-1AB6-4A41-A257-20ED3AE2CDA5';

GO

-- Save AI Agents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIAgent @Name = 'Demo Loop Agent',
@Description = 'Simple Agent Demo! This agent demonstrates the basic functionality of a loop agent, capable of executing multiple actions in paralell with no determined path - the AI determines the pathway.',
@LogoURL = NULL,
@ParentID = NULL,
@ExposeAsAction = 1,
@ExecutionOrder = 0,
@ExecutionMode = 'Sequential',
@EnableContextCompression = 0,
@ContextCompressionMessageThreshold = NULL,
@ContextCompressionPromptID = NULL,
@ContextCompressionMessageRetentionCount = NULL,
@TypeID = 'F7926101-5099-4FA5-836A-479D9707C818',
@Status = 'Active',
@DriverClass = NULL,
@IconClass = 'fa-solid fa-infinity',
@ID = '55399C30-C59B-47D2-A856-640DA89C46E4';

GO

-- Save AI Agents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIAgent @Name = 'Marketing Agent',
@Description = 'Strategic orchestrator for marketing content creation workflows, managing sub-agents to deliver high-quality marketing materials.',
@LogoURL = NULL,
@ParentID = NULL,
@ExposeAsAction = 1,
@ExecutionOrder = 1,
@ExecutionMode = 'Sequential',
@EnableContextCompression = 0,
@ContextCompressionMessageThreshold = NULL,
@ContextCompressionPromptID = NULL,
@ContextCompressionMessageRetentionCount = NULL,
@TypeID = 'F7926101-5099-4FA5-836A-479D9707C818',
@Status = 'Active',
@DriverClass = NULL,
@IconClass = 'fa-solid fa-bullhorn',
@ID = '4A7B4F1D-C536-409F-9206-F36FDEE64EDF';

GO

-- Save AI Agents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIAgent @Name = 'Copywriter Agent',
@Description = 'Creative wordsmith specializing in crafting compelling initial drafts of marketing content with persuasive messaging.',
@LogoURL = NULL,
@ParentID = '4A7B4F1D-C536-409F-9206-F36FDEE64EDF',
@ExposeAsAction = 0,
@ExecutionOrder = 1,
@ExecutionMode = 'Sequential',
@EnableContextCompression = 0,
@ContextCompressionMessageThreshold = NULL,
@ContextCompressionPromptID = NULL,
@ContextCompressionMessageRetentionCount = NULL,
@TypeID = 'F7926101-5099-4FA5-836A-479D9707C818',
@Status = 'Active',
@DriverClass = NULL,
@IconClass = 'fa-solid fa-feather',
@ID = '8A322A1B-27EE-4A89-A6C4-A47C856E5842';

GO

-- Save AI Agents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIAgent @Name = 'SEO AIEO Specialist Agent',
@Description = 'Expert in optimizing content for both traditional search engines and AI-powered discovery platforms.',
@LogoURL = NULL,
@ParentID = '4A7B4F1D-C536-409F-9206-F36FDEE64EDF',
@ExposeAsAction = 0,
@ExecutionOrder = 1,
@ExecutionMode = 'Sequential',
@EnableContextCompression = 0,
@ContextCompressionMessageThreshold = NULL,
@ContextCompressionPromptID = NULL,
@ContextCompressionMessageRetentionCount = NULL,
@TypeID = 'F7926101-5099-4FA5-836A-479D9707C818',
@Status = 'Active',
@DriverClass = NULL,
@IconClass = 'fa-solid fa-chart-line',
@ID = '62CF643B-18E5-4C3B-BD0A-B3206E87BCE8';

GO

-- Save AI Agents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIAgent @Name = 'Editor Agent',
@Description = 'Meticulous content professional ensuring quality, accuracy, and effectiveness of all marketing materials.',
@LogoURL = NULL,
@ParentID = '4A7B4F1D-C536-409F-9206-F36FDEE64EDF',
@ExposeAsAction = 0,
@ExecutionOrder = 1,
@ExecutionMode = 'Sequential',
@EnableContextCompression = 0,
@ContextCompressionMessageThreshold = NULL,
@ContextCompressionPromptID = NULL,
@ContextCompressionMessageRetentionCount = NULL,
@TypeID = 'F7926101-5099-4FA5-836A-479D9707C818',
@Status = 'Active',
@DriverClass = NULL,
@IconClass = 'fa-solid fa-edit',
@ID = '383FA7A1-E654-4D65-BC88-6CFE1C90086E';

GO

-- Save AI Agents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIAgent @Name = 'Brand Guardian Agent',
@Description = 'Final checkpoint ensuring all marketing content aligns with brand values, voice, and visual identity.',
@LogoURL = NULL,
@ParentID = '4A7B4F1D-C536-409F-9206-F36FDEE64EDF',
@ExposeAsAction = 0,
@ExecutionOrder = 1,
@ExecutionMode = 'Sequential',
@EnableContextCompression = 0,
@ContextCompressionMessageThreshold = NULL,
@ContextCompressionPromptID = NULL,
@ContextCompressionMessageRetentionCount = NULL,
@TypeID = 'F7926101-5099-4FA5-836A-479D9707C818',
@Status = 'Active',
@DriverClass = NULL,
@IconClass = 'fa-solid fa-shield-alt',
@ID = '414901EA-0BAE-43C1-9B9F-0A6B48B6B768';

GO

-- Save AI Agents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIAgent @Name = 'Publisher Agent',
@Description = 'Handles final content distribution with platform-specific optimization (publishing tools under development).',
@LogoURL = NULL,
@ParentID = '4A7B4F1D-C536-409F-9206-F36FDEE64EDF',
@ExposeAsAction = 0,
@ExecutionOrder = 1,
@ExecutionMode = 'Sequential',
@EnableContextCompression = 0,
@ContextCompressionMessageThreshold = NULL,
@ContextCompressionPromptID = NULL,
@ContextCompressionMessageRetentionCount = NULL,
@TypeID = 'F7926101-5099-4FA5-836A-479D9707C818',
@Status = 'Active',
@DriverClass = NULL,
@IconClass = 'fa-solid fa-paper-plane',
@ID = '6AD5B39D-CC3B-45E3-90F2-A00E2BC42E6D';

GO

-- Save AI Agents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIAgent @Name = 'Agent Manager',
@Description = 'Top-level orchestrator agent responsible for creating, editing, and managing other AI agents in the MemberJunction system. Uses specialized sub-agents to gather requirements, design architecture, and craft prompts.',
@LogoURL = NULL,
@ParentID = NULL,
@ExposeAsAction = 1,
@ExecutionOrder = 0,
@ExecutionMode = 'Sequential',
@EnableContextCompression = 0,
@ContextCompressionMessageThreshold = NULL,
@ContextCompressionPromptID = NULL,
@ContextCompressionMessageRetentionCount = NULL,
@TypeID = 'F7926101-5099-4FA5-836A-479D9707C818',
@Status = 'Active',
@DriverClass = NULL,
@IconClass = 'fa-solid fa-robot',
@ID = 'E1691AE0-00BB-4414-A74D-F7F36D348A06';

GO

-- Save AI Agents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIAgent @Name = 'Requirements Analyst Agent',
@Description = 'MBA-type business analyst with technical expertise, specialized in gathering and clarifying detailed requirements through iterative conversations. Ensures clear definition of agent objectives before design begins.',
@LogoURL = NULL,
@ParentID = 'E1691AE0-00BB-4414-A74D-F7F36D348A06',
@ExposeAsAction = 0,
@ExecutionOrder = 1,
@ExecutionMode = 'Sequential',
@EnableContextCompression = 0,
@ContextCompressionMessageThreshold = NULL,
@ContextCompressionPromptID = NULL,
@ContextCompressionMessageRetentionCount = NULL,
@TypeID = 'F7926101-5099-4FA5-836A-479D9707C818',
@Status = 'Active',
@DriverClass = NULL,
@IconClass = 'fa-solid fa-clipboard-list',
@ID = 'A15E6AC3-CE68-4D08-A52A-505019BB2099';

GO

-- Save AI Agents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIAgent @Name = 'Planning Designer Agent',
@Description = 'System architect specialized in designing agent hierarchies, selecting appropriate actions from the library, and creating optimal agent structures based on requirements.',
@LogoURL = NULL,
@ParentID = 'E1691AE0-00BB-4414-A74D-F7F36D348A06',
@ExposeAsAction = 0,
@ExecutionOrder = 2,
@ExecutionMode = 'Sequential',
@EnableContextCompression = 0,
@ContextCompressionMessageThreshold = NULL,
@ContextCompressionPromptID = NULL,
@ContextCompressionMessageRetentionCount = NULL,
@TypeID = 'F7926101-5099-4FA5-836A-479D9707C818',
@Status = 'Active',
@DriverClass = NULL,
@IconClass = 'fa-solid fa-sitemap',
@ID = '644674DB-7791-44C4-8360-3914111C0E10';

GO

-- Save AI Agents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIAgent @Name = 'Prompt Designer Agent',
@Description = 'Expert prompt engineer specialized in crafting high-quality, effective prompts for AI agents. Creates system prompts that leverage agent type control structures and business logic.',
@LogoURL = NULL,
@ParentID = 'E1691AE0-00BB-4414-A74D-F7F36D348A06',
@ExposeAsAction = 0,
@ExecutionOrder = 3,
@ExecutionMode = 'Sequential',
@EnableContextCompression = 0,
@ContextCompressionMessageThreshold = NULL,
@ContextCompressionPromptID = NULL,
@ContextCompressionMessageRetentionCount = NULL,
@TypeID = 'F7926101-5099-4FA5-836A-479D9707C818',
@Status = 'Active',
@DriverClass = NULL,
@IconClass = 'fa-solid fa-pen-fancy',
@ID = '82323658-FD6D-4F06-BAE5-39A0945C9DC0';

GO


-- End of SQL Logging Session
-- Session ID: 1aa3fa63-f184-4ad1-a10d-2db06a35c323
-- Completed: 2025-06-23T19:20:33.888Z
-- Duration: 3290ms
-- Total Statements: 37





-- Save AI Prompts (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIPrompt @Name = 'Loop Agent Type: System Prompt',
@Description = 'Basic control structure for the Loop Agent Type.',
@TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@CategoryID = 'A19D433E-F36B-1410-8DB1-00021F8B792E',
@TypeID = 'A6DA423E-F36B-1410-8DAC-00021F8B792E',
@Status = 'Active',
@ResponseFormat = 'JSON',
@ModelSpecificResponseFormat = NULL,
@AIModelTypeID = NULL,
@MinPowerRank = 0,
@SelectionStrategy = 'Specific',
@PowerPreference = 'Highest',
@ParallelizationMode = 'None',
@ParallelCount = NULL,
@ParallelConfigParam = NULL,
@OutputType = 'object',
@OutputExample = '{
  "taskComplete": "[BOOLEAN: true if task is fully complete, false if more steps needed]",
  "message": "[STRING: Human-readable message about current status or final result - this is what the user/caller sees - they do NOT see what is in the payload, so include EVERYTHING here that is important for the user even if it overlaps with the payload]",
  "payload*": {
    "[KEY]": "[VALUE: Your agent-specific data structure goes here]",
    "[EXAMPLE_STRUCTURE]": {
      "resultsFound": "[NUMBER or other data]",
      "processedItems": "[Array of processed data]",
      "customField": "[Any structure your agent needs to return]"
    },
    "[NOTE]": "This payload structure is completely flexible based on your agent''s purpose"
  },
  "reasoning": "[STRING: Your internal explanation of why you made this decision - helps with debugging]",
  "confidence?": "[OPTIONAL NUMBER: 0.0 to 1.0 indicating confidence in this decision]",
  "nextStep?": {
    "type": "[REQUIRED if taskComplete=false: Must be exactly one of: ''action'' | ''sub-agent'' | ''chat'']",
    "actions?": [
      {
        "id": "[UUID: The exact ID from available actions list]",
        "name": "[STRING: The exact name from available actions list]",
        "params*": {
          "[PARAM_NAME]": "[PARAM_VALUE: Must match action''s expected parameters]",
          "[ANOTHER_PARAM]": "[Value matching the action''s parameter type]"
        }
      }
    ],
    "subAgent?": {
      "id": "[UUID: The exact ID from available sub-agents list]",
      "name": "[STRING: The exact name from available sub-agents list]",
      "message": "[STRING: Complete context and instructions for the sub-agent - they don''t see conversation history]",
      "templateParameters*": {
        "[TEMPLATE_PARAM_NAME]": "[VALUE: If sub-agent has template parameters, provide values here]"
      },
      "terminateAfter": "[BOOLEAN: true to end parent agent after sub-agent completes, false to continue]"
    }
  }
}',
@ValidationBehavior = 'Strict',
@MaxRetries = 2,
@RetryDelayMS = 1000,
@RetryStrategy = 'Fixed',
@ResultSelectorPromptID = NULL,
@EnableCaching = 0,
@CacheTTLSeconds = NULL,
@CacheMatchType = 'Exact',
@CacheSimilarityThreshold = NULL,
@CacheMustMatchModel = 1,
@CacheMustMatchVendor = 1,
@CacheMustMatchAgent = 0,
@CacheMustMatchConfig = 0,
@PromptRole = 'System',
@PromptPosition = 'First',
@Temperature = NULL,
@TopP = NULL,
@TopK = NULL,
@MinP = NULL,
@FrequencyPenalty = NULL,
@PresencePenalty = NULL,
@Seed = NULL,
@StopSequences = NULL,
@IncludeLogProbs = 0,
@TopLogProbs = NULL,
@ID = 'FF7D441F-36E1-458A-B548-0FC2208923BE';

GO

-- Save MJ: AI Prompt Models (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIPromptModel @PromptID = 'FF7D441F-36E1-458A-B548-0FC2208923BE',
@ModelID = '9604B1A4-3A21-F011-8B3D-7C1E5249773E',
@VendorID = 'D8A5CCEC-6A37-EF11-86D4-000D3A4E707E',
@ConfigurationID = NULL,
@Priority = 3,
@ExecutionGroup = 0,
@ModelParameters = NULL,
@Status = 'Active',
@ParallelizationMode = 'None',
@ParallelCount = 1,
@ParallelConfigParam = NULL,
@ID = '354C0AC9-9196-4E9E-A6DA-7E0CEBE1EA92';

GO

-- Save MJ: AI Prompt Models (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIPromptModel @PromptID = 'FF7D441F-36E1-458A-B548-0FC2208923BE',
@ModelID = 'C496B988-4EA4-4D7E-A6DD-255F56D93933',
@VendorID = 'E3A5CCEC-6A37-EF11-86D4-000D3A4E707E',
@ConfigurationID = NULL,
@Priority = 2,
@ExecutionGroup = 0,
@ModelParameters = NULL,
@Status = 'Active',
@ParallelizationMode = 'None',
@ParallelCount = 1,
@ParallelConfigParam = NULL,
@ID = 'A72A6CC0-1AB7-4088-B53C-AE8A88B7E4A7';

GO

-- Save MJ: AI Prompt Models (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIPromptModel @PromptID = 'FF7D441F-36E1-458A-B548-0FC2208923BE',
@ModelID = '287E317F-BF26-F011-A770-AC1A3D21423D',
@VendorID = 'D8A5CCEC-6A37-EF11-86D4-000D3A4E707E',
@ConfigurationID = NULL,
@Priority = 10,
@ExecutionGroup = 0,
@ModelParameters = NULL,
@Status = 'Active',
@ParallelizationMode = 'None',
@ParallelCount = 1,
@ParallelConfigParam = NULL,
@ID = '0F7988B5-668A-4B53-A071-DFD0CEF7B762';

GO




-- Save MJ: AI Prompt Models (core SP call only)
EXEC [__mj].spUpdateAIPromptModel @PromptID = 'FF7D441F-36E1-458A-B548-0FC2208923BE',
@ModelID = '9604B1A4-3A21-F011-8B3D-7C1E5249773E',
@VendorID = 'D8A5CCEC-6A37-EF11-86D4-000D3A4E707E',
@ConfigurationID = NULL,
@Priority = 10,
@ExecutionGroup = 0,
@ModelParameters = NULL,
@Status = 'Active',
@ParallelizationMode = 'None',
@ParallelCount = 1,
@ParallelConfigParam = NULL,
@ID = '354C0AC9-9196-4E9E-A6DA-7E0CEBE1EA92';

GO

-- Save MJ: AI Prompt Models (core SP call only)
EXEC [__mj].spUpdateAIPromptModel @PromptID = 'FF7D441F-36E1-458A-B548-0FC2208923BE',
@ModelID = 'C496B988-4EA4-4D7E-A6DD-255F56D93933',
@VendorID = 'E3A5CCEC-6A37-EF11-86D4-000D3A4E707E',
@ConfigurationID = NULL,
@Priority = 13,
@ExecutionGroup = 0,
@ModelParameters = NULL,
@Status = 'Active',
@ParallelizationMode = 'None',
@ParallelCount = 1,
@ParallelConfigParam = NULL,
@ID = 'A72A6CC0-1AB7-4088-B53C-AE8A88B7E4A7';

GO

-- Save MJ: AI Prompt Models (core SP call only)
EXEC [__mj].spUpdateAIPromptModel @PromptID = 'FF7D441F-36E1-458A-B548-0FC2208923BE',
@ModelID = '287E317F-BF26-F011-A770-AC1A3D21423D',
@VendorID = 'D8A5CCEC-6A37-EF11-86D4-000D3A4E707E',
@ConfigurationID = NULL,
@Priority = 12,
@ExecutionGroup = 0,
@ModelParameters = NULL,
@Status = 'Active',
@ParallelizationMode = 'None',
@ParallelCount = 1,
@ParallelConfigParam = NULL,
@ID = '0F7988B5-668A-4B53-A071-DFD0CEF7B762';
