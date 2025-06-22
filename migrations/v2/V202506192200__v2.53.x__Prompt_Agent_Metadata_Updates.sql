-- Save Template Contents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateTemplateContent @TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@TypeID = 'E7AFCCEC-6A37-EF11-86D4-000D3A4E707E',
@TemplateText = '# Loop Agent Type System Prompt

You are an AI agent operating in a loop-based execution pattern. Your role is to analyze the current state, determine if the task is complete, and decide on the next action to take. You will continue looping until the task is successfully completed. This first section of your system prompt tells you about the Agent Type. Following this section you will learn about the specific agent we are running.

## Your Capabilities

{% if subAgentCount > 0 %}
### Sub-Agents Available: {{ subAgentCount }}
Sub-agents are your team members! Sub-agents have specialized expertise can perform a wide variety of tasks and you may *only execute one sub-agent at at time**. The sub-agents available to you are:
 
{{ subAgentDetails | safe }} 

{% endif %}

{% if actionCount > 0 %}
### Actions Available: {{ actionCount }}
An action is a tool you can use to perform a specific task. You **can** request multiple actions be performed in parallel if their results are independent. If you need to run multiple actions sequentially and reason between them, ask for one action at a time and I''ll bring back the results after each execution.

If you run an action and it fails, read the error message and determine if there is an adjustment you can make to the parameters you are passing. Sometimes when chaining actions - for example doing a web search and then using results for parameters for another action - can require a little trial and error. **You may try this up to 3 times for any given action attempt**

#### Available Actions:
{{ actionDetails | safe }}

{% endif %}


## Task Execution

The user''s request and any additional context will be provided below. Analyze the request and determine:

1. Whether the task has been completed successfully
2. If not complete, what the next step should be
3. Which sub-agent to invoke OR which action to perform (if needed)
4. Your reasoning for the decision
5. Any relevant data or results to pass along

# Specialization:
**Your Name**: {{ agentName }}
**Your Description**: {{ agentDescription }}
You are to take on the persona and specialized instructions provided here.  

## Specialization Precedence
Whenever information in this specialization area of the prompt are in conflict with other information choose the specialization. However, you must
always use our designated response format shown below

## Specialization Details:
{{ agentSpecificPrompt }}


# Response Format
You MUST respond with valid JSON in the following structure:

{{ _OUTPUT_EXAMPLE | safe }}

## Response Format Explanation:

### Required vs Optional Properties
Properties marked with `?` in the example (like `actions?`, `subAgent?`, `userMessage?`) are **optional** and should only be included when relevant to your chosen `nextStep.type`. The `?` notation follows TypeScript convention to indicate optional properties.

### Property Descriptions
- **taskComplete**: Set to `true` only when the entire task is successfully completed
- **reasoning**: Brief description of your thought process and analysis (always required)
- **nextStep**: this object is only needed if taskComplete === false
- **nextStep.type**: 
  - `"action"` - Execute one or more specific action
  - `"sub-agent"` - Execute a single sub-agent
  - `"chat"` - Go back to the user with a message either providing an answer or asking a follow up question to help you complete the task requested.
- **nextStep.actions?**: Only include when type===''action'', an array of 1+ actions you want to run (they are run in parallel)
  - id: UUID of the action
  - name: Name of action
  - params: Object with 0 to many keys - **must match the params the action enumerated above**
- **nextStep.subAgent?**: Only include when type===''sub-agent", a **single** sub-agent you want to run
  - id: UUID for the selected agent
  - name: Name of the agent
  - message: Any and all context you want to send to the sub-agent including data in JSON form and descriptions. This is **important** to be comprehensive as the sub-agent does **NOT** receive the full message history you have, only what you send here.
  - terminateAfter: boolean - if set to true, we won''t come back to you after the sub-agent completes processing and will return the sub-agent result directly to the user. If set to false, we will return the result of the sub-agent to you for another iteration of the conversation and you can decided what''s next.
  - templateParameters: object - if your chosen sub-agent has a list of prompt parameters shown in the agent''s information, provide parameters here in an object such as { "param1": "value1", "param2": "value2" } that will be passed along to the prompt for the sub-agent. Leave templateParameters undefined if there are no parameters for the sub-agent.
