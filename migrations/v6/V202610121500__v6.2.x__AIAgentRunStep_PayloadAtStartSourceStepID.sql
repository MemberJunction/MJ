-- =============================================================================
-- AIAgentRunStep.PayloadAtStartSourceStepID, and AIAgentRun.Result deprecated (v6.2.x)
-- =============================================================================
-- A step's starting payload is usually the ending payload of the step before it, so storing it
-- on both rows writes the same JSON twice. PayloadAtStartSourceStepID points at the step in the
-- same run whose PayloadAtEnd equals this step's starting payload. When it is set, PayloadAtStart
-- is NULL, and a reader resolves the starting payload with one lookup:
-- PayloadAtStart ?? source.PayloadAtEnd.
--
-- AIAgentRun.Result holds the same value as FinalPayload. Agent runs no longer write it; the
-- column stays for existing rows and external readers, and its description marks it deprecated.
--
-- AIPrompt.TemplateDataCapture chooses which template inputs a prompt run stores in
-- AIPromptRun.Messages (None, Referenced, Full); NULL uses the server default.
--
-- DDL and extended properties only. The FK index, base view, stored procedures and EntityField
-- metadata are produced by CodeGen and appended below the CodeGen banner.
-- =============================================================================

ALTER TABLE ${flyway:defaultSchema}.AIAgentRunStep ADD PayloadAtStartSourceStepID UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.AIAgentRunStep
    ADD CONSTRAINT FK_AIAgentRunStep_PayloadAtStartSourceStepID
        FOREIGN KEY (PayloadAtStartSourceStepID) REFERENCES ${flyway:defaultSchema}.AIAgentRunStep(ID);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When set, PayloadAtStart is not stored on this row because it equals the PayloadAtEnd of the referenced step in the same run. Read that step''s PayloadAtEnd to get this step''s starting payload.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentRunStep',
    @level2type = N'COLUMN', @level2name = N'PayloadAtStartSourceStepID';
GO

-- Drop-then-add rather than sp_updateextendedproperty, which throws when the property does not
-- exist yet (see migrations/CLAUDE.md, "Modifying Existing Fields").
IF EXISTS (
    SELECT 1 FROM sys.extended_properties
    WHERE major_id = OBJECT_ID('${flyway:defaultSchema}.AIAgentRunStep')
      AND minor_id = (
          SELECT column_id FROM sys.columns
          WHERE object_id = OBJECT_ID('${flyway:defaultSchema}.AIAgentRunStep')
            AND name = 'PayloadAtStart'
      )
      AND name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'AIAgentRunStep',
        @level2type = N'COLUMN', @level2name = N'PayloadAtStart';
END
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON serialization of the Payload state at the start of this step. NULL when PayloadAtStartSourceStepID is set; the starting payload is then the PayloadAtEnd of that step.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentRunStep',
    @level2type = N'COLUMN', @level2name = N'PayloadAtStart';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties
    WHERE major_id = OBJECT_ID('${flyway:defaultSchema}.AIAgentRun')
      AND minor_id = (
          SELECT column_id FROM sys.columns
          WHERE object_id = OBJECT_ID('${flyway:defaultSchema}.AIAgentRun')
            AND name = 'Result'
      )
      AND name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'AIAgentRun',
        @level2type = N'COLUMN', @level2name = N'Result';
END
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Deprecated. No longer written by agent runs; use FinalPayload, which holds the same value. Kept for existing rows and external readers.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentRun',
    @level2type = N'COLUMN', @level2name = N'Result';
GO

ALTER TABLE ${flyway:defaultSchema}.AIPrompt ADD TemplateDataCapture NVARCHAR(20) NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.AIPrompt
    ADD CONSTRAINT CK_AIPrompt_TemplateDataCapture
        CHECK (TemplateDataCapture IN ('None', 'Referenced', 'Full'));
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Which template inputs (data, templateData) prompt runs store in Messages: None (shape only), Referenced (only keys the template uses) or Full. NULL uses the server default.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIPrompt',
    @level2type = N'COLUMN', @level2name = N'TemplateDataCapture';
GO


















































/**************************************************************************************************
 **************************************************************************************************
 **                                                                                              **
 **                    GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND                 **
 **                                                                                              **
 **  Everything below this block was produced by `mj codegen` against the schema above, on a     **
 **  database built from scratch for this branch (MJ_6_2_0_CB_payload_dedupe; the AIPrompt       **
 **  part on MJ_6_2_0_CB_payload_dedupe_v2). It contains:                                        **
 **    • EntityField rows for PayloadAtStartSourceStepID and its virtual name field              **
 **      PayloadAtStartSourceStep, with their categories and related-entity name field map       **
 **    • the EntityRelationship row for the new self-reference                                   **
 **    • foreign-key indexes (IDX_AUTO_MJ_FKEY_AIAgentRunStep_*)                                 **
 **    • the ParentID hierarchy functions and the base view (vwAIAgentRunSteps)                  **
 **    • spCreate/spUpdate/spDelete for AIAgentRunStep, with their permissions and the           **
 **      __mj_UpdatedAt trigger                                                                  **
 **    • spDelete for AIAgentRun, which deletes its steps through spDeleteAIAgentRunStep.        **
 **      It also passes through the EmbeddingVectorBinary columns of AIAgentNote and             **
 **      AIAgentExample, which V202610061614 added without regenerating this procedure.          **
 **    • the EntityField row for AIPrompt.TemplateDataCapture, with its category and its value   **
 **      list (EntityFieldValue rows Full, None and Referenced; ValueListType List)              **
 **    • the AIPrompt foreign-key index checks (no new index) and base view (vwAIPrompts)        **
 **    • spCreate/spUpdate/spDelete for AIPrompt, with their permissions and the                 **
 **      __mj_UpdatedAt trigger. spDeleteAIPrompt passes the new column through its              **
 **      ResultSelectorPromptID self-reference cascade.                                          **
 **                                                                                              **
 **  The new PayloadAtStart and Result descriptions need no generated SQL here:                  **
 **  spUpdateExistingEntityFieldsFromSchema (run by CodeGen and by R__RefreshMetadata)           **
 **  copies them from the extended properties above.                                             **
 **                                                                                              **
 **  Left out on purpose: each CodeGen run also generated validator functions (GeneratedCode     **
 **  rows) for nine unrelated entities whose CHECK constraints had none on the fresh database.   **
 **                                                                                              **
 **  It is appended here — rather than left as a standalone CodeGen_Run_*.sql file — so the      **
 **  whole change applies as ONE migration, per MJ convention. DO NOT hand-edit below this       **
 **  line; if the hand-written DDL above changes, re-run CodeGen and replace this section.       **
 **                                                                                              **
 **************************************************************************************************
 **************************************************************************************************/

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '970bc9b2-f5f8-4174-bb56-ddff3d4ba2ad' OR (EntityID = '99273DAD-560E-4ABC-8332-C97AB58B7463' AND Name = 'PayloadAtStartSourceStepID')) BEGIN
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
            '970bc9b2-f5f8-4174-bb56-ddff3d4ba2ad',
            '99273DAD-560E-4ABC-8332-C97AB58B7463', -- Entity: MJ: AI Agent Run Steps
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '99273DAD-560E-4ABC-8332-C97AB58B7463'),
            'PayloadAtStartSourceStepID',
            'Payload At Start Source Step ID',
            'When set, PayloadAtStart is not stored on this row because it equals the PayloadAtEnd of the referenced step in the same run. Read that step''s PayloadAtEnd to get this step''s starting payload.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            '99273DAD-560E-4ABC-8332-C97AB58B7463',
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


/* Create Entity Relationship: MJ: AI Agent Run Steps -> MJ: AI Agent Run Steps (One To Many via PayloadAtStartSourceStepID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '8b2d85d2-60fb-42a4-9529-0df69146ddda'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8b2d85d2-60fb-42a4-9529-0df69146ddda', '99273DAD-560E-4ABC-8332-C97AB58B7463', '99273DAD-560E-4ABC-8332-C97AB58B7463', 'PayloadAtStartSourceStepID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for AIAgentRunStep */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentRunID in table AIAgentRunStep
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRunStep_AgentRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRunStep]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRunStep_AgentRunID ON [${flyway:defaultSchema}].[AIAgentRunStep] ([AgentRunID]);

-- Index for foreign key ParentID in table AIAgentRunStep
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRunStep_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRunStep]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRunStep_ParentID ON [${flyway:defaultSchema}].[AIAgentRunStep] ([ParentID]);

-- Index for foreign key PayloadAtStartSourceStepID in table AIAgentRunStep
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRunStep_PayloadAtStartSourceStepID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRunStep]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRunStep_PayloadAtStartSourceStepID ON [${flyway:defaultSchema}].[AIAgentRunStep] ([PayloadAtStartSourceStepID]);

/* SQL text to update entity field related entity name field map for entity field ID 970BC9B2-F5F8-4174-BB56-DDFF3D4BA2AD */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='970BC9B2-F5F8-4174-BB56-DDFF3D4BA2AD', @RelatedEntityNameFieldMap='PayloadAtStartSourceStep';

/* Hierarchy Metadata Function SQL for MJ: AI Agent Run Steps.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: fnAIAgentRunStepParentID_GetHierarchyMeta
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: [AIAgentRunStep].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIAgentRunStepParentID_GetHierarchyMeta]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIAgentRunStepParentID_GetHierarchyMeta];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIAgentRunStepParentID_GetHierarchyMeta]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_Ancestors AS (
        SELECT
            [ID],
            [ParentID],
            0 AS [Depth],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[AIAgentRunStep]
        WHERE
            [ID] = @RecordID

        UNION ALL

        SELECT
            p.[ID],
            p.[ParentID],
            c.[Depth] + 1 AS [Depth],
            CAST('/' + CAST(p.[ID] AS NVARCHAR(36)) + c.[Path] AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[AIAgentRunStep] p
        INNER JOIN
            CTE_Ancestors c ON p.[ID] = c.[ParentID]
        WHERE
            c.[Depth] < 100
    )
    SELECT TOP 1
        a.[ID] AS [RootID],
        (SELECT MAX([Depth]) FROM CTE_Ancestors) AS [Depth],
        (SELECT TOP 1 [Path] FROM CTE_Ancestors ORDER BY [Depth] DESC) AS [Path],
        CAST(CASE WHEN EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[AIAgentRunStep] WHERE [ParentID] = @RecordID) THEN 0 ELSE 1 END AS BIT) AS [IsLeaf],
        (SELECT COUNT(1) FROM [${flyway:defaultSchema}].[AIAgentRunStep] WHERE [ParentID] = @RecordID) AS [ChildCount]
    FROM
        CTE_Ancestors a
    WHERE
        a.[ParentID] IS NULL OR @ParentID IS NULL
    ORDER BY
        a.[Depth] DESC
);
GO

/* Descendants Traversal Function SQL for MJ: AI Agent Run Steps.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: fnAIAgentRunStepParentID_GetDescendants
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: [AIAgentRunStep].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIAgentRunStepParentID_GetDescendants]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIAgentRunStepParentID_GetDescendants];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIAgentRunStepParentID_GetDescendants]
(
    @RootID uniqueidentifier,
    @MaxDepth INT = NULL
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_Descendants AS (
        SELECT
            [ID],
            [ParentID],
            0 AS [RelativeDepth],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[AIAgentRunStep]
        WHERE
            [ID] = @RootID

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentID],
            p.[RelativeDepth] + 1 AS [RelativeDepth],
            CAST(p.[Path] + CAST(c.[ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[AIAgentRunStep] c
        INNER JOIN
            CTE_Descendants p ON c.[ParentID] = p.[ID]
        WHERE
            (@MaxDepth IS NULL OR p.[RelativeDepth] < @MaxDepth)
            AND p.[RelativeDepth] < 100
    )
    SELECT
        d.[ID] AS [ID],
        d.[RelativeDepth] AS [Depth],
        d.[Path],
        CAST(CASE WHEN EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[AIAgentRunStep] WHERE [ParentID] = d.[ID]) THEN 0 ELSE 1 END AS BIT) AS [IsLeaf],
        (SELECT COUNT(1) FROM [${flyway:defaultSchema}].[AIAgentRunStep] WHERE [ParentID] = d.[ID]) AS [ChildCount]
    FROM
        CTE_Descendants d
);
GO

/* Ancestors Traversal Function SQL for MJ: AI Agent Run Steps.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: fnAIAgentRunStepParentID_GetAncestors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: [AIAgentRunStep].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIAgentRunStepParentID_GetAncestors]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIAgentRunStepParentID_GetAncestors];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIAgentRunStepParentID_GetAncestors]
(
    @RecordID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_Ancestors AS (
        SELECT
            [ID],
            [ParentID],
            0 AS [LevelUp],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[AIAgentRunStep]
        WHERE
            [ID] = @RecordID

        UNION ALL

        SELECT
            p.[ID],
            p.[ParentID],
            c.[LevelUp] + 1 AS [LevelUp],
            CAST('/' + CAST(p.[ID] AS NVARCHAR(36)) + c.[Path] AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[AIAgentRunStep] p
        INNER JOIN
            CTE_Ancestors c ON p.[ID] = c.[ParentID]
        WHERE
            c.[LevelUp] < 100
    )
    SELECT
        a.[ID] AS [ID],
        a.[LevelUp],
        a.[Path]
    FROM
        CTE_Ancestors a
);
GO

/* Root ID Function SQL for MJ: AI Agent Run Steps.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: fnAIAgentRunStepParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AIAgentRunStep].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIAgentRunStepParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIAgentRunStepParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIAgentRunStepParentID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [ParentID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgentRunStep]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgentRunStep] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentID]
        WHERE
            p.[Depth] < 100
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

/* Base View SQL for MJ: AI Agent Run Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: vwAIAgentRunSteps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Run Steps
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentRunStep
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentRunSteps]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentRunSteps];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentRunSteps]
AS
SELECT
    a.*,
    MJAIAgentRun_AgentRunID.[RunName] AS [AgentRun],
    MJAIAgentRunStep_ParentID.[StepName] AS [Parent],
    MJAIAgentRunStep_PayloadAtStartSourceStepID.[StepName] AS [PayloadAtStartSourceStep],
    hier_ParentID.RootID AS [RootParentID],
    hier_ParentID.Depth AS [ParentIDDepth],
    hier_ParentID.Path AS [ParentIDPath],
    hier_ParentID.IsLeaf AS [ParentIDIsLeaf],
    hier_ParentID.ChildCount AS [ParentIDChildCount]
FROM
    [${flyway:defaultSchema}].[AIAgentRunStep] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS MJAIAgentRun_AgentRunID
  ON
    [a].[AgentRunID] = MJAIAgentRun_AgentRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRunStep] AS MJAIAgentRunStep_ParentID
  ON
    [a].[ParentID] = MJAIAgentRunStep_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRunStep] AS MJAIAgentRunStep_PayloadAtStartSourceStepID
  ON
    [a].[PayloadAtStartSourceStepID] = MJAIAgentRunStep_PayloadAtStartSourceStepID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIAgentRunStepParentID_GetHierarchyMeta]([a].[ID], [a].[ParentID]) AS hier_ParentID
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIAgentRunSteps] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIAgentRunSteps] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIAgentRunSteps] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRunSteps] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Agent Run Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: Permissions for vwAIAgentRunSteps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIAgentRunSteps] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIAgentRunSteps] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIAgentRunSteps] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRunSteps] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Agent Run Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: spCreateAIAgentRunStep
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentRunStep
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentRunStep]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRunStep];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRunStep]
    @ID uniqueidentifier = NULL,
    @AgentRunID uniqueidentifier,
    @StepNumber int,
    @StepType nvarchar(50) = NULL,
    @StepName nvarchar(255),
    @TargetID_Clear bit = 0,
    @TargetID uniqueidentifier = NULL,
    @Status nvarchar(50) = NULL,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @Success_Clear bit = 0,
    @Success bit = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @InputData_Clear bit = 0,
    @InputData nvarchar(MAX) = NULL,
    @OutputData_Clear bit = 0,
    @OutputData nvarchar(MAX) = NULL,
    @TargetLogID_Clear bit = 0,
    @TargetLogID uniqueidentifier = NULL,
    @PayloadAtStart_Clear bit = 0,
    @PayloadAtStart nvarchar(MAX) = NULL,
    @PayloadAtEnd_Clear bit = 0,
    @PayloadAtEnd nvarchar(MAX) = NULL,
    @FinalPayloadValidationResult_Clear bit = 0,
    @FinalPayloadValidationResult nvarchar(25) = NULL,
    @FinalPayloadValidationMessages_Clear bit = 0,
    @FinalPayloadValidationMessages nvarchar(MAX) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @Skills_Clear bit = 0,
    @Skills nvarchar(MAX) = NULL,
    @ToolCallingMode_Clear bit = 0,
    @ToolCallingMode nvarchar(25) = NULL,
    @NativeToolCallCount_Clear bit = 0,
    @NativeToolCallCount int = NULL,
    @NativeDualChannel_Clear bit = 0,
    @NativeDualChannel bit = NULL,
    @NativeToolResultsSent_Clear bit = 0,
    @NativeToolResultsSent bit = NULL,
    @PayloadAtStartSourceStepID_Clear bit = 0,
    @PayloadAtStartSourceStepID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRunStep]
            (
                [ID],
                [AgentRunID],
                [StepNumber],
                [StepType],
                [StepName],
                [TargetID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [Success],
                [ErrorMessage],
                [InputData],
                [OutputData],
                [TargetLogID],
                [PayloadAtStart],
                [PayloadAtEnd],
                [FinalPayloadValidationResult],
                [FinalPayloadValidationMessages],
                [ParentID],
                [Comments],
                [Skills],
                [ToolCallingMode],
                [NativeToolCallCount],
                [NativeDualChannel],
                [NativeToolResultsSent],
                [PayloadAtStartSourceStepID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentRunID,
                @StepNumber,
                ISNULL(@StepType, 'Prompt'),
                @StepName,
                CASE WHEN @TargetID_Clear = 1 THEN NULL ELSE ISNULL(@TargetID, NULL) END,
                ISNULL(@Status, 'Running'),
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @Success_Clear = 1 THEN NULL ELSE ISNULL(@Success, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @InputData_Clear = 1 THEN NULL ELSE ISNULL(@InputData, NULL) END,
                CASE WHEN @OutputData_Clear = 1 THEN NULL ELSE ISNULL(@OutputData, NULL) END,
                CASE WHEN @TargetLogID_Clear = 1 THEN NULL ELSE ISNULL(@TargetLogID, NULL) END,
                CASE WHEN @PayloadAtStart_Clear = 1 THEN NULL ELSE ISNULL(@PayloadAtStart, NULL) END,
                CASE WHEN @PayloadAtEnd_Clear = 1 THEN NULL ELSE ISNULL(@PayloadAtEnd, NULL) END,
                CASE WHEN @FinalPayloadValidationResult_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayloadValidationResult, NULL) END,
                CASE WHEN @FinalPayloadValidationMessages_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayloadValidationMessages, NULL) END,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @Skills_Clear = 1 THEN NULL ELSE ISNULL(@Skills, NULL) END,
                CASE WHEN @ToolCallingMode_Clear = 1 THEN NULL ELSE ISNULL(@ToolCallingMode, NULL) END,
                CASE WHEN @NativeToolCallCount_Clear = 1 THEN NULL ELSE ISNULL(@NativeToolCallCount, NULL) END,
                CASE WHEN @NativeDualChannel_Clear = 1 THEN NULL ELSE ISNULL(@NativeDualChannel, NULL) END,
                CASE WHEN @NativeToolResultsSent_Clear = 1 THEN NULL ELSE ISNULL(@NativeToolResultsSent, NULL) END,
                CASE WHEN @PayloadAtStartSourceStepID_Clear = 1 THEN NULL ELSE ISNULL(@PayloadAtStartSourceStepID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRunStep]
            (
                [AgentRunID],
                [StepNumber],
                [StepType],
                [StepName],
                [TargetID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [Success],
                [ErrorMessage],
                [InputData],
                [OutputData],
                [TargetLogID],
                [PayloadAtStart],
                [PayloadAtEnd],
                [FinalPayloadValidationResult],
                [FinalPayloadValidationMessages],
                [ParentID],
                [Comments],
                [Skills],
                [ToolCallingMode],
                [NativeToolCallCount],
                [NativeDualChannel],
                [NativeToolResultsSent],
                [PayloadAtStartSourceStepID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentRunID,
                @StepNumber,
                ISNULL(@StepType, 'Prompt'),
                @StepName,
                CASE WHEN @TargetID_Clear = 1 THEN NULL ELSE ISNULL(@TargetID, NULL) END,
                ISNULL(@Status, 'Running'),
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @Success_Clear = 1 THEN NULL ELSE ISNULL(@Success, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @InputData_Clear = 1 THEN NULL ELSE ISNULL(@InputData, NULL) END,
                CASE WHEN @OutputData_Clear = 1 THEN NULL ELSE ISNULL(@OutputData, NULL) END,
                CASE WHEN @TargetLogID_Clear = 1 THEN NULL ELSE ISNULL(@TargetLogID, NULL) END,
                CASE WHEN @PayloadAtStart_Clear = 1 THEN NULL ELSE ISNULL(@PayloadAtStart, NULL) END,
                CASE WHEN @PayloadAtEnd_Clear = 1 THEN NULL ELSE ISNULL(@PayloadAtEnd, NULL) END,
                CASE WHEN @FinalPayloadValidationResult_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayloadValidationResult, NULL) END,
                CASE WHEN @FinalPayloadValidationMessages_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayloadValidationMessages, NULL) END,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @Skills_Clear = 1 THEN NULL ELSE ISNULL(@Skills, NULL) END,
                CASE WHEN @ToolCallingMode_Clear = 1 THEN NULL ELSE ISNULL(@ToolCallingMode, NULL) END,
                CASE WHEN @NativeToolCallCount_Clear = 1 THEN NULL ELSE ISNULL(@NativeToolCallCount, NULL) END,
                CASE WHEN @NativeDualChannel_Clear = 1 THEN NULL ELSE ISNULL(@NativeDualChannel, NULL) END,
                CASE WHEN @NativeToolResultsSent_Clear = 1 THEN NULL ELSE ISNULL(@NativeToolResultsSent, NULL) END,
                CASE WHEN @PayloadAtStartSourceStepID_Clear = 1 THEN NULL ELSE ISNULL(@PayloadAtStartSourceStepID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentRunSteps] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRunStep] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRunStep] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRunStep] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRunStep] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Agent Run Steps */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRunStep] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRunStep] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRunStep] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRunStep] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Agent Run Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: spUpdateAIAgentRunStep
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentRunStep
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentRunStep]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRunStep];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRunStep]
    @ID uniqueidentifier,
    @AgentRunID uniqueidentifier = NULL,
    @StepNumber int = NULL,
    @StepType nvarchar(50) = NULL,
    @StepName nvarchar(255) = NULL,
    @TargetID_Clear bit = 0,
    @TargetID uniqueidentifier = NULL,
    @Status nvarchar(50) = NULL,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @Success_Clear bit = 0,
    @Success bit = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @InputData_Clear bit = 0,
    @InputData nvarchar(MAX) = NULL,
    @OutputData_Clear bit = 0,
    @OutputData nvarchar(MAX) = NULL,
    @TargetLogID_Clear bit = 0,
    @TargetLogID uniqueidentifier = NULL,
    @PayloadAtStart_Clear bit = 0,
    @PayloadAtStart nvarchar(MAX) = NULL,
    @PayloadAtEnd_Clear bit = 0,
    @PayloadAtEnd nvarchar(MAX) = NULL,
    @FinalPayloadValidationResult_Clear bit = 0,
    @FinalPayloadValidationResult nvarchar(25) = NULL,
    @FinalPayloadValidationMessages_Clear bit = 0,
    @FinalPayloadValidationMessages nvarchar(MAX) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @Skills_Clear bit = 0,
    @Skills nvarchar(MAX) = NULL,
    @ToolCallingMode_Clear bit = 0,
    @ToolCallingMode nvarchar(25) = NULL,
    @NativeToolCallCount_Clear bit = 0,
    @NativeToolCallCount int = NULL,
    @NativeDualChannel_Clear bit = 0,
    @NativeDualChannel bit = NULL,
    @NativeToolResultsSent_Clear bit = 0,
    @NativeToolResultsSent bit = NULL,
    @PayloadAtStartSourceStepID_Clear bit = 0,
    @PayloadAtStartSourceStepID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRunStep]
    SET
        [AgentRunID] = ISNULL(@AgentRunID, [AgentRunID]),
        [StepNumber] = ISNULL(@StepNumber, [StepNumber]),
        [StepType] = ISNULL(@StepType, [StepType]),
        [StepName] = ISNULL(@StepName, [StepName]),
        [TargetID] = CASE WHEN @TargetID_Clear = 1 THEN NULL ELSE ISNULL(@TargetID, [TargetID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [StartedAt] = ISNULL(@StartedAt, [StartedAt]),
        [CompletedAt] = CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, [CompletedAt]) END,
        [Success] = CASE WHEN @Success_Clear = 1 THEN NULL ELSE ISNULL(@Success, [Success]) END,
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END,
        [InputData] = CASE WHEN @InputData_Clear = 1 THEN NULL ELSE ISNULL(@InputData, [InputData]) END,
        [OutputData] = CASE WHEN @OutputData_Clear = 1 THEN NULL ELSE ISNULL(@OutputData, [OutputData]) END,
        [TargetLogID] = CASE WHEN @TargetLogID_Clear = 1 THEN NULL ELSE ISNULL(@TargetLogID, [TargetLogID]) END,
        [PayloadAtStart] = CASE WHEN @PayloadAtStart_Clear = 1 THEN NULL ELSE ISNULL(@PayloadAtStart, [PayloadAtStart]) END,
        [PayloadAtEnd] = CASE WHEN @PayloadAtEnd_Clear = 1 THEN NULL ELSE ISNULL(@PayloadAtEnd, [PayloadAtEnd]) END,
        [FinalPayloadValidationResult] = CASE WHEN @FinalPayloadValidationResult_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayloadValidationResult, [FinalPayloadValidationResult]) END,
        [FinalPayloadValidationMessages] = CASE WHEN @FinalPayloadValidationMessages_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayloadValidationMessages, [FinalPayloadValidationMessages]) END,
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END,
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END,
        [Skills] = CASE WHEN @Skills_Clear = 1 THEN NULL ELSE ISNULL(@Skills, [Skills]) END,
        [ToolCallingMode] = CASE WHEN @ToolCallingMode_Clear = 1 THEN NULL ELSE ISNULL(@ToolCallingMode, [ToolCallingMode]) END,
        [NativeToolCallCount] = CASE WHEN @NativeToolCallCount_Clear = 1 THEN NULL ELSE ISNULL(@NativeToolCallCount, [NativeToolCallCount]) END,
        [NativeDualChannel] = CASE WHEN @NativeDualChannel_Clear = 1 THEN NULL ELSE ISNULL(@NativeDualChannel, [NativeDualChannel]) END,
        [NativeToolResultsSent] = CASE WHEN @NativeToolResultsSent_Clear = 1 THEN NULL ELSE ISNULL(@NativeToolResultsSent, [NativeToolResultsSent]) END,
        [PayloadAtStartSourceStepID] = CASE WHEN @PayloadAtStartSourceStepID_Clear = 1 THEN NULL ELSE ISNULL(@PayloadAtStartSourceStepID, [PayloadAtStartSourceStepID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentRunSteps] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentRunSteps]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRunStep] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRunStep] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRunStep] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRunStep] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRunStep table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentRunStep]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentRunStep];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentRunStep
