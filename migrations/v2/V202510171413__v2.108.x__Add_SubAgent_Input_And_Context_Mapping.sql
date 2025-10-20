/*
   Add SubAgentInputMapping and SubAgentContextPaths to AIAgentRelationship table

   Version: 2.108.x
   Date: 2025-10-17

   Purpose:
   - Enable related sub-agents to receive parent payload data in two ways:
     1. SubAgentInputMapping: Maps parent payload → sub-agent initial payload (structural data transfer)
     2. SubAgentContextPaths: Specifies parent payload paths to send as LLM context (conversation context)

   This provides symmetry with SubAgentOutputMapping and gives complete bidirectional control
   over data flow between parent and related sub-agents.
*/

-- Add SubAgentInputMapping column
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[AIAgentRelationship]') AND name = 'SubAgentInputMapping')
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[AIAgentRelationship]
    ADD [SubAgentInputMapping] NVARCHAR(MAX) NULL;

    PRINT 'Added SubAgentInputMapping column to AIAgentRelationship table';
END
GO

-- Add SubAgentContextPaths column
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[AIAgentRelationship]') AND name = 'SubAgentContextPaths')
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[AIAgentRelationship]
    ADD [SubAgentContextPaths] NVARCHAR(MAX) NULL;

    PRINT 'Added SubAgentContextPaths column to AIAgentRelationship table';
END
GO