- **userMessage?**: Only include when type===''chat'', contains the message you want to send to the user

# Important Guidelines
1. **Always return valid JSON** - No additional text outside the JSON structure, no markdown, just JSON
2. **Be decisive** - Choose clear next steps based on available capabilities
3. **Estimate progress** - Provide meaningful progress updates
4. **Use sub-agents wisely** - Delegate to sub-agents when their specialization matches the need
5. **Complete the loop** - Only set taskComplete to true when you''re reasonably confident the task is done ',
@Priority = 1,
@IsActive = 1,
@ID = '1C4B8853-04B8-4BF1-92D6-B102436837D7';

GO



-- Save Template Params (core SP call only)
EXEC [${flyway:defaultSchema}].spCreateTemplateParam @TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@Name = 'actionCount',
@Description = 'Number of available actions that the agent can perform',
@Type = 'Scalar',
@DefaultValue = NULL,
@IsRequired = 0,
@LinkedParameterName = NULL,
@LinkedParameterField = NULL,
@ExtraFilter = NULL,
@EntityID = NULL,
@RecordID = NULL,
@OrderBy = NULL,
@TemplateContentID = '1C4B8853-04B8-4BF1-92D6-B102436837D7';

GO

-- Save Template Params (core SP call only)
EXEC [${flyway:defaultSchema}].spCreateTemplateParam @TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@Name = 'actionDetails',
@Description = 'Details or list of available actions the agent can use',
@Type = 'Scalar',
@DefaultValue = NULL,
@IsRequired = 0,
@LinkedParameterName = NULL,
@LinkedParameterField = NULL,
@ExtraFilter = NULL,
@EntityID = NULL,
@RecordID = NULL,
@OrderBy = NULL,
@TemplateContentID = '1C4B8853-04B8-4BF1-92D6-B102436837D7';

GO

-- Save Template Params (core SP call only)
EXEC [${flyway:defaultSchema}].spCreateTemplateParam @TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@Name = 'agentDescription',
@Description = 'Description of the AI agent persona and role',
@Type = 'Scalar',
@DefaultValue = NULL,
@IsRequired = 1,
@LinkedParameterName = NULL,
@LinkedParameterField = NULL,
@ExtraFilter = NULL,
@EntityID = NULL,
@RecordID = NULL,
@OrderBy = NULL,
@TemplateContentID = '1C4B8853-04B8-4BF1-92D6-B102436837D7';

GO

-- Save Template Params (core SP call only)
EXEC [${flyway:defaultSchema}].spCreateTemplateParam @TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@Name = 'agentName',
@Description = 'Name of the AI agent persona',
@Type = 'Scalar',
@DefaultValue = NULL,
@IsRequired = 1,
@LinkedParameterName = NULL,
@LinkedParameterField = NULL,
@ExtraFilter = NULL,
@EntityID = NULL,
@RecordID = NULL,
@OrderBy = NULL,
@TemplateContentID = '1C4B8853-04B8-4BF1-92D6-B102436837D7';

GO

-- Save Template Params (core SP call only)
EXEC [${flyway:defaultSchema}].spCreateTemplateParam @TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@Name = 'agentSpecificPrompt',
@Description = 'Additional specialized instructions and prompt details for the agent',
@Type = 'Scalar',
@DefaultValue = NULL,
@IsRequired = 1,
@LinkedParameterName = NULL,
@LinkedParameterField = NULL,
@ExtraFilter = NULL,
@EntityID = NULL,
@RecordID = NULL,
@OrderBy = NULL,
@TemplateContentID = '1C4B8853-04B8-4BF1-92D6-B102436837D7';

GO

-- Save Template Params (core SP call only)
EXEC [${flyway:defaultSchema}].spCreateTemplateParam @TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@Name = 'subAgentCount',
@Description = 'Number of sub-agents available to the main agent',
@Type = 'Scalar',
@DefaultValue = NULL,
@IsRequired = 0,
@LinkedParameterName = NULL,
@LinkedParameterField = NULL,
@ExtraFilter = NULL,
@EntityID = NULL,
@RecordID = NULL,
@OrderBy = NULL,
@TemplateContentID = '1C4B8853-04B8-4BF1-92D6-B102436837D7';

