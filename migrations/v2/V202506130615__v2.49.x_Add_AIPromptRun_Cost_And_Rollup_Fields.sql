-- Migration: Add cost tracking and hierarchical rollup fields to AIPromptRun and AIAgentRun tables
-- Date: 2025-06-13
-- Description: Adds fields to track execution costs and hierarchical token/cost rollups
--              for parent-child prompt executions and agent runs. This enables efficient
--              analysis of total resource usage across entire prompt execution trees and
--              detailed token tracking for agent executions.

-- Add all fields to AIPromptRun table in a single ALTER statement
ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun]
ADD [Cost] DECIMAL(19, 8) NULL,
    [CostCurrency] NVARCHAR(10) NULL,
    [TokensUsedRollup] INT NULL,
    [TokensPromptRollup] INT NULL,
    [TokensCompletionRollup] INT NULL;

-- Add all fields to AIAgentRun table in a single ALTER statement
ALTER TABLE [${flyway:defaultSchema}].[AIAgentRun]
ADD [TotalPromptTokensUsed] INT NULL,
    [TotalCompletionTokensUsed] INT NULL,
    [TotalTokensUsedRollup] INT NULL,
    [TotalPromptTokensUsedRollup] INT NULL,
    [TotalCompletionTokensUsedRollup] INT NULL,
    [TotalCostRollup] DECIMAL(19, 8) NULL;

-- Add extended property descriptions

-- Cost field
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The cost of this specific prompt execution as reported by the AI provider. This does not include costs from child executions. The currency is specified in CostCurrency field.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIPromptRun',
    @level2type = N'COLUMN', @level2name = 'Cost';

-- CostCurrency field
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ISO 4217 currency code for the Cost field (e.g., USD, EUR, GBP). Different AI providers may use different currencies.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIPromptRun',
    @level2type = N'COLUMN', @level2name = 'CostCurrency';

-- TokensUsedRollup field
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total tokens used including this execution and all child/grandchild executions. This provides a complete view of token usage for hierarchical prompt trees. Calculated as TokensPromptRollup + TokensCompletionRollup.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIPromptRun',
    @level2type = N'COLUMN', @level2name = 'TokensUsedRollup';

-- TokensPromptRollup field
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total prompt/input tokens including this execution and all child/grandchild executions. For leaf nodes (no children), this equals TokensPrompt. For parent nodes, this includes the sum of all descendant prompt tokens.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIPromptRun',
    @level2type = N'COLUMN', @level2name = 'TokensPromptRollup';

-- TokensCompletionRollup field
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total completion/output tokens including this execution and all child/grandchild executions. For leaf nodes (no children), this equals TokensCompletion. For parent nodes, this includes the sum of all descendant completion tokens.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIPromptRun',
    @level2type = N'COLUMN', @level2name = 'TokensCompletionRollup';

-- TotalCost field (updated description for rollup pattern)
-- drop the old description first to avoid conflicts
EXEC sp_dropextendedproperty
    @name = N'MS_Description',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIPromptRun',
    @level2type = N'COLUMN', @level2name = 'TotalCost';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total cost including this execution and all child/grandchild executions. For leaf nodes (no children), this equals Cost. For parent nodes, this includes the sum of all descendant costs. Note: This assumes all costs are in the same currency for accurate rollup. Currency conversions should be handled at the application layer if needed.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIPromptRun',
    @level2type = N'COLUMN', @level2name = 'TotalCost';

-- AIAgentRun field descriptions

-- TotalPromptTokensUsed field
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total number of prompt/input tokens used across all AIPromptRun executions during this agent run. This provides a breakdown of the TotalTokensUsed field to help analyze the ratio of input vs output tokens consumed by the agent.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentRun',
    @level2type = N'COLUMN', @level2name = 'TotalPromptTokensUsed';

-- TotalCompletionTokensUsed field
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total number of completion/output tokens generated across all AIPromptRun executions during this agent run. This provides a breakdown of the TotalTokensUsed field to help analyze the ratio of input vs output tokens consumed by the agent.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentRun',
    @level2type = N'COLUMN', @level2name = 'TotalCompletionTokensUsed';

-- TotalTokensUsedRollup field
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total tokens used including this agent run and all sub-agent runs. For leaf agents (no sub-agents), this equals TotalTokensUsed. For parent agents, this includes the sum of all descendant agent tokens. Calculated as TotalPromptTokensUsedRollup + TotalCompletionTokensUsedRollup.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentRun',
    @level2type = N'COLUMN', @level2name = 'TotalTokensUsedRollup';

