-- Migration: Add PromptParamsSchema to AIAgentType and AgentTypePromptParams to AIAgent
-- Description: Enables per-agent customization of which system prompt sections to include,
--              allowing significant token savings for agents that don't need all capabilities.

---------------------------------------------------------------
-- SECTION 1: DDL Operations - Add new columns
---------------------------------------------------------------

-- Add PromptParamsSchema to AIAgentType
-- This column stores the JSON Schema defining available parameters for agents of this type
ALTER TABLE ${flyway:defaultSchema}.AIAgentType
ADD PromptParamsSchema NVARCHAR(MAX) NULL;

-- Add AgentTypePromptParams to AIAgent
-- This column stores the JSON values that customize prompt rendering for this specific agent
ALTER TABLE ${flyway:defaultSchema}.AIAgent
ADD AgentTypePromptParams NVARCHAR(MAX) NULL;

---------------------------------------------------------------
-- SECTION 2: Extended Properties - Column descriptions
---------------------------------------------------------------

-- Add description for AIAgentType.PromptParamsSchema
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON Schema defining the available prompt parameters for this agent type. Includes property definitions with types, defaults, and descriptions. Used by agents of this type to customize which prompt sections are included in the system prompt. The schema follows JSON Schema draft-07 format.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIAgentType',
    @level2type = N'COLUMN', @level2name = 'PromptParamsSchema';

-- Add description for AIAgent.AgentTypePromptParams
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON object containing parameter values that customize how this agent''s type-level system prompt is rendered. The schema is defined by the agent type''s PromptParamsSchema field. Allows per-agent control over which prompt sections are included, enabling token savings by excluding unused documentation.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'AgentTypePromptParams';




-----------------------------------------------------------------------------------------------------
-- SECTION 3: Sets the JSON Schema that defines available prompt parameters for Loop agents.
--            This enables per-agent customization of which system prompt sections to include.
-----------------------------------------------------------------------------------------------------

-- Update Loop Agent Type with PromptParamsSchema
UPDATE ${flyway:defaultSchema}.AIAgentType
SET PromptParamsSchema = N'{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "description": "Prompt parameters for Loop Agent Type. Controls which sections are included in the system prompt to optimize token usage.",
    "properties": {
        "includeResponseTypeDefinition": {
            "type": "boolean",
            "default": true,
            "description": "Include the full LoopAgentResponse TypeScript interface definition in the prompt. Disable if your agent has custom examples that already demonstrate the response format, or if you want to provide a simplified response structure."
        },
        "includeForEachDocs": {
            "type": "boolean",
            "default": true,
            "description": "Include ForEach operation documentation and examples. ForEach enables efficient batch processing of collections (e.g., processing all items in an array with a single LLM decision). Disable for agents that never need to iterate over collections."
        },
        "includeWhileDocs": {
            "type": "boolean",
            "default": true,
            "description": "Include While loop documentation and examples. While loops enable polling, retrying, and conditional iteration (e.g., waiting for a job to complete). Disable for agents that never need polling or conditional loops."
        },
        "includeResponseFormDocs": {
            "type": "boolean",
            "default": true,
            "description": "Include response form documentation for collecting structured user input. Response forms allow agents to request specific information from users via text fields, dropdowns, buttons, etc. Disable for agents that only output results and never need user input."
        },
        "includeCommandDocs": {
            "type": "boolean",
            "default": true,
            "description": "Include actionable and automatic commands documentation. Actionable commands create clickable buttons (e.g., ''Open Record''), automatic commands trigger UI updates (e.g., refresh cache, show notification). Disable for agents that don''t need to provide navigation or trigger UI actions."
        },
        "includeMessageExpansionDocs": {
            "type": "boolean",
            "default": true,
            "description": "Include message expansion documentation. Message expansion allows agents to request full content from previously compacted messages. Disable for agents that don''t use message compaction or don''t need to access compacted content."
        },
        "includeVariableRefsDocs": {
            "type": "boolean",
            "default": true,
            "description": "Include variable references documentation (payload.*, item.*, index, etc.). These explain how to reference data in action parameters and loop contexts. Disable if your agent''s custom examples already demonstrate variable usage patterns."
        },
        "includePayloadInPrompt": {
            "type": "boolean",
            "default": true,
            "description": "Include the current payload state in the prompt. The payload is the agent''s working memory that persists across iterations. Disable for agents that don''t use the payload pattern or work purely from conversation context. Can save significant tokens for agents with large payloads."
        },
        "maxSubAgentsInPrompt": {
            "type": "integer",
            "default": -1,
            "description": "Maximum number of sub-agents to include in the prompt''s capabilities section. Use -1 to include all available sub-agents, 0 to hide sub-agent capabilities entirely, or a positive number to limit to the first N sub-agents. Useful for agents with many sub-agents where only a few are commonly used."
        },
        "maxActionsInPrompt": {
            "type": "integer",
            "default": -1,
            "description": "Maximum number of actions to include in the prompt''s capabilities section. Use -1 to include all available actions, 0 to hide action capabilities entirely, or a positive number to limit to the first N actions. Useful for agents with many actions where only a few are commonly used."
        }
    }
}'
WHERE ID = 'F7926101-5099-4FA5-836A-479D9707C818' -- loop agent type
