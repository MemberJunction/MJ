-- Add LLM parameter columns to AIPrompt table to match AIPromptRun
-- These will store default values for prompts that can be overridden at runtime

ALTER TABLE ${flyway:defaultSchema}.AIPrompt ADD
    Temperature DECIMAL(3,2) NULL,
    TopP DECIMAL(3,2) NULL,
    TopK INT NULL,
    MinP DECIMAL(3,2) NULL,
    FrequencyPenalty DECIMAL(3,2) NULL,
    PresencePenalty DECIMAL(3,2) NULL,
    Seed INT NULL,
    StopSequences NVARCHAR(1000) NULL,
    IncludeLogProbs BIT NULL DEFAULT 0,
    TopLogProbs INT NULL;

-- Add extended properties for documentation
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Default temperature setting for this prompt. Controls randomness in the output. 0 = more focused and deterministic, 2 = more random and creative. Can be overridden at runtime.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIPrompt',
    @level2type = N'COLUMN', @level2name = 'Temperature';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Default TopP (nucleus sampling) for this prompt. Only consider tokens with cumulative probability up to this value. 1 = consider all tokens. Can be overridden at runtime.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIPrompt',
    @level2type = N'COLUMN', @level2name = 'TopP';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Default TopK sampling for this prompt. Only sample from the top K tokens. Lower values reduce randomness. Can be overridden at runtime.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIPrompt',
    @level2type = N'COLUMN', @level2name = 'TopK';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Default MinP (minimum probability) for this prompt. Tokens with probability below this threshold are filtered out. Can be overridden at runtime.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIPrompt',
    @level2type = N'COLUMN', @level2name = 'MinP';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Default frequency penalty for this prompt. Penalizes tokens based on their frequency in the text. Positive values decrease likelihood of repetition. Can be overridden at runtime.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIPrompt',
    @level2type = N'COLUMN', @level2name = 'FrequencyPenalty';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Default presence penalty for this prompt. Penalizes tokens that have appeared in the text. Positive values increase topic diversity. Can be overridden at runtime.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIPrompt',
    @level2type = N'COLUMN', @level2name = 'PresencePenalty';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Default random seed for this prompt. Used for deterministic generation. Same seed produces same output. Can be overridden at runtime.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIPrompt',
    @level2type = N'COLUMN', @level2name = 'Seed';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Default stop sequences for this prompt. Comma-delimited list of sequences that will stop generation when encountered. Can be overridden at runtime.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIPrompt',
    @level2type = N'COLUMN', @level2name = 'StopSequences';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Default setting for including log probabilities in the response. Can be overridden at runtime.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIPrompt',
    @level2type = N'COLUMN', @level2name = 'IncludeLogProbs';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Default number of top log probabilities to include when IncludeLogProbs is true. Can be overridden at runtime.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIPrompt',
    @level2type = N'COLUMN', @level2name = 'TopLogProbs';

/***** Code Gen Output ******/


