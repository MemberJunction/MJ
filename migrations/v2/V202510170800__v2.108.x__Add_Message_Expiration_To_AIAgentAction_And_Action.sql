/*
   Migration: Add message expiration and compaction to AIAgentAction and Action
   Version: v2.108.x
   Date: 2025-10-17

   Description:
   Adds conversation message lifecycle management to control context bloat in agent runs.

   AIAgentAction additions:
   - ResultExpirationTurns: Number of turns before action results expire from conversation
   - ResultExpirationMode: How to handle expiration (None, Remove, Compact)
   - CompactMode: How to compact (FirstNChars, AISummary)
   - CompactLength: Character limit for FirstNChars mode
   - CompactPromptID: Optional prompt for AI summarization

   Action additions:
   - DefaultCompactPromptID: Default prompt for compacting this action's results
*/

-- =============================================
-- AIAgentAction Table - Add expiration fields
-- =============================================

ALTER TABLE [${flyway:defaultSchema}].[AIAgentAction]
ADD
    [ResultExpirationTurns] INT NULL
        CONSTRAINT [CK_AIAgentAction_ExpirationTurns]
        CHECK ([ResultExpirationTurns] IS NULL OR [ResultExpirationTurns] >= 0),

    [ResultExpirationMode] NVARCHAR(20) NOT NULL
        CONSTRAINT [DF_AIAgentAction_ExpirationMode] DEFAULT 'None'
        CONSTRAINT [CK_AIAgentAction_ExpirationMode]
        CHECK ([ResultExpirationMode] IN ('None', 'Remove', 'Compact')),

    [CompactMode] NVARCHAR(20) NULL
        CONSTRAINT [CK_AIAgentAction_CompactMode]
        CHECK ([CompactMode] IS NULL OR [CompactMode] IN ('First N Chars', 'AI Summary')),

    [CompactLength] INT NULL
        CONSTRAINT [CK_AIAgentAction_CompactLength]
        CHECK ([CompactLength] IS NULL OR [CompactLength] > 0),

    [CompactPromptID] UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_AIAgentAction_CompactPromptID]
        FOREIGN KEY REFERENCES [${flyway:defaultSchema}].[AIPrompt]([ID]);
GO

-- Constraint: If Compact mode, must specify HOW to compact
ALTER TABLE [${flyway:defaultSchema}].[AIAgentAction]
ADD CONSTRAINT [CK_AIAgentAction_CompactModeRequired]
CHECK (
    [ResultExpirationMode] != 'Compact' OR
    [CompactMode] IS NOT NULL
);
GO

-- Constraint: If FirstNChars mode, must specify length
ALTER TABLE [${flyway:defaultSchema}].[AIAgentAction]
ADD CONSTRAINT [CK_AIAgentAction_CompactLengthRequired]
CHECK (
    [CompactMode] != 'First N Chars' OR
    [CompactLength] IS NOT NULL
);
GO

-- Constraint: If Remove or None, compact settings should be NULL (data cleanliness)
ALTER TABLE [${flyway:defaultSchema}].[AIAgentAction]
ADD CONSTRAINT [CK_AIAgentAction_CompactSettingsOnlyWhenCompact]
CHECK (
    [ResultExpirationMode] = 'Compact' OR
    ([CompactMode] IS NULL AND [CompactLength] IS NULL AND [CompactPromptID] IS NULL)
);
GO

-- =============================================
-- Action Table - Add default compact prompt
-- =============================================

ALTER TABLE [${flyway:defaultSchema}].[Action]
ADD [DefaultCompactPromptID] UNIQUEIDENTIFIER NULL
    CONSTRAINT [FK_Action_DefaultCompactPromptID]
    FOREIGN KEY REFERENCES [${flyway:defaultSchema}].[AIPrompt]([ID]);
GO

