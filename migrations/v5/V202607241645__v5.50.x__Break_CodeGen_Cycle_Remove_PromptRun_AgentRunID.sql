/*******************************************************************************
 * Break CodeGen FK Cycle: AI Agent Runs ↔ AI Prompt Runs ↔ Conversation Details
 *
 * CodeGen detected a cycle:
 *   AIAgentRun.ConversationDetailID → ConversationDetail
 *   ConversationDetail.SummaryPromptRunID → AIPromptRun
 *   AIPromptRun.AgentRunID → AIAgentRun
 *
 * This migration breaks the cycle by:
 *   1. Moving SummaryPromptRunID out of ConversationDetail into a dedicated
 *      ConversationCompactionRun join table (audit-only, 1:1).
 *   2. Dropping AgentRunID from AIPromptRun entirely — the relationship is
 *      derivable through AIAgentRunStep.TargetLogID for prompt-type steps,
 *      and callers will use a cached helper instead of the denormalized FK.
 ******************************************************************************/

-- ============================================================================
-- PART 1: Create ConversationCompactionRun table and migrate data
-- ============================================================================

CREATE TABLE [${flyway:defaultSchema}].[ConversationCompactionRun] (
    [ID]                   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ConversationDetailID] UNIQUEIDENTIFIER NOT NULL,
    [PromptRunID]          UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [PK_ConversationCompactionRun]                    PRIMARY KEY ([ID]),
    CONSTRAINT [FK_ConversationCompactionRun_ConversationDetail] FOREIGN KEY ([ConversationDetailID]) REFERENCES [${flyway:defaultSchema}].[ConversationDetail]([ID]),
    CONSTRAINT [FK_ConversationCompactionRun_PromptRun]          FOREIGN KEY ([PromptRunID])          REFERENCES [${flyway:defaultSchema}].[AIPromptRun]([ID]),
    CONSTRAINT [UQ_ConversationCompactionRun_ConversationDetail] UNIQUE ([ConversationDetailID])
);
GO

-- Migrate existing data before dropping the column
INSERT INTO [${flyway:defaultSchema}].[ConversationCompactionRun] ([ConversationDetailID], [PromptRunID])
SELECT [ID], [SummaryPromptRunID]
FROM   [${flyway:defaultSchema}].[ConversationDetail]
WHERE  [SummaryPromptRunID] IS NOT NULL;
GO

-- ============================================================================
-- PART 2: Drop SummaryPromptRunID from ConversationDetail
-- ============================================================================

-- Drop FK constraint
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_ConversationDetail_SummaryPromptRun')
    ALTER TABLE [${flyway:defaultSchema}].[ConversationDetail] DROP CONSTRAINT [FK_ConversationDetail_SummaryPromptRun];
GO

-- Drop CodeGen-created index
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_SummaryPromptRunID')
    DROP INDEX [IDX_AUTO_MJ_FKEY_ConversationDetail_SummaryPromptRunID] ON [${flyway:defaultSchema}].[ConversationDetail];
GO

-- Drop the column itself
ALTER TABLE [${flyway:defaultSchema}].[ConversationDetail] DROP COLUMN [SummaryPromptRunID];
GO

-- Clean up EntityField and EntityRelationship metadata for the dropped columns.
-- Normally spDeleteUnneededEntityFields handles EntityField cleanup, but it runs
-- in R__RefreshMetadata.sql which recompiles views first — views that still
-- reference these dropped columns. Deleting the metadata here breaks the cycle
-- so CodeGen regenerates correct views/procs without the dropped columns.

-- SummaryPromptRunID EntityField on ConversationDetail
DELETE FROM [${flyway:defaultSchema}].[EntityField]
WHERE  [ID] = '3cdfa3a7-9e68-42ca-845d-de71b0f29988';
GO
-- SummaryPromptRunID EntityRelationship
DELETE FROM [${flyway:defaultSchema}].[EntityRelationship]
WHERE  [ID] = '02b70fe0-9d31-4d66-b8c4-a1ee87403c7f';
GO
-- AgentRunID EntityField on AIPromptRun
DELETE FROM [${flyway:defaultSchema}].[EntityField]
WHERE  [ID] = '3527B188-23DD-4C21-8716-BD17A5E05BB5';
GO
-- AgentRunID EntityRelationship
DELETE FROM [${flyway:defaultSchema}].[EntityRelationship]
WHERE  [ID] = '5D3C8533-DE96-4139-BDB9-86F122C940EB';
GO

-- ============================================================================
-- PART 3: Drop AgentRunID from AIPromptRun
-- ============================================================================

-- Drop FK constraint
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_AIPromptRun_AgentRunID')
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun] DROP CONSTRAINT [FK_AIPromptRun_AgentRunID];
GO

-- Drop CodeGen-created index
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_AgentRunID')
    DROP INDEX [IDX_AUTO_MJ_FKEY_AIPromptRun_AgentRunID] ON [${flyway:defaultSchema}].[AIPromptRun];
GO

-- Drop the column
ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun] DROP COLUMN [AgentRunID];
GO

-- ============================================================================
-- PART 4: Extended properties for new table columns
-- ============================================================================

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Links a conversation detail boundary row to the AI Prompt Run that produced its compaction summary. Audit-only join table replacing the former ConversationDetail.SummaryPromptRunID FK to break the CodeGen cycle.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationCompactionRun';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The conversation detail row whose SummaryOfEarlierConversation was produced by this compaction run.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationCompactionRun',
    @level2type = N'COLUMN', @level2name = N'ConversationDetailID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The AI Prompt Run that generated the compaction summary (model, tokens, cost, prompt version).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationCompactionRun',
    @level2type = N'COLUMN', @level2name = N'PromptRunID';
























































/*******************************************************************************
 * EVERYTHING BELOW THIS LINE WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL.
 *
 * It contains:
 *   - New Entity registration (MJ: Conversation Compaction Runs)
 *   - EntityField inserts for new/modified entities
 *   - Regenerated views (vwAIPromptRuns, vwConversationDetails, vwConversationCompactionRuns)
 *   - Regenerated stored procedures (spCreate/spUpdate/spDelete for affected entities)
 *   - Permission grants
 *   - Extended properties
 *
 * DO NOT EDIT BY HAND. If the hand-written DDL above changes, re-run CodeGen
 * and replace this entire section.
 ******************************************************************************/