/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8ef6ca12-c07e-4fb3-83a8-a05d6729a112'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'Temperature')
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
            '8ef6ca12-c07e-4fb3-83a8-a05d6729a112',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            100036,
            'Temperature',
            'Temperature',
            'Default temperature setting for this prompt. Controls randomness in the output. 0 = more focused and deterministic, 2 = more random and creative. Can be overridden at runtime.',
            'decimal',
            5,
            3,
            2,
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
         WHERE ID = '922935e9-659f-4269-9ea6-959f09635a0e'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'TopP')
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
            '922935e9-659f-4269-9ea6-959f09635a0e',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            100037,
            'TopP',
            'Top P',
            'Default TopP (nucleus sampling) for this prompt. Only consider tokens with cumulative probability up to this value. 1 = consider all tokens. Can be overridden at runtime.',
            'decimal',
            5,
            3,
            2,
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
         WHERE ID = '3ae83d23-0d11-4d7f-afce-6da5125b729d'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'TopK')
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
            '3ae83d23-0d11-4d7f-afce-6da5125b729d',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            100038,
            'TopK',
            'Top K',
            'Default TopK sampling for this prompt. Only sample from the top K tokens. Lower values reduce randomness. Can be overridden at runtime.',
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
         WHERE ID = 'f9b94902-ae17-4926-b313-cce5bf1aaf16'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'MinP')
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
            'f9b94902-ae17-4926-b313-cce5bf1aaf16',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            100039,
            'MinP',
            'Min P',
            'Default MinP (minimum probability) for this prompt. Tokens with probability below this threshold are filtered out. Can be overridden at runtime.',
            'decimal',
            5,
            3,
            2,
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
         WHERE ID = '9032e4d9-3fd3-4ae2-8547-34e5764decd6'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'FrequencyPenalty')
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
            '9032e4d9-3fd3-4ae2-8547-34e5764decd6',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            100040,
            'FrequencyPenalty',
            'Frequency Penalty',
            'Default frequency penalty for this prompt. Penalizes tokens based on their frequency in the text. Positive values decrease likelihood of repetition. Can be overridden at runtime.',
            'decimal',
            5,
            3,
            2,
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
         WHERE ID = 'f84b8ff8-bb66-48ab-b182-a314af5d9777'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'PresencePenalty')
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
            'f84b8ff8-bb66-48ab-b182-a314af5d9777',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            100041,
            'PresencePenalty',
            'Presence Penalty',
            'Default presence penalty for this prompt. Penalizes tokens that have appeared in the text. Positive values increase topic diversity. Can be overridden at runtime.',
            'decimal',
            5,
            3,
            2,
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
         WHERE ID = 'd872353c-01bd-42a4-901b-003664e51f8c'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'Seed')
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
            'd872353c-01bd-42a4-901b-003664e51f8c',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            100042,
            'Seed',
            'Seed',
            'Default random seed for this prompt. Used for deterministic generation. Same seed produces same output. Can be overridden at runtime.',
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
         WHERE ID = 'ec6ae13e-4162-4a41-840a-70afc92fb3a9'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'StopSequences')
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
            'ec6ae13e-4162-4a41-840a-70afc92fb3a9',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            100043,
            'StopSequences',
            'Stop Sequences',
            'Default stop sequences for this prompt. Comma-delimited list of sequences that will stop generation when encountered. Can be overridden at runtime.',
            'nvarchar',
            2000,
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
         WHERE ID = 'e766fb1d-f25a-4852-88fc-36c3c1f0e654'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'IncludeLogProbs')
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
            'e766fb1d-f25a-4852-88fc-36c3c1f0e654',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            100044,
            'IncludeLogProbs',
            'Include Log Probs',
            'Default setting for including log probabilities in the response. Can be overridden at runtime.',
            'bit',
            1,
            1,
            0,
            1,
            '(0)',
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
         WHERE ID = 'ab2e1067-5397-446d-9551-d3838d36cedf'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'TopLogProbs')
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
            'ab2e1067-5397-446d-9551-d3838d36cedf',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            100045,
            'TopLogProbs',
            'Top Log Probs',
            'Default number of top log probabilities to include when IncludeLogProbs is true. Can be overridden at runtime.',
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

/* Index for Foreign Keys for AIPrompt */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
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