-- Add extended property for SubAgentInputMapping
IF NOT EXISTS (
    SELECT * FROM sys.extended_properties
    WHERE major_id = OBJECT_ID(N'[${flyway:defaultSchema}].[AIAgentRelationship]')
    AND minor_id = (SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[AIAgentRelationship]') AND name = 'SubAgentInputMapping')
    AND name = 'MS_Description'
)
BEGIN
    EXEC sys.sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'JSON mapping of parent payload paths to sub-agent initial payload paths. Enables structural data transfer from parent to related sub-agent. Format: {"parentPath": "subAgentPath", "parent.nested": "subAgent.field"}. Example: {"searchQuery": "query", "maxResults": "limit"}. If null, sub-agent starts with empty payload (default behavior).',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = N'AIAgentRelationship',
        @level2type = N'COLUMN', @level2name = N'SubAgentInputMapping';

    PRINT 'Added description for SubAgentInputMapping column';
END
GO

-- Add extended property for SubAgentContextPaths
IF NOT EXISTS (
    SELECT * FROM sys.extended_properties
    WHERE major_id = OBJECT_ID(N'[${flyway:defaultSchema}].[AIAgentRelationship]')
    AND minor_id = (SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[AIAgentRelationship]') AND name = 'SubAgentContextPaths')
    AND name = 'MS_Description'
)
BEGIN
    EXEC sys.sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'JSON array of parent payload paths to send as LLM context to related sub-agent. Sub-agent receives this data in a formatted context message before its task message. Format: ["path1", "path2.nested", "path3.*", "*"]. Use "*" to send entire parent payload. Example: ["userPreferences", "priorFindings.summary", "sources[*]"]. If null, no parent context is sent (default behavior).',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = N'AIAgentRelationship',
        @level2type = N'COLUMN', @level2name = N'SubAgentContextPaths';

    PRINT 'Added description for SubAgentContextPaths column';
END
GO
 





















































-- CODE GEN RUN
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '472811f3-b956-4b4e-9ead-2d200548dc07'  OR 
               (EntityID = '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7' AND Name = 'SubAgentInputMapping')
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
            '472811f3-b956-4b4e-9ead-2d200548dc07',
            '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7', -- Entity: MJ: AI Agent Relationships
            100017,
            'SubAgentInputMapping',
            'Sub Agent Input Mapping',
            'JSON mapping of parent payload paths to sub-agent initial payload paths. Enables structural data transfer from parent to related sub-agent. Format: {"parentPath": "subAgentPath", "parent.nested": "subAgent.field"}. Example: {"searchQuery": "query", "maxResults": "limit"}. If null, sub-agent starts with empty payload (default behavior).',
            'nvarchar',
            -1,
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
         WHERE ID = '2a9bde31-6e8d-428a-86c8-6024d1b37aaa'  OR 
               (EntityID = '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7' AND Name = 'SubAgentContextPaths')
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
            '2a9bde31-6e8d-428a-86c8-6024d1b37aaa',
            '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7', -- Entity: MJ: AI Agent Relationships
            100018,
            'SubAgentContextPaths',
            'Sub Agent Context Paths',
            'JSON array of parent payload paths to send as LLM context to related sub-agent. Sub-agent receives this data in a formatted context message before its task message. Format: ["path1", "path2.nested", "path3.*", "*"]. Use "*" to send entire parent payload. Example: ["userPreferences", "priorFindings.summary", "sources[*]"]. If null, no parent context is sent (default behavior).',
            'nvarchar',
            -1,
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

/* Index for Foreign Keys for AIAgentRelationship */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Relationships
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRelationship_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRelationship_AgentID ON [${flyway:defaultSchema}].[AIAgentRelationship] ([AgentID]);

-- Index for foreign key SubAgentID in table AIAgentRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRelationship_SubAgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRelationship_SubAgentID ON [${flyway:defaultSchema}].[AIAgentRelationship] ([SubAgentID]);

/* Base View SQL for MJ: AI Agent Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Relationships
-- Item: vwAIAgentRelationships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Relationships
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentRelationship
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentRelationships]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentRelationships];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentRelationships]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    AIAgent_SubAgentID.[Name] AS [SubAgent]
FROM
    [${flyway:defaultSchema}].[AIAgentRelationship] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_SubAgentID
  ON
    [a].[SubAgentID] = AIAgent_SubAgentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRelationships] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Agent Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Relationships
-- Item: Permissions for vwAIAgentRelationships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRelationships] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Agent Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Relationships
-- Item: spCreateAIAgentRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentRelationship
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentRelationship]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRelationship];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRelationship]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @SubAgentID uniqueidentifier,
    @Status nvarchar(50),
    @SubAgentOutputMapping nvarchar(MAX),
    @SubAgentInputMapping nvarchar(MAX),
    @SubAgentContextPaths nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRelationship]
            (
                [ID],
                [AgentID],
                [SubAgentID],
                [Status],
                [SubAgentOutputMapping],
                [SubAgentInputMapping],
                [SubAgentContextPaths]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @SubAgentID,
                @Status,
                @SubAgentOutputMapping,
                @SubAgentInputMapping,
                @SubAgentContextPaths
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRelationship]
            (
                [AgentID],
                [SubAgentID],
                [Status],
                [SubAgentOutputMapping],
                [SubAgentInputMapping],
                [SubAgentContextPaths]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @SubAgentID,
                @Status,
                @SubAgentOutputMapping,
                @SubAgentInputMapping,
                @SubAgentContextPaths
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentRelationships] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRelationship] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Agent Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRelationship] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Agent Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Relationships
-- Item: spUpdateAIAgentRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentRelationship
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentRelationship]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRelationship];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRelationship]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @SubAgentID uniqueidentifier,
    @Status nvarchar(50),
    @SubAgentOutputMapping nvarchar(MAX),
    @SubAgentInputMapping nvarchar(MAX),
    @SubAgentContextPaths nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRelationship]
    SET
        [AgentID] = @AgentID,
        [SubAgentID] = @SubAgentID,
        [Status] = @Status,
        [SubAgentOutputMapping] = @SubAgentOutputMapping,
        [SubAgentInputMapping] = @SubAgentInputMapping,
        [SubAgentContextPaths] = @SubAgentContextPaths
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentRelationships] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentRelationships]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRelationship] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRelationship table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentRelationship]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentRelationship];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentRelationship
ON [${flyway:defaultSchema}].[AIAgentRelationship]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRelationship]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentRelationship] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Agent Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRelationship] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Agent Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Relationships
-- Item: spDeleteAIAgentRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRelationship
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentRelationship]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRelationship];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRelationship]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentRelationship]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRelationship] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Agent Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRelationship] TO [cdp_Integration]