-- TotalPromptTokensUsedRollup field
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total prompt/input tokens including this agent run and all sub-agent runs. For leaf agents (no sub-agents), this equals TotalPromptTokensUsed. For parent agents, this includes the sum of all descendant agent prompt tokens.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentRun',
    @level2type = N'COLUMN', @level2name = 'TotalPromptTokensUsedRollup';

-- TotalCompletionTokensUsedRollup field
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total completion/output tokens including this agent run and all sub-agent runs. For leaf agents (no sub-agents), this equals TotalCompletionTokensUsed. For parent agents, this includes the sum of all descendant agent completion tokens.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentRun',
    @level2type = N'COLUMN', @level2name = 'TotalCompletionTokensUsedRollup';

-- TotalCostRollup field for AIAgentRun
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total cost including this agent run and all sub-agent runs. For leaf agents (no sub-agents), this equals TotalCost. For parent agents, this includes the sum of all descendant agent costs. Note: This assumes all costs are in the same currency for accurate rollup.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentRun',
    @level2type = N'COLUMN', @level2name = 'TotalCostRollup';

-- Add comment about hierarchical rollup pattern
/*
Hierarchical Rollup Pattern:
============================
For a prompt execution tree like:
  Grandparent (A)
    ├── Parent (B)
    │   └── Child (C)
    └── Parent (D)
        ├── Child (E)
        └── Child (F)

The rollup fields would contain:
- Node A: TokensUsedRollup = A + B + C + D + E + F (entire tree)
         TotalCost = CostA + CostB + CostC + CostD + CostE + CostF
- Node B: TokensUsedRollup = B + C (self + descendants)
         TotalCost = CostB + CostC
- Node C: TokensUsedRollup = C (leaf node, no children)
         TotalCost = CostC (equals Cost for leaf nodes)
- Node D: TokensUsedRollup = D + E + F (self + descendants)
         TotalCost = CostD + CostE + CostF
- Node E: TokensUsedRollup = E (leaf node)
         TotalCost = CostE (equals Cost)
- Node F: TokensUsedRollup = F (leaf node)
         TotalCost = CostF (equals Cost)

This pattern allows efficient queries like:
- "What was the total cost of this agent execution?" (check root node's rollup)
- "How many tokens did this sub-prompt and its children use?" (check that node's rollup)
- "What was the cost of just this prompt?" (check non-rollup fields)

Example Query:
SELECT
    ID,
    Name,
    TokensUsed as DirectTokens,
    TokensUsedRollup as TotalTokens,
    Cost as DirectCost,
    TotalCostRollup as TotalCost,
    CASE
        WHEN ParentID IS NULL THEN 'Root'
        WHEN EXISTS(SELECT 1 FROM AIPromptRun child WHERE child.ParentID = pr.ID) THEN 'Parent'
        ELSE 'Leaf'
    END as NodeType
FROM AIPromptRun pr
WHERE ID = 'your-prompt-run-id' OR ParentID = 'your-prompt-run-id'
ORDER BY RunAt;

Agent Token Aggregation:
========================
For an agent run that executes multiple prompts:
  Agent Run
    ├── Prompt Run 1 (50 prompt tokens, 100 completion tokens)
    ├── Prompt Run 2 (75 prompt tokens, 150 completion tokens)
    └── Prompt Run 3 (hierarchical)
        ├── Child 3a (25 prompt, 50 completion)
        └── Child 3b (30 prompt, 60 completion)

The AIAgentRun fields would contain:
- TotalTokensUsed = 540 (all tokens from all executions)
- TotalPromptTokensUsed = 180 (50 + 75 + 25 + 30)
- TotalCompletionTokensUsed = 360 (100 + 150 + 50 + 60)
- TotalCost = Sum of all prompt costs

Hierarchical Agent Rollup Pattern:
==================================
For agent runs that invoke sub-agents:
  Parent Agent (A)
    ├── Own prompts: 200 prompt, 400 completion tokens
    ├── Sub-Agent (B)
    │   └── Own prompts: 100 prompt, 200 completion tokens
    └── Sub-Agent (C)
        ├── Own prompts: 150 prompt, 300 completion tokens
        └── Sub-Agent (D)
            └── Own prompts: 50 prompt, 100 completion tokens

The rollup fields would contain:
- Agent A: TotalTokensUsedRollup = 1500 (A + B + C + D)
  - TotalPromptTokensUsedRollup = 500 (200 + 100 + 150 + 50)
  - TotalCompletionTokensUsedRollup = 1000 (400 + 200 + 300 + 100)
- Agent B: TotalTokensUsedRollup = 300 (just B, no sub-agents)
- Agent C: TotalTokensUsedRollup = 600 (C + D)
- Agent D: TotalTokensUsedRollup = 150 (leaf agent)

This allows for analysis like:
- "What's the total cost of this agent and all its sub-agents?"
- "How much of the parent agent's work was delegated to sub-agents?"
- "Which branch of the agent tree consumed the most resources?"
- "What's the depth and breadth of agent delegation?"
*/




