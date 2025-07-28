-- =====================================================
-- Migration: Add UI Form Customization Support to AIAgentType
-- Version: v2.76.x
-- Description: Adds UIFormSectionKey, UIFormKey, and UIFormSectionExpandedByDefault columns 
--              to AIAgentType table to enable custom form sections and form overrides for 
--              different agent types (e.g., Flow agent type with rete.js visualization)
-- Author: MemberJunction AI Assistant
-- Date: 2025-07-27
-- =====================================================

/* SQL text to update existingg entity fields from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'
GO

-- Add the new columns to the AIAgentType table
ALTER TABLE ${flyway:defaultSchema}.AIAgentType
ADD UIFormSectionKey NVARCHAR(500) NULL,
    UIFormKey NVARCHAR(500) NULL,
    UIFormSectionExpandedByDefault BIT NOT NULL DEFAULT 1;

GO

-- Update Flow Agent Type to use custom form section
UPDATE ${flyway:defaultSchema}.AIAgentType
SET UIFormSectionKey = 'FlowAgentSection',
    UIFormSectionExpandedByDefault = 1 
WHERE ID='4F6A189B-C068-4736-9F23-3FF540B40FDD' -- Name = 'Flow';


-- Clean up some legacy data from before we had Agent Type concept fully baked
-- legacy "Conductor" agent that was never used
DECLARE @PromptID UNIQUEIDENTIFIER;
SELECT @PromptID=PromptID FROM ${flyway:defaultSchema}.AIAgentPrompt WHERE AgentID='DE973866-7B67-40D5-B665-A994E611421F' -- Save Prompt ID
DELETE FROM ${flyway:defaultSchema}.AIAgentPrompt WHERE AgentID='DE973866-7B67-40D5-B665-A994E611421F' -- Get Rid of AgentPromptRecord
DELETE FROM ${flyway:defaultSchema}.AIPrompt WHERE ID = @PromptID -- get rid of prompt record
DELETE FROM ${flyway:defaultSchema}.AIAgent WHERE ID='DE973866-7B67-40D5-B665-A994E611421F' -- get rid of agent record itself
-- now get rid of teh agent type that was associated with it
DELETE FROM ${flyway:defaultSchema}.AIAgentType WHERE ID='A7B8C9D0-E1F2-3456-7890-123456789ABC' -- legacy "Base Agent" that was never used


-- =====================================================
-- Extended Properties for the new columns
-- =====================================================

-- UIFormSectionKey extended property
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Optional Angular component key name for a subclass of BaseFormSectionComponent that provides a custom form section for this agent type. When specified, this component will be dynamically loaded and displayed as the first expandable section in the AI Agent form. This allows agent types to have specialized UI elements. The class must be registered with the MemberJunction class factory via @RegisterClass',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentType',
    @level2type = N'COLUMN', @level2name = 'UIFormSectionKey';

-- UIFormKey extended property
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Optional Angular component key name for a subclass of BaseFormComponent that will completely overrides the default AI Agent form for this agent type. When specified, this component will be used instead of the standard AI Agent form, allowing for completely custom form implementations. The class must be registered with the MemberJunction class factory via @RegisterClass. If both UIFormClass and UIFormSectionClass are specified, UIFormClass takes precedence.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentType',
    @level2type = N'COLUMN', @level2name = 'UIFormKey';

-- UIFormSectionExpandedByDefault extended property
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Determines whether the custom form section (specified by UIFormSectionClass) should be expanded by default when the AI Agent form loads. True means the section starts expanded, False means it starts collapsed. Only applies when UIFormSectionClass is specified. Defaults to 1 (expanded).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentType',
    @level2type = N'COLUMN', @level2name = 'UIFormSectionExpandedByDefault';

-- =====================================================
-- End of Migration for AIAgentType
-- =====================================================

-- =====================================================
-- End of Migration
-- =====================================================








/**** CODE GEN RUN *****/

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7763b64b-e410-4247-89de-5e9e565f15a0'  OR 
               (EntityID = '65CDC348-C4A6-4D00-A57B-2D489C56F128' AND Name = 'UIFormSectionKey')
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
            '7763b64b-e410-4247-89de-5e9e565f15a0',
            '65CDC348-C4A6-4D00-A57B-2D489C56F128', -- Entity: MJ: AI Agent Types
            100010,
            'UIFormSectionKey',
            'UI Form Section Key',
            'Optional Angular component key name for a subclass of BaseFormSectionComponent that provides a custom form section for this agent type. When specified, this component will be dynamically loaded and displayed as the first expandable section in the AI Agent form. This allows agent types to have specialized UI elements. The class must be registered with the MemberJunction class factory via @RegisterClass',
            'nvarchar',
            1000,
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
         WHERE ID = 'fac68362-126a-4f7e-b706-8dd7b40897a1'  OR 
               (EntityID = '65CDC348-C4A6-4D00-A57B-2D489C56F128' AND Name = 'UIFormKey')
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
            'fac68362-126a-4f7e-b706-8dd7b40897a1',
            '65CDC348-C4A6-4D00-A57B-2D489C56F128', -- Entity: MJ: AI Agent Types
            100011,
            'UIFormKey',
            'UI Form Key',
            'Optional Angular component key name for a subclass of BaseFormComponent that will completely overrides the default AI Agent form for this agent type. When specified, this component will be used instead of the standard AI Agent form, allowing for completely custom form implementations. The class must be registered with the MemberJunction class factory via @RegisterClass. If both UIFormClass and UIFormSectionClass are specified, UIFormClass takes precedence.',
            'nvarchar',
            1000,
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
         WHERE ID = 'da3d74e3-d1a2-4932-a1fb-4219f3be1cc9'  OR 
               (EntityID = '65CDC348-C4A6-4D00-A57B-2D489C56F128' AND Name = 'UIFormSectionExpandedByDefault')
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
            'da3d74e3-d1a2-4932-a1fb-4219f3be1cc9',
            '65CDC348-C4A6-4D00-A57B-2D489C56F128', -- Entity: MJ: AI Agent Types
            100012,
            'UIFormSectionExpandedByDefault',
            'UI Form Section Expanded By Default',
            'Determines whether the custom form section (specified by UIFormSectionClass) should be expanded by default when the AI Agent form loads. True means the section starts expanded, False means it starts collapsed. Only applies when UIFormSectionClass is specified. Defaults to 1 (expanded).',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @SystemPromptID uniqueidentifier,
    @IsActive bit,
    @AgentPromptPlaceholder nvarchar(255),
    @DriverClass nvarchar(255),
    @UIFormSectionKey nvarchar(500),
    @UIFormKey nvarchar(500),
    @UIFormSectionExpandedByDefault bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentType]
            (
                [ID],
                [Name],
                [Description],
                [SystemPromptID],
                [IsActive],
                [AgentPromptPlaceholder],
                [DriverClass],
                [UIFormSectionKey],
                [UIFormKey],
                [UIFormSectionExpandedByDefault]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @SystemPromptID,
                @IsActive,
                @AgentPromptPlaceholder,
                @DriverClass,
                @UIFormSectionKey,
                @UIFormKey,
                @UIFormSectionExpandedByDefault
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentType]
            (
                [Name],
                [Description],
                [SystemPromptID],
                [IsActive],
                [AgentPromptPlaceholder],
                [DriverClass],
                [UIFormSectionKey],
                [UIFormKey],
                [UIFormSectionExpandedByDefault]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @SystemPromptID,
                @IsActive,
                @AgentPromptPlaceholder,
                @DriverClass,
                @UIFormSectionKey,
                @UIFormKey,
                @UIFormSectionExpandedByDefault
            )
    END
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
    @IsActive bit,
    @AgentPromptPlaceholder nvarchar(255),
    @DriverClass nvarchar(255),
    @UIFormSectionKey nvarchar(500),
    @UIFormKey nvarchar(500),
    @UIFormSectionExpandedByDefault bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentType]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [SystemPromptID] = @SystemPromptID,
        [IsActive] = @IsActive,
        [AgentPromptPlaceholder] = @AgentPromptPlaceholder,
        [DriverClass] = @DriverClass,
        [UIFormSectionKey] = @UIFormSectionKey,
        [UIFormKey] = @UIFormKey,
        [UIFormSectionExpandedByDefault] = @UIFormSectionExpandedByDefault
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
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


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Agent Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentType] TO [cdp_Integration]






