/* SQL generated to create new entity MJ: Conversation Compaction Runs */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '08794d87-cfbf-480e-aa91-b2e76a4fc8a2',
         'MJ: Conversation Compaction Runs',
         'Conversation Compaction Runs',
         'Links a conversation detail boundary row to the AI Prompt Run that produced its compaction summary. Audit-only join table replacing the former ConversationDetail.SummaryPromptRunID FK to break the CodeGen cycle.',
         NULL,
         'ConversationCompactionRun',
         'vwConversationCompactionRuns',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Conversation Compaction Runs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '08794d87-cfbf-480e-aa91-b2e76a4fc8a2', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Conversation Compaction Runs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('08794d87-cfbf-480e-aa91-b2e76a4fc8a2', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Conversation Compaction Runs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('08794d87-cfbf-480e-aa91-b2e76a4fc8a2', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Conversation Compaction Runs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('08794d87-cfbf-480e-aa91-b2e76a4fc8a2', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ConversationCompactionRun */
ALTER TABLE [${flyway:defaultSchema}].[ConversationCompactionRun] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ConversationCompactionRun */
UPDATE [${flyway:defaultSchema}].[ConversationCompactionRun] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ConversationCompactionRun */
ALTER TABLE [${flyway:defaultSchema}].[ConversationCompactionRun] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ConversationCompactionRun */
ALTER TABLE [${flyway:defaultSchema}].[ConversationCompactionRun] ADD CONSTRAINT [DF___mj_ConversationCompactionRun___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ConversationCompactionRun */
ALTER TABLE [${flyway:defaultSchema}].[ConversationCompactionRun] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ConversationCompactionRun */
UPDATE [${flyway:defaultSchema}].[ConversationCompactionRun] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ConversationCompactionRun */
ALTER TABLE [${flyway:defaultSchema}].[ConversationCompactionRun] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ConversationCompactionRun */
ALTER TABLE [${flyway:defaultSchema}].[ConversationCompactionRun] ADD CONSTRAINT [DF___mj_ConversationCompactionRun___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 5 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5ea9373f-bab9-4935-837f-8eda1b7406ea' OR (EntityID = '08794D87-CFBF-480E-AA91-B2E76A4FC8A2' AND Name = 'ID')) BEGIN
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
            '5ea9373f-bab9-4935-837f-8eda1b7406ea',
            '08794D87-CFBF-480E-AA91-B2E76A4FC8A2', -- Entity: MJ: Conversation Compaction Runs
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b65d6fe8-b3f5-4bf9-b4b7-cfe536d50d93' OR (EntityID = '08794D87-CFBF-480E-AA91-B2E76A4FC8A2' AND Name = 'ConversationDetailID')) BEGIN
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
            'b65d6fe8-b3f5-4bf9-b4b7-cfe536d50d93',
            '08794D87-CFBF-480E-AA91-B2E76A4FC8A2', -- Entity: MJ: Conversation Compaction Runs
            100002,
            'ConversationDetailID',
            'Conversation Detail ID',
            'The conversation detail row whose SummaryOfEarlierConversation was produced by this compaction run.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '12248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '91226f06-c330-4876-a609-22df823b12e3' OR (EntityID = '08794D87-CFBF-480E-AA91-B2E76A4FC8A2' AND Name = 'PromptRunID')) BEGIN
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
            '91226f06-c330-4876-a609-22df823b12e3',
            '08794D87-CFBF-480E-AA91-B2E76A4FC8A2', -- Entity: MJ: Conversation Compaction Runs
            100003,
            'PromptRunID',
            'Prompt Run ID',
            'The AI Prompt Run that generated the compaction summary (model, tokens, cost, prompt version).',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '18910db4-523e-448f-a70f-36ddaf311049' OR (EntityID = '08794D87-CFBF-480E-AA91-B2E76A4FC8A2' AND Name = '__mj_CreatedAt')) BEGIN
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
            '18910db4-523e-448f-a70f-36ddaf311049',
            '08794D87-CFBF-480E-AA91-B2E76A4FC8A2', -- Entity: MJ: Conversation Compaction Runs
            100004,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '129d7129-ef0f-42aa-9abb-02256527d3d2' OR (EntityID = '08794D87-CFBF-480E-AA91-B2E76A4FC8A2' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '129d7129-ef0f-42aa-9abb-02256527d3d2',
            '08794D87-CFBF-480E-AA91-B2E76A4FC8A2', -- Entity: MJ: Conversation Compaction Runs
            100005,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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


/* Create Entity Relationship: MJ: Conversation Details -> MJ: Conversation Compaction Runs (One To Many via ConversationDetailID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '93892e5b-ff6b-41ef-8f29-5e8c2ac123e2'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('93892e5b-ff6b-41ef-8f29-5e8c2ac123e2', '12248F34-2837-EF11-86D4-6045BDEE16E6', '08794D87-CFBF-480E-AA91-B2E76A4FC8A2', 'ConversationDetailID', 'One To Many', 1, 1, 10, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Prompt Runs -> MJ: Conversation Compaction Runs (One To Many via PromptRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'b04cc697-83f9-413a-9fe8-80d70eb57b43'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('b04cc697-83f9-413a-9fe8-80d70eb57b43', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', '08794D87-CFBF-480E-AA91-B2E76A4FC8A2', 'PromptRunID', 'One To Many', 1, 1, 9, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for ConversationCompactionRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Compaction Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ConversationDetailID in table ConversationCompactionRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationCompactionRun_ConversationDetailID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationCompactionRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationCompactionRun_ConversationDetailID ON [${flyway:defaultSchema}].[ConversationCompactionRun] ([ConversationDetailID]);

-- Index for foreign key PromptRunID in table ConversationCompactionRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationCompactionRun_PromptRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationCompactionRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationCompactionRun_PromptRunID ON [${flyway:defaultSchema}].[ConversationCompactionRun] ([PromptRunID]);

/* SQL text to update entity field related entity name field map for entity field ID B65D6FE8-B3F5-4BF9-B4B7-CFE536D50D93 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='B65D6FE8-B3F5-4BF9-B4B7-CFE536D50D93', @RelatedEntityNameFieldMap='ConversationDetail';

/* SQL text to update entity field related entity name field map for entity field ID 91226F06-C330-4876-A609-22DF823B12E3 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='91226F06-C330-4876-A609-22DF823B12E3', @RelatedEntityNameFieldMap='PromptRun';

/* Base View SQL for MJ: Conversation Compaction Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Compaction Runs
-- Item: vwConversationCompactionRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Compaction Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ConversationCompactionRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwConversationCompactionRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwConversationCompactionRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversationCompactionRuns]
AS
SELECT
    c.*,
    MJConversationDetail_ConversationDetailID.[ExternalID] AS [ConversationDetail],
    MJAIPromptRun_PromptRunID.[RunName] AS [PromptRun]
FROM
    [${flyway:defaultSchema}].[ConversationCompactionRun] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ConversationDetail] AS MJConversationDetail_ConversationDetailID
  ON
    [c].[ConversationDetailID] = MJConversationDetail_ConversationDetailID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIPromptRun] AS MJAIPromptRun_PromptRunID
  ON
    [c].[PromptRunID] = MJAIPromptRun_PromptRunID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationCompactionRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Conversation Compaction Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Compaction Runs
-- Item: Permissions for vwConversationCompactionRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationCompactionRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Conversation Compaction Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Compaction Runs
-- Item: spCreateConversationCompactionRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationCompactionRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateConversationCompactionRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateConversationCompactionRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversationCompactionRun]
    @ID uniqueidentifier = NULL,
    @ConversationDetailID uniqueidentifier,
    @PromptRunID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ConversationCompactionRun]
            (
                [ID],
                [ConversationDetailID],
                [PromptRunID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ConversationDetailID,
                @PromptRunID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ConversationCompactionRun]
            (
                [ConversationDetailID],
                [PromptRunID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ConversationDetailID,
                @PromptRunID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversationCompactionRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationCompactionRun] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Conversation Compaction Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationCompactionRun] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Conversation Compaction Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Compaction Runs
-- Item: spUpdateConversationCompactionRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationCompactionRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateConversationCompactionRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationCompactionRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationCompactionRun]
    @ID uniqueidentifier,
    @ConversationDetailID uniqueidentifier = NULL,
    @PromptRunID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationCompactionRun]
    SET
        [ConversationDetailID] = ISNULL(@ConversationDetailID, [ConversationDetailID]),
        [PromptRunID] = ISNULL(@PromptRunID, [PromptRunID])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwConversationCompactionRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversationCompactionRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationCompactionRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationCompactionRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateConversationCompactionRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateConversationCompactionRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversationCompactionRun
ON [${flyway:defaultSchema}].[ConversationCompactionRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationCompactionRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ConversationCompactionRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Conversation Compaction Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationCompactionRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Conversation Compaction Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Compaction Runs
-- Item: spDeleteConversationCompactionRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationCompactionRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationCompactionRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationCompactionRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationCompactionRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationCompactionRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationCompactionRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Conversation Compaction Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationCompactionRun] TO [cdp_Developer], [cdp_Integration];

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
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIPromptRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade delete from AIPromptRunMedia using cursor to call spDeleteAIPromptRunMedia
    DECLARE @MJAIPromptRunMedias_PromptRunIDID uniqueidentifier
    DECLARE cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIPromptRunMedia]
        WHERE [PromptRunID] = @ID
    
    OPEN cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor
    FETCH NEXT FROM cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor INTO @MJAIPromptRunMedias_PromptRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIPromptRunMedia] @ID = @MJAIPromptRunMedias_PromptRunIDID
        
        FETCH NEXT FROM cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor INTO @MJAIPromptRunMedias_PromptRunIDID
    END
    
    CLOSE cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor
    DEALLOCATE cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_ParentIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_ParentID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_TokensUsed int
    DECLARE @MJAIPromptRuns_ParentID_TokensPrompt int
    DECLARE @MJAIPromptRuns_ParentID_TokensCompletion int
    DECLARE @MJAIPromptRuns_ParentID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ParentID_Success bit
    DECLARE @MJAIPromptRuns_ParentID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_ParentID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_ParentID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ParentID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_ParentID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_ParentID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_ParentID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_ParentID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_TopK int
    DECLARE @MJAIPromptRuns_ParentID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_Seed int
    DECLARE @MJAIPromptRuns_ParentID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_LogProbs bit
    DECLARE @MJAIPromptRuns_ParentID_TopLogProbs int
    DECLARE @MJAIPromptRuns_ParentID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ParentID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_ParentID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_ParentID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_ParentID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_ParentID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_ParentID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_ParentID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_ParentID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_ParentID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_ParentID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_ParentID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_Cancelled bit
    DECLARE @MJAIPromptRuns_ParentID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_ParentID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_CacheHit bit
    DECLARE @MJAIPromptRuns_ParentID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_ParentID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_ParentID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_ParentID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_ParentID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_ParentID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_QueueTime int
    DECLARE @MJAIPromptRuns_ParentID_PromptTime int
    DECLARE @MJAIPromptRuns_ParentID_CompletionTime int
    DECLARE @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_EffortLevel int
    DECLARE @MJAIPromptRuns_ParentID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_ParentID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_ParentID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_ParentID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_ParentID_TokensCacheWriteRollup int
    DECLARE cascade_update_MJAIPromptRuns_ParentID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIPromptRuns_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_ParentID_cursor INTO @MJAIPromptRuns_ParentIDID, @MJAIPromptRuns_ParentID_PromptID, @MJAIPromptRuns_ParentID_ModelID, @MJAIPromptRuns_ParentID_VendorID, @MJAIPromptRuns_ParentID_AgentID, @MJAIPromptRuns_ParentID_ConfigurationID, @MJAIPromptRuns_ParentID_RunAt, @MJAIPromptRuns_ParentID_CompletedAt, @MJAIPromptRuns_ParentID_ExecutionTimeMS, @MJAIPromptRuns_ParentID_Messages, @MJAIPromptRuns_ParentID_Result, @MJAIPromptRuns_ParentID_TokensUsed, @MJAIPromptRuns_ParentID_TokensPrompt, @MJAIPromptRuns_ParentID_TokensCompletion, @MJAIPromptRuns_ParentID_TotalCost, @MJAIPromptRuns_ParentID_Success, @MJAIPromptRuns_ParentID_ErrorMessage, @MJAIPromptRuns_ParentID_ParentID, @MJAIPromptRuns_ParentID_RunType, @MJAIPromptRuns_ParentID_ExecutionOrder, @MJAIPromptRuns_ParentID_Cost, @MJAIPromptRuns_ParentID_CostCurrency, @MJAIPromptRuns_ParentID_TokensUsedRollup, @MJAIPromptRuns_ParentID_TokensPromptRollup, @MJAIPromptRuns_ParentID_TokensCompletionRollup, @MJAIPromptRuns_ParentID_Temperature, @MJAIPromptRuns_ParentID_TopP, @MJAIPromptRuns_ParentID_TopK, @MJAIPromptRuns_ParentID_MinP, @MJAIPromptRuns_ParentID_FrequencyPenalty, @MJAIPromptRuns_ParentID_PresencePenalty, @MJAIPromptRuns_ParentID_Seed, @MJAIPromptRuns_ParentID_StopSequences, @MJAIPromptRuns_ParentID_ResponseFormat, @MJAIPromptRuns_ParentID_LogProbs, @MJAIPromptRuns_ParentID_TopLogProbs, @MJAIPromptRuns_ParentID_DescendantCost, @MJAIPromptRuns_ParentID_ValidationAttemptCount, @MJAIPromptRuns_ParentID_SuccessfulValidationCount, @MJAIPromptRuns_ParentID_FinalValidationPassed, @MJAIPromptRuns_ParentID_ValidationBehavior, @MJAIPromptRuns_ParentID_RetryStrategy, @MJAIPromptRuns_ParentID_MaxRetriesConfigured, @MJAIPromptRuns_ParentID_FinalValidationError, @MJAIPromptRuns_ParentID_ValidationErrorCount, @MJAIPromptRuns_ParentID_CommonValidationError, @MJAIPromptRuns_ParentID_FirstAttemptAt, @MJAIPromptRuns_ParentID_LastAttemptAt, @MJAIPromptRuns_ParentID_TotalRetryDurationMS, @MJAIPromptRuns_ParentID_ValidationAttempts, @MJAIPromptRuns_ParentID_ValidationSummary, @MJAIPromptRuns_ParentID_FailoverAttempts, @MJAIPromptRuns_ParentID_FailoverErrors, @MJAIPromptRuns_ParentID_FailoverDurations, @MJAIPromptRuns_ParentID_OriginalModelID, @MJAIPromptRuns_ParentID_OriginalRequestStartTime, @MJAIPromptRuns_ParentID_TotalFailoverDuration, @MJAIPromptRuns_ParentID_RerunFromPromptRunID, @MJAIPromptRuns_ParentID_ModelSelection, @MJAIPromptRuns_ParentID_Status, @MJAIPromptRuns_ParentID_Cancelled, @MJAIPromptRuns_ParentID_CancellationReason, @MJAIPromptRuns_ParentID_ModelPowerRank, @MJAIPromptRuns_ParentID_SelectionStrategy, @MJAIPromptRuns_ParentID_CacheHit, @MJAIPromptRuns_ParentID_CacheKey, @MJAIPromptRuns_ParentID_JudgeID, @MJAIPromptRuns_ParentID_JudgeScore, @MJAIPromptRuns_ParentID_WasSelectedResult, @MJAIPromptRuns_ParentID_StreamingEnabled, @MJAIPromptRuns_ParentID_FirstTokenTime, @MJAIPromptRuns_ParentID_ErrorDetails, @MJAIPromptRuns_ParentID_ChildPromptID, @MJAIPromptRuns_ParentID_QueueTime, @MJAIPromptRuns_ParentID_PromptTime, @MJAIPromptRuns_ParentID_CompletionTime, @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, @MJAIPromptRuns_ParentID_EffortLevel, @MJAIPromptRuns_ParentID_RunName, @MJAIPromptRuns_ParentID_Comments, @MJAIPromptRuns_ParentID_TestRunID, @MJAIPromptRuns_ParentID_AssistantPrefill, @MJAIPromptRuns_ParentID_TokensCacheRead, @MJAIPromptRuns_ParentID_TokensCacheWrite, @MJAIPromptRuns_ParentID_TokensCacheReadRollup, @MJAIPromptRuns_ParentID_TokensCacheWriteRollup

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_ParentIDID, @PromptID = @MJAIPromptRuns_ParentID_PromptID, @ModelID = @MJAIPromptRuns_ParentID_ModelID, @VendorID = @MJAIPromptRuns_ParentID_VendorID, @AgentID = @MJAIPromptRuns_ParentID_AgentID, @ConfigurationID = @MJAIPromptRuns_ParentID_ConfigurationID, @RunAt = @MJAIPromptRuns_ParentID_RunAt, @CompletedAt = @MJAIPromptRuns_ParentID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_ParentID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_ParentID_Messages, @Result = @MJAIPromptRuns_ParentID_Result, @TokensUsed = @MJAIPromptRuns_ParentID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_ParentID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_ParentID_TokensCompletion, @TotalCost = @MJAIPromptRuns_ParentID_TotalCost, @Success = @MJAIPromptRuns_ParentID_Success, @ErrorMessage = @MJAIPromptRuns_ParentID_ErrorMessage, @ParentID_Clear = 1, @ParentID = @MJAIPromptRuns_ParentID_ParentID, @RunType = @MJAIPromptRuns_ParentID_RunType, @ExecutionOrder = @MJAIPromptRuns_ParentID_ExecutionOrder, @Cost = @MJAIPromptRuns_ParentID_Cost, @CostCurrency = @MJAIPromptRuns_ParentID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_ParentID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_ParentID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_ParentID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_ParentID_Temperature, @TopP = @MJAIPromptRuns_ParentID_TopP, @TopK = @MJAIPromptRuns_ParentID_TopK, @MinP = @MJAIPromptRuns_ParentID_MinP, @FrequencyPenalty = @MJAIPromptRuns_ParentID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_ParentID_PresencePenalty, @Seed = @MJAIPromptRuns_ParentID_Seed, @StopSequences = @MJAIPromptRuns_ParentID_StopSequences, @ResponseFormat = @MJAIPromptRuns_ParentID_ResponseFormat, @LogProbs = @MJAIPromptRuns_ParentID_LogProbs, @TopLogProbs = @MJAIPromptRuns_ParentID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_ParentID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_ParentID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_ParentID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_ParentID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_ParentID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_ParentID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_ParentID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_ParentID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_ParentID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_ParentID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_ParentID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_ParentID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_ParentID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_ParentID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_ParentID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_ParentID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_ParentID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_ParentID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_ParentID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_ParentID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_ParentID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_ParentID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_ParentID_ModelSelection, @Status = @MJAIPromptRuns_ParentID_Status, @Cancelled = @MJAIPromptRuns_ParentID_Cancelled, @CancellationReason = @MJAIPromptRuns_ParentID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_ParentID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_ParentID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_ParentID_CacheHit, @CacheKey = @MJAIPromptRuns_ParentID_CacheKey, @JudgeID = @MJAIPromptRuns_ParentID_JudgeID, @JudgeScore = @MJAIPromptRuns_ParentID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_ParentID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_ParentID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_ParentID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_ParentID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_ParentID_ChildPromptID, @QueueTime = @MJAIPromptRuns_ParentID_QueueTime, @PromptTime = @MJAIPromptRuns_ParentID_PromptTime, @CompletionTime = @MJAIPromptRuns_ParentID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_ParentID_EffortLevel, @RunName = @MJAIPromptRuns_ParentID_RunName, @Comments = @MJAIPromptRuns_ParentID_Comments, @TestRunID = @MJAIPromptRuns_ParentID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_ParentID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_ParentID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_ParentID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_ParentID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_ParentID_TokensCacheWriteRollup

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_ParentID_cursor INTO @MJAIPromptRuns_ParentIDID, @MJAIPromptRuns_ParentID_PromptID, @MJAIPromptRuns_ParentID_ModelID, @MJAIPromptRuns_ParentID_VendorID, @MJAIPromptRuns_ParentID_AgentID, @MJAIPromptRuns_ParentID_ConfigurationID, @MJAIPromptRuns_ParentID_RunAt, @MJAIPromptRuns_ParentID_CompletedAt, @MJAIPromptRuns_ParentID_ExecutionTimeMS, @MJAIPromptRuns_ParentID_Messages, @MJAIPromptRuns_ParentID_Result, @MJAIPromptRuns_ParentID_TokensUsed, @MJAIPromptRuns_ParentID_TokensPrompt, @MJAIPromptRuns_ParentID_TokensCompletion, @MJAIPromptRuns_ParentID_TotalCost, @MJAIPromptRuns_ParentID_Success, @MJAIPromptRuns_ParentID_ErrorMessage, @MJAIPromptRuns_ParentID_ParentID, @MJAIPromptRuns_ParentID_RunType, @MJAIPromptRuns_ParentID_ExecutionOrder, @MJAIPromptRuns_ParentID_Cost, @MJAIPromptRuns_ParentID_CostCurrency, @MJAIPromptRuns_ParentID_TokensUsedRollup, @MJAIPromptRuns_ParentID_TokensPromptRollup, @MJAIPromptRuns_ParentID_TokensCompletionRollup, @MJAIPromptRuns_ParentID_Temperature, @MJAIPromptRuns_ParentID_TopP, @MJAIPromptRuns_ParentID_TopK, @MJAIPromptRuns_ParentID_MinP, @MJAIPromptRuns_ParentID_FrequencyPenalty, @MJAIPromptRuns_ParentID_PresencePenalty, @MJAIPromptRuns_ParentID_Seed, @MJAIPromptRuns_ParentID_StopSequences, @MJAIPromptRuns_ParentID_ResponseFormat, @MJAIPromptRuns_ParentID_LogProbs, @MJAIPromptRuns_ParentID_TopLogProbs, @MJAIPromptRuns_ParentID_DescendantCost, @MJAIPromptRuns_ParentID_ValidationAttemptCount, @MJAIPromptRuns_ParentID_SuccessfulValidationCount, @MJAIPromptRuns_ParentID_FinalValidationPassed, @MJAIPromptRuns_ParentID_ValidationBehavior, @MJAIPromptRuns_ParentID_RetryStrategy, @MJAIPromptRuns_ParentID_MaxRetriesConfigured, @MJAIPromptRuns_ParentID_FinalValidationError, @MJAIPromptRuns_ParentID_ValidationErrorCount, @MJAIPromptRuns_ParentID_CommonValidationError, @MJAIPromptRuns_ParentID_FirstAttemptAt, @MJAIPromptRuns_ParentID_LastAttemptAt, @MJAIPromptRuns_ParentID_TotalRetryDurationMS, @MJAIPromptRuns_ParentID_ValidationAttempts, @MJAIPromptRuns_ParentID_ValidationSummary, @MJAIPromptRuns_ParentID_FailoverAttempts, @MJAIPromptRuns_ParentID_FailoverErrors, @MJAIPromptRuns_ParentID_FailoverDurations, @MJAIPromptRuns_ParentID_OriginalModelID, @MJAIPromptRuns_ParentID_OriginalRequestStartTime, @MJAIPromptRuns_ParentID_TotalFailoverDuration, @MJAIPromptRuns_ParentID_RerunFromPromptRunID, @MJAIPromptRuns_ParentID_ModelSelection, @MJAIPromptRuns_ParentID_Status, @MJAIPromptRuns_ParentID_Cancelled, @MJAIPromptRuns_ParentID_CancellationReason, @MJAIPromptRuns_ParentID_ModelPowerRank, @MJAIPromptRuns_ParentID_SelectionStrategy, @MJAIPromptRuns_ParentID_CacheHit, @MJAIPromptRuns_ParentID_CacheKey, @MJAIPromptRuns_ParentID_JudgeID, @MJAIPromptRuns_ParentID_JudgeScore, @MJAIPromptRuns_ParentID_WasSelectedResult, @MJAIPromptRuns_ParentID_StreamingEnabled, @MJAIPromptRuns_ParentID_FirstTokenTime, @MJAIPromptRuns_ParentID_ErrorDetails, @MJAIPromptRuns_ParentID_ChildPromptID, @MJAIPromptRuns_ParentID_QueueTime, @MJAIPromptRuns_ParentID_PromptTime, @MJAIPromptRuns_ParentID_CompletionTime, @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, @MJAIPromptRuns_ParentID_EffortLevel, @MJAIPromptRuns_ParentID_RunName, @MJAIPromptRuns_ParentID_Comments, @MJAIPromptRuns_ParentID_TestRunID, @MJAIPromptRuns_ParentID_AssistantPrefill, @MJAIPromptRuns_ParentID_TokensCacheRead, @MJAIPromptRuns_ParentID_TokensCacheWrite, @MJAIPromptRuns_ParentID_TokensCacheReadRollup, @MJAIPromptRuns_ParentID_TokensCacheWriteRollup
    END

    CLOSE cascade_update_MJAIPromptRuns_ParentID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_ParentID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_RerunFromPromptRunIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Success bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TopK int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Seed int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_LogProbs bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Cancelled bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CacheHit bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_QueueTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_PromptTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWriteRollup int
    DECLARE cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [RerunFromPromptRunID] = @ID

    OPEN cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor INTO @MJAIPromptRuns_RerunFromPromptRunIDID, @MJAIPromptRuns_RerunFromPromptRunID_PromptID, @MJAIPromptRuns_RerunFromPromptRunID_ModelID, @MJAIPromptRuns_RerunFromPromptRunID_VendorID, @MJAIPromptRuns_RerunFromPromptRunID_AgentID, @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, @MJAIPromptRuns_RerunFromPromptRunID_RunAt, @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, @MJAIPromptRuns_RerunFromPromptRunID_Messages, @MJAIPromptRuns_RerunFromPromptRunID_Result, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, @MJAIPromptRuns_RerunFromPromptRunID_TotalCost, @MJAIPromptRuns_RerunFromPromptRunID_Success, @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, @MJAIPromptRuns_RerunFromPromptRunID_ParentID, @MJAIPromptRuns_RerunFromPromptRunID_RunType, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, @MJAIPromptRuns_RerunFromPromptRunID_Cost, @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, @MJAIPromptRuns_RerunFromPromptRunID_Temperature, @MJAIPromptRuns_RerunFromPromptRunID_TopP, @MJAIPromptRuns_RerunFromPromptRunID_TopK, @MJAIPromptRuns_RerunFromPromptRunID_MinP, @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, @MJAIPromptRuns_RerunFromPromptRunID_Seed, @MJAIPromptRuns_RerunFromPromptRunID_StopSequences, @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, @MJAIPromptRuns_RerunFromPromptRunID_LogProbs, @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, @MJAIPromptRuns_RerunFromPromptRunID_Status, @MJAIPromptRuns_RerunFromPromptRunID_Cancelled, @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, @MJAIPromptRuns_RerunFromPromptRunID_CacheHit, @MJAIPromptRuns_RerunFromPromptRunID_CacheKey, @MJAIPromptRuns_RerunFromPromptRunID_JudgeID, @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, @MJAIPromptRuns_RerunFromPromptRunID_QueueTime, @MJAIPromptRuns_RerunFromPromptRunID_PromptTime, @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, @MJAIPromptRuns_RerunFromPromptRunID_RunName, @MJAIPromptRuns_RerunFromPromptRunID_Comments, @MJAIPromptRuns_RerunFromPromptRunID_TestRunID, @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheRead, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWrite, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheReadRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWriteRollup

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_RerunFromPromptRunIDID, @PromptID = @MJAIPromptRuns_RerunFromPromptRunID_PromptID, @ModelID = @MJAIPromptRuns_RerunFromPromptRunID_ModelID, @VendorID = @MJAIPromptRuns_RerunFromPromptRunID_VendorID, @AgentID = @MJAIPromptRuns_RerunFromPromptRunID_AgentID, @ConfigurationID = @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, @RunAt = @MJAIPromptRuns_RerunFromPromptRunID_RunAt, @CompletedAt = @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_RerunFromPromptRunID_Messages, @Result = @MJAIPromptRuns_RerunFromPromptRunID_Result, @TokensUsed = @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, @TotalCost = @MJAIPromptRuns_RerunFromPromptRunID_TotalCost, @Success = @MJAIPromptRuns_RerunFromPromptRunID_Success, @ErrorMessage = @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, @ParentID = @MJAIPromptRuns_RerunFromPromptRunID_ParentID, @RunType = @MJAIPromptRuns_RerunFromPromptRunID_RunType, @ExecutionOrder = @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, @Cost = @MJAIPromptRuns_RerunFromPromptRunID_Cost, @CostCurrency = @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_RerunFromPromptRunID_Temperature, @TopP = @MJAIPromptRuns_RerunFromPromptRunID_TopP, @TopK = @MJAIPromptRuns_RerunFromPromptRunID_TopK, @MinP = @MJAIPromptRuns_RerunFromPromptRunID_MinP, @FrequencyPenalty = @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, @Seed = @MJAIPromptRuns_RerunFromPromptRunID_Seed, @StopSequences = @MJAIPromptRuns_RerunFromPromptRunID_StopSequences, @ResponseFormat = @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, @LogProbs = @MJAIPromptRuns_RerunFromPromptRunID_LogProbs, @TopLogProbs = @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, @RerunFromPromptRunID_Clear = 1, @RerunFromPromptRunID = @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, @Status = @MJAIPromptRuns_RerunFromPromptRunID_Status, @Cancelled = @MJAIPromptRuns_RerunFromPromptRunID_Cancelled, @CancellationReason = @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_RerunFromPromptRunID_CacheHit, @CacheKey = @MJAIPromptRuns_RerunFromPromptRunID_CacheKey, @JudgeID = @MJAIPromptRuns_RerunFromPromptRunID_JudgeID, @JudgeScore = @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, @QueueTime = @MJAIPromptRuns_RerunFromPromptRunID_QueueTime, @PromptTime = @MJAIPromptRuns_RerunFromPromptRunID_PromptTime, @CompletionTime = @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, @RunName = @MJAIPromptRuns_RerunFromPromptRunID_RunName, @Comments = @MJAIPromptRuns_RerunFromPromptRunID_Comments, @TestRunID = @MJAIPromptRuns_RerunFromPromptRunID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWriteRollup

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor INTO @MJAIPromptRuns_RerunFromPromptRunIDID, @MJAIPromptRuns_RerunFromPromptRunID_PromptID, @MJAIPromptRuns_RerunFromPromptRunID_ModelID, @MJAIPromptRuns_RerunFromPromptRunID_VendorID, @MJAIPromptRuns_RerunFromPromptRunID_AgentID, @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, @MJAIPromptRuns_RerunFromPromptRunID_RunAt, @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, @MJAIPromptRuns_RerunFromPromptRunID_Messages, @MJAIPromptRuns_RerunFromPromptRunID_Result, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, @MJAIPromptRuns_RerunFromPromptRunID_TotalCost, @MJAIPromptRuns_RerunFromPromptRunID_Success, @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, @MJAIPromptRuns_RerunFromPromptRunID_ParentID, @MJAIPromptRuns_RerunFromPromptRunID_RunType, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, @MJAIPromptRuns_RerunFromPromptRunID_Cost, @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, @MJAIPromptRuns_RerunFromPromptRunID_Temperature, @MJAIPromptRuns_RerunFromPromptRunID_TopP, @MJAIPromptRuns_RerunFromPromptRunID_TopK, @MJAIPromptRuns_RerunFromPromptRunID_MinP, @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, @MJAIPromptRuns_RerunFromPromptRunID_Seed, @MJAIPromptRuns_RerunFromPromptRunID_StopSequences, @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, @MJAIPromptRuns_RerunFromPromptRunID_LogProbs, @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, @MJAIPromptRuns_RerunFromPromptRunID_Status, @MJAIPromptRuns_RerunFromPromptRunID_Cancelled, @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, @MJAIPromptRuns_RerunFromPromptRunID_CacheHit, @MJAIPromptRuns_RerunFromPromptRunID_CacheKey, @MJAIPromptRuns_RerunFromPromptRunID_JudgeID, @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, @MJAIPromptRuns_RerunFromPromptRunID_QueueTime, @MJAIPromptRuns_RerunFromPromptRunID_PromptTime, @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, @MJAIPromptRuns_RerunFromPromptRunID_RunName, @MJAIPromptRuns_RerunFromPromptRunID_Comments, @MJAIPromptRuns_RerunFromPromptRunID_TestRunID, @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheRead, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWrite, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheReadRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWriteRollup
    END

    CLOSE cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor
    
    -- Cascade update on AIResultCache using cursor to call spUpdateAIResultCache
    DECLARE @MJAIResultCache_PromptRunIDID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_AIPromptID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_AIModelID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_RunAt datetimeoffset
    DECLARE @MJAIResultCache_PromptRunID_PromptText nvarchar(MAX)
    DECLARE @MJAIResultCache_PromptRunID_ResultText nvarchar(MAX)
    DECLARE @MJAIResultCache_PromptRunID_Status nvarchar(50)
    DECLARE @MJAIResultCache_PromptRunID_ExpiredOn datetimeoffset
    DECLARE @MJAIResultCache_PromptRunID_VendorID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_AgentID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_PromptEmbedding varbinary
    DECLARE @MJAIResultCache_PromptRunID_PromptRunID uniqueidentifier
    DECLARE cascade_update_MJAIResultCache_PromptRunID_cursor CURSOR FOR
        SELECT [ID], [AIPromptID], [AIModelID], [RunAt], [PromptText], [ResultText], [Status], [ExpiredOn], [VendorID], [AgentID], [ConfigurationID], [PromptEmbedding], [PromptRunID]
        FROM [${flyway:defaultSchema}].[AIResultCache]
        WHERE [PromptRunID] = @ID

    OPEN cascade_update_MJAIResultCache_PromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIResultCache_PromptRunID_cursor INTO @MJAIResultCache_PromptRunIDID, @MJAIResultCache_PromptRunID_AIPromptID, @MJAIResultCache_PromptRunID_AIModelID, @MJAIResultCache_PromptRunID_RunAt, @MJAIResultCache_PromptRunID_PromptText, @MJAIResultCache_PromptRunID_ResultText, @MJAIResultCache_PromptRunID_Status, @MJAIResultCache_PromptRunID_ExpiredOn, @MJAIResultCache_PromptRunID_VendorID, @MJAIResultCache_PromptRunID_AgentID, @MJAIResultCache_PromptRunID_ConfigurationID, @MJAIResultCache_PromptRunID_PromptEmbedding, @MJAIResultCache_PromptRunID_PromptRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIResultCache_PromptRunID_PromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIResultCache] @ID = @MJAIResultCache_PromptRunIDID, @AIPromptID = @MJAIResultCache_PromptRunID_AIPromptID, @AIModelID = @MJAIResultCache_PromptRunID_AIModelID, @RunAt = @MJAIResultCache_PromptRunID_RunAt, @PromptText = @MJAIResultCache_PromptRunID_PromptText, @ResultText = @MJAIResultCache_PromptRunID_ResultText, @Status = @MJAIResultCache_PromptRunID_Status, @ExpiredOn = @MJAIResultCache_PromptRunID_ExpiredOn, @VendorID = @MJAIResultCache_PromptRunID_VendorID, @AgentID = @MJAIResultCache_PromptRunID_AgentID, @ConfigurationID = @MJAIResultCache_PromptRunID_ConfigurationID, @PromptEmbedding = @MJAIResultCache_PromptRunID_PromptEmbedding, @PromptRunID_Clear = 1, @PromptRunID = @MJAIResultCache_PromptRunID_PromptRunID

        FETCH NEXT FROM cascade_update_MJAIResultCache_PromptRunID_cursor INTO @MJAIResultCache_PromptRunIDID, @MJAIResultCache_PromptRunID_AIPromptID, @MJAIResultCache_PromptRunID_AIModelID, @MJAIResultCache_PromptRunID_RunAt, @MJAIResultCache_PromptRunID_PromptText, @MJAIResultCache_PromptRunID_ResultText, @MJAIResultCache_PromptRunID_Status, @MJAIResultCache_PromptRunID_ExpiredOn, @MJAIResultCache_PromptRunID_VendorID, @MJAIResultCache_PromptRunID_AgentID, @MJAIResultCache_PromptRunID_ConfigurationID, @MJAIResultCache_PromptRunID_PromptEmbedding, @MJAIResultCache_PromptRunID_PromptRunID
    END

    CLOSE cascade_update_MJAIResultCache_PromptRunID_cursor
    DEALLOCATE cascade_update_MJAIResultCache_PromptRunID_cursor
    
    -- Cascade update on ContentItemTag using cursor to call spUpdateContentItemTag
    DECLARE @MJContentItemTags_AIPromptRunIDID uniqueidentifier
    DECLARE @MJContentItemTags_AIPromptRunID_ItemID uniqueidentifier
    DECLARE @MJContentItemTags_AIPromptRunID_Tag nvarchar(200)
    DECLARE @MJContentItemTags_AIPromptRunID_Weight numeric(5, 4)
    DECLARE @MJContentItemTags_AIPromptRunID_TagID uniqueidentifier
    DECLARE @MJContentItemTags_AIPromptRunID_AIPromptRunID uniqueidentifier
    DECLARE @MJContentItemTags_AIPromptRunID_Reasoning nvarchar(MAX)
    DECLARE cascade_update_MJContentItemTags_AIPromptRunID_cursor CURSOR FOR
        SELECT [ID], [ItemID], [Tag], [Weight], [TagID], [AIPromptRunID], [Reasoning]
        FROM [${flyway:defaultSchema}].[ContentItemTag]
        WHERE [AIPromptRunID] = @ID

    OPEN cascade_update_MJContentItemTags_AIPromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJContentItemTags_AIPromptRunID_cursor INTO @MJContentItemTags_AIPromptRunIDID, @MJContentItemTags_AIPromptRunID_ItemID, @MJContentItemTags_AIPromptRunID_Tag, @MJContentItemTags_AIPromptRunID_Weight, @MJContentItemTags_AIPromptRunID_TagID, @MJContentItemTags_AIPromptRunID_AIPromptRunID, @MJContentItemTags_AIPromptRunID_Reasoning

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJContentItemTags_AIPromptRunID_AIPromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateContentItemTag] @ID = @MJContentItemTags_AIPromptRunIDID, @ItemID = @MJContentItemTags_AIPromptRunID_ItemID, @Tag = @MJContentItemTags_AIPromptRunID_Tag, @Weight = @MJContentItemTags_AIPromptRunID_Weight, @TagID = @MJContentItemTags_AIPromptRunID_TagID, @AIPromptRunID_Clear = 1, @AIPromptRunID = @MJContentItemTags_AIPromptRunID_AIPromptRunID, @Reasoning = @MJContentItemTags_AIPromptRunID_Reasoning

        FETCH NEXT FROM cascade_update_MJContentItemTags_AIPromptRunID_cursor INTO @MJContentItemTags_AIPromptRunIDID, @MJContentItemTags_AIPromptRunID_ItemID, @MJContentItemTags_AIPromptRunID_Tag, @MJContentItemTags_AIPromptRunID_Weight, @MJContentItemTags_AIPromptRunID_TagID, @MJContentItemTags_AIPromptRunID_AIPromptRunID, @MJContentItemTags_AIPromptRunID_Reasoning
    END

    CLOSE cascade_update_MJContentItemTags_AIPromptRunID_cursor
    DEALLOCATE cascade_update_MJContentItemTags_AIPromptRunID_cursor
    
    -- Cascade delete from ContentProcessRunPromptRun using cursor to call spDeleteContentProcessRunPromptRun
    DECLARE @MJContentProcessRunPromptRuns_AIPromptRunIDID uniqueidentifier
    DECLARE cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ContentProcessRunPromptRun]
        WHERE [AIPromptRunID] = @ID
    
    OPEN cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor
    FETCH NEXT FROM cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor INTO @MJContentProcessRunPromptRuns_AIPromptRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteContentProcessRunPromptRun] @ID = @MJContentProcessRunPromptRuns_AIPromptRunIDID
        
        FETCH NEXT FROM cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor INTO @MJContentProcessRunPromptRuns_AIPromptRunIDID
    END
    
    CLOSE cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor
    DEALLOCATE cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor
    
    -- Cascade delete from ConversationCompactionRun using cursor to call spDeleteConversationCompactionRun
    DECLARE @MJConversationCompactionRuns_PromptRunIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationCompactionRuns_PromptRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationCompactionRun]
        WHERE [PromptRunID] = @ID
    
    OPEN cascade_delete_MJConversationCompactionRuns_PromptRunID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationCompactionRuns_PromptRunID_cursor INTO @MJConversationCompactionRuns_PromptRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationCompactionRun] @ID = @MJConversationCompactionRuns_PromptRunIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationCompactionRuns_PromptRunID_cursor INTO @MJConversationCompactionRuns_PromptRunIDID
    END
    
    CLOSE cascade_delete_MJConversationCompactionRuns_PromptRunID_cursor
    DEALLOCATE cascade_delete_MJConversationCompactionRuns_PromptRunID_cursor
    
    -- Cascade update on DuplicateRunDetailMatch using cursor to call spUpdateDuplicateRunDetailMatch
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunIDID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_DuplicateRunDetailID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_MatchSource nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_MatchRecordID nvarchar(500)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_MatchProbability numeric(12, 11)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_MatchedAt datetimeoffset
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_Action nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_ApprovalStatus nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_RecordMergeLogID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_MergeStatus nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_MergedAt datetimeoffset
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_RecordMetadata nvarchar(MAX)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_AIAgentRunID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_AIPromptRunID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_LLMRecommendation nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_LLMConfidence numeric(12, 11)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_LLMReasoning nvarchar(MAX)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedSurvivorRecordID nvarchar(500)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedFieldMap nvarchar(MAX)
    DECLARE cascade_update_MJDuplicateRunDetailMatches_AIPromptRunID_cursor CURSOR FOR
        SELECT [ID], [DuplicateRunDetailID], [MatchSource], [MatchRecordID], [MatchProbability], [MatchedAt], [Action], [ApprovalStatus], [RecordMergeLogID], [MergeStatus], [MergedAt], [RecordMetadata], [AIAgentRunID], [AIPromptRunID], [LLMRecommendation], [LLMConfidence], [LLMReasoning], [LLMProposedSurvivorRecordID], [LLMProposedFieldMap]
        FROM [${flyway:defaultSchema}].[DuplicateRunDetailMatch]
        WHERE [AIPromptRunID] = @ID

    OPEN cascade_update_MJDuplicateRunDetailMatches_AIPromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJDuplicateRunDetailMatches_AIPromptRunID_cursor INTO @MJDuplicateRunDetailMatches_AIPromptRunIDID, @MJDuplicateRunDetailMatches_AIPromptRunID_DuplicateRunDetailID, @MJDuplicateRunDetailMatches_AIPromptRunID_MatchSource, @MJDuplicateRunDetailMatches_AIPromptRunID_MatchRecordID, @MJDuplicateRunDetailMatches_AIPromptRunID_MatchProbability, @MJDuplicateRunDetailMatches_AIPromptRunID_MatchedAt, @MJDuplicateRunDetailMatches_AIPromptRunID_Action, @MJDuplicateRunDetailMatches_AIPromptRunID_ApprovalStatus, @MJDuplicateRunDetailMatches_AIPromptRunID_RecordMergeLogID, @MJDuplicateRunDetailMatches_AIPromptRunID_MergeStatus, @MJDuplicateRunDetailMatches_AIPromptRunID_MergedAt, @MJDuplicateRunDetailMatches_AIPromptRunID_RecordMetadata, @MJDuplicateRunDetailMatches_AIPromptRunID_AIAgentRunID, @MJDuplicateRunDetailMatches_AIPromptRunID_AIPromptRunID, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMRecommendation, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMConfidence, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMReasoning, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedSurvivorRecordID, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedFieldMap

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJDuplicateRunDetailMatches_AIPromptRunID_AIPromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateDuplicateRunDetailMatch] @ID = @MJDuplicateRunDetailMatches_AIPromptRunIDID, @DuplicateRunDetailID = @MJDuplicateRunDetailMatches_AIPromptRunID_DuplicateRunDetailID, @MatchSource = @MJDuplicateRunDetailMatches_AIPromptRunID_MatchSource, @MatchRecordID = @MJDuplicateRunDetailMatches_AIPromptRunID_MatchRecordID, @MatchProbability = @MJDuplicateRunDetailMatches_AIPromptRunID_MatchProbability, @MatchedAt = @MJDuplicateRunDetailMatches_AIPromptRunID_MatchedAt, @Action = @MJDuplicateRunDetailMatches_AIPromptRunID_Action, @ApprovalStatus = @MJDuplicateRunDetailMatches_AIPromptRunID_ApprovalStatus, @RecordMergeLogID = @MJDuplicateRunDetailMatches_AIPromptRunID_RecordMergeLogID, @MergeStatus = @MJDuplicateRunDetailMatches_AIPromptRunID_MergeStatus, @MergedAt = @MJDuplicateRunDetailMatches_AIPromptRunID_MergedAt, @RecordMetadata = @MJDuplicateRunDetailMatches_AIPromptRunID_RecordMetadata, @AIAgentRunID = @MJDuplicateRunDetailMatches_AIPromptRunID_AIAgentRunID, @AIPromptRunID_Clear = 1, @AIPromptRunID = @MJDuplicateRunDetailMatches_AIPromptRunID_AIPromptRunID, @LLMRecommendation = @MJDuplicateRunDetailMatches_AIPromptRunID_LLMRecommendation, @LLMConfidence = @MJDuplicateRunDetailMatches_AIPromptRunID_LLMConfidence, @LLMReasoning = @MJDuplicateRunDetailMatches_AIPromptRunID_LLMReasoning, @LLMProposedSurvivorRecordID = @MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedSurvivorRecordID, @LLMProposedFieldMap = @MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedFieldMap

        FETCH NEXT FROM cascade_update_MJDuplicateRunDetailMatches_AIPromptRunID_cursor INTO @MJDuplicateRunDetailMatches_AIPromptRunIDID, @MJDuplicateRunDetailMatches_AIPromptRunID_DuplicateRunDetailID, @MJDuplicateRunDetailMatches_AIPromptRunID_MatchSource, @MJDuplicateRunDetailMatches_AIPromptRunID_MatchRecordID, @MJDuplicateRunDetailMatches_AIPromptRunID_MatchProbability, @MJDuplicateRunDetailMatches_AIPromptRunID_MatchedAt, @MJDuplicateRunDetailMatches_AIPromptRunID_Action, @MJDuplicateRunDetailMatches_AIPromptRunID_ApprovalStatus, @MJDuplicateRunDetailMatches_AIPromptRunID_RecordMergeLogID, @MJDuplicateRunDetailMatches_AIPromptRunID_MergeStatus, @MJDuplicateRunDetailMatches_AIPromptRunID_MergedAt, @MJDuplicateRunDetailMatches_AIPromptRunID_RecordMetadata, @MJDuplicateRunDetailMatches_AIPromptRunID_AIAgentRunID, @MJDuplicateRunDetailMatches_AIPromptRunID_AIPromptRunID, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMRecommendation, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMConfidence, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMReasoning, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedSurvivorRecordID, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedFieldMap
    END

    CLOSE cascade_update_MJDuplicateRunDetailMatches_AIPromptRunID_cursor
    DEALLOCATE cascade_update_MJDuplicateRunDetailMatches_AIPromptRunID_cursor
    
    -- Cascade update on UserRoutineRun using cursor to call spUpdateUserRoutineRun
    DECLARE @MJUserRoutineRuns_PromptRunIDID uniqueidentifier
    DECLARE @MJUserRoutineRuns_PromptRunID_RoutineID uniqueidentifier
    DECLARE @MJUserRoutineRuns_PromptRunID_StartedAt datetimeoffset
    DECLARE @MJUserRoutineRuns_PromptRunID_CompletedAt datetimeoffset
    DECLARE @MJUserRoutineRuns_PromptRunID_Status nvarchar(20)
    DECLARE @MJUserRoutineRuns_PromptRunID_AgentRunID uniqueidentifier
    DECLARE @MJUserRoutineRuns_PromptRunID_PromptRunID uniqueidentifier
    DECLARE @MJUserRoutineRuns_PromptRunID_ActionExecutionLogID uniqueidentifier
    DECLARE @MJUserRoutineRuns_PromptRunID_ResultSummary nvarchar(MAX)
    DECLARE @MJUserRoutineRuns_PromptRunID_ResultHash nvarchar(100)
    DECLARE @MJUserRoutineRuns_PromptRunID_NotificationSent bit
    DECLARE @MJUserRoutineRuns_PromptRunID_ErrorMessage nvarchar(MAX)
    DECLARE cascade_update_MJUserRoutineRuns_PromptRunID_cursor CURSOR FOR
        SELECT [ID], [RoutineID], [StartedAt], [CompletedAt], [Status], [AgentRunID], [PromptRunID], [ActionExecutionLogID], [ResultSummary], [ResultHash], [NotificationSent], [ErrorMessage]
        FROM [${flyway:defaultSchema}].[UserRoutineRun]
        WHERE [PromptRunID] = @ID

    OPEN cascade_update_MJUserRoutineRuns_PromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJUserRoutineRuns_PromptRunID_cursor INTO @MJUserRoutineRuns_PromptRunIDID, @MJUserRoutineRuns_PromptRunID_RoutineID, @MJUserRoutineRuns_PromptRunID_StartedAt, @MJUserRoutineRuns_PromptRunID_CompletedAt, @MJUserRoutineRuns_PromptRunID_Status, @MJUserRoutineRuns_PromptRunID_AgentRunID, @MJUserRoutineRuns_PromptRunID_PromptRunID, @MJUserRoutineRuns_PromptRunID_ActionExecutionLogID, @MJUserRoutineRuns_PromptRunID_ResultSummary, @MJUserRoutineRuns_PromptRunID_ResultHash, @MJUserRoutineRuns_PromptRunID_NotificationSent, @MJUserRoutineRuns_PromptRunID_ErrorMessage

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJUserRoutineRuns_PromptRunID_PromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateUserRoutineRun] @ID = @MJUserRoutineRuns_PromptRunIDID, @RoutineID = @MJUserRoutineRuns_PromptRunID_RoutineID, @StartedAt = @MJUserRoutineRuns_PromptRunID_StartedAt, @CompletedAt = @MJUserRoutineRuns_PromptRunID_CompletedAt, @Status = @MJUserRoutineRuns_PromptRunID_Status, @AgentRunID = @MJUserRoutineRuns_PromptRunID_AgentRunID, @PromptRunID_Clear = 1, @PromptRunID = @MJUserRoutineRuns_PromptRunID_PromptRunID, @ActionExecutionLogID = @MJUserRoutineRuns_PromptRunID_ActionExecutionLogID, @ResultSummary = @MJUserRoutineRuns_PromptRunID_ResultSummary, @ResultHash = @MJUserRoutineRuns_PromptRunID_ResultHash, @NotificationSent = @MJUserRoutineRuns_PromptRunID_NotificationSent, @ErrorMessage = @MJUserRoutineRuns_PromptRunID_ErrorMessage

        FETCH NEXT FROM cascade_update_MJUserRoutineRuns_PromptRunID_cursor INTO @MJUserRoutineRuns_PromptRunIDID, @MJUserRoutineRuns_PromptRunID_RoutineID, @MJUserRoutineRuns_PromptRunID_StartedAt, @MJUserRoutineRuns_PromptRunID_CompletedAt, @MJUserRoutineRuns_PromptRunID_Status, @MJUserRoutineRuns_PromptRunID_AgentRunID, @MJUserRoutineRuns_PromptRunID_PromptRunID, @MJUserRoutineRuns_PromptRunID_ActionExecutionLogID, @MJUserRoutineRuns_PromptRunID_ResultSummary, @MJUserRoutineRuns_PromptRunID_ResultHash, @MJUserRoutineRuns_PromptRunID_NotificationSent, @MJUserRoutineRuns_PromptRunID_ErrorMessage
    END

    CLOSE cascade_update_MJUserRoutineRuns_PromptRunID_cursor
    DEALLOCATE cascade_update_MJUserRoutineRuns_PromptRunID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIPromptRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: spDeleteConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample
    DECLARE @MJAIAgentExamples_SourceConversationDetailIDID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_AgentID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_UserID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_Type nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_ExampleInput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_ExampleOutput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated bit
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SuccessScore decimal(5, 2)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_Status nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_AccessCount int
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_ExpiresAt datetimeoffset
    DECLARE cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [UserID], [CompanyID], [Type], [ExampleInput], [ExampleOutput], [IsAutoGenerated], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [SuccessScore], [Comments], [Status], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [SourceConversationDetailID] = @ID

    OPEN cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor INTO @MJAIAgentExamples_SourceConversationDetailIDID, @MJAIAgentExamples_SourceConversationDetailID_AgentID, @MJAIAgentExamples_SourceConversationDetailID_UserID, @MJAIAgentExamples_SourceConversationDetailID_CompanyID, @MJAIAgentExamples_SourceConversationDetailID_Type, @MJAIAgentExamples_SourceConversationDetailID_ExampleInput, @MJAIAgentExamples_SourceConversationDetailID_ExampleOutput, @MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated, @MJAIAgentExamples_SourceConversationDetailID_SourceConversationID, @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID, @MJAIAgentExamples_SourceConversationDetailID_SourceAIAgentRunID, @MJAIAgentExamples_SourceConversationDetailID_SuccessScore, @MJAIAgentExamples_SourceConversationDetailID_Comments, @MJAIAgentExamples_SourceConversationDetailID_Status, @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector, @MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID, @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes, @MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt, @MJAIAgentExamples_SourceConversationDetailID_AccessCount, @MJAIAgentExamples_SourceConversationDetailID_ExpiresAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentExample] @ID = @MJAIAgentExamples_SourceConversationDetailIDID, @AgentID = @MJAIAgentExamples_SourceConversationDetailID_AgentID, @UserID = @MJAIAgentExamples_SourceConversationDetailID_UserID, @CompanyID = @MJAIAgentExamples_SourceConversationDetailID_CompanyID, @Type = @MJAIAgentExamples_SourceConversationDetailID_Type, @ExampleInput = @MJAIAgentExamples_SourceConversationDetailID_ExampleInput, @ExampleOutput = @MJAIAgentExamples_SourceConversationDetailID_ExampleOutput, @IsAutoGenerated = @MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated, @SourceConversationID = @MJAIAgentExamples_SourceConversationDetailID_SourceConversationID, @SourceConversationDetailID_Clear = 1, @SourceConversationDetailID = @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentExamples_SourceConversationDetailID_SourceAIAgentRunID, @SuccessScore = @MJAIAgentExamples_SourceConversationDetailID_SuccessScore, @Comments = @MJAIAgentExamples_SourceConversationDetailID_Comments, @Status = @MJAIAgentExamples_SourceConversationDetailID_Status, @EmbeddingVector = @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes, @LastAccessedAt = @MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt, @AccessCount = @MJAIAgentExamples_SourceConversationDetailID_AccessCount, @ExpiresAt = @MJAIAgentExamples_SourceConversationDetailID_ExpiresAt

        FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor INTO @MJAIAgentExamples_SourceConversationDetailIDID, @MJAIAgentExamples_SourceConversationDetailID_AgentID, @MJAIAgentExamples_SourceConversationDetailID_UserID, @MJAIAgentExamples_SourceConversationDetailID_CompanyID, @MJAIAgentExamples_SourceConversationDetailID_Type, @MJAIAgentExamples_SourceConversationDetailID_ExampleInput, @MJAIAgentExamples_SourceConversationDetailID_ExampleOutput, @MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated, @MJAIAgentExamples_SourceConversationDetailID_SourceConversationID, @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID, @MJAIAgentExamples_SourceConversationDetailID_SourceAIAgentRunID, @MJAIAgentExamples_SourceConversationDetailID_SuccessScore, @MJAIAgentExamples_SourceConversationDetailID_Comments, @MJAIAgentExamples_SourceConversationDetailID_Status, @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector, @MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID, @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes, @MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt, @MJAIAgentExamples_SourceConversationDetailID_AccessCount, @MJAIAgentExamples_SourceConversationDetailID_ExpiresAt
    END

    CLOSE cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor
    DEALLOCATE cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor
    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @MJAIAgentNotes_SourceConversationDetailIDID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_AgentID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_Note nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_UserID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_Type nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated bit
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_Status nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_AccessCount int
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_ConsolidatedIntoNoteID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_ConsolidationCount int
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_DerivedFromNoteIDs nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_ProtectionTier nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_ImportanceScore decimal(5, 2)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_AuthorType nvarchar(20)
    DECLARE cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [ConsolidatedIntoNoteID], [ConsolidationCount], [DerivedFromNoteIDs], [ProtectionTier], [ImportanceScore], [AuthorType]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceConversationDetailID] = @ID

    OPEN cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor INTO @MJAIAgentNotes_SourceConversationDetailIDID, @MJAIAgentNotes_SourceConversationDetailID_AgentID, @MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID, @MJAIAgentNotes_SourceConversationDetailID_Note, @MJAIAgentNotes_SourceConversationDetailID_UserID, @MJAIAgentNotes_SourceConversationDetailID_Type, @MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated, @MJAIAgentNotes_SourceConversationDetailID_Comments, @MJAIAgentNotes_SourceConversationDetailID_Status, @MJAIAgentNotes_SourceConversationDetailID_SourceConversationID, @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID, @MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID, @MJAIAgentNotes_SourceConversationDetailID_CompanyID, @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector, @MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID, @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes, @MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt, @MJAIAgentNotes_SourceConversationDetailID_AccessCount, @MJAIAgentNotes_SourceConversationDetailID_ExpiresAt, @MJAIAgentNotes_SourceConversationDetailID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceConversationDetailID_ConsolidationCount, @MJAIAgentNotes_SourceConversationDetailID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceConversationDetailID_ProtectionTier, @MJAIAgentNotes_SourceConversationDetailID_ImportanceScore, @MJAIAgentNotes_SourceConversationDetailID_AuthorType

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_SourceConversationDetailIDID, @AgentID = @MJAIAgentNotes_SourceConversationDetailID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID, @Note = @MJAIAgentNotes_SourceConversationDetailID_Note, @UserID = @MJAIAgentNotes_SourceConversationDetailID_UserID, @Type = @MJAIAgentNotes_SourceConversationDetailID_Type, @IsAutoGenerated = @MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated, @Comments = @MJAIAgentNotes_SourceConversationDetailID_Comments, @Status = @MJAIAgentNotes_SourceConversationDetailID_Status, @SourceConversationID = @MJAIAgentNotes_SourceConversationDetailID_SourceConversationID, @SourceConversationDetailID_Clear = 1, @SourceConversationDetailID = @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_SourceConversationDetailID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_SourceConversationDetailID_AccessCount, @ExpiresAt = @MJAIAgentNotes_SourceConversationDetailID_ExpiresAt, @ConsolidatedIntoNoteID = @MJAIAgentNotes_SourceConversationDetailID_ConsolidatedIntoNoteID, @ConsolidationCount = @MJAIAgentNotes_SourceConversationDetailID_ConsolidationCount, @DerivedFromNoteIDs = @MJAIAgentNotes_SourceConversationDetailID_DerivedFromNoteIDs, @ProtectionTier = @MJAIAgentNotes_SourceConversationDetailID_ProtectionTier, @ImportanceScore = @MJAIAgentNotes_SourceConversationDetailID_ImportanceScore, @AuthorType = @MJAIAgentNotes_SourceConversationDetailID_AuthorType

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor INTO @MJAIAgentNotes_SourceConversationDetailIDID, @MJAIAgentNotes_SourceConversationDetailID_AgentID, @MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID, @MJAIAgentNotes_SourceConversationDetailID_Note, @MJAIAgentNotes_SourceConversationDetailID_UserID, @MJAIAgentNotes_SourceConversationDetailID_Type, @MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated, @MJAIAgentNotes_SourceConversationDetailID_Comments, @MJAIAgentNotes_SourceConversationDetailID_Status, @MJAIAgentNotes_SourceConversationDetailID_SourceConversationID, @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID, @MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID, @MJAIAgentNotes_SourceConversationDetailID_CompanyID, @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector, @MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID, @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes, @MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt, @MJAIAgentNotes_SourceConversationDetailID_AccessCount, @MJAIAgentNotes_SourceConversationDetailID_ExpiresAt, @MJAIAgentNotes_SourceConversationDetailID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceConversationDetailID_ConsolidationCount, @MJAIAgentNotes_SourceConversationDetailID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceConversationDetailID_ProtectionTier, @MJAIAgentNotes_SourceConversationDetailID_ImportanceScore, @MJAIAgentNotes_SourceConversationDetailID_AuthorType
    END

    CLOSE cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor
    DEALLOCATE cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_ConversationDetailIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_ConversationDetailID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConversationDetailID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConversationDetailID_Success bit
    DECLARE @MJAIAgentRuns_ConversationDetailID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCost decimal(18, 6)
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_ConversationDetailID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_ConversationDetailID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_ConversationDetailID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_ConversationDetailID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_ConversationDetailID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_Verbose bit
    DECLARE @MJAIAgentRuns_ConversationDetailID_EffortLevel int
    DECLARE @MJAIAgentRuns_ConversationDetailID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_ConversationDetailID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_ConversationDetailID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_ExternalReferenceID nvarchar(200)
    DECLARE @MJAIAgentRuns_ConversationDetailID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCacheReadTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCacheWriteTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationDetailID_LastHeartbeatAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConversationDetailID_AgentSessionID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_PlanMode bit
    DECLARE cascade_update_MJAIAgentRuns_ConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed], [LastHeartbeatAt], [AgentSessionID], [PlanMode]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationDetailID] = @ID

    OPEN cascade_update_MJAIAgentRuns_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConversationDetailID_cursor INTO @MJAIAgentRuns_ConversationDetailIDID, @MJAIAgentRuns_ConversationDetailID_AgentID, @MJAIAgentRuns_ConversationDetailID_ParentRunID, @MJAIAgentRuns_ConversationDetailID_Status, @MJAIAgentRuns_ConversationDetailID_StartedAt, @MJAIAgentRuns_ConversationDetailID_CompletedAt, @MJAIAgentRuns_ConversationDetailID_Success, @MJAIAgentRuns_ConversationDetailID_ErrorMessage, @MJAIAgentRuns_ConversationDetailID_ConversationID, @MJAIAgentRuns_ConversationDetailID_UserID, @MJAIAgentRuns_ConversationDetailID_Result, @MJAIAgentRuns_ConversationDetailID_AgentState, @MJAIAgentRuns_ConversationDetailID_TotalTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCost, @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalCostRollup, @MJAIAgentRuns_ConversationDetailID_ConversationDetailID, @MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence, @MJAIAgentRuns_ConversationDetailID_CancellationReason, @MJAIAgentRuns_ConversationDetailID_FinalStep, @MJAIAgentRuns_ConversationDetailID_FinalPayload, @MJAIAgentRuns_ConversationDetailID_Message, @MJAIAgentRuns_ConversationDetailID_LastRunID, @MJAIAgentRuns_ConversationDetailID_StartingPayload, @MJAIAgentRuns_ConversationDetailID_TotalPromptIterations, @MJAIAgentRuns_ConversationDetailID_ConfigurationID, @MJAIAgentRuns_ConversationDetailID_OverrideModelID, @MJAIAgentRuns_ConversationDetailID_OverrideVendorID, @MJAIAgentRuns_ConversationDetailID_Data, @MJAIAgentRuns_ConversationDetailID_Verbose, @MJAIAgentRuns_ConversationDetailID_EffortLevel, @MJAIAgentRuns_ConversationDetailID_RunName, @MJAIAgentRuns_ConversationDetailID_Comments, @MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID, @MJAIAgentRuns_ConversationDetailID_TestRunID, @MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID, @MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID, @MJAIAgentRuns_ConversationDetailID_SecondaryScopes, @MJAIAgentRuns_ConversationDetailID_ExternalReferenceID, @MJAIAgentRuns_ConversationDetailID_CompanyID, @MJAIAgentRuns_ConversationDetailID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ConversationDetailID_LastHeartbeatAt, @MJAIAgentRuns_ConversationDetailID_AgentSessionID, @MJAIAgentRuns_ConversationDetailID_PlanMode

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_ConversationDetailID_ConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_ConversationDetailIDID, @AgentID = @MJAIAgentRuns_ConversationDetailID_AgentID, @ParentRunID = @MJAIAgentRuns_ConversationDetailID_ParentRunID, @Status = @MJAIAgentRuns_ConversationDetailID_Status, @StartedAt = @MJAIAgentRuns_ConversationDetailID_StartedAt, @CompletedAt = @MJAIAgentRuns_ConversationDetailID_CompletedAt, @Success = @MJAIAgentRuns_ConversationDetailID_Success, @ErrorMessage = @MJAIAgentRuns_ConversationDetailID_ErrorMessage, @ConversationID = @MJAIAgentRuns_ConversationDetailID_ConversationID, @UserID = @MJAIAgentRuns_ConversationDetailID_UserID, @Result = @MJAIAgentRuns_ConversationDetailID_Result, @AgentState = @MJAIAgentRuns_ConversationDetailID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_ConversationDetailID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_ConversationDetailID_TotalCostRollup, @ConversationDetailID_Clear = 1, @ConversationDetailID = @MJAIAgentRuns_ConversationDetailID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_ConversationDetailID_CancellationReason, @FinalStep = @MJAIAgentRuns_ConversationDetailID_FinalStep, @FinalPayload = @MJAIAgentRuns_ConversationDetailID_FinalPayload, @Message = @MJAIAgentRuns_ConversationDetailID_Message, @LastRunID = @MJAIAgentRuns_ConversationDetailID_LastRunID, @StartingPayload = @MJAIAgentRuns_ConversationDetailID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_ConversationDetailID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_ConversationDetailID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_ConversationDetailID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_ConversationDetailID_OverrideVendorID, @Data = @MJAIAgentRuns_ConversationDetailID_Data, @Verbose = @MJAIAgentRuns_ConversationDetailID_Verbose, @EffortLevel = @MJAIAgentRuns_ConversationDetailID_EffortLevel, @RunName = @MJAIAgentRuns_ConversationDetailID_RunName, @Comments = @MJAIAgentRuns_ConversationDetailID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_ConversationDetailID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_ConversationDetailID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_ConversationDetailID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_ConversationDetailID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalCacheWriteTokensUsed, @LastHeartbeatAt = @MJAIAgentRuns_ConversationDetailID_LastHeartbeatAt, @AgentSessionID = @MJAIAgentRuns_ConversationDetailID_AgentSessionID, @PlanMode = @MJAIAgentRuns_ConversationDetailID_PlanMode

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConversationDetailID_cursor INTO @MJAIAgentRuns_ConversationDetailIDID, @MJAIAgentRuns_ConversationDetailID_AgentID, @MJAIAgentRuns_ConversationDetailID_ParentRunID, @MJAIAgentRuns_ConversationDetailID_Status, @MJAIAgentRuns_ConversationDetailID_StartedAt, @MJAIAgentRuns_ConversationDetailID_CompletedAt, @MJAIAgentRuns_ConversationDetailID_Success, @MJAIAgentRuns_ConversationDetailID_ErrorMessage, @MJAIAgentRuns_ConversationDetailID_ConversationID, @MJAIAgentRuns_ConversationDetailID_UserID, @MJAIAgentRuns_ConversationDetailID_Result, @MJAIAgentRuns_ConversationDetailID_AgentState, @MJAIAgentRuns_ConversationDetailID_TotalTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCost, @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalCostRollup, @MJAIAgentRuns_ConversationDetailID_ConversationDetailID, @MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence, @MJAIAgentRuns_ConversationDetailID_CancellationReason, @MJAIAgentRuns_ConversationDetailID_FinalStep, @MJAIAgentRuns_ConversationDetailID_FinalPayload, @MJAIAgentRuns_ConversationDetailID_Message, @MJAIAgentRuns_ConversationDetailID_LastRunID, @MJAIAgentRuns_ConversationDetailID_StartingPayload, @MJAIAgentRuns_ConversationDetailID_TotalPromptIterations, @MJAIAgentRuns_ConversationDetailID_ConfigurationID, @MJAIAgentRuns_ConversationDetailID_OverrideModelID, @MJAIAgentRuns_ConversationDetailID_OverrideVendorID, @MJAIAgentRuns_ConversationDetailID_Data, @MJAIAgentRuns_ConversationDetailID_Verbose, @MJAIAgentRuns_ConversationDetailID_EffortLevel, @MJAIAgentRuns_ConversationDetailID_RunName, @MJAIAgentRuns_ConversationDetailID_Comments, @MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID, @MJAIAgentRuns_ConversationDetailID_TestRunID, @MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID, @MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID, @MJAIAgentRuns_ConversationDetailID_SecondaryScopes, @MJAIAgentRuns_ConversationDetailID_ExternalReferenceID, @MJAIAgentRuns_ConversationDetailID_CompanyID, @MJAIAgentRuns_ConversationDetailID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ConversationDetailID_LastHeartbeatAt, @MJAIAgentRuns_ConversationDetailID_AgentSessionID, @MJAIAgentRuns_ConversationDetailID_PlanMode
    END

    CLOSE cascade_update_MJAIAgentRuns_ConversationDetailID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_ConversationDetailID_cursor
    
    -- Cascade delete from ConversationCompactionRun using cursor to call spDeleteConversationCompactionRun
    DECLARE @MJConversationCompactionRuns_ConversationDetailIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationCompactionRuns_ConversationDetailID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationCompactionRun]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJConversationCompactionRuns_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationCompactionRuns_ConversationDetailID_cursor INTO @MJConversationCompactionRuns_ConversationDetailIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationCompactionRun] @ID = @MJConversationCompactionRuns_ConversationDetailIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationCompactionRuns_ConversationDetailID_cursor INTO @MJConversationCompactionRuns_ConversationDetailIDID
    END
    
    CLOSE cascade_delete_MJConversationCompactionRuns_ConversationDetailID_cursor
    DEALLOCATE cascade_delete_MJConversationCompactionRuns_ConversationDetailID_cursor
    
    -- Cascade delete from ConversationDetailArtifact using cursor to call spDeleteConversationDetailArtifact
    DECLARE @MJConversationDetailArtifacts_ConversationDetailIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailArtifact]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor INTO @MJConversationDetailArtifacts_ConversationDetailIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailArtifact] @ID = @MJConversationDetailArtifacts_ConversationDetailIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor INTO @MJConversationDetailArtifacts_ConversationDetailIDID
    END
    
    CLOSE cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor
    DEALLOCATE cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor
    
    -- Cascade delete from ConversationDetailAttachment using cursor to call spDeleteConversationDetailAttachment
    DECLARE @MJConversationDetailAttachments_ConversationDetailIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailAttachment]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor INTO @MJConversationDetailAttachments_ConversationDetailIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailAttachment] @ID = @MJConversationDetailAttachments_ConversationDetailIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor INTO @MJConversationDetailAttachments_ConversationDetailIDID
    END
    
    CLOSE cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor
    DEALLOCATE cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor
    
    -- Cascade delete from ConversationDetailRating using cursor to call spDeleteConversationDetailRating
    DECLARE @MJConversationDetailRatings_ConversationDetailIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailRating]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor INTO @MJConversationDetailRatings_ConversationDetailIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailRating] @ID = @MJConversationDetailRatings_ConversationDetailIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor INTO @MJConversationDetailRatings_ConversationDetailIDID
    END
    
    CLOSE cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor
    DEALLOCATE cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor
    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @MJConversationDetails_ParentIDID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ConversationID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ExternalID nvarchar(100)
    DECLARE @MJConversationDetails_ParentID_Role nvarchar(20)
    DECLARE @MJConversationDetails_ParentID_Message nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_Error nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_HiddenToUser bit
    DECLARE @MJConversationDetails_ParentID_UserRating int
    DECLARE @MJConversationDetails_ParentID_UserFeedback nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_ReflectionInsights nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_UserID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ArtifactID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ArtifactVersionID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_CompletionTime bigint
    DECLARE @MJConversationDetails_ParentID_IsPinned bit
    DECLARE @MJConversationDetails_ParentID_ParentID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_AgentID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_Status nvarchar(20)
    DECLARE @MJConversationDetails_ParentID_SuggestedResponses nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_TestRunID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ResponseForm nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_ActionableCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_AutomaticCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_OriginalMessageChanged bit
    DECLARE @MJConversationDetails_ParentID_AgentSessionID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_TurnEndedAt datetimeoffset
    DECLARE @MJConversationDetails_ParentID_UtteranceStartMs int
    DECLARE @MJConversationDetails_ParentID_UtteranceEndMs int
    DECLARE @MJConversationDetails_ParentID_MediaType nvarchar(20)
    DECLARE cascade_update_MJConversationDetails_ParentID_cursor CURSOR FOR
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged], [AgentSessionID], [TurnEndedAt], [UtteranceStartMs], [UtteranceEndMs], [MediaType]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJConversationDetails_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJConversationDetails_ParentID_cursor INTO @MJConversationDetails_ParentIDID, @MJConversationDetails_ParentID_ConversationID, @MJConversationDetails_ParentID_ExternalID, @MJConversationDetails_ParentID_Role, @MJConversationDetails_ParentID_Message, @MJConversationDetails_ParentID_Error, @MJConversationDetails_ParentID_HiddenToUser, @MJConversationDetails_ParentID_UserRating, @MJConversationDetails_ParentID_UserFeedback, @MJConversationDetails_ParentID_ReflectionInsights, @MJConversationDetails_ParentID_SummaryOfEarlierConversation, @MJConversationDetails_ParentID_UserID, @MJConversationDetails_ParentID_ArtifactID, @MJConversationDetails_ParentID_ArtifactVersionID, @MJConversationDetails_ParentID_CompletionTime, @MJConversationDetails_ParentID_IsPinned, @MJConversationDetails_ParentID_ParentID, @MJConversationDetails_ParentID_AgentID, @MJConversationDetails_ParentID_Status, @MJConversationDetails_ParentID_SuggestedResponses, @MJConversationDetails_ParentID_TestRunID, @MJConversationDetails_ParentID_ResponseForm, @MJConversationDetails_ParentID_ActionableCommands, @MJConversationDetails_ParentID_AutomaticCommands, @MJConversationDetails_ParentID_OriginalMessageChanged, @MJConversationDetails_ParentID_AgentSessionID, @MJConversationDetails_ParentID_TurnEndedAt, @MJConversationDetails_ParentID_UtteranceStartMs, @MJConversationDetails_ParentID_UtteranceEndMs, @MJConversationDetails_ParentID_MediaType

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversationDetails_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @MJConversationDetails_ParentIDID, @ConversationID = @MJConversationDetails_ParentID_ConversationID, @ExternalID = @MJConversationDetails_ParentID_ExternalID, @Role = @MJConversationDetails_ParentID_Role, @Message = @MJConversationDetails_ParentID_Message, @Error = @MJConversationDetails_ParentID_Error, @HiddenToUser = @MJConversationDetails_ParentID_HiddenToUser, @UserRating = @MJConversationDetails_ParentID_UserRating, @UserFeedback = @MJConversationDetails_ParentID_UserFeedback, @ReflectionInsights = @MJConversationDetails_ParentID_ReflectionInsights, @SummaryOfEarlierConversation = @MJConversationDetails_ParentID_SummaryOfEarlierConversation, @UserID = @MJConversationDetails_ParentID_UserID, @ArtifactID = @MJConversationDetails_ParentID_ArtifactID, @ArtifactVersionID = @MJConversationDetails_ParentID_ArtifactVersionID, @CompletionTime = @MJConversationDetails_ParentID_CompletionTime, @IsPinned = @MJConversationDetails_ParentID_IsPinned, @ParentID_Clear = 1, @ParentID = @MJConversationDetails_ParentID_ParentID, @AgentID = @MJConversationDetails_ParentID_AgentID, @Status = @MJConversationDetails_ParentID_Status, @SuggestedResponses = @MJConversationDetails_ParentID_SuggestedResponses, @TestRunID = @MJConversationDetails_ParentID_TestRunID, @ResponseForm = @MJConversationDetails_ParentID_ResponseForm, @ActionableCommands = @MJConversationDetails_ParentID_ActionableCommands, @AutomaticCommands = @MJConversationDetails_ParentID_AutomaticCommands, @OriginalMessageChanged = @MJConversationDetails_ParentID_OriginalMessageChanged, @AgentSessionID = @MJConversationDetails_ParentID_AgentSessionID, @TurnEndedAt = @MJConversationDetails_ParentID_TurnEndedAt, @UtteranceStartMs = @MJConversationDetails_ParentID_UtteranceStartMs, @UtteranceEndMs = @MJConversationDetails_ParentID_UtteranceEndMs, @MediaType = @MJConversationDetails_ParentID_MediaType

        FETCH NEXT FROM cascade_update_MJConversationDetails_ParentID_cursor INTO @MJConversationDetails_ParentIDID, @MJConversationDetails_ParentID_ConversationID, @MJConversationDetails_ParentID_ExternalID, @MJConversationDetails_ParentID_Role, @MJConversationDetails_ParentID_Message, @MJConversationDetails_ParentID_Error, @MJConversationDetails_ParentID_HiddenToUser, @MJConversationDetails_ParentID_UserRating, @MJConversationDetails_ParentID_UserFeedback, @MJConversationDetails_ParentID_ReflectionInsights, @MJConversationDetails_ParentID_SummaryOfEarlierConversation, @MJConversationDetails_ParentID_UserID, @MJConversationDetails_ParentID_ArtifactID, @MJConversationDetails_ParentID_ArtifactVersionID, @MJConversationDetails_ParentID_CompletionTime, @MJConversationDetails_ParentID_IsPinned, @MJConversationDetails_ParentID_ParentID, @MJConversationDetails_ParentID_AgentID, @MJConversationDetails_ParentID_Status, @MJConversationDetails_ParentID_SuggestedResponses, @MJConversationDetails_ParentID_TestRunID, @MJConversationDetails_ParentID_ResponseForm, @MJConversationDetails_ParentID_ActionableCommands, @MJConversationDetails_ParentID_AutomaticCommands, @MJConversationDetails_ParentID_OriginalMessageChanged, @MJConversationDetails_ParentID_AgentSessionID, @MJConversationDetails_ParentID_TurnEndedAt, @MJConversationDetails_ParentID_UtteranceStartMs, @MJConversationDetails_ParentID_UtteranceEndMs, @MJConversationDetails_ParentID_MediaType
    END

    CLOSE cascade_update_MJConversationDetails_ParentID_cursor
    DEALLOCATE cascade_update_MJConversationDetails_ParentID_cursor
    
    -- Cascade update on Report using cursor to call spUpdateReport
    DECLARE @MJReports_ConversationDetailIDID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_Name nvarchar(255)
    DECLARE @MJReports_ConversationDetailID_Description nvarchar(MAX)
    DECLARE @MJReports_ConversationDetailID_CategoryID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_UserID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_SharingScope nvarchar(20)
    DECLARE @MJReports_ConversationDetailID_ConversationID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_ConversationDetailID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_DataContextID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_Configuration nvarchar(MAX)
    DECLARE @MJReports_ConversationDetailID_OutputTriggerTypeID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_OutputFormatTypeID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_OutputDeliveryTypeID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_OutputFrequency nvarchar(50)
    DECLARE @MJReports_ConversationDetailID_OutputTargetEmail nvarchar(255)
    DECLARE @MJReports_ConversationDetailID_OutputWorkflowID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_Thumbnail nvarchar(MAX)
    DECLARE @MJReports_ConversationDetailID_EnvironmentID uniqueidentifier
    DECLARE cascade_update_MJReports_ConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [CategoryID], [UserID], [SharingScope], [ConversationID], [ConversationDetailID], [DataContextID], [Configuration], [OutputTriggerTypeID], [OutputFormatTypeID], [OutputDeliveryTypeID], [OutputFrequency], [OutputTargetEmail], [OutputWorkflowID], [Thumbnail], [EnvironmentID]
        FROM [${flyway:defaultSchema}].[Report]
        WHERE [ConversationDetailID] = @ID

    OPEN cascade_update_MJReports_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJReports_ConversationDetailID_cursor INTO @MJReports_ConversationDetailIDID, @MJReports_ConversationDetailID_Name, @MJReports_ConversationDetailID_Description, @MJReports_ConversationDetailID_CategoryID, @MJReports_ConversationDetailID_UserID, @MJReports_ConversationDetailID_SharingScope, @MJReports_ConversationDetailID_ConversationID, @MJReports_ConversationDetailID_ConversationDetailID, @MJReports_ConversationDetailID_DataContextID, @MJReports_ConversationDetailID_Configuration, @MJReports_ConversationDetailID_OutputTriggerTypeID, @MJReports_ConversationDetailID_OutputFormatTypeID, @MJReports_ConversationDetailID_OutputDeliveryTypeID, @MJReports_ConversationDetailID_OutputFrequency, @MJReports_ConversationDetailID_OutputTargetEmail, @MJReports_ConversationDetailID_OutputWorkflowID, @MJReports_ConversationDetailID_Thumbnail, @MJReports_ConversationDetailID_EnvironmentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJReports_ConversationDetailID_ConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateReport] @ID = @MJReports_ConversationDetailIDID, @Name = @MJReports_ConversationDetailID_Name, @Description = @MJReports_ConversationDetailID_Description, @CategoryID = @MJReports_ConversationDetailID_CategoryID, @UserID = @MJReports_ConversationDetailID_UserID, @SharingScope = @MJReports_ConversationDetailID_SharingScope, @ConversationID = @MJReports_ConversationDetailID_ConversationID, @ConversationDetailID_Clear = 1, @ConversationDetailID = @MJReports_ConversationDetailID_ConversationDetailID, @DataContextID = @MJReports_ConversationDetailID_DataContextID, @Configuration = @MJReports_ConversationDetailID_Configuration, @OutputTriggerTypeID = @MJReports_ConversationDetailID_OutputTriggerTypeID, @OutputFormatTypeID = @MJReports_ConversationDetailID_OutputFormatTypeID, @OutputDeliveryTypeID = @MJReports_ConversationDetailID_OutputDeliveryTypeID, @OutputFrequency = @MJReports_ConversationDetailID_OutputFrequency, @OutputTargetEmail = @MJReports_ConversationDetailID_OutputTargetEmail, @OutputWorkflowID = @MJReports_ConversationDetailID_OutputWorkflowID, @Thumbnail = @MJReports_ConversationDetailID_Thumbnail, @EnvironmentID = @MJReports_ConversationDetailID_EnvironmentID

        FETCH NEXT FROM cascade_update_MJReports_ConversationDetailID_cursor INTO @MJReports_ConversationDetailIDID, @MJReports_ConversationDetailID_Name, @MJReports_ConversationDetailID_Description, @MJReports_ConversationDetailID_CategoryID, @MJReports_ConversationDetailID_UserID, @MJReports_ConversationDetailID_SharingScope, @MJReports_ConversationDetailID_ConversationID, @MJReports_ConversationDetailID_ConversationDetailID, @MJReports_ConversationDetailID_DataContextID, @MJReports_ConversationDetailID_Configuration, @MJReports_ConversationDetailID_OutputTriggerTypeID, @MJReports_ConversationDetailID_OutputFormatTypeID, @MJReports_ConversationDetailID_OutputDeliveryTypeID, @MJReports_ConversationDetailID_OutputFrequency, @MJReports_ConversationDetailID_OutputTargetEmail, @MJReports_ConversationDetailID_OutputWorkflowID, @MJReports_ConversationDetailID_Thumbnail, @MJReports_ConversationDetailID_EnvironmentID
    END

    CLOSE cascade_update_MJReports_ConversationDetailID_cursor
    DEALLOCATE cascade_update_MJReports_ConversationDetailID_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJTasks_ConversationDetailIDID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_ParentID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_Name nvarchar(255)
    DECLARE @MJTasks_ConversationDetailID_Description nvarchar(MAX)
    DECLARE @MJTasks_ConversationDetailID_TypeID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_EnvironmentID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_ProjectID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_ConversationDetailID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_UserID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_AgentID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_Status nvarchar(50)
    DECLARE @MJTasks_ConversationDetailID_PercentComplete int
    DECLARE @MJTasks_ConversationDetailID_DueAt datetimeoffset
    DECLARE @MJTasks_ConversationDetailID_StartedAt datetimeoffset
    DECLARE @MJTasks_ConversationDetailID_CompletedAt datetimeoffset
    DECLARE cascade_update_MJTasks_ConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [ConversationDetailID] = @ID

    OPEN cascade_update_MJTasks_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJTasks_ConversationDetailID_cursor INTO @MJTasks_ConversationDetailIDID, @MJTasks_ConversationDetailID_ParentID, @MJTasks_ConversationDetailID_Name, @MJTasks_ConversationDetailID_Description, @MJTasks_ConversationDetailID_TypeID, @MJTasks_ConversationDetailID_EnvironmentID, @MJTasks_ConversationDetailID_ProjectID, @MJTasks_ConversationDetailID_ConversationDetailID, @MJTasks_ConversationDetailID_UserID, @MJTasks_ConversationDetailID_AgentID, @MJTasks_ConversationDetailID_Status, @MJTasks_ConversationDetailID_PercentComplete, @MJTasks_ConversationDetailID_DueAt, @MJTasks_ConversationDetailID_StartedAt, @MJTasks_ConversationDetailID_CompletedAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJTasks_ConversationDetailID_ConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJTasks_ConversationDetailIDID, @ParentID = @MJTasks_ConversationDetailID_ParentID, @Name = @MJTasks_ConversationDetailID_Name, @Description = @MJTasks_ConversationDetailID_Description, @TypeID = @MJTasks_ConversationDetailID_TypeID, @EnvironmentID = @MJTasks_ConversationDetailID_EnvironmentID, @ProjectID = @MJTasks_ConversationDetailID_ProjectID, @ConversationDetailID_Clear = 1, @ConversationDetailID = @MJTasks_ConversationDetailID_ConversationDetailID, @UserID = @MJTasks_ConversationDetailID_UserID, @AgentID = @MJTasks_ConversationDetailID_AgentID, @Status = @MJTasks_ConversationDetailID_Status, @PercentComplete = @MJTasks_ConversationDetailID_PercentComplete, @DueAt = @MJTasks_ConversationDetailID_DueAt, @StartedAt = @MJTasks_ConversationDetailID_StartedAt, @CompletedAt = @MJTasks_ConversationDetailID_CompletedAt

        FETCH NEXT FROM cascade_update_MJTasks_ConversationDetailID_cursor INTO @MJTasks_ConversationDetailIDID, @MJTasks_ConversationDetailID_ParentID, @MJTasks_ConversationDetailID_Name, @MJTasks_ConversationDetailID_Description, @MJTasks_ConversationDetailID_TypeID, @MJTasks_ConversationDetailID_EnvironmentID, @MJTasks_ConversationDetailID_ProjectID, @MJTasks_ConversationDetailID_ConversationDetailID, @MJTasks_ConversationDetailID_UserID, @MJTasks_ConversationDetailID_AgentID, @MJTasks_ConversationDetailID_Status, @MJTasks_ConversationDetailID_PercentComplete, @MJTasks_ConversationDetailID_DueAt, @MJTasks_ConversationDetailID_StartedAt, @MJTasks_ConversationDetailID_CompletedAt
    END

    CLOSE cascade_update_MJTasks_ConversationDetailID_cursor
    DEALLOCATE cascade_update_MJTasks_ConversationDetailID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationDetail]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spDelete Permissions for MJ: Conversation Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* SQL text to insert 2 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '05f93498-5ca0-4489-8158-9912462b216b' OR (EntityID = '08794D87-CFBF-480E-AA91-B2E76A4FC8A2' AND Name = 'ConversationDetail')) BEGIN
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
            '05f93498-5ca0-4489-8158-9912462b216b',
            '08794D87-CFBF-480E-AA91-B2E76A4FC8A2', -- Entity: MJ: Conversation Compaction Runs
            200011,
            'ConversationDetail',
            'Conversation Detail',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ad330717-a88f-44be-b066-88246522554e' OR (EntityID = '08794D87-CFBF-480E-AA91-B2E76A4FC8A2' AND Name = 'PromptRun')) BEGIN
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
            'ad330717-a88f-44be-b066-88246522554e',
            '08794D87-CFBF-480E-AA91-B2E76A4FC8A2', -- Entity: MJ: Conversation Compaction Runs
            200012,
            'PromptRun',
            'Prompt Run',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '18910DB4-523E-448F-A70F-36DDAF311049'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '05F93498-5CA0-4489-8158-9912462B216B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'AD330717-A88F-44BE-B066-88246522554E'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '05F93498-5CA0-4489-8158-9912462B216B'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AD330717-A88F-44BE-B066-88246522554E'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

/* Set categories for 7 fields */

-- UPDATE Entity Field Category Info MJ: Conversation Compaction Runs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5EA9373F-BAB9-4935-837F-8EDA1B7406EA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Compaction Runs.ConversationDetailID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationship Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Conversation Detail',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B65D6FE8-B3F5-4BF9-B4B7-CFE536D50D93' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Compaction Runs.PromptRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationship Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Prompt Run',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '91226F06-C330-4876-A609-22DF823B12E3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Compaction Runs.ConversationDetail 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationship Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Conversation Detail Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '05F93498-5CA0-4489-8158-9912462B216B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Compaction Runs.PromptRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationship Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Prompt Run Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AD330717-A88F-44BE-B066-88246522554E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Compaction Runs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '18910DB4-523E-448F-A70F-36DDAF311049' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Compaction Runs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '129D7129-EF0F-42AA-9ABB-02256527D3D2' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-link */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-link', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '08794D87-CFBF-480E-AA91-B2E76A4FC8A2';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('41794bdb-1bdd-409d-8398-0333a2abd8ef', '08794D87-CFBF-480E-AA91-B2E76A4FC8A2', 'FieldCategoryInfo', '{"Relationship Mapping":{"icon":"fa fa-link","description":"Links between conversation details and their AI compaction prompt runs"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('564866a2-b157-46b5-a6c3-b829b537aec0', '08794D87-CFBF-480E-AA91-B2E76A4FC8A2', 'FieldCategoryIcons', '{"Relationship Mapping":"fa fa-link","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: junction, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '08794D87-CFBF-480E-AA91-B2E76A4FC8A2';

/* Generated Validation Functions for MJ: AI Agent Types */
-- CHECK constraint for MJ: AI Agent Types: Field: CompactionTargetPercent was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([CompactionTargetPercent]>=(1) AND [CompactionTargetPercent]<=(100))', 'public ValidateCompactionTargetPercentRange(result: ValidationResult) {
	if (this.CompactionTargetPercent != null && (this.CompactionTargetPercent < 1 || this.CompactionTargetPercent > 100)) {
		result.Errors.push(new ValidationErrorInfo(
			''CompactionTargetPercent'',
			''Compaction Target Percent must be between 1 and 100.'',
			this.CompactionTargetPercent,
			ValidationErrorType.Failure
		));
	}
}', 'The compaction target percentage must be a value between 1 and 100 percent.', 'ValidateCompactionTargetPercentRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '88E226AF-5BB9-4E4D-BAEB-642443BCF85E');

            -- CHECK constraint for MJ: AI Agent Types: Field: ContextWindowMaxTokens was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([ContextWindowMaxTokens]>(0))', 'public ValidateContextWindowMaxTokensGreaterThanZero(result: ValidationResult) {
	if (this.ContextWindowMaxTokens != null && this.ContextWindowMaxTokens <= 0) {
		result.Errors.push(new ValidationErrorInfo(
			"ContextWindowMaxTokens",
			"Context Window Max Tokens must be a positive number greater than 0.",
			this.ContextWindowMaxTokens,
			ValidationErrorType.Failure
		));
	}
}', 'The maximum tokens for the context window must be a positive number greater than 0.', 'ValidateContextWindowMaxTokensGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '6CB241D0-437F-4FEC-9BA2-9DB1131C59F6');

            -- CHECK constraint for MJ: AI Agent Types @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([CompactionTargetPercent]<[CompactionTriggerPercent])', 'public ValidateCompactionTargetPercentLessThanTriggerPercent(result: ValidationResult) {
	if (this.CompactionTargetPercent != null && this.CompactionTriggerPercent != null) {
		if (this.CompactionTargetPercent >= this.CompactionTriggerPercent) {
			result.Errors.push(new ValidationErrorInfo(
				"CompactionTargetPercent",
				"The compaction target percentage must be strictly less than the compaction trigger percentage.",
				this.CompactionTargetPercent,
				ValidationErrorType.Failure
			));
		}
	}
}', 'The compaction target percentage must be less than the compaction trigger percentage to ensure that compaction successfully reduces the resource usage below the trigger threshold.', 'ValidateCompactionTargetPercentLessThanTriggerPercent', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '65CDC348-C4A6-4D00-A57B-2D489C56F128');

/* Generated Validation Functions for MJ: AI Agents */
-- CHECK constraint for MJ: AI Agents: Field: CompactionTargetPercent was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([CompactionTargetPercent]>=(1) AND [CompactionTargetPercent]<=(100))', 'public ValidateCompactionTargetPercentRange(result: ValidationResult) {
	if (this.CompactionTargetPercent != null && (this.CompactionTargetPercent < 1 || this.CompactionTargetPercent > 100)) {
		result.Errors.push(new ValidationErrorInfo(
			"CompactionTargetPercent",
			"Compaction target percent must be between 1 and 100.",
			this.CompactionTargetPercent,
			ValidationErrorType.Failure
		));
	}
}', 'The compaction target percentage must be between 1 and 100 percent.', 'ValidateCompactionTargetPercentRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '743CB348-E133-474D-A915-DCF6CD212F60');

            -- CHECK constraint for MJ: AI Agents: Field: CompactionTriggerPercent was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([CompactionTriggerPercent]>=(1) AND [CompactionTriggerPercent]<=(100))', '	public ValidateCompactionTriggerPercentRange(result: ValidationResult) {
		if (this.CompactionTriggerPercent != null && (this.CompactionTriggerPercent < 1 || this.CompactionTriggerPercent > 100)) {
			result.Errors.push(new ValidationErrorInfo(
				"CompactionTriggerPercent",
				"Compaction trigger percentage must be between 1 and 100.",
				this.CompactionTriggerPercent,
				ValidationErrorType.Failure
			));
		}
	}', 'The compaction trigger percentage must be a value between 1 and 100.', 'ValidateCompactionTriggerPercentRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'ECD9E558-9503-402E-B1BB-553C423DF7C8');

            -- CHECK constraint for MJ: AI Agents: Field: ContextWindowMaxTokens was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([ContextWindowMaxTokens]>(0))', 'public ValidateContextWindowMaxTokensGreaterThanZero(result: ValidationResult) {
    if (this.ContextWindowMaxTokens != null && this.ContextWindowMaxTokens <= 0) {
        result.Errors.push(new ValidationErrorInfo(
            "ContextWindowMaxTokens",
            "The maximum tokens for the context window must be greater than zero.",
            this.ContextWindowMaxTokens,
            ValidationErrorType.Failure
        ));
    }
}', 'The maximum tokens for the context window must be a positive number greater than zero.', 'ValidateContextWindowMaxTokensGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '03B2DCAA-9FFF-4A88-BABF-1FB41085CFB1');


/* Regenerated views and stored procedures for AIPromptRun and ConversationDetail.
 * These replace the stale definitions from the compaction migration that referenced
 * the now-dropped SummaryPromptRunID and AgentRunID columns.
 */

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
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIPromptRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[__mj].[vwAIPromptRuns]', 'V') IS NOT NULL
    DROP VIEW [__mj].[vwAIPromptRuns];
GO

CREATE VIEW [__mj].[vwAIPromptRuns]
AS
SELECT
    a.*,
    MJAIPrompt_PromptID.[Name] AS [Prompt],
    MJAIModel_ModelID.[Name] AS [Model],
    MJAIVendor_VendorID.[Name] AS [Vendor],
    MJAIAgent_AgentID.[Name] AS [Agent],
    MJAIConfiguration_ConfigurationID.[Name] AS [Configuration],
    MJAIPromptRun_ParentID.[RunName] AS [Parent],
    MJAIModel_OriginalModelID.[Name] AS [OriginalModel],
    MJAIPromptRun_RerunFromPromptRunID.[RunName] AS [RerunFromPromptRun],
    MJAIPrompt_JudgeID.[Name] AS [Judge],
    MJAIPrompt_ChildPromptID.[Name] AS [ChildPrompt],
    MJTestRun_TestRunID.[Test] AS [TestRun],
    root_ParentID.RootID AS [RootParentID],
    root_RerunFromPromptRunID.RootID AS [RootRerunFromPromptRunID]
FROM
    [__mj].[AIPromptRun] AS a
INNER JOIN
    [__mj].[AIPrompt] AS MJAIPrompt_PromptID
  ON
    [a].[PromptID] = MJAIPrompt_PromptID.[ID]
INNER JOIN
    [__mj].[AIModel] AS MJAIModel_ModelID
  ON
    [a].[ModelID] = MJAIModel_ModelID.[ID]
INNER JOIN
    [__mj].[AIVendor] AS MJAIVendor_VendorID
  ON
    [a].[VendorID] = MJAIVendor_VendorID.[ID]
LEFT OUTER JOIN
    [__mj].[AIAgent] AS MJAIAgent_AgentID
  ON
    [a].[AgentID] = MJAIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [__mj].[AIConfiguration] AS MJAIConfiguration_ConfigurationID
  ON
    [a].[ConfigurationID] = MJAIConfiguration_ConfigurationID.[ID]
LEFT OUTER JOIN
    [__mj].[AIPromptRun] AS MJAIPromptRun_ParentID
  ON
    [a].[ParentID] = MJAIPromptRun_ParentID.[ID]
LEFT OUTER JOIN
    [__mj].[AIModel] AS MJAIModel_OriginalModelID
  ON
    [a].[OriginalModelID] = MJAIModel_OriginalModelID.[ID]
LEFT OUTER JOIN
    [__mj].[AIPromptRun] AS MJAIPromptRun_RerunFromPromptRunID
  ON
    [a].[RerunFromPromptRunID] = MJAIPromptRun_RerunFromPromptRunID.[ID]
LEFT OUTER JOIN
    [__mj].[AIPrompt] AS MJAIPrompt_JudgeID
  ON
    [a].[JudgeID] = MJAIPrompt_JudgeID.[ID]
LEFT OUTER JOIN
    [__mj].[AIPrompt] AS MJAIPrompt_ChildPromptID
  ON
    [a].[ChildPromptID] = MJAIPrompt_ChildPromptID.[ID]
LEFT OUTER JOIN
    [__mj].[vwTestRuns] AS MJTestRun_TestRunID
  ON
    [a].[TestRunID] = MJTestRun_TestRunID.[ID]
OUTER APPLY
    [__mj].[fnAIPromptRunParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
OUTER APPLY
    [__mj].[fnAIPromptRunRerunFromPromptRunID_GetRootID]([a].[ID], [a].[RerunFromPromptRunID]) AS root_RerunFromPromptRunID
GO
GRANT SELECT ON [__mj].[vwAIPromptRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: vwConversationDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Details
-----               SCHEMA:      __mj
-----               BASE TABLE:  ConversationDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[__mj].[vwConversationDetails]', 'V') IS NOT NULL
    DROP VIEW [__mj].[vwConversationDetails];
GO

CREATE VIEW [__mj].[vwConversationDetails]
AS
SELECT
    c.*,
    MJConversation_ConversationID.[Name] AS [Conversation],
    MJUser_UserID.[Name] AS [User],
    MJConversationArtifact_ArtifactID.[Name] AS [Artifact],
    MJConversationArtifactVersion_ArtifactVersionID.[ConversationArtifact] AS [ArtifactVersion],
    MJConversationDetail_ParentID.[ExternalID] AS [Parent],
    MJAIAgent_AgentID.[Name] AS [Agent],
    MJTestRun_TestRunID.[Test] AS [TestRun],
    root_ParentID.RootID AS [RootParentID]
FROM
    [__mj].[ConversationDetail] AS c
INNER JOIN
    [__mj].[Conversation] AS MJConversation_ConversationID
  ON
    [c].[ConversationID] = MJConversation_ConversationID.[ID]
LEFT OUTER JOIN
    [__mj].[User] AS MJUser_UserID
  ON
    [c].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [__mj].[ConversationArtifact] AS MJConversationArtifact_ArtifactID
  ON
    [c].[ArtifactID] = MJConversationArtifact_ArtifactID.[ID]
LEFT OUTER JOIN
    [__mj].[vwConversationArtifactVersions] AS MJConversationArtifactVersion_ArtifactVersionID
  ON
    [c].[ArtifactVersionID] = MJConversationArtifactVersion_ArtifactVersionID.[ID]
LEFT OUTER JOIN
    [__mj].[ConversationDetail] AS MJConversationDetail_ParentID
  ON
    [c].[ParentID] = MJConversationDetail_ParentID.[ID]
LEFT OUTER JOIN
    [__mj].[AIAgent] AS MJAIAgent_AgentID
  ON
    [c].[AgentID] = MJAIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [__mj].[vwTestRuns] AS MJTestRun_TestRunID
  ON
    [c].[TestRunID] = MJTestRun_TestRunID.[ID]
OUTER APPLY
    [__mj].[fnConversationDetailParentID_GetRootID]([c].[ID], [c].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [__mj].[vwConversationDetails] TO [cdp_Developer], [cdp_UI], [cdp_Integration]-----------------------------------------------------------------
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
IF OBJECT_ID('[__mj].[spCreateAIPromptRun]', 'P') IS NOT NULL
    DROP PROCEDURE [__mj].[spCreateAIPromptRun];
GO

CREATE PROCEDURE [__mj].[spCreateAIPromptRun]
    @ID uniqueidentifier = NULL,
    @PromptID uniqueidentifier,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @ConfigurationID_Clear bit = 0,
    @ConfigurationID uniqueidentifier = NULL,
    @RunAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @ExecutionTimeMS_Clear bit = 0,
    @ExecutionTimeMS int = NULL,
    @Messages_Clear bit = 0,
    @Messages nvarchar(MAX) = NULL,
    @Result_Clear bit = 0,
    @Result nvarchar(MAX) = NULL,
    @TokensUsed_Clear bit = 0,
    @TokensUsed int = NULL,
    @TokensPrompt_Clear bit = 0,
    @TokensPrompt int = NULL,
    @TokensCompletion_Clear bit = 0,
    @TokensCompletion int = NULL,
    @TotalCost_Clear bit = 0,
    @TotalCost decimal(18, 6) = NULL,
    @Success bit = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @RunType nvarchar(20) = NULL,
    @ExecutionOrder_Clear bit = 0,
    @ExecutionOrder int = NULL,
    @Cost_Clear bit = 0,
    @Cost decimal(19, 8) = NULL,
    @CostCurrency_Clear bit = 0,
    @CostCurrency nvarchar(10) = NULL,
    @TokensUsedRollup_Clear bit = 0,
    @TokensUsedRollup int = NULL,
    @TokensPromptRollup_Clear bit = 0,
    @TokensPromptRollup int = NULL,
    @TokensCompletionRollup_Clear bit = 0,
    @TokensCompletionRollup int = NULL,
    @Temperature_Clear bit = 0,
    @Temperature decimal(3, 2) = NULL,
    @TopP_Clear bit = 0,
    @TopP decimal(3, 2) = NULL,
    @TopK_Clear bit = 0,
    @TopK int = NULL,
    @MinP_Clear bit = 0,
    @MinP decimal(3, 2) = NULL,
    @FrequencyPenalty_Clear bit = 0,
    @FrequencyPenalty decimal(3, 2) = NULL,
    @PresencePenalty_Clear bit = 0,
    @PresencePenalty decimal(3, 2) = NULL,
    @Seed_Clear bit = 0,
    @Seed int = NULL,
    @StopSequences_Clear bit = 0,
    @StopSequences nvarchar(MAX) = NULL,
    @ResponseFormat_Clear bit = 0,
    @ResponseFormat nvarchar(50) = NULL,
    @LogProbs_Clear bit = 0,
    @LogProbs bit = NULL,
    @TopLogProbs_Clear bit = 0,
    @TopLogProbs int = NULL,
    @DescendantCost_Clear bit = 0,
    @DescendantCost decimal(18, 6) = NULL,
    @ValidationAttemptCount_Clear bit = 0,
    @ValidationAttemptCount int = NULL,
    @SuccessfulValidationCount_Clear bit = 0,
    @SuccessfulValidationCount int = NULL,
    @FinalValidationPassed_Clear bit = 0,
    @FinalValidationPassed bit = NULL,
    @ValidationBehavior_Clear bit = 0,
    @ValidationBehavior nvarchar(50) = NULL,
    @RetryStrategy_Clear bit = 0,
    @RetryStrategy nvarchar(50) = NULL,
    @MaxRetriesConfigured_Clear bit = 0,
    @MaxRetriesConfigured int = NULL,
    @FinalValidationError_Clear bit = 0,
    @FinalValidationError nvarchar(500) = NULL,
    @ValidationErrorCount_Clear bit = 0,
    @ValidationErrorCount int = NULL,
    @CommonValidationError_Clear bit = 0,
    @CommonValidationError nvarchar(255) = NULL,
    @FirstAttemptAt_Clear bit = 0,
    @FirstAttemptAt datetimeoffset = NULL,
    @LastAttemptAt_Clear bit = 0,
    @LastAttemptAt datetimeoffset = NULL,
    @TotalRetryDurationMS_Clear bit = 0,
    @TotalRetryDurationMS int = NULL,
    @ValidationAttempts_Clear bit = 0,
    @ValidationAttempts nvarchar(MAX) = NULL,
    @ValidationSummary_Clear bit = 0,
    @ValidationSummary nvarchar(MAX) = NULL,
    @FailoverAttempts_Clear bit = 0,
    @FailoverAttempts int = NULL,
    @FailoverErrors_Clear bit = 0,
    @FailoverErrors nvarchar(MAX) = NULL,
    @FailoverDurations_Clear bit = 0,
    @FailoverDurations nvarchar(MAX) = NULL,
    @OriginalModelID_Clear bit = 0,
    @OriginalModelID uniqueidentifier = NULL,
    @OriginalRequestStartTime_Clear bit = 0,
    @OriginalRequestStartTime datetimeoffset = NULL,
    @TotalFailoverDuration_Clear bit = 0,
    @TotalFailoverDuration int = NULL,
    @RerunFromPromptRunID_Clear bit = 0,
    @RerunFromPromptRunID uniqueidentifier = NULL,
    @ModelSelection_Clear bit = 0,
    @ModelSelection nvarchar(MAX) = NULL,
    @Status nvarchar(50) = NULL,
    @Cancelled bit = NULL,
    @CancellationReason_Clear bit = 0,
    @CancellationReason nvarchar(MAX) = NULL,
    @ModelPowerRank_Clear bit = 0,
    @ModelPowerRank int = NULL,
    @SelectionStrategy_Clear bit = 0,
    @SelectionStrategy nvarchar(50) = NULL,
    @CacheHit bit = NULL,
    @CacheKey_Clear bit = 0,
    @CacheKey nvarchar(500) = NULL,
    @JudgeID_Clear bit = 0,
    @JudgeID uniqueidentifier = NULL,
    @JudgeScore_Clear bit = 0,
    @JudgeScore float(53) = NULL,
    @WasSelectedResult bit = NULL,
    @StreamingEnabled bit = NULL,
    @FirstTokenTime_Clear bit = 0,
    @FirstTokenTime int = NULL,
    @ErrorDetails_Clear bit = 0,
    @ErrorDetails nvarchar(MAX) = NULL,
    @ChildPromptID_Clear bit = 0,
    @ChildPromptID uniqueidentifier = NULL,
    @QueueTime_Clear bit = 0,
    @QueueTime int = NULL,
    @PromptTime_Clear bit = 0,
    @PromptTime int = NULL,
    @CompletionTime_Clear bit = 0,
    @CompletionTime int = NULL,
    @ModelSpecificResponseDetails_Clear bit = 0,
    @ModelSpecificResponseDetails nvarchar(MAX) = NULL,
    @EffortLevel_Clear bit = 0,
    @EffortLevel int = NULL,
    @RunName_Clear bit = 0,
    @RunName nvarchar(255) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @TestRunID_Clear bit = 0,
    @TestRunID uniqueidentifier = NULL,
    @AssistantPrefill_Clear bit = 0,
    @AssistantPrefill nvarchar(MAX) = NULL,
    @TokensCacheRead_Clear bit = 0,
    @TokensCacheRead int = NULL,
    @TokensCacheWrite_Clear bit = 0,
    @TokensCacheWrite int = NULL,
    @TokensCacheReadRollup_Clear bit = 0,
    @TokensCacheReadRollup int = NULL,
    @TokensCacheWriteRollup_Clear bit = 0,
    @TokensCacheWriteRollup int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [__mj].[AIPromptRun]
            (
                [ID],
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
                [Cost],
                [CostCurrency],
                [TokensUsedRollup],
                [TokensPromptRollup],
                [TokensCompletionRollup],
                [Temperature],
                [TopP],
                [TopK],
                [MinP],
                [FrequencyPenalty],
                [PresencePenalty],
                [Seed],
                [StopSequences],
                [ResponseFormat],
                [LogProbs],
                [TopLogProbs],
                [DescendantCost],
                [ValidationAttemptCount],
                [SuccessfulValidationCount],
                [FinalValidationPassed],
                [ValidationBehavior],
                [RetryStrategy],
                [MaxRetriesConfigured],
                [FinalValidationError],
                [ValidationErrorCount],
                [CommonValidationError],
                [FirstAttemptAt],
                [LastAttemptAt],
                [TotalRetryDurationMS],
                [ValidationAttempts],
                [ValidationSummary],
                [FailoverAttempts],
                [FailoverErrors],
                [FailoverDurations],
                [OriginalModelID],
                [OriginalRequestStartTime],
                [TotalFailoverDuration],
                [RerunFromPromptRunID],
                [ModelSelection],
                [Status],
                [Cancelled],
                [CancellationReason],
                [ModelPowerRank],
                [SelectionStrategy],
                [CacheHit],
                [CacheKey],
                [JudgeID],
                [JudgeScore],
                [WasSelectedResult],
                [StreamingEnabled],
                [FirstTokenTime],
                [ErrorDetails],
                [ChildPromptID],
                [QueueTime],
                [PromptTime],
                [CompletionTime],
                [ModelSpecificResponseDetails],
                [EffortLevel],
                [RunName],
                [Comments],
                [TestRunID],
                [AssistantPrefill],
                [TokensCacheRead],
                [TokensCacheWrite],
                [TokensCacheReadRollup],
                [TokensCacheWriteRollup]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PromptID,
                @ModelID,
                @VendorID,
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                CASE WHEN @ConfigurationID_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationID, NULL) END,
                ISNULL(@RunAt, sysdatetimeoffset()),
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @ExecutionTimeMS_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionTimeMS, NULL) END,
                CASE WHEN @Messages_Clear = 1 THEN NULL ELSE ISNULL(@Messages, NULL) END,
                CASE WHEN @Result_Clear = 1 THEN NULL ELSE ISNULL(@Result, NULL) END,
                CASE WHEN @TokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsed, NULL) END,
                CASE WHEN @TokensPrompt_Clear = 1 THEN NULL ELSE ISNULL(@TokensPrompt, NULL) END,
                CASE WHEN @TokensCompletion_Clear = 1 THEN NULL ELSE ISNULL(@TokensCompletion, NULL) END,
                CASE WHEN @TotalCost_Clear = 1 THEN NULL ELSE ISNULL(@TotalCost, NULL) END,
                ISNULL(@Success, 0),
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                ISNULL(@RunType, 'Single'),
                CASE WHEN @ExecutionOrder_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionOrder, NULL) END,
                CASE WHEN @Cost_Clear = 1 THEN NULL ELSE ISNULL(@Cost, NULL) END,
                CASE WHEN @CostCurrency_Clear = 1 THEN NULL ELSE ISNULL(@CostCurrency, NULL) END,
                CASE WHEN @TokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsedRollup, NULL) END,
                CASE WHEN @TokensPromptRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensPromptRollup, NULL) END,
                CASE WHEN @TokensCompletionRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCompletionRollup, NULL) END,
                CASE WHEN @Temperature_Clear = 1 THEN NULL ELSE ISNULL(@Temperature, NULL) END,
                CASE WHEN @TopP_Clear = 1 THEN NULL ELSE ISNULL(@TopP, NULL) END,
                CASE WHEN @TopK_Clear = 1 THEN NULL ELSE ISNULL(@TopK, NULL) END,
                CASE WHEN @MinP_Clear = 1 THEN NULL ELSE ISNULL(@MinP, NULL) END,
                CASE WHEN @FrequencyPenalty_Clear = 1 THEN NULL ELSE ISNULL(@FrequencyPenalty, NULL) END,
                CASE WHEN @PresencePenalty_Clear = 1 THEN NULL ELSE ISNULL(@PresencePenalty, NULL) END,
                CASE WHEN @Seed_Clear = 1 THEN NULL ELSE ISNULL(@Seed, NULL) END,
                CASE WHEN @StopSequences_Clear = 1 THEN NULL ELSE ISNULL(@StopSequences, NULL) END,
                CASE WHEN @ResponseFormat_Clear = 1 THEN NULL ELSE ISNULL(@ResponseFormat, NULL) END,
                CASE WHEN @LogProbs_Clear = 1 THEN NULL ELSE ISNULL(@LogProbs, NULL) END,
                CASE WHEN @TopLogProbs_Clear = 1 THEN NULL ELSE ISNULL(@TopLogProbs, NULL) END,
                CASE WHEN @DescendantCost_Clear = 1 THEN NULL ELSE ISNULL(@DescendantCost, NULL) END,
                CASE WHEN @ValidationAttemptCount_Clear = 1 THEN NULL ELSE ISNULL(@ValidationAttemptCount, NULL) END,
                CASE WHEN @SuccessfulValidationCount_Clear = 1 THEN NULL ELSE ISNULL(@SuccessfulValidationCount, NULL) END,
                CASE WHEN @FinalValidationPassed_Clear = 1 THEN NULL ELSE ISNULL(@FinalValidationPassed, NULL) END,
                CASE WHEN @ValidationBehavior_Clear = 1 THEN NULL ELSE ISNULL(@ValidationBehavior, NULL) END,
                CASE WHEN @RetryStrategy_Clear = 1 THEN NULL ELSE ISNULL(@RetryStrategy, NULL) END,
                CASE WHEN @MaxRetriesConfigured_Clear = 1 THEN NULL ELSE ISNULL(@MaxRetriesConfigured, NULL) END,
                CASE WHEN @FinalValidationError_Clear = 1 THEN NULL ELSE ISNULL(@FinalValidationError, NULL) END,
                CASE WHEN @ValidationErrorCount_Clear = 1 THEN NULL ELSE ISNULL(@ValidationErrorCount, NULL) END,
                CASE WHEN @CommonValidationError_Clear = 1 THEN NULL ELSE ISNULL(@CommonValidationError, NULL) END,
                CASE WHEN @FirstAttemptAt_Clear = 1 THEN NULL ELSE ISNULL(@FirstAttemptAt, NULL) END,
                CASE WHEN @LastAttemptAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAttemptAt, NULL) END,
                CASE WHEN @TotalRetryDurationMS_Clear = 1 THEN NULL ELSE ISNULL(@TotalRetryDurationMS, NULL) END,
                CASE WHEN @ValidationAttempts_Clear = 1 THEN NULL ELSE ISNULL(@ValidationAttempts, NULL) END,
                CASE WHEN @ValidationSummary_Clear = 1 THEN NULL ELSE ISNULL(@ValidationSummary, NULL) END,
                CASE WHEN @FailoverAttempts_Clear = 1 THEN NULL ELSE ISNULL(@FailoverAttempts, 0) END,
                CASE WHEN @FailoverErrors_Clear = 1 THEN NULL ELSE ISNULL(@FailoverErrors, NULL) END,
                CASE WHEN @FailoverDurations_Clear = 1 THEN NULL ELSE ISNULL(@FailoverDurations, NULL) END,
                CASE WHEN @OriginalModelID_Clear = 1 THEN NULL ELSE ISNULL(@OriginalModelID, NULL) END,
                CASE WHEN @OriginalRequestStartTime_Clear = 1 THEN NULL ELSE ISNULL(@OriginalRequestStartTime, NULL) END,
                CASE WHEN @TotalFailoverDuration_Clear = 1 THEN NULL ELSE ISNULL(@TotalFailoverDuration, NULL) END,
                CASE WHEN @RerunFromPromptRunID_Clear = 1 THEN NULL ELSE ISNULL(@RerunFromPromptRunID, NULL) END,
                CASE WHEN @ModelSelection_Clear = 1 THEN NULL ELSE ISNULL(@ModelSelection, NULL) END,
                ISNULL(@Status, 'Pending'),
                ISNULL(@Cancelled, 0),
                CASE WHEN @CancellationReason_Clear = 1 THEN NULL ELSE ISNULL(@CancellationReason, NULL) END,
                CASE WHEN @ModelPowerRank_Clear = 1 THEN NULL ELSE ISNULL(@ModelPowerRank, NULL) END,
                CASE WHEN @SelectionStrategy_Clear = 1 THEN NULL ELSE ISNULL(@SelectionStrategy, NULL) END,
                ISNULL(@CacheHit, 0),
                CASE WHEN @CacheKey_Clear = 1 THEN NULL ELSE ISNULL(@CacheKey, NULL) END,
                CASE WHEN @JudgeID_Clear = 1 THEN NULL ELSE ISNULL(@JudgeID, NULL) END,
                CASE WHEN @JudgeScore_Clear = 1 THEN NULL ELSE ISNULL(@JudgeScore, NULL) END,
                ISNULL(@WasSelectedResult, 0),
                ISNULL(@StreamingEnabled, 0),
                CASE WHEN @FirstTokenTime_Clear = 1 THEN NULL ELSE ISNULL(@FirstTokenTime, NULL) END,
                CASE WHEN @ErrorDetails_Clear = 1 THEN NULL ELSE ISNULL(@ErrorDetails, NULL) END,
                CASE WHEN @ChildPromptID_Clear = 1 THEN NULL ELSE ISNULL(@ChildPromptID, NULL) END,
                CASE WHEN @QueueTime_Clear = 1 THEN NULL ELSE ISNULL(@QueueTime, NULL) END,
                CASE WHEN @PromptTime_Clear = 1 THEN NULL ELSE ISNULL(@PromptTime, NULL) END,
                CASE WHEN @CompletionTime_Clear = 1 THEN NULL ELSE ISNULL(@CompletionTime, NULL) END,
                CASE WHEN @ModelSpecificResponseDetails_Clear = 1 THEN NULL ELSE ISNULL(@ModelSpecificResponseDetails, NULL) END,
                CASE WHEN @EffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@EffortLevel, NULL) END,
                CASE WHEN @RunName_Clear = 1 THEN NULL ELSE ISNULL(@RunName, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, NULL) END,
                CASE WHEN @AssistantPrefill_Clear = 1 THEN NULL ELSE ISNULL(@AssistantPrefill, NULL) END,
                CASE WHEN @TokensCacheRead_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheRead, NULL) END,
                CASE WHEN @TokensCacheWrite_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheWrite, NULL) END,
                CASE WHEN @TokensCacheReadRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheReadRollup, NULL) END,
                CASE WHEN @TokensCacheWriteRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheWriteRollup, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [__mj].[AIPromptRun]
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
                [Cost],
                [CostCurrency],
                [TokensUsedRollup],
                [TokensPromptRollup],
                [TokensCompletionRollup],
                [Temperature],
                [TopP],
                [TopK],
                [MinP],
                [FrequencyPenalty],
                [PresencePenalty],
                [Seed],
                [StopSequences],
                [ResponseFormat],
                [LogProbs],
                [TopLogProbs],
                [DescendantCost],
                [ValidationAttemptCount],
                [SuccessfulValidationCount],
                [FinalValidationPassed],
                [ValidationBehavior],
                [RetryStrategy],
                [MaxRetriesConfigured],
                [FinalValidationError],
                [ValidationErrorCount],
                [CommonValidationError],
                [FirstAttemptAt],
                [LastAttemptAt],
                [TotalRetryDurationMS],
                [ValidationAttempts],
                [ValidationSummary],
                [FailoverAttempts],
                [FailoverErrors],
                [FailoverDurations],
                [OriginalModelID],
                [OriginalRequestStartTime],
                [TotalFailoverDuration],
                [RerunFromPromptRunID],
                [ModelSelection],
                [Status],
                [Cancelled],
                [CancellationReason],
                [ModelPowerRank],
                [SelectionStrategy],
                [CacheHit],
                [CacheKey],
                [JudgeID],
                [JudgeScore],
                [WasSelectedResult],
                [StreamingEnabled],
                [FirstTokenTime],
                [ErrorDetails],
                [ChildPromptID],
                [QueueTime],
                [PromptTime],
                [CompletionTime],
                [ModelSpecificResponseDetails],
                [EffortLevel],
                [RunName],
                [Comments],
                [TestRunID],
                [AssistantPrefill],
                [TokensCacheRead],
                [TokensCacheWrite],
                [TokensCacheReadRollup],
                [TokensCacheWriteRollup]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PromptID,
                @ModelID,
                @VendorID,
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                CASE WHEN @ConfigurationID_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationID, NULL) END,
                ISNULL(@RunAt, sysdatetimeoffset()),
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @ExecutionTimeMS_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionTimeMS, NULL) END,
                CASE WHEN @Messages_Clear = 1 THEN NULL ELSE ISNULL(@Messages, NULL) END,
                CASE WHEN @Result_Clear = 1 THEN NULL ELSE ISNULL(@Result, NULL) END,
                CASE WHEN @TokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsed, NULL) END,
                CASE WHEN @TokensPrompt_Clear = 1 THEN NULL ELSE ISNULL(@TokensPrompt, NULL) END,
                CASE WHEN @TokensCompletion_Clear = 1 THEN NULL ELSE ISNULL(@TokensCompletion, NULL) END,
                CASE WHEN @TotalCost_Clear = 1 THEN NULL ELSE ISNULL(@TotalCost, NULL) END,
                ISNULL(@Success, 0),
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                ISNULL(@RunType, 'Single'),
                CASE WHEN @ExecutionOrder_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionOrder, NULL) END,
                CASE WHEN @Cost_Clear = 1 THEN NULL ELSE ISNULL(@Cost, NULL) END,
                CASE WHEN @CostCurrency_Clear = 1 THEN NULL ELSE ISNULL(@CostCurrency, NULL) END,
                CASE WHEN @TokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsedRollup, NULL) END,
                CASE WHEN @TokensPromptRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensPromptRollup, NULL) END,
                CASE WHEN @TokensCompletionRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCompletionRollup, NULL) END,
                CASE WHEN @Temperature_Clear = 1 THEN NULL ELSE ISNULL(@Temperature, NULL) END,
                CASE WHEN @TopP_Clear = 1 THEN NULL ELSE ISNULL(@TopP, NULL) END,
                CASE WHEN @TopK_Clear = 1 THEN NULL ELSE ISNULL(@TopK, NULL) END,
                CASE WHEN @MinP_Clear = 1 THEN NULL ELSE ISNULL(@MinP, NULL) END,
                CASE WHEN @FrequencyPenalty_Clear = 1 THEN NULL ELSE ISNULL(@FrequencyPenalty, NULL) END,
                CASE WHEN @PresencePenalty_Clear = 1 THEN NULL ELSE ISNULL(@PresencePenalty, NULL) END,
                CASE WHEN @Seed_Clear = 1 THEN NULL ELSE ISNULL(@Seed, NULL) END,
                CASE WHEN @StopSequences_Clear = 1 THEN NULL ELSE ISNULL(@StopSequences, NULL) END,
                CASE WHEN @ResponseFormat_Clear = 1 THEN NULL ELSE ISNULL(@ResponseFormat, NULL) END,
                CASE WHEN @LogProbs_Clear = 1 THEN NULL ELSE ISNULL(@LogProbs, NULL) END,
                CASE WHEN @TopLogProbs_Clear = 1 THEN NULL ELSE ISNULL(@TopLogProbs, NULL) END,
                CASE WHEN @DescendantCost_Clear = 1 THEN NULL ELSE ISNULL(@DescendantCost, NULL) END,
                CASE WHEN @ValidationAttemptCount_Clear = 1 THEN NULL ELSE ISNULL(@ValidationAttemptCount, NULL) END,
                CASE WHEN @SuccessfulValidationCount_Clear = 1 THEN NULL ELSE ISNULL(@SuccessfulValidationCount, NULL) END,
                CASE WHEN @FinalValidationPassed_Clear = 1 THEN NULL ELSE ISNULL(@FinalValidationPassed, NULL) END,
                CASE WHEN @ValidationBehavior_Clear = 1 THEN NULL ELSE ISNULL(@ValidationBehavior, NULL) END,
                CASE WHEN @RetryStrategy_Clear = 1 THEN NULL ELSE ISNULL(@RetryStrategy, NULL) END,
                CASE WHEN @MaxRetriesConfigured_Clear = 1 THEN NULL ELSE ISNULL(@MaxRetriesConfigured, NULL) END,
                CASE WHEN @FinalValidationError_Clear = 1 THEN NULL ELSE ISNULL(@FinalValidationError, NULL) END,
                CASE WHEN @ValidationErrorCount_Clear = 1 THEN NULL ELSE ISNULL(@ValidationErrorCount, NULL) END,
                CASE WHEN @CommonValidationError_Clear = 1 THEN NULL ELSE ISNULL(@CommonValidationError, NULL) END,
                CASE WHEN @FirstAttemptAt_Clear = 1 THEN NULL ELSE ISNULL(@FirstAttemptAt, NULL) END,
                CASE WHEN @LastAttemptAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAttemptAt, NULL) END,
                CASE WHEN @TotalRetryDurationMS_Clear = 1 THEN NULL ELSE ISNULL(@TotalRetryDurationMS, NULL) END,
                CASE WHEN @ValidationAttempts_Clear = 1 THEN NULL ELSE ISNULL(@ValidationAttempts, NULL) END,
                CASE WHEN @ValidationSummary_Clear = 1 THEN NULL ELSE ISNULL(@ValidationSummary, NULL) END,
                CASE WHEN @FailoverAttempts_Clear = 1 THEN NULL ELSE ISNULL(@FailoverAttempts, 0) END,
                CASE WHEN @FailoverErrors_Clear = 1 THEN NULL ELSE ISNULL(@FailoverErrors, NULL) END,
                CASE WHEN @FailoverDurations_Clear = 1 THEN NULL ELSE ISNULL(@FailoverDurations, NULL) END,
                CASE WHEN @OriginalModelID_Clear = 1 THEN NULL ELSE ISNULL(@OriginalModelID, NULL) END,
                CASE WHEN @OriginalRequestStartTime_Clear = 1 THEN NULL ELSE ISNULL(@OriginalRequestStartTime, NULL) END,
                CASE WHEN @TotalFailoverDuration_Clear = 1 THEN NULL ELSE ISNULL(@TotalFailoverDuration, NULL) END,
                CASE WHEN @RerunFromPromptRunID_Clear = 1 THEN NULL ELSE ISNULL(@RerunFromPromptRunID, NULL) END,
                CASE WHEN @ModelSelection_Clear = 1 THEN NULL ELSE ISNULL(@ModelSelection, NULL) END,
                ISNULL(@Status, 'Pending'),
                ISNULL(@Cancelled, 0),
                CASE WHEN @CancellationReason_Clear = 1 THEN NULL ELSE ISNULL(@CancellationReason, NULL) END,
                CASE WHEN @ModelPowerRank_Clear = 1 THEN NULL ELSE ISNULL(@ModelPowerRank, NULL) END,
                CASE WHEN @SelectionStrategy_Clear = 1 THEN NULL ELSE ISNULL(@SelectionStrategy, NULL) END,
                ISNULL(@CacheHit, 0),
                CASE WHEN @CacheKey_Clear = 1 THEN NULL ELSE ISNULL(@CacheKey, NULL) END,
                CASE WHEN @JudgeID_Clear = 1 THEN NULL ELSE ISNULL(@JudgeID, NULL) END,
                CASE WHEN @JudgeScore_Clear = 1 THEN NULL ELSE ISNULL(@JudgeScore, NULL) END,
                ISNULL(@WasSelectedResult, 0),
                ISNULL(@StreamingEnabled, 0),
                CASE WHEN @FirstTokenTime_Clear = 1 THEN NULL ELSE ISNULL(@FirstTokenTime, NULL) END,
                CASE WHEN @ErrorDetails_Clear = 1 THEN NULL ELSE ISNULL(@ErrorDetails, NULL) END,
                CASE WHEN @ChildPromptID_Clear = 1 THEN NULL ELSE ISNULL(@ChildPromptID, NULL) END,
                CASE WHEN @QueueTime_Clear = 1 THEN NULL ELSE ISNULL(@QueueTime, NULL) END,
                CASE WHEN @PromptTime_Clear = 1 THEN NULL ELSE ISNULL(@PromptTime, NULL) END,
                CASE WHEN @CompletionTime_Clear = 1 THEN NULL ELSE ISNULL(@CompletionTime, NULL) END,
                CASE WHEN @ModelSpecificResponseDetails_Clear = 1 THEN NULL ELSE ISNULL(@ModelSpecificResponseDetails, NULL) END,
                CASE WHEN @EffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@EffortLevel, NULL) END,
                CASE WHEN @RunName_Clear = 1 THEN NULL ELSE ISNULL(@RunName, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, NULL) END,
                CASE WHEN @AssistantPrefill_Clear = 1 THEN NULL ELSE ISNULL(@AssistantPrefill, NULL) END,
                CASE WHEN @TokensCacheRead_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheRead, NULL) END,
                CASE WHEN @TokensCacheWrite_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheWrite, NULL) END,
                CASE WHEN @TokensCacheReadRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheReadRollup, NULL) END,
                CASE WHEN @TokensCacheWriteRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheWriteRollup, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwAIPromptRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [__mj].[spCreateAIPromptRun] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
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
IF OBJECT_ID('[__mj].[spUpdateAIPromptRun]', 'P') IS NOT NULL
    DROP PROCEDURE [__mj].[spUpdateAIPromptRun];