ON [${flyway:defaultSchema}].[AIAgentRunStep]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRunStep]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentRunStep] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Agent Run Steps */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRunStep] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRunStep] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRunStep] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRunStep] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Agent Run Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: spDeleteAIAgentRunStep
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRunStep
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentRunStep]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRunStep];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRunStep]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentRequest using cursor to call spUpdateAIAgentRequest
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepIDID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_RequestedAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_RequestForUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_Status nvarchar(20)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_Request nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_Response nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseByUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_RespondedAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_RequestTypeID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSchema nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseData nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_Priority int
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_OriginatingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_OriginatingAgentRunStepID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_ResumingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSource nvarchar(20)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_OriginatingTaskID uniqueidentifier
    DECLARE cascade_update_MJAIAgentRequests_OriginatingAgentRunStepID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [RequestedAt], [RequestForUserID], [Status], [Request], [Response], [ResponseByUserID], [RespondedAt], [Comments], [RequestTypeID], [ResponseSchema], [ResponseData], [Priority], [ExpiresAt], [OriginatingAgentRunID], [OriginatingAgentRunStepID], [ResumingAgentRunID], [ResponseSource], [OriginatingTaskID]
        FROM [${flyway:defaultSchema}].[AIAgentRequest]
        WHERE [OriginatingAgentRunStepID] = @ID

    OPEN cascade_update_MJAIAgentRequests_OriginatingAgentRunStepID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRequests_OriginatingAgentRunStepID_cursor INTO @MJAIAgentRequests_OriginatingAgentRunStepIDID, @MJAIAgentRequests_OriginatingAgentRunStepID_AgentID, @MJAIAgentRequests_OriginatingAgentRunStepID_RequestedAt, @MJAIAgentRequests_OriginatingAgentRunStepID_RequestForUserID, @MJAIAgentRequests_OriginatingAgentRunStepID_Status, @MJAIAgentRequests_OriginatingAgentRunStepID_Request, @MJAIAgentRequests_OriginatingAgentRunStepID_Response, @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseByUserID, @MJAIAgentRequests_OriginatingAgentRunStepID_RespondedAt, @MJAIAgentRequests_OriginatingAgentRunStepID_Comments, @MJAIAgentRequests_OriginatingAgentRunStepID_RequestTypeID, @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSchema, @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseData, @MJAIAgentRequests_OriginatingAgentRunStepID_Priority, @MJAIAgentRequests_OriginatingAgentRunStepID_ExpiresAt, @MJAIAgentRequests_OriginatingAgentRunStepID_OriginatingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunStepID_OriginatingAgentRunStepID, @MJAIAgentRequests_OriginatingAgentRunStepID_ResumingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSource, @MJAIAgentRequests_OriginatingAgentRunStepID_OriginatingTaskID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRequests_OriginatingAgentRunStepID_OriginatingAgentRunStepID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRequest] @ID = @MJAIAgentRequests_OriginatingAgentRunStepIDID, @AgentID = @MJAIAgentRequests_OriginatingAgentRunStepID_AgentID, @RequestedAt = @MJAIAgentRequests_OriginatingAgentRunStepID_RequestedAt, @RequestForUserID = @MJAIAgentRequests_OriginatingAgentRunStepID_RequestForUserID, @Status = @MJAIAgentRequests_OriginatingAgentRunStepID_Status, @Request = @MJAIAgentRequests_OriginatingAgentRunStepID_Request, @Response = @MJAIAgentRequests_OriginatingAgentRunStepID_Response, @ResponseByUserID = @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseByUserID, @RespondedAt = @MJAIAgentRequests_OriginatingAgentRunStepID_RespondedAt, @Comments = @MJAIAgentRequests_OriginatingAgentRunStepID_Comments, @RequestTypeID = @MJAIAgentRequests_OriginatingAgentRunStepID_RequestTypeID, @ResponseSchema = @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSchema, @ResponseData = @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseData, @Priority = @MJAIAgentRequests_OriginatingAgentRunStepID_Priority, @ExpiresAt = @MJAIAgentRequests_OriginatingAgentRunStepID_ExpiresAt, @OriginatingAgentRunID = @MJAIAgentRequests_OriginatingAgentRunStepID_OriginatingAgentRunID, @OriginatingAgentRunStepID_Clear = 1, @OriginatingAgentRunStepID = @MJAIAgentRequests_OriginatingAgentRunStepID_OriginatingAgentRunStepID, @ResumingAgentRunID = @MJAIAgentRequests_OriginatingAgentRunStepID_ResumingAgentRunID, @ResponseSource = @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSource, @OriginatingTaskID = @MJAIAgentRequests_OriginatingAgentRunStepID_OriginatingTaskID

        FETCH NEXT FROM cascade_update_MJAIAgentRequests_OriginatingAgentRunStepID_cursor INTO @MJAIAgentRequests_OriginatingAgentRunStepIDID, @MJAIAgentRequests_OriginatingAgentRunStepID_AgentID, @MJAIAgentRequests_OriginatingAgentRunStepID_RequestedAt, @MJAIAgentRequests_OriginatingAgentRunStepID_RequestForUserID, @MJAIAgentRequests_OriginatingAgentRunStepID_Status, @MJAIAgentRequests_OriginatingAgentRunStepID_Request, @MJAIAgentRequests_OriginatingAgentRunStepID_Response, @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseByUserID, @MJAIAgentRequests_OriginatingAgentRunStepID_RespondedAt, @MJAIAgentRequests_OriginatingAgentRunStepID_Comments, @MJAIAgentRequests_OriginatingAgentRunStepID_RequestTypeID, @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSchema, @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseData, @MJAIAgentRequests_OriginatingAgentRunStepID_Priority, @MJAIAgentRequests_OriginatingAgentRunStepID_ExpiresAt, @MJAIAgentRequests_OriginatingAgentRunStepID_OriginatingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunStepID_OriginatingAgentRunStepID, @MJAIAgentRequests_OriginatingAgentRunStepID_ResumingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSource, @MJAIAgentRequests_OriginatingAgentRunStepID_OriginatingTaskID
    END

    CLOSE cascade_update_MJAIAgentRequests_OriginatingAgentRunStepID_cursor
    DEALLOCATE cascade_update_MJAIAgentRequests_OriginatingAgentRunStepID_cursor
    
    -- Cascade update on AIAgentRunStep using cursor to call spUpdateAIAgentRunStep
    DECLARE @MJAIAgentRunSteps_ParentIDID uniqueidentifier
    DECLARE @MJAIAgentRunSteps_ParentID_AgentRunID uniqueidentifier
    DECLARE @MJAIAgentRunSteps_ParentID_StepNumber int
    DECLARE @MJAIAgentRunSteps_ParentID_StepType nvarchar(50)
    DECLARE @MJAIAgentRunSteps_ParentID_StepName nvarchar(255)
    DECLARE @MJAIAgentRunSteps_ParentID_TargetID uniqueidentifier
    DECLARE @MJAIAgentRunSteps_ParentID_Status nvarchar(50)
    DECLARE @MJAIAgentRunSteps_ParentID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRunSteps_ParentID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRunSteps_ParentID_Success bit
    DECLARE @MJAIAgentRunSteps_ParentID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_ParentID_InputData nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_ParentID_OutputData nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_ParentID_TargetLogID uniqueidentifier
    DECLARE @MJAIAgentRunSteps_ParentID_PayloadAtStart nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_ParentID_PayloadAtEnd nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_ParentID_FinalPayloadValidationResult nvarchar(25)
    DECLARE @MJAIAgentRunSteps_ParentID_FinalPayloadValidationMessages nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_ParentID_ParentID uniqueidentifier
    DECLARE @MJAIAgentRunSteps_ParentID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_ParentID_Skills nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_ParentID_ToolCallingMode nvarchar(25)
    DECLARE @MJAIAgentRunSteps_ParentID_NativeToolCallCount int
    DECLARE @MJAIAgentRunSteps_ParentID_NativeDualChannel bit
    DECLARE @MJAIAgentRunSteps_ParentID_NativeToolResultsSent bit
    DECLARE @MJAIAgentRunSteps_ParentID_PayloadAtStartSourceStepID uniqueidentifier
    DECLARE cascade_update_MJAIAgentRunSteps_ParentID_cursor CURSOR FOR
        SELECT [ID], [AgentRunID], [StepNumber], [StepType], [StepName], [TargetID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [InputData], [OutputData], [TargetLogID], [PayloadAtStart], [PayloadAtEnd], [FinalPayloadValidationResult], [FinalPayloadValidationMessages], [ParentID], [Comments], [Skills], [ToolCallingMode], [NativeToolCallCount], [NativeDualChannel], [NativeToolResultsSent], [PayloadAtStartSourceStepID]
        FROM [${flyway:defaultSchema}].[AIAgentRunStep]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIAgentRunSteps_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRunSteps_ParentID_cursor INTO @MJAIAgentRunSteps_ParentIDID, @MJAIAgentRunSteps_ParentID_AgentRunID, @MJAIAgentRunSteps_ParentID_StepNumber, @MJAIAgentRunSteps_ParentID_StepType, @MJAIAgentRunSteps_ParentID_StepName, @MJAIAgentRunSteps_ParentID_TargetID, @MJAIAgentRunSteps_ParentID_Status, @MJAIAgentRunSteps_ParentID_StartedAt, @MJAIAgentRunSteps_ParentID_CompletedAt, @MJAIAgentRunSteps_ParentID_Success, @MJAIAgentRunSteps_ParentID_ErrorMessage, @MJAIAgentRunSteps_ParentID_InputData, @MJAIAgentRunSteps_ParentID_OutputData, @MJAIAgentRunSteps_ParentID_TargetLogID, @MJAIAgentRunSteps_ParentID_PayloadAtStart, @MJAIAgentRunSteps_ParentID_PayloadAtEnd, @MJAIAgentRunSteps_ParentID_FinalPayloadValidationResult, @MJAIAgentRunSteps_ParentID_FinalPayloadValidationMessages, @MJAIAgentRunSteps_ParentID_ParentID, @MJAIAgentRunSteps_ParentID_Comments, @MJAIAgentRunSteps_ParentID_Skills, @MJAIAgentRunSteps_ParentID_ToolCallingMode, @MJAIAgentRunSteps_ParentID_NativeToolCallCount, @MJAIAgentRunSteps_ParentID_NativeDualChannel, @MJAIAgentRunSteps_ParentID_NativeToolResultsSent, @MJAIAgentRunSteps_ParentID_PayloadAtStartSourceStepID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRunSteps_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRunStep] @ID = @MJAIAgentRunSteps_ParentIDID, @AgentRunID = @MJAIAgentRunSteps_ParentID_AgentRunID, @StepNumber = @MJAIAgentRunSteps_ParentID_StepNumber, @StepType = @MJAIAgentRunSteps_ParentID_StepType, @StepName = @MJAIAgentRunSteps_ParentID_StepName, @TargetID = @MJAIAgentRunSteps_ParentID_TargetID, @Status = @MJAIAgentRunSteps_ParentID_Status, @StartedAt = @MJAIAgentRunSteps_ParentID_StartedAt, @CompletedAt = @MJAIAgentRunSteps_ParentID_CompletedAt, @Success = @MJAIAgentRunSteps_ParentID_Success, @ErrorMessage = @MJAIAgentRunSteps_ParentID_ErrorMessage, @InputData = @MJAIAgentRunSteps_ParentID_InputData, @OutputData = @MJAIAgentRunSteps_ParentID_OutputData, @TargetLogID = @MJAIAgentRunSteps_ParentID_TargetLogID, @PayloadAtStart = @MJAIAgentRunSteps_ParentID_PayloadAtStart, @PayloadAtEnd = @MJAIAgentRunSteps_ParentID_PayloadAtEnd, @FinalPayloadValidationResult = @MJAIAgentRunSteps_ParentID_FinalPayloadValidationResult, @FinalPayloadValidationMessages = @MJAIAgentRunSteps_ParentID_FinalPayloadValidationMessages, @ParentID_Clear = 1, @ParentID = @MJAIAgentRunSteps_ParentID_ParentID, @Comments = @MJAIAgentRunSteps_ParentID_Comments, @Skills = @MJAIAgentRunSteps_ParentID_Skills, @ToolCallingMode = @MJAIAgentRunSteps_ParentID_ToolCallingMode, @NativeToolCallCount = @MJAIAgentRunSteps_ParentID_NativeToolCallCount, @NativeDualChannel = @MJAIAgentRunSteps_ParentID_NativeDualChannel, @NativeToolResultsSent = @MJAIAgentRunSteps_ParentID_NativeToolResultsSent, @PayloadAtStartSourceStepID = @MJAIAgentRunSteps_ParentID_PayloadAtStartSourceStepID

        FETCH NEXT FROM cascade_update_MJAIAgentRunSteps_ParentID_cursor INTO @MJAIAgentRunSteps_ParentIDID, @MJAIAgentRunSteps_ParentID_AgentRunID, @MJAIAgentRunSteps_ParentID_StepNumber, @MJAIAgentRunSteps_ParentID_StepType, @MJAIAgentRunSteps_ParentID_StepName, @MJAIAgentRunSteps_ParentID_TargetID, @MJAIAgentRunSteps_ParentID_Status, @MJAIAgentRunSteps_ParentID_StartedAt, @MJAIAgentRunSteps_ParentID_CompletedAt, @MJAIAgentRunSteps_ParentID_Success, @MJAIAgentRunSteps_ParentID_ErrorMessage, @MJAIAgentRunSteps_ParentID_InputData, @MJAIAgentRunSteps_ParentID_OutputData, @MJAIAgentRunSteps_ParentID_TargetLogID, @MJAIAgentRunSteps_ParentID_PayloadAtStart, @MJAIAgentRunSteps_ParentID_PayloadAtEnd, @MJAIAgentRunSteps_ParentID_FinalPayloadValidationResult, @MJAIAgentRunSteps_ParentID_FinalPayloadValidationMessages, @MJAIAgentRunSteps_ParentID_ParentID, @MJAIAgentRunSteps_ParentID_Comments, @MJAIAgentRunSteps_ParentID_Skills, @MJAIAgentRunSteps_ParentID_ToolCallingMode, @MJAIAgentRunSteps_ParentID_NativeToolCallCount, @MJAIAgentRunSteps_ParentID_NativeDualChannel, @MJAIAgentRunSteps_ParentID_NativeToolResultsSent, @MJAIAgentRunSteps_ParentID_PayloadAtStartSourceStepID
    END

    CLOSE cascade_update_MJAIAgentRunSteps_ParentID_cursor
    DEALLOCATE cascade_update_MJAIAgentRunSteps_ParentID_cursor
    
    -- Cascade update on AIAgentRunStep using cursor to call spUpdateAIAgentRunStep
    DECLARE @MJAIAgentRunSteps_PayloadAtStartSourceStepIDID uniqueidentifier
    DECLARE @MJAIAgentRunSteps_PayloadAtStartSourceStepID_AgentRunID uniqueidentifier
    DECLARE @MJAIAgentRunSteps_PayloadAtStartSourceStepID_StepNumber int
    DECLARE @MJAIAgentRunSteps_PayloadAtStartSourceStepID_StepType nvarchar(50)
    DECLARE @MJAIAgentRunSteps_PayloadAtStartSourceStepID_StepName nvarchar(255)
    DECLARE @MJAIAgentRunSteps_PayloadAtStartSourceStepID_TargetID uniqueidentifier
    DECLARE @MJAIAgentRunSteps_PayloadAtStartSourceStepID_Status nvarchar(50)
    DECLARE @MJAIAgentRunSteps_PayloadAtStartSourceStepID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRunSteps_PayloadAtStartSourceStepID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRunSteps_PayloadAtStartSourceStepID_Success bit
    DECLARE @MJAIAgentRunSteps_PayloadAtStartSourceStepID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_PayloadAtStartSourceStepID_InputData nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_PayloadAtStartSourceStepID_OutputData nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_PayloadAtStartSourceStepID_TargetLogID uniqueidentifier
    DECLARE @MJAIAgentRunSteps_PayloadAtStartSourceStepID_PayloadAtStart nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_PayloadAtStartSourceStepID_PayloadAtEnd nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_PayloadAtStartSourceStepID_FinalPayloadValidationResult nvarchar(25)
    DECLARE @MJAIAgentRunSteps_PayloadAtStartSourceStepID_FinalPayloadValidationMessages nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_PayloadAtStartSourceStepID_ParentID uniqueidentifier
    DECLARE @MJAIAgentRunSteps_PayloadAtStartSourceStepID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_PayloadAtStartSourceStepID_Skills nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_PayloadAtStartSourceStepID_ToolCallingMode nvarchar(25)
    DECLARE @MJAIAgentRunSteps_PayloadAtStartSourceStepID_NativeToolCallCount int
    DECLARE @MJAIAgentRunSteps_PayloadAtStartSourceStepID_NativeDualChannel bit
    DECLARE @MJAIAgentRunSteps_PayloadAtStartSourceStepID_NativeToolResultsSent bit
    DECLARE @MJAIAgentRunSteps_PayloadAtStartSourceStepID_PayloadAtStartSourceStepID uniqueidentifier
    DECLARE cascade_update_MJAIAgentRunSteps_PayloadAtStartSourceStepID_cursor CURSOR FOR
        SELECT [ID], [AgentRunID], [StepNumber], [StepType], [StepName], [TargetID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [InputData], [OutputData], [TargetLogID], [PayloadAtStart], [PayloadAtEnd], [FinalPayloadValidationResult], [FinalPayloadValidationMessages], [ParentID], [Comments], [Skills], [ToolCallingMode], [NativeToolCallCount], [NativeDualChannel], [NativeToolResultsSent], [PayloadAtStartSourceStepID]
        FROM [${flyway:defaultSchema}].[AIAgentRunStep]
        WHERE [PayloadAtStartSourceStepID] = @ID

    OPEN cascade_update_MJAIAgentRunSteps_PayloadAtStartSourceStepID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRunSteps_PayloadAtStartSourceStepID_cursor INTO @MJAIAgentRunSteps_PayloadAtStartSourceStepIDID, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_AgentRunID, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_StepNumber, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_StepType, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_StepName, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_TargetID, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_Status, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_StartedAt, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_CompletedAt, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_Success, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_ErrorMessage, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_InputData, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_OutputData, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_TargetLogID, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_PayloadAtStart, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_PayloadAtEnd, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_FinalPayloadValidationResult, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_FinalPayloadValidationMessages, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_ParentID, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_Comments, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_Skills, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_ToolCallingMode, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_NativeToolCallCount, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_NativeDualChannel, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_NativeToolResultsSent, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_PayloadAtStartSourceStepID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRunSteps_PayloadAtStartSourceStepID_PayloadAtStartSourceStepID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRunStep] @ID = @MJAIAgentRunSteps_PayloadAtStartSourceStepIDID, @AgentRunID = @MJAIAgentRunSteps_PayloadAtStartSourceStepID_AgentRunID, @StepNumber = @MJAIAgentRunSteps_PayloadAtStartSourceStepID_StepNumber, @StepType = @MJAIAgentRunSteps_PayloadAtStartSourceStepID_StepType, @StepName = @MJAIAgentRunSteps_PayloadAtStartSourceStepID_StepName, @TargetID = @MJAIAgentRunSteps_PayloadAtStartSourceStepID_TargetID, @Status = @MJAIAgentRunSteps_PayloadAtStartSourceStepID_Status, @StartedAt = @MJAIAgentRunSteps_PayloadAtStartSourceStepID_StartedAt, @CompletedAt = @MJAIAgentRunSteps_PayloadAtStartSourceStepID_CompletedAt, @Success = @MJAIAgentRunSteps_PayloadAtStartSourceStepID_Success, @ErrorMessage = @MJAIAgentRunSteps_PayloadAtStartSourceStepID_ErrorMessage, @InputData = @MJAIAgentRunSteps_PayloadAtStartSourceStepID_InputData, @OutputData = @MJAIAgentRunSteps_PayloadAtStartSourceStepID_OutputData, @TargetLogID = @MJAIAgentRunSteps_PayloadAtStartSourceStepID_TargetLogID, @PayloadAtStart = @MJAIAgentRunSteps_PayloadAtStartSourceStepID_PayloadAtStart, @PayloadAtEnd = @MJAIAgentRunSteps_PayloadAtStartSourceStepID_PayloadAtEnd, @FinalPayloadValidationResult = @MJAIAgentRunSteps_PayloadAtStartSourceStepID_FinalPayloadValidationResult, @FinalPayloadValidationMessages = @MJAIAgentRunSteps_PayloadAtStartSourceStepID_FinalPayloadValidationMessages, @ParentID = @MJAIAgentRunSteps_PayloadAtStartSourceStepID_ParentID, @Comments = @MJAIAgentRunSteps_PayloadAtStartSourceStepID_Comments, @Skills = @MJAIAgentRunSteps_PayloadAtStartSourceStepID_Skills, @ToolCallingMode = @MJAIAgentRunSteps_PayloadAtStartSourceStepID_ToolCallingMode, @NativeToolCallCount = @MJAIAgentRunSteps_PayloadAtStartSourceStepID_NativeToolCallCount, @NativeDualChannel = @MJAIAgentRunSteps_PayloadAtStartSourceStepID_NativeDualChannel, @NativeToolResultsSent = @MJAIAgentRunSteps_PayloadAtStartSourceStepID_NativeToolResultsSent, @PayloadAtStartSourceStepID_Clear = 1, @PayloadAtStartSourceStepID = @MJAIAgentRunSteps_PayloadAtStartSourceStepID_PayloadAtStartSourceStepID

        FETCH NEXT FROM cascade_update_MJAIAgentRunSteps_PayloadAtStartSourceStepID_cursor INTO @MJAIAgentRunSteps_PayloadAtStartSourceStepIDID, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_AgentRunID, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_StepNumber, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_StepType, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_StepName, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_TargetID, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_Status, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_StartedAt, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_CompletedAt, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_Success, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_ErrorMessage, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_InputData, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_OutputData, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_TargetLogID, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_PayloadAtStart, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_PayloadAtEnd, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_FinalPayloadValidationResult, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_FinalPayloadValidationMessages, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_ParentID, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_Comments, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_Skills, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_ToolCallingMode, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_NativeToolCallCount, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_NativeDualChannel, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_NativeToolResultsSent, @MJAIAgentRunSteps_PayloadAtStartSourceStepID_PayloadAtStartSourceStepID
    END

    CLOSE cascade_update_MJAIAgentRunSteps_PayloadAtStartSourceStepID_cursor
    DEALLOCATE cascade_update_MJAIAgentRunSteps_PayloadAtStartSourceStepID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentRunStep]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRunStep] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRunStep] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRunStep] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agent Run Steps */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRunStep] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRunStep] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRunStep] TO [cdp_Developer], [cdp_Integration];

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
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample
    DECLARE @MJAIAgentExamples_SourceAIAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_Type nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated bit
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore decimal(5, 2)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_AccessCount int
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVectorBinary varbinary(MAX)
    DECLARE cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [UserID], [CompanyID], [Type], [ExampleInput], [ExampleOutput], [IsAutoGenerated], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [SuccessScore], [Comments], [Status], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [EmbeddingVectorBinary]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [SourceAIAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor INTO @MJAIAgentExamples_SourceAIAgentRunIDID, @MJAIAgentExamples_SourceAIAgentRunID_AgentID, @MJAIAgentExamples_SourceAIAgentRunID_UserID, @MJAIAgentExamples_SourceAIAgentRunID_CompanyID, @MJAIAgentExamples_SourceAIAgentRunID_Type, @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, @MJAIAgentExamples_SourceAIAgentRunID_Comments, @MJAIAgentExamples_SourceAIAgentRunID_Status, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentExamples_SourceAIAgentRunID_AccessCount, @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVectorBinary

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentExample] @ID = @MJAIAgentExamples_SourceAIAgentRunIDID, @AgentID = @MJAIAgentExamples_SourceAIAgentRunID_AgentID, @UserID = @MJAIAgentExamples_SourceAIAgentRunID_UserID, @CompanyID = @MJAIAgentExamples_SourceAIAgentRunID_CompanyID, @Type = @MJAIAgentExamples_SourceAIAgentRunID_Type, @ExampleInput = @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, @ExampleOutput = @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, @IsAutoGenerated = @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, @SourceConversationID = @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID, @SourceAIAgentRunID_Clear = 1, @SourceAIAgentRunID = @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, @SuccessScore = @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, @Comments = @MJAIAgentExamples_SourceAIAgentRunID_Comments, @Status = @MJAIAgentExamples_SourceAIAgentRunID_Status, @EmbeddingVector = @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, @LastAccessedAt = @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, @AccessCount = @MJAIAgentExamples_SourceAIAgentRunID_AccessCount, @ExpiresAt = @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt, @EmbeddingVectorBinary = @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVectorBinary

        FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor INTO @MJAIAgentExamples_SourceAIAgentRunIDID, @MJAIAgentExamples_SourceAIAgentRunID_AgentID, @MJAIAgentExamples_SourceAIAgentRunID_UserID, @MJAIAgentExamples_SourceAIAgentRunID_CompanyID, @MJAIAgentExamples_SourceAIAgentRunID_Type, @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, @MJAIAgentExamples_SourceAIAgentRunID_Comments, @MJAIAgentExamples_SourceAIAgentRunID_Status, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentExamples_SourceAIAgentRunID_AccessCount, @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVectorBinary
    END

    CLOSE cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor
    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @MJAIAgentNotes_SourceAIAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Note nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Type nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated bit
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AccessCount int
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount int
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore decimal(5, 2)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AuthorType nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVectorBinary varbinary(MAX)
    DECLARE cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [ConsolidatedIntoNoteID], [ConsolidationCount], [DerivedFromNoteIDs], [ProtectionTier], [ImportanceScore], [AuthorType], [EmbeddingVectorBinary]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceAIAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor INTO @MJAIAgentNotes_SourceAIAgentRunIDID, @MJAIAgentNotes_SourceAIAgentRunID_AgentID, @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, @MJAIAgentNotes_SourceAIAgentRunID_Note, @MJAIAgentNotes_SourceAIAgentRunID_UserID, @MJAIAgentNotes_SourceAIAgentRunID_Type, @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentNotes_SourceAIAgentRunID_Comments, @MJAIAgentNotes_SourceAIAgentRunID_Status, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentNotes_SourceAIAgentRunID_CompanyID, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentNotes_SourceAIAgentRunID_AccessCount, @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount, @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier, @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore, @MJAIAgentNotes_SourceAIAgentRunID_AuthorType, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVectorBinary

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_SourceAIAgentRunIDID, @AgentID = @MJAIAgentNotes_SourceAIAgentRunID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, @Note = @MJAIAgentNotes_SourceAIAgentRunID_Note, @UserID = @MJAIAgentNotes_SourceAIAgentRunID_UserID, @Type = @MJAIAgentNotes_SourceAIAgentRunID_Type, @IsAutoGenerated = @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, @Comments = @MJAIAgentNotes_SourceAIAgentRunID_Comments, @Status = @MJAIAgentNotes_SourceAIAgentRunID_Status, @SourceConversationID = @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, @SourceAIAgentRunID_Clear = 1, @SourceAIAgentRunID = @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_SourceAIAgentRunID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_SourceAIAgentRunID_AccessCount, @ExpiresAt = @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt, @ConsolidatedIntoNoteID = @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID, @ConsolidationCount = @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount, @DerivedFromNoteIDs = @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs, @ProtectionTier = @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier, @ImportanceScore = @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore, @AuthorType = @MJAIAgentNotes_SourceAIAgentRunID_AuthorType, @EmbeddingVectorBinary = @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVectorBinary

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor INTO @MJAIAgentNotes_SourceAIAgentRunIDID, @MJAIAgentNotes_SourceAIAgentRunID_AgentID, @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, @MJAIAgentNotes_SourceAIAgentRunID_Note, @MJAIAgentNotes_SourceAIAgentRunID_UserID, @MJAIAgentNotes_SourceAIAgentRunID_Type, @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentNotes_SourceAIAgentRunID_Comments, @MJAIAgentNotes_SourceAIAgentRunID_Status, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentNotes_SourceAIAgentRunID_CompanyID, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentNotes_SourceAIAgentRunID_AccessCount, @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount, @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier, @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore, @MJAIAgentNotes_SourceAIAgentRunID_AuthorType, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVectorBinary
    END

    CLOSE cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor
    
    -- Cascade update on AIAgentRequest using cursor to call spUpdateAIAgentRequest
    DECLARE @MJAIAgentRequests_OriginatingAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Request nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Response nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseData nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Priority int
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource nvarchar(20)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_OriginatingTaskID uniqueidentifier
    DECLARE cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [RequestedAt], [RequestForUserID], [Status], [Request], [Response], [ResponseByUserID], [RespondedAt], [Comments], [RequestTypeID], [ResponseSchema], [ResponseData], [Priority], [ExpiresAt], [OriginatingAgentRunID], [OriginatingAgentRunStepID], [ResumingAgentRunID], [ResponseSource], [OriginatingTaskID]
        FROM [${flyway:defaultSchema}].[AIAgentRequest]
        WHERE [OriginatingAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor INTO @MJAIAgentRequests_OriginatingAgentRunIDID, @MJAIAgentRequests_OriginatingAgentRunID_AgentID, @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt, @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID, @MJAIAgentRequests_OriginatingAgentRunID_Status, @MJAIAgentRequests_OriginatingAgentRunID_Request, @MJAIAgentRequests_OriginatingAgentRunID_Response, @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID, @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt, @MJAIAgentRequests_OriginatingAgentRunID_Comments, @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema, @MJAIAgentRequests_OriginatingAgentRunID_ResponseData, @MJAIAgentRequests_OriginatingAgentRunID_Priority, @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingTaskID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRequest] @ID = @MJAIAgentRequests_OriginatingAgentRunIDID, @AgentID = @MJAIAgentRequests_OriginatingAgentRunID_AgentID, @RequestedAt = @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt, @RequestForUserID = @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID, @Status = @MJAIAgentRequests_OriginatingAgentRunID_Status, @Request = @MJAIAgentRequests_OriginatingAgentRunID_Request, @Response = @MJAIAgentRequests_OriginatingAgentRunID_Response, @ResponseByUserID = @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID, @RespondedAt = @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt, @Comments = @MJAIAgentRequests_OriginatingAgentRunID_Comments, @RequestTypeID = @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID, @ResponseSchema = @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema, @ResponseData = @MJAIAgentRequests_OriginatingAgentRunID_ResponseData, @Priority = @MJAIAgentRequests_OriginatingAgentRunID_Priority, @ExpiresAt = @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt, @OriginatingAgentRunID_Clear = 1, @OriginatingAgentRunID = @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID, @OriginatingAgentRunStepID = @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID, @ResumingAgentRunID = @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID, @ResponseSource = @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource, @OriginatingTaskID = @MJAIAgentRequests_OriginatingAgentRunID_OriginatingTaskID

        FETCH NEXT FROM cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor INTO @MJAIAgentRequests_OriginatingAgentRunIDID, @MJAIAgentRequests_OriginatingAgentRunID_AgentID, @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt, @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID, @MJAIAgentRequests_OriginatingAgentRunID_Status, @MJAIAgentRequests_OriginatingAgentRunID_Request, @MJAIAgentRequests_OriginatingAgentRunID_Response, @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID, @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt, @MJAIAgentRequests_OriginatingAgentRunID_Comments, @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema, @MJAIAgentRequests_OriginatingAgentRunID_ResponseData, @MJAIAgentRequests_OriginatingAgentRunID_Priority, @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingTaskID
    END

    CLOSE cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor
    
    -- Cascade update on AIAgentRequest using cursor to call spUpdateAIAgentRequest
    DECLARE @MJAIAgentRequests_ResumingAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RequestedAt datetimeoffset
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Request nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Response nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RespondedAt datetimeoffset
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseData nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Priority int
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseSource nvarchar(20)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_OriginatingTaskID uniqueidentifier
    DECLARE cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [RequestedAt], [RequestForUserID], [Status], [Request], [Response], [ResponseByUserID], [RespondedAt], [Comments], [RequestTypeID], [ResponseSchema], [ResponseData], [Priority], [ExpiresAt], [OriginatingAgentRunID], [OriginatingAgentRunStepID], [ResumingAgentRunID], [ResponseSource], [OriginatingTaskID]
        FROM [${flyway:defaultSchema}].[AIAgentRequest]
        WHERE [ResumingAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor INTO @MJAIAgentRequests_ResumingAgentRunIDID, @MJAIAgentRequests_ResumingAgentRunID_AgentID, @MJAIAgentRequests_ResumingAgentRunID_RequestedAt, @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID, @MJAIAgentRequests_ResumingAgentRunID_Status, @MJAIAgentRequests_ResumingAgentRunID_Request, @MJAIAgentRequests_ResumingAgentRunID_Response, @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID, @MJAIAgentRequests_ResumingAgentRunID_RespondedAt, @MJAIAgentRequests_ResumingAgentRunID_Comments, @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema, @MJAIAgentRequests_ResumingAgentRunID_ResponseData, @MJAIAgentRequests_ResumingAgentRunID_Priority, @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSource, @MJAIAgentRequests_ResumingAgentRunID_OriginatingTaskID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRequest] @ID = @MJAIAgentRequests_ResumingAgentRunIDID, @AgentID = @MJAIAgentRequests_ResumingAgentRunID_AgentID, @RequestedAt = @MJAIAgentRequests_ResumingAgentRunID_RequestedAt, @RequestForUserID = @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID, @Status = @MJAIAgentRequests_ResumingAgentRunID_Status, @Request = @MJAIAgentRequests_ResumingAgentRunID_Request, @Response = @MJAIAgentRequests_ResumingAgentRunID_Response, @ResponseByUserID = @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID, @RespondedAt = @MJAIAgentRequests_ResumingAgentRunID_RespondedAt, @Comments = @MJAIAgentRequests_ResumingAgentRunID_Comments, @RequestTypeID = @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID, @ResponseSchema = @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema, @ResponseData = @MJAIAgentRequests_ResumingAgentRunID_ResponseData, @Priority = @MJAIAgentRequests_ResumingAgentRunID_Priority, @ExpiresAt = @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt, @OriginatingAgentRunID = @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID, @OriginatingAgentRunStepID = @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID, @ResumingAgentRunID_Clear = 1, @ResumingAgentRunID = @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID, @ResponseSource = @MJAIAgentRequests_ResumingAgentRunID_ResponseSource, @OriginatingTaskID = @MJAIAgentRequests_ResumingAgentRunID_OriginatingTaskID

        FETCH NEXT FROM cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor INTO @MJAIAgentRequests_ResumingAgentRunIDID, @MJAIAgentRequests_ResumingAgentRunID_AgentID, @MJAIAgentRequests_ResumingAgentRunID_RequestedAt, @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID, @MJAIAgentRequests_ResumingAgentRunID_Status, @MJAIAgentRequests_ResumingAgentRunID_Request, @MJAIAgentRequests_ResumingAgentRunID_Response, @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID, @MJAIAgentRequests_ResumingAgentRunID_RespondedAt, @MJAIAgentRequests_ResumingAgentRunID_Comments, @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema, @MJAIAgentRequests_ResumingAgentRunID_ResponseData, @MJAIAgentRequests_ResumingAgentRunID_Priority, @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSource, @MJAIAgentRequests_ResumingAgentRunID_OriginatingTaskID
    END

    CLOSE cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor
    
    -- Cascade delete from AIAgentRunMedia using cursor to call spDeleteAIAgentRunMedia
    DECLARE @MJAIAgentRunMedias_AgentRunIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRunMedia]
        WHERE [AgentRunID] = @ID
    
    OPEN cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor INTO @MJAIAgentRunMedias_AgentRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRunMedia] @ID = @MJAIAgentRunMedias_AgentRunIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor INTO @MJAIAgentRunMedias_AgentRunIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor
    
    -- Cascade delete from AIAgentRunStep using cursor to call spDeleteAIAgentRunStep
    DECLARE @MJAIAgentRunSteps_AgentRunIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRunStep]
        WHERE [AgentRunID] = @ID
    
    OPEN cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor INTO @MJAIAgentRunSteps_AgentRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRunStep] @ID = @MJAIAgentRunSteps_AgentRunIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor INTO @MJAIAgentRunSteps_AgentRunIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_ParentRunIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_ParentRunID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ParentRunID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ParentRunID_Success bit
    DECLARE @MJAIAgentRuns_ParentRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCost decimal(19, 8)
    DECLARE @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_ParentRunID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_ParentRunID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_ParentRunID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_ParentRunID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_ParentRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_Verbose bit
    DECLARE @MJAIAgentRuns_ParentRunID_EffortLevel int
    DECLARE @MJAIAgentRuns_ParentRunID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_ParentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_ParentRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_ExternalReferenceID nvarchar(200)
    DECLARE @MJAIAgentRuns_ParentRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_LastHeartbeatAt datetimeoffset
    DECLARE @MJAIAgentRuns_ParentRunID_AgentSessionID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_PlanMode bit
    DECLARE @MJAIAgentRuns_ParentRunID_ExternalSessionID nvarchar(255)
    DECLARE @MJAIAgentRuns_ParentRunID_ContinuationDepth int
    DECLARE cascade_update_MJAIAgentRuns_ParentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed], [LastHeartbeatAt], [AgentSessionID], [PlanMode], [ExternalSessionID], [ContinuationDepth]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ParentRunID] = @ID

    OPEN cascade_update_MJAIAgentRuns_ParentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_ParentRunID_cursor INTO @MJAIAgentRuns_ParentRunIDID, @MJAIAgentRuns_ParentRunID_AgentID, @MJAIAgentRuns_ParentRunID_ParentRunID, @MJAIAgentRuns_ParentRunID_Status, @MJAIAgentRuns_ParentRunID_StartedAt, @MJAIAgentRuns_ParentRunID_CompletedAt, @MJAIAgentRuns_ParentRunID_Success, @MJAIAgentRuns_ParentRunID_ErrorMessage, @MJAIAgentRuns_ParentRunID_ConversationID, @MJAIAgentRuns_ParentRunID_UserID, @MJAIAgentRuns_ParentRunID_Result, @MJAIAgentRuns_ParentRunID_AgentState, @MJAIAgentRuns_ParentRunID_TotalTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCost, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCostRollup, @MJAIAgentRuns_ParentRunID_ConversationDetailID, @MJAIAgentRuns_ParentRunID_ConversationDetailSequence, @MJAIAgentRuns_ParentRunID_CancellationReason, @MJAIAgentRuns_ParentRunID_FinalStep, @MJAIAgentRuns_ParentRunID_FinalPayload, @MJAIAgentRuns_ParentRunID_Message, @MJAIAgentRuns_ParentRunID_LastRunID, @MJAIAgentRuns_ParentRunID_StartingPayload, @MJAIAgentRuns_ParentRunID_TotalPromptIterations, @MJAIAgentRuns_ParentRunID_ConfigurationID, @MJAIAgentRuns_ParentRunID_OverrideModelID, @MJAIAgentRuns_ParentRunID_OverrideVendorID, @MJAIAgentRuns_ParentRunID_Data, @MJAIAgentRuns_ParentRunID_Verbose, @MJAIAgentRuns_ParentRunID_EffortLevel, @MJAIAgentRuns_ParentRunID_RunName, @MJAIAgentRuns_ParentRunID_Comments, @MJAIAgentRuns_ParentRunID_ScheduledJobRunID, @MJAIAgentRuns_ParentRunID_TestRunID, @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, @MJAIAgentRuns_ParentRunID_SecondaryScopes, @MJAIAgentRuns_ParentRunID_ExternalReferenceID, @MJAIAgentRuns_ParentRunID_CompanyID, @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ParentRunID_LastHeartbeatAt, @MJAIAgentRuns_ParentRunID_AgentSessionID, @MJAIAgentRuns_ParentRunID_PlanMode, @MJAIAgentRuns_ParentRunID_ExternalSessionID, @MJAIAgentRuns_ParentRunID_ContinuationDepth

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_ParentRunID_ParentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_ParentRunIDID, @AgentID = @MJAIAgentRuns_ParentRunID_AgentID, @ParentRunID_Clear = 1, @ParentRunID = @MJAIAgentRuns_ParentRunID_ParentRunID, @Status = @MJAIAgentRuns_ParentRunID_Status, @StartedAt = @MJAIAgentRuns_ParentRunID_StartedAt, @CompletedAt = @MJAIAgentRuns_ParentRunID_CompletedAt, @Success = @MJAIAgentRuns_ParentRunID_Success, @ErrorMessage = @MJAIAgentRuns_ParentRunID_ErrorMessage, @ConversationID = @MJAIAgentRuns_ParentRunID_ConversationID, @UserID = @MJAIAgentRuns_ParentRunID_UserID, @Result = @MJAIAgentRuns_ParentRunID_Result, @AgentState = @MJAIAgentRuns_ParentRunID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_ParentRunID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_ParentRunID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_ParentRunID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_ParentRunID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_ParentRunID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_ParentRunID_CancellationReason, @FinalStep = @MJAIAgentRuns_ParentRunID_FinalStep, @FinalPayload = @MJAIAgentRuns_ParentRunID_FinalPayload, @Message = @MJAIAgentRuns_ParentRunID_Message, @LastRunID = @MJAIAgentRuns_ParentRunID_LastRunID, @StartingPayload = @MJAIAgentRuns_ParentRunID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_ParentRunID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_ParentRunID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_ParentRunID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_ParentRunID_OverrideVendorID, @Data = @MJAIAgentRuns_ParentRunID_Data, @Verbose = @MJAIAgentRuns_ParentRunID_Verbose, @EffortLevel = @MJAIAgentRuns_ParentRunID_EffortLevel, @RunName = @MJAIAgentRuns_ParentRunID_RunName, @Comments = @MJAIAgentRuns_ParentRunID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_ParentRunID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_ParentRunID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_ParentRunID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_ParentRunID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_ParentRunID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed, @LastHeartbeatAt = @MJAIAgentRuns_ParentRunID_LastHeartbeatAt, @AgentSessionID = @MJAIAgentRuns_ParentRunID_AgentSessionID, @PlanMode = @MJAIAgentRuns_ParentRunID_PlanMode, @ExternalSessionID = @MJAIAgentRuns_ParentRunID_ExternalSessionID, @ContinuationDepth = @MJAIAgentRuns_ParentRunID_ContinuationDepth

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_ParentRunID_cursor INTO @MJAIAgentRuns_ParentRunIDID, @MJAIAgentRuns_ParentRunID_AgentID, @MJAIAgentRuns_ParentRunID_ParentRunID, @MJAIAgentRuns_ParentRunID_Status, @MJAIAgentRuns_ParentRunID_StartedAt, @MJAIAgentRuns_ParentRunID_CompletedAt, @MJAIAgentRuns_ParentRunID_Success, @MJAIAgentRuns_ParentRunID_ErrorMessage, @MJAIAgentRuns_ParentRunID_ConversationID, @MJAIAgentRuns_ParentRunID_UserID, @MJAIAgentRuns_ParentRunID_Result, @MJAIAgentRuns_ParentRunID_AgentState, @MJAIAgentRuns_ParentRunID_TotalTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCost, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCostRollup, @MJAIAgentRuns_ParentRunID_ConversationDetailID, @MJAIAgentRuns_ParentRunID_ConversationDetailSequence, @MJAIAgentRuns_ParentRunID_CancellationReason, @MJAIAgentRuns_ParentRunID_FinalStep, @MJAIAgentRuns_ParentRunID_FinalPayload, @MJAIAgentRuns_ParentRunID_Message, @MJAIAgentRuns_ParentRunID_LastRunID, @MJAIAgentRuns_ParentRunID_StartingPayload, @MJAIAgentRuns_ParentRunID_TotalPromptIterations, @MJAIAgentRuns_ParentRunID_ConfigurationID, @MJAIAgentRuns_ParentRunID_OverrideModelID, @MJAIAgentRuns_ParentRunID_OverrideVendorID, @MJAIAgentRuns_ParentRunID_Data, @MJAIAgentRuns_ParentRunID_Verbose, @MJAIAgentRuns_ParentRunID_EffortLevel, @MJAIAgentRuns_ParentRunID_RunName, @MJAIAgentRuns_ParentRunID_Comments, @MJAIAgentRuns_ParentRunID_ScheduledJobRunID, @MJAIAgentRuns_ParentRunID_TestRunID, @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, @MJAIAgentRuns_ParentRunID_SecondaryScopes, @MJAIAgentRuns_ParentRunID_ExternalReferenceID, @MJAIAgentRuns_ParentRunID_CompanyID, @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ParentRunID_LastHeartbeatAt, @MJAIAgentRuns_ParentRunID_AgentSessionID, @MJAIAgentRuns_ParentRunID_PlanMode, @MJAIAgentRuns_ParentRunID_ExternalSessionID, @MJAIAgentRuns_ParentRunID_ContinuationDepth
    END

    CLOSE cascade_update_MJAIAgentRuns_ParentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_ParentRunID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_LastRunIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_LastRunID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_LastRunID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_LastRunID_Success bit
    DECLARE @MJAIAgentRuns_LastRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCost decimal(19, 8)
    DECLARE @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_LastRunID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_LastRunID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_LastRunID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_LastRunID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_LastRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_Verbose bit
    DECLARE @MJAIAgentRuns_LastRunID_EffortLevel int
    DECLARE @MJAIAgentRuns_LastRunID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_LastRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_LastRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_ExternalReferenceID nvarchar(200)
    DECLARE @MJAIAgentRuns_LastRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_LastHeartbeatAt datetimeoffset
    DECLARE @MJAIAgentRuns_LastRunID_AgentSessionID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_PlanMode bit
    DECLARE @MJAIAgentRuns_LastRunID_ExternalSessionID nvarchar(255)
    DECLARE @MJAIAgentRuns_LastRunID_ContinuationDepth int
    DECLARE cascade_update_MJAIAgentRuns_LastRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed], [LastHeartbeatAt], [AgentSessionID], [PlanMode], [ExternalSessionID], [ContinuationDepth]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [LastRunID] = @ID

    OPEN cascade_update_MJAIAgentRuns_LastRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_LastRunID_cursor INTO @MJAIAgentRuns_LastRunIDID, @MJAIAgentRuns_LastRunID_AgentID, @MJAIAgentRuns_LastRunID_ParentRunID, @MJAIAgentRuns_LastRunID_Status, @MJAIAgentRuns_LastRunID_StartedAt, @MJAIAgentRuns_LastRunID_CompletedAt, @MJAIAgentRuns_LastRunID_Success, @MJAIAgentRuns_LastRunID_ErrorMessage, @MJAIAgentRuns_LastRunID_ConversationID, @MJAIAgentRuns_LastRunID_UserID, @MJAIAgentRuns_LastRunID_Result, @MJAIAgentRuns_LastRunID_AgentState, @MJAIAgentRuns_LastRunID_TotalTokensUsed, @MJAIAgentRuns_LastRunID_TotalCost, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCostRollup, @MJAIAgentRuns_LastRunID_ConversationDetailID, @MJAIAgentRuns_LastRunID_ConversationDetailSequence, @MJAIAgentRuns_LastRunID_CancellationReason, @MJAIAgentRuns_LastRunID_FinalStep, @MJAIAgentRuns_LastRunID_FinalPayload, @MJAIAgentRuns_LastRunID_Message, @MJAIAgentRuns_LastRunID_LastRunID, @MJAIAgentRuns_LastRunID_StartingPayload, @MJAIAgentRuns_LastRunID_TotalPromptIterations, @MJAIAgentRuns_LastRunID_ConfigurationID, @MJAIAgentRuns_LastRunID_OverrideModelID, @MJAIAgentRuns_LastRunID_OverrideVendorID, @MJAIAgentRuns_LastRunID_Data, @MJAIAgentRuns_LastRunID_Verbose, @MJAIAgentRuns_LastRunID_EffortLevel, @MJAIAgentRuns_LastRunID_RunName, @MJAIAgentRuns_LastRunID_Comments, @MJAIAgentRuns_LastRunID_ScheduledJobRunID, @MJAIAgentRuns_LastRunID_TestRunID, @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, @MJAIAgentRuns_LastRunID_SecondaryScopes, @MJAIAgentRuns_LastRunID_ExternalReferenceID, @MJAIAgentRuns_LastRunID_CompanyID, @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_LastRunID_LastHeartbeatAt, @MJAIAgentRuns_LastRunID_AgentSessionID, @MJAIAgentRuns_LastRunID_PlanMode, @MJAIAgentRuns_LastRunID_ExternalSessionID, @MJAIAgentRuns_LastRunID_ContinuationDepth

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_LastRunID_LastRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_LastRunIDID, @AgentID = @MJAIAgentRuns_LastRunID_AgentID, @ParentRunID = @MJAIAgentRuns_LastRunID_ParentRunID, @Status = @MJAIAgentRuns_LastRunID_Status, @StartedAt = @MJAIAgentRuns_LastRunID_StartedAt, @CompletedAt = @MJAIAgentRuns_LastRunID_CompletedAt, @Success = @MJAIAgentRuns_LastRunID_Success, @ErrorMessage = @MJAIAgentRuns_LastRunID_ErrorMessage, @ConversationID = @MJAIAgentRuns_LastRunID_ConversationID, @UserID = @MJAIAgentRuns_LastRunID_UserID, @Result = @MJAIAgentRuns_LastRunID_Result, @AgentState = @MJAIAgentRuns_LastRunID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_LastRunID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_LastRunID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_LastRunID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_LastRunID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_LastRunID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_LastRunID_CancellationReason, @FinalStep = @MJAIAgentRuns_LastRunID_FinalStep, @FinalPayload = @MJAIAgentRuns_LastRunID_FinalPayload, @Message = @MJAIAgentRuns_LastRunID_Message, @LastRunID_Clear = 1, @LastRunID = @MJAIAgentRuns_LastRunID_LastRunID, @StartingPayload = @MJAIAgentRuns_LastRunID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_LastRunID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_LastRunID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_LastRunID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_LastRunID_OverrideVendorID, @Data = @MJAIAgentRuns_LastRunID_Data, @Verbose = @MJAIAgentRuns_LastRunID_Verbose, @EffortLevel = @MJAIAgentRuns_LastRunID_EffortLevel, @RunName = @MJAIAgentRuns_LastRunID_RunName, @Comments = @MJAIAgentRuns_LastRunID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_LastRunID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_LastRunID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_LastRunID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_LastRunID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_LastRunID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed, @LastHeartbeatAt = @MJAIAgentRuns_LastRunID_LastHeartbeatAt, @AgentSessionID = @MJAIAgentRuns_LastRunID_AgentSessionID, @PlanMode = @MJAIAgentRuns_LastRunID_PlanMode, @ExternalSessionID = @MJAIAgentRuns_LastRunID_ExternalSessionID, @ContinuationDepth = @MJAIAgentRuns_LastRunID_ContinuationDepth

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_LastRunID_cursor INTO @MJAIAgentRuns_LastRunIDID, @MJAIAgentRuns_LastRunID_AgentID, @MJAIAgentRuns_LastRunID_ParentRunID, @MJAIAgentRuns_LastRunID_Status, @MJAIAgentRuns_LastRunID_StartedAt, @MJAIAgentRuns_LastRunID_CompletedAt, @MJAIAgentRuns_LastRunID_Success, @MJAIAgentRuns_LastRunID_ErrorMessage, @MJAIAgentRuns_LastRunID_ConversationID, @MJAIAgentRuns_LastRunID_UserID, @MJAIAgentRuns_LastRunID_Result, @MJAIAgentRuns_LastRunID_AgentState, @MJAIAgentRuns_LastRunID_TotalTokensUsed, @MJAIAgentRuns_LastRunID_TotalCost, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCostRollup, @MJAIAgentRuns_LastRunID_ConversationDetailID, @MJAIAgentRuns_LastRunID_ConversationDetailSequence, @MJAIAgentRuns_LastRunID_CancellationReason, @MJAIAgentRuns_LastRunID_FinalStep, @MJAIAgentRuns_LastRunID_FinalPayload, @MJAIAgentRuns_LastRunID_Message, @MJAIAgentRuns_LastRunID_LastRunID, @MJAIAgentRuns_LastRunID_StartingPayload, @MJAIAgentRuns_LastRunID_TotalPromptIterations, @MJAIAgentRuns_LastRunID_ConfigurationID, @MJAIAgentRuns_LastRunID_OverrideModelID, @MJAIAgentRuns_LastRunID_OverrideVendorID, @MJAIAgentRuns_LastRunID_Data, @MJAIAgentRuns_LastRunID_Verbose, @MJAIAgentRuns_LastRunID_EffortLevel, @MJAIAgentRuns_LastRunID_RunName, @MJAIAgentRuns_LastRunID_Comments, @MJAIAgentRuns_LastRunID_ScheduledJobRunID, @MJAIAgentRuns_LastRunID_TestRunID, @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, @MJAIAgentRuns_LastRunID_SecondaryScopes, @MJAIAgentRuns_LastRunID_ExternalReferenceID, @MJAIAgentRuns_LastRunID_CompanyID, @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_LastRunID_LastHeartbeatAt, @MJAIAgentRuns_LastRunID_AgentSessionID, @MJAIAgentRuns_LastRunID_PlanMode, @MJAIAgentRuns_LastRunID_ExternalSessionID, @MJAIAgentRuns_LastRunID_ContinuationDepth
    END

    CLOSE cascade_update_MJAIAgentRuns_LastRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_LastRunID_cursor
    
    -- Cascade update on ConversationSkill using cursor to call spUpdateConversationSkill
    DECLARE @MJConversationSkills_ActivatedByRunIDID uniqueidentifier
    DECLARE @MJConversationSkills_ActivatedByRunID_ConversationID uniqueidentifier
    DECLARE @MJConversationSkills_ActivatedByRunID_SkillID uniqueidentifier
    DECLARE @MJConversationSkills_ActivatedByRunID_Status nvarchar(20)
    DECLARE @MJConversationSkills_ActivatedByRunID_ActivatedByRunID uniqueidentifier
    DECLARE @MJConversationSkills_ActivatedByRunID_EndedAt datetimeoffset
    DECLARE cascade_update_MJConversationSkills_ActivatedByRunID_cursor CURSOR FOR
        SELECT [ID], [ConversationID], [SkillID], [Status], [ActivatedByRunID], [EndedAt]
        FROM [${flyway:defaultSchema}].[ConversationSkill]
        WHERE [ActivatedByRunID] = @ID

    OPEN cascade_update_MJConversationSkills_ActivatedByRunID_cursor
    FETCH NEXT FROM cascade_update_MJConversationSkills_ActivatedByRunID_cursor INTO @MJConversationSkills_ActivatedByRunIDID, @MJConversationSkills_ActivatedByRunID_ConversationID, @MJConversationSkills_ActivatedByRunID_SkillID, @MJConversationSkills_ActivatedByRunID_Status, @MJConversationSkills_ActivatedByRunID_ActivatedByRunID, @MJConversationSkills_ActivatedByRunID_EndedAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversationSkills_ActivatedByRunID_ActivatedByRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationSkill] @ID = @MJConversationSkills_ActivatedByRunIDID, @ConversationID = @MJConversationSkills_ActivatedByRunID_ConversationID, @SkillID = @MJConversationSkills_ActivatedByRunID_SkillID, @Status = @MJConversationSkills_ActivatedByRunID_Status, @ActivatedByRunID_Clear = 1, @ActivatedByRunID = @MJConversationSkills_ActivatedByRunID_ActivatedByRunID, @EndedAt = @MJConversationSkills_ActivatedByRunID_EndedAt

        FETCH NEXT FROM cascade_update_MJConversationSkills_ActivatedByRunID_cursor INTO @MJConversationSkills_ActivatedByRunIDID, @MJConversationSkills_ActivatedByRunID_ConversationID, @MJConversationSkills_ActivatedByRunID_SkillID, @MJConversationSkills_ActivatedByRunID_Status, @MJConversationSkills_ActivatedByRunID_ActivatedByRunID, @MJConversationSkills_ActivatedByRunID_EndedAt
    END

    CLOSE cascade_update_MJConversationSkills_ActivatedByRunID_cursor
    DEALLOCATE cascade_update_MJConversationSkills_ActivatedByRunID_cursor
    
    -- Cascade update on DuplicateRunDetailMatch using cursor to call spUpdateDuplicateRunDetailMatch
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunIDID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_DuplicateRunDetailID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_MatchSource nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_MatchRecordID nvarchar(500)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_MatchProbability numeric(12, 11)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_MatchedAt datetimeoffset
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_Action nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_ApprovalStatus nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMergeLogID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_MergeStatus nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_MergedAt datetimeoffset
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMetadata nvarchar(MAX)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_AIAgentRunID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_AIPromptRunID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_LLMRecommendation nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_LLMConfidence numeric(12, 11)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_LLMReasoning nvarchar(MAX)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedSurvivorRecordID nvarchar(500)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedFieldMap nvarchar(MAX)
    DECLARE cascade_update_MJDuplicateRunDetailMatches_AIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [DuplicateRunDetailID], [MatchSource], [MatchRecordID], [MatchProbability], [MatchedAt], [Action], [ApprovalStatus], [RecordMergeLogID], [MergeStatus], [MergedAt], [RecordMetadata], [AIAgentRunID], [AIPromptRunID], [LLMRecommendation], [LLMConfidence], [LLMReasoning], [LLMProposedSurvivorRecordID], [LLMProposedFieldMap]
        FROM [${flyway:defaultSchema}].[DuplicateRunDetailMatch]
        WHERE [AIAgentRunID] = @ID

    OPEN cascade_update_MJDuplicateRunDetailMatches_AIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJDuplicateRunDetailMatches_AIAgentRunID_cursor INTO @MJDuplicateRunDetailMatches_AIAgentRunIDID, @MJDuplicateRunDetailMatches_AIAgentRunID_DuplicateRunDetailID, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchSource, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchRecordID, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchProbability, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchedAt, @MJDuplicateRunDetailMatches_AIAgentRunID_Action, @MJDuplicateRunDetailMatches_AIAgentRunID_ApprovalStatus, @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMergeLogID, @MJDuplicateRunDetailMatches_AIAgentRunID_MergeStatus, @MJDuplicateRunDetailMatches_AIAgentRunID_MergedAt, @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMetadata, @MJDuplicateRunDetailMatches_AIAgentRunID_AIAgentRunID, @MJDuplicateRunDetailMatches_AIAgentRunID_AIPromptRunID, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMRecommendation, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMConfidence, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMReasoning, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedSurvivorRecordID, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedFieldMap

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJDuplicateRunDetailMatches_AIAgentRunID_AIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateDuplicateRunDetailMatch] @ID = @MJDuplicateRunDetailMatches_AIAgentRunIDID, @DuplicateRunDetailID = @MJDuplicateRunDetailMatches_AIAgentRunID_DuplicateRunDetailID, @MatchSource = @MJDuplicateRunDetailMatches_AIAgentRunID_MatchSource, @MatchRecordID = @MJDuplicateRunDetailMatches_AIAgentRunID_MatchRecordID, @MatchProbability = @MJDuplicateRunDetailMatches_AIAgentRunID_MatchProbability, @MatchedAt = @MJDuplicateRunDetailMatches_AIAgentRunID_MatchedAt, @Action = @MJDuplicateRunDetailMatches_AIAgentRunID_Action, @ApprovalStatus = @MJDuplicateRunDetailMatches_AIAgentRunID_ApprovalStatus, @RecordMergeLogID = @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMergeLogID, @MergeStatus = @MJDuplicateRunDetailMatches_AIAgentRunID_MergeStatus, @MergedAt = @MJDuplicateRunDetailMatches_AIAgentRunID_MergedAt, @RecordMetadata = @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMetadata, @AIAgentRunID_Clear = 1, @AIAgentRunID = @MJDuplicateRunDetailMatches_AIAgentRunID_AIAgentRunID, @AIPromptRunID = @MJDuplicateRunDetailMatches_AIAgentRunID_AIPromptRunID, @LLMRecommendation = @MJDuplicateRunDetailMatches_AIAgentRunID_LLMRecommendation, @LLMConfidence = @MJDuplicateRunDetailMatches_AIAgentRunID_LLMConfidence, @LLMReasoning = @MJDuplicateRunDetailMatches_AIAgentRunID_LLMReasoning, @LLMProposedSurvivorRecordID = @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedSurvivorRecordID, @LLMProposedFieldMap = @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedFieldMap

        FETCH NEXT FROM cascade_update_MJDuplicateRunDetailMatches_AIAgentRunID_cursor INTO @MJDuplicateRunDetailMatches_AIAgentRunIDID, @MJDuplicateRunDetailMatches_AIAgentRunID_DuplicateRunDetailID, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchSource, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchRecordID, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchProbability, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchedAt, @MJDuplicateRunDetailMatches_AIAgentRunID_Action, @MJDuplicateRunDetailMatches_AIAgentRunID_ApprovalStatus, @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMergeLogID, @MJDuplicateRunDetailMatches_AIAgentRunID_MergeStatus, @MJDuplicateRunDetailMatches_AIAgentRunID_MergedAt, @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMetadata, @MJDuplicateRunDetailMatches_AIAgentRunID_AIAgentRunID, @MJDuplicateRunDetailMatches_AIAgentRunID_AIPromptRunID, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMRecommendation, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMConfidence, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMReasoning, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedSurvivorRecordID, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedFieldMap
    END

    CLOSE cascade_update_MJDuplicateRunDetailMatches_AIAgentRunID_cursor
    DEALLOCATE cascade_update_MJDuplicateRunDetailMatches_AIAgentRunID_cursor
    
    -- Cascade update on ExperimentSessionIteration using cursor to call spUpdateExperimentSessionIteration
    DECLARE @MJExperimentSessionIterations_AIAgentRunIDID uniqueidentifier
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_ExperimentSessionID uniqueidentifier
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_Sequence int
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_Label nvarchar(255)
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_Status nvarchar(20)
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_Score decimal(18, 6)
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_ComputeCost decimal(18, 6)
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_TokensUsed int
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_Rationale nvarchar(MAX)
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID uniqueidentifier
    DECLARE cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [ExperimentSessionID], [Sequence], [Label], [Status], [Score], [ComputeCost], [TokensUsed], [Rationale], [AIAgentRunID]
        FROM [${flyway:defaultSchema}].[ExperimentSessionIteration]
        WHERE [AIAgentRunID] = @ID

    OPEN cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor INTO @MJExperimentSessionIterations_AIAgentRunIDID, @MJExperimentSessionIterations_AIAgentRunID_ExperimentSessionID, @MJExperimentSessionIterations_AIAgentRunID_Sequence, @MJExperimentSessionIterations_AIAgentRunID_Label, @MJExperimentSessionIterations_AIAgentRunID_Status, @MJExperimentSessionIterations_AIAgentRunID_Score, @MJExperimentSessionIterations_AIAgentRunID_ComputeCost, @MJExperimentSessionIterations_AIAgentRunID_TokensUsed, @MJExperimentSessionIterations_AIAgentRunID_Rationale, @MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateExperimentSessionIteration] @ID = @MJExperimentSessionIterations_AIAgentRunIDID, @ExperimentSessionID = @MJExperimentSessionIterations_AIAgentRunID_ExperimentSessionID, @Sequence = @MJExperimentSessionIterations_AIAgentRunID_Sequence, @Label = @MJExperimentSessionIterations_AIAgentRunID_Label, @Status = @MJExperimentSessionIterations_AIAgentRunID_Status, @Score = @MJExperimentSessionIterations_AIAgentRunID_Score, @ComputeCost = @MJExperimentSessionIterations_AIAgentRunID_ComputeCost, @TokensUsed = @MJExperimentSessionIterations_AIAgentRunID_TokensUsed, @Rationale = @MJExperimentSessionIterations_AIAgentRunID_Rationale, @AIAgentRunID_Clear = 1, @AIAgentRunID = @MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID

        FETCH NEXT FROM cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor INTO @MJExperimentSessionIterations_AIAgentRunIDID, @MJExperimentSessionIterations_AIAgentRunID_ExperimentSessionID, @MJExperimentSessionIterations_AIAgentRunID_Sequence, @MJExperimentSessionIterations_AIAgentRunID_Label, @MJExperimentSessionIterations_AIAgentRunID_Status, @MJExperimentSessionIterations_AIAgentRunID_Score, @MJExperimentSessionIterations_AIAgentRunID_ComputeCost, @MJExperimentSessionIterations_AIAgentRunID_TokensUsed, @MJExperimentSessionIterations_AIAgentRunID_Rationale, @MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID
    END

    CLOSE cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor
    DEALLOCATE cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor
    
    -- Cascade update on ExperimentSession using cursor to call spUpdateExperimentSession
    DECLARE @MJExperimentSessions_AgentRunIDID uniqueidentifier
    DECLARE @MJExperimentSessions_AgentRunID_ExperimentID uniqueidentifier
    DECLARE @MJExperimentSessions_AgentRunID_Name nvarchar(255)
    DECLARE @MJExperimentSessions_AgentRunID_Goal nvarchar(MAX)
    DECLARE @MJExperimentSessions_AgentRunID_Budget nvarchar(MAX)
    DECLARE @MJExperimentSessions_AgentRunID_Status nvarchar(20)
    DECLARE @MJExperimentSessions_AgentRunID_PlanSpec nvarchar(MAX)
    DECLARE @MJExperimentSessions_AgentRunID_Leaderboard nvarchar(MAX)
    DECLARE @MJExperimentSessions_AgentRunID_AgentRunID uniqueidentifier
    DECLARE cascade_update_MJExperimentSessions_AgentRunID_cursor CURSOR FOR
        SELECT [ID], [ExperimentID], [Name], [Goal], [Budget], [Status], [PlanSpec], [Leaderboard], [AgentRunID]
        FROM [${flyway:defaultSchema}].[ExperimentSession]
        WHERE [AgentRunID] = @ID

    OPEN cascade_update_MJExperimentSessions_AgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJExperimentSessions_AgentRunID_cursor INTO @MJExperimentSessions_AgentRunIDID, @MJExperimentSessions_AgentRunID_ExperimentID, @MJExperimentSessions_AgentRunID_Name, @MJExperimentSessions_AgentRunID_Goal, @MJExperimentSessions_AgentRunID_Budget, @MJExperimentSessions_AgentRunID_Status, @MJExperimentSessions_AgentRunID_PlanSpec, @MJExperimentSessions_AgentRunID_Leaderboard, @MJExperimentSessions_AgentRunID_AgentRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJExperimentSessions_AgentRunID_AgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateExperimentSession] @ID = @MJExperimentSessions_AgentRunIDID, @ExperimentID = @MJExperimentSessions_AgentRunID_ExperimentID, @Name = @MJExperimentSessions_AgentRunID_Name, @Goal = @MJExperimentSessions_AgentRunID_Goal, @Budget = @MJExperimentSessions_AgentRunID_Budget, @Status = @MJExperimentSessions_AgentRunID_Status, @PlanSpec = @MJExperimentSessions_AgentRunID_PlanSpec, @Leaderboard = @MJExperimentSessions_AgentRunID_Leaderboard, @AgentRunID_Clear = 1, @AgentRunID = @MJExperimentSessions_AgentRunID_AgentRunID

        FETCH NEXT FROM cascade_update_MJExperimentSessions_AgentRunID_cursor INTO @MJExperimentSessions_AgentRunIDID, @MJExperimentSessions_AgentRunID_ExperimentID, @MJExperimentSessions_AgentRunID_Name, @MJExperimentSessions_AgentRunID_Goal, @MJExperimentSessions_AgentRunID_Budget, @MJExperimentSessions_AgentRunID_Status, @MJExperimentSessions_AgentRunID_PlanSpec, @MJExperimentSessions_AgentRunID_Leaderboard, @MJExperimentSessions_AgentRunID_AgentRunID
    END

    CLOSE cascade_update_MJExperimentSessions_AgentRunID_cursor
    DEALLOCATE cascade_update_MJExperimentSessions_AgentRunID_cursor
    
    -- Cascade update on ProcessRunDetail using cursor to call spUpdateProcessRunDetail
    DECLARE @MJProcessRunDetails_AIAgentRunIDID uniqueidentifier
    DECLARE @MJProcessRunDetails_AIAgentRunID_ProcessRunID uniqueidentifier
    DECLARE @MJProcessRunDetails_AIAgentRunID_EntityID uniqueidentifier
    DECLARE @MJProcessRunDetails_AIAgentRunID_RecordID nvarchar(450)
    DECLARE @MJProcessRunDetails_AIAgentRunID_Status nvarchar(20)
    DECLARE @MJProcessRunDetails_AIAgentRunID_StartedAt datetimeoffset
    DECLARE @MJProcessRunDetails_AIAgentRunID_CompletedAt datetimeoffset
    DECLARE @MJProcessRunDetails_AIAgentRunID_DurationMs int
    DECLARE @MJProcessRunDetails_AIAgentRunID_AttemptCount int
    DECLARE @MJProcessRunDetails_AIAgentRunID_ResultPayload nvarchar(MAX)
    DECLARE @MJProcessRunDetails_AIAgentRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJProcessRunDetails_AIAgentRunID_ActionExecutionLogID uniqueidentifier
    DECLARE @MJProcessRunDetails_AIAgentRunID_AIAgentRunID uniqueidentifier
    DECLARE cascade_update_MJProcessRunDetails_AIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [ProcessRunID], [EntityID], [RecordID], [Status], [StartedAt], [CompletedAt], [DurationMs], [AttemptCount], [ResultPayload], [ErrorMessage], [ActionExecutionLogID], [AIAgentRunID]
        FROM [${flyway:defaultSchema}].[ProcessRunDetail]
        WHERE [AIAgentRunID] = @ID

    OPEN cascade_update_MJProcessRunDetails_AIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJProcessRunDetails_AIAgentRunID_cursor INTO @MJProcessRunDetails_AIAgentRunIDID, @MJProcessRunDetails_AIAgentRunID_ProcessRunID, @MJProcessRunDetails_AIAgentRunID_EntityID, @MJProcessRunDetails_AIAgentRunID_RecordID, @MJProcessRunDetails_AIAgentRunID_Status, @MJProcessRunDetails_AIAgentRunID_StartedAt, @MJProcessRunDetails_AIAgentRunID_CompletedAt, @MJProcessRunDetails_AIAgentRunID_DurationMs, @MJProcessRunDetails_AIAgentRunID_AttemptCount, @MJProcessRunDetails_AIAgentRunID_ResultPayload, @MJProcessRunDetails_AIAgentRunID_ErrorMessage, @MJProcessRunDetails_AIAgentRunID_ActionExecutionLogID, @MJProcessRunDetails_AIAgentRunID_AIAgentRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJProcessRunDetails_AIAgentRunID_AIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateProcessRunDetail] @ID = @MJProcessRunDetails_AIAgentRunIDID, @ProcessRunID = @MJProcessRunDetails_AIAgentRunID_ProcessRunID, @EntityID = @MJProcessRunDetails_AIAgentRunID_EntityID, @RecordID = @MJProcessRunDetails_AIAgentRunID_RecordID, @Status = @MJProcessRunDetails_AIAgentRunID_Status, @StartedAt = @MJProcessRunDetails_AIAgentRunID_StartedAt, @CompletedAt = @MJProcessRunDetails_AIAgentRunID_CompletedAt, @DurationMs = @MJProcessRunDetails_AIAgentRunID_DurationMs, @AttemptCount = @MJProcessRunDetails_AIAgentRunID_AttemptCount, @ResultPayload = @MJProcessRunDetails_AIAgentRunID_ResultPayload, @ErrorMessage = @MJProcessRunDetails_AIAgentRunID_ErrorMessage, @ActionExecutionLogID = @MJProcessRunDetails_AIAgentRunID_ActionExecutionLogID, @AIAgentRunID_Clear = 1, @AIAgentRunID = @MJProcessRunDetails_AIAgentRunID_AIAgentRunID

        FETCH NEXT FROM cascade_update_MJProcessRunDetails_AIAgentRunID_cursor INTO @MJProcessRunDetails_AIAgentRunIDID, @MJProcessRunDetails_AIAgentRunID_ProcessRunID, @MJProcessRunDetails_AIAgentRunID_EntityID, @MJProcessRunDetails_AIAgentRunID_RecordID, @MJProcessRunDetails_AIAgentRunID_Status, @MJProcessRunDetails_AIAgentRunID_StartedAt, @MJProcessRunDetails_AIAgentRunID_CompletedAt, @MJProcessRunDetails_AIAgentRunID_DurationMs, @MJProcessRunDetails_AIAgentRunID_AttemptCount, @MJProcessRunDetails_AIAgentRunID_ResultPayload, @MJProcessRunDetails_AIAgentRunID_ErrorMessage, @MJProcessRunDetails_AIAgentRunID_ActionExecutionLogID, @MJProcessRunDetails_AIAgentRunID_AIAgentRunID
    END

    CLOSE cascade_update_MJProcessRunDetails_AIAgentRunID_cursor
    DEALLOCATE cascade_update_MJProcessRunDetails_AIAgentRunID_cursor
    
    -- Cascade update on RubricEvaluation using cursor to call spUpdateRubricEvaluation
    DECLARE @MJRubricEvaluations_AIAgentRunIDID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIAgentRunID_RubricVersionID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIAgentRunID_SubjectEntityID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIAgentRunID_SubjectRecordID nvarchar(450)
    DECLARE @MJRubricEvaluations_AIAgentRunID_ContextEntityID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIAgentRunID_ContextRecordID nvarchar(450)
    DECLARE @MJRubricEvaluations_AIAgentRunID_EvaluatorType nvarchar(20)
    DECLARE @MJRubricEvaluations_AIAgentRunID_EvaluatorUserID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIAgentRunID_AIPromptRunID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIAgentRunID_AIAgentRunID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIAgentRunID_EvaluatorName nvarchar(255)
    DECLARE @MJRubricEvaluations_AIAgentRunID_Status nvarchar(20)
    DECLARE @MJRubricEvaluations_AIAgentRunID_SupersedesEvaluationID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIAgentRunID_SubmittedAt datetimeoffset
    DECLARE @MJRubricEvaluations_AIAgentRunID_PassThresholdApplied decimal(9, 6)
    DECLARE @MJRubricEvaluations_AIAgentRunID_NormalizedScore decimal(9, 6)
    DECLARE @MJRubricEvaluations_AIAgentRunID_Passed bit
    DECLARE @MJRubricEvaluations_AIAgentRunID_Outcome nvarchar(30)
    DECLARE @MJRubricEvaluations_AIAgentRunID_BandID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIAgentRunID_GateFailed bit
    DECLARE @MJRubricEvaluations_AIAgentRunID_Completeness decimal(9, 6)
    DECLARE @MJRubricEvaluations_AIAgentRunID_ScoredCriteriaCount int
    DECLARE @MJRubricEvaluations_AIAgentRunID_ApplicableCriteriaCount int
    DECLARE @MJRubricEvaluations_AIAgentRunID_TotalCriteriaCount int
    DECLARE @MJRubricEvaluations_AIAgentRunID_Confidence decimal(9, 6)
    DECLARE @MJRubricEvaluations_AIAgentRunID_Narrative nvarchar(MAX)
    DECLARE @MJRubricEvaluations_AIAgentRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJRubricEvaluations_AIAgentRunID_ScoringEngineVersion nvarchar(20)
    DECLARE @MJRubricEvaluations_AIAgentRunID_Metadata nvarchar(MAX)
    DECLARE cascade_update_MJRubricEvaluations_AIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [RubricVersionID], [SubjectEntityID], [SubjectRecordID], [ContextEntityID], [ContextRecordID], [EvaluatorType], [EvaluatorUserID], [AIPromptRunID], [AIAgentRunID], [EvaluatorName], [Status], [SupersedesEvaluationID], [SubmittedAt], [PassThresholdApplied], [NormalizedScore], [Passed], [Outcome], [BandID], [GateFailed], [Completeness], [ScoredCriteriaCount], [ApplicableCriteriaCount], [TotalCriteriaCount], [Confidence], [Narrative], [ErrorMessage], [ScoringEngineVersion], [Metadata]
        FROM [${flyway:defaultSchema}].[RubricEvaluation]
        WHERE [AIAgentRunID] = @ID

    OPEN cascade_update_MJRubricEvaluations_AIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJRubricEvaluations_AIAgentRunID_cursor INTO @MJRubricEvaluations_AIAgentRunIDID, @MJRubricEvaluations_AIAgentRunID_RubricVersionID, @MJRubricEvaluations_AIAgentRunID_SubjectEntityID, @MJRubricEvaluations_AIAgentRunID_SubjectRecordID, @MJRubricEvaluations_AIAgentRunID_ContextEntityID, @MJRubricEvaluations_AIAgentRunID_ContextRecordID, @MJRubricEvaluations_AIAgentRunID_EvaluatorType, @MJRubricEvaluations_AIAgentRunID_EvaluatorUserID, @MJRubricEvaluations_AIAgentRunID_AIPromptRunID, @MJRubricEvaluations_AIAgentRunID_AIAgentRunID, @MJRubricEvaluations_AIAgentRunID_EvaluatorName, @MJRubricEvaluations_AIAgentRunID_Status, @MJRubricEvaluations_AIAgentRunID_SupersedesEvaluationID, @MJRubricEvaluations_AIAgentRunID_SubmittedAt, @MJRubricEvaluations_AIAgentRunID_PassThresholdApplied, @MJRubricEvaluations_AIAgentRunID_NormalizedScore, @MJRubricEvaluations_AIAgentRunID_Passed, @MJRubricEvaluations_AIAgentRunID_Outcome, @MJRubricEvaluations_AIAgentRunID_BandID, @MJRubricEvaluations_AIAgentRunID_GateFailed, @MJRubricEvaluations_AIAgentRunID_Completeness, @MJRubricEvaluations_AIAgentRunID_ScoredCriteriaCount, @MJRubricEvaluations_AIAgentRunID_ApplicableCriteriaCount, @MJRubricEvaluations_AIAgentRunID_TotalCriteriaCount, @MJRubricEvaluations_AIAgentRunID_Confidence, @MJRubricEvaluations_AIAgentRunID_Narrative, @MJRubricEvaluations_AIAgentRunID_ErrorMessage, @MJRubricEvaluations_AIAgentRunID_ScoringEngineVersion, @MJRubricEvaluations_AIAgentRunID_Metadata

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJRubricEvaluations_AIAgentRunID_AIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateRubricEvaluation] @ID = @MJRubricEvaluations_AIAgentRunIDID, @RubricVersionID = @MJRubricEvaluations_AIAgentRunID_RubricVersionID, @SubjectEntityID = @MJRubricEvaluations_AIAgentRunID_SubjectEntityID, @SubjectRecordID = @MJRubricEvaluations_AIAgentRunID_SubjectRecordID, @ContextEntityID = @MJRubricEvaluations_AIAgentRunID_ContextEntityID, @ContextRecordID = @MJRubricEvaluations_AIAgentRunID_ContextRecordID, @EvaluatorType = @MJRubricEvaluations_AIAgentRunID_EvaluatorType, @EvaluatorUserID = @MJRubricEvaluations_AIAgentRunID_EvaluatorUserID, @AIPromptRunID = @MJRubricEvaluations_AIAgentRunID_AIPromptRunID, @AIAgentRunID_Clear = 1, @AIAgentRunID = @MJRubricEvaluations_AIAgentRunID_AIAgentRunID, @EvaluatorName = @MJRubricEvaluations_AIAgentRunID_EvaluatorName, @Status = @MJRubricEvaluations_AIAgentRunID_Status, @SupersedesEvaluationID = @MJRubricEvaluations_AIAgentRunID_SupersedesEvaluationID, @SubmittedAt = @MJRubricEvaluations_AIAgentRunID_SubmittedAt, @PassThresholdApplied = @MJRubricEvaluations_AIAgentRunID_PassThresholdApplied, @NormalizedScore = @MJRubricEvaluations_AIAgentRunID_NormalizedScore, @Passed = @MJRubricEvaluations_AIAgentRunID_Passed, @Outcome = @MJRubricEvaluations_AIAgentRunID_Outcome, @BandID = @MJRubricEvaluations_AIAgentRunID_BandID, @GateFailed = @MJRubricEvaluations_AIAgentRunID_GateFailed, @Completeness = @MJRubricEvaluations_AIAgentRunID_Completeness, @ScoredCriteriaCount = @MJRubricEvaluations_AIAgentRunID_ScoredCriteriaCount, @ApplicableCriteriaCount = @MJRubricEvaluations_AIAgentRunID_ApplicableCriteriaCount, @TotalCriteriaCount = @MJRubricEvaluations_AIAgentRunID_TotalCriteriaCount, @Confidence = @MJRubricEvaluations_AIAgentRunID_Confidence, @Narrative = @MJRubricEvaluations_AIAgentRunID_Narrative, @ErrorMessage = @MJRubricEvaluations_AIAgentRunID_ErrorMessage, @ScoringEngineVersion = @MJRubricEvaluations_AIAgentRunID_ScoringEngineVersion, @Metadata = @MJRubricEvaluations_AIAgentRunID_Metadata

        FETCH NEXT FROM cascade_update_MJRubricEvaluations_AIAgentRunID_cursor INTO @MJRubricEvaluations_AIAgentRunIDID, @MJRubricEvaluations_AIAgentRunID_RubricVersionID, @MJRubricEvaluations_AIAgentRunID_SubjectEntityID, @MJRubricEvaluations_AIAgentRunID_SubjectRecordID, @MJRubricEvaluations_AIAgentRunID_ContextEntityID, @MJRubricEvaluations_AIAgentRunID_ContextRecordID, @MJRubricEvaluations_AIAgentRunID_EvaluatorType, @MJRubricEvaluations_AIAgentRunID_EvaluatorUserID, @MJRubricEvaluations_AIAgentRunID_AIPromptRunID, @MJRubricEvaluations_AIAgentRunID_AIAgentRunID, @MJRubricEvaluations_AIAgentRunID_EvaluatorName, @MJRubricEvaluations_AIAgentRunID_Status, @MJRubricEvaluations_AIAgentRunID_SupersedesEvaluationID, @MJRubricEvaluations_AIAgentRunID_SubmittedAt, @MJRubricEvaluations_AIAgentRunID_PassThresholdApplied, @MJRubricEvaluations_AIAgentRunID_NormalizedScore, @MJRubricEvaluations_AIAgentRunID_Passed, @MJRubricEvaluations_AIAgentRunID_Outcome, @MJRubricEvaluations_AIAgentRunID_BandID, @MJRubricEvaluations_AIAgentRunID_GateFailed, @MJRubricEvaluations_AIAgentRunID_Completeness, @MJRubricEvaluations_AIAgentRunID_ScoredCriteriaCount, @MJRubricEvaluations_AIAgentRunID_ApplicableCriteriaCount, @MJRubricEvaluations_AIAgentRunID_TotalCriteriaCount, @MJRubricEvaluations_AIAgentRunID_Confidence, @MJRubricEvaluations_AIAgentRunID_Narrative, @MJRubricEvaluations_AIAgentRunID_ErrorMessage, @MJRubricEvaluations_AIAgentRunID_ScoringEngineVersion, @MJRubricEvaluations_AIAgentRunID_Metadata
    END

    CLOSE cascade_update_MJRubricEvaluations_AIAgentRunID_cursor
    DEALLOCATE cascade_update_MJRubricEvaluations_AIAgentRunID_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJTasks_AgentRunIDID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_ParentID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_Name nvarchar(255)
    DECLARE @MJTasks_AgentRunID_Description nvarchar(MAX)
    DECLARE @MJTasks_AgentRunID_TypeID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_EnvironmentID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_ProjectID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_ConversationDetailID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_UserID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_AgentID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_Status nvarchar(50)
    DECLARE @MJTasks_AgentRunID_PercentComplete int
    DECLARE @MJTasks_AgentRunID_DueAt datetimeoffset
    DECLARE @MJTasks_AgentRunID_StartedAt datetimeoffset
    DECLARE @MJTasks_AgentRunID_CompletedAt datetimeoffset
    DECLARE @MJTasks_AgentRunID_InputPayload nvarchar(MAX)
    DECLARE @MJTasks_AgentRunID_OutputPayload nvarchar(MAX)
    DECLARE @MJTasks_AgentRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJTasks_AgentRunID_AgentRunID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_ClaimedBy nvarchar(100)
    DECLARE @MJTasks_AgentRunID_ClaimExpiresAt datetimeoffset
    DECLARE @MJTasks_AgentRunID_ActionID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_StepType nvarchar(20)
    DECLARE @MJTasks_AgentRunID_PromptID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJTasks_AgentRunID_cursor CURSOR FOR
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt], [InputPayload], [OutputPayload], [ErrorMessage], [AgentRunID], [ClaimedBy], [ClaimExpiresAt], [ActionID], [StepType], [PromptID], [Configuration]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [AgentRunID] = @ID

    OPEN cascade_update_MJTasks_AgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJTasks_AgentRunID_cursor INTO @MJTasks_AgentRunIDID, @MJTasks_AgentRunID_ParentID, @MJTasks_AgentRunID_Name, @MJTasks_AgentRunID_Description, @MJTasks_AgentRunID_TypeID, @MJTasks_AgentRunID_EnvironmentID, @MJTasks_AgentRunID_ProjectID, @MJTasks_AgentRunID_ConversationDetailID, @MJTasks_AgentRunID_UserID, @MJTasks_AgentRunID_AgentID, @MJTasks_AgentRunID_Status, @MJTasks_AgentRunID_PercentComplete, @MJTasks_AgentRunID_DueAt, @MJTasks_AgentRunID_StartedAt, @MJTasks_AgentRunID_CompletedAt, @MJTasks_AgentRunID_InputPayload, @MJTasks_AgentRunID_OutputPayload, @MJTasks_AgentRunID_ErrorMessage, @MJTasks_AgentRunID_AgentRunID, @MJTasks_AgentRunID_ClaimedBy, @MJTasks_AgentRunID_ClaimExpiresAt, @MJTasks_AgentRunID_ActionID, @MJTasks_AgentRunID_StepType, @MJTasks_AgentRunID_PromptID, @MJTasks_AgentRunID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJTasks_AgentRunID_AgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJTasks_AgentRunIDID, @ParentID = @MJTasks_AgentRunID_ParentID, @Name = @MJTasks_AgentRunID_Name, @Description = @MJTasks_AgentRunID_Description, @TypeID = @MJTasks_AgentRunID_TypeID, @EnvironmentID = @MJTasks_AgentRunID_EnvironmentID, @ProjectID = @MJTasks_AgentRunID_ProjectID, @ConversationDetailID = @MJTasks_AgentRunID_ConversationDetailID, @UserID = @MJTasks_AgentRunID_UserID, @AgentID = @MJTasks_AgentRunID_AgentID, @Status = @MJTasks_AgentRunID_Status, @PercentComplete = @MJTasks_AgentRunID_PercentComplete, @DueAt = @MJTasks_AgentRunID_DueAt, @StartedAt = @MJTasks_AgentRunID_StartedAt, @CompletedAt = @MJTasks_AgentRunID_CompletedAt, @InputPayload = @MJTasks_AgentRunID_InputPayload, @OutputPayload = @MJTasks_AgentRunID_OutputPayload, @ErrorMessage = @MJTasks_AgentRunID_ErrorMessage, @AgentRunID_Clear = 1, @AgentRunID = @MJTasks_AgentRunID_AgentRunID, @ClaimedBy = @MJTasks_AgentRunID_ClaimedBy, @ClaimExpiresAt = @MJTasks_AgentRunID_ClaimExpiresAt, @ActionID = @MJTasks_AgentRunID_ActionID, @StepType = @MJTasks_AgentRunID_StepType, @PromptID = @MJTasks_AgentRunID_PromptID, @Configuration = @MJTasks_AgentRunID_Configuration

        FETCH NEXT FROM cascade_update_MJTasks_AgentRunID_cursor INTO @MJTasks_AgentRunIDID, @MJTasks_AgentRunID_ParentID, @MJTasks_AgentRunID_Name, @MJTasks_AgentRunID_Description, @MJTasks_AgentRunID_TypeID, @MJTasks_AgentRunID_EnvironmentID, @MJTasks_AgentRunID_ProjectID, @MJTasks_AgentRunID_ConversationDetailID, @MJTasks_AgentRunID_UserID, @MJTasks_AgentRunID_AgentID, @MJTasks_AgentRunID_Status, @MJTasks_AgentRunID_PercentComplete, @MJTasks_AgentRunID_DueAt, @MJTasks_AgentRunID_StartedAt, @MJTasks_AgentRunID_CompletedAt, @MJTasks_AgentRunID_InputPayload, @MJTasks_AgentRunID_OutputPayload, @MJTasks_AgentRunID_ErrorMessage, @MJTasks_AgentRunID_AgentRunID, @MJTasks_AgentRunID_ClaimedBy, @MJTasks_AgentRunID_ClaimExpiresAt, @MJTasks_AgentRunID_ActionID, @MJTasks_AgentRunID_StepType, @MJTasks_AgentRunID_PromptID, @MJTasks_AgentRunID_Configuration
    END

    CLOSE cascade_update_MJTasks_AgentRunID_cursor
    DEALLOCATE cascade_update_MJTasks_AgentRunID_cursor
    
    -- Cascade update on UserRoutineRun using cursor to call spUpdateUserRoutineRun
    DECLARE @MJUserRoutineRuns_AgentRunIDID uniqueidentifier
    DECLARE @MJUserRoutineRuns_AgentRunID_RoutineID uniqueidentifier
    DECLARE @MJUserRoutineRuns_AgentRunID_StartedAt datetimeoffset
    DECLARE @MJUserRoutineRuns_AgentRunID_CompletedAt datetimeoffset
    DECLARE @MJUserRoutineRuns_AgentRunID_Status nvarchar(20)
    DECLARE @MJUserRoutineRuns_AgentRunID_AgentRunID uniqueidentifier
    DECLARE @MJUserRoutineRuns_AgentRunID_PromptRunID uniqueidentifier
    DECLARE @MJUserRoutineRuns_AgentRunID_ActionExecutionLogID uniqueidentifier
    DECLARE @MJUserRoutineRuns_AgentRunID_ResultSummary nvarchar(MAX)
    DECLARE @MJUserRoutineRuns_AgentRunID_ResultHash nvarchar(100)
    DECLARE @MJUserRoutineRuns_AgentRunID_NotificationSent bit
    DECLARE @MJUserRoutineRuns_AgentRunID_ErrorMessage nvarchar(MAX)
    DECLARE cascade_update_MJUserRoutineRuns_AgentRunID_cursor CURSOR FOR
        SELECT [ID], [RoutineID], [StartedAt], [CompletedAt], [Status], [AgentRunID], [PromptRunID], [ActionExecutionLogID], [ResultSummary], [ResultHash], [NotificationSent], [ErrorMessage]
        FROM [${flyway:defaultSchema}].[UserRoutineRun]
        WHERE [AgentRunID] = @ID

    OPEN cascade_update_MJUserRoutineRuns_AgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJUserRoutineRuns_AgentRunID_cursor INTO @MJUserRoutineRuns_AgentRunIDID, @MJUserRoutineRuns_AgentRunID_RoutineID, @MJUserRoutineRuns_AgentRunID_StartedAt, @MJUserRoutineRuns_AgentRunID_CompletedAt, @MJUserRoutineRuns_AgentRunID_Status, @MJUserRoutineRuns_AgentRunID_AgentRunID, @MJUserRoutineRuns_AgentRunID_PromptRunID, @MJUserRoutineRuns_AgentRunID_ActionExecutionLogID, @MJUserRoutineRuns_AgentRunID_ResultSummary, @MJUserRoutineRuns_AgentRunID_ResultHash, @MJUserRoutineRuns_AgentRunID_NotificationSent, @MJUserRoutineRuns_AgentRunID_ErrorMessage

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJUserRoutineRuns_AgentRunID_AgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateUserRoutineRun] @ID = @MJUserRoutineRuns_AgentRunIDID, @RoutineID = @MJUserRoutineRuns_AgentRunID_RoutineID, @StartedAt = @MJUserRoutineRuns_AgentRunID_StartedAt, @CompletedAt = @MJUserRoutineRuns_AgentRunID_CompletedAt, @Status = @MJUserRoutineRuns_AgentRunID_Status, @AgentRunID_Clear = 1, @AgentRunID = @MJUserRoutineRuns_AgentRunID_AgentRunID, @PromptRunID = @MJUserRoutineRuns_AgentRunID_PromptRunID, @ActionExecutionLogID = @MJUserRoutineRuns_AgentRunID_ActionExecutionLogID, @ResultSummary = @MJUserRoutineRuns_AgentRunID_ResultSummary, @ResultHash = @MJUserRoutineRuns_AgentRunID_ResultHash, @NotificationSent = @MJUserRoutineRuns_AgentRunID_NotificationSent, @ErrorMessage = @MJUserRoutineRuns_AgentRunID_ErrorMessage

        FETCH NEXT FROM cascade_update_MJUserRoutineRuns_AgentRunID_cursor INTO @MJUserRoutineRuns_AgentRunIDID, @MJUserRoutineRuns_AgentRunID_RoutineID, @MJUserRoutineRuns_AgentRunID_StartedAt, @MJUserRoutineRuns_AgentRunID_CompletedAt, @MJUserRoutineRuns_AgentRunID_Status, @MJUserRoutineRuns_AgentRunID_AgentRunID, @MJUserRoutineRuns_AgentRunID_PromptRunID, @MJUserRoutineRuns_AgentRunID_ActionExecutionLogID, @MJUserRoutineRuns_AgentRunID_ResultSummary, @MJUserRoutineRuns_AgentRunID_ResultHash, @MJUserRoutineRuns_AgentRunID_NotificationSent, @MJUserRoutineRuns_AgentRunID_ErrorMessage
    END

    CLOSE cascade_update_MJUserRoutineRuns_AgentRunID_cursor
    DEALLOCATE cascade_update_MJUserRoutineRuns_AgentRunID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agent Runs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9afec69b-269e-4875-a0e0-470ae291b4bd' OR (EntityID = '99273DAD-560E-4ABC-8332-C97AB58B7463' AND Name = 'PayloadAtStartSourceStep')) BEGIN
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
            '9afec69b-269e-4875-a0e0-470ae291b4bd',
            '99273DAD-560E-4ABC-8332-C97AB58B7463', -- Entity: MJ: AI Agent Run Steps
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '99273DAD-560E-4ABC-8332-C97AB58B7463'),
            'PayloadAtStartSourceStep',
            'Payload At Start Source Step',
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

