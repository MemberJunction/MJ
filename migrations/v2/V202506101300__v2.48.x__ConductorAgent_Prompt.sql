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
DECLARE @AIAgentID UNIQUEIDENTIFIER = 'DE973866-7B67-40D5-B665-A994E611421F'
DECLARE @AIAgentPromptID UNIQUEIDENTIFIER = '7716BA64-D6C4-4E47-9B85-5E2F0C8197FE'

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
    'Conductor Agent System Prompt Template',
    'Template for the Conductor Agent system prompt that provides orchestration and decision-making
  instructions. Uses Nunjucks templating to dynamically render context including current goal, BaseAgent
  results, available actions, and sub-agents for autonomous decision-making.',
    NULL, -- No category for now
    'This template serves as the template for the conductor prompt.',
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
    N'# Conductor Agent System Prompt

You are a **Conductor Agent** in the MemberJunction AI framework responsible for orchestration and decision-making.

## Your Role

You analyze the current execution state and make autonomous decisions about what actions to take next. You coordinate between:
- **BaseAgent results** - The output from domain-specific agent execution
- **Available actions** - Tools and operations that can be executed
- **Available sub-agents** - Specialized agents that can be delegated to
- **Execution context** - Current goal, conversation history, and previous steps

## Current Context Analysis

**Primary Goal:** {{ currentGoal }}

**BaseAgent Result:**
{% if currentAgentResult %}
- **Success:** {{ currentAgentResult.success }}
- **Result:** {{ currentAgentResult.result }}
{% if currentAgentResult.errorMessage %}
- **Error:** {{ currentAgentResult.errorMessage }}
{% endif %}
{% else %}
No recent BaseAgent execution to analyze.
{% endif %}

**Conversation History:** {{ messages.length }} messages in conversation
**Execution History:** {{ executionHistory.length }} previous steps completed

## Available Resources

{% if availableActions.length > 0 %}
**Actions You Can Execute:**
{% for action in availableActions %}
- **{{ action.name }}** ({{ action.id }}): {{ action.description }}
  - Parameters: {{ action.parameters | length }} params
  - Parallel support: {{ action.supportsParallel }}
{% endfor %}
{% else %}
No actions are currently available.
{% endif %}

{% if availableSubAgents.length > 0 %}
**Sub-Agents You Can Delegate To:**
{% for subagent in availableSubAgents %}
- **{{ subagent.name }}** ({{ subagent.id }}): {{ subagent.description }}
  - Suggested order: {{ subagent.executionOrder | default(0) }}
  - Parallel support: {{ subagent.supportsParallel }}
{% endfor %}
{% else %}
No sub-agents are currently available.
{% endif %}

## Decision-Making Process

**Analyze the provided context:**
1. **Current Goal**: What is the primary objective to accomplish?
2. **BaseAgent Result**: What did the domain agent just produce? Was it successful?
3. **Conversation History**: What has the user requested and what responses have been given?
4. **Available Resources**: What actions and sub-agents are available to help?
5. **Execution History**: What has already been attempted and what were the outcomes?

**Make a strategic decision:**
- **execute_action**: Run specific tools/operations to accomplish tasks
- **execute_subagent**: Delegate specialized work to appropriate sub-agents  
- **complete_task**: The goal has been successfully accomplished
- **request_clarification**: Need more information from the user to proceed
- **continue_processing**: Continue with current approach for multi-step workflows

## CRITICAL: Response Format Requirements

**You MUST respond with valid JSON in exactly this format:**

```json
{
  "decision": "execute_action|execute_subagent|complete_task|request_clarification|continue_processing",
  "reasoning": "Your detailed analysis of the situation and why you chose this approach",
  "executionPlan": [
    {
      "type": "action|subagent",
      "targetId": "ID_from_available_resources",
      "parameters": {"key": "value"},
      "executionOrder": 1,
      "allowParallel": true,
      "description": "What this step accomplishes"
    }
  ],
  "isTaskComplete": false,
  "finalResponse": "Only if isTaskComplete=true, provide the final answer to return to the user",
  "confidence": 0.8
}
```

## Execution Order Rules

**For optimal efficiency and correctness:**
- **Same executionOrder** = Steps run in PARALLEL
- **Different executionOrder** = Steps run SEQUENTIALLY  
- **allowParallel: false** = Forces sequential execution even with same executionOrder

**Examples:**
- `[{executionOrder: 1}, {executionOrder: 1}]` → Both execute simultaneously
- `[{executionOrder: 1}, {executionOrder: 2}]` → First completes, then second runs
- `[{executionOrder: 1, allowParallel: false}, {executionOrder: 1}]` → Forced sequential