GO

-- Save Template Params (core SP call only)
EXEC [${flyway:defaultSchema}].spCreateTemplateParam @TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@Name = 'subAgentDetails',
@Description = 'Information or listing of available sub-agents for delegation',
@Type = 'Scalar',
@DefaultValue = NULL,
@IsRequired = 0,
@LinkedParameterName = NULL,
@LinkedParameterField = NULL,
@ExtraFilter = NULL,
@EntityID = NULL,
@RecordID = NULL,
@OrderBy = NULL,
@TemplateContentID = '1C4B8853-04B8-4BF1-92D6-B102436837D7';

GO

-- Save Template Params (core SP call only)
EXEC [${flyway:defaultSchema}].spCreateTemplateParam @TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@Name = '_OUTPUT_EXAMPLE',
@Description = 'Example JSON structure illustrating the required response format',
@Type = 'Scalar',
@DefaultValue = NULL,
@IsRequired = 1,
@LinkedParameterName = NULL,
@LinkedParameterField = NULL,
@ExtraFilter = NULL,
@EntityID = NULL,
@RecordID = NULL,
@OrderBy = NULL,
@TemplateContentID = '1C4B8853-04B8-4BF1-92D6-B102436837D7';

GO

-- Save AI Prompts (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIPrompt @Name = 'Loop Agent Type: System Prompt',
@Description = 'Basic control structure for the Loop Agent Type.',
@TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@CategoryID = 'A19D433E-F36B-1410-8DB1-00021F8B792E',
@TypeID = 'A6DA423E-F36B-1410-8DAC-00021F8B792E',
@Status = 'Active',
@ResponseFormat = 'JSON',
@ModelSpecificResponseFormat = NULL,
@AIModelTypeID = NULL,
@MinPowerRank = 0,
@SelectionStrategy = 'Specific',
@PowerPreference = 'Highest',
@ParallelizationMode = 'None',
@ParallelCount = NULL,
@ParallelConfigParam = NULL,
@OutputType = 'object',
@OutputExample = '{
  "taskComplete": false,
  "nextStep": {
    "type": "action",
    "actions?": [
      {
        "id": "action UUID goes here",
        "name": "action name goes here",
        "params": {
          "param1": "value1",
          "param2": "value2"
        }
      }
    ],
    "subAgent?": {
      "id": "sub agent UUID goes here",
      "name": "sub agent name goes here",
      "message": "your message to the sub-agent including any important context for the sub-agent to be aware of. Can be text and/or JSON",
      "terminateAfter": true,
      "templateParameters": {
        "param1": "value1",
        "param2": "value2"
      }
    },
    "userMessage?": "Provide a message to the user, only provided if type=''chat''"
  },
  "reasoning": "The conversation is still in the information gathering phase. The user has expressed interest in products but hasn''t provided enough details for me to make accurate recommendations yet. I need to ask about budget next",
  "confidence": 0.90
}',
@ValidationBehavior = 'Strict',
@MaxRetries = 2,
@RetryDelayMS = 1000,
@RetryStrategy = 'Fixed',
@ResultSelectorPromptID = NULL,
@EnableCaching = 0,
@CacheTTLSeconds = NULL,
@CacheMatchType = 'Exact',
@CacheSimilarityThreshold = NULL,
@CacheMustMatchModel = 1,
@CacheMustMatchVendor = 1,
@CacheMustMatchAgent = 0,
@CacheMustMatchConfig = 0,
@PromptRole = 'System',
@PromptPosition = 'First',
@Temperature = NULL,
@TopP = NULL,
@TopK = NULL,
@MinP = NULL,
@FrequencyPenalty = NULL,
@PresencePenalty = NULL,
@Seed = NULL,
@StopSequences = NULL,
@IncludeLogProbs = 0,
@TopLogProbs = NULL,
@ID = 'FF7D441F-36E1-458A-B548-0FC2208923BE';

GO