/* Base View SQL for AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: vwAIPrompts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AI Prompts
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIPrompt
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIPrompts]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIPrompts]
AS
SELECT
    a.*,
    Template_TemplateID.[Name] AS [Template],
    AIPromptCategory_CategoryID.[Name] AS [Category],
    AIPromptType_TypeID.[Name] AS [Type],
    AIModelType_AIModelTypeID.[Name] AS [AIModelType],
    AIPrompt_ResultSelectorPromptID.[Name] AS [ResultSelectorPrompt]
FROM
    [${flyway:defaultSchema}].[AIPrompt] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Template] AS Template_TemplateID
  ON
    [a].[TemplateID] = Template_TemplateID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPromptCategory] AS AIPromptCategory_CategoryID
  ON
    [a].[CategoryID] = AIPromptCategory_CategoryID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIPromptType] AS AIPromptType_TypeID
  ON
    [a].[TypeID] = AIPromptType_TypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModelType] AS AIModelType_AIModelTypeID
  ON
    [a].[AIModelTypeID] = AIModelType_AIModelTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_ResultSelectorPromptID
  ON
    [a].[ResultSelectorPromptID] = AIPrompt_ResultSelectorPromptID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPrompts] TO [cdp_UI], [cdp_Integration], [cdp_UI], [cdp_Developer]
    

/* Base View Permissions SQL for AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: Permissions for vwAIPrompts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPrompts] TO [cdp_UI], [cdp_Integration], [cdp_UI], [cdp_Developer]

/* spCreate SQL for AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: spCreateAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIPrompt
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIPrompt]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIPrompt]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @TemplateID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @TypeID uniqueidentifier,
    @Status nvarchar(50),
    @ResponseFormat nvarchar(20),
    @ModelSpecificResponseFormat nvarchar(MAX),
    @AIModelTypeID uniqueidentifier,
    @MinPowerRank int,
    @SelectionStrategy nvarchar(20),
    @PowerPreference nvarchar(20),
    @ParallelizationMode nvarchar(20),
    @ParallelCount int,
    @ParallelConfigParam nvarchar(100),
    @OutputType nvarchar(50),
    @OutputExample nvarchar(MAX),
    @ValidationBehavior nvarchar(50),
    @MaxRetries int,
    @RetryDelayMS int,
    @RetryStrategy nvarchar(20),
    @ResultSelectorPromptID uniqueidentifier,
    @EnableCaching bit,
    @CacheTTLSeconds int,
    @CacheMatchType nvarchar(20),
    @CacheSimilarityThreshold float(53),
    @CacheMustMatchModel bit,
    @CacheMustMatchVendor bit,
    @CacheMustMatchAgent bit,
    @CacheMustMatchConfig bit,
    @PromptRole nvarchar(20),
    @PromptPosition nvarchar(20),
    @Temperature decimal(3, 2),
    @TopP decimal(3, 2),
    @TopK int,
    @MinP decimal(3, 2),
    @FrequencyPenalty decimal(3, 2),
    @PresencePenalty decimal(3, 2),
    @Seed int,
    @StopSequences nvarchar(1000),
    @IncludeLogProbs bit,
    @TopLogProbs int
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
                [TopLogProbs]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @TemplateID,
                @CategoryID,
                @TypeID,
                @Status,
                @ResponseFormat,
                @ModelSpecificResponseFormat,
                @AIModelTypeID,
                @MinPowerRank,
                @SelectionStrategy,
                @PowerPreference,
                @ParallelizationMode,
                @ParallelCount,
                @ParallelConfigParam,
                @OutputType,
                @OutputExample,
                @ValidationBehavior,
                @MaxRetries,
                @RetryDelayMS,
                @RetryStrategy,
                @ResultSelectorPromptID,
                @EnableCaching,
                @CacheTTLSeconds,
                @CacheMatchType,
                @CacheSimilarityThreshold,
                @CacheMustMatchModel,
                @CacheMustMatchVendor,
                @CacheMustMatchAgent,
                @CacheMustMatchConfig,
                @PromptRole,
                @PromptPosition,
                @Temperature,
                @TopP,
                @TopK,
                @MinP,
                @FrequencyPenalty,
                @PresencePenalty,
                @Seed,
                @StopSequences,
                @IncludeLogProbs,
                @TopLogProbs
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
                [TopLogProbs]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @TemplateID,
                @CategoryID,
                @TypeID,
                @Status,
                @ResponseFormat,
                @ModelSpecificResponseFormat,
                @AIModelTypeID,
                @MinPowerRank,
                @SelectionStrategy,
                @PowerPreference,
                @ParallelizationMode,
                @ParallelCount,
                @ParallelConfigParam,
                @OutputType,
                @OutputExample,
                @ValidationBehavior,
                @MaxRetries,
                @RetryDelayMS,
                @RetryStrategy,
                @ResultSelectorPromptID,
                @EnableCaching,
                @CacheTTLSeconds,
                @CacheMatchType,
                @CacheSimilarityThreshold,
                @CacheMustMatchModel,
                @CacheMustMatchVendor,
                @CacheMustMatchAgent,
                @CacheMustMatchConfig,
                @PromptRole,
                @PromptPosition,
                @Temperature,
                @TopP,
                @TopK,
                @MinP,
                @FrequencyPenalty,
                @PresencePenalty,
                @Seed,
                @StopSequences,
                @IncludeLogProbs,
                @TopLogProbs
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIPrompts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPrompt] TO [cdp_Developer]
    

/* spCreate Permissions for AI Prompts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPrompt] TO [cdp_Developer]



/* spUpdate SQL for AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: spUpdateAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIPrompt
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIPrompt]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPrompt]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @TemplateID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @TypeID uniqueidentifier,
    @Status nvarchar(50),
    @ResponseFormat nvarchar(20),
    @ModelSpecificResponseFormat nvarchar(MAX),
    @AIModelTypeID uniqueidentifier,
    @MinPowerRank int,
    @SelectionStrategy nvarchar(20),
    @PowerPreference nvarchar(20),
    @ParallelizationMode nvarchar(20),
    @ParallelCount int,
    @ParallelConfigParam nvarchar(100),
    @OutputType nvarchar(50),
    @OutputExample nvarchar(MAX),
    @ValidationBehavior nvarchar(50),
    @MaxRetries int,
    @RetryDelayMS int,
    @RetryStrategy nvarchar(20),
    @ResultSelectorPromptID uniqueidentifier,
    @EnableCaching bit,
    @CacheTTLSeconds int,
    @CacheMatchType nvarchar(20),
    @CacheSimilarityThreshold float(53),
    @CacheMustMatchModel bit,
    @CacheMustMatchVendor bit,
    @CacheMustMatchAgent bit,
    @CacheMustMatchConfig bit,
    @PromptRole nvarchar(20),
    @PromptPosition nvarchar(20),
    @Temperature decimal(3, 2),
    @TopP decimal(3, 2),
    @TopK int,
    @MinP decimal(3, 2),
    @FrequencyPenalty decimal(3, 2),
    @PresencePenalty decimal(3, 2),
    @Seed int,
    @StopSequences nvarchar(1000),
    @IncludeLogProbs bit,
    @TopLogProbs int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPrompt]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [TemplateID] = @TemplateID,
        [CategoryID] = @CategoryID,
        [TypeID] = @TypeID,
        [Status] = @Status,
        [ResponseFormat] = @ResponseFormat,
        [ModelSpecificResponseFormat] = @ModelSpecificResponseFormat,
        [AIModelTypeID] = @AIModelTypeID,
        [MinPowerRank] = @MinPowerRank,
        [SelectionStrategy] = @SelectionStrategy,
        [PowerPreference] = @PowerPreference,
        [ParallelizationMode] = @ParallelizationMode,
        [ParallelCount] = @ParallelCount,
        [ParallelConfigParam] = @ParallelConfigParam,
        [OutputType] = @OutputType,
        [OutputExample] = @OutputExample,
        [ValidationBehavior] = @ValidationBehavior,
        [MaxRetries] = @MaxRetries,
        [RetryDelayMS] = @RetryDelayMS,
        [RetryStrategy] = @RetryStrategy,
        [ResultSelectorPromptID] = @ResultSelectorPromptID,
        [EnableCaching] = @EnableCaching,
        [CacheTTLSeconds] = @CacheTTLSeconds,
        [CacheMatchType] = @CacheMatchType,
        [CacheSimilarityThreshold] = @CacheSimilarityThreshold,
        [CacheMustMatchModel] = @CacheMustMatchModel,
        [CacheMustMatchVendor] = @CacheMustMatchVendor,
        [CacheMustMatchAgent] = @CacheMustMatchAgent,
        [CacheMustMatchConfig] = @CacheMustMatchConfig,
        [PromptRole] = @PromptRole,
        [PromptPosition] = @PromptPosition,
        [Temperature] = @Temperature,
        [TopP] = @TopP,
        [TopK] = @TopK,
        [MinP] = @MinP,
        [FrequencyPenalty] = @FrequencyPenalty,
        [PresencePenalty] = @PresencePenalty,
        [Seed] = @Seed,
        [StopSequences] = @StopSequences,
        [IncludeLogProbs] = @IncludeLogProbs,
        [TopLogProbs] = @TopLogProbs
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIPrompts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPrompt] TO [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPrompt table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIPrompt
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
        

/* spUpdate Permissions for AI Prompts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPrompt] TO [cdp_Developer]



/* spDelete SQL for AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: spDeleteAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPrompt
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIPrompt]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPrompt]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIPrompt]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPrompt] TO [cdp_Developer]
    

/* spDelete Permissions for AI Prompts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPrompt] TO [cdp_Developer]