-- =====================================================
-- Add Status and ActionInputMapping columns to AIAgentStep
-- =====================================================

-- Add Status field to control step execution
ALTER TABLE ${flyway:defaultSchema}.AIAgentStep
ADD Status NVARCHAR(20) NOT NULL DEFAULT 'Active'
CONSTRAINT CK_AIAgentStep_Status CHECK (Status IN ('Active', 'Pending', 'Disabled'));

-- Add ActionInputMapping for pre-processing action inputs
ALTER TABLE ${flyway:defaultSchema}.AIAgentStep
ADD ActionInputMapping NVARCHAR(MAX) NULL;

-- Extended properties for the new columns
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Controls whether this step is executed. Active=normal execution, Pending=skip but may activate later, Disabled=never execute',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentStep',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'JSON configuration for mapping static values or payload paths to action input parameters. Example: {"param1": "staticValue", "param2": "payload.dynamicValue"}',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentStep',
    @level2type = N'COLUMN', @level2name = N'ActionInputMapping';











/***** CODE GEN RUN *****/
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'cd88fc43-f457-496f-802a-41e585d8e2d3'  OR 
               (EntityID = '416D6E4C-31EF-4BBC-AC27-277A192AA1D9' AND Name = 'Status')
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
            'cd88fc43-f457-496f-802a-41e585d8e2d3',
            '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', -- Entity: MJ: AI Agent Steps
            100020,
            'Status',
            'Status',
            'Controls whether this step is executed. Active=normal execution, Pending=skip but may activate later, Disabled=never execute',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
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
         WHERE ID = 'adcb0c56-8de6-4d73-b29e-9cc0d1ac02f5'  OR 
               (EntityID = '416D6E4C-31EF-4BBC-AC27-277A192AA1D9' AND Name = 'ActionInputMapping')
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
            'adcb0c56-8de6-4d73-b29e-9cc0d1ac02f5',
            '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', -- Entity: MJ: AI Agent Steps
            100021,
            'ActionInputMapping',
            'Action Input Mapping',
            'JSON configuration for mapping static values or payload paths to action input parameters. Example: {"param1": "staticValue", "param2": "payload.dynamicValue"}',
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

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('CD88FC43-F457-496F-802A-41E585D8E2D3', 1, 'Active', 'Active')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('CD88FC43-F457-496F-802A-41E585D8E2D3', 2, 'Pending', 'Pending')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('CD88FC43-F457-496F-802A-41E585D8E2D3', 3, 'Disabled', 'Disabled')