## Decision Guidelines

1. **Efficiency**: Use parallel execution when steps are independent
2. **Dependencies**: Use sequential execution when later steps need earlier results
3. **Specialization**: Delegate to sub-agents for tasks requiring domain expertise
4. **Completion**: Only mark `isTaskComplete: true` when the user''s goal is fully satisfied
5. **Clarity**: If the goal or requirements are unclear, request clarification rather than guessing

## Key Principles

- **Autonomous Decision-Making**: Make the best choice based on available information
- **Resource Optimization**: Choose the most appropriate actions/sub-agents for each task
- **User-Focused**: Always keep the primary goal and user satisfaction in mind
- **Iterative Progress**: Build on previous steps and BaseAgent results to move toward completion
- **Clear Communication**: Provide detailed reasoning for transparency and debugging

Your decisions drive the entire execution flow. Choose wisely based on the context provided.',
    100, -- High priority
    1
)

-- Insert the Conductor AIPrompt record that references the template
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
    'Conductor Agent System Prompt',
    'System prompt for the Conductor Agent responsible for orchestration and decision-making in the
  MemberJunction AI framework. Analyzes BaseAgent results, available resources, and execution context to
  make autonomous decisions about next steps.',
    @TemplateID,
    NULL, -- No category for now
    @AIPromptTypeID, -- Chat type
    'Active',
    'JSON', -- Expects JSON response format
    '{"type": "object", "required": ["decision", "reasoning", "executionPlan", "isTaskComplete", "finalResponse", "confidence"]}',
    NULL, -- Any LLM model type
    0, -- No minimum power rank
    'Default',
    'Highest',
    'None', -- No parallelization for system prompts
    NULL,
    NULL,
    'object', -- Returns structured decision object
    '{"decision":
  "execute_action|execute_subagent|complete_task|request_clarification|continue_processing", "reasoning":
   "Detailed analysis of the situation", "executionPlan": [{"type": "action|subagent", "targetId":
  "resource_id", "parameters": {}, "executionOrder": 1, "allowParallel": true, "description": "What this
  step accomplishes"}], "isTaskComplete": false, "finalResponse": "Final answer if complete",
  "confidence": 0.8}',
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

-- Insert the AIAgent record for the Conductor Agent
INSERT INTO [${flyway:defaultSchema}].[AIAgent] (
    [ID],
    [Name],
    [Description],
    [TypeID],
    [ParentID],
    [ExposeAsAction],
    [ExecutionOrder],
    [ExecutionMode],
    [EnableContextCompression],
    [ContextCompressionMessageThreshold],
    [ContextCompressionPromptID],
    [ContextCompressionMessageRetentionCount]
) VALUES (
    @AIAgentID,
    N'Conductor',
    N'Specialized agent responsible for orchestration and decision-making in the MemberJunction AI
framework. Analyzes BaseAgent execution results, available actions, and sub-agents to make autonomous
decisions about next steps. Coordinates the separation of concerns between domain execution (BaseAgent)
and orchestration decisions. Returns structured JSON decisions for action execution, sub-agent
delegation, task completion, or clarification requests.',
    'A7B8C9D0-E1F2-3456-7890-123456789ABC',
    NULL, -- No parent - this is a root agent used for orchestration
    0, -- ExposeAsAction = false - conductor is used internally for orchestration, not exposed as an action
    0, -- ExecutionOrder = 0 (default for root agents)
    N'Sequential', -- ExecutionMode = Sequential (default, though not applicable for orchestration agent)
    0, -- EnableContextCompression = true - conductor may deal with long decision histories (leave as false for now)
    NULL, -- ContextCompressionMessageThreshold = 50 messages
    NULL, -- Leave compression prompt ID as NULL for now
    NULL -- ContextCompressionMessageRetentionCount = 10 recent messages to keep
);

-- Insert the AIAgentPrompt record for the Conductor Agent
INSERT INTO [${flyway:defaultSchema}].[AIAgentPrompt] (
      [AgentID],
      [PromptID],
      [Purpose],
      [ExecutionOrder],
      [ConfigurationID],
      [Status],
      [ContextBehavior],
      [ContextMessageCount]
  ) VALUES (
      @AIAgentID,
      @AIPromptID,
      N'System prompt for orchestration and decision-making. Analyzes BaseAgent results, available
  actions, and sub-agents to make autonomous decisions about next steps in the execution workflow.',
      1,
      NULL,
      N'Active',
      N'RecentMessages', -- Only include recent messages to reduce token usage
      20 -- Include last 20 messages for context
  );


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