-- =============================================
-- Extended Property Descriptions - AIAgentAction
-- =============================================

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of conversation turns before action results expire from conversation context. NULL = never expire (default). 0 = expire immediately after next turn.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentAction',
    @level2type = N'COLUMN', @level2name = 'ResultExpirationTurns';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'How to handle expired action results: None (no expiration, default), Remove (delete message entirely), Compact (reduce size via CompactMode while preserving key information).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentAction',
    @level2type = N'COLUMN', @level2name = 'ResultExpirationMode';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'How to compact results when ResultExpirationMode=Compact: FirstNChars (truncate to CompactLength characters, fast and free), AISummary (use LLM to intelligently summarize with CompactPromptID or Action.DefaultCompactPromptID).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentAction',
    @level2type = N'COLUMN', @level2name = 'CompactMode';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of characters to keep when CompactMode=FirstNChars. Required when CompactMode is FirstNChars, ignored otherwise.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentAction',
    @level2type = N'COLUMN', @level2name = 'CompactLength';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional override for AI summarization prompt when CompactMode=AISummary. Lookup hierarchy: this field -> Action.DefaultCompactPromptID -> system default. Allows agent-specific summarization focus (e.g., technical vs. marketing perspective).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentAction',
    @level2type = N'COLUMN', @level2name = 'CompactPromptID';
GO

-- =============================================
-- Extended Property Descriptions - Action
-- =============================================

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Default prompt for compacting/summarizing this action''s results when used by agents with CompactMode=AISummary. Action designers define how their specific results should be summarized. Can be overridden per agent in AIAgentAction.CompactPromptID.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Action',
    @level2type = N'COLUMN', @level2name = 'DefaultCompactPromptID';
GO
 






























































 -- Code Gen Run
 /* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a4df120d-b24d-4ac1-8d11-feb556fb3904'  OR 
               (EntityID = '196B0316-6078-47A4-94B9-44A2FC5E8A55' AND Name = 'ResultExpirationTurns')
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
            'a4df120d-b24d-4ac1-8d11-feb556fb3904',
            '196B0316-6078-47A4-94B9-44A2FC5E8A55', -- Entity: AI Agent Actions
            100019,
            'ResultExpirationTurns',
            'Result Expiration Turns',
            'Number of conversation turns before action results expire from conversation context. NULL = never expire (default). 0 = expire immediately after next turn.',
            'int',
            4,
            10,
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
         WHERE ID = 'fc4063af-3419-4138-bd4c-18d7acccca08'  OR 
               (EntityID = '196B0316-6078-47A4-94B9-44A2FC5E8A55' AND Name = 'ResultExpirationMode')
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
            'fc4063af-3419-4138-bd4c-18d7acccca08',
            '196B0316-6078-47A4-94B9-44A2FC5E8A55', -- Entity: AI Agent Actions
            100020,
            'ResultExpirationMode',
            'Result Expiration Mode',
            'How to handle expired action results: None (no expiration, default), Remove (delete message entirely), Compact (reduce size via CompactMode while preserving key information).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'None',
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
         WHERE ID = 'd3f37b48-a258-4520-aa2f-62f21555b4c7'  OR 
               (EntityID = '196B0316-6078-47A4-94B9-44A2FC5E8A55' AND Name = 'CompactMode')
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
            'd3f37b48-a258-4520-aa2f-62f21555b4c7',
            '196B0316-6078-47A4-94B9-44A2FC5E8A55', -- Entity: AI Agent Actions
            100021,
            'CompactMode',
            'Compact Mode',
            'How to compact results when ResultExpirationMode=Compact: FirstNChars (truncate to CompactLength characters, fast and free), AISummary (use LLM to intelligently summarize with CompactPromptID or Action.DefaultCompactPromptID).',
            'nvarchar',
            40,
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
         WHERE ID = 'd3b6d192-ea9e-49ea-a67b-74b24ec8edf5'  OR 
               (EntityID = '196B0316-6078-47A4-94B9-44A2FC5E8A55' AND Name = 'CompactLength')
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
            'd3b6d192-ea9e-49ea-a67b-74b24ec8edf5',
            '196B0316-6078-47A4-94B9-44A2FC5E8A55', -- Entity: AI Agent Actions
            100022,
            'CompactLength',
            'Compact Length',
            'Number of characters to keep when CompactMode=FirstNChars. Required when CompactMode is FirstNChars, ignored otherwise.',
            'int',
            4,
            10,
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
         WHERE ID = 'e2776e82-c59c-4c92-ba37-9a0b9b193d2c'  OR 
               (EntityID = '196B0316-6078-47A4-94B9-44A2FC5E8A55' AND Name = 'CompactPromptID')
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
            'e2776e82-c59c-4c92-ba37-9a0b9b193d2c',
            '196B0316-6078-47A4-94B9-44A2FC5E8A55', -- Entity: AI Agent Actions
            100023,
            'CompactPromptID',
            'Compact Prompt ID',
            'Optional override for AI summarization prompt when CompactMode=AISummary. Lookup hierarchy: this field -> Action.DefaultCompactPromptID -> system default. Allows agent-specific summarization focus (e.g., technical vs. marketing perspective).',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '73AD0238-8B56-EF11-991A-6045BDEBA539',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '38312d56-fa69-401a-8698-12bc7f7ba37c'  OR 
               (EntityID = '38248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DefaultCompactPromptID')
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
            '38312d56-fa69-401a-8698-12bc7f7ba37c',
            '38248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Actions
            100049,
            'DefaultCompactPromptID',
            'Default Compact Prompt ID',
            'Default prompt for compacting/summarizing this action''s results when used by agents with CompactMode=AISummary. Action designers define how their specific results should be summarized. Can be overridden per agent in AIAgentAction.CompactPromptID.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '73AD0238-8B56-EF11-991A-6045BDEBA539',
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

/* SQL text to insert entity field value with ID 9ae1aaf3-6144-4c83-8b12-d6f4eee46cee */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9ae1aaf3-6144-4c83-8b12-d6f4eee46cee', 'FC4063AF-3419-4138-BD4C-18D7ACCCCA08', 1, 'Compact', 'Compact')

