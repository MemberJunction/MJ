-- 1. Find and drop the default constraint on TypeID
DECLARE @dfName SYSNAME;

SELECT
    @dfName = dc.name
FROM
    sys.default_constraints dc
    JOIN sys.columns c
      ON dc.parent_object_id = c.object_id
     AND dc.parent_column_id = c.column_id
WHERE
    dc.parent_object_id = OBJECT_ID('${flyway:defaultSchema}.AIAgent')
    AND c.name = 'TypeID';

IF @dfName IS NOT NULL
BEGIN
    EXEC(
        'ALTER TABLE [' + '${flyway:defaultSchema}' + '].[AIAgent] '
      + 'DROP CONSTRAINT [' + @dfName + '];'
    );
END

-- 2. Alter TypeID to allow NULLs
ALTER TABLE [${flyway:defaultSchema}].[AIAgent]
ALTER COLUMN [TypeID] UNIQUEIDENTIFIER NULL;

-- SQL queries to add the SYSTEM_PROMPT_TEMPLATE to the MemberJunction database
-- This script creates the necessary records to store the Base Agent system prompt template in the database

DECLARE @UserID UNIQUEIDENTIFIER = 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E'
DECLARE @TemplateID UNIQUEIDENTIFIER = '496DA13E-91C9-43E8-AABF-76C5BFE60B43'
DECLARE @TemplateContentID UNIQUEIDENTIFIER = '29FA8F09-A8BE-417E-BF99-BDDCDA9CC6C3'
DECLARE @AIPromptTypeID UNIQUEIDENTIFIER = 'A6DA423E-F36B-1410-8DAC-00021F8B792E' -- Chat type from provided data
DECLARE @TemplateContentTypeID UNIQUEIDENTIFIER = 'E7AFCCEC-6A37-EF11-86D4-000D3A4E707E' -- Text type from provided data
DECLARE @AIPromptID UNIQUEIDENTIFIER = '5A0446FE-AAB0-4564-8136-2443D353A168'

-- Insert the Template record
INSERT INTO [${flyway:defaultSchema}].[Template] (
    [ID],
    [Name],
    [Description],
    [CategoryID],
    [UserPrompt],
    [UserID],
    [ActiveAt],
    [DisabledAt],
    [IsActive]
)
VALUES (
    @TemplateID,
    'Agent System Prompt Template',
    'Control wrapper template for AI agent execution that enforces deterministic JSON response format and provides execution context while embedding agent-specific prompts.',
    NULL, -- No category for now
    'This template serves as a control wrapper for AI agents, enforcing consistent response format and execution control while allowing agent-specific prompt embedding.',
    @UserID,
    GETUTCDATE(),
    NULL,
    1
)

-- Insert the TemplateContent record with the actual system prompt template
INSERT INTO [${flyway:defaultSchema}].[TemplateContent] (
    [ID],
    [TemplateID],
    [TypeID],
    [TemplateText],
    [Priority],
    [IsActive]
)
VALUES (
    @TemplateContentID,
    @TemplateID,
    @TemplateContentTypeID,
    N'# AI Agent Execution Framework

You are "{{ agentName }}", an autonomous AI agent in the MemberJunction framework.

**Purpose:** {{ agentDescription }}

## Agent-Specific Instructions

{% if agentPrompt %}
{{ agentPrompt }}
{% else %}
{% PromptEmbed "{{ agentName }}Instructions", data={agentName: agentName, agentDescription: agentDescription, availableActions: availableActions, availableSubAgents: availableSubAgents} %}
{% endif %}

## Available Resources

{% if availableActions.length > 0 %}
**Actions You Can Execute:**
{% for action in availableActions %}
- {{ action.name }} ({{ action.id }}): {{ action.description }}
{% endfor %}
{% endif %}

{% if availableSubAgents.length > 0 %}
**Sub-Agents You Can Delegate To:**
{% for subagent in availableSubAgents %}
- {{ subagent.name }} ({{ subagent.id }}): {{ subagent.description }}
{% endfor %}
{% endif %}

## CRITICAL: Response Format Requirements

**You MUST respond with valid JSON in exactly this format:**

```json
{
  "decision": "execute_action|execute_subagent|complete_task|request_clarification|continue_processing",
  "reasoning": "Your detailed thought process and why you chose this approach",
  "executionPlan": [
    {
      "type": "action|subagent",
      "targetId": "ID_from_available_resources_above",
      "parameters": {},
      "executionOrder": 1,
      "allowParallel": true,
      "description": "What this step accomplishes"
    }
  ],
  "isTaskComplete": false,
  "finalResponse": "Only if isTaskComplete=true, provide the final answer",
  "confidence": 0.8
}
```

## Execution Order Rules

**CRITICAL for parallel/sequential execution:**
- Same executionOrder = PARALLEL execution
- Different executionOrder = SEQUENTIAL execution  
- allowParallel: false = Forces sequential even with same executionOrder

**Examples:**
- `[{executionOrder: 1}, {executionOrder: 1}]` → Both run simultaneously
- `[{executionOrder: 1}, {executionOrder: 2}]` → First completes, then second runs

## Decision Guidelines

1. **Analyze** the current situation and your specific instructions above
2. **Choose** the most effective approach using available resources
3. **Plan** execution order for optimal efficiency
4. **Respond** with the required JSON format

Focus on your agent-specific role while using the execution framework provided.',
    100, -- High priority
    1
)