/*********************************/
/*********************************/
-- CODE GEN RUN
/*********************************/
/*********************************/

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '69b7eb99-3409-4b84-b979-877e992964dc'  OR
               (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'TotalPromptTokensUsed')
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
            '69b7eb99-3409-4b84-b979-877e992964dc',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            100017,
            'TotalPromptTokensUsed',
            'Total Prompt Tokens Used',
            'Total number of prompt/input tokens used across all AIPromptRun executions during this agent run. This provides a breakdown of the TotalTokensUsed field to help analyze the ratio of input vs output tokens consumed by the agent.',
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
         WHERE ID = '4be28d8a-2e06-460d-bdd7-34e5beb5dbb0'  OR
               (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'TotalCompletionTokensUsed')
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
            '4be28d8a-2e06-460d-bdd7-34e5beb5dbb0',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            100018,
            'TotalCompletionTokensUsed',
            'Total Completion Tokens Used',
            'Total number of completion/output tokens generated across all AIPromptRun executions during this agent run. This provides a breakdown of the TotalTokensUsed field to help analyze the ratio of input vs output tokens consumed by the agent.',
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
         WHERE ID = 'a60033a0-d13c-4954-8ef3-6bb8a5618126'  OR
               (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'TotalTokensUsedRollup')
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
            'a60033a0-d13c-4954-8ef3-6bb8a5618126',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            100019,
            'TotalTokensUsedRollup',
            'Total Tokens Used Rollup',
            'Total tokens used including this agent run and all sub-agent runs. For leaf agents (no sub-agents), this equals TotalTokensUsed. For parent agents, this includes the sum of all descendant agent tokens. Calculated as TotalPromptTokensUsedRollup + TotalCompletionTokensUsedRollup.',
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
         WHERE ID = 'fcd5864b-65bb-4e9f-a3fe-2c09d3461364'  OR
               (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'TotalPromptTokensUsedRollup')
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
            'fcd5864b-65bb-4e9f-a3fe-2c09d3461364',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            100020,
            'TotalPromptTokensUsedRollup',
            'Total Prompt Tokens Used Rollup',
            'Total prompt/input tokens including this agent run and all sub-agent runs. For leaf agents (no sub-agents), this equals TotalPromptTokensUsed. For parent agents, this includes the sum of all descendant agent prompt tokens.',
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
         WHERE ID = 'b1401167-0c3b-4d14-9633-6a3a1dc429a9'  OR
               (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'TotalCompletionTokensUsedRollup')
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
            'b1401167-0c3b-4d14-9633-6a3a1dc429a9',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            100021,
            'TotalCompletionTokensUsedRollup',
            'Total Completion Tokens Used Rollup',
            'Total completion/output tokens including this agent run and all sub-agent runs. For leaf agents (no sub-agents), this equals TotalCompletionTokensUsed. For parent agents, this includes the sum of all descendant agent completion tokens.',
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
         WHERE ID = 'f9928463-5f2b-46c0-8da3-6eef2fa816ef'  OR
               (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'TotalCostRollup')
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
            'f9928463-5f2b-46c0-8da3-6eef2fa816ef',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            100022,
            'TotalCostRollup',
            'Total Cost Rollup',
            'Total cost including this agent run and all sub-agent runs. For leaf agents (no sub-agents), this equals TotalCost. For parent agents, this includes the sum of all descendant agent costs. Note: This assumes all costs are in the same currency for accurate rollup.',
            'decimal',
            9,
            19,
            8,
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
         WHERE ID = 'adcd9c84-0fb1-45f4-9a9f-b42bd51a2503'  OR
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'Cost')
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
            'adcd9c84-0fb1-45f4-9a9f-b42bd51a2503',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            100024,
            'Cost',
            'Cost',
            'The cost of this specific prompt execution as reported by the AI provider. This does not include costs from child executions. The currency is specified in CostCurrency field.',
            'decimal',
            9,
            19,
            8,
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
         WHERE ID = '2a925f19-e0ea-41af-8323-4542f310a09e'  OR
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'CostCurrency')
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
            '2a925f19-e0ea-41af-8323-4542f310a09e',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            100025,
            'CostCurrency',
            'Cost Currency',
            'ISO 4217 currency code for the Cost field (e.g., USD, EUR, GBP). Different AI providers may use different currencies.',
            'nvarchar',
            20,
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
         WHERE ID = '16b3dcd4-e1a3-456b-ac93-ff72b2507b19'  OR
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'TokensUsedRollup')
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
            '16b3dcd4-e1a3-456b-ac93-ff72b2507b19',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            100026,
            'TokensUsedRollup',
            'Tokens Used Rollup',
            'Total tokens used including this execution and all child/grandchild executions. This provides a complete view of token usage for hierarchical prompt trees. Calculated as TokensPromptRollup + TokensCompletionRollup.',
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
         WHERE ID = '05f66d0a-9e5b-4a31-9b03-f26df3fa70b1'  OR
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'TokensPromptRollup')
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
            '05f66d0a-9e5b-4a31-9b03-f26df3fa70b1',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            100027,
            'TokensPromptRollup',
            'Tokens Prompt Rollup',
            'Total prompt/input tokens including this execution and all child/grandchild executions. For leaf nodes (no children), this equals TokensPrompt. For parent nodes, this includes the sum of all descendant prompt tokens.',
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
         WHERE ID = 'bf642024-62c7-41e2-86aa-fce253463de1'  OR
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'TokensCompletionRollup')
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
            'bf642024-62c7-41e2-86aa-fce253463de1',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            100028,
            'TokensCompletionRollup',
            'Tokens Completion Rollup',
            'Total completion/output tokens including this execution and all child/grandchild executions. For leaf nodes (no children), this equals TokensCompletion. For parent nodes, this includes the sum of all descendant completion tokens.',
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
    @TotalCost decimal(18, 6),
    @TotalPromptTokensUsed int,
    @TotalCompletionTokensUsed int,
    @TotalTokensUsedRollup int,
    @TotalPromptTokensUsedRollup int,
    @TotalCompletionTokensUsedRollup int,
    @TotalCostRollup decimal(19, 8)
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
            [TotalCost],
            [TotalPromptTokensUsed],
            [TotalCompletionTokensUsed],
            [TotalTokensUsedRollup],
            [TotalPromptTokensUsedRollup],
            [TotalCompletionTokensUsedRollup],
            [TotalCostRollup]
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
            @TotalCost,
            @TotalPromptTokensUsed,
            @TotalCompletionTokensUsed,
            @TotalTokensUsedRollup,
            @TotalPromptTokensUsedRollup,
            @TotalCompletionTokensUsedRollup,
            @TotalCostRollup
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
    @TotalCost decimal(18, 6),
    @TotalPromptTokensUsed int,
    @TotalCompletionTokensUsed int,
    @TotalTokensUsedRollup int,
    @TotalPromptTokensUsedRollup int,
    @TotalCompletionTokensUsedRollup int,
    @TotalCostRollup decimal(19, 8)
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
        [TotalCost] = @TotalCost,
        [TotalPromptTokensUsed] = @TotalPromptTokensUsed,
        [TotalCompletionTokensUsed] = @TotalCompletionTokensUsed,
        [TotalTokensUsedRollup] = @TotalTokensUsedRollup,
        [TotalPromptTokensUsedRollup] = @TotalPromptTokensUsedRollup,
        [TotalCompletionTokensUsedRollup] = @TotalCompletionTokensUsedRollup,
        [TotalCostRollup] = @TotalCostRollup
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
    @AgentRunID uniqueidentifier,
    @Cost decimal(19, 8),
    @CostCurrency nvarchar(10),
    @TokensUsedRollup int,
    @TokensPromptRollup int,
    @TokensCompletionRollup int
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
            [AgentRunID],
            [Cost],
            [CostCurrency],
            [TokensUsedRollup],
            [TokensPromptRollup],
            [TokensCompletionRollup]
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
            @AgentRunID,
            @Cost,
            @CostCurrency,
            @TokensUsedRollup,
            @TokensPromptRollup,
            @TokensCompletionRollup
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
    @AgentRunID uniqueidentifier,
    @Cost decimal(19, 8),
    @CostCurrency nvarchar(10),
    @TokensUsedRollup int,
    @TokensPromptRollup int,
    @TokensCompletionRollup int
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
        [AgentRunID] = @AgentRunID,
        [Cost] = @Cost,
        [CostCurrency] = @CostCurrency,
        [TokensUsedRollup] = @TokensUsedRollup,
        [TokensPromptRollup] = @TokensPromptRollup,
        [TokensCompletionRollup] = @TokensCompletionRollup
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