/* Set categories for 2 fields */

-- UPDATE Entity Field Category Info MJ: AI Agent Run Steps.PayloadAtStartSourceStepID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data & Payload',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '970BC9B2-F5F8-4174-BB56-DDFF3D4BA2AD';

-- UPDATE Entity Field Category Info MJ: AI Agent Run Steps.PayloadAtStartSourceStep 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data & Payload',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9AFEC69B-269E-4875-A0E0-470AE291B4BD';

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '97772e9b-ec93-4330-8bd2-4faf2967a88b' OR (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'TemplateDataCapture')) BEGIN
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
            '97772e9b-ec93-4330-8bd2-4faf2967a88b',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: MJ: AI Prompts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '73AD0238-8B56-EF11-991A-6045BDEBA539'),
            'TemplateDataCapture',
            'Template Data Capture',
            'Which template inputs (data, templateData) prompt runs store in Messages: None (shape only), Referenced (only keys the template uses) or Full. NULL uses the server default.',
            'nvarchar',
            40,
            0,
            0,
            1,
            NULL,
            0,
            1,
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

/* SQL text to insert entity field value with ID 45531dee-e5ab-47d7-a14d-9839634774a4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('45531dee-e5ab-47d7-a14d-9839634774a4', '97772E9B-EC93-4330-8BD2-4FAF2967A88B', 1, 'Full', 'Full', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c00c7edc-f681-40ac-bdf3-8e5bb51ecb36 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c00c7edc-f681-40ac-bdf3-8e5bb51ecb36', '97772E9B-EC93-4330-8BD2-4FAF2967A88B', 2, 'None', 'None', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5a51b87d-5529-4b3a-ad1c-c3764fb57b2c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5a51b87d-5529-4b3a-ad1c-c3764fb57b2c', '97772E9B-EC93-4330-8BD2-4FAF2967A88B', 3, 'Referenced', 'Referenced', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 97772E9B-EC93-4330-8BD2-4FAF2967A88B */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='97772E9B-EC93-4330-8BD2-4FAF2967A88B';

