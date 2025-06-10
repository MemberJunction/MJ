-- =================================================================================
-- Migration: V202506081500__v2.47.x__Fix_DateTime_Timezone_Handling.sql
-- Purpose: Convert datetime2 fields to datetimeoffset to properly handle timezones
-- 
-- This migration addresses timezone handling issues where datetime2 fields are
-- interpreted as local time when retrieved from the database, causing constraint
-- violations and incorrect time comparisons.
-- =================================================================================

-- Start transaction
BEGIN TRANSACTION;

BEGIN TRY
    -- Phase 1: Drop dependent objects (constraints and indexes)
    -- Drop the check constraint that validates CompletedAt >= RunAt
    IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_AIPromptRun_Timing' AND parent_object_id = OBJECT_ID('${flyway:defaultSchema}.AIPromptRun'))
    BEGIN
        ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun] DROP CONSTRAINT [CK_AIPromptRun_Timing];
        PRINT 'Dropped constraint CK_AIPromptRun_Timing';
    END

    -- Find and drop the default constraint on RunAt
    DECLARE @RunAtDefaultName NVARCHAR(128);
    SELECT @RunAtDefaultName = dc.name
    FROM sys.default_constraints dc
    JOIN sys.columns c ON dc.parent_column_id = c.column_id AND dc.parent_object_id = c.object_id
    WHERE c.name = 'RunAt' AND c.object_id = OBJECT_ID('${flyway:defaultSchema}.AIPromptRun');

    IF @RunAtDefaultName IS NOT NULL
    BEGIN
        DECLARE @DropDefaultSQL NVARCHAR(MAX) = 'ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun] DROP CONSTRAINT [' + @RunAtDefaultName + ']';
        EXEC sp_executesql @DropDefaultSQL;
        PRINT 'Dropped default constraint on RunAt: ' + @RunAtDefaultName;
    END

    -- Drop indexes
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AIPromptRun_PromptID_RunAt' AND object_id = OBJECT_ID('${flyway:defaultSchema}.AIPromptRun'))
    BEGIN
        DROP INDEX [IX_AIPromptRun_PromptID_RunAt] ON [${flyway:defaultSchema}].[AIPromptRun];
        PRINT 'Dropped index IX_AIPromptRun_PromptID_RunAt';
    END

    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AIPromptRun_AgentID_RunAt' AND object_id = OBJECT_ID('${flyway:defaultSchema}.AIPromptRun'))
    BEGIN
        DROP INDEX [IX_AIPromptRun_AgentID_RunAt] ON [${flyway:defaultSchema}].[AIPromptRun];
        PRINT 'Dropped index IX_AIPromptRun_AgentID_RunAt';
    END

    -- Phase 2: Alter columns (can't combine multiple ALTER COLUMN in one statement)
    -- Convert RunAt from datetime2(7) to datetimeoffset(7)
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun] 
    ALTER COLUMN [RunAt] datetimeoffset(7) NOT NULL;
    PRINT 'Converted RunAt to datetimeoffset(7)';

    -- Convert CompletedAt from datetime2(7) to datetimeoffset(7)
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun] 
    ALTER COLUMN [CompletedAt] datetimeoffset(7) NULL;
    PRINT 'Converted CompletedAt to datetimeoffset(7)';

    -- Phase 3: Add constraints back (combine multiple ADD operations)
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun] 
    ADD 
        CONSTRAINT [DF_AIPromptRun_RunAt] DEFAULT (SYSDATETIMEOFFSET()) FOR [RunAt],
        CONSTRAINT [CK_AIPromptRun_Timing] CHECK ([CompletedAt] IS NULL OR [CompletedAt] >= [RunAt]);
    PRINT 'Added default constraint and check constraint';

    -- Phase 4: Re-create indexes
    CREATE INDEX [IX_AIPromptRun_PromptID_RunAt] 
    ON [${flyway:defaultSchema}].[AIPromptRun]([PromptID], [RunAt] DESC);
    PRINT 'Re-created index IX_AIPromptRun_PromptID_RunAt';

    CREATE INDEX [IX_AIPromptRun_AgentID_RunAt] 
    ON [${flyway:defaultSchema}].[AIPromptRun]([AgentID], [RunAt] DESC) 
    WHERE [AgentID] IS NOT NULL;
    PRINT 'Re-created index IX_AIPromptRun_AgentID_RunAt';

    -- Phase 5: Extended properties
    -- Update constraint description
    IF EXISTS (
        SELECT 1 
        FROM sys.extended_properties 
        WHERE major_id = OBJECT_ID('${flyway:defaultSchema}.AIPromptRun') 
        AND name = 'MS_Description' 
        AND minor_id = (
            SELECT object_id 
            FROM sys.check_constraints 
            WHERE parent_object_id = OBJECT_ID('${flyway:defaultSchema}.AIPromptRun') 
            AND name = 'CK_AIPromptRun_Timing'
        )
    )
    BEGIN
        EXEC sys.sp_dropextendedproperty 
            @name=N'MS_Description',
            @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', 
            @level1type=N'TABLE',@level1name=N'AIPromptRun', 
            @level2type=N'CONSTRAINT',@level2name=N'CK_AIPromptRun_Timing';
    END

    EXEC sys.sp_addextendedproperty 
        @name=N'MS_Description', 
        @value=N'Ensures that CompletedAt is after RunAt when present (timezone-aware comparison).', 
        @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', 
        @level1type=N'TABLE',@level1name=N'AIPromptRun', 
        @level2type=N'CONSTRAINT',@level2name=N'CK_AIPromptRun_Timing';

    -- Update column descriptions
    -- Drop existing descriptions if they exist
    IF EXISTS (
        SELECT 1 FROM sys.extended_properties 
        WHERE major_id = OBJECT_ID('${flyway:defaultSchema}.AIPromptRun') 
        AND minor_id = (SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID('${flyway:defaultSchema}.AIPromptRun') AND name = 'RunAt')
        AND name = 'MS_Description'
    )
    BEGIN
        EXEC sys.sp_dropextendedproperty 
            @name=N'MS_Description',
            @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', 
            @level1type=N'TABLE',@level1name=N'AIPromptRun', 
            @level2type=N'COLUMN',@level2name=N'RunAt';
    END

    IF EXISTS (
        SELECT 1 FROM sys.extended_properties 
        WHERE major_id = OBJECT_ID('${flyway:defaultSchema}.AIPromptRun') 
        AND minor_id = (SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID('${flyway:defaultSchema}.AIPromptRun') AND name = 'CompletedAt')
        AND name = 'MS_Description'
    )
    BEGIN
        EXEC sys.sp_dropextendedproperty 
            @name=N'MS_Description',
            @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', 
            @level1type=N'TABLE',@level1name=N'AIPromptRun', 
            @level2type=N'COLUMN',@level2name=N'CompletedAt';
    END

    -- Add new descriptions
    EXEC sys.sp_addextendedproperty 
        @name=N'MS_Description', 
        @value=N'When the prompt run started, with timezone offset information.', 
        @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', 
        @level1type=N'TABLE',@level1name=N'AIPromptRun', 
        @level2type=N'COLUMN',@level2name=N'RunAt';

    EXEC sys.sp_addextendedproperty 
        @name=N'MS_Description', 
        @value=N'When the prompt run completed, with timezone offset information.', 
        @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', 
        @level1type=N'TABLE',@level1name=N'AIPromptRun', 
        @level2type=N'COLUMN',@level2name=N'CompletedAt';

    COMMIT TRANSACTION;
    PRINT 'Successfully converted AIPromptRun datetime2 columns to datetimeoffset for proper timezone handling.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    
    PRINT 'Error occurred during migration:';
    PRINT ERROR_MESSAGE();
    THROW;
