

-- Save Template Params (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateTemplateParam @TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@Name = N'subAgentDetails',
@Description = N'Details and descriptions of the available sub-agents',
@Type = N'Scalar',
@DefaultValue = NULL,
@IsRequired = 0,
@LinkedParameterName = NULL,
@LinkedParameterField = NULL,
@ExtraFilter = NULL,
@EntityID = NULL,
@RecordID = NULL,
@OrderBy = NULL,
@TemplateContentID = NULL,
@ID = 'D850831D-0655-41D0-9820-70198FC7B2CD';

-- Save Template Params (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateTemplateParam @TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@Name = N'agentSpecificPrompt',
@Description = N'Specialized instructions and detailed prompt for the AI agent''s persona',
@Type = N'Scalar',
@DefaultValue = NULL,
@IsRequired = 0,
@LinkedParameterName = NULL,
@LinkedParameterField = NULL,
@ExtraFilter = NULL,
@EntityID = NULL,
@RecordID = NULL,
@OrderBy = NULL,
@TemplateContentID = NULL,
@ID = '7F96CEC4-1E52-4A4F-951F-8CA30668D6C1';

-- Save Template Params (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateTemplateParam @TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@Name = N'agentName',
@Description = N'Name of the AI agent persona',
@Type = N'Scalar',
@DefaultValue = NULL,
@IsRequired = 0,
@LinkedParameterName = NULL,
@LinkedParameterField = NULL,
@ExtraFilter = NULL,
@EntityID = NULL,
@RecordID = NULL,
@OrderBy = NULL,
@TemplateContentID = NULL,
@ID = '2D1EB822-9101-43FF-B217-A637535508C8';

-- Save Template Params (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateTemplateParam @TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@Name = N'actionDetails',
@Description = N'Details and description of available actions to perform',
@Type = N'Scalar',
@DefaultValue = NULL,
@IsRequired = 0,
@LinkedParameterName = NULL,
@LinkedParameterField = NULL,
@ExtraFilter = NULL,
@EntityID = NULL,
@RecordID = NULL,
@OrderBy = NULL,
@TemplateContentID = NULL,
@ID = '85001831-9A63-4711-B3E2-D40323FED1C9';

-- Save Template Params (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateTemplateParam @TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@Name = N'agentDescription',
@Description = N'Description of the AI agent''s persona and role',
@Type = N'Scalar',
@DefaultValue = NULL,
@IsRequired = 0,
@LinkedParameterName = NULL,
@LinkedParameterField = NULL,
@ExtraFilter = NULL,
@EntityID = NULL,
@RecordID = NULL,
@OrderBy = NULL,
@TemplateContentID = NULL,
@ID = '7F0027DA-F662-4C4D-AC66-EDC84A9DBF0C';

-- Save Template Params (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateTemplateParam @TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@Name = N'actionCount',
@Description = N'Number of available actions that the agent can perform',
@Type = N'Scalar',
@DefaultValue = NULL,
@IsRequired = 0,
@LinkedParameterName = NULL,
@LinkedParameterField = NULL,
@ExtraFilter = NULL,
@EntityID = NULL,
@RecordID = NULL,
@OrderBy = NULL,
@TemplateContentID = NULL,
@ID = 'ADEF6864-F5D6-497C-B5B2-FA7F9C6C62A1';

-- Save AI Prompts (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIPrompt @Name = N'Loop Agent Type: System Prompt',
@Description = N'Basic control structure for the Loop Agent Type',
@TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@CategoryID = '838572BE-9464-4935-BC34-4806FD80A69C',
@TypeID = 'A6DA423E-F36B-1410-8DAC-00021F8B792E',
@Status = N'Active',
@ResponseFormat = N'JSON',
@ModelSpecificResponseFormat = NULL,
@AIModelTypeID = NULL,
@MinPowerRank = 0,
@SelectionStrategy = N'Specific',
@PowerPreference = N'Highest',
@ParallelizationMode = N'None',
@ParallelCount = NULL,
@ParallelConfigParam = NULL,
@OutputType = N'object',
@OutputExample = N'{
  "taskComplete": "[BOOLEAN: true if task is fully complete, false if more steps needed]",
  "message": "[STRING: Human-readable message about current status or final result - this is what the user/caller sees - they do NOT see what is in the payload, so include EVERYTHING here that is important for the user even if it overlaps with the payload]",
  "payload*": {
    "[KEY]": "[VALUE: Your agent-specific data structure goes here]",
    "[EXAMPLE_STRUCTURE]": {
      "resultsFound": "[NUMBER or other data]",
      "processedItems": "[Array of processed data]",
      "customField": "[Any structure your agent needs to return]"
    },
    "[NOTE]": "This payload structure is completely flexible based on your agent''s purpose"
  },
  "reasoning": "[STRING: Your internal explanation of why you made this decision - helps with debugging]",
  "confidence?": "[OPTIONAL NUMBER: 0.0 to 1.0 indicating confidence in this decision]",
  "nextStep?": {
    "type": "[REQUIRED if taskComplete=false: Must be exactly one of: ''action'' | ''sub-agent'' | ''chat'']",
    "actions?": [
      {
        "id": "[UUID: The exact ID from available actions list]",
        "name": "[STRING: The exact name from available actions list]",
        "params*": {
          "[PARAM_NAME]": "[PARAM_VALUE: Must match action''s expected parameters]",
          "[ANOTHER_PARAM]": "[Value matching the action''s parameter type]"
        }
      }
    ],
    "subAgent?": {
      "id": "[UUID: The exact ID from available sub-agents list]",
      "name": "[STRING: The exact name from available sub-agents list]",
      "message": "[STRING: Complete context and instructions for the sub-agent - they don''t see conversation history]",
      "templateParameters*": {
        "[TEMPLATE_PARAM_NAME]": "[VALUE: If sub-agent has template parameters, provide values here]"
      },
      "terminateAfter": "[BOOLEAN: true to end parent agent after sub-agent completes, false to continue]"
    }
  }
}',
@ValidationBehavior = N'Strict',
@MaxRetries = 2,
@RetryDelayMS = 1000,
@RetryStrategy = N'Fixed',
@ResultSelectorPromptID = NULL,
@EnableCaching = 0,
@CacheTTLSeconds = NULL,
@CacheMatchType = N'Exact',
@CacheSimilarityThreshold = NULL,
@CacheMustMatchModel = 1,
@CacheMustMatchVendor = 1,
@CacheMustMatchAgent = 0,
@CacheMustMatchConfig = 0,
@PromptRole = N'System',
@PromptPosition = N'First',
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

-- Save Template Contents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateTemplateContent @TemplateID = '33AF5671-077E-46A9-94AB-340783733024',
@TypeID = 'E7AFCCEC-6A37-EF11-86D4-000D3A4E707E',
@TemplateText = N'You are an expert at parsing Nunjucks templates. Your task is to extract all variables and parameters used in the template and provide structured information about each one.

## Template to Analyze: 
{{ templateText }}

## Instructions:
Identify ALL variables used in the template, including:
1. Simple variables: {% raw %}{{ variableName }}{% endraw %}
2. Object properties: {% raw %}{{ user.email }}{% endraw %}, {% raw %}{{ data.items[${flyway:defaultSchema}].name }}{% endraw %}
3. Variables in conditionals: {% raw %}{% if isActive %}{% endraw %}, {% raw %}{% if user.role == "admin" %}{% endraw %}
4. Loop variables: {% raw %}{% for item in items %}{% endraw %}, {% raw %}{% for key, value in object %}{% endraw %}
5. Variables in filters: {% raw %}{{ name | default(userName) }}{% endraw %}
6. Variables in function calls: {% raw %}{{ formatDate(createdAt) }}{% endraw %}
7. Variables in assignments: {% raw %}{% set total = price * quantity %}{% endraw %}

## **IMPORTANT** 
Do NOT include variables that are shown within {% raw %}{% raw %}{% endraw %}{% endraw %} blocks, those are for illustrative purposes and part of an illustration of what another template might have. Only consider variables that are **NOT** part of raw blocks to be valid for the purpose of this request.

For nested object references (like user.email), extract only the TOP-LEVEL variable name (user).

## Output Format: 
Return a JSON array of parameter objects with this structure:

```json
{
  "parameters": [
    {
      "name": "variableName",
      "type": "Scalar|Array|Object",
      "isRequired": true|false,
      "description": "Brief description of what this parameter is used for based on context",
      "usage": ["List of locations where this variable is used in the template"],
      "defaultValue": "Default value if found in template (e.g., from default filter)"
    }
  ]
}
```

## Rules:
1. Only include each variable ONCE (deduplicate)
2. Ignore Nunjucks built-in variables (loop, super, etc.)
3. For type detection:
   - If used in {% raw %}{% for x in variable %}{% endraw %} → type is "Array"
   - If properties are accessed (variable.property) → type is "Object"
   - Otherwise → type is "Scalar"
4. Generally speaking consider variables to **NOT** be required unless it is clear the template will be dramatically negatively affected due to the absence of the variable.
5. Include meaningful descriptions based on usage context
6. Sort parameters alphabetically by name

## Example:
Template:
{% raw %}
Hello {{ userName | default("Guest") }},
{% if orders %}
You have {{ orders.length }} orders.
{% for order in orders %}
- Order #{{ order.id }}: {{ order.total }}
{% endfor %}
{% endif %}
{% endraw %}

Output:
```json
{
  "parameters": [
    {
      "name": "orders",
      "type": "Array",
      "isRequired": false,
      "description": "List of user orders with id and total properties",
      "usage": ["if condition line 2", "for loop line 4", "length property line 3"],
      "defaultValue": null
    },
    {
      "name": "userName",
      "type": "Scalar",
      "isRequired": false,
      "description": "Name of the user to greet",
      "usage": ["greeting line 1"],
      "defaultValue": "Guest"
    }
  ]
}
```',
@Priority = 1,
@IsActive = 1,
@ID = '87E7401E-1AB6-4A41-A257-20ED3AE2CDA5';

-- Save AI Prompts (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIPrompt @Name = N'Template Parameter Extraction',
@Description = N'Extracts Nunjucks variables and their types from template strings. Analyzes template content to identify all parameters used and infers their expected data types.',
@TemplateID = '33AF5671-077E-46A9-94AB-340783733024',
@CategoryID = '7D2DEF7F-138F-4620-8309-33964A97A997',
@TypeID = 'A6DA423E-F36B-1410-8DAC-00021F8B792E',
@Status = N'Active',
@ResponseFormat = N'JSON',
@ModelSpecificResponseFormat = NULL,
@AIModelTypeID = NULL,
@MinPowerRank = 0,
@SelectionStrategy = N'Specific',
@PowerPreference = N'Highest',
@ParallelizationMode = N'None',
@ParallelCount = NULL,
@ParallelConfigParam = NULL,
@OutputType = N'object',
@OutputExample = N'{
  "parameters": [
    {
      "name": "customerName",
      "type": "Scalar",
      "isRequired": true,
      "description": "The name of the customer",
      "usage": ["greeting header", "personalization"],
      "defaultValue": null
    },
    {
      "name": "orderItems",
      "type": "Array",
      "isRequired": false,
      "description": "List of items in the customer''s order",
      "usage": ["order details section", "item iteration"],
      "defaultValue": null
    },
    {
      "name": "companyInfo",
      "type": "Object",
      "isRequired": true,
      "description": "Company information object containing name, address, and contact details",
      "usage": ["footer section", "contact information"],
      "defaultValue": null
    }
  ]
}',
@ValidationBehavior = N'Strict',
@MaxRetries = 2,
@RetryDelayMS = 1000,
@RetryStrategy = N'Fixed',
@ResultSelectorPromptID = NULL,
@EnableCaching = 0,
@CacheTTLSeconds = NULL,
@CacheMatchType = N'Exact',
@CacheSimilarityThreshold = NULL,
@CacheMustMatchModel = 1,
@CacheMustMatchVendor = 1,
@CacheMustMatchAgent = 0,
@CacheMustMatchConfig = 0,
@PromptRole = N'System',
@PromptPosition = N'First',
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
@ID = 'C1D7FE6B-287B-4B3F-8618-4CDBCF1394BB';


-- End of SQL Logging Session
-- Session ID: c4c988ca-dfe9-4459-85fc-fa31a2b06d9c
-- Completed: 2025-06-26T20:02:56.166Z
-- Duration: 12248ms
-- Total Statements: 12