/* Index for Foreign Keys for AIPrompt */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TemplateID in table AIPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPrompt_TemplateID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPrompt_TemplateID ON [${flyway:defaultSchema}].[AIPrompt] ([TemplateID]);

-- Index for foreign key CategoryID in table AIPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPrompt_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPrompt_CategoryID ON [${flyway:defaultSchema}].[AIPrompt] ([CategoryID]);

-- Index for foreign key TypeID in table AIPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPrompt_TypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPrompt_TypeID ON [${flyway:defaultSchema}].[AIPrompt] ([TypeID]);

-- Index for foreign key AIModelTypeID in table AIPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPrompt_AIModelTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPrompt_AIModelTypeID ON [${flyway:defaultSchema}].[AIPrompt] ([AIModelTypeID]);

-- Index for foreign key ResultSelectorPromptID in table AIPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPrompt_ResultSelectorPromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPrompt_ResultSelectorPromptID ON [${flyway:defaultSchema}].[AIPrompt] ([ResultSelectorPromptID]);

/* Base View SQL for MJ: AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompts
-- Item: vwAIPrompts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Prompts
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIPrompt
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIPrompts]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIPrompts];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIPrompts]
AS
SELECT
    a.*,
    MJTemplate_TemplateID.[Name] AS [Template],
    MJAIPromptCategory_CategoryID.[Name] AS [Category],
    MJAIPromptType_TypeID.[Name] AS [Type],
    MJAIModelType_AIModelTypeID.[Name] AS [AIModelType],
    MJAIPrompt_ResultSelectorPromptID.[Name] AS [ResultSelectorPrompt]
FROM
    [${flyway:defaultSchema}].[AIPrompt] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Template] AS MJTemplate_TemplateID
  ON
    [a].[TemplateID] = MJTemplate_TemplateID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPromptCategory] AS MJAIPromptCategory_CategoryID
  ON
    [a].[CategoryID] = MJAIPromptCategory_CategoryID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIPromptType] AS MJAIPromptType_TypeID
  ON
    [a].[TypeID] = MJAIPromptType_TypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModelType] AS MJAIModelType_AIModelTypeID
  ON
    [a].[AIModelTypeID] = MJAIModelType_AIModelTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS MJAIPrompt_ResultSelectorPromptID
  ON
    [a].[ResultSelectorPromptID] = MJAIPrompt_ResultSelectorPromptID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIPrompts] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIPrompts] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIPrompts] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPrompts] TO [cdp_Integration], [cdp_UI], [cdp_Developer];

/* Base View Permissions SQL for MJ: AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompts
-- Item: Permissions for vwAIPrompts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIPrompts] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIPrompts] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIPrompts] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPrompts] TO [cdp_Integration], [cdp_UI], [cdp_Developer];

/* spCreate SQL for MJ: AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompts
-- Item: spCreateAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIPrompt
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIPrompt]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIPrompt];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIPrompt]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @TemplateID uniqueidentifier,
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @TypeID uniqueidentifier,
    @Status nvarchar(50),
    @ResponseFormat nvarchar(20) = NULL,
    @ModelSpecificResponseFormat_Clear bit = 0,
    @ModelSpecificResponseFormat nvarchar(MAX) = NULL,
    @AIModelTypeID_Clear bit = 0,
    @AIModelTypeID uniqueidentifier = NULL,
    @MinPowerRank_Clear bit = 0,
    @MinPowerRank int = NULL,
    @SelectionStrategy nvarchar(20) = NULL,
    @PowerPreference nvarchar(20) = NULL,
    @ParallelizationMode nvarchar(20) = NULL,
    @ParallelCount_Clear bit = 0,
    @ParallelCount int = NULL,
    @ParallelConfigParam_Clear bit = 0,
    @ParallelConfigParam nvarchar(100) = NULL,
    @OutputType nvarchar(50) = NULL,
    @OutputExample_Clear bit = 0,
    @OutputExample nvarchar(MAX) = NULL,
    @ValidationBehavior nvarchar(50) = NULL,
    @MaxRetries int = NULL,
    @RetryDelayMS int = NULL,
    @RetryStrategy nvarchar(20) = NULL,
    @ResultSelectorPromptID_Clear bit = 0,
    @ResultSelectorPromptID uniqueidentifier = NULL,
    @EnableCaching bit = NULL,
    @CacheTTLSeconds_Clear bit = 0,
    @CacheTTLSeconds int = NULL,
    @CacheMatchType nvarchar(20) = NULL,
    @CacheSimilarityThreshold_Clear bit = 0,
    @CacheSimilarityThreshold float(53) = NULL,
    @CacheMustMatchModel bit = NULL,
    @CacheMustMatchVendor bit = NULL,
    @CacheMustMatchAgent bit = NULL,
    @CacheMustMatchConfig bit = NULL,
    @PromptRole nvarchar(20) = NULL,
    @PromptPosition nvarchar(20) = NULL,
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
    @StopSequences nvarchar(1000) = NULL,
    @IncludeLogProbs_Clear bit = 0,
    @IncludeLogProbs bit = NULL,
    @TopLogProbs_Clear bit = 0,
    @TopLogProbs int = NULL,
    @FailoverStrategy nvarchar(50) = NULL,
    @FailoverMaxAttempts_Clear bit = 0,
    @FailoverMaxAttempts int = NULL,
    @FailoverDelaySeconds_Clear bit = 0,
    @FailoverDelaySeconds int = NULL,
    @FailoverModelStrategy nvarchar(50) = NULL,
    @FailoverErrorScope nvarchar(50) = NULL,
    @EffortLevel_Clear bit = 0,
    @EffortLevel int = NULL,
    @AssistantPrefill_Clear bit = 0,
    @AssistantPrefill nvarchar(MAX) = NULL,
    @PrefillFallbackMode nvarchar(20) = NULL,
    @RequireSpecificModels bit = NULL,
    @PromptConfiguration_Clear bit = 0,
    @PromptConfiguration nvarchar(MAX) = NULL,
    @TemplateDataCapture_Clear bit = 0,
    @TemplateDataCapture nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIPrompt]
            (
                [ID],
                [Name],
                [Description],
                [TemplateID],
                [CategoryID],
                [TypeID],
                [Status],
                [ResponseFormat],
                [ModelSpecificResponseFormat],
                [AIModelTypeID],
                [MinPowerRank],
                [SelectionStrategy],
                [PowerPreference],
                [ParallelizationMode],
                [ParallelCount],
                [ParallelConfigParam],
                [OutputType],
                [OutputExample],
                [ValidationBehavior],
                [MaxRetries],
                [RetryDelayMS],
                [RetryStrategy],
                [ResultSelectorPromptID],
                [EnableCaching],
                [CacheTTLSeconds],
                [CacheMatchType],
                [CacheSimilarityThreshold],
                [CacheMustMatchModel],
                [CacheMustMatchVendor],
                [CacheMustMatchAgent],
                [CacheMustMatchConfig],
                [PromptRole],
                [PromptPosition],
                [Temperature],
                [TopP],
                [TopK],
                [MinP],
                [FrequencyPenalty],
                [PresencePenalty],
                [Seed],
                [StopSequences],
                [IncludeLogProbs],
                [TopLogProbs],
                [FailoverStrategy],
                [FailoverMaxAttempts],
                [FailoverDelaySeconds],
                [FailoverModelStrategy],
                [FailoverErrorScope],
                [EffortLevel],
                [AssistantPrefill],
                [PrefillFallbackMode],
                [RequireSpecificModels],
                [PromptConfiguration],
                [TemplateDataCapture]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @TemplateID,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                @TypeID,
                @Status,
                ISNULL(@ResponseFormat, 'Any'),
                CASE WHEN @ModelSpecificResponseFormat_Clear = 1 THEN NULL ELSE ISNULL(@ModelSpecificResponseFormat, NULL) END,
                CASE WHEN @AIModelTypeID_Clear = 1 THEN NULL ELSE ISNULL(@AIModelTypeID, NULL) END,
                CASE WHEN @MinPowerRank_Clear = 1 THEN NULL ELSE ISNULL(@MinPowerRank, 0) END,
                ISNULL(@SelectionStrategy, 'Default'),
                ISNULL(@PowerPreference, 'Highest'),
                ISNULL(@ParallelizationMode, 'None'),
                CASE WHEN @ParallelCount_Clear = 1 THEN NULL ELSE ISNULL(@ParallelCount, NULL) END,
                CASE WHEN @ParallelConfigParam_Clear = 1 THEN NULL ELSE ISNULL(@ParallelConfigParam, NULL) END,
                ISNULL(@OutputType, 'string'),
                CASE WHEN @OutputExample_Clear = 1 THEN NULL ELSE ISNULL(@OutputExample, NULL) END,
                ISNULL(@ValidationBehavior, 'Warn'),
                ISNULL(@MaxRetries, 0),
                ISNULL(@RetryDelayMS, 0),
                ISNULL(@RetryStrategy, 'Fixed'),
                CASE WHEN @ResultSelectorPromptID_Clear = 1 THEN NULL ELSE ISNULL(@ResultSelectorPromptID, NULL) END,
                ISNULL(@EnableCaching, 0),
                CASE WHEN @CacheTTLSeconds_Clear = 1 THEN NULL ELSE ISNULL(@CacheTTLSeconds, NULL) END,
                ISNULL(@CacheMatchType, 'Exact'),
                CASE WHEN @CacheSimilarityThreshold_Clear = 1 THEN NULL ELSE ISNULL(@CacheSimilarityThreshold, NULL) END,
                ISNULL(@CacheMustMatchModel, 1),
                ISNULL(@CacheMustMatchVendor, 1),
                ISNULL(@CacheMustMatchAgent, 0),
                ISNULL(@CacheMustMatchConfig, 0),
                ISNULL(@PromptRole, 'System'),
                ISNULL(@PromptPosition, 'First'),
                CASE WHEN @Temperature_Clear = 1 THEN NULL ELSE ISNULL(@Temperature, NULL) END,
                CASE WHEN @TopP_Clear = 1 THEN NULL ELSE ISNULL(@TopP, NULL) END,
                CASE WHEN @TopK_Clear = 1 THEN NULL ELSE ISNULL(@TopK, NULL) END,
                CASE WHEN @MinP_Clear = 1 THEN NULL ELSE ISNULL(@MinP, NULL) END,
                CASE WHEN @FrequencyPenalty_Clear = 1 THEN NULL ELSE ISNULL(@FrequencyPenalty, NULL) END,
                CASE WHEN @PresencePenalty_Clear = 1 THEN NULL ELSE ISNULL(@PresencePenalty, NULL) END,
                CASE WHEN @Seed_Clear = 1 THEN NULL ELSE ISNULL(@Seed, NULL) END,
                CASE WHEN @StopSequences_Clear = 1 THEN NULL ELSE ISNULL(@StopSequences, NULL) END,
                CASE WHEN @IncludeLogProbs_Clear = 1 THEN NULL ELSE ISNULL(@IncludeLogProbs, 0) END,
                CASE WHEN @TopLogProbs_Clear = 1 THEN NULL ELSE ISNULL(@TopLogProbs, NULL) END,
                ISNULL(@FailoverStrategy, 'SameModelDifferentVendor'),
                CASE WHEN @FailoverMaxAttempts_Clear = 1 THEN NULL ELSE ISNULL(@FailoverMaxAttempts, 3) END,
                CASE WHEN @FailoverDelaySeconds_Clear = 1 THEN NULL ELSE ISNULL(@FailoverDelaySeconds, 5) END,
                ISNULL(@FailoverModelStrategy, 'PreferSameModel'),
                ISNULL(@FailoverErrorScope, 'All'),
                CASE WHEN @EffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@EffortLevel, NULL) END,
                CASE WHEN @AssistantPrefill_Clear = 1 THEN NULL ELSE ISNULL(@AssistantPrefill, NULL) END,
                ISNULL(@PrefillFallbackMode, 'Ignore'),
                ISNULL(@RequireSpecificModels, 0),
                CASE WHEN @PromptConfiguration_Clear = 1 THEN NULL ELSE ISNULL(@PromptConfiguration, NULL) END,
                CASE WHEN @TemplateDataCapture_Clear = 1 THEN NULL ELSE ISNULL(@TemplateDataCapture, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIPrompt]
            (
                [Name],
                [Description],
                [TemplateID],
                [CategoryID],
                [TypeID],
                [Status],
                [ResponseFormat],
                [ModelSpecificResponseFormat],
                [AIModelTypeID],
                [MinPowerRank],
                [SelectionStrategy],
                [PowerPreference],
                [ParallelizationMode],
                [ParallelCount],
                [ParallelConfigParam],
                [OutputType],
                [OutputExample],
                [ValidationBehavior],
                [MaxRetries],
                [RetryDelayMS],
                [RetryStrategy],
                [ResultSelectorPromptID],
                [EnableCaching],
                [CacheTTLSeconds],
                [CacheMatchType],
                [CacheSimilarityThreshold],
                [CacheMustMatchModel],
                [CacheMustMatchVendor],
                [CacheMustMatchAgent],
                [CacheMustMatchConfig],
                [PromptRole],
                [PromptPosition],
                [Temperature],
                [TopP],
                [TopK],
                [MinP],
                [FrequencyPenalty],
                [PresencePenalty],
                [Seed],
                [StopSequences],
                [IncludeLogProbs],
                [TopLogProbs],
                [FailoverStrategy],
                [FailoverMaxAttempts],
                [FailoverDelaySeconds],
                [FailoverModelStrategy],
                [FailoverErrorScope],
                [EffortLevel],
                [AssistantPrefill],
                [PrefillFallbackMode],
                [RequireSpecificModels],
                [PromptConfiguration],
                [TemplateDataCapture]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @TemplateID,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                @TypeID,
                @Status,
                ISNULL(@ResponseFormat, 'Any'),
                CASE WHEN @ModelSpecificResponseFormat_Clear = 1 THEN NULL ELSE ISNULL(@ModelSpecificResponseFormat, NULL) END,
                CASE WHEN @AIModelTypeID_Clear = 1 THEN NULL ELSE ISNULL(@AIModelTypeID, NULL) END,
                CASE WHEN @MinPowerRank_Clear = 1 THEN NULL ELSE ISNULL(@MinPowerRank, 0) END,
                ISNULL(@SelectionStrategy, 'Default'),
                ISNULL(@PowerPreference, 'Highest'),
                ISNULL(@ParallelizationMode, 'None'),
                CASE WHEN @ParallelCount_Clear = 1 THEN NULL ELSE ISNULL(@ParallelCount, NULL) END,
                CASE WHEN @ParallelConfigParam_Clear = 1 THEN NULL ELSE ISNULL(@ParallelConfigParam, NULL) END,
                ISNULL(@OutputType, 'string'),
                CASE WHEN @OutputExample_Clear = 1 THEN NULL ELSE ISNULL(@OutputExample, NULL) END,
                ISNULL(@ValidationBehavior, 'Warn'),
                ISNULL(@MaxRetries, 0),
                ISNULL(@RetryDelayMS, 0),
                ISNULL(@RetryStrategy, 'Fixed'),
                CASE WHEN @ResultSelectorPromptID_Clear = 1 THEN NULL ELSE ISNULL(@ResultSelectorPromptID, NULL) END,
                ISNULL(@EnableCaching, 0),
                CASE WHEN @CacheTTLSeconds_Clear = 1 THEN NULL ELSE ISNULL(@CacheTTLSeconds, NULL) END,
                ISNULL(@CacheMatchType, 'Exact'),
                CASE WHEN @CacheSimilarityThreshold_Clear = 1 THEN NULL ELSE ISNULL(@CacheSimilarityThreshold, NULL) END,
                ISNULL(@CacheMustMatchModel, 1),
                ISNULL(@CacheMustMatchVendor, 1),
                ISNULL(@CacheMustMatchAgent, 0),
                ISNULL(@CacheMustMatchConfig, 0),
                ISNULL(@PromptRole, 'System'),
                ISNULL(@PromptPosition, 'First'),
                CASE WHEN @Temperature_Clear = 1 THEN NULL ELSE ISNULL(@Temperature, NULL) END,
                CASE WHEN @TopP_Clear = 1 THEN NULL ELSE ISNULL(@TopP, NULL) END,
                CASE WHEN @TopK_Clear = 1 THEN NULL ELSE ISNULL(@TopK, NULL) END,
                CASE WHEN @MinP_Clear = 1 THEN NULL ELSE ISNULL(@MinP, NULL) END,
                CASE WHEN @FrequencyPenalty_Clear = 1 THEN NULL ELSE ISNULL(@FrequencyPenalty, NULL) END,
                CASE WHEN @PresencePenalty_Clear = 1 THEN NULL ELSE ISNULL(@PresencePenalty, NULL) END,
                CASE WHEN @Seed_Clear = 1 THEN NULL ELSE ISNULL(@Seed, NULL) END,
                CASE WHEN @StopSequences_Clear = 1 THEN NULL ELSE ISNULL(@StopSequences, NULL) END,
                CASE WHEN @IncludeLogProbs_Clear = 1 THEN NULL ELSE ISNULL(@IncludeLogProbs, 0) END,
                CASE WHEN @TopLogProbs_Clear = 1 THEN NULL ELSE ISNULL(@TopLogProbs, NULL) END,
                ISNULL(@FailoverStrategy, 'SameModelDifferentVendor'),
                CASE WHEN @FailoverMaxAttempts_Clear = 1 THEN NULL ELSE ISNULL(@FailoverMaxAttempts, 3) END,
                CASE WHEN @FailoverDelaySeconds_Clear = 1 THEN NULL ELSE ISNULL(@FailoverDelaySeconds, 5) END,
                ISNULL(@FailoverModelStrategy, 'PreferSameModel'),
                ISNULL(@FailoverErrorScope, 'All'),
                CASE WHEN @EffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@EffortLevel, NULL) END,
                CASE WHEN @AssistantPrefill_Clear = 1 THEN NULL ELSE ISNULL(@AssistantPrefill, NULL) END,
                ISNULL(@PrefillFallbackMode, 'Ignore'),
                ISNULL(@RequireSpecificModels, 0),
                CASE WHEN @PromptConfiguration_Clear = 1 THEN NULL ELSE ISNULL(@PromptConfiguration, NULL) END,
                CASE WHEN @TemplateDataCapture_Clear = 1 THEN NULL ELSE ISNULL(@TemplateDataCapture, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIPrompts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPrompt] FROM [cdp_Developer]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPrompt] TO [cdp_Developer];

/* spCreate Permissions for MJ: AI Prompts */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPrompt] FROM [cdp_Developer]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPrompt] TO [cdp_Developer];