END CATCH







/** CODE GEN RUN ASSOCIATED WITH THIS MIGRATION **/
/** CODE GEN RUN ASSOCIATED WITH THIS MIGRATION **/
/** CODE GEN RUN ASSOCIATED WITH THIS MIGRATION **/
/** CODE GEN RUN ASSOCIATED WITH THIS MIGRATION **/
/** CODE GEN RUN ASSOCIATED WITH THIS MIGRATION **/
/** CODE GEN RUN ASSOCIATED WITH THIS MIGRATION **/
/** CODE GEN RUN ASSOCIATED WITH THIS MIGRATION **/
/** CODE GEN RUN ASSOCIATED WITH THIS MIGRATION **/


/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '38a3f73f-9364-428e-a195-5df74b9f9acb'  OR 
               (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'Agent')
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
            '38a3f73f-9364-428e-a195-5df74b9f9acb',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            17,
            'Agent',
            'Agent',
            NULL,
            'nvarchar',
            510,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8faf86e8-f74e-4d76-972a-197fbb245478'  OR 
               (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'Conversation')
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
            '8faf86e8-f74e-4d76-972a-197fbb245478',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            18,
            'Conversation',
            'Conversation',
            NULL,
            'nvarchar',
            510,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9feaec67-96db-4551-9954-ac631c8adf0a'  OR 
               (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'User')
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
            '9feaec67-96db-4551-9954-ac631c8adf0a',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            19,
            'User',
            'User',
            NULL,
            'nvarchar',
            200,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c4f745bd-57e7-4f87-9b65-8bbdd2b50529'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'Type')
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
            'c4f745bd-57e7-4f87-9b65-8bbdd2b50529',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            18,
            'Type',
            'Type',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '200792e6-e7ec-4293-a821-77b42a49dab5'  OR 
               (EntityID = '65CDC348-C4A6-4D00-A57B-2D489C56F128' AND Name = 'SystemPrompt')
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
            '200792e6-e7ec-4293-a821-77b42a49dab5',
            '65CDC348-C4A6-4D00-A57B-2D489C56F128', -- Entity: MJ: AI Agent Types
            8,
            'SystemPrompt',
            'System Prompt',
            NULL,
            'nvarchar',
            510,
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