/* SQL text to insert entity field value with ID a8a8cd62-0e11-4a58-a4fb-91b991ea79a4 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('a8a8cd62-0e11-4a58-a4fb-91b991ea79a4', 'FC4063AF-3419-4138-BD4C-18D7ACCCCA08', 2, 'None', 'None')

/* SQL text to insert entity field value with ID c1282d6d-f0ed-4ed3-8568-6c587191f9a8 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('c1282d6d-f0ed-4ed3-8568-6c587191f9a8', 'FC4063AF-3419-4138-BD4C-18D7ACCCCA08', 3, 'Remove', 'Remove')

/* SQL text to update ValueListType for entity field ID FC4063AF-3419-4138-BD4C-18D7ACCCCA08 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='FC4063AF-3419-4138-BD4C-18D7ACCCCA08'

/* SQL text to insert entity field value with ID 7337f5b4-f213-4a33-8953-4026abb33907 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7337f5b4-f213-4a33-8953-4026abb33907', 'D3F37B48-A258-4520-AA2F-62F21555B4C7', 1, 'AI Summary', 'AI Summary')

/* SQL text to insert entity field value with ID e86b5933-3141-4e70-989a-6472ff4893e6 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('e86b5933-3141-4e70-989a-6472ff4893e6', 'D3F37B48-A258-4520-AA2F-62F21555B4C7', 2, 'First N Chars', 'First N Chars')

/* SQL text to update ValueListType for entity field ID D3F37B48-A258-4520-AA2F-62F21555B4C7 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='D3F37B48-A258-4520-AA2F-62F21555B4C7'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '592fb07e-6c95-4881-9b9c-ddde72fbcc43'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('592fb07e-6c95-4881-9b9c-ddde72fbcc43', '73AD0238-8B56-EF11-991A-6045BDEBA539', '196B0316-6078-47A4-94B9-44A2FC5E8A55', 'CompactPromptID', 'One To Many', 1, 1, 'AI Agent Actions', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'f4863a9c-a499-4896-969f-589caf8246c7'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('f4863a9c-a499-4896-969f-589caf8246c7', '73AD0238-8B56-EF11-991A-6045BDEBA539', '38248F34-2837-EF11-86D4-6045BDEE16E6', 'DefaultCompactPromptID', 'One To Many', 1, 1, 'Actions', 12);
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

-- Index for foreign key DefaultCompactPromptID in table Action
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Action_DefaultCompactPromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Action]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Action_DefaultCompactPromptID ON [${flyway:defaultSchema}].[Action] ([DefaultCompactPromptID]);

/* Root ID Function SQL for Actions.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Actions
-- Item: fnActionParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [Action].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnActionParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnActionParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnActionParentID_GetRootID]
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
            [${flyway:defaultSchema}].[Action]
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
            [${flyway:defaultSchema}].[Action] c
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


/* SQL text to update entity field related entity name field map for entity field ID 38312D56-FA69-401A-8698-12BC7F7BA37C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='38312D56-FA69-401A-8698-12BC7F7BA37C',
         @RelatedEntityNameFieldMap='DefaultCompactPrompt'

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
IF OBJECT_ID('[${flyway:defaultSchema}].[vwActions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwActions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwActions]
AS
SELECT
    a.*,
    ActionCategory_CategoryID.[Name] AS [Category],
    User_CodeApprovedByUserID.[Name] AS [CodeApprovedByUser],
    Action_ParentID.[Name] AS [Parent],
    AIPrompt_DefaultCompactPromptID.[Name] AS [DefaultCompactPrompt],
    root_ParentID.RootID AS [RootParentID]
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
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_DefaultCompactPromptID
  ON
    [a].[DefaultCompactPromptID] = AIPrompt_DefaultCompactPromptID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnActionParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAction]
    @ID uniqueidentifier = NULL,
    @CategoryID uniqueidentifier,
    @Name nvarchar(425),
    @Description nvarchar(MAX),
    @Type nvarchar(20) = NULL,
    @UserPrompt nvarchar(MAX),
    @UserComments nvarchar(MAX),
    @Code nvarchar(MAX),
    @CodeComments nvarchar(MAX),
    @CodeApprovalStatus nvarchar(20) = NULL,
    @CodeApprovalComments nvarchar(MAX),
    @CodeApprovedByUserID uniqueidentifier,
    @CodeApprovedAt datetime,
    @CodeLocked bit = NULL,
    @ForceCodeGeneration bit = NULL,
    @RetentionPeriod int,
    @Status nvarchar(20) = NULL,
    @DriverClass nvarchar(255),
    @ParentID uniqueidentifier,
    @IconClass nvarchar(100),
    @DefaultCompactPromptID uniqueidentifier
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
                [DriverClass],
                [ParentID],
                [IconClass],
                [DefaultCompactPromptID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CategoryID,
                @Name,
                @Description,
                ISNULL(@Type, 'Generated'),
                @UserPrompt,
                @UserComments,
                @Code,
                @CodeComments,
                ISNULL(@CodeApprovalStatus, 'Pending'),
                @CodeApprovalComments,
                @CodeApprovedByUserID,
                @CodeApprovedAt,
                ISNULL(@CodeLocked, 0),
                ISNULL(@ForceCodeGeneration, 0),
                @RetentionPeriod,
                ISNULL(@Status, 'Pending'),
                @DriverClass,
                @ParentID,
                @IconClass,
                @DefaultCompactPromptID
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
                [DriverClass],
                [ParentID],
                [IconClass],
                [DefaultCompactPromptID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CategoryID,
                @Name,
                @Description,
                ISNULL(@Type, 'Generated'),
                @UserPrompt,
                @UserComments,
                @Code,
                @CodeComments,
                ISNULL(@CodeApprovalStatus, 'Pending'),
                @CodeApprovalComments,
                @CodeApprovedByUserID,
                @CodeApprovedAt,
                ISNULL(@CodeLocked, 0),
                ISNULL(@ForceCodeGeneration, 0),
                @RetentionPeriod,
                ISNULL(@Status, 'Pending'),
                @DriverClass,
                @ParentID,
                @IconClass,
                @DefaultCompactPromptID
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAction];
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
    @IconClass nvarchar(100),
    @DefaultCompactPromptID uniqueidentifier
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
        [IconClass] = @IconClass,
        [DefaultCompactPromptID] = @DefaultCompactPromptID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwActions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
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
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAction]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAction];
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAction];
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


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAction] TO [cdp_Integration]
    

/* spDelete Permissions for Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAction] TO [cdp_Integration]



/* Index for Foreign Keys for AIAgentAction */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Actions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentAction
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentAction_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentAction]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentAction_AgentID ON [${flyway:defaultSchema}].[AIAgentAction] ([AgentID]);