/* spUpdate SQL for MJ: AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompts
-- Item: spUpdateAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIPrompt
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIPrompt]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPrompt];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPrompt]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @TemplateID uniqueidentifier = NULL,
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @TypeID uniqueidentifier = NULL,
    @Status nvarchar(50) = NULL,
    @ResponseFormat nvarchar(20) = NULL,
    @ModelSpecificResponseFormat_Clear bit = 0,
    @ModelSpecificResponseFormat nvarchar(MAX) = NULL,
    @AIModelTypeID_Clear bit = 0,
    @AIModelTypeID uniqueidentifier = NULL,
    @MinPowerRank_Clear bit = 0,
    @MinPowerRank int = NULL,
    @SelectionStrategy nvarchar(20) = NULL,
    @PowerPreference nvarchar(20) = NULL,
    @ParallelizationMode nvarchar(20) = NULL,
    @ParallelCount_Clear bit = 0,
    @ParallelCount int = NULL,
    @ParallelConfigParam_Clear bit = 0,
    @ParallelConfigParam nvarchar(100) = NULL,
    @OutputType nvarchar(50) = NULL,
    @OutputExample_Clear bit = 0,
    @OutputExample nvarchar(MAX) = NULL,
    @ValidationBehavior nvarchar(50) = NULL,
    @MaxRetries int = NULL,
    @RetryDelayMS int = NULL,
    @RetryStrategy nvarchar(20) = NULL,
    @ResultSelectorPromptID_Clear bit = 0,
    @ResultSelectorPromptID uniqueidentifier = NULL,
    @EnableCaching bit = NULL,
    @CacheTTLSeconds_Clear bit = 0,
    @CacheTTLSeconds int = NULL,
    @CacheMatchType nvarchar(20) = NULL,
    @CacheSimilarityThreshold_Clear bit = 0,
    @CacheSimilarityThreshold float(53) = NULL,
    @CacheMustMatchModel bit = NULL,
    @CacheMustMatchVendor bit = NULL,
    @CacheMustMatchAgent bit = NULL,
    @CacheMustMatchConfig bit = NULL,
    @PromptRole nvarchar(20) = NULL,
    @PromptPosition nvarchar(20) = NULL,
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
    @StopSequences nvarchar(1000) = NULL,
    @IncludeLogProbs_Clear bit = 0,
    @IncludeLogProbs bit = NULL,
    @TopLogProbs_Clear bit = 0,
    @TopLogProbs int = NULL,
    @FailoverStrategy nvarchar(50) = NULL,
    @FailoverMaxAttempts_Clear bit = 0,
    @FailoverMaxAttempts int = NULL,
    @FailoverDelaySeconds_Clear bit = 0,
    @FailoverDelaySeconds int = NULL,
    @FailoverModelStrategy nvarchar(50) = NULL,
    @FailoverErrorScope nvarchar(50) = NULL,
    @EffortLevel_Clear bit = 0,
    @EffortLevel int = NULL,
    @AssistantPrefill_Clear bit = 0,
    @AssistantPrefill nvarchar(MAX) = NULL,
    @PrefillFallbackMode nvarchar(20) = NULL,
    @RequireSpecificModels bit = NULL,
    @PromptConfiguration_Clear bit = 0,
    @PromptConfiguration nvarchar(MAX) = NULL,
    @TemplateDataCapture_Clear bit = 0,
    @TemplateDataCapture nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPrompt]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [TemplateID] = ISNULL(@TemplateID, [TemplateID]),
        [CategoryID] = CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, [CategoryID]) END,
        [TypeID] = ISNULL(@TypeID, [TypeID]),
        [Status] = ISNULL(@Status, [Status]),
        [ResponseFormat] = ISNULL(@ResponseFormat, [ResponseFormat]),
        [ModelSpecificResponseFormat] = CASE WHEN @ModelSpecificResponseFormat_Clear = 1 THEN NULL ELSE ISNULL(@ModelSpecificResponseFormat, [ModelSpecificResponseFormat]) END,
        [AIModelTypeID] = CASE WHEN @AIModelTypeID_Clear = 1 THEN NULL ELSE ISNULL(@AIModelTypeID, [AIModelTypeID]) END,
        [MinPowerRank] = CASE WHEN @MinPowerRank_Clear = 1 THEN NULL ELSE ISNULL(@MinPowerRank, [MinPowerRank]) END,
        [SelectionStrategy] = ISNULL(@SelectionStrategy, [SelectionStrategy]),
        [PowerPreference] = ISNULL(@PowerPreference, [PowerPreference]),
        [ParallelizationMode] = ISNULL(@ParallelizationMode, [ParallelizationMode]),
        [ParallelCount] = CASE WHEN @ParallelCount_Clear = 1 THEN NULL ELSE ISNULL(@ParallelCount, [ParallelCount]) END,
        [ParallelConfigParam] = CASE WHEN @ParallelConfigParam_Clear = 1 THEN NULL ELSE ISNULL(@ParallelConfigParam, [ParallelConfigParam]) END,
        [OutputType] = ISNULL(@OutputType, [OutputType]),
        [OutputExample] = CASE WHEN @OutputExample_Clear = 1 THEN NULL ELSE ISNULL(@OutputExample, [OutputExample]) END,
        [ValidationBehavior] = ISNULL(@ValidationBehavior, [ValidationBehavior]),
        [MaxRetries] = ISNULL(@MaxRetries, [MaxRetries]),
        [RetryDelayMS] = ISNULL(@RetryDelayMS, [RetryDelayMS]),
        [RetryStrategy] = ISNULL(@RetryStrategy, [RetryStrategy]),
        [ResultSelectorPromptID] = CASE WHEN @ResultSelectorPromptID_Clear = 1 THEN NULL ELSE ISNULL(@ResultSelectorPromptID, [ResultSelectorPromptID]) END,
        [EnableCaching] = ISNULL(@EnableCaching, [EnableCaching]),
        [CacheTTLSeconds] = CASE WHEN @CacheTTLSeconds_Clear = 1 THEN NULL ELSE ISNULL(@CacheTTLSeconds, [CacheTTLSeconds]) END,
        [CacheMatchType] = ISNULL(@CacheMatchType, [CacheMatchType]),
        [CacheSimilarityThreshold] = CASE WHEN @CacheSimilarityThreshold_Clear = 1 THEN NULL ELSE ISNULL(@CacheSimilarityThreshold, [CacheSimilarityThreshold]) END,
        [CacheMustMatchModel] = ISNULL(@CacheMustMatchModel, [CacheMustMatchModel]),
        [CacheMustMatchVendor] = ISNULL(@CacheMustMatchVendor, [CacheMustMatchVendor]),
        [CacheMustMatchAgent] = ISNULL(@CacheMustMatchAgent, [CacheMustMatchAgent]),
        [CacheMustMatchConfig] = ISNULL(@CacheMustMatchConfig, [CacheMustMatchConfig]),
        [PromptRole] = ISNULL(@PromptRole, [PromptRole]),
        [PromptPosition] = ISNULL(@PromptPosition, [PromptPosition]),
        [Temperature] = CASE WHEN @Temperature_Clear = 1 THEN NULL ELSE ISNULL(@Temperature, [Temperature]) END,
        [TopP] = CASE WHEN @TopP_Clear = 1 THEN NULL ELSE ISNULL(@TopP, [TopP]) END,
        [TopK] = CASE WHEN @TopK_Clear = 1 THEN NULL ELSE ISNULL(@TopK, [TopK]) END,
        [MinP] = CASE WHEN @MinP_Clear = 1 THEN NULL ELSE ISNULL(@MinP, [MinP]) END,
        [FrequencyPenalty] = CASE WHEN @FrequencyPenalty_Clear = 1 THEN NULL ELSE ISNULL(@FrequencyPenalty, [FrequencyPenalty]) END,
        [PresencePenalty] = CASE WHEN @PresencePenalty_Clear = 1 THEN NULL ELSE ISNULL(@PresencePenalty, [PresencePenalty]) END,
        [Seed] = CASE WHEN @Seed_Clear = 1 THEN NULL ELSE ISNULL(@Seed, [Seed]) END,
        [StopSequences] = CASE WHEN @StopSequences_Clear = 1 THEN NULL ELSE ISNULL(@StopSequences, [StopSequences]) END,
        [IncludeLogProbs] = CASE WHEN @IncludeLogProbs_Clear = 1 THEN NULL ELSE ISNULL(@IncludeLogProbs, [IncludeLogProbs]) END,
        [TopLogProbs] = CASE WHEN @TopLogProbs_Clear = 1 THEN NULL ELSE ISNULL(@TopLogProbs, [TopLogProbs]) END,
        [FailoverStrategy] = ISNULL(@FailoverStrategy, [FailoverStrategy]),
        [FailoverMaxAttempts] = CASE WHEN @FailoverMaxAttempts_Clear = 1 THEN NULL ELSE ISNULL(@FailoverMaxAttempts, [FailoverMaxAttempts]) END,
        [FailoverDelaySeconds] = CASE WHEN @FailoverDelaySeconds_Clear = 1 THEN NULL ELSE ISNULL(@FailoverDelaySeconds, [FailoverDelaySeconds]) END,
        [FailoverModelStrategy] = ISNULL(@FailoverModelStrategy, [FailoverModelStrategy]),
        [FailoverErrorScope] = ISNULL(@FailoverErrorScope, [FailoverErrorScope]),
        [EffortLevel] = CASE WHEN @EffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@EffortLevel, [EffortLevel]) END,
        [AssistantPrefill] = CASE WHEN @AssistantPrefill_Clear = 1 THEN NULL ELSE ISNULL(@AssistantPrefill, [AssistantPrefill]) END,
        [PrefillFallbackMode] = ISNULL(@PrefillFallbackMode, [PrefillFallbackMode]),
        [RequireSpecificModels] = ISNULL(@RequireSpecificModels, [RequireSpecificModels]),
        [PromptConfiguration] = CASE WHEN @PromptConfiguration_Clear = 1 THEN NULL ELSE ISNULL(@PromptConfiguration, [PromptConfiguration]) END,
        [TemplateDataCapture] = CASE WHEN @TemplateDataCapture_Clear = 1 THEN NULL ELSE ISNULL(@TemplateDataCapture, [TemplateDataCapture]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIPrompts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIPrompts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPrompt] FROM [cdp_Developer]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPrompt] TO [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPrompt table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIPrompt]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIPrompt];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIPrompt
ON [${flyway:defaultSchema}].[AIPrompt]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPrompt]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIPrompt] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Prompts */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPrompt] FROM [cdp_Developer]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPrompt] TO [cdp_Developer];