/* SQL text to delete entity field value ID 53B6433E-F36B-1410-8DB0-00021F8B792E */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='53B6433E-F36B-1410-8DB0-00021F8B792E'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=7 WHERE ID='3FB7433E-F36B-1410-8DB0-00021F8B792E'

/* SQL text to delete entity field value ID 71B6433E-F36B-1410-8DB0-00021F8B792E */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='71B6433E-F36B-1410-8DB0-00021F8B792E'

/* Index for Foreign Keys for AIAgentRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_AgentID ON [${flyway:defaultSchema}].[AIAgentRun] ([AgentID]);

-- Index for foreign key ParentRunID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_ParentRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_ParentRunID ON [${flyway:defaultSchema}].[AIAgentRun] ([ParentRunID]);

-- Index for foreign key ConversationID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_ConversationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_ConversationID ON [${flyway:defaultSchema}].[AIAgentRun] ([ConversationID]);

-- Index for foreign key UserID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_UserID ON [${flyway:defaultSchema}].[AIAgentRun] ([UserID]);

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

/* Base View SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: vwAIAgentRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIAgentRuns]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentRuns]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    Conversation_ConversationID.[Name] AS [Conversation],
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[AIAgentRun] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Conversation] AS Conversation_ConversationID
  ON
    [a].[ConversationID] = Conversation_ConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [a].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: Permissions for vwAIAgentRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spCreateAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentRun
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIAgentRun]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRun]
    @AgentID uniqueidentifier,
    @ParentRunID uniqueidentifier,
    @Status nvarchar(50),
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @Success bit,
    @ErrorMessage nvarchar(MAX),
    @ConversationID uniqueidentifier,
    @UserID uniqueidentifier,
    @Result nvarchar(MAX),
    @AgentState nvarchar(MAX),
    @TotalTokensUsed int,
    @TotalCost decimal(18, 6)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIAgentRun]
        (
            [AgentID],
            [ParentRunID],
            [Status],
            [StartedAt],
            [CompletedAt],
            [Success],
            [ErrorMessage],
            [ConversationID],
            [UserID],
            [Result],
            [AgentState],
            [TotalTokensUsed],
            [TotalCost]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @AgentID,
            @ParentRunID,
            @Status,
            @StartedAt,
            @CompletedAt,
            @Success,
            @ErrorMessage,
            @ConversationID,
            @UserID,
            @Result,
            @AgentState,
            @TotalTokensUsed,
            @TotalCost
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spUpdateAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentRun
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIAgentRun]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRun]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ParentRunID uniqueidentifier,
    @Status nvarchar(50),
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @Success bit,
    @ErrorMessage nvarchar(MAX),
    @ConversationID uniqueidentifier,
    @UserID uniqueidentifier,
    @Result nvarchar(MAX),
    @AgentState nvarchar(MAX),
    @TotalTokensUsed int,
    @TotalCost decimal(18, 6)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRun]
    SET
        [AgentID] = @AgentID,
        [ParentRunID] = @ParentRunID,
        [Status] = @Status,
        [StartedAt] = @StartedAt,
        [CompletedAt] = @CompletedAt,
        [Success] = @Success,
        [ErrorMessage] = @ErrorMessage,
        [ConversationID] = @ConversationID,
        [UserID] = @UserID,
        [Result] = @Result,
        [AgentState] = @AgentState,
        [TotalTokensUsed] = @TotalTokensUsed,
        [TotalCost] = @TotalCost
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRun table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIAgentRun
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentRun
ON [${flyway:defaultSchema}].[AIAgentRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spDeleteAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRun
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIAgentRun]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentRun]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Integration]



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
INNER JOIN
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
    @TypeID uniqueidentifier = '00000000-0000-0000-0000-000000000000'
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIAgent]
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
            [TypeID]
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
            CASE @TypeID WHEN '00000000-0000-0000-0000-000000000000' THEN 'A7B8C9D0-E1F2-3456-7890-123456789ABC' ELSE @TypeID END
        )
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
    @TypeID uniqueidentifier
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
        [TypeID] = @TypeID
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



/* Index for Foreign Keys for AIAgentType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SystemPromptID in table AIAgentType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentType_SystemPromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentType_SystemPromptID ON [${flyway:defaultSchema}].[AIAgentType] ([SystemPromptID]);

/* Base View SQL for MJ: AI Agent Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Types
-- Item: vwAIAgentTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentType
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIAgentTypes]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentTypes]
AS
SELECT
    a.*,
    AIPrompt_SystemPromptID.[Name] AS [SystemPrompt]
FROM
    [${flyway:defaultSchema}].[AIAgentType] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_SystemPromptID
  ON
    [a].[SystemPromptID] = AIPrompt_SystemPromptID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Agent Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Types
-- Item: Permissions for vwAIAgentTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Agent Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Types
-- Item: spCreateAIAgentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIAgentType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentType]
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @SystemPromptID uniqueidentifier,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIAgentType]
        (
            [Name],
            [Description],
            [SystemPromptID],
            [IsActive]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @SystemPromptID,
            @IsActive
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Agent Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Agent Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Types
-- Item: spUpdateAIAgentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIAgentType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentType]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @SystemPromptID uniqueidentifier,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentType]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [SystemPromptID] = @SystemPromptID,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentType table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIAgentType
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentType
ON [${flyway:defaultSchema}].[AIAgentType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Agent Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Agent Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Types
-- Item: spDeleteAIAgentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIAgentType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentType]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Agent Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentType] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 50AF433E-F36B-1410-8DB0-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='50AF433E-F36B-1410-8DB0-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 58AF433E-F36B-1410-8DB0-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='58AF433E-F36B-1410-8DB0-00021F8B792E',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID 5AAF433E-F36B-1410-8DB0-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5AAF433E-F36B-1410-8DB0-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID BAAF433E-F36B-1410-8DB0-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BAAF433E-F36B-1410-8DB0-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID BEAF433E-F36B-1410-8DB0-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BEAF433E-F36B-1410-8DB0-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID E8AE433E-F36B-1410-8DB0-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E8AE433E-F36B-1410-8DB0-00021F8B792E',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID F1AE433E-F36B-1410-8DB0-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F1AE433E-F36B-1410-8DB0-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID F2AE433E-F36B-1410-8DB0-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F2AE433E-F36B-1410-8DB0-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID F3AE433E-F36B-1410-8DB0-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F3AE433E-F36B-1410-8DB0-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID F8AE433E-F36B-1410-8DB0-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F8AE433E-F36B-1410-8DB0-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 0DAF433E-F36B-1410-8DB0-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0DAF433E-F36B-1410-8DB0-00021F8B792E',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID 1FAF433E-F36B-1410-8DB0-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1FAF433E-F36B-1410-8DB0-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 2BAF433E-F36B-1410-8DB0-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2BAF433E-F36B-1410-8DB0-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID 31AF433E-F36B-1410-8DB0-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='31AF433E-F36B-1410-8DB0-00021F8B792E',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID 22AF433E-F36B-1410-8DB0-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='22AF433E-F36B-1410-8DB0-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 23AF433E-F36B-1410-8DB0-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='23AF433E-F36B-1410-8DB0-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 24AF433E-F36B-1410-8DB0-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='24AF433E-F36B-1410-8DB0-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* Index for Foreign Keys for AIPromptRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PromptID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_PromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_PromptID ON [${flyway:defaultSchema}].[AIPromptRun] ([PromptID]);

-- Index for foreign key ModelID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_ModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_ModelID ON [${flyway:defaultSchema}].[AIPromptRun] ([ModelID]);

-- Index for foreign key VendorID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_VendorID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_VendorID ON [${flyway:defaultSchema}].[AIPromptRun] ([VendorID]);

-- Index for foreign key AgentID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_AgentID ON [${flyway:defaultSchema}].[AIPromptRun] ([AgentID]);

-- Index for foreign key ConfigurationID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_ConfigurationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_ConfigurationID ON [${flyway:defaultSchema}].[AIPromptRun] ([ConfigurationID]);

-- Index for foreign key ParentID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_ParentID ON [${flyway:defaultSchema}].[AIPromptRun] ([ParentID]);

-- Index for foreign key AgentRunID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_AgentRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_AgentRunID ON [${flyway:defaultSchema}].[AIPromptRun] ([AgentRunID]);

/* Base View SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: vwAIPromptRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Prompt Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIPromptRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIPromptRuns]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIPromptRuns]
AS
SELECT
    a.*,
    AIPrompt_PromptID.[Name] AS [Prompt],
    AIModel_ModelID.[Name] AS [Model],
    AIVendor_VendorID.[Name] AS [Vendor],
    AIAgent_AgentID.[Name] AS [Agent],
    AIConfiguration_ConfigurationID.[Name] AS [Configuration]
FROM
    [${flyway:defaultSchema}].[AIPromptRun] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_PromptID
  ON
    [a].[PromptID] = AIPrompt_PromptID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_ModelID
  ON
    [a].[ModelID] = AIModel_ModelID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS AIVendor_VendorID
  ON
    [a].[VendorID] = AIVendor_VendorID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIConfiguration] AS AIConfiguration_ConfigurationID
  ON
    [a].[ConfigurationID] = AIConfiguration_ConfigurationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPromptRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: Permissions for vwAIPromptRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPromptRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: spCreateAIPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIPromptRun
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIPromptRun]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIPromptRun]
    @PromptID uniqueidentifier,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ConfigurationID uniqueidentifier,
    @RunAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @ExecutionTimeMS int,
    @Messages nvarchar(MAX),
    @Result nvarchar(MAX),
    @TokensUsed int,
    @TokensPrompt int,
    @TokensCompletion int,
    @TotalCost decimal(18, 6),
    @Success bit,
    @ErrorMessage nvarchar(MAX),
    @ParentID uniqueidentifier,
    @RunType nvarchar(20),
    @ExecutionOrder int,
    @AgentRunID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIPromptRun]
        (
            [PromptID],
            [ModelID],
            [VendorID],
            [AgentID],
            [ConfigurationID],
            [RunAt],
            [CompletedAt],
            [ExecutionTimeMS],
            [Messages],
            [Result],
            [TokensUsed],
            [TokensPrompt],
            [TokensCompletion],
            [TotalCost],
            [Success],
            [ErrorMessage],
            [ParentID],
            [RunType],
            [ExecutionOrder],
            [AgentRunID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @PromptID,
            @ModelID,
            @VendorID,
            @AgentID,
            @ConfigurationID,
            @RunAt,
            @CompletedAt,
            @ExecutionTimeMS,
            @Messages,
            @Result,
            @TokensUsed,
            @TokensPrompt,
            @TokensCompletion,
            @TotalCost,
            @Success,
            @ErrorMessage,
            @ParentID,
            @RunType,
            @ExecutionOrder,
            @AgentRunID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIPromptRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: spUpdateAIPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIPromptRun
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIPromptRun]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPromptRun]
    @ID uniqueidentifier,
    @PromptID uniqueidentifier,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ConfigurationID uniqueidentifier,
    @RunAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @ExecutionTimeMS int,
    @Messages nvarchar(MAX),
    @Result nvarchar(MAX),
    @TokensUsed int,
    @TokensPrompt int,
    @TokensCompletion int,
    @TotalCost decimal(18, 6),
    @Success bit,
    @ErrorMessage nvarchar(MAX),
    @ParentID uniqueidentifier,
    @RunType nvarchar(20),
    @ExecutionOrder int,
    @AgentRunID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPromptRun]
    SET
        [PromptID] = @PromptID,
        [ModelID] = @ModelID,
        [VendorID] = @VendorID,
        [AgentID] = @AgentID,
        [ConfigurationID] = @ConfigurationID,
        [RunAt] = @RunAt,
        [CompletedAt] = @CompletedAt,
        [ExecutionTimeMS] = @ExecutionTimeMS,
        [Messages] = @Messages,
        [Result] = @Result,
        [TokensUsed] = @TokensUsed,
        [TokensPrompt] = @TokensPrompt,
        [TokensCompletion] = @TokensCompletion,
        [TotalCost] = @TotalCost,
        [Success] = @Success,
        [ErrorMessage] = @ErrorMessage,
        [ParentID] = @ParentID,
        [RunType] = @RunType,
        [ExecutionOrder] = @ExecutionOrder,
        [AgentRunID] = @AgentRunID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIPromptRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPromptRun table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIPromptRun
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIPromptRun
ON [${flyway:defaultSchema}].[AIPromptRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPromptRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIPromptRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: spDeleteAIPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPromptRun
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIPromptRun]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIPromptRun]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Developer], [cdp_Integration]