/* SQL text to update ValueListType for entity field ID CD88FC43-F457-496F-802A-41E585D8E2D3 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='CD88FC43-F457-496F-802A-41E585D8E2D3'

/* Index for Foreign Keys for AIAgentStep */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Steps
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentStep
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentStep_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentStep]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentStep_AgentID ON [${flyway:defaultSchema}].[AIAgentStep] ([AgentID]);

-- Index for foreign key ActionID in table AIAgentStep
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentStep_ActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentStep]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentStep_ActionID ON [${flyway:defaultSchema}].[AIAgentStep] ([ActionID]);

-- Index for foreign key SubAgentID in table AIAgentStep
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentStep_SubAgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentStep]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentStep_SubAgentID ON [${flyway:defaultSchema}].[AIAgentStep] ([SubAgentID]);

-- Index for foreign key PromptID in table AIAgentStep
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentStep_PromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentStep]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentStep_PromptID ON [${flyway:defaultSchema}].[AIAgentStep] ([PromptID]);

/* Base View SQL for MJ: AI Agent Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Steps
-- Item: vwAIAgentSteps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Steps
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentStep
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIAgentSteps]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentSteps]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    Action_ActionID.[Name] AS [Action],
    AIAgent_SubAgentID.[Name] AS [SubAgent],
    AIPrompt_PromptID.[Name] AS [Prompt]
FROM
    [${flyway:defaultSchema}].[AIAgentStep] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Action] AS Action_ActionID
  ON
    [a].[ActionID] = Action_ActionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_SubAgentID
  ON
    [a].[SubAgentID] = AIAgent_SubAgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_PromptID
  ON
    [a].[PromptID] = AIPrompt_PromptID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentSteps] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Agent Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Steps
-- Item: Permissions for vwAIAgentSteps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentSteps] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Agent Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Steps
-- Item: spCreateAIAgentStep
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentStep
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIAgentStep]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentStep]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @StepType nvarchar(20),
    @StartingStep bit,
    @TimeoutSeconds int,
    @RetryCount int,
    @OnErrorBehavior nvarchar(20),
    @ActionID uniqueidentifier,
    @SubAgentID uniqueidentifier,
    @PromptID uniqueidentifier,
    @ActionOutputMapping nvarchar(MAX),
    @PositionX int,
    @PositionY int,
    @Width int,
    @Height int,
    @Status nvarchar(20),
    @ActionInputMapping nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentStep]
            (
                [ID],
                [AgentID],
                [Name],
                [Description],
                [StepType],
                [StartingStep],
                [TimeoutSeconds],
                [RetryCount],
                [OnErrorBehavior],
                [ActionID],
                [SubAgentID],
                [PromptID],
                [ActionOutputMapping],
                [PositionX],
                [PositionY],
                [Width],
                [Height],
                [Status],
                [ActionInputMapping]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @Name,
                @Description,
                @StepType,
                @StartingStep,
                @TimeoutSeconds,
                @RetryCount,
                @OnErrorBehavior,
                @ActionID,
                @SubAgentID,
                @PromptID,
                @ActionOutputMapping,
                @PositionX,
                @PositionY,
                @Width,
                @Height,
                @Status,
                @ActionInputMapping
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentStep]
            (
                [AgentID],
                [Name],
                [Description],
                [StepType],
                [StartingStep],
                [TimeoutSeconds],
                [RetryCount],
                [OnErrorBehavior],
                [ActionID],
                [SubAgentID],
                [PromptID],
                [ActionOutputMapping],
                [PositionX],
                [PositionY],
                [Width],
                [Height],
                [Status],
                [ActionInputMapping]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @Name,
                @Description,
                @StepType,
                @StartingStep,
                @TimeoutSeconds,
                @RetryCount,
                @OnErrorBehavior,
                @ActionID,
                @SubAgentID,
                @PromptID,
                @ActionOutputMapping,
                @PositionX,
                @PositionY,
                @Width,
                @Height,
                @Status,
                @ActionInputMapping
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentSteps] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentStep] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Agent Steps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentStep] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Agent Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Steps
-- Item: spUpdateAIAgentStep
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentStep
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIAgentStep]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentStep]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @StepType nvarchar(20),
    @StartingStep bit,
    @TimeoutSeconds int,
    @RetryCount int,
    @OnErrorBehavior nvarchar(20),
    @ActionID uniqueidentifier,
    @SubAgentID uniqueidentifier,
    @PromptID uniqueidentifier,
    @ActionOutputMapping nvarchar(MAX),
    @PositionX int,
    @PositionY int,
    @Width int,
    @Height int,
    @Status nvarchar(20),
    @ActionInputMapping nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentStep]
    SET
        [AgentID] = @AgentID,
        [Name] = @Name,
        [Description] = @Description,
        [StepType] = @StepType,
        [StartingStep] = @StartingStep,
        [TimeoutSeconds] = @TimeoutSeconds,
        [RetryCount] = @RetryCount,
        [OnErrorBehavior] = @OnErrorBehavior,
        [ActionID] = @ActionID,
        [SubAgentID] = @SubAgentID,
        [PromptID] = @PromptID,
        [ActionOutputMapping] = @ActionOutputMapping,
        [PositionX] = @PositionX,
        [PositionY] = @PositionY,
        [Width] = @Width,
        [Height] = @Height,
        [Status] = @Status,
        [ActionInputMapping] = @ActionInputMapping
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentSteps] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentSteps]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentStep] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentStep table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIAgentStep
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentStep
ON [${flyway:defaultSchema}].[AIAgentStep]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentStep]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentStep] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Agent Steps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentStep] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Agent Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Steps
-- Item: spDeleteAIAgentStep
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentStep
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIAgentStep]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentStep]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentStep]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentStep] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Agent Steps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentStep] TO [cdp_Integration]