-- Index for foreign key ActionID in table AIAgentAction
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentAction_ActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentAction]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentAction_ActionID ON [${flyway:defaultSchema}].[AIAgentAction] ([ActionID]);

-- Index for foreign key CompactPromptID in table AIAgentAction
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentAction_CompactPromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentAction]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentAction_CompactPromptID ON [${flyway:defaultSchema}].[AIAgentAction] ([CompactPromptID]);

/* SQL text to update entity field related entity name field map for entity field ID E2776E82-C59C-4C92-BA37-9A0B9B193D2C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E2776E82-C59C-4C92-BA37-9A0B9B193D2C',
         @RelatedEntityNameFieldMap='CompactPrompt'

/* Base View SQL for AI Agent Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Actions
-- Item: vwAIAgentActions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AI Agent Actions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentAction
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentActions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentActions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentActions]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    Action_ActionID.[Name] AS [Action],
    AIPrompt_CompactPromptID.[Name] AS [CompactPrompt]
FROM
    [${flyway:defaultSchema}].[AIAgentAction] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Action] AS Action_ActionID
  ON
    [a].[ActionID] = Action_ActionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_CompactPromptID
  ON
    [a].[CompactPromptID] = AIPrompt_CompactPromptID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentActions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for AI Agent Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Actions
-- Item: Permissions for vwAIAgentActions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentActions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for AI Agent Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Actions
-- Item: spCreateAIAgentAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentAction
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentAction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentAction]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @ActionID uniqueidentifier,
    @Status nvarchar(15) = NULL,
    @MinExecutionsPerRun int,
    @MaxExecutionsPerRun int,
    @ResultExpirationTurns int,
    @ResultExpirationMode nvarchar(20) = NULL,
    @CompactMode nvarchar(20),
    @CompactLength int,
    @CompactPromptID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentAction]
            (
                [ID],
                [AgentID],
                [ActionID],
                [Status],
                [MinExecutionsPerRun],
                [MaxExecutionsPerRun],
                [ResultExpirationTurns],
                [ResultExpirationMode],
                [CompactMode],
                [CompactLength],
                [CompactPromptID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @ActionID,
                ISNULL(@Status, 'Active'),
                @MinExecutionsPerRun,
                @MaxExecutionsPerRun,
                @ResultExpirationTurns,
                ISNULL(@ResultExpirationMode, 'None'),
                @CompactMode,
                @CompactLength,
                @CompactPromptID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentAction]
            (
                [AgentID],
                [ActionID],
                [Status],
                [MinExecutionsPerRun],
                [MaxExecutionsPerRun],
                [ResultExpirationTurns],
                [ResultExpirationMode],
                [CompactMode],
                [CompactLength],
                [CompactPromptID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @ActionID,
                ISNULL(@Status, 'Active'),
                @MinExecutionsPerRun,
                @MaxExecutionsPerRun,
                @ResultExpirationTurns,
                ISNULL(@ResultExpirationMode, 'None'),
                @CompactMode,
                @CompactLength,
                @CompactPromptID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentActions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentAction] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for AI Agent Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentAction] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for AI Agent Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Actions
-- Item: spUpdateAIAgentAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentAction
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentAction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentAction]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ActionID uniqueidentifier,
    @Status nvarchar(15),
    @MinExecutionsPerRun int,
    @MaxExecutionsPerRun int,
    @ResultExpirationTurns int,
    @ResultExpirationMode nvarchar(20),
    @CompactMode nvarchar(20),
    @CompactLength int,
    @CompactPromptID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentAction]
    SET
        [AgentID] = @AgentID,
        [ActionID] = @ActionID,
        [Status] = @Status,
        [MinExecutionsPerRun] = @MinExecutionsPerRun,
        [MaxExecutionsPerRun] = @MaxExecutionsPerRun,
        [ResultExpirationTurns] = @ResultExpirationTurns,
        [ResultExpirationMode] = @ResultExpirationMode,
        [CompactMode] = @CompactMode,
        [CompactLength] = @CompactLength,
        [CompactPromptID] = @CompactPromptID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentActions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentActions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentAction] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentAction table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentAction]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentAction];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentAction
ON [${flyway:defaultSchema}].[AIAgentAction]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentAction]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentAction] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for AI Agent Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentAction] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for AI Agent Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Actions
-- Item: spDeleteAIAgentAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentAction
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentAction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentAction]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentAction]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentAction] TO [cdp_Integration]
    

/* spDelete Permissions for AI Agent Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentAction] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'fc23ddfe-cdcf-4af9-977f-874b4e1043f2'  OR 
               (EntityID = '196B0316-6078-47A4-94B9-44A2FC5E8A55' AND Name = 'CompactPrompt')
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
            'fc23ddfe-cdcf-4af9-977f-874b4e1043f2',
            '196B0316-6078-47A4-94B9-44A2FC5E8A55', -- Entity: AI Agent Actions
            100031,
            'CompactPrompt',
            'Compact Prompt',
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
         WHERE ID = '8b89bbc2-8fef-4821-a92c-044e0583900e'  OR 
               (EntityID = '38248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DefaultCompactPrompt')
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
            '8b89bbc2-8fef-4821-a92c-044e0583900e',
            '38248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Actions
            100054,
            'DefaultCompactPrompt',
            'Default Compact Prompt',
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