/* spDelete SQL for MJ: AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompts
-- Item: spDeleteAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPrompt
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIPrompt]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPrompt];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPrompt]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction
    DECLARE @MJAIAgentActions_CompactPromptIDID uniqueidentifier
    DECLARE @MJAIAgentActions_CompactPromptID_AgentID uniqueidentifier
    DECLARE @MJAIAgentActions_CompactPromptID_ActionID uniqueidentifier
    DECLARE @MJAIAgentActions_CompactPromptID_Status nvarchar(15)
    DECLARE @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun int
    DECLARE @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun int
    DECLARE @MJAIAgentActions_CompactPromptID_ResultExpirationTurns int
    DECLARE @MJAIAgentActions_CompactPromptID_ResultExpirationMode nvarchar(20)
    DECLARE @MJAIAgentActions_CompactPromptID_CompactMode nvarchar(20)
    DECLARE @MJAIAgentActions_CompactPromptID_CompactLength int
    DECLARE @MJAIAgentActions_CompactPromptID_CompactPromptID uniqueidentifier
    DECLARE @MJAIAgentActions_CompactPromptID_DeclareAsNativeTool bit
    DECLARE cascade_update_MJAIAgentActions_CompactPromptID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ActionID], [Status], [MinExecutionsPerRun], [MaxExecutionsPerRun], [ResultExpirationTurns], [ResultExpirationMode], [CompactMode], [CompactLength], [CompactPromptID], [DeclareAsNativeTool]
        FROM [${flyway:defaultSchema}].[AIAgentAction]
        WHERE [CompactPromptID] = @ID

    OPEN cascade_update_MJAIAgentActions_CompactPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentActions_CompactPromptID_cursor INTO @MJAIAgentActions_CompactPromptIDID, @MJAIAgentActions_CompactPromptID_AgentID, @MJAIAgentActions_CompactPromptID_ActionID, @MJAIAgentActions_CompactPromptID_Status, @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, @MJAIAgentActions_CompactPromptID_ResultExpirationTurns, @MJAIAgentActions_CompactPromptID_ResultExpirationMode, @MJAIAgentActions_CompactPromptID_CompactMode, @MJAIAgentActions_CompactPromptID_CompactLength, @MJAIAgentActions_CompactPromptID_CompactPromptID, @MJAIAgentActions_CompactPromptID_DeclareAsNativeTool

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentActions_CompactPromptID_CompactPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentAction] @ID = @MJAIAgentActions_CompactPromptIDID, @AgentID = @MJAIAgentActions_CompactPromptID_AgentID, @ActionID = @MJAIAgentActions_CompactPromptID_ActionID, @Status = @MJAIAgentActions_CompactPromptID_Status, @MinExecutionsPerRun = @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, @ResultExpirationTurns = @MJAIAgentActions_CompactPromptID_ResultExpirationTurns, @ResultExpirationMode = @MJAIAgentActions_CompactPromptID_ResultExpirationMode, @CompactMode = @MJAIAgentActions_CompactPromptID_CompactMode, @CompactLength = @MJAIAgentActions_CompactPromptID_CompactLength, @CompactPromptID_Clear = 1, @CompactPromptID = @MJAIAgentActions_CompactPromptID_CompactPromptID, @DeclareAsNativeTool = @MJAIAgentActions_CompactPromptID_DeclareAsNativeTool

        FETCH NEXT FROM cascade_update_MJAIAgentActions_CompactPromptID_cursor INTO @MJAIAgentActions_CompactPromptIDID, @MJAIAgentActions_CompactPromptID_AgentID, @MJAIAgentActions_CompactPromptID_ActionID, @MJAIAgentActions_CompactPromptID_Status, @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, @MJAIAgentActions_CompactPromptID_ResultExpirationTurns, @MJAIAgentActions_CompactPromptID_ResultExpirationMode, @MJAIAgentActions_CompactPromptID_CompactMode, @MJAIAgentActions_CompactPromptID_CompactLength, @MJAIAgentActions_CompactPromptID_CompactPromptID, @MJAIAgentActions_CompactPromptID_DeclareAsNativeTool
    END

    CLOSE cascade_update_MJAIAgentActions_CompactPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentActions_CompactPromptID_cursor
    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt
    DECLARE @MJAIAgentPrompts_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPrompts_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPrompt]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJAIAgentPrompts_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_PromptID_cursor INTO @MJAIAgentPrompts_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPrompt] @ID = @MJAIAgentPrompts_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_PromptID_cursor INTO @MJAIAgentPrompts_PromptIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPrompts_PromptID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPrompts_PromptID_cursor
    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep
    DECLARE @MJAIAgentSteps_PromptIDID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_AgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_Name nvarchar(255)
    DECLARE @MJAIAgentSteps_PromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgentSteps_PromptID_StepType nvarchar(20)
    DECLARE @MJAIAgentSteps_PromptID_StartingStep bit
    DECLARE @MJAIAgentSteps_PromptID_TimeoutSeconds int
    DECLARE @MJAIAgentSteps_PromptID_RetryCount int
    DECLARE @MJAIAgentSteps_PromptID_OnErrorBehavior nvarchar(20)
    DECLARE @MJAIAgentSteps_PromptID_ActionID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_SubAgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_PromptID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_ActionOutputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_PromptID_PositionX int
    DECLARE @MJAIAgentSteps_PromptID_PositionY int
    DECLARE @MJAIAgentSteps_PromptID_Width int
    DECLARE @MJAIAgentSteps_PromptID_Height int
    DECLARE @MJAIAgentSteps_PromptID_Status nvarchar(20)
    DECLARE @MJAIAgentSteps_PromptID_ActionInputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_PromptID_LoopBodyType nvarchar(50)
    DECLARE @MJAIAgentSteps_PromptID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentSteps_PromptID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [Name], [Description], [StepType], [StartingStep], [TimeoutSeconds], [RetryCount], [OnErrorBehavior], [ActionID], [SubAgentID], [PromptID], [ActionOutputMapping], [PositionX], [PositionY], [Width], [Height], [Status], [ActionInputMapping], [LoopBodyType], [Configuration]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [PromptID] = @ID

    OPEN cascade_update_MJAIAgentSteps_PromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentSteps_PromptID_cursor INTO @MJAIAgentSteps_PromptIDID, @MJAIAgentSteps_PromptID_AgentID, @MJAIAgentSteps_PromptID_Name, @MJAIAgentSteps_PromptID_Description, @MJAIAgentSteps_PromptID_StepType, @MJAIAgentSteps_PromptID_StartingStep, @MJAIAgentSteps_PromptID_TimeoutSeconds, @MJAIAgentSteps_PromptID_RetryCount, @MJAIAgentSteps_PromptID_OnErrorBehavior, @MJAIAgentSteps_PromptID_ActionID, @MJAIAgentSteps_PromptID_SubAgentID, @MJAIAgentSteps_PromptID_PromptID, @MJAIAgentSteps_PromptID_ActionOutputMapping, @MJAIAgentSteps_PromptID_PositionX, @MJAIAgentSteps_PromptID_PositionY, @MJAIAgentSteps_PromptID_Width, @MJAIAgentSteps_PromptID_Height, @MJAIAgentSteps_PromptID_Status, @MJAIAgentSteps_PromptID_ActionInputMapping, @MJAIAgentSteps_PromptID_LoopBodyType, @MJAIAgentSteps_PromptID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentSteps_PromptID_PromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentStep] @ID = @MJAIAgentSteps_PromptIDID, @AgentID = @MJAIAgentSteps_PromptID_AgentID, @Name = @MJAIAgentSteps_PromptID_Name, @Description = @MJAIAgentSteps_PromptID_Description, @StepType = @MJAIAgentSteps_PromptID_StepType, @StartingStep = @MJAIAgentSteps_PromptID_StartingStep, @TimeoutSeconds = @MJAIAgentSteps_PromptID_TimeoutSeconds, @RetryCount = @MJAIAgentSteps_PromptID_RetryCount, @OnErrorBehavior = @MJAIAgentSteps_PromptID_OnErrorBehavior, @ActionID = @MJAIAgentSteps_PromptID_ActionID, @SubAgentID = @MJAIAgentSteps_PromptID_SubAgentID, @PromptID_Clear = 1, @PromptID = @MJAIAgentSteps_PromptID_PromptID, @ActionOutputMapping = @MJAIAgentSteps_PromptID_ActionOutputMapping, @PositionX = @MJAIAgentSteps_PromptID_PositionX, @PositionY = @MJAIAgentSteps_PromptID_PositionY, @Width = @MJAIAgentSteps_PromptID_Width, @Height = @MJAIAgentSteps_PromptID_Height, @Status = @MJAIAgentSteps_PromptID_Status, @ActionInputMapping = @MJAIAgentSteps_PromptID_ActionInputMapping, @LoopBodyType = @MJAIAgentSteps_PromptID_LoopBodyType, @Configuration = @MJAIAgentSteps_PromptID_Configuration

        FETCH NEXT FROM cascade_update_MJAIAgentSteps_PromptID_cursor INTO @MJAIAgentSteps_PromptIDID, @MJAIAgentSteps_PromptID_AgentID, @MJAIAgentSteps_PromptID_Name, @MJAIAgentSteps_PromptID_Description, @MJAIAgentSteps_PromptID_StepType, @MJAIAgentSteps_PromptID_StartingStep, @MJAIAgentSteps_PromptID_TimeoutSeconds, @MJAIAgentSteps_PromptID_RetryCount, @MJAIAgentSteps_PromptID_OnErrorBehavior, @MJAIAgentSteps_PromptID_ActionID, @MJAIAgentSteps_PromptID_SubAgentID, @MJAIAgentSteps_PromptID_PromptID, @MJAIAgentSteps_PromptID_ActionOutputMapping, @MJAIAgentSteps_PromptID_PositionX, @MJAIAgentSteps_PromptID_PositionY, @MJAIAgentSteps_PromptID_Width, @MJAIAgentSteps_PromptID_Height, @MJAIAgentSteps_PromptID_Status, @MJAIAgentSteps_PromptID_ActionInputMapping, @MJAIAgentSteps_PromptID_LoopBodyType, @MJAIAgentSteps_PromptID_Configuration
    END

    CLOSE cascade_update_MJAIAgentSteps_PromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentSteps_PromptID_cursor
    
    -- Cascade update on AIAgentType using cursor to call spUpdateAIAgentType
    DECLARE @MJAIAgentTypes_SystemPromptIDID uniqueidentifier
    DECLARE @MJAIAgentTypes_SystemPromptID_Name nvarchar(100)
    DECLARE @MJAIAgentTypes_SystemPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_SystemPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_SystemPromptID_IsActive bit
    DECLARE @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder nvarchar(255)
    DECLARE @MJAIAgentTypes_SystemPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgentTypes_SystemPromptID_UIFormSectionKey nvarchar(500)
    DECLARE @MJAIAgentTypes_SystemPromptID_UIFormKey nvarchar(500)
    DECLARE @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault bit
    DECLARE @MJAIAgentTypes_SystemPromptID_PromptParamsSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_AssignmentStrategy nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgentTypes_SystemPromptID_ConfigSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_DefaultConfiguration nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgentTypes_SystemPromptID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgentTypes_SystemPromptID_ContextWindowMaxTokens int
    DECLARE @MJAIAgentTypes_SystemPromptID_CompactionTriggerPercent int
    DECLARE @MJAIAgentTypes_SystemPromptID_CompactionTargetPercent int
    DECLARE @MJAIAgentTypes_SystemPromptID_ConversationSummaryPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgentTypes_SystemPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [SystemPromptID], [IsActive], [AgentPromptPlaceholder], [DriverClass], [UIFormSectionKey], [UIFormKey], [UIFormSectionExpandedByDefault], [PromptParamsSchema], [AssignmentStrategy], [DefaultStorageAccountID], [ConfigSchema], [DefaultConfiguration], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID]
        FROM [${flyway:defaultSchema}].[AIAgentType]
        WHERE [SystemPromptID] = @ID

    OPEN cascade_update_MJAIAgentTypes_SystemPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentTypes_SystemPromptID_cursor INTO @MJAIAgentTypes_SystemPromptIDID, @MJAIAgentTypes_SystemPromptID_Name, @MJAIAgentTypes_SystemPromptID_Description, @MJAIAgentTypes_SystemPromptID_SystemPromptID, @MJAIAgentTypes_SystemPromptID_IsActive, @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_SystemPromptID_DriverClass, @MJAIAgentTypes_SystemPromptID_UIFormSectionKey, @MJAIAgentTypes_SystemPromptID_UIFormKey, @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_SystemPromptID_PromptParamsSchema, @MJAIAgentTypes_SystemPromptID_AssignmentStrategy, @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID, @MJAIAgentTypes_SystemPromptID_ConfigSchema, @MJAIAgentTypes_SystemPromptID_DefaultConfiguration, @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageThreshold, @MJAIAgentTypes_SystemPromptID_ContextCompressionPromptID, @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageRetentionCount, @MJAIAgentTypes_SystemPromptID_ContextWindowMaxTokens, @MJAIAgentTypes_SystemPromptID_CompactionTriggerPercent, @MJAIAgentTypes_SystemPromptID_CompactionTargetPercent, @MJAIAgentTypes_SystemPromptID_ConversationSummaryPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentTypes_SystemPromptID_SystemPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentType] @ID = @MJAIAgentTypes_SystemPromptIDID, @Name = @MJAIAgentTypes_SystemPromptID_Name, @Description = @MJAIAgentTypes_SystemPromptID_Description, @SystemPromptID_Clear = 1, @SystemPromptID = @MJAIAgentTypes_SystemPromptID_SystemPromptID, @IsActive = @MJAIAgentTypes_SystemPromptID_IsActive, @AgentPromptPlaceholder = @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, @DriverClass = @MJAIAgentTypes_SystemPromptID_DriverClass, @UIFormSectionKey = @MJAIAgentTypes_SystemPromptID_UIFormSectionKey, @UIFormKey = @MJAIAgentTypes_SystemPromptID_UIFormKey, @UIFormSectionExpandedByDefault = @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, @PromptParamsSchema = @MJAIAgentTypes_SystemPromptID_PromptParamsSchema, @AssignmentStrategy = @MJAIAgentTypes_SystemPromptID_AssignmentStrategy, @DefaultStorageAccountID = @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID, @ConfigSchema = @MJAIAgentTypes_SystemPromptID_ConfigSchema, @DefaultConfiguration = @MJAIAgentTypes_SystemPromptID_DefaultConfiguration, @ContextCompressionMessageThreshold = @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgentTypes_SystemPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageRetentionCount, @ContextWindowMaxTokens = @MJAIAgentTypes_SystemPromptID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgentTypes_SystemPromptID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgentTypes_SystemPromptID_CompactionTargetPercent, @ConversationSummaryPromptID = @MJAIAgentTypes_SystemPromptID_ConversationSummaryPromptID

        FETCH NEXT FROM cascade_update_MJAIAgentTypes_SystemPromptID_cursor INTO @MJAIAgentTypes_SystemPromptIDID, @MJAIAgentTypes_SystemPromptID_Name, @MJAIAgentTypes_SystemPromptID_Description, @MJAIAgentTypes_SystemPromptID_SystemPromptID, @MJAIAgentTypes_SystemPromptID_IsActive, @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_SystemPromptID_DriverClass, @MJAIAgentTypes_SystemPromptID_UIFormSectionKey, @MJAIAgentTypes_SystemPromptID_UIFormKey, @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_SystemPromptID_PromptParamsSchema, @MJAIAgentTypes_SystemPromptID_AssignmentStrategy, @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID, @MJAIAgentTypes_SystemPromptID_ConfigSchema, @MJAIAgentTypes_SystemPromptID_DefaultConfiguration, @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageThreshold, @MJAIAgentTypes_SystemPromptID_ContextCompressionPromptID, @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageRetentionCount, @MJAIAgentTypes_SystemPromptID_ContextWindowMaxTokens, @MJAIAgentTypes_SystemPromptID_CompactionTriggerPercent, @MJAIAgentTypes_SystemPromptID_CompactionTargetPercent, @MJAIAgentTypes_SystemPromptID_ConversationSummaryPromptID
    END

    CLOSE cascade_update_MJAIAgentTypes_SystemPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentTypes_SystemPromptID_cursor
    
    -- Cascade update on AIAgentType using cursor to call spUpdateAIAgentType
    DECLARE @MJAIAgentTypes_ContextCompressionPromptIDID uniqueidentifier
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_Name nvarchar(100)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_SystemPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_IsActive bit
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_AgentPromptPlaceholder nvarchar(255)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionKey nvarchar(500)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_UIFormKey nvarchar(500)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionExpandedByDefault bit
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_PromptParamsSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_AssignmentStrategy nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_ConfigSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_DefaultConfiguration nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_ContextWindowMaxTokens int
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_CompactionTriggerPercent int
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_CompactionTargetPercent int
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_ConversationSummaryPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgentTypes_ContextCompressionPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [SystemPromptID], [IsActive], [AgentPromptPlaceholder], [DriverClass], [UIFormSectionKey], [UIFormKey], [UIFormSectionExpandedByDefault], [PromptParamsSchema], [AssignmentStrategy], [DefaultStorageAccountID], [ConfigSchema], [DefaultConfiguration], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID]
        FROM [${flyway:defaultSchema}].[AIAgentType]
        WHERE [ContextCompressionPromptID] = @ID

    OPEN cascade_update_MJAIAgentTypes_ContextCompressionPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentTypes_ContextCompressionPromptID_cursor INTO @MJAIAgentTypes_ContextCompressionPromptIDID, @MJAIAgentTypes_ContextCompressionPromptID_Name, @MJAIAgentTypes_ContextCompressionPromptID_Description, @MJAIAgentTypes_ContextCompressionPromptID_SystemPromptID, @MJAIAgentTypes_ContextCompressionPromptID_IsActive, @MJAIAgentTypes_ContextCompressionPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_ContextCompressionPromptID_DriverClass, @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionKey, @MJAIAgentTypes_ContextCompressionPromptID_UIFormKey, @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_ContextCompressionPromptID_PromptParamsSchema, @MJAIAgentTypes_ContextCompressionPromptID_AssignmentStrategy, @MJAIAgentTypes_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgentTypes_ContextCompressionPromptID_ConfigSchema, @MJAIAgentTypes_ContextCompressionPromptID_DefaultConfiguration, @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgentTypes_ContextCompressionPromptID_ContextWindowMaxTokens, @MJAIAgentTypes_ContextCompressionPromptID_CompactionTriggerPercent, @MJAIAgentTypes_ContextCompressionPromptID_CompactionTargetPercent, @MJAIAgentTypes_ContextCompressionPromptID_ConversationSummaryPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentType] @ID = @MJAIAgentTypes_ContextCompressionPromptIDID, @Name = @MJAIAgentTypes_ContextCompressionPromptID_Name, @Description = @MJAIAgentTypes_ContextCompressionPromptID_Description, @SystemPromptID = @MJAIAgentTypes_ContextCompressionPromptID_SystemPromptID, @IsActive = @MJAIAgentTypes_ContextCompressionPromptID_IsActive, @AgentPromptPlaceholder = @MJAIAgentTypes_ContextCompressionPromptID_AgentPromptPlaceholder, @DriverClass = @MJAIAgentTypes_ContextCompressionPromptID_DriverClass, @UIFormSectionKey = @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionKey, @UIFormKey = @MJAIAgentTypes_ContextCompressionPromptID_UIFormKey, @UIFormSectionExpandedByDefault = @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionExpandedByDefault, @PromptParamsSchema = @MJAIAgentTypes_ContextCompressionPromptID_PromptParamsSchema, @AssignmentStrategy = @MJAIAgentTypes_ContextCompressionPromptID_AssignmentStrategy, @DefaultStorageAccountID = @MJAIAgentTypes_ContextCompressionPromptID_DefaultStorageAccountID, @ConfigSchema = @MJAIAgentTypes_ContextCompressionPromptID_ConfigSchema, @DefaultConfiguration = @MJAIAgentTypes_ContextCompressionPromptID_DefaultConfiguration, @ContextCompressionMessageThreshold = @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID_Clear = 1, @ContextCompressionPromptID = @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @ContextWindowMaxTokens = @MJAIAgentTypes_ContextCompressionPromptID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgentTypes_ContextCompressionPromptID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgentTypes_ContextCompressionPromptID_CompactionTargetPercent, @ConversationSummaryPromptID = @MJAIAgentTypes_ContextCompressionPromptID_ConversationSummaryPromptID

        FETCH NEXT FROM cascade_update_MJAIAgentTypes_ContextCompressionPromptID_cursor INTO @MJAIAgentTypes_ContextCompressionPromptIDID, @MJAIAgentTypes_ContextCompressionPromptID_Name, @MJAIAgentTypes_ContextCompressionPromptID_Description, @MJAIAgentTypes_ContextCompressionPromptID_SystemPromptID, @MJAIAgentTypes_ContextCompressionPromptID_IsActive, @MJAIAgentTypes_ContextCompressionPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_ContextCompressionPromptID_DriverClass, @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionKey, @MJAIAgentTypes_ContextCompressionPromptID_UIFormKey, @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_ContextCompressionPromptID_PromptParamsSchema, @MJAIAgentTypes_ContextCompressionPromptID_AssignmentStrategy, @MJAIAgentTypes_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgentTypes_ContextCompressionPromptID_ConfigSchema, @MJAIAgentTypes_ContextCompressionPromptID_DefaultConfiguration, @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgentTypes_ContextCompressionPromptID_ContextWindowMaxTokens, @MJAIAgentTypes_ContextCompressionPromptID_CompactionTriggerPercent, @MJAIAgentTypes_ContextCompressionPromptID_CompactionTargetPercent, @MJAIAgentTypes_ContextCompressionPromptID_ConversationSummaryPromptID
    END

    CLOSE cascade_update_MJAIAgentTypes_ContextCompressionPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentTypes_ContextCompressionPromptID_cursor
    
    -- Cascade update on AIAgentType using cursor to call spUpdateAIAgentType
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptIDID uniqueidentifier
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_Name nvarchar(100)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_SystemPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_IsActive bit
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_AgentPromptPlaceholder nvarchar(255)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionKey nvarchar(500)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_UIFormKey nvarchar(500)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionExpandedByDefault bit
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_PromptParamsSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_AssignmentStrategy nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_ConfigSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_DefaultConfiguration nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_ContextWindowMaxTokens int
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTriggerPercent int
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTargetPercent int
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_ConversationSummaryPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgentTypes_ConversationSummaryPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [SystemPromptID], [IsActive], [AgentPromptPlaceholder], [DriverClass], [UIFormSectionKey], [UIFormKey], [UIFormSectionExpandedByDefault], [PromptParamsSchema], [AssignmentStrategy], [DefaultStorageAccountID], [ConfigSchema], [DefaultConfiguration], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID]
        FROM [${flyway:defaultSchema}].[AIAgentType]
        WHERE [ConversationSummaryPromptID] = @ID

    OPEN cascade_update_MJAIAgentTypes_ConversationSummaryPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentTypes_ConversationSummaryPromptID_cursor INTO @MJAIAgentTypes_ConversationSummaryPromptIDID, @MJAIAgentTypes_ConversationSummaryPromptID_Name, @MJAIAgentTypes_ConversationSummaryPromptID_Description, @MJAIAgentTypes_ConversationSummaryPromptID_SystemPromptID, @MJAIAgentTypes_ConversationSummaryPromptID_IsActive, @MJAIAgentTypes_ConversationSummaryPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_ConversationSummaryPromptID_DriverClass, @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionKey, @MJAIAgentTypes_ConversationSummaryPromptID_UIFormKey, @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_ConversationSummaryPromptID_PromptParamsSchema, @MJAIAgentTypes_ConversationSummaryPromptID_AssignmentStrategy, @MJAIAgentTypes_ConversationSummaryPromptID_DefaultStorageAccountID, @MJAIAgentTypes_ConversationSummaryPromptID_ConfigSchema, @MJAIAgentTypes_ConversationSummaryPromptID_DefaultConfiguration, @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionPromptID, @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @MJAIAgentTypes_ConversationSummaryPromptID_ContextWindowMaxTokens, @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTriggerPercent, @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTargetPercent, @MJAIAgentTypes_ConversationSummaryPromptID_ConversationSummaryPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentTypes_ConversationSummaryPromptID_ConversationSummaryPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentType] @ID = @MJAIAgentTypes_ConversationSummaryPromptIDID, @Name = @MJAIAgentTypes_ConversationSummaryPromptID_Name, @Description = @MJAIAgentTypes_ConversationSummaryPromptID_Description, @SystemPromptID = @MJAIAgentTypes_ConversationSummaryPromptID_SystemPromptID, @IsActive = @MJAIAgentTypes_ConversationSummaryPromptID_IsActive, @AgentPromptPlaceholder = @MJAIAgentTypes_ConversationSummaryPromptID_AgentPromptPlaceholder, @DriverClass = @MJAIAgentTypes_ConversationSummaryPromptID_DriverClass, @UIFormSectionKey = @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionKey, @UIFormKey = @MJAIAgentTypes_ConversationSummaryPromptID_UIFormKey, @UIFormSectionExpandedByDefault = @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionExpandedByDefault, @PromptParamsSchema = @MJAIAgentTypes_ConversationSummaryPromptID_PromptParamsSchema, @AssignmentStrategy = @MJAIAgentTypes_ConversationSummaryPromptID_AssignmentStrategy, @DefaultStorageAccountID = @MJAIAgentTypes_ConversationSummaryPromptID_DefaultStorageAccountID, @ConfigSchema = @MJAIAgentTypes_ConversationSummaryPromptID_ConfigSchema, @DefaultConfiguration = @MJAIAgentTypes_ConversationSummaryPromptID_DefaultConfiguration, @ContextCompressionMessageThreshold = @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @ContextWindowMaxTokens = @MJAIAgentTypes_ConversationSummaryPromptID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTargetPercent, @ConversationSummaryPromptID_Clear = 1, @ConversationSummaryPromptID = @MJAIAgentTypes_ConversationSummaryPromptID_ConversationSummaryPromptID

        FETCH NEXT FROM cascade_update_MJAIAgentTypes_ConversationSummaryPromptID_cursor INTO @MJAIAgentTypes_ConversationSummaryPromptIDID, @MJAIAgentTypes_ConversationSummaryPromptID_Name, @MJAIAgentTypes_ConversationSummaryPromptID_Description, @MJAIAgentTypes_ConversationSummaryPromptID_SystemPromptID, @MJAIAgentTypes_ConversationSummaryPromptID_IsActive, @MJAIAgentTypes_ConversationSummaryPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_ConversationSummaryPromptID_DriverClass, @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionKey, @MJAIAgentTypes_ConversationSummaryPromptID_UIFormKey, @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_ConversationSummaryPromptID_PromptParamsSchema, @MJAIAgentTypes_ConversationSummaryPromptID_AssignmentStrategy, @MJAIAgentTypes_ConversationSummaryPromptID_DefaultStorageAccountID, @MJAIAgentTypes_ConversationSummaryPromptID_ConfigSchema, @MJAIAgentTypes_ConversationSummaryPromptID_DefaultConfiguration, @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionPromptID, @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @MJAIAgentTypes_ConversationSummaryPromptID_ContextWindowMaxTokens, @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTriggerPercent, @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTargetPercent, @MJAIAgentTypes_ConversationSummaryPromptID_ConversationSummaryPromptID
    END

    CLOSE cascade_update_MJAIAgentTypes_ConversationSummaryPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentTypes_ConversationSummaryPromptID_cursor
    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent
    DECLARE @MJAIAgents_ContextCompressionPromptIDID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_Name nvarchar(255)
    DECLARE @MJAIAgents_ContextCompressionPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_LogoURL nvarchar(255)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ParentID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExposeAsAction bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExecutionOrder int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExecutionMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_EnableContextCompression bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgents_ContextCompressionPromptID_TypeID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_Status nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgents_ContextCompressionPromptID_IconClass nvarchar(100)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode nvarchar(50)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadScope nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun decimal(10, 4)
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption nvarchar(30)
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_OwnerUserID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_InvocationMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_TechnicalDesign nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_InjectNotes bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject int
    DECLARE @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_InjectExamples bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_IsRestricted bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_MessageMode nvarchar(50)
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxMessages int
    DECLARE @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath nvarchar(500)
    DECLARE @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes int
    DECLARE @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ScopeConfig nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays int
    DECLARE @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_CategoryID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_TypeConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_RecordingDefault nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_RecordingStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultMediaCollectionID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_SupportsPlanMode bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_AcceptsSkills nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_SkillActivationMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_RequirePlanMode bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextWindowMaxTokens int
    DECLARE @MJAIAgents_ContextCompressionPromptID_CompactionTriggerPercent int
    DECLARE @MJAIAgents_ContextCompressionPromptID_CompactionTargetPercent int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ConversationSummaryPromptID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_DeclareActionsAsNativeTools bit
    DECLARE cascade_update_MJAIAgents_ContextCompressionPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID], [SupportsPlanMode], [AcceptsSkills], [SkillActivationMode], [RequirePlanMode], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID], [DeclareActionsAsNativeTools]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ContextCompressionPromptID] = @ID

    OPEN cascade_update_MJAIAgents_ContextCompressionPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ContextCompressionPromptID_cursor INTO @MJAIAgents_ContextCompressionPromptIDID, @MJAIAgents_ContextCompressionPromptID_Name, @MJAIAgents_ContextCompressionPromptID_Description, @MJAIAgents_ContextCompressionPromptID_LogoURL, @MJAIAgents_ContextCompressionPromptID_ParentID, @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ContextCompressionPromptID_TypeID, @MJAIAgents_ContextCompressionPromptID_Status, @MJAIAgents_ContextCompressionPromptID_DriverClass, @MJAIAgents_ContextCompressionPromptID_IconClass, @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @MJAIAgents_ContextCompressionPromptID_PayloadScope, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @MJAIAgents_ContextCompressionPromptID_InvocationMode, @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MJAIAgents_ContextCompressionPromptID_MessageMode, @MJAIAgents_ContextCompressionPromptID_MaxMessages, @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @MJAIAgents_ContextCompressionPromptID_CategoryID, @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles, @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID, @MJAIAgents_ContextCompressionPromptID_TypeConfiguration, @MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite, @MJAIAgents_ContextCompressionPromptID_RecordingDefault, @MJAIAgents_ContextCompressionPromptID_RecordingStorageProviderID, @MJAIAgents_ContextCompressionPromptID_DefaultMediaCollectionID, @MJAIAgents_ContextCompressionPromptID_SupportsPlanMode, @MJAIAgents_ContextCompressionPromptID_AcceptsSkills, @MJAIAgents_ContextCompressionPromptID_SkillActivationMode, @MJAIAgents_ContextCompressionPromptID_RequirePlanMode, @MJAIAgents_ContextCompressionPromptID_ContextWindowMaxTokens, @MJAIAgents_ContextCompressionPromptID_CompactionTriggerPercent, @MJAIAgents_ContextCompressionPromptID_CompactionTargetPercent, @MJAIAgents_ContextCompressionPromptID_ConversationSummaryPromptID, @MJAIAgents_ContextCompressionPromptID_DeclareActionsAsNativeTools

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ContextCompressionPromptIDID, @Name = @MJAIAgents_ContextCompressionPromptID_Name, @Description = @MJAIAgents_ContextCompressionPromptID_Description, @LogoURL = @MJAIAgents_ContextCompressionPromptID_LogoURL, @ParentID = @MJAIAgents_ContextCompressionPromptID_ParentID, @ExposeAsAction = @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID_Clear = 1, @ContextCompressionPromptID = @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ContextCompressionPromptID_TypeID, @Status = @MJAIAgents_ContextCompressionPromptID_Status, @DriverClass = @MJAIAgents_ContextCompressionPromptID_DriverClass, @IconClass = @MJAIAgents_ContextCompressionPromptID_IconClass, @ModelSelectionMode = @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ContextCompressionPromptID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @InvocationMode = @MJAIAgents_ContextCompressionPromptID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @InjectNotes = @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MessageMode = @MJAIAgents_ContextCompressionPromptID_MessageMode, @MaxMessages = @MJAIAgents_ContextCompressionPromptID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @CategoryID = @MJAIAgents_ContextCompressionPromptID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles, @DefaultCoAgentID = @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_ContextCompressionPromptID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_ContextCompressionPromptID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_ContextCompressionPromptID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_ContextCompressionPromptID_DefaultMediaCollectionID, @SupportsPlanMode = @MJAIAgents_ContextCompressionPromptID_SupportsPlanMode, @AcceptsSkills = @MJAIAgents_ContextCompressionPromptID_AcceptsSkills, @SkillActivationMode = @MJAIAgents_ContextCompressionPromptID_SkillActivationMode, @RequirePlanMode = @MJAIAgents_ContextCompressionPromptID_RequirePlanMode, @ContextWindowMaxTokens = @MJAIAgents_ContextCompressionPromptID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgents_ContextCompressionPromptID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgents_ContextCompressionPromptID_CompactionTargetPercent, @ConversationSummaryPromptID = @MJAIAgents_ContextCompressionPromptID_ConversationSummaryPromptID, @DeclareActionsAsNativeTools = @MJAIAgents_ContextCompressionPromptID_DeclareActionsAsNativeTools

        FETCH NEXT FROM cascade_update_MJAIAgents_ContextCompressionPromptID_cursor INTO @MJAIAgents_ContextCompressionPromptIDID, @MJAIAgents_ContextCompressionPromptID_Name, @MJAIAgents_ContextCompressionPromptID_Description, @MJAIAgents_ContextCompressionPromptID_LogoURL, @MJAIAgents_ContextCompressionPromptID_ParentID, @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ContextCompressionPromptID_TypeID, @MJAIAgents_ContextCompressionPromptID_Status, @MJAIAgents_ContextCompressionPromptID_DriverClass, @MJAIAgents_ContextCompressionPromptID_IconClass, @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @MJAIAgents_ContextCompressionPromptID_PayloadScope, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @MJAIAgents_ContextCompressionPromptID_InvocationMode, @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MJAIAgents_ContextCompressionPromptID_MessageMode, @MJAIAgents_ContextCompressionPromptID_MaxMessages, @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @MJAIAgents_ContextCompressionPromptID_CategoryID, @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles, @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID, @MJAIAgents_ContextCompressionPromptID_TypeConfiguration, @MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite, @MJAIAgents_ContextCompressionPromptID_RecordingDefault, @MJAIAgents_ContextCompressionPromptID_RecordingStorageProviderID, @MJAIAgents_ContextCompressionPromptID_DefaultMediaCollectionID, @MJAIAgents_ContextCompressionPromptID_SupportsPlanMode, @MJAIAgents_ContextCompressionPromptID_AcceptsSkills, @MJAIAgents_ContextCompressionPromptID_SkillActivationMode, @MJAIAgents_ContextCompressionPromptID_RequirePlanMode, @MJAIAgents_ContextCompressionPromptID_ContextWindowMaxTokens, @MJAIAgents_ContextCompressionPromptID_CompactionTriggerPercent, @MJAIAgents_ContextCompressionPromptID_CompactionTargetPercent, @MJAIAgents_ContextCompressionPromptID_ConversationSummaryPromptID, @MJAIAgents_ContextCompressionPromptID_DeclareActionsAsNativeTools
    END

    CLOSE cascade_update_MJAIAgents_ContextCompressionPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgents_ContextCompressionPromptID_cursor
    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent
    DECLARE @MJAIAgents_ConversationSummaryPromptIDID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_Name nvarchar(255)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_LogoURL nvarchar(255)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ParentID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ExposeAsAction bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ExecutionOrder int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ExecutionMode nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_EnableContextCompression bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_TypeID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_Status nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_IconClass nvarchar(100)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ModelSelectionMode nvarchar(50)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_PayloadDownstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_PayloadUpstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_PayloadSelfReadPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_PayloadSelfWritePaths nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_PayloadScope nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMaxRetries int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxCostPerRun decimal(10, 4)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxTokensPerRun int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxIterationsPerRun int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxTimePerRun int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MinExecutionsPerRun int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxExecutionsPerRun int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_DefaultPromptEffortLevel int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ChatHandlingOption nvarchar(30)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_DefaultArtifactTypeID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_OwnerUserID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_InvocationMode nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ArtifactCreationMode nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_FunctionalRequirements nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_TechnicalDesign nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_InjectNotes bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxNotesToInject int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_NoteInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_InjectExamples bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxExamplesToInject int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ExampleInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_IsRestricted bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MessageMode nvarchar(50)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxMessages int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AttachmentStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AttachmentRootPath nvarchar(500)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_InlineStorageThresholdBytes int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AgentTypePromptParams nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ScopeConfig nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_NoteRetentionDays int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ExampleRetentionDays int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AutoArchiveEnabled bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_RerankerConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_CategoryID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AllowEphemeralClientTools bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_SearchScopeAccess nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AcceptUnregisteredFiles bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_DefaultCoAgentID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_TypeConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AllowMemoryWrite bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_RecordingDefault nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_RecordingStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_DefaultMediaCollectionID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_SupportsPlanMode bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AcceptsSkills nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_SkillActivationMode nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_RequirePlanMode bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ContextWindowMaxTokens int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_CompactionTriggerPercent int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_CompactionTargetPercent int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_DeclareActionsAsNativeTools bit
    DECLARE cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID], [SupportsPlanMode], [AcceptsSkills], [SkillActivationMode], [RequirePlanMode], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID], [DeclareActionsAsNativeTools]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ConversationSummaryPromptID] = @ID

    OPEN cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor INTO @MJAIAgents_ConversationSummaryPromptIDID, @MJAIAgents_ConversationSummaryPromptID_Name, @MJAIAgents_ConversationSummaryPromptID_Description, @MJAIAgents_ConversationSummaryPromptID_LogoURL, @MJAIAgents_ConversationSummaryPromptID_ParentID, @MJAIAgents_ConversationSummaryPromptID_ExposeAsAction, @MJAIAgents_ConversationSummaryPromptID_ExecutionOrder, @MJAIAgents_ConversationSummaryPromptID_ExecutionMode, @MJAIAgents_ConversationSummaryPromptID_EnableContextCompression, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionPromptID, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ConversationSummaryPromptID_TypeID, @MJAIAgents_ConversationSummaryPromptID_Status, @MJAIAgents_ConversationSummaryPromptID_DriverClass, @MJAIAgents_ConversationSummaryPromptID_IconClass, @MJAIAgents_ConversationSummaryPromptID_ModelSelectionMode, @MJAIAgents_ConversationSummaryPromptID_PayloadDownstreamPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadUpstreamPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadSelfReadPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadSelfWritePaths, @MJAIAgents_ConversationSummaryPromptID_PayloadScope, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidation, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMode, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ConversationSummaryPromptID_MaxCostPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxTokensPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxIterationsPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxTimePerRun, @MJAIAgents_ConversationSummaryPromptID_MinExecutionsPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxExecutionsPerRun, @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidation, @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidationMode, @MJAIAgents_ConversationSummaryPromptID_DefaultPromptEffortLevel, @MJAIAgents_ConversationSummaryPromptID_ChatHandlingOption, @MJAIAgents_ConversationSummaryPromptID_DefaultArtifactTypeID, @MJAIAgents_ConversationSummaryPromptID_OwnerUserID, @MJAIAgents_ConversationSummaryPromptID_InvocationMode, @MJAIAgents_ConversationSummaryPromptID_ArtifactCreationMode, @MJAIAgents_ConversationSummaryPromptID_FunctionalRequirements, @MJAIAgents_ConversationSummaryPromptID_TechnicalDesign, @MJAIAgents_ConversationSummaryPromptID_InjectNotes, @MJAIAgents_ConversationSummaryPromptID_MaxNotesToInject, @MJAIAgents_ConversationSummaryPromptID_NoteInjectionStrategy, @MJAIAgents_ConversationSummaryPromptID_InjectExamples, @MJAIAgents_ConversationSummaryPromptID_MaxExamplesToInject, @MJAIAgents_ConversationSummaryPromptID_ExampleInjectionStrategy, @MJAIAgents_ConversationSummaryPromptID_IsRestricted, @MJAIAgents_ConversationSummaryPromptID_MessageMode, @MJAIAgents_ConversationSummaryPromptID_MaxMessages, @MJAIAgents_ConversationSummaryPromptID_AttachmentStorageProviderID, @MJAIAgents_ConversationSummaryPromptID_AttachmentRootPath, @MJAIAgents_ConversationSummaryPromptID_InlineStorageThresholdBytes, @MJAIAgents_ConversationSummaryPromptID_AgentTypePromptParams, @MJAIAgents_ConversationSummaryPromptID_ScopeConfig, @MJAIAgents_ConversationSummaryPromptID_NoteRetentionDays, @MJAIAgents_ConversationSummaryPromptID_ExampleRetentionDays, @MJAIAgents_ConversationSummaryPromptID_AutoArchiveEnabled, @MJAIAgents_ConversationSummaryPromptID_RerankerConfiguration, @MJAIAgents_ConversationSummaryPromptID_CategoryID, @MJAIAgents_ConversationSummaryPromptID_AllowEphemeralClientTools, @MJAIAgents_ConversationSummaryPromptID_DefaultStorageAccountID, @MJAIAgents_ConversationSummaryPromptID_SearchScopeAccess, @MJAIAgents_ConversationSummaryPromptID_AcceptUnregisteredFiles, @MJAIAgents_ConversationSummaryPromptID_DefaultCoAgentID, @MJAIAgents_ConversationSummaryPromptID_TypeConfiguration, @MJAIAgents_ConversationSummaryPromptID_AllowMemoryWrite, @MJAIAgents_ConversationSummaryPromptID_RecordingDefault, @MJAIAgents_ConversationSummaryPromptID_RecordingStorageProviderID, @MJAIAgents_ConversationSummaryPromptID_DefaultMediaCollectionID, @MJAIAgents_ConversationSummaryPromptID_SupportsPlanMode, @MJAIAgents_ConversationSummaryPromptID_AcceptsSkills, @MJAIAgents_ConversationSummaryPromptID_SkillActivationMode, @MJAIAgents_ConversationSummaryPromptID_RequirePlanMode, @MJAIAgents_ConversationSummaryPromptID_ContextWindowMaxTokens, @MJAIAgents_ConversationSummaryPromptID_CompactionTriggerPercent, @MJAIAgents_ConversationSummaryPromptID_CompactionTargetPercent, @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID, @MJAIAgents_ConversationSummaryPromptID_DeclareActionsAsNativeTools

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ConversationSummaryPromptIDID, @Name = @MJAIAgents_ConversationSummaryPromptID_Name, @Description = @MJAIAgents_ConversationSummaryPromptID_Description, @LogoURL = @MJAIAgents_ConversationSummaryPromptID_LogoURL, @ParentID = @MJAIAgents_ConversationSummaryPromptID_ParentID, @ExposeAsAction = @MJAIAgents_ConversationSummaryPromptID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ConversationSummaryPromptID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ConversationSummaryPromptID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ConversationSummaryPromptID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_ConversationSummaryPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ConversationSummaryPromptID_TypeID, @Status = @MJAIAgents_ConversationSummaryPromptID_Status, @DriverClass = @MJAIAgents_ConversationSummaryPromptID_DriverClass, @IconClass = @MJAIAgents_ConversationSummaryPromptID_IconClass, @ModelSelectionMode = @MJAIAgents_ConversationSummaryPromptID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ConversationSummaryPromptID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ConversationSummaryPromptID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ConversationSummaryPromptID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ConversationSummaryPromptID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ConversationSummaryPromptID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ConversationSummaryPromptID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ConversationSummaryPromptID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ConversationSummaryPromptID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ConversationSummaryPromptID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ConversationSummaryPromptID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ConversationSummaryPromptID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ConversationSummaryPromptID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ConversationSummaryPromptID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ConversationSummaryPromptID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ConversationSummaryPromptID_OwnerUserID, @InvocationMode = @MJAIAgents_ConversationSummaryPromptID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ConversationSummaryPromptID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ConversationSummaryPromptID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ConversationSummaryPromptID_TechnicalDesign, @InjectNotes = @MJAIAgents_ConversationSummaryPromptID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ConversationSummaryPromptID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ConversationSummaryPromptID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ConversationSummaryPromptID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ConversationSummaryPromptID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ConversationSummaryPromptID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ConversationSummaryPromptID_IsRestricted, @MessageMode = @MJAIAgents_ConversationSummaryPromptID_MessageMode, @MaxMessages = @MJAIAgents_ConversationSummaryPromptID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ConversationSummaryPromptID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ConversationSummaryPromptID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ConversationSummaryPromptID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ConversationSummaryPromptID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ConversationSummaryPromptID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ConversationSummaryPromptID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ConversationSummaryPromptID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ConversationSummaryPromptID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ConversationSummaryPromptID_RerankerConfiguration, @CategoryID = @MJAIAgents_ConversationSummaryPromptID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ConversationSummaryPromptID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ConversationSummaryPromptID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ConversationSummaryPromptID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_ConversationSummaryPromptID_AcceptUnregisteredFiles, @DefaultCoAgentID = @MJAIAgents_ConversationSummaryPromptID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_ConversationSummaryPromptID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_ConversationSummaryPromptID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_ConversationSummaryPromptID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_ConversationSummaryPromptID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_ConversationSummaryPromptID_DefaultMediaCollectionID, @SupportsPlanMode = @MJAIAgents_ConversationSummaryPromptID_SupportsPlanMode, @AcceptsSkills = @MJAIAgents_ConversationSummaryPromptID_AcceptsSkills, @SkillActivationMode = @MJAIAgents_ConversationSummaryPromptID_SkillActivationMode, @RequirePlanMode = @MJAIAgents_ConversationSummaryPromptID_RequirePlanMode, @ContextWindowMaxTokens = @MJAIAgents_ConversationSummaryPromptID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgents_ConversationSummaryPromptID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgents_ConversationSummaryPromptID_CompactionTargetPercent, @ConversationSummaryPromptID_Clear = 1, @ConversationSummaryPromptID = @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID, @DeclareActionsAsNativeTools = @MJAIAgents_ConversationSummaryPromptID_DeclareActionsAsNativeTools

        FETCH NEXT FROM cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor INTO @MJAIAgents_ConversationSummaryPromptIDID, @MJAIAgents_ConversationSummaryPromptID_Name, @MJAIAgents_ConversationSummaryPromptID_Description, @MJAIAgents_ConversationSummaryPromptID_LogoURL, @MJAIAgents_ConversationSummaryPromptID_ParentID, @MJAIAgents_ConversationSummaryPromptID_ExposeAsAction, @MJAIAgents_ConversationSummaryPromptID_ExecutionOrder, @MJAIAgents_ConversationSummaryPromptID_ExecutionMode, @MJAIAgents_ConversationSummaryPromptID_EnableContextCompression, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionPromptID, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ConversationSummaryPromptID_TypeID, @MJAIAgents_ConversationSummaryPromptID_Status, @MJAIAgents_ConversationSummaryPromptID_DriverClass, @MJAIAgents_ConversationSummaryPromptID_IconClass, @MJAIAgents_ConversationSummaryPromptID_ModelSelectionMode, @MJAIAgents_ConversationSummaryPromptID_PayloadDownstreamPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadUpstreamPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadSelfReadPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadSelfWritePaths, @MJAIAgents_ConversationSummaryPromptID_PayloadScope, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidation, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMode, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ConversationSummaryPromptID_MaxCostPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxTokensPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxIterationsPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxTimePerRun, @MJAIAgents_ConversationSummaryPromptID_MinExecutionsPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxExecutionsPerRun, @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidation, @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidationMode, @MJAIAgents_ConversationSummaryPromptID_DefaultPromptEffortLevel, @MJAIAgents_ConversationSummaryPromptID_ChatHandlingOption, @MJAIAgents_ConversationSummaryPromptID_DefaultArtifactTypeID, @MJAIAgents_ConversationSummaryPromptID_OwnerUserID, @MJAIAgents_ConversationSummaryPromptID_InvocationMode, @MJAIAgents_ConversationSummaryPromptID_ArtifactCreationMode, @MJAIAgents_ConversationSummaryPromptID_FunctionalRequirements, @MJAIAgents_ConversationSummaryPromptID_TechnicalDesign, @MJAIAgents_ConversationSummaryPromptID_InjectNotes, @MJAIAgents_ConversationSummaryPromptID_MaxNotesToInject, @MJAIAgents_ConversationSummaryPromptID_NoteInjectionStrategy, @MJAIAgents_ConversationSummaryPromptID_InjectExamples, @MJAIAgents_ConversationSummaryPromptID_MaxExamplesToInject, @MJAIAgents_ConversationSummaryPromptID_ExampleInjectionStrategy, @MJAIAgents_ConversationSummaryPromptID_IsRestricted, @MJAIAgents_ConversationSummaryPromptID_MessageMode, @MJAIAgents_ConversationSummaryPromptID_MaxMessages, @MJAIAgents_ConversationSummaryPromptID_AttachmentStorageProviderID, @MJAIAgents_ConversationSummaryPromptID_AttachmentRootPath, @MJAIAgents_ConversationSummaryPromptID_InlineStorageThresholdBytes, @MJAIAgents_ConversationSummaryPromptID_AgentTypePromptParams, @MJAIAgents_ConversationSummaryPromptID_ScopeConfig, @MJAIAgents_ConversationSummaryPromptID_NoteRetentionDays, @MJAIAgents_ConversationSummaryPromptID_ExampleRetentionDays, @MJAIAgents_ConversationSummaryPromptID_AutoArchiveEnabled, @MJAIAgents_ConversationSummaryPromptID_RerankerConfiguration, @MJAIAgents_ConversationSummaryPromptID_CategoryID, @MJAIAgents_ConversationSummaryPromptID_AllowEphemeralClientTools, @MJAIAgents_ConversationSummaryPromptID_DefaultStorageAccountID, @MJAIAgents_ConversationSummaryPromptID_SearchScopeAccess, @MJAIAgents_ConversationSummaryPromptID_AcceptUnregisteredFiles, @MJAIAgents_ConversationSummaryPromptID_DefaultCoAgentID, @MJAIAgents_ConversationSummaryPromptID_TypeConfiguration, @MJAIAgents_ConversationSummaryPromptID_AllowMemoryWrite, @MJAIAgents_ConversationSummaryPromptID_RecordingDefault, @MJAIAgents_ConversationSummaryPromptID_RecordingStorageProviderID, @MJAIAgents_ConversationSummaryPromptID_DefaultMediaCollectionID, @MJAIAgents_ConversationSummaryPromptID_SupportsPlanMode, @MJAIAgents_ConversationSummaryPromptID_AcceptsSkills, @MJAIAgents_ConversationSummaryPromptID_SkillActivationMode, @MJAIAgents_ConversationSummaryPromptID_RequirePlanMode, @MJAIAgents_ConversationSummaryPromptID_ContextWindowMaxTokens, @MJAIAgents_ConversationSummaryPromptID_CompactionTriggerPercent, @MJAIAgents_ConversationSummaryPromptID_CompactionTargetPercent, @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID, @MJAIAgents_ConversationSummaryPromptID_DeclareActionsAsNativeTools
    END

    CLOSE cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor
    
    -- Cascade update on AIConfiguration using cursor to call spUpdateAIConfiguration
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionIDID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_Name nvarchar(100)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_Description nvarchar(MAX)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault bit
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_Status nvarchar(20)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath nvarchar(500)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID uniqueidentifier
    DECLARE cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [IsDefault], [Status], [DefaultPromptForContextCompressionID], [DefaultPromptForContextSummarizationID], [DefaultStorageProviderID], [DefaultStorageRootPath], [ParentID]
        FROM [${flyway:defaultSchema}].[AIConfiguration]
        WHERE [DefaultPromptForContextCompressionID] = @ID

    OPEN cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor
    FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor INTO @MJAIConfigurations_DefaultPromptForContextCompressionIDID, @MJAIConfigurations_DefaultPromptForContextCompressionID_Name, @MJAIConfigurations_DefaultPromptForContextCompressionID_Description, @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault, @MJAIConfigurations_DefaultPromptForContextCompressionID_Status, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIConfiguration] @ID = @MJAIConfigurations_DefaultPromptForContextCompressionIDID, @Name = @MJAIConfigurations_DefaultPromptForContextCompressionID_Name, @Description = @MJAIConfigurations_DefaultPromptForContextCompressionID_Description, @IsDefault = @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault, @Status = @MJAIConfigurations_DefaultPromptForContextCompressionID_Status, @DefaultPromptForContextCompressionID_Clear = 1, @DefaultPromptForContextCompressionID = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID, @DefaultPromptForContextSummarizationID = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID, @DefaultStorageProviderID = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID, @DefaultStorageRootPath = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath, @ParentID = @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID

        FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor INTO @MJAIConfigurations_DefaultPromptForContextCompressionIDID, @MJAIConfigurations_DefaultPromptForContextCompressionID_Name, @MJAIConfigurations_DefaultPromptForContextCompressionID_Description, @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault, @MJAIConfigurations_DefaultPromptForContextCompressionID_Status, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID
    END

    CLOSE cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor
    DEALLOCATE cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor
    
    -- Cascade update on AIConfiguration using cursor to call spUpdateAIConfiguration
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationIDID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name nvarchar(100)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description nvarchar(MAX)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault bit
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status nvarchar(20)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath nvarchar(500)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID uniqueidentifier
    DECLARE cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [IsDefault], [Status], [DefaultPromptForContextCompressionID], [DefaultPromptForContextSummarizationID], [DefaultStorageProviderID], [DefaultStorageRootPath], [ParentID]
        FROM [${flyway:defaultSchema}].[AIConfiguration]
        WHERE [DefaultPromptForContextSummarizationID] = @ID

    OPEN cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor
    FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor INTO @MJAIConfigurations_DefaultPromptForContextSummarizationIDID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description, @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIConfiguration] @ID = @MJAIConfigurations_DefaultPromptForContextSummarizationIDID, @Name = @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name, @Description = @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description, @IsDefault = @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault, @Status = @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status, @DefaultPromptForContextCompressionID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID, @DefaultPromptForContextSummarizationID_Clear = 1, @DefaultPromptForContextSummarizationID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID, @DefaultStorageProviderID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID, @DefaultStorageRootPath = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath, @ParentID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID

        FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor INTO @MJAIConfigurations_DefaultPromptForContextSummarizationIDID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description, @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID
    END

    CLOSE cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor
    DEALLOCATE cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor
    
    -- Cascade delete from AIPromptModel using cursor to call spDeleteAIPromptModel
    DECLARE @MJAIPromptModels_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIPromptModels_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIPromptModel]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJAIPromptModels_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIPromptModels_PromptID_cursor INTO @MJAIPromptModels_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIPromptModel] @ID = @MJAIPromptModels_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIPromptModels_PromptID_cursor INTO @MJAIPromptModels_PromptIDID
    END
    
    CLOSE cascade_delete_MJAIPromptModels_PromptID_cursor
    DEALLOCATE cascade_delete_MJAIPromptModels_PromptID_cursor
    
    -- Cascade delete from AIPromptRun using cursor to call spDeleteAIPromptRun
    DECLARE @MJAIPromptRuns_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIPromptRuns_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJAIPromptRuns_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIPromptRuns_PromptID_cursor INTO @MJAIPromptRuns_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIPromptRun] @ID = @MJAIPromptRuns_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIPromptRuns_PromptID_cursor INTO @MJAIPromptRuns_PromptIDID
    END
    
    CLOSE cascade_delete_MJAIPromptRuns_PromptID_cursor
    DEALLOCATE cascade_delete_MJAIPromptRuns_PromptID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_JudgeIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_JudgeID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_TokensUsed int
    DECLARE @MJAIPromptRuns_JudgeID_TokensPrompt int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCompletion int
    DECLARE @MJAIPromptRuns_JudgeID_TotalCost decimal(19, 8)
    DECLARE @MJAIPromptRuns_JudgeID_Success bit
    DECLARE @MJAIPromptRuns_JudgeID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_JudgeID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_JudgeID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_JudgeID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_JudgeID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_JudgeID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_JudgeID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_TopK int
    DECLARE @MJAIPromptRuns_JudgeID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_Seed int
    DECLARE @MJAIPromptRuns_JudgeID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_LogProbs bit
    DECLARE @MJAIPromptRuns_JudgeID_TopLogProbs int
    DECLARE @MJAIPromptRuns_JudgeID_DescendantCost decimal(19, 8)
    DECLARE @MJAIPromptRuns_JudgeID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_JudgeID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_JudgeID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_JudgeID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_JudgeID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_JudgeID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_JudgeID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_JudgeID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_JudgeID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_JudgeID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_JudgeID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_Cancelled bit
    DECLARE @MJAIPromptRuns_JudgeID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_JudgeID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_CacheHit bit
    DECLARE @MJAIPromptRuns_JudgeID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_JudgeID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_JudgeID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_JudgeID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_JudgeID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_JudgeID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_QueueTime int
    DECLARE @MJAIPromptRuns_JudgeID_PromptTime int
    DECLARE @MJAIPromptRuns_JudgeID_CompletionTime int
    DECLARE @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_EffortLevel int
    DECLARE @MJAIPromptRuns_JudgeID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_JudgeID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCacheWriteRollup int
    DECLARE @MJAIPromptRuns_JudgeID_InputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_JudgeID_OutputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_JudgeID_UsageTypeID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_ToolCallingMode nvarchar(25)
    DECLARE @MJAIPromptRuns_JudgeID_UserID uniqueidentifier
    DECLARE cascade_update_MJAIPromptRuns_JudgeID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup], [InputUnitsUsed], [OutputUnitsUsed], [UsageTypeID], [ToolCallingMode], [UserID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [JudgeID] = @ID

    OPEN cascade_update_MJAIPromptRuns_JudgeID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_JudgeID_cursor INTO @MJAIPromptRuns_JudgeIDID, @MJAIPromptRuns_JudgeID_PromptID, @MJAIPromptRuns_JudgeID_ModelID, @MJAIPromptRuns_JudgeID_VendorID, @MJAIPromptRuns_JudgeID_AgentID, @MJAIPromptRuns_JudgeID_ConfigurationID, @MJAIPromptRuns_JudgeID_RunAt, @MJAIPromptRuns_JudgeID_CompletedAt, @MJAIPromptRuns_JudgeID_ExecutionTimeMS, @MJAIPromptRuns_JudgeID_Messages, @MJAIPromptRuns_JudgeID_Result, @MJAIPromptRuns_JudgeID_TokensUsed, @MJAIPromptRuns_JudgeID_TokensPrompt, @MJAIPromptRuns_JudgeID_TokensCompletion, @MJAIPromptRuns_JudgeID_TotalCost, @MJAIPromptRuns_JudgeID_Success, @MJAIPromptRuns_JudgeID_ErrorMessage, @MJAIPromptRuns_JudgeID_ParentID, @MJAIPromptRuns_JudgeID_RunType, @MJAIPromptRuns_JudgeID_ExecutionOrder, @MJAIPromptRuns_JudgeID_Cost, @MJAIPromptRuns_JudgeID_CostCurrency, @MJAIPromptRuns_JudgeID_TokensUsedRollup, @MJAIPromptRuns_JudgeID_TokensPromptRollup, @MJAIPromptRuns_JudgeID_TokensCompletionRollup, @MJAIPromptRuns_JudgeID_Temperature, @MJAIPromptRuns_JudgeID_TopP, @MJAIPromptRuns_JudgeID_TopK, @MJAIPromptRuns_JudgeID_MinP, @MJAIPromptRuns_JudgeID_FrequencyPenalty, @MJAIPromptRuns_JudgeID_PresencePenalty, @MJAIPromptRuns_JudgeID_Seed, @MJAIPromptRuns_JudgeID_StopSequences, @MJAIPromptRuns_JudgeID_ResponseFormat, @MJAIPromptRuns_JudgeID_LogProbs, @MJAIPromptRuns_JudgeID_TopLogProbs, @MJAIPromptRuns_JudgeID_DescendantCost, @MJAIPromptRuns_JudgeID_ValidationAttemptCount, @MJAIPromptRuns_JudgeID_SuccessfulValidationCount, @MJAIPromptRuns_JudgeID_FinalValidationPassed, @MJAIPromptRuns_JudgeID_ValidationBehavior, @MJAIPromptRuns_JudgeID_RetryStrategy, @MJAIPromptRuns_JudgeID_MaxRetriesConfigured, @MJAIPromptRuns_JudgeID_FinalValidationError, @MJAIPromptRuns_JudgeID_ValidationErrorCount, @MJAIPromptRuns_JudgeID_CommonValidationError, @MJAIPromptRuns_JudgeID_FirstAttemptAt, @MJAIPromptRuns_JudgeID_LastAttemptAt, @MJAIPromptRuns_JudgeID_TotalRetryDurationMS, @MJAIPromptRuns_JudgeID_ValidationAttempts, @MJAIPromptRuns_JudgeID_ValidationSummary, @MJAIPromptRuns_JudgeID_FailoverAttempts, @MJAIPromptRuns_JudgeID_FailoverErrors, @MJAIPromptRuns_JudgeID_FailoverDurations, @MJAIPromptRuns_JudgeID_OriginalModelID, @MJAIPromptRuns_JudgeID_OriginalRequestStartTime, @MJAIPromptRuns_JudgeID_TotalFailoverDuration, @MJAIPromptRuns_JudgeID_RerunFromPromptRunID, @MJAIPromptRuns_JudgeID_ModelSelection, @MJAIPromptRuns_JudgeID_Status, @MJAIPromptRuns_JudgeID_Cancelled, @MJAIPromptRuns_JudgeID_CancellationReason, @MJAIPromptRuns_JudgeID_ModelPowerRank, @MJAIPromptRuns_JudgeID_SelectionStrategy, @MJAIPromptRuns_JudgeID_CacheHit, @MJAIPromptRuns_JudgeID_CacheKey, @MJAIPromptRuns_JudgeID_JudgeID, @MJAIPromptRuns_JudgeID_JudgeScore, @MJAIPromptRuns_JudgeID_WasSelectedResult, @MJAIPromptRuns_JudgeID_StreamingEnabled, @MJAIPromptRuns_JudgeID_FirstTokenTime, @MJAIPromptRuns_JudgeID_ErrorDetails, @MJAIPromptRuns_JudgeID_ChildPromptID, @MJAIPromptRuns_JudgeID_QueueTime, @MJAIPromptRuns_JudgeID_PromptTime, @MJAIPromptRuns_JudgeID_CompletionTime, @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, @MJAIPromptRuns_JudgeID_EffortLevel, @MJAIPromptRuns_JudgeID_RunName, @MJAIPromptRuns_JudgeID_Comments, @MJAIPromptRuns_JudgeID_TestRunID, @MJAIPromptRuns_JudgeID_AssistantPrefill, @MJAIPromptRuns_JudgeID_TokensCacheRead, @MJAIPromptRuns_JudgeID_TokensCacheWrite, @MJAIPromptRuns_JudgeID_TokensCacheReadRollup, @MJAIPromptRuns_JudgeID_TokensCacheWriteRollup, @MJAIPromptRuns_JudgeID_InputUnitsUsed, @MJAIPromptRuns_JudgeID_OutputUnitsUsed, @MJAIPromptRuns_JudgeID_UsageTypeID, @MJAIPromptRuns_JudgeID_ToolCallingMode, @MJAIPromptRuns_JudgeID_UserID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_JudgeID_JudgeID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_JudgeIDID, @PromptID = @MJAIPromptRuns_JudgeID_PromptID, @ModelID = @MJAIPromptRuns_JudgeID_ModelID, @VendorID = @MJAIPromptRuns_JudgeID_VendorID, @AgentID = @MJAIPromptRuns_JudgeID_AgentID, @ConfigurationID = @MJAIPromptRuns_JudgeID_ConfigurationID, @RunAt = @MJAIPromptRuns_JudgeID_RunAt, @CompletedAt = @MJAIPromptRuns_JudgeID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_JudgeID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_JudgeID_Messages, @Result = @MJAIPromptRuns_JudgeID_Result, @TokensUsed = @MJAIPromptRuns_JudgeID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_JudgeID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_JudgeID_TokensCompletion, @TotalCost = @MJAIPromptRuns_JudgeID_TotalCost, @Success = @MJAIPromptRuns_JudgeID_Success, @ErrorMessage = @MJAIPromptRuns_JudgeID_ErrorMessage, @ParentID = @MJAIPromptRuns_JudgeID_ParentID, @RunType = @MJAIPromptRuns_JudgeID_RunType, @ExecutionOrder = @MJAIPromptRuns_JudgeID_ExecutionOrder, @Cost = @MJAIPromptRuns_JudgeID_Cost, @CostCurrency = @MJAIPromptRuns_JudgeID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_JudgeID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_JudgeID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_JudgeID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_JudgeID_Temperature, @TopP = @MJAIPromptRuns_JudgeID_TopP, @TopK = @MJAIPromptRuns_JudgeID_TopK, @MinP = @MJAIPromptRuns_JudgeID_MinP, @FrequencyPenalty = @MJAIPromptRuns_JudgeID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_JudgeID_PresencePenalty, @Seed = @MJAIPromptRuns_JudgeID_Seed, @StopSequences = @MJAIPromptRuns_JudgeID_StopSequences, @ResponseFormat = @MJAIPromptRuns_JudgeID_ResponseFormat, @LogProbs = @MJAIPromptRuns_JudgeID_LogProbs, @TopLogProbs = @MJAIPromptRuns_JudgeID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_JudgeID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_JudgeID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_JudgeID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_JudgeID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_JudgeID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_JudgeID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_JudgeID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_JudgeID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_JudgeID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_JudgeID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_JudgeID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_JudgeID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_JudgeID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_JudgeID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_JudgeID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_JudgeID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_JudgeID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_JudgeID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_JudgeID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_JudgeID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_JudgeID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_JudgeID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_JudgeID_ModelSelection, @Status = @MJAIPromptRuns_JudgeID_Status, @Cancelled = @MJAIPromptRuns_JudgeID_Cancelled, @CancellationReason = @MJAIPromptRuns_JudgeID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_JudgeID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_JudgeID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_JudgeID_CacheHit, @CacheKey = @MJAIPromptRuns_JudgeID_CacheKey, @JudgeID_Clear = 1, @JudgeID = @MJAIPromptRuns_JudgeID_JudgeID, @JudgeScore = @MJAIPromptRuns_JudgeID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_JudgeID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_JudgeID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_JudgeID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_JudgeID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_JudgeID_ChildPromptID, @QueueTime = @MJAIPromptRuns_JudgeID_QueueTime, @PromptTime = @MJAIPromptRuns_JudgeID_PromptTime, @CompletionTime = @MJAIPromptRuns_JudgeID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_JudgeID_EffortLevel, @RunName = @MJAIPromptRuns_JudgeID_RunName, @Comments = @MJAIPromptRuns_JudgeID_Comments, @TestRunID = @MJAIPromptRuns_JudgeID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_JudgeID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_JudgeID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_JudgeID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_JudgeID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_JudgeID_TokensCacheWriteRollup, @InputUnitsUsed = @MJAIPromptRuns_JudgeID_InputUnitsUsed, @OutputUnitsUsed = @MJAIPromptRuns_JudgeID_OutputUnitsUsed, @UsageTypeID = @MJAIPromptRuns_JudgeID_UsageTypeID, @ToolCallingMode = @MJAIPromptRuns_JudgeID_ToolCallingMode, @UserID = @MJAIPromptRuns_JudgeID_UserID

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_JudgeID_cursor INTO @MJAIPromptRuns_JudgeIDID, @MJAIPromptRuns_JudgeID_PromptID, @MJAIPromptRuns_JudgeID_ModelID, @MJAIPromptRuns_JudgeID_VendorID, @MJAIPromptRuns_JudgeID_AgentID, @MJAIPromptRuns_JudgeID_ConfigurationID, @MJAIPromptRuns_JudgeID_RunAt, @MJAIPromptRuns_JudgeID_CompletedAt, @MJAIPromptRuns_JudgeID_ExecutionTimeMS, @MJAIPromptRuns_JudgeID_Messages, @MJAIPromptRuns_JudgeID_Result, @MJAIPromptRuns_JudgeID_TokensUsed, @MJAIPromptRuns_JudgeID_TokensPrompt, @MJAIPromptRuns_JudgeID_TokensCompletion, @MJAIPromptRuns_JudgeID_TotalCost, @MJAIPromptRuns_JudgeID_Success, @MJAIPromptRuns_JudgeID_ErrorMessage, @MJAIPromptRuns_JudgeID_ParentID, @MJAIPromptRuns_JudgeID_RunType, @MJAIPromptRuns_JudgeID_ExecutionOrder, @MJAIPromptRuns_JudgeID_Cost, @MJAIPromptRuns_JudgeID_CostCurrency, @MJAIPromptRuns_JudgeID_TokensUsedRollup, @MJAIPromptRuns_JudgeID_TokensPromptRollup, @MJAIPromptRuns_JudgeID_TokensCompletionRollup, @MJAIPromptRuns_JudgeID_Temperature, @MJAIPromptRuns_JudgeID_TopP, @MJAIPromptRuns_JudgeID_TopK, @MJAIPromptRuns_JudgeID_MinP, @MJAIPromptRuns_JudgeID_FrequencyPenalty, @MJAIPromptRuns_JudgeID_PresencePenalty, @MJAIPromptRuns_JudgeID_Seed, @MJAIPromptRuns_JudgeID_StopSequences, @MJAIPromptRuns_JudgeID_ResponseFormat, @MJAIPromptRuns_JudgeID_LogProbs, @MJAIPromptRuns_JudgeID_TopLogProbs, @MJAIPromptRuns_JudgeID_DescendantCost, @MJAIPromptRuns_JudgeID_ValidationAttemptCount, @MJAIPromptRuns_JudgeID_SuccessfulValidationCount, @MJAIPromptRuns_JudgeID_FinalValidationPassed, @MJAIPromptRuns_JudgeID_ValidationBehavior, @MJAIPromptRuns_JudgeID_RetryStrategy, @MJAIPromptRuns_JudgeID_MaxRetriesConfigured, @MJAIPromptRuns_JudgeID_FinalValidationError, @MJAIPromptRuns_JudgeID_ValidationErrorCount, @MJAIPromptRuns_JudgeID_CommonValidationError, @MJAIPromptRuns_JudgeID_FirstAttemptAt, @MJAIPromptRuns_JudgeID_LastAttemptAt, @MJAIPromptRuns_JudgeID_TotalRetryDurationMS, @MJAIPromptRuns_JudgeID_ValidationAttempts, @MJAIPromptRuns_JudgeID_ValidationSummary, @MJAIPromptRuns_JudgeID_FailoverAttempts, @MJAIPromptRuns_JudgeID_FailoverErrors, @MJAIPromptRuns_JudgeID_FailoverDurations, @MJAIPromptRuns_JudgeID_OriginalModelID, @MJAIPromptRuns_JudgeID_OriginalRequestStartTime, @MJAIPromptRuns_JudgeID_TotalFailoverDuration, @MJAIPromptRuns_JudgeID_RerunFromPromptRunID, @MJAIPromptRuns_JudgeID_ModelSelection, @MJAIPromptRuns_JudgeID_Status, @MJAIPromptRuns_JudgeID_Cancelled, @MJAIPromptRuns_JudgeID_CancellationReason, @MJAIPromptRuns_JudgeID_ModelPowerRank, @MJAIPromptRuns_JudgeID_SelectionStrategy, @MJAIPromptRuns_JudgeID_CacheHit, @MJAIPromptRuns_JudgeID_CacheKey, @MJAIPromptRuns_JudgeID_JudgeID, @MJAIPromptRuns_JudgeID_JudgeScore, @MJAIPromptRuns_JudgeID_WasSelectedResult, @MJAIPromptRuns_JudgeID_StreamingEnabled, @MJAIPromptRuns_JudgeID_FirstTokenTime, @MJAIPromptRuns_JudgeID_ErrorDetails, @MJAIPromptRuns_JudgeID_ChildPromptID, @MJAIPromptRuns_JudgeID_QueueTime, @MJAIPromptRuns_JudgeID_PromptTime, @MJAIPromptRuns_JudgeID_CompletionTime, @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, @MJAIPromptRuns_JudgeID_EffortLevel, @MJAIPromptRuns_JudgeID_RunName, @MJAIPromptRuns_JudgeID_Comments, @MJAIPromptRuns_JudgeID_TestRunID, @MJAIPromptRuns_JudgeID_AssistantPrefill, @MJAIPromptRuns_JudgeID_TokensCacheRead, @MJAIPromptRuns_JudgeID_TokensCacheWrite, @MJAIPromptRuns_JudgeID_TokensCacheReadRollup, @MJAIPromptRuns_JudgeID_TokensCacheWriteRollup, @MJAIPromptRuns_JudgeID_InputUnitsUsed, @MJAIPromptRuns_JudgeID_OutputUnitsUsed, @MJAIPromptRuns_JudgeID_UsageTypeID, @MJAIPromptRuns_JudgeID_ToolCallingMode, @MJAIPromptRuns_JudgeID_UserID
    END

    CLOSE cascade_update_MJAIPromptRuns_JudgeID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_JudgeID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_ChildPromptIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_ChildPromptID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensUsed int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensPrompt int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCompletion int
    DECLARE @MJAIPromptRuns_ChildPromptID_TotalCost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ChildPromptID_Success bit
    DECLARE @MJAIPromptRuns_ChildPromptID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_ChildPromptID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_ChildPromptID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ChildPromptID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_TopK int
    DECLARE @MJAIPromptRuns_ChildPromptID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_Seed int
    DECLARE @MJAIPromptRuns_ChildPromptID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_LogProbs bit
    DECLARE @MJAIPromptRuns_ChildPromptID_TopLogProbs int
    DECLARE @MJAIPromptRuns_ChildPromptID_DescendantCost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_ChildPromptID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_ChildPromptID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_ChildPromptID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_ChildPromptID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_ChildPromptID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_Cancelled bit
    DECLARE @MJAIPromptRuns_ChildPromptID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_ChildPromptID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_CacheHit bit
    DECLARE @MJAIPromptRuns_ChildPromptID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_ChildPromptID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_ChildPromptID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_ChildPromptID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_ChildPromptID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_QueueTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_PromptTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_CompletionTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_EffortLevel int
    DECLARE @MJAIPromptRuns_ChildPromptID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_ChildPromptID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_InputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_ChildPromptID_OutputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_ChildPromptID_UsageTypeID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_ToolCallingMode nvarchar(25)
    DECLARE @MJAIPromptRuns_ChildPromptID_UserID uniqueidentifier
    DECLARE cascade_update_MJAIPromptRuns_ChildPromptID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup], [InputUnitsUsed], [OutputUnitsUsed], [UsageTypeID], [ToolCallingMode], [UserID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [ChildPromptID] = @ID

    OPEN cascade_update_MJAIPromptRuns_ChildPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_ChildPromptID_cursor INTO @MJAIPromptRuns_ChildPromptIDID, @MJAIPromptRuns_ChildPromptID_PromptID, @MJAIPromptRuns_ChildPromptID_ModelID, @MJAIPromptRuns_ChildPromptID_VendorID, @MJAIPromptRuns_ChildPromptID_AgentID, @MJAIPromptRuns_ChildPromptID_ConfigurationID, @MJAIPromptRuns_ChildPromptID_RunAt, @MJAIPromptRuns_ChildPromptID_CompletedAt, @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, @MJAIPromptRuns_ChildPromptID_Messages, @MJAIPromptRuns_ChildPromptID_Result, @MJAIPromptRuns_ChildPromptID_TokensUsed, @MJAIPromptRuns_ChildPromptID_TokensPrompt, @MJAIPromptRuns_ChildPromptID_TokensCompletion, @MJAIPromptRuns_ChildPromptID_TotalCost, @MJAIPromptRuns_ChildPromptID_Success, @MJAIPromptRuns_ChildPromptID_ErrorMessage, @MJAIPromptRuns_ChildPromptID_ParentID, @MJAIPromptRuns_ChildPromptID_RunType, @MJAIPromptRuns_ChildPromptID_ExecutionOrder, @MJAIPromptRuns_ChildPromptID_Cost, @MJAIPromptRuns_ChildPromptID_CostCurrency, @MJAIPromptRuns_ChildPromptID_TokensUsedRollup, @MJAIPromptRuns_ChildPromptID_TokensPromptRollup, @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, @MJAIPromptRuns_ChildPromptID_Temperature, @MJAIPromptRuns_ChildPromptID_TopP, @MJAIPromptRuns_ChildPromptID_TopK, @MJAIPromptRuns_ChildPromptID_MinP, @MJAIPromptRuns_ChildPromptID_FrequencyPenalty, @MJAIPromptRuns_ChildPromptID_PresencePenalty, @MJAIPromptRuns_ChildPromptID_Seed, @MJAIPromptRuns_ChildPromptID_StopSequences, @MJAIPromptRuns_ChildPromptID_ResponseFormat, @MJAIPromptRuns_ChildPromptID_LogProbs, @MJAIPromptRuns_ChildPromptID_TopLogProbs, @MJAIPromptRuns_ChildPromptID_DescendantCost, @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, @MJAIPromptRuns_ChildPromptID_FinalValidationPassed, @MJAIPromptRuns_ChildPromptID_ValidationBehavior, @MJAIPromptRuns_ChildPromptID_RetryStrategy, @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, @MJAIPromptRuns_ChildPromptID_FinalValidationError, @MJAIPromptRuns_ChildPromptID_ValidationErrorCount, @MJAIPromptRuns_ChildPromptID_CommonValidationError, @MJAIPromptRuns_ChildPromptID_FirstAttemptAt, @MJAIPromptRuns_ChildPromptID_LastAttemptAt, @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, @MJAIPromptRuns_ChildPromptID_ValidationAttempts, @MJAIPromptRuns_ChildPromptID_ValidationSummary, @MJAIPromptRuns_ChildPromptID_FailoverAttempts, @MJAIPromptRuns_ChildPromptID_FailoverErrors, @MJAIPromptRuns_ChildPromptID_FailoverDurations, @MJAIPromptRuns_ChildPromptID_OriginalModelID, @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, @MJAIPromptRuns_ChildPromptID_ModelSelection, @MJAIPromptRuns_ChildPromptID_Status, @MJAIPromptRuns_ChildPromptID_Cancelled, @MJAIPromptRuns_ChildPromptID_CancellationReason, @MJAIPromptRuns_ChildPromptID_ModelPowerRank, @MJAIPromptRuns_ChildPromptID_SelectionStrategy, @MJAIPromptRuns_ChildPromptID_CacheHit, @MJAIPromptRuns_ChildPromptID_CacheKey, @MJAIPromptRuns_ChildPromptID_JudgeID, @MJAIPromptRuns_ChildPromptID_JudgeScore, @MJAIPromptRuns_ChildPromptID_WasSelectedResult, @MJAIPromptRuns_ChildPromptID_StreamingEnabled, @MJAIPromptRuns_ChildPromptID_FirstTokenTime, @MJAIPromptRuns_ChildPromptID_ErrorDetails, @MJAIPromptRuns_ChildPromptID_ChildPromptID, @MJAIPromptRuns_ChildPromptID_QueueTime, @MJAIPromptRuns_ChildPromptID_PromptTime, @MJAIPromptRuns_ChildPromptID_CompletionTime, @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, @MJAIPromptRuns_ChildPromptID_EffortLevel, @MJAIPromptRuns_ChildPromptID_RunName, @MJAIPromptRuns_ChildPromptID_Comments, @MJAIPromptRuns_ChildPromptID_TestRunID, @MJAIPromptRuns_ChildPromptID_AssistantPrefill, @MJAIPromptRuns_ChildPromptID_TokensCacheRead, @MJAIPromptRuns_ChildPromptID_TokensCacheWrite, @MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup, @MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup, @MJAIPromptRuns_ChildPromptID_InputUnitsUsed, @MJAIPromptRuns_ChildPromptID_OutputUnitsUsed, @MJAIPromptRuns_ChildPromptID_UsageTypeID, @MJAIPromptRuns_ChildPromptID_ToolCallingMode, @MJAIPromptRuns_ChildPromptID_UserID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_ChildPromptID_ChildPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_ChildPromptIDID, @PromptID = @MJAIPromptRuns_ChildPromptID_PromptID, @ModelID = @MJAIPromptRuns_ChildPromptID_ModelID, @VendorID = @MJAIPromptRuns_ChildPromptID_VendorID, @AgentID = @MJAIPromptRuns_ChildPromptID_AgentID, @ConfigurationID = @MJAIPromptRuns_ChildPromptID_ConfigurationID, @RunAt = @MJAIPromptRuns_ChildPromptID_RunAt, @CompletedAt = @MJAIPromptRuns_ChildPromptID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_ChildPromptID_Messages, @Result = @MJAIPromptRuns_ChildPromptID_Result, @TokensUsed = @MJAIPromptRuns_ChildPromptID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_ChildPromptID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_ChildPromptID_TokensCompletion, @TotalCost = @MJAIPromptRuns_ChildPromptID_TotalCost, @Success = @MJAIPromptRuns_ChildPromptID_Success, @ErrorMessage = @MJAIPromptRuns_ChildPromptID_ErrorMessage, @ParentID = @MJAIPromptRuns_ChildPromptID_ParentID, @RunType = @MJAIPromptRuns_ChildPromptID_RunType, @ExecutionOrder = @MJAIPromptRuns_ChildPromptID_ExecutionOrder, @Cost = @MJAIPromptRuns_ChildPromptID_Cost, @CostCurrency = @MJAIPromptRuns_ChildPromptID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_ChildPromptID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_ChildPromptID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_ChildPromptID_Temperature, @TopP = @MJAIPromptRuns_ChildPromptID_TopP, @TopK = @MJAIPromptRuns_ChildPromptID_TopK, @MinP = @MJAIPromptRuns_ChildPromptID_MinP, @FrequencyPenalty = @MJAIPromptRuns_ChildPromptID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_ChildPromptID_PresencePenalty, @Seed = @MJAIPromptRuns_ChildPromptID_Seed, @StopSequences = @MJAIPromptRuns_ChildPromptID_StopSequences, @ResponseFormat = @MJAIPromptRuns_ChildPromptID_ResponseFormat, @LogProbs = @MJAIPromptRuns_ChildPromptID_LogProbs, @TopLogProbs = @MJAIPromptRuns_ChildPromptID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_ChildPromptID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_ChildPromptID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_ChildPromptID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_ChildPromptID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_ChildPromptID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_ChildPromptID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_ChildPromptID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_ChildPromptID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_ChildPromptID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_ChildPromptID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_ChildPromptID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_ChildPromptID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_ChildPromptID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_ChildPromptID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_ChildPromptID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_ChildPromptID_ModelSelection, @Status = @MJAIPromptRuns_ChildPromptID_Status, @Cancelled = @MJAIPromptRuns_ChildPromptID_Cancelled, @CancellationReason = @MJAIPromptRuns_ChildPromptID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_ChildPromptID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_ChildPromptID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_ChildPromptID_CacheHit, @CacheKey = @MJAIPromptRuns_ChildPromptID_CacheKey, @JudgeID = @MJAIPromptRuns_ChildPromptID_JudgeID, @JudgeScore = @MJAIPromptRuns_ChildPromptID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_ChildPromptID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_ChildPromptID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_ChildPromptID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_ChildPromptID_ErrorDetails, @ChildPromptID_Clear = 1, @ChildPromptID = @MJAIPromptRuns_ChildPromptID_ChildPromptID, @QueueTime = @MJAIPromptRuns_ChildPromptID_QueueTime, @PromptTime = @MJAIPromptRuns_ChildPromptID_PromptTime, @CompletionTime = @MJAIPromptRuns_ChildPromptID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_ChildPromptID_EffortLevel, @RunName = @MJAIPromptRuns_ChildPromptID_RunName, @Comments = @MJAIPromptRuns_ChildPromptID_Comments, @TestRunID = @MJAIPromptRuns_ChildPromptID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_ChildPromptID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_ChildPromptID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_ChildPromptID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup, @InputUnitsUsed = @MJAIPromptRuns_ChildPromptID_InputUnitsUsed, @OutputUnitsUsed = @MJAIPromptRuns_ChildPromptID_OutputUnitsUsed, @UsageTypeID = @MJAIPromptRuns_ChildPromptID_UsageTypeID, @ToolCallingMode = @MJAIPromptRuns_ChildPromptID_ToolCallingMode, @UserID = @MJAIPromptRuns_ChildPromptID_UserID

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_ChildPromptID_cursor INTO @MJAIPromptRuns_ChildPromptIDID, @MJAIPromptRuns_ChildPromptID_PromptID, @MJAIPromptRuns_ChildPromptID_ModelID, @MJAIPromptRuns_ChildPromptID_VendorID, @MJAIPromptRuns_ChildPromptID_AgentID, @MJAIPromptRuns_ChildPromptID_ConfigurationID, @MJAIPromptRuns_ChildPromptID_RunAt, @MJAIPromptRuns_ChildPromptID_CompletedAt, @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, @MJAIPromptRuns_ChildPromptID_Messages, @MJAIPromptRuns_ChildPromptID_Result, @MJAIPromptRuns_ChildPromptID_TokensUsed, @MJAIPromptRuns_ChildPromptID_TokensPrompt, @MJAIPromptRuns_ChildPromptID_TokensCompletion, @MJAIPromptRuns_ChildPromptID_TotalCost, @MJAIPromptRuns_ChildPromptID_Success, @MJAIPromptRuns_ChildPromptID_ErrorMessage, @MJAIPromptRuns_ChildPromptID_ParentID, @MJAIPromptRuns_ChildPromptID_RunType, @MJAIPromptRuns_ChildPromptID_ExecutionOrder, @MJAIPromptRuns_ChildPromptID_Cost, @MJAIPromptRuns_ChildPromptID_CostCurrency, @MJAIPromptRuns_ChildPromptID_TokensUsedRollup, @MJAIPromptRuns_ChildPromptID_TokensPromptRollup, @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, @MJAIPromptRuns_ChildPromptID_Temperature, @MJAIPromptRuns_ChildPromptID_TopP, @MJAIPromptRuns_ChildPromptID_TopK, @MJAIPromptRuns_ChildPromptID_MinP, @MJAIPromptRuns_ChildPromptID_FrequencyPenalty, @MJAIPromptRuns_ChildPromptID_PresencePenalty, @MJAIPromptRuns_ChildPromptID_Seed, @MJAIPromptRuns_ChildPromptID_StopSequences, @MJAIPromptRuns_ChildPromptID_ResponseFormat, @MJAIPromptRuns_ChildPromptID_LogProbs, @MJAIPromptRuns_ChildPromptID_TopLogProbs, @MJAIPromptRuns_ChildPromptID_DescendantCost, @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, @MJAIPromptRuns_ChildPromptID_FinalValidationPassed, @MJAIPromptRuns_ChildPromptID_ValidationBehavior, @MJAIPromptRuns_ChildPromptID_RetryStrategy, @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, @MJAIPromptRuns_ChildPromptID_FinalValidationError, @MJAIPromptRuns_ChildPromptID_ValidationErrorCount, @MJAIPromptRuns_ChildPromptID_CommonValidationError, @MJAIPromptRuns_ChildPromptID_FirstAttemptAt, @MJAIPromptRuns_ChildPromptID_LastAttemptAt, @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, @MJAIPromptRuns_ChildPromptID_ValidationAttempts, @MJAIPromptRuns_ChildPromptID_ValidationSummary, @MJAIPromptRuns_ChildPromptID_FailoverAttempts, @MJAIPromptRuns_ChildPromptID_FailoverErrors, @MJAIPromptRuns_ChildPromptID_FailoverDurations, @MJAIPromptRuns_ChildPromptID_OriginalModelID, @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, @MJAIPromptRuns_ChildPromptID_ModelSelection, @MJAIPromptRuns_ChildPromptID_Status, @MJAIPromptRuns_ChildPromptID_Cancelled, @MJAIPromptRuns_ChildPromptID_CancellationReason, @MJAIPromptRuns_ChildPromptID_ModelPowerRank, @MJAIPromptRuns_ChildPromptID_SelectionStrategy, @MJAIPromptRuns_ChildPromptID_CacheHit, @MJAIPromptRuns_ChildPromptID_CacheKey, @MJAIPromptRuns_ChildPromptID_JudgeID, @MJAIPromptRuns_ChildPromptID_JudgeScore, @MJAIPromptRuns_ChildPromptID_WasSelectedResult, @MJAIPromptRuns_ChildPromptID_StreamingEnabled, @MJAIPromptRuns_ChildPromptID_FirstTokenTime, @MJAIPromptRuns_ChildPromptID_ErrorDetails, @MJAIPromptRuns_ChildPromptID_ChildPromptID, @MJAIPromptRuns_ChildPromptID_QueueTime, @MJAIPromptRuns_ChildPromptID_PromptTime, @MJAIPromptRuns_ChildPromptID_CompletionTime, @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, @MJAIPromptRuns_ChildPromptID_EffortLevel, @MJAIPromptRuns_ChildPromptID_RunName, @MJAIPromptRuns_ChildPromptID_Comments, @MJAIPromptRuns_ChildPromptID_TestRunID, @MJAIPromptRuns_ChildPromptID_AssistantPrefill, @MJAIPromptRuns_ChildPromptID_TokensCacheRead, @MJAIPromptRuns_ChildPromptID_TokensCacheWrite, @MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup, @MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup, @MJAIPromptRuns_ChildPromptID_InputUnitsUsed, @MJAIPromptRuns_ChildPromptID_OutputUnitsUsed, @MJAIPromptRuns_ChildPromptID_UsageTypeID, @MJAIPromptRuns_ChildPromptID_ToolCallingMode, @MJAIPromptRuns_ChildPromptID_UserID
    END

    CLOSE cascade_update_MJAIPromptRuns_ChildPromptID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_ChildPromptID_cursor
    
    -- Cascade update on AIPrompt using cursor to call spUpdateAIPrompt
    DECLARE @MJAIPrompts_ResultSelectorPromptIDID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Name nvarchar(255)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Description nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TemplateID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CategoryID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TypeID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Status nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ResponseFormat nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_MinPowerRank int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PowerPreference nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ParallelCount int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam nvarchar(100)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_OutputType nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_OutputExample nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_MaxRetries int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_RetryStrategy nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_EnableCaching bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMatchType nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold float(53)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PromptRole nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PromptPosition nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Temperature decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TopP decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TopK int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_MinP decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Seed int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_StopSequences nvarchar(1000)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TopLogProbs int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_EffortLevel int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PromptConfiguration nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TemplateDataCapture nvarchar(20)
    DECLARE cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [TemplateID], [CategoryID], [TypeID], [Status], [ResponseFormat], [ModelSpecificResponseFormat], [AIModelTypeID], [MinPowerRank], [SelectionStrategy], [PowerPreference], [ParallelizationMode], [ParallelCount], [ParallelConfigParam], [OutputType], [OutputExample], [ValidationBehavior], [MaxRetries], [RetryDelayMS], [RetryStrategy], [ResultSelectorPromptID], [EnableCaching], [CacheTTLSeconds], [CacheMatchType], [CacheSimilarityThreshold], [CacheMustMatchModel], [CacheMustMatchVendor], [CacheMustMatchAgent], [CacheMustMatchConfig], [PromptRole], [PromptPosition], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [IncludeLogProbs], [TopLogProbs], [FailoverStrategy], [FailoverMaxAttempts], [FailoverDelaySeconds], [FailoverModelStrategy], [FailoverErrorScope], [EffortLevel], [AssistantPrefill], [PrefillFallbackMode], [RequireSpecificModels], [PromptConfiguration], [TemplateDataCapture]
        FROM [${flyway:defaultSchema}].[AIPrompt]
        WHERE [ResultSelectorPromptID] = @ID

    OPEN cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor INTO @MJAIPrompts_ResultSelectorPromptIDID, @MJAIPrompts_ResultSelectorPromptID_Name, @MJAIPrompts_ResultSelectorPromptID_Description, @MJAIPrompts_ResultSelectorPromptID_TemplateID, @MJAIPrompts_ResultSelectorPromptID_CategoryID, @MJAIPrompts_ResultSelectorPromptID_TypeID, @MJAIPrompts_ResultSelectorPromptID_Status, @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @MJAIPrompts_ResultSelectorPromptID_OutputType, @MJAIPrompts_ResultSelectorPromptID_OutputExample, @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @MJAIPrompts_ResultSelectorPromptID_PromptRole, @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @MJAIPrompts_ResultSelectorPromptID_Temperature, @MJAIPrompts_ResultSelectorPromptID_TopP, @MJAIPrompts_ResultSelectorPromptID_TopK, @MJAIPrompts_ResultSelectorPromptID_MinP, @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @MJAIPrompts_ResultSelectorPromptID_Seed, @MJAIPrompts_ResultSelectorPromptID_StopSequences, @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @MJAIPrompts_ResultSelectorPromptID_EffortLevel, @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels, @MJAIPrompts_ResultSelectorPromptID_PromptConfiguration, @MJAIPrompts_ResultSelectorPromptID_TemplateDataCapture

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPrompt] @ID = @MJAIPrompts_ResultSelectorPromptIDID, @Name = @MJAIPrompts_ResultSelectorPromptID_Name, @Description = @MJAIPrompts_ResultSelectorPromptID_Description, @TemplateID = @MJAIPrompts_ResultSelectorPromptID_TemplateID, @CategoryID = @MJAIPrompts_ResultSelectorPromptID_CategoryID, @TypeID = @MJAIPrompts_ResultSelectorPromptID_TypeID, @Status = @MJAIPrompts_ResultSelectorPromptID_Status, @ResponseFormat = @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @ModelSpecificResponseFormat = @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @AIModelTypeID = @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MinPowerRank = @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @SelectionStrategy = @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @PowerPreference = @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @ParallelizationMode = @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @ParallelCount = @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @ParallelConfigParam = @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @OutputType = @MJAIPrompts_ResultSelectorPromptID_OutputType, @OutputExample = @MJAIPrompts_ResultSelectorPromptID_OutputExample, @ValidationBehavior = @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MaxRetries = @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @RetryDelayMS = @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @RetryStrategy = @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @ResultSelectorPromptID_Clear = 1, @ResultSelectorPromptID = @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @EnableCaching = @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @CacheTTLSeconds = @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @CacheMatchType = @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @CacheSimilarityThreshold = @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @CacheMustMatchModel = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @CacheMustMatchVendor = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @CacheMustMatchAgent = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @CacheMustMatchConfig = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @PromptRole = @MJAIPrompts_ResultSelectorPromptID_PromptRole, @PromptPosition = @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @Temperature = @MJAIPrompts_ResultSelectorPromptID_Temperature, @TopP = @MJAIPrompts_ResultSelectorPromptID_TopP, @TopK = @MJAIPrompts_ResultSelectorPromptID_TopK, @MinP = @MJAIPrompts_ResultSelectorPromptID_MinP, @FrequencyPenalty = @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @PresencePenalty = @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @Seed = @MJAIPrompts_ResultSelectorPromptID_Seed, @StopSequences = @MJAIPrompts_ResultSelectorPromptID_StopSequences, @IncludeLogProbs = @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @TopLogProbs = @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @FailoverStrategy = @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @FailoverMaxAttempts = @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @FailoverDelaySeconds = @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @FailoverModelStrategy = @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @FailoverErrorScope = @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @EffortLevel = @MJAIPrompts_ResultSelectorPromptID_EffortLevel, @AssistantPrefill = @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, @PrefillFallbackMode = @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, @RequireSpecificModels = @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels, @PromptConfiguration = @MJAIPrompts_ResultSelectorPromptID_PromptConfiguration, @TemplateDataCapture = @MJAIPrompts_ResultSelectorPromptID_TemplateDataCapture

        FETCH NEXT FROM cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor INTO @MJAIPrompts_ResultSelectorPromptIDID, @MJAIPrompts_ResultSelectorPromptID_Name, @MJAIPrompts_ResultSelectorPromptID_Description, @MJAIPrompts_ResultSelectorPromptID_TemplateID, @MJAIPrompts_ResultSelectorPromptID_CategoryID, @MJAIPrompts_ResultSelectorPromptID_TypeID, @MJAIPrompts_ResultSelectorPromptID_Status, @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @MJAIPrompts_ResultSelectorPromptID_OutputType, @MJAIPrompts_ResultSelectorPromptID_OutputExample, @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @MJAIPrompts_ResultSelectorPromptID_PromptRole, @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @MJAIPrompts_ResultSelectorPromptID_Temperature, @MJAIPrompts_ResultSelectorPromptID_TopP, @MJAIPrompts_ResultSelectorPromptID_TopK, @MJAIPrompts_ResultSelectorPromptID_MinP, @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @MJAIPrompts_ResultSelectorPromptID_Seed, @MJAIPrompts_ResultSelectorPromptID_StopSequences, @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @MJAIPrompts_ResultSelectorPromptID_EffortLevel, @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels, @MJAIPrompts_ResultSelectorPromptID_PromptConfiguration, @MJAIPrompts_ResultSelectorPromptID_TemplateDataCapture
    END

    CLOSE cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor
    DEALLOCATE cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor
    
    -- Cascade delete from AIResultCache using cursor to call spDeleteAIResultCache
    DECLARE @MJAIResultCache_AIPromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIResultCache_AIPromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIResultCache]
        WHERE [AIPromptID] = @ID
    
    OPEN cascade_delete_MJAIResultCache_AIPromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIResultCache_AIPromptID_cursor INTO @MJAIResultCache_AIPromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIResultCache] @ID = @MJAIResultCache_AIPromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIResultCache_AIPromptID_cursor INTO @MJAIResultCache_AIPromptIDID
    END
    
    CLOSE cascade_delete_MJAIResultCache_AIPromptID_cursor
    DEALLOCATE cascade_delete_MJAIResultCache_AIPromptID_cursor
    
    -- Cascade update on Action using cursor to call spUpdateAction
    DECLARE @MJActions_DefaultCompactPromptIDID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_CategoryID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_Name nvarchar(425)
    DECLARE @MJActions_DefaultCompactPromptID_Description nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_Type nvarchar(20)
    DECLARE @MJActions_DefaultCompactPromptID_UserPrompt nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_UserComments nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_Code nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_CodeComments nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovalStatus nvarchar(20)
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovalComments nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovedByUserID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovedAt datetimeoffset
    DECLARE @MJActions_DefaultCompactPromptID_CodeLocked bit
    DECLARE @MJActions_DefaultCompactPromptID_ForceCodeGeneration bit
    DECLARE @MJActions_DefaultCompactPromptID_RetentionPeriod int
    DECLARE @MJActions_DefaultCompactPromptID_Status nvarchar(20)
    DECLARE @MJActions_DefaultCompactPromptID_DriverClass nvarchar(255)
    DECLARE @MJActions_DefaultCompactPromptID_ParentID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_IconClass nvarchar(100)
    DECLARE @MJActions_DefaultCompactPromptID_DefaultCompactPromptID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_Config nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS int
    DECLARE @MJActions_DefaultCompactPromptID_CreatedByAgentID uniqueidentifier
    DECLARE cascade_update_MJActions_DefaultCompactPromptID_cursor CURSOR FOR
        SELECT [ID], [CategoryID], [Name], [Description], [Type], [UserPrompt], [UserComments], [Code], [CodeComments], [CodeApprovalStatus], [CodeApprovalComments], [CodeApprovedByUserID], [CodeApprovedAt], [CodeLocked], [ForceCodeGeneration], [RetentionPeriod], [Status], [DriverClass], [ParentID], [IconClass], [DefaultCompactPromptID], [Config], [RuntimeActionConfiguration], [MaxExecutionTimeMS], [CreatedByAgentID]
        FROM [${flyway:defaultSchema}].[Action]
        WHERE [DefaultCompactPromptID] = @ID

    OPEN cascade_update_MJActions_DefaultCompactPromptID_cursor
    FETCH NEXT FROM cascade_update_MJActions_DefaultCompactPromptID_cursor INTO @MJActions_DefaultCompactPromptIDID, @MJActions_DefaultCompactPromptID_CategoryID, @MJActions_DefaultCompactPromptID_Name, @MJActions_DefaultCompactPromptID_Description, @MJActions_DefaultCompactPromptID_Type, @MJActions_DefaultCompactPromptID_UserPrompt, @MJActions_DefaultCompactPromptID_UserComments, @MJActions_DefaultCompactPromptID_Code, @MJActions_DefaultCompactPromptID_CodeComments, @MJActions_DefaultCompactPromptID_CodeApprovalStatus, @MJActions_DefaultCompactPromptID_CodeApprovalComments, @MJActions_DefaultCompactPromptID_CodeApprovedByUserID, @MJActions_DefaultCompactPromptID_CodeApprovedAt, @MJActions_DefaultCompactPromptID_CodeLocked, @MJActions_DefaultCompactPromptID_ForceCodeGeneration, @MJActions_DefaultCompactPromptID_RetentionPeriod, @MJActions_DefaultCompactPromptID_Status, @MJActions_DefaultCompactPromptID_DriverClass, @MJActions_DefaultCompactPromptID_ParentID, @MJActions_DefaultCompactPromptID_IconClass, @MJActions_DefaultCompactPromptID_DefaultCompactPromptID, @MJActions_DefaultCompactPromptID_Config, @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration, @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS, @MJActions_DefaultCompactPromptID_CreatedByAgentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJActions_DefaultCompactPromptID_DefaultCompactPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAction] @ID = @MJActions_DefaultCompactPromptIDID, @CategoryID = @MJActions_DefaultCompactPromptID_CategoryID, @Name = @MJActions_DefaultCompactPromptID_Name, @Description = @MJActions_DefaultCompactPromptID_Description, @Type = @MJActions_DefaultCompactPromptID_Type, @UserPrompt = @MJActions_DefaultCompactPromptID_UserPrompt, @UserComments = @MJActions_DefaultCompactPromptID_UserComments, @Code = @MJActions_DefaultCompactPromptID_Code, @CodeComments = @MJActions_DefaultCompactPromptID_CodeComments, @CodeApprovalStatus = @MJActions_DefaultCompactPromptID_CodeApprovalStatus, @CodeApprovalComments = @MJActions_DefaultCompactPromptID_CodeApprovalComments, @CodeApprovedByUserID = @MJActions_DefaultCompactPromptID_CodeApprovedByUserID, @CodeApprovedAt = @MJActions_DefaultCompactPromptID_CodeApprovedAt, @CodeLocked = @MJActions_DefaultCompactPromptID_CodeLocked, @ForceCodeGeneration = @MJActions_DefaultCompactPromptID_ForceCodeGeneration, @RetentionPeriod = @MJActions_DefaultCompactPromptID_RetentionPeriod, @Status = @MJActions_DefaultCompactPromptID_Status, @DriverClass = @MJActions_DefaultCompactPromptID_DriverClass, @ParentID = @MJActions_DefaultCompactPromptID_ParentID, @IconClass = @MJActions_DefaultCompactPromptID_IconClass, @DefaultCompactPromptID_Clear = 1, @DefaultCompactPromptID = @MJActions_DefaultCompactPromptID_DefaultCompactPromptID, @Config = @MJActions_DefaultCompactPromptID_Config, @RuntimeActionConfiguration = @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration, @MaxExecutionTimeMS = @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS, @CreatedByAgentID = @MJActions_DefaultCompactPromptID_CreatedByAgentID

        FETCH NEXT FROM cascade_update_MJActions_DefaultCompactPromptID_cursor INTO @MJActions_DefaultCompactPromptIDID, @MJActions_DefaultCompactPromptID_CategoryID, @MJActions_DefaultCompactPromptID_Name, @MJActions_DefaultCompactPromptID_Description, @MJActions_DefaultCompactPromptID_Type, @MJActions_DefaultCompactPromptID_UserPrompt, @MJActions_DefaultCompactPromptID_UserComments, @MJActions_DefaultCompactPromptID_Code, @MJActions_DefaultCompactPromptID_CodeComments, @MJActions_DefaultCompactPromptID_CodeApprovalStatus, @MJActions_DefaultCompactPromptID_CodeApprovalComments, @MJActions_DefaultCompactPromptID_CodeApprovedByUserID, @MJActions_DefaultCompactPromptID_CodeApprovedAt, @MJActions_DefaultCompactPromptID_CodeLocked, @MJActions_DefaultCompactPromptID_ForceCodeGeneration, @MJActions_DefaultCompactPromptID_RetentionPeriod, @MJActions_DefaultCompactPromptID_Status, @MJActions_DefaultCompactPromptID_DriverClass, @MJActions_DefaultCompactPromptID_ParentID, @MJActions_DefaultCompactPromptID_IconClass, @MJActions_DefaultCompactPromptID_DefaultCompactPromptID, @MJActions_DefaultCompactPromptID_Config, @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration, @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS, @MJActions_DefaultCompactPromptID_CreatedByAgentID
    END

    CLOSE cascade_update_MJActions_DefaultCompactPromptID_cursor
    DEALLOCATE cascade_update_MJActions_DefaultCompactPromptID_cursor
    
    -- Cascade update on EntityDocument using cursor to call spUpdateEntityDocument
    DECLARE @MJEntityDocuments_ReasoningPromptIDID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_Name nvarchar(250)
    DECLARE @MJEntityDocuments_ReasoningPromptID_TypeID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_EntityID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_VectorDatabaseID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_Status nvarchar(15)
    DECLARE @MJEntityDocuments_ReasoningPromptID_TemplateID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_AIModelID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_PotentialMatchThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningPromptID_AbsoluteMatchThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningPromptID_VectorIndexID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_Configuration nvarchar(MAX)
    DECLARE @MJEntityDocuments_ReasoningPromptID_EnableLLMReasoning bit
    DECLARE @MJEntityDocuments_ReasoningPromptID_ReasoningMode nvarchar(20)
    DECLARE @MJEntityDocuments_ReasoningPromptID_ReasoningThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningPromptID_ReasoningPromptID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_ReasoningAgentID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_AutomationLevel nvarchar(30)
    DECLARE cascade_update_MJEntityDocuments_ReasoningPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [TypeID], [EntityID], [VectorDatabaseID], [Status], [TemplateID], [AIModelID], [PotentialMatchThreshold], [AbsoluteMatchThreshold], [VectorIndexID], [Configuration], [EnableLLMReasoning], [ReasoningMode], [ReasoningThreshold], [ReasoningPromptID], [ReasoningAgentID], [AutomationLevel]
        FROM [${flyway:defaultSchema}].[EntityDocument]
        WHERE [ReasoningPromptID] = @ID

    OPEN cascade_update_MJEntityDocuments_ReasoningPromptID_cursor
    FETCH NEXT FROM cascade_update_MJEntityDocuments_ReasoningPromptID_cursor INTO @MJEntityDocuments_ReasoningPromptIDID, @MJEntityDocuments_ReasoningPromptID_Name, @MJEntityDocuments_ReasoningPromptID_TypeID, @MJEntityDocuments_ReasoningPromptID_EntityID, @MJEntityDocuments_ReasoningPromptID_VectorDatabaseID, @MJEntityDocuments_ReasoningPromptID_Status, @MJEntityDocuments_ReasoningPromptID_TemplateID, @MJEntityDocuments_ReasoningPromptID_AIModelID, @MJEntityDocuments_ReasoningPromptID_PotentialMatchThreshold, @MJEntityDocuments_ReasoningPromptID_AbsoluteMatchThreshold, @MJEntityDocuments_ReasoningPromptID_VectorIndexID, @MJEntityDocuments_ReasoningPromptID_Configuration, @MJEntityDocuments_ReasoningPromptID_EnableLLMReasoning, @MJEntityDocuments_ReasoningPromptID_ReasoningMode, @MJEntityDocuments_ReasoningPromptID_ReasoningThreshold, @MJEntityDocuments_ReasoningPromptID_ReasoningPromptID, @MJEntityDocuments_ReasoningPromptID_ReasoningAgentID, @MJEntityDocuments_ReasoningPromptID_AutomationLevel

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJEntityDocuments_ReasoningPromptID_ReasoningPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateEntityDocument] @ID = @MJEntityDocuments_ReasoningPromptIDID, @Name = @MJEntityDocuments_ReasoningPromptID_Name, @TypeID = @MJEntityDocuments_ReasoningPromptID_TypeID, @EntityID = @MJEntityDocuments_ReasoningPromptID_EntityID, @VectorDatabaseID = @MJEntityDocuments_ReasoningPromptID_VectorDatabaseID, @Status = @MJEntityDocuments_ReasoningPromptID_Status, @TemplateID = @MJEntityDocuments_ReasoningPromptID_TemplateID, @AIModelID = @MJEntityDocuments_ReasoningPromptID_AIModelID, @PotentialMatchThreshold = @MJEntityDocuments_ReasoningPromptID_PotentialMatchThreshold, @AbsoluteMatchThreshold = @MJEntityDocuments_ReasoningPromptID_AbsoluteMatchThreshold, @VectorIndexID = @MJEntityDocuments_ReasoningPromptID_VectorIndexID, @Configuration = @MJEntityDocuments_ReasoningPromptID_Configuration, @EnableLLMReasoning = @MJEntityDocuments_ReasoningPromptID_EnableLLMReasoning, @ReasoningMode = @MJEntityDocuments_ReasoningPromptID_ReasoningMode, @ReasoningThreshold = @MJEntityDocuments_ReasoningPromptID_ReasoningThreshold, @ReasoningPromptID_Clear = 1, @ReasoningPromptID = @MJEntityDocuments_ReasoningPromptID_ReasoningPromptID, @ReasoningAgentID = @MJEntityDocuments_ReasoningPromptID_ReasoningAgentID, @AutomationLevel = @MJEntityDocuments_ReasoningPromptID_AutomationLevel

        FETCH NEXT FROM cascade_update_MJEntityDocuments_ReasoningPromptID_cursor INTO @MJEntityDocuments_ReasoningPromptIDID, @MJEntityDocuments_ReasoningPromptID_Name, @MJEntityDocuments_ReasoningPromptID_TypeID, @MJEntityDocuments_ReasoningPromptID_EntityID, @MJEntityDocuments_ReasoningPromptID_VectorDatabaseID, @MJEntityDocuments_ReasoningPromptID_Status, @MJEntityDocuments_ReasoningPromptID_TemplateID, @MJEntityDocuments_ReasoningPromptID_AIModelID, @MJEntityDocuments_ReasoningPromptID_PotentialMatchThreshold, @MJEntityDocuments_ReasoningPromptID_AbsoluteMatchThreshold, @MJEntityDocuments_ReasoningPromptID_VectorIndexID, @MJEntityDocuments_ReasoningPromptID_Configuration, @MJEntityDocuments_ReasoningPromptID_EnableLLMReasoning, @MJEntityDocuments_ReasoningPromptID_ReasoningMode, @MJEntityDocuments_ReasoningPromptID_ReasoningThreshold, @MJEntityDocuments_ReasoningPromptID_ReasoningPromptID, @MJEntityDocuments_ReasoningPromptID_ReasoningAgentID, @MJEntityDocuments_ReasoningPromptID_AutomationLevel
    END

    CLOSE cascade_update_MJEntityDocuments_ReasoningPromptID_cursor
    DEALLOCATE cascade_update_MJEntityDocuments_ReasoningPromptID_cursor
    
    -- Cascade delete from FeatureValueCache using cursor to call spDeleteFeatureValueCache
    DECLARE @MJFeatureValueCaches_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJFeatureValueCaches_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[FeatureValueCache]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJFeatureValueCaches_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJFeatureValueCaches_PromptID_cursor INTO @MJFeatureValueCaches_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteFeatureValueCache] @ID = @MJFeatureValueCaches_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJFeatureValueCaches_PromptID_cursor INTO @MJFeatureValueCaches_PromptIDID
    END
    
    CLOSE cascade_delete_MJFeatureValueCaches_PromptID_cursor
    DEALLOCATE cascade_delete_MJFeatureValueCaches_PromptID_cursor
    
    -- Cascade update on FeatureValue using cursor to call spUpdateFeatureValue
    DECLARE @MJFeatureValues_PromptIDID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_RecordProcessID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_EntityID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_RecordID nvarchar(900)
    DECLARE @MJFeatureValues_PromptID_FeatureName nvarchar(255)
    DECLARE @MJFeatureValues_PromptID_ValueText nvarchar(MAX)
    DECLARE @MJFeatureValues_PromptID_ValueNumeric float(53)
    DECLARE @MJFeatureValues_PromptID_ValueDate datetimeoffset
    DECLARE @MJFeatureValues_PromptID_ValueBoolean bit
    DECLARE @MJFeatureValues_PromptID_ValueJSON nvarchar(MAX)
    DECLARE @MJFeatureValues_PromptID_Reasoning nvarchar(MAX)
    DECLARE @MJFeatureValues_PromptID_Confidence float(53)
    DECLARE @MJFeatureValues_PromptID_PromptID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_PromptVersionHash nvarchar(64)
    DECLARE @MJFeatureValues_PromptID_ConstraintHash nvarchar(64)
    DECLARE @MJFeatureValues_PromptID_ProcessRunID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_ProcessRunDetailID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_AIPromptRunID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_FeatureValueCacheID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_ComputedAt datetimeoffset
    DECLARE cascade_update_MJFeatureValues_PromptID_cursor CURSOR FOR
        SELECT [ID], [RecordProcessID], [EntityID], [RecordID], [FeatureName], [ValueText], [ValueNumeric], [ValueDate], [ValueBoolean], [ValueJSON], [Reasoning], [Confidence], [PromptID], [PromptVersionHash], [ConstraintHash], [ProcessRunID], [ProcessRunDetailID], [AIPromptRunID], [FeatureValueCacheID], [ComputedAt]
        FROM [${flyway:defaultSchema}].[FeatureValue]
        WHERE [PromptID] = @ID

    OPEN cascade_update_MJFeatureValues_PromptID_cursor
    FETCH NEXT FROM cascade_update_MJFeatureValues_PromptID_cursor INTO @MJFeatureValues_PromptIDID, @MJFeatureValues_PromptID_RecordProcessID, @MJFeatureValues_PromptID_EntityID, @MJFeatureValues_PromptID_RecordID, @MJFeatureValues_PromptID_FeatureName, @MJFeatureValues_PromptID_ValueText, @MJFeatureValues_PromptID_ValueNumeric, @MJFeatureValues_PromptID_ValueDate, @MJFeatureValues_PromptID_ValueBoolean, @MJFeatureValues_PromptID_ValueJSON, @MJFeatureValues_PromptID_Reasoning, @MJFeatureValues_PromptID_Confidence, @MJFeatureValues_PromptID_PromptID, @MJFeatureValues_PromptID_PromptVersionHash, @MJFeatureValues_PromptID_ConstraintHash, @MJFeatureValues_PromptID_ProcessRunID, @MJFeatureValues_PromptID_ProcessRunDetailID, @MJFeatureValues_PromptID_AIPromptRunID, @MJFeatureValues_PromptID_FeatureValueCacheID, @MJFeatureValues_PromptID_ComputedAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJFeatureValues_PromptID_PromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateFeatureValue] @ID = @MJFeatureValues_PromptIDID, @RecordProcessID = @MJFeatureValues_PromptID_RecordProcessID, @EntityID = @MJFeatureValues_PromptID_EntityID, @RecordID = @MJFeatureValues_PromptID_RecordID, @FeatureName = @MJFeatureValues_PromptID_FeatureName, @ValueText = @MJFeatureValues_PromptID_ValueText, @ValueNumeric = @MJFeatureValues_PromptID_ValueNumeric, @ValueDate = @MJFeatureValues_PromptID_ValueDate, @ValueBoolean = @MJFeatureValues_PromptID_ValueBoolean, @ValueJSON = @MJFeatureValues_PromptID_ValueJSON, @Reasoning = @MJFeatureValues_PromptID_Reasoning, @Confidence = @MJFeatureValues_PromptID_Confidence, @PromptID_Clear = 1, @PromptID = @MJFeatureValues_PromptID_PromptID, @PromptVersionHash = @MJFeatureValues_PromptID_PromptVersionHash, @ConstraintHash = @MJFeatureValues_PromptID_ConstraintHash, @ProcessRunID = @MJFeatureValues_PromptID_ProcessRunID, @ProcessRunDetailID = @MJFeatureValues_PromptID_ProcessRunDetailID, @AIPromptRunID = @MJFeatureValues_PromptID_AIPromptRunID, @FeatureValueCacheID = @MJFeatureValues_PromptID_FeatureValueCacheID, @ComputedAt = @MJFeatureValues_PromptID_ComputedAt

        FETCH NEXT FROM cascade_update_MJFeatureValues_PromptID_cursor INTO @MJFeatureValues_PromptIDID, @MJFeatureValues_PromptID_RecordProcessID, @MJFeatureValues_PromptID_EntityID, @MJFeatureValues_PromptID_RecordID, @MJFeatureValues_PromptID_FeatureName, @MJFeatureValues_PromptID_ValueText, @MJFeatureValues_PromptID_ValueNumeric, @MJFeatureValues_PromptID_ValueDate, @MJFeatureValues_PromptID_ValueBoolean, @MJFeatureValues_PromptID_ValueJSON, @MJFeatureValues_PromptID_Reasoning, @MJFeatureValues_PromptID_Confidence, @MJFeatureValues_PromptID_PromptID, @MJFeatureValues_PromptID_PromptVersionHash, @MJFeatureValues_PromptID_ConstraintHash, @MJFeatureValues_PromptID_ProcessRunID, @MJFeatureValues_PromptID_ProcessRunDetailID, @MJFeatureValues_PromptID_AIPromptRunID, @MJFeatureValues_PromptID_FeatureValueCacheID, @MJFeatureValues_PromptID_ComputedAt
    END

    CLOSE cascade_update_MJFeatureValues_PromptID_cursor
    DEALLOCATE cascade_update_MJFeatureValues_PromptID_cursor
    
    -- Cascade update on RecordProcess using cursor to call spUpdateRecordProcess
    DECLARE @MJRecordProcesses_PromptIDID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_Name nvarchar(255)
    DECLARE @MJRecordProcesses_PromptID_Description nvarchar(MAX)
    DECLARE @MJRecordProcesses_PromptID_CategoryID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_EntityID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_Status nvarchar(20)
    DECLARE @MJRecordProcesses_PromptID_WorkType nvarchar(20)
    DECLARE @MJRecordProcesses_PromptID_ActionID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_AgentID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_PromptID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_ScopeType nvarchar(20)
    DECLARE @MJRecordProcesses_PromptID_ScopeViewID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_ScopeListID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_ScopeFilter nvarchar(MAX)
    DECLARE @MJRecordProcesses_PromptID_OnChangeEnabled bit
    DECLARE @MJRecordProcesses_PromptID_OnChangeInvocationType nvarchar(30)
    DECLARE @MJRecordProcesses_PromptID_OnChangeFilter nvarchar(MAX)
    DECLARE @MJRecordProcesses_PromptID_ScheduleEnabled bit
    DECLARE @MJRecordProcesses_PromptID_CronExpression nvarchar(120)
    DECLARE @MJRecordProcesses_PromptID_Timezone nvarchar(100)
    DECLARE @MJRecordProcesses_PromptID_OnDemandEnabled bit
    DECLARE @MJRecordProcesses_PromptID_InputMapping nvarchar(MAX)
    DECLARE @MJRecordProcesses_PromptID_OutputMapping nvarchar(MAX)
    DECLARE @MJRecordProcesses_PromptID_SkipUnchanged bit
    DECLARE @MJRecordProcesses_PromptID_WatermarkStrategy nvarchar(20)
    DECLARE @MJRecordProcesses_PromptID_BatchSize int
    DECLARE @MJRecordProcesses_PromptID_MaxConcurrency int
    DECLARE @MJRecordProcesses_PromptID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJRecordProcesses_PromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [CategoryID], [EntityID], [Status], [WorkType], [ActionID], [AgentID], [PromptID], [ScopeType], [ScopeViewID], [ScopeListID], [ScopeFilter], [OnChangeEnabled], [OnChangeInvocationType], [OnChangeFilter], [ScheduleEnabled], [CronExpression], [Timezone], [OnDemandEnabled], [InputMapping], [OutputMapping], [SkipUnchanged], [WatermarkStrategy], [BatchSize], [MaxConcurrency], [Configuration]
        FROM [${flyway:defaultSchema}].[RecordProcess]
        WHERE [PromptID] = @ID

    OPEN cascade_update_MJRecordProcesses_PromptID_cursor
    FETCH NEXT FROM cascade_update_MJRecordProcesses_PromptID_cursor INTO @MJRecordProcesses_PromptIDID, @MJRecordProcesses_PromptID_Name, @MJRecordProcesses_PromptID_Description, @MJRecordProcesses_PromptID_CategoryID, @MJRecordProcesses_PromptID_EntityID, @MJRecordProcesses_PromptID_Status, @MJRecordProcesses_PromptID_WorkType, @MJRecordProcesses_PromptID_ActionID, @MJRecordProcesses_PromptID_AgentID, @MJRecordProcesses_PromptID_PromptID, @MJRecordProcesses_PromptID_ScopeType, @MJRecordProcesses_PromptID_ScopeViewID, @MJRecordProcesses_PromptID_ScopeListID, @MJRecordProcesses_PromptID_ScopeFilter, @MJRecordProcesses_PromptID_OnChangeEnabled, @MJRecordProcesses_PromptID_OnChangeInvocationType, @MJRecordProcesses_PromptID_OnChangeFilter, @MJRecordProcesses_PromptID_ScheduleEnabled, @MJRecordProcesses_PromptID_CronExpression, @MJRecordProcesses_PromptID_Timezone, @MJRecordProcesses_PromptID_OnDemandEnabled, @MJRecordProcesses_PromptID_InputMapping, @MJRecordProcesses_PromptID_OutputMapping, @MJRecordProcesses_PromptID_SkipUnchanged, @MJRecordProcesses_PromptID_WatermarkStrategy, @MJRecordProcesses_PromptID_BatchSize, @MJRecordProcesses_PromptID_MaxConcurrency, @MJRecordProcesses_PromptID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJRecordProcesses_PromptID_PromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateRecordProcess] @ID = @MJRecordProcesses_PromptIDID, @Name = @MJRecordProcesses_PromptID_Name, @Description = @MJRecordProcesses_PromptID_Description, @CategoryID = @MJRecordProcesses_PromptID_CategoryID, @EntityID = @MJRecordProcesses_PromptID_EntityID, @Status = @MJRecordProcesses_PromptID_Status, @WorkType = @MJRecordProcesses_PromptID_WorkType, @ActionID = @MJRecordProcesses_PromptID_ActionID, @AgentID = @MJRecordProcesses_PromptID_AgentID, @PromptID_Clear = 1, @PromptID = @MJRecordProcesses_PromptID_PromptID, @ScopeType = @MJRecordProcesses_PromptID_ScopeType, @ScopeViewID = @MJRecordProcesses_PromptID_ScopeViewID, @ScopeListID = @MJRecordProcesses_PromptID_ScopeListID, @ScopeFilter = @MJRecordProcesses_PromptID_ScopeFilter, @OnChangeEnabled = @MJRecordProcesses_PromptID_OnChangeEnabled, @OnChangeInvocationType = @MJRecordProcesses_PromptID_OnChangeInvocationType, @OnChangeFilter = @MJRecordProcesses_PromptID_OnChangeFilter, @ScheduleEnabled = @MJRecordProcesses_PromptID_ScheduleEnabled, @CronExpression = @MJRecordProcesses_PromptID_CronExpression, @Timezone = @MJRecordProcesses_PromptID_Timezone, @OnDemandEnabled = @MJRecordProcesses_PromptID_OnDemandEnabled, @InputMapping = @MJRecordProcesses_PromptID_InputMapping, @OutputMapping = @MJRecordProcesses_PromptID_OutputMapping, @SkipUnchanged = @MJRecordProcesses_PromptID_SkipUnchanged, @WatermarkStrategy = @MJRecordProcesses_PromptID_WatermarkStrategy, @BatchSize = @MJRecordProcesses_PromptID_BatchSize, @MaxConcurrency = @MJRecordProcesses_PromptID_MaxConcurrency, @Configuration = @MJRecordProcesses_PromptID_Configuration

        FETCH NEXT FROM cascade_update_MJRecordProcesses_PromptID_cursor INTO @MJRecordProcesses_PromptIDID, @MJRecordProcesses_PromptID_Name, @MJRecordProcesses_PromptID_Description, @MJRecordProcesses_PromptID_CategoryID, @MJRecordProcesses_PromptID_EntityID, @MJRecordProcesses_PromptID_Status, @MJRecordProcesses_PromptID_WorkType, @MJRecordProcesses_PromptID_ActionID, @MJRecordProcesses_PromptID_AgentID, @MJRecordProcesses_PromptID_PromptID, @MJRecordProcesses_PromptID_ScopeType, @MJRecordProcesses_PromptID_ScopeViewID, @MJRecordProcesses_PromptID_ScopeListID, @MJRecordProcesses_PromptID_ScopeFilter, @MJRecordProcesses_PromptID_OnChangeEnabled, @MJRecordProcesses_PromptID_OnChangeInvocationType, @MJRecordProcesses_PromptID_OnChangeFilter, @MJRecordProcesses_PromptID_ScheduleEnabled, @MJRecordProcesses_PromptID_CronExpression, @MJRecordProcesses_PromptID_Timezone, @MJRecordProcesses_PromptID_OnDemandEnabled, @MJRecordProcesses_PromptID_InputMapping, @MJRecordProcesses_PromptID_OutputMapping, @MJRecordProcesses_PromptID_SkipUnchanged, @MJRecordProcesses_PromptID_WatermarkStrategy, @MJRecordProcesses_PromptID_BatchSize, @MJRecordProcesses_PromptID_MaxConcurrency, @MJRecordProcesses_PromptID_Configuration
    END

    CLOSE cascade_update_MJRecordProcesses_PromptID_cursor
    DEALLOCATE cascade_update_MJRecordProcesses_PromptID_cursor
    
    -- Cascade delete from ScopedPromptConfig using cursor to call spDeleteScopedPromptConfig
    DECLARE @MJScopedPromptConfigs_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJScopedPromptConfigs_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ScopedPromptConfig]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJScopedPromptConfigs_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJScopedPromptConfigs_PromptID_cursor INTO @MJScopedPromptConfigs_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteScopedPromptConfig] @ID = @MJScopedPromptConfigs_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJScopedPromptConfigs_PromptID_cursor INTO @MJScopedPromptConfigs_PromptIDID
    END
    
    CLOSE cascade_delete_MJScopedPromptConfigs_PromptID_cursor
    DEALLOCATE cascade_delete_MJScopedPromptConfigs_PromptID_cursor
    
    -- Cascade delete from ScopedPromptPart using cursor to call spDeleteScopedPromptPart
    DECLARE @MJScopedPromptParts_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJScopedPromptParts_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ScopedPromptPart]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJScopedPromptParts_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJScopedPromptParts_PromptID_cursor INTO @MJScopedPromptParts_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteScopedPromptPart] @ID = @MJScopedPromptParts_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJScopedPromptParts_PromptID_cursor INTO @MJScopedPromptParts_PromptIDID
    END
    
    CLOSE cascade_delete_MJScopedPromptParts_PromptID_cursor
    DEALLOCATE cascade_delete_MJScopedPromptParts_PromptID_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJTasks_PromptIDID uniqueidentifier
    DECLARE @MJTasks_PromptID_ParentID uniqueidentifier
    DECLARE @MJTasks_PromptID_Name nvarchar(255)
    DECLARE @MJTasks_PromptID_Description nvarchar(MAX)
    DECLARE @MJTasks_PromptID_TypeID uniqueidentifier
    DECLARE @MJTasks_PromptID_EnvironmentID uniqueidentifier
    DECLARE @MJTasks_PromptID_ProjectID uniqueidentifier
    DECLARE @MJTasks_PromptID_ConversationDetailID uniqueidentifier
    DECLARE @MJTasks_PromptID_UserID uniqueidentifier
    DECLARE @MJTasks_PromptID_AgentID uniqueidentifier
    DECLARE @MJTasks_PromptID_Status nvarchar(50)
    DECLARE @MJTasks_PromptID_PercentComplete int
    DECLARE @MJTasks_PromptID_DueAt datetimeoffset
    DECLARE @MJTasks_PromptID_StartedAt datetimeoffset
    DECLARE @MJTasks_PromptID_CompletedAt datetimeoffset
    DECLARE @MJTasks_PromptID_InputPayload nvarchar(MAX)
    DECLARE @MJTasks_PromptID_OutputPayload nvarchar(MAX)
    DECLARE @MJTasks_PromptID_ErrorMessage nvarchar(MAX)
    DECLARE @MJTasks_PromptID_AgentRunID uniqueidentifier
    DECLARE @MJTasks_PromptID_ClaimedBy nvarchar(100)
    DECLARE @MJTasks_PromptID_ClaimExpiresAt datetimeoffset
    DECLARE @MJTasks_PromptID_ActionID uniqueidentifier
    DECLARE @MJTasks_PromptID_StepType nvarchar(20)
    DECLARE @MJTasks_PromptID_PromptID uniqueidentifier
    DECLARE @MJTasks_PromptID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJTasks_PromptID_cursor CURSOR FOR
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt], [InputPayload], [OutputPayload], [ErrorMessage], [AgentRunID], [ClaimedBy], [ClaimExpiresAt], [ActionID], [StepType], [PromptID], [Configuration]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [PromptID] = @ID

    OPEN cascade_update_MJTasks_PromptID_cursor
    FETCH NEXT FROM cascade_update_MJTasks_PromptID_cursor INTO @MJTasks_PromptIDID, @MJTasks_PromptID_ParentID, @MJTasks_PromptID_Name, @MJTasks_PromptID_Description, @MJTasks_PromptID_TypeID, @MJTasks_PromptID_EnvironmentID, @MJTasks_PromptID_ProjectID, @MJTasks_PromptID_ConversationDetailID, @MJTasks_PromptID_UserID, @MJTasks_PromptID_AgentID, @MJTasks_PromptID_Status, @MJTasks_PromptID_PercentComplete, @MJTasks_PromptID_DueAt, @MJTasks_PromptID_StartedAt, @MJTasks_PromptID_CompletedAt, @MJTasks_PromptID_InputPayload, @MJTasks_PromptID_OutputPayload, @MJTasks_PromptID_ErrorMessage, @MJTasks_PromptID_AgentRunID, @MJTasks_PromptID_ClaimedBy, @MJTasks_PromptID_ClaimExpiresAt, @MJTasks_PromptID_ActionID, @MJTasks_PromptID_StepType, @MJTasks_PromptID_PromptID, @MJTasks_PromptID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJTasks_PromptID_PromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJTasks_PromptIDID, @ParentID = @MJTasks_PromptID_ParentID, @Name = @MJTasks_PromptID_Name, @Description = @MJTasks_PromptID_Description, @TypeID = @MJTasks_PromptID_TypeID, @EnvironmentID = @MJTasks_PromptID_EnvironmentID, @ProjectID = @MJTasks_PromptID_ProjectID, @ConversationDetailID = @MJTasks_PromptID_ConversationDetailID, @UserID = @MJTasks_PromptID_UserID, @AgentID = @MJTasks_PromptID_AgentID, @Status = @MJTasks_PromptID_Status, @PercentComplete = @MJTasks_PromptID_PercentComplete, @DueAt = @MJTasks_PromptID_DueAt, @StartedAt = @MJTasks_PromptID_StartedAt, @CompletedAt = @MJTasks_PromptID_CompletedAt, @InputPayload = @MJTasks_PromptID_InputPayload, @OutputPayload = @MJTasks_PromptID_OutputPayload, @ErrorMessage = @MJTasks_PromptID_ErrorMessage, @AgentRunID = @MJTasks_PromptID_AgentRunID, @ClaimedBy = @MJTasks_PromptID_ClaimedBy, @ClaimExpiresAt = @MJTasks_PromptID_ClaimExpiresAt, @ActionID = @MJTasks_PromptID_ActionID, @StepType = @MJTasks_PromptID_StepType, @PromptID_Clear = 1, @PromptID = @MJTasks_PromptID_PromptID, @Configuration = @MJTasks_PromptID_Configuration

        FETCH NEXT FROM cascade_update_MJTasks_PromptID_cursor INTO @MJTasks_PromptIDID, @MJTasks_PromptID_ParentID, @MJTasks_PromptID_Name, @MJTasks_PromptID_Description, @MJTasks_PromptID_TypeID, @MJTasks_PromptID_EnvironmentID, @MJTasks_PromptID_ProjectID, @MJTasks_PromptID_ConversationDetailID, @MJTasks_PromptID_UserID, @MJTasks_PromptID_AgentID, @MJTasks_PromptID_Status, @MJTasks_PromptID_PercentComplete, @MJTasks_PromptID_DueAt, @MJTasks_PromptID_StartedAt, @MJTasks_PromptID_CompletedAt, @MJTasks_PromptID_InputPayload, @MJTasks_PromptID_OutputPayload, @MJTasks_PromptID_ErrorMessage, @MJTasks_PromptID_AgentRunID, @MJTasks_PromptID_ClaimedBy, @MJTasks_PromptID_ClaimExpiresAt, @MJTasks_PromptID_ActionID, @MJTasks_PromptID_StepType, @MJTasks_PromptID_PromptID, @MJTasks_PromptID_Configuration
    END

    CLOSE cascade_update_MJTasks_PromptID_cursor
    DEALLOCATE cascade_update_MJTasks_PromptID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIPrompt]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPrompt] FROM [cdp_Developer]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPrompt] TO [cdp_Developer];

/* spDelete Permissions for MJ: AI Prompts */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPrompt] FROM [cdp_Developer]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPrompt] TO [cdp_Developer];

/* Set categories for 1 fields */

-- UPDATE Entity Field Category Info MJ: AI Prompts.TemplateDataCapture 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Prompt Definition & Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '97772E9B-EC93-4330-8BD2-4FAF2967A88B';