-- Insert the AIPrompt record that references the template
INSERT INTO [${flyway:defaultSchema}].[AIPrompt] (
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
    [PromptPosition]
)
VALUES (
    @AIPromptID,
    'Agent System Prompt',
    'System prompt template that wraps agent-specific prompts with execution control framework. Enforces deterministic JSON response format for AgentRunner parsing while embedding agent-specific instructions.',
    @TemplateID,
    NULL, -- No category for now
    @AIPromptTypeID, -- Chat type
    'Active',
    'JSON', -- Expects JSON response format
    '{"type": "object", "required": ["decision", "reasoning", "executionPlan", "isTaskComplete", "confidence"]}',
    NULL, -- Any LLM model type
    0, -- No minimum power rank
    'Default',
    'Highest',
    'None', -- No parallelization for system prompts
    NULL,
    NULL,
    'object', -- Returns structured decision object
    '{"decision": "execute_action", "reasoning": "Analysis of the situation", "executionPlan": [{"type": "action", "targetId": "action_id", "parameters": {}, "executionOrder": 1, "allowParallel": true, "description": "Execute this action"}], "isTaskComplete": false, "finalResponse": null, "confidence": 0.9}',
    'Strict', -- Strict validation for system prompts
    3, -- Allow up to 3 retries
    1000, -- 1 second delay
    'Exponential',
    NULL, -- No result selector needed
    0, -- Disable caching for system prompts
    NULL,
    'Exact',
    NULL,
    1, -- Must match model
    1, -- Must match vendor
    1, -- Must match agent
    1, -- Must match config
    'System', -- Always use as system message
    'First' -- Always first in conversation
)




/** CODEGEN OUTPUT **/

/* SQL text to delete entity field value ID BAAD433E-F36B-1410-8E28-00F026831CBD */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='BAAD433E-F36B-1410-8E28-00F026831CBD'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=7 WHERE ID='16AF433E-F36B-1410-8E28-00F026831CBD'

/* SQL text to delete entity field value ID DDAD433E-F36B-1410-8E28-00F026831CBD */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='DDAD433E-F36B-1410-8E28-00F026831CBD'

/* SQL text to update entity field related entity name field map for entity field ID D9A7433E-F36B-1410-8E28-00F026831CBD */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D9A7433E-F36B-1410-8E28-00F026831CBD',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID E1A7433E-F36B-1410-8E28-00F026831CBD */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E1A7433E-F36B-1410-8E28-00F026831CBD',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID E3A7433E-F36B-1410-8E28-00F026831CBD */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E3A7433E-F36B-1410-8E28-00F026831CBD',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 1DA8433E-F36B-1410-8E28-00F026831CBD */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1DA8433E-F36B-1410-8E28-00F026831CBD',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 20A8433E-F36B-1410-8E28-00F026831CBD */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='20A8433E-F36B-1410-8E28-00F026831CBD',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 59A7433E-F36B-1410-8E28-00F026831CBD */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='59A7433E-F36B-1410-8E28-00F026831CBD',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID 62A7433E-F36B-1410-8E28-00F026831CBD */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='62A7433E-F36B-1410-8E28-00F026831CBD',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 63A7433E-F36B-1410-8E28-00F026831CBD */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='63A7433E-F36B-1410-8E28-00F026831CBD',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 64A7433E-F36B-1410-8E28-00F026831CBD */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='64A7433E-F36B-1410-8E28-00F026831CBD',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 69A7433E-F36B-1410-8E28-00F026831CBD */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='69A7433E-F36B-1410-8E28-00F026831CBD',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 7EA7433E-F36B-1410-8E28-00F026831CBD */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7EA7433E-F36B-1410-8E28-00F026831CBD',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID 90A7433E-F36B-1410-8E28-00F026831CBD */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='90A7433E-F36B-1410-8E28-00F026831CBD',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 9CA7433E-F36B-1410-8E28-00F026831CBD */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9CA7433E-F36B-1410-8E28-00F026831CBD',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID A2A7433E-F36B-1410-8E28-00F026831CBD */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A2A7433E-F36B-1410-8E28-00F026831CBD',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID 93A7433E-F36B-1410-8E28-00F026831CBD */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='93A7433E-F36B-1410-8E28-00F026831CBD',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 94A7433E-F36B-1410-8E28-00F026831CBD */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='94A7433E-F36B-1410-8E28-00F026831CBD',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 95A7433E-F36B-1410-8E28-00F026831CBD */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='95A7433E-F36B-1410-8E28-00F026831CBD',
         @RelatedEntityNameFieldMap='ContentFileType'