GO

CREATE PROCEDURE [__mj].[spUpdateAIPromptRun]
    @ID uniqueidentifier,
    @PromptID uniqueidentifier = NULL,
    @ModelID uniqueidentifier = NULL,
    @VendorID uniqueidentifier = NULL,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @ConfigurationID_Clear bit = 0,
    @ConfigurationID uniqueidentifier = NULL,
    @RunAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @ExecutionTimeMS_Clear bit = 0,
    @ExecutionTimeMS int = NULL,
    @Messages_Clear bit = 0,
    @Messages nvarchar(MAX) = NULL,
    @Result_Clear bit = 0,
    @Result nvarchar(MAX) = NULL,
    @TokensUsed_Clear bit = 0,
    @TokensUsed int = NULL,
    @TokensPrompt_Clear bit = 0,
    @TokensPrompt int = NULL,
    @TokensCompletion_Clear bit = 0,
    @TokensCompletion int = NULL,
    @TotalCost_Clear bit = 0,
    @TotalCost decimal(18, 6) = NULL,
    @Success bit = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @RunType nvarchar(20) = NULL,
    @ExecutionOrder_Clear bit = 0,
    @ExecutionOrder int = NULL,
    @Cost_Clear bit = 0,
    @Cost decimal(19, 8) = NULL,
    @CostCurrency_Clear bit = 0,
    @CostCurrency nvarchar(10) = NULL,
    @TokensUsedRollup_Clear bit = 0,
    @TokensUsedRollup int = NULL,
    @TokensPromptRollup_Clear bit = 0,
    @TokensPromptRollup int = NULL,
    @TokensCompletionRollup_Clear bit = 0,
    @TokensCompletionRollup int = NULL,
    @Temperature_Clear bit = 0,
    @Temperature decimal(3, 2) = NULL,
    @TopP_Clear bit = 0,
    @TopP decimal(3, 2) = NULL,
    @TopK_Clear bit = 0,
    @TopK int = NULL,
    @MinP_Clear bit = 0,
    @MinP decimal(3, 2) = NULL,
    @FrequencyPenalty_Clear bit = 0,
    @FrequencyPenalty decimal(3, 2) = NULL,
    @PresencePenalty_Clear bit = 0,
    @PresencePenalty decimal(3, 2) = NULL,
    @Seed_Clear bit = 0,
    @Seed int = NULL,
    @StopSequences_Clear bit = 0,
    @StopSequences nvarchar(MAX) = NULL,
    @ResponseFormat_Clear bit = 0,
    @ResponseFormat nvarchar(50) = NULL,
    @LogProbs_Clear bit = 0,
    @LogProbs bit = NULL,
    @TopLogProbs_Clear bit = 0,
    @TopLogProbs int = NULL,
    @DescendantCost_Clear bit = 0,
    @DescendantCost decimal(18, 6) = NULL,
    @ValidationAttemptCount_Clear bit = 0,
    @ValidationAttemptCount int = NULL,
    @SuccessfulValidationCount_Clear bit = 0,
    @SuccessfulValidationCount int = NULL,
    @FinalValidationPassed_Clear bit = 0,
    @FinalValidationPassed bit = NULL,
    @ValidationBehavior_Clear bit = 0,
    @ValidationBehavior nvarchar(50) = NULL,
    @RetryStrategy_Clear bit = 0,
    @RetryStrategy nvarchar(50) = NULL,
    @MaxRetriesConfigured_Clear bit = 0,
    @MaxRetriesConfigured int = NULL,
    @FinalValidationError_Clear bit = 0,
    @FinalValidationError nvarchar(500) = NULL,
    @ValidationErrorCount_Clear bit = 0,
    @ValidationErrorCount int = NULL,
    @CommonValidationError_Clear bit = 0,
    @CommonValidationError nvarchar(255) = NULL,
    @FirstAttemptAt_Clear bit = 0,
    @FirstAttemptAt datetimeoffset = NULL,
    @LastAttemptAt_Clear bit = 0,
    @LastAttemptAt datetimeoffset = NULL,
    @TotalRetryDurationMS_Clear bit = 0,
    @TotalRetryDurationMS int = NULL,
    @ValidationAttempts_Clear bit = 0,
    @ValidationAttempts nvarchar(MAX) = NULL,
    @ValidationSummary_Clear bit = 0,
    @ValidationSummary nvarchar(MAX) = NULL,
    @FailoverAttempts_Clear bit = 0,
    @FailoverAttempts int = NULL,
    @FailoverErrors_Clear bit = 0,
    @FailoverErrors nvarchar(MAX) = NULL,
    @FailoverDurations_Clear bit = 0,
    @FailoverDurations nvarchar(MAX) = NULL,
    @OriginalModelID_Clear bit = 0,
    @OriginalModelID uniqueidentifier = NULL,
    @OriginalRequestStartTime_Clear bit = 0,
    @OriginalRequestStartTime datetimeoffset = NULL,
    @TotalFailoverDuration_Clear bit = 0,
    @TotalFailoverDuration int = NULL,
    @RerunFromPromptRunID_Clear bit = 0,
    @RerunFromPromptRunID uniqueidentifier = NULL,
    @ModelSelection_Clear bit = 0,
    @ModelSelection nvarchar(MAX) = NULL,
    @Status nvarchar(50) = NULL,
    @Cancelled bit = NULL,
    @CancellationReason_Clear bit = 0,
    @CancellationReason nvarchar(MAX) = NULL,
    @ModelPowerRank_Clear bit = 0,
    @ModelPowerRank int = NULL,
    @SelectionStrategy_Clear bit = 0,
    @SelectionStrategy nvarchar(50) = NULL,
    @CacheHit bit = NULL,
    @CacheKey_Clear bit = 0,
    @CacheKey nvarchar(500) = NULL,
    @JudgeID_Clear bit = 0,
    @JudgeID uniqueidentifier = NULL,
    @JudgeScore_Clear bit = 0,
    @JudgeScore float(53) = NULL,
    @WasSelectedResult bit = NULL,
    @StreamingEnabled bit = NULL,
    @FirstTokenTime_Clear bit = 0,
    @FirstTokenTime int = NULL,
    @ErrorDetails_Clear bit = 0,
    @ErrorDetails nvarchar(MAX) = NULL,
    @ChildPromptID_Clear bit = 0,
    @ChildPromptID uniqueidentifier = NULL,
    @QueueTime_Clear bit = 0,
    @QueueTime int = NULL,
    @PromptTime_Clear bit = 0,
    @PromptTime int = NULL,
    @CompletionTime_Clear bit = 0,
    @CompletionTime int = NULL,
    @ModelSpecificResponseDetails_Clear bit = 0,
    @ModelSpecificResponseDetails nvarchar(MAX) = NULL,
    @EffortLevel_Clear bit = 0,
    @EffortLevel int = NULL,
    @RunName_Clear bit = 0,
    @RunName nvarchar(255) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @TestRunID_Clear bit = 0,
    @TestRunID uniqueidentifier = NULL,
    @AssistantPrefill_Clear bit = 0,
    @AssistantPrefill nvarchar(MAX) = NULL,
    @TokensCacheRead_Clear bit = 0,
    @TokensCacheRead int = NULL,
    @TokensCacheWrite_Clear bit = 0,
    @TokensCacheWrite int = NULL,
    @TokensCacheReadRollup_Clear bit = 0,
    @TokensCacheReadRollup int = NULL,
    @TokensCacheWriteRollup_Clear bit = 0,
    @TokensCacheWriteRollup int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[AIPromptRun]
    SET
        [PromptID] = ISNULL(@PromptID, [PromptID]),
        [ModelID] = ISNULL(@ModelID, [ModelID]),
        [VendorID] = ISNULL(@VendorID, [VendorID]),
        [AgentID] = CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, [AgentID]) END,
        [ConfigurationID] = CASE WHEN @ConfigurationID_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationID, [ConfigurationID]) END,
        [RunAt] = ISNULL(@RunAt, [RunAt]),
        [CompletedAt] = CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, [CompletedAt]) END,
        [ExecutionTimeMS] = CASE WHEN @ExecutionTimeMS_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionTimeMS, [ExecutionTimeMS]) END,
        [Messages] = CASE WHEN @Messages_Clear = 1 THEN NULL ELSE ISNULL(@Messages, [Messages]) END,
        [Result] = CASE WHEN @Result_Clear = 1 THEN NULL ELSE ISNULL(@Result, [Result]) END,
        [TokensUsed] = CASE WHEN @TokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsed, [TokensUsed]) END,
        [TokensPrompt] = CASE WHEN @TokensPrompt_Clear = 1 THEN NULL ELSE ISNULL(@TokensPrompt, [TokensPrompt]) END,
        [TokensCompletion] = CASE WHEN @TokensCompletion_Clear = 1 THEN NULL ELSE ISNULL(@TokensCompletion, [TokensCompletion]) END,
        [TotalCost] = CASE WHEN @TotalCost_Clear = 1 THEN NULL ELSE ISNULL(@TotalCost, [TotalCost]) END,
        [Success] = ISNULL(@Success, [Success]),
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END,
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END,
        [RunType] = ISNULL(@RunType, [RunType]),
        [ExecutionOrder] = CASE WHEN @ExecutionOrder_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionOrder, [ExecutionOrder]) END,
        [Cost] = CASE WHEN @Cost_Clear = 1 THEN NULL ELSE ISNULL(@Cost, [Cost]) END,
        [CostCurrency] = CASE WHEN @CostCurrency_Clear = 1 THEN NULL ELSE ISNULL(@CostCurrency, [CostCurrency]) END,
        [TokensUsedRollup] = CASE WHEN @TokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsedRollup, [TokensUsedRollup]) END,
        [TokensPromptRollup] = CASE WHEN @TokensPromptRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensPromptRollup, [TokensPromptRollup]) END,
        [TokensCompletionRollup] = CASE WHEN @TokensCompletionRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCompletionRollup, [TokensCompletionRollup]) END,
        [Temperature] = CASE WHEN @Temperature_Clear = 1 THEN NULL ELSE ISNULL(@Temperature, [Temperature]) END,
        [TopP] = CASE WHEN @TopP_Clear = 1 THEN NULL ELSE ISNULL(@TopP, [TopP]) END,
        [TopK] = CASE WHEN @TopK_Clear = 1 THEN NULL ELSE ISNULL(@TopK, [TopK]) END,
        [MinP] = CASE WHEN @MinP_Clear = 1 THEN NULL ELSE ISNULL(@MinP, [MinP]) END,
        [FrequencyPenalty] = CASE WHEN @FrequencyPenalty_Clear = 1 THEN NULL ELSE ISNULL(@FrequencyPenalty, [FrequencyPenalty]) END,
        [PresencePenalty] = CASE WHEN @PresencePenalty_Clear = 1 THEN NULL ELSE ISNULL(@PresencePenalty, [PresencePenalty]) END,
        [Seed] = CASE WHEN @Seed_Clear = 1 THEN NULL ELSE ISNULL(@Seed, [Seed]) END,
        [StopSequences] = CASE WHEN @StopSequences_Clear = 1 THEN NULL ELSE ISNULL(@StopSequences, [StopSequences]) END,
        [ResponseFormat] = CASE WHEN @ResponseFormat_Clear = 1 THEN NULL ELSE ISNULL(@ResponseFormat, [ResponseFormat]) END,
        [LogProbs] = CASE WHEN @LogProbs_Clear = 1 THEN NULL ELSE ISNULL(@LogProbs, [LogProbs]) END,
        [TopLogProbs] = CASE WHEN @TopLogProbs_Clear = 1 THEN NULL ELSE ISNULL(@TopLogProbs, [TopLogProbs]) END,
        [DescendantCost] = CASE WHEN @DescendantCost_Clear = 1 THEN NULL ELSE ISNULL(@DescendantCost, [DescendantCost]) END,
        [ValidationAttemptCount] = CASE WHEN @ValidationAttemptCount_Clear = 1 THEN NULL ELSE ISNULL(@ValidationAttemptCount, [ValidationAttemptCount]) END,
        [SuccessfulValidationCount] = CASE WHEN @SuccessfulValidationCount_Clear = 1 THEN NULL ELSE ISNULL(@SuccessfulValidationCount, [SuccessfulValidationCount]) END,
        [FinalValidationPassed] = CASE WHEN @FinalValidationPassed_Clear = 1 THEN NULL ELSE ISNULL(@FinalValidationPassed, [FinalValidationPassed]) END,
        [ValidationBehavior] = CASE WHEN @ValidationBehavior_Clear = 1 THEN NULL ELSE ISNULL(@ValidationBehavior, [ValidationBehavior]) END,
        [RetryStrategy] = CASE WHEN @RetryStrategy_Clear = 1 THEN NULL ELSE ISNULL(@RetryStrategy, [RetryStrategy]) END,
        [MaxRetriesConfigured] = CASE WHEN @MaxRetriesConfigured_Clear = 1 THEN NULL ELSE ISNULL(@MaxRetriesConfigured, [MaxRetriesConfigured]) END,
        [FinalValidationError] = CASE WHEN @FinalValidationError_Clear = 1 THEN NULL ELSE ISNULL(@FinalValidationError, [FinalValidationError]) END,
        [ValidationErrorCount] = CASE WHEN @ValidationErrorCount_Clear = 1 THEN NULL ELSE ISNULL(@ValidationErrorCount, [ValidationErrorCount]) END,
        [CommonValidationError] = CASE WHEN @CommonValidationError_Clear = 1 THEN NULL ELSE ISNULL(@CommonValidationError, [CommonValidationError]) END,
        [FirstAttemptAt] = CASE WHEN @FirstAttemptAt_Clear = 1 THEN NULL ELSE ISNULL(@FirstAttemptAt, [FirstAttemptAt]) END,
        [LastAttemptAt] = CASE WHEN @LastAttemptAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAttemptAt, [LastAttemptAt]) END,
        [TotalRetryDurationMS] = CASE WHEN @TotalRetryDurationMS_Clear = 1 THEN NULL ELSE ISNULL(@TotalRetryDurationMS, [TotalRetryDurationMS]) END,
        [ValidationAttempts] = CASE WHEN @ValidationAttempts_Clear = 1 THEN NULL ELSE ISNULL(@ValidationAttempts, [ValidationAttempts]) END,
        [ValidationSummary] = CASE WHEN @ValidationSummary_Clear = 1 THEN NULL ELSE ISNULL(@ValidationSummary, [ValidationSummary]) END,
        [FailoverAttempts] = CASE WHEN @FailoverAttempts_Clear = 1 THEN NULL ELSE ISNULL(@FailoverAttempts, [FailoverAttempts]) END,
        [FailoverErrors] = CASE WHEN @FailoverErrors_Clear = 1 THEN NULL ELSE ISNULL(@FailoverErrors, [FailoverErrors]) END,
        [FailoverDurations] = CASE WHEN @FailoverDurations_Clear = 1 THEN NULL ELSE ISNULL(@FailoverDurations, [FailoverDurations]) END,
        [OriginalModelID] = CASE WHEN @OriginalModelID_Clear = 1 THEN NULL ELSE ISNULL(@OriginalModelID, [OriginalModelID]) END,
        [OriginalRequestStartTime] = CASE WHEN @OriginalRequestStartTime_Clear = 1 THEN NULL ELSE ISNULL(@OriginalRequestStartTime, [OriginalRequestStartTime]) END,
        [TotalFailoverDuration] = CASE WHEN @TotalFailoverDuration_Clear = 1 THEN NULL ELSE ISNULL(@TotalFailoverDuration, [TotalFailoverDuration]) END,
        [RerunFromPromptRunID] = CASE WHEN @RerunFromPromptRunID_Clear = 1 THEN NULL ELSE ISNULL(@RerunFromPromptRunID, [RerunFromPromptRunID]) END,
        [ModelSelection] = CASE WHEN @ModelSelection_Clear = 1 THEN NULL ELSE ISNULL(@ModelSelection, [ModelSelection]) END,
        [Status] = ISNULL(@Status, [Status]),
        [Cancelled] = ISNULL(@Cancelled, [Cancelled]),
        [CancellationReason] = CASE WHEN @CancellationReason_Clear = 1 THEN NULL ELSE ISNULL(@CancellationReason, [CancellationReason]) END,
        [ModelPowerRank] = CASE WHEN @ModelPowerRank_Clear = 1 THEN NULL ELSE ISNULL(@ModelPowerRank, [ModelPowerRank]) END,
        [SelectionStrategy] = CASE WHEN @SelectionStrategy_Clear = 1 THEN NULL ELSE ISNULL(@SelectionStrategy, [SelectionStrategy]) END,
        [CacheHit] = ISNULL(@CacheHit, [CacheHit]),
        [CacheKey] = CASE WHEN @CacheKey_Clear = 1 THEN NULL ELSE ISNULL(@CacheKey, [CacheKey]) END,
        [JudgeID] = CASE WHEN @JudgeID_Clear = 1 THEN NULL ELSE ISNULL(@JudgeID, [JudgeID]) END,
        [JudgeScore] = CASE WHEN @JudgeScore_Clear = 1 THEN NULL ELSE ISNULL(@JudgeScore, [JudgeScore]) END,
        [WasSelectedResult] = ISNULL(@WasSelectedResult, [WasSelectedResult]),
        [StreamingEnabled] = ISNULL(@StreamingEnabled, [StreamingEnabled]),
        [FirstTokenTime] = CASE WHEN @FirstTokenTime_Clear = 1 THEN NULL ELSE ISNULL(@FirstTokenTime, [FirstTokenTime]) END,
        [ErrorDetails] = CASE WHEN @ErrorDetails_Clear = 1 THEN NULL ELSE ISNULL(@ErrorDetails, [ErrorDetails]) END,
        [ChildPromptID] = CASE WHEN @ChildPromptID_Clear = 1 THEN NULL ELSE ISNULL(@ChildPromptID, [ChildPromptID]) END,
        [QueueTime] = CASE WHEN @QueueTime_Clear = 1 THEN NULL ELSE ISNULL(@QueueTime, [QueueTime]) END,
        [PromptTime] = CASE WHEN @PromptTime_Clear = 1 THEN NULL ELSE ISNULL(@PromptTime, [PromptTime]) END,
        [CompletionTime] = CASE WHEN @CompletionTime_Clear = 1 THEN NULL ELSE ISNULL(@CompletionTime, [CompletionTime]) END,
        [ModelSpecificResponseDetails] = CASE WHEN @ModelSpecificResponseDetails_Clear = 1 THEN NULL ELSE ISNULL(@ModelSpecificResponseDetails, [ModelSpecificResponseDetails]) END,
        [EffortLevel] = CASE WHEN @EffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@EffortLevel, [EffortLevel]) END,
        [RunName] = CASE WHEN @RunName_Clear = 1 THEN NULL ELSE ISNULL(@RunName, [RunName]) END,
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END,
        [TestRunID] = CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, [TestRunID]) END,
        [AssistantPrefill] = CASE WHEN @AssistantPrefill_Clear = 1 THEN NULL ELSE ISNULL(@AssistantPrefill, [AssistantPrefill]) END,
        [TokensCacheRead] = CASE WHEN @TokensCacheRead_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheRead, [TokensCacheRead]) END,
        [TokensCacheWrite] = CASE WHEN @TokensCacheWrite_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheWrite, [TokensCacheWrite]) END,
        [TokensCacheReadRollup] = CASE WHEN @TokensCacheReadRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheReadRollup, [TokensCacheReadRollup]) END,
        [TokensCacheWriteRollup] = CASE WHEN @TokensCacheWriteRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheWriteRollup, [TokensCacheWriteRollup]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [__mj].[vwAIPromptRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [__mj].[vwAIPromptRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [__mj].[spUpdateAIPromptRun] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPromptRun table
------------------------------------------------------------
IF OBJECT_ID('[__mj].[trgUpdateAIPromptRun]', 'TR') IS NOT NULL
    DROP TRIGGER [__mj].[trgUpdateAIPromptRun];
GO
CREATE TRIGGER [__mj].trgUpdateAIPromptRun
ON [__mj].[AIPromptRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[AIPromptRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [__mj].[AIPromptRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        -----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: spCreateConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
IF OBJECT_ID('[__mj].[spCreateConversationDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [__mj].[spCreateConversationDetail];
GO

CREATE PROCEDURE [__mj].[spCreateConversationDetail]
    @ID uniqueidentifier = NULL,
    @ConversationID uniqueidentifier,
    @ExternalID_Clear bit = 0,
    @ExternalID nvarchar(100) = NULL,
    @Role nvarchar(20) = NULL,
    @Message nvarchar(MAX),
    @Error_Clear bit = 0,
    @Error nvarchar(MAX) = NULL,
    @HiddenToUser bit = NULL,
    @UserRating_Clear bit = 0,
    @UserRating int = NULL,
    @UserFeedback_Clear bit = 0,
    @UserFeedback nvarchar(MAX) = NULL,
    @ReflectionInsights_Clear bit = 0,
    @ReflectionInsights nvarchar(MAX) = NULL,
    @SummaryOfEarlierConversation_Clear bit = 0,
    @SummaryOfEarlierConversation nvarchar(MAX) = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @ArtifactID_Clear bit = 0,
    @ArtifactID uniqueidentifier = NULL,
    @ArtifactVersionID_Clear bit = 0,
    @ArtifactVersionID uniqueidentifier = NULL,
    @CompletionTime_Clear bit = 0,
    @CompletionTime bigint = NULL,
    @IsPinned bit = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @SuggestedResponses_Clear bit = 0,
    @SuggestedResponses nvarchar(MAX) = NULL,
    @TestRunID_Clear bit = 0,
    @TestRunID uniqueidentifier = NULL,
    @ResponseForm_Clear bit = 0,
    @ResponseForm nvarchar(MAX) = NULL,
    @ActionableCommands_Clear bit = 0,
    @ActionableCommands nvarchar(MAX) = NULL,
    @AutomaticCommands_Clear bit = 0,
    @AutomaticCommands nvarchar(MAX) = NULL,
    @OriginalMessageChanged bit = NULL,
    @AgentSessionID_Clear bit = 0,
    @AgentSessionID uniqueidentifier = NULL,
    @TurnEndedAt_Clear bit = 0,
    @TurnEndedAt datetimeoffset = NULL,
    @UtteranceStartMs_Clear bit = 0,
    @UtteranceStartMs int = NULL,
    @UtteranceEndMs_Clear bit = 0,
    @UtteranceEndMs int = NULL,
    @MediaType_Clear bit = 0,
    @MediaType nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [__mj].[ConversationDetail]
            (
                [ID],
                [ConversationID],
                [ExternalID],
                [Role],
                [Message],
                [Error],
                [HiddenToUser],
                [UserRating],
                [UserFeedback],
                [ReflectionInsights],
                [SummaryOfEarlierConversation],
                [UserID],
                [ArtifactID],
                [ArtifactVersionID],
                [CompletionTime],
                [IsPinned],
                [ParentID],
                [AgentID],
                [Status],
                [SuggestedResponses],
                [TestRunID],
                [ResponseForm],
                [ActionableCommands],
                [AutomaticCommands],
                [OriginalMessageChanged],
                [AgentSessionID],
                [TurnEndedAt],
                [UtteranceStartMs],
                [UtteranceEndMs],
                [MediaType]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ConversationID,
                CASE WHEN @ExternalID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalID, NULL) END,
                ISNULL(@Role, user_name()),
                @Message,
                CASE WHEN @Error_Clear = 1 THEN NULL ELSE ISNULL(@Error, NULL) END,
                ISNULL(@HiddenToUser, 0),
                CASE WHEN @UserRating_Clear = 1 THEN NULL ELSE ISNULL(@UserRating, NULL) END,
                CASE WHEN @UserFeedback_Clear = 1 THEN NULL ELSE ISNULL(@UserFeedback, NULL) END,
                CASE WHEN @ReflectionInsights_Clear = 1 THEN NULL ELSE ISNULL(@ReflectionInsights, NULL) END,
                CASE WHEN @SummaryOfEarlierConversation_Clear = 1 THEN NULL ELSE ISNULL(@SummaryOfEarlierConversation, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @ArtifactID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactID, NULL) END,
                CASE WHEN @ArtifactVersionID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactVersionID, NULL) END,
                CASE WHEN @CompletionTime_Clear = 1 THEN NULL ELSE ISNULL(@CompletionTime, NULL) END,
                ISNULL(@IsPinned, 0),
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                ISNULL(@Status, 'Complete'),
                CASE WHEN @SuggestedResponses_Clear = 1 THEN NULL ELSE ISNULL(@SuggestedResponses, NULL) END,
                CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, NULL) END,
                CASE WHEN @ResponseForm_Clear = 1 THEN NULL ELSE ISNULL(@ResponseForm, NULL) END,
                CASE WHEN @ActionableCommands_Clear = 1 THEN NULL ELSE ISNULL(@ActionableCommands, NULL) END,
                CASE WHEN @AutomaticCommands_Clear = 1 THEN NULL ELSE ISNULL(@AutomaticCommands, NULL) END,
                ISNULL(@OriginalMessageChanged, 0),
                CASE WHEN @AgentSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AgentSessionID, NULL) END,
                CASE WHEN @TurnEndedAt_Clear = 1 THEN NULL ELSE ISNULL(@TurnEndedAt, NULL) END,
                CASE WHEN @UtteranceStartMs_Clear = 1 THEN NULL ELSE ISNULL(@UtteranceStartMs, NULL) END,
                CASE WHEN @UtteranceEndMs_Clear = 1 THEN NULL ELSE ISNULL(@UtteranceEndMs, NULL) END,
                CASE WHEN @MediaType_Clear = 1 THEN NULL ELSE ISNULL(@MediaType, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [__mj].[ConversationDetail]
            (
                [ConversationID],
                [ExternalID],
                [Role],
                [Message],
                [Error],
                [HiddenToUser],
                [UserRating],
                [UserFeedback],
                [ReflectionInsights],
                [SummaryOfEarlierConversation],
                [UserID],
                [ArtifactID],
                [ArtifactVersionID],
                [CompletionTime],
                [IsPinned],
                [ParentID],
                [AgentID],
                [Status],
                [SuggestedResponses],
                [TestRunID],
                [ResponseForm],
                [ActionableCommands],
                [AutomaticCommands],
                [OriginalMessageChanged],
                [AgentSessionID],
                [TurnEndedAt],
                [UtteranceStartMs],
                [UtteranceEndMs],
                [MediaType]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ConversationID,
                CASE WHEN @ExternalID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalID, NULL) END,
                ISNULL(@Role, user_name()),
                @Message,
                CASE WHEN @Error_Clear = 1 THEN NULL ELSE ISNULL(@Error, NULL) END,
                ISNULL(@HiddenToUser, 0),
                CASE WHEN @UserRating_Clear = 1 THEN NULL ELSE ISNULL(@UserRating, NULL) END,
                CASE WHEN @UserFeedback_Clear = 1 THEN NULL ELSE ISNULL(@UserFeedback, NULL) END,
                CASE WHEN @ReflectionInsights_Clear = 1 THEN NULL ELSE ISNULL(@ReflectionInsights, NULL) END,
                CASE WHEN @SummaryOfEarlierConversation_Clear = 1 THEN NULL ELSE ISNULL(@SummaryOfEarlierConversation, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @ArtifactID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactID, NULL) END,
                CASE WHEN @ArtifactVersionID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactVersionID, NULL) END,
                CASE WHEN @CompletionTime_Clear = 1 THEN NULL ELSE ISNULL(@CompletionTime, NULL) END,
                ISNULL(@IsPinned, 0),
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                ISNULL(@Status, 'Complete'),
                CASE WHEN @SuggestedResponses_Clear = 1 THEN NULL ELSE ISNULL(@SuggestedResponses, NULL) END,
                CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, NULL) END,
                CASE WHEN @ResponseForm_Clear = 1 THEN NULL ELSE ISNULL(@ResponseForm, NULL) END,
                CASE WHEN @ActionableCommands_Clear = 1 THEN NULL ELSE ISNULL(@ActionableCommands, NULL) END,
                CASE WHEN @AutomaticCommands_Clear = 1 THEN NULL ELSE ISNULL(@AutomaticCommands, NULL) END,
                ISNULL(@OriginalMessageChanged, 0),
                CASE WHEN @AgentSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AgentSessionID, NULL) END,
                CASE WHEN @TurnEndedAt_Clear = 1 THEN NULL ELSE ISNULL(@TurnEndedAt, NULL) END,
                CASE WHEN @UtteranceStartMs_Clear = 1 THEN NULL ELSE ISNULL(@UtteranceStartMs, NULL) END,
                CASE WHEN @UtteranceEndMs_Clear = 1 THEN NULL ELSE ISNULL(@UtteranceEndMs, NULL) END,
                CASE WHEN @MediaType_Clear = 1 THEN NULL ELSE ISNULL(@MediaType, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwConversationDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [__mj].[spCreateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    -----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: spUpdateConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
IF OBJECT_ID('[__mj].[spUpdateConversationDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [__mj].[spUpdateConversationDetail];
GO

CREATE PROCEDURE [__mj].[spUpdateConversationDetail]
    @ID uniqueidentifier,
    @ConversationID uniqueidentifier = NULL,
    @ExternalID_Clear bit = 0,
    @ExternalID nvarchar(100) = NULL,
    @Role nvarchar(20) = NULL,
    @Message nvarchar(MAX) = NULL,
    @Error_Clear bit = 0,
    @Error nvarchar(MAX) = NULL,
    @HiddenToUser bit = NULL,
    @UserRating_Clear bit = 0,
    @UserRating int = NULL,
    @UserFeedback_Clear bit = 0,
    @UserFeedback nvarchar(MAX) = NULL,
    @ReflectionInsights_Clear bit = 0,
    @ReflectionInsights nvarchar(MAX) = NULL,
    @SummaryOfEarlierConversation_Clear bit = 0,
    @SummaryOfEarlierConversation nvarchar(MAX) = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @ArtifactID_Clear bit = 0,
    @ArtifactID uniqueidentifier = NULL,
    @ArtifactVersionID_Clear bit = 0,
    @ArtifactVersionID uniqueidentifier = NULL,
    @CompletionTime_Clear bit = 0,
    @CompletionTime bigint = NULL,
    @IsPinned bit = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @SuggestedResponses_Clear bit = 0,
    @SuggestedResponses nvarchar(MAX) = NULL,
    @TestRunID_Clear bit = 0,
    @TestRunID uniqueidentifier = NULL,
    @ResponseForm_Clear bit = 0,
    @ResponseForm nvarchar(MAX) = NULL,
    @ActionableCommands_Clear bit = 0,
    @ActionableCommands nvarchar(MAX) = NULL,
    @AutomaticCommands_Clear bit = 0,
    @AutomaticCommands nvarchar(MAX) = NULL,
    @OriginalMessageChanged bit = NULL,
    @AgentSessionID_Clear bit = 0,
    @AgentSessionID uniqueidentifier = NULL,
    @TurnEndedAt_Clear bit = 0,
    @TurnEndedAt datetimeoffset = NULL,
    @UtteranceStartMs_Clear bit = 0,
    @UtteranceStartMs int = NULL,
    @UtteranceEndMs_Clear bit = 0,
    @UtteranceEndMs int = NULL,
    @MediaType_Clear bit = 0,
    @MediaType nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[ConversationDetail]
    SET
        [ConversationID] = ISNULL(@ConversationID, [ConversationID]),
        [ExternalID] = CASE WHEN @ExternalID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalID, [ExternalID]) END,
        [Role] = ISNULL(@Role, [Role]),
        [Message] = ISNULL(@Message, [Message]),
        [Error] = CASE WHEN @Error_Clear = 1 THEN NULL ELSE ISNULL(@Error, [Error]) END,
        [HiddenToUser] = ISNULL(@HiddenToUser, [HiddenToUser]),
        [UserRating] = CASE WHEN @UserRating_Clear = 1 THEN NULL ELSE ISNULL(@UserRating, [UserRating]) END,
        [UserFeedback] = CASE WHEN @UserFeedback_Clear = 1 THEN NULL ELSE ISNULL(@UserFeedback, [UserFeedback]) END,
        [ReflectionInsights] = CASE WHEN @ReflectionInsights_Clear = 1 THEN NULL ELSE ISNULL(@ReflectionInsights, [ReflectionInsights]) END,
        [SummaryOfEarlierConversation] = CASE WHEN @SummaryOfEarlierConversation_Clear = 1 THEN NULL ELSE ISNULL(@SummaryOfEarlierConversation, [SummaryOfEarlierConversation]) END,
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END,
        [ArtifactID] = CASE WHEN @ArtifactID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactID, [ArtifactID]) END,
        [ArtifactVersionID] = CASE WHEN @ArtifactVersionID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactVersionID, [ArtifactVersionID]) END,
        [CompletionTime] = CASE WHEN @CompletionTime_Clear = 1 THEN NULL ELSE ISNULL(@CompletionTime, [CompletionTime]) END,
        [IsPinned] = ISNULL(@IsPinned, [IsPinned]),
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END,
        [AgentID] = CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, [AgentID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [SuggestedResponses] = CASE WHEN @SuggestedResponses_Clear = 1 THEN NULL ELSE ISNULL(@SuggestedResponses, [SuggestedResponses]) END,
        [TestRunID] = CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, [TestRunID]) END,
        [ResponseForm] = CASE WHEN @ResponseForm_Clear = 1 THEN NULL ELSE ISNULL(@ResponseForm, [ResponseForm]) END,
        [ActionableCommands] = CASE WHEN @ActionableCommands_Clear = 1 THEN NULL ELSE ISNULL(@ActionableCommands, [ActionableCommands]) END,
        [AutomaticCommands] = CASE WHEN @AutomaticCommands_Clear = 1 THEN NULL ELSE ISNULL(@AutomaticCommands, [AutomaticCommands]) END,
        [OriginalMessageChanged] = ISNULL(@OriginalMessageChanged, [OriginalMessageChanged]),
        [AgentSessionID] = CASE WHEN @AgentSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AgentSessionID, [AgentSessionID]) END,
        [TurnEndedAt] = CASE WHEN @TurnEndedAt_Clear = 1 THEN NULL ELSE ISNULL(@TurnEndedAt, [TurnEndedAt]) END,
        [UtteranceStartMs] = CASE WHEN @UtteranceStartMs_Clear = 1 THEN NULL ELSE ISNULL(@UtteranceStartMs, [UtteranceStartMs]) END,
        [UtteranceEndMs] = CASE WHEN @UtteranceEndMs_Clear = 1 THEN NULL ELSE ISNULL(@UtteranceEndMs, [UtteranceEndMs]) END,
        [MediaType] = CASE WHEN @MediaType_Clear = 1 THEN NULL ELSE ISNULL(@MediaType, [MediaType]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [__mj].[vwConversationDetails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [__mj].[vwConversationDetails]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [__mj].[spUpdateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationDetail table
------------------------------------------------------------
IF OBJECT_ID('[__mj].[trgUpdateConversationDetail]', 'TR') IS NOT NULL
    DROP TRIGGER [__mj].[trgUpdateConversationDetail];
GO
CREATE TRIGGER [__mj].trgUpdateConversationDetail
ON [__mj].[ConversationDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[ConversationDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [__mj].[ConversationDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        