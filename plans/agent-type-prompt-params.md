# Agent Type Prompt Params - Implementation Plan

## Overview

This feature adds flexibility to agent type system prompts by allowing per-agent configuration of which prompt sections to include. This enables significant token savings for agents that don't need all capabilities documented in their system prompt.

## Problem Statement

The Loop agent type system prompt is ~513 lines (~5,000-6,000 tokens) and includes documentation for:
- ForEach/While operations (~1,000 tokens)
- Response forms (~600 tokens)
- Actionable/automatic commands (~1,000 tokens)
- Message expansion (~200 tokens)
- Full TypeScript type definitions (~1,000 tokens)

Many agents never use these features but pay the token cost every iteration. An agent that only uses actions and sub-agents wastes ~2,800 tokens per prompt execution on unused documentation.

## Solution Design

### Two-Level Configuration

1. **AgentType.PromptParamsSchema** - JSON Schema defining available parameters and their defaults
2. **AIAgent.AgentTypePromptParams** - JSON values for a specific agent's configuration

### Merge Precedence (lowest to highest)

1. Schema defaults (from AgentType.PromptParamsSchema)
2. Agent config (from AIAgent.AgentTypePromptParams)
3. Runtime override (from ExecuteAgentParams.data.__agentTypePromptParams)

### Template Variable Injection

The merged params are injected into all agent prompts as `__agentTypePromptParams`, enabling Nunjucks conditionals:

```nunjucks
{% if __agentTypePromptParams.includeForEachDocs != false %}
### ForEach: Process Collections Efficiently
...
{% endif %}
```

The `!= false` pattern ensures backward compatibility - sections include by default unless explicitly disabled.

---

## Database Changes

### Migration: Add PromptParamsSchema to AIAgentType

```sql
-- Add PromptParamsSchema column to AI Agent Types
ALTER TABLE [${flyway:defaultSchema}].[AIAgentType]
ADD [PromptParamsSchema] NVARCHAR(MAX) NULL;

-- Add description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON Schema defining the available prompt parameters for this agent type. Includes property definitions with types, defaults, and descriptions. Used by agents of this type to customize which prompt sections are included.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIAgentType',
    @level2type = N'COLUMN', @level2name = 'PromptParamsSchema';
```

### Migration: Add AgentTypePromptParams to AIAgent

```sql
-- Add AgentTypePromptParams column to AI Agents
ALTER TABLE [${flyway:defaultSchema}].[AIAgent]
ADD [AgentTypePromptParams] NVARCHAR(MAX) NULL;

-- Add description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON object containing parameter values that customize how this agent''s type-level system prompt is rendered. Schema is defined by the agent type''s PromptParamsSchema field. Allows per-agent control over which prompt sections are included.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'AgentTypePromptParams';
```

---

## TypeScript Interface

### Location: `packages/AI/Agents/src/agent-types/loop-agent-prompt-params.ts`

```typescript
/**
 * Prompt parameters for Loop Agent Type.
 * Controls which sections are included in the system prompt to optimize token usage.
 *
 * All boolean properties default to true (include section) when not specified.
 * Set to false to exclude a section from the prompt.
 */
export interface LoopAgentTypePromptParams {
    // === Section Inclusion Flags ===

    /**
     * Include full LoopAgentResponse TypeScript definition.
     * Disable if agent has custom examples that cover the response format.
     * @default true
     */
    includeResponseTypeDefinition?: boolean;

    /**
     * Include ForEach operation documentation and examples.
     * Disable for agents that never iterate over collections.
     * @default true
     */
    includeForEachDocs?: boolean;

    /**
     * Include While operation documentation and examples.
     * Disable for agents that never use polling/conditional loops.
     * @default true
     */
    includeWhileDocs?: boolean;

    /**
     * Include response form documentation for collecting user input.
     * Disable for agents that never need structured user input.
     * @default true
     */
    includeResponseFormDocs?: boolean;

    /**
     * Include actionable/automatic commands documentation.
     * Disable for agents that don't open resources or trigger UI actions.
     * @default true
     */
    includeCommandDocs?: boolean;

    /**
     * Include message expansion documentation.
     * Disable for agents that don't use message compaction/expansion.
     * @default true
     */
    includeMessageExpansionDocs?: boolean;

    /**
     * Include variable references documentation (payload.*, item.*, etc).
     * Disable if agent has custom examples showing variable usage.
     * @default true
     */
    includeVariableRefsDocs?: boolean;

    // === Content Limiting ===

    /**
     * Maximum number of sub-agents to include in prompt details.
     * -1 = include all (default)
     * 0 = include none (hide sub-agent capabilities)
     * N = include first N sub-agents
     * @default -1
     */
    maxSubAgentsInPrompt?: number;

    /**
     * Maximum number of actions to include in prompt details.
     * -1 = include all (default)
     * 0 = include none (hide action capabilities)
     * N = include first N actions
     * @default -1
     */
    maxActionsInPrompt?: number;
}
```

---

## BaseAgent Implementation

### Location: `packages/AI/Agents/src/base-agent.ts`

### New Method: buildAgentTypePromptParams

```typescript
/**
 * Builds merged agent type prompt params from schema defaults,
 * agent config, and runtime overrides.
 *
 * Merge precedence (lowest to highest):
 * 1. Schema defaults (from AgentType.PromptParamsSchema)
 * 2. Agent config (from AIAgent.AgentTypePromptParams)
 * 3. Runtime overrides (from ExecuteAgentParams.data.__agentTypePromptParams)
 *
 * @param agentType - The agent type entity with schema definition
 * @param agent - The agent entity with configured values
 * @param runtimeOverrides - Optional runtime overrides from ExecuteAgentParams.data
 * @returns Merged prompt params object
 */
protected buildAgentTypePromptParams(
    agentType: AIAgentTypeEntity,
    agent: AIAgentEntityExtended,
    runtimeOverrides?: Record<string, unknown>
): Record<string, unknown> {
    // 1. Extract defaults from schema
    const schemaDefaults = this.extractSchemaDefaults(agentType.PromptParamsSchema);

    // 2. Parse agent-level config
    let agentParams: Record<string, unknown> = {};
    if (agent.AgentTypePromptParams) {
        try {
            agentParams = JSON.parse(agent.AgentTypePromptParams);
        } catch (e) {
            LogError(`Failed to parse AgentTypePromptParams for agent ${agent.Name}: ${e.message}`);
        }
    }

    // 3. Merge all layers
    const merged = {
        ...schemaDefaults,
        ...agentParams,
        ...(runtimeOverrides || {})
    };

    return merged;
}

/**
 * Extracts default values from a JSON Schema definition.
 *
 * @param schemaJson - JSON string containing the schema
 * @returns Object with property names and their default values
 */
protected extractSchemaDefaults(schemaJson: string | null): Record<string, unknown> {
    if (!schemaJson) return {};

    try {
        const schema = JSON.parse(schemaJson);
        const defaults: Record<string, unknown> = {};

        if (schema.properties) {
            for (const [key, prop] of Object.entries(schema.properties)) {
                const propDef = prop as { default?: unknown };
                if (propDef.default !== undefined) {
                    defaults[key] = propDef.default;
                }
            }
        }

        return defaults;
    } catch (e) {
        LogError(`Failed to parse PromptParamsSchema: ${e.message}`);
        return {};
    }
}
```

### Modify: gatherPromptTemplateData

Add injection of `__agentTypePromptParams` into the context data:

```typescript
protected async gatherPromptTemplateData(
    agent: AIAgentEntityExtended,
    contextUser: UserInfo,
    extraData?: Record<string, any>,
    actionChanges?: ActionChange[]
): Promise<AgentContextData & Record<string, any>> {
    // ... existing code to gather sub-agents, actions, etc ...

    // Build merged agent type prompt params
    const agentType = AIEngine.Instance.AgentTypes.find(at => at.ID === agent.TypeID);
    const agentTypePromptParams = agentType
        ? this.buildAgentTypePromptParams(
            agentType,
            agent,
            extraData?.__agentTypePromptParams
          )
        : {};

    const contextData: AgentContextData & Record<string, any> = {
        agentName: agent.Name,
        agentDescription: agent.Description,
        parentAgentName: agent.Parent ? agent.Parent.trim() : "",
        subAgentCount: uniqueActiveSubAgents.length,
        subAgentDetails: JSON.stringify(subAgentDetails, null, 2),
        actionCount: activeActions.length,
        actionDetails: JSON.stringify(actionDetails, null, 2),

        // Inject agent type prompt params
        __agentTypePromptParams: agentTypePromptParams,

        // Spread any extra data (but __agentTypePromptParams already merged above)
        ...extraData
    };

    return contextData;
}
```

---

## Loop Agent System Prompt Updates

### Location: `metadata/prompts/templates/system/loop-agent-type-system-prompt.template.md`

Wrap optional sections with Nunjucks conditionals:

```nunjucks
# Response Format
Return ONLY JSON adhering to the interface `LoopAgentResponse`
{% if __agentTypePromptParams.includeResponseTypeDefinition != false %}
```ts
{@include ../../../../packages/AI/Agents/src/agent-types/loop-agent-response-type.ts }
```
{% endif %}

{# ... existing Role and Capabilities sections ... #}

{% if __agentTypePromptParams.includeMessageExpansionDocs != false %}
## Message Expansion

Some action results may be **compacted** to save tokens...
{# ... full message expansion docs ... #}
{% endif %}

## Iterative Operations

{% if __agentTypePromptParams.includeForEachDocs != false or __agentTypePromptParams.includeWhileDocs != false %}
**When processing multiple items or retrying operations, use ForEach/While instead of manual iteration.**
{% endif %}

{% if __agentTypePromptParams.includeForEachDocs != false %}
### ForEach: Process Collections Efficiently
{# ... full ForEach docs (~90 lines) ... #}
{% endif %}

{% if __agentTypePromptParams.includeWhileDocs != false %}
### While: Polling and Conditional Loops
{# ... full While docs (~40 lines) ... #}
{% endif %}

{% if __agentTypePromptParams.includeVariableRefsDocs != false %}
### Variable References in Params
- `"item.field"` - Current item's property (ForEach)
- `"attempt.attemptNumber"` - Current attempt number (While)
- `"payload.field"` - Value from payload
- `"index"` - Loop counter (0-based)
- Static values need no prefix: `"Welcome!"`
{% endif %}

{# ... Current State section (always included) ... #}

{% if __agentTypePromptParams.includeResponseFormDocs != false %}
## User Input Collection with Response Forms
{# ... full response form docs (~80 lines) ... #}
{% endif %}

{% if __agentTypePromptParams.includeCommandDocs != false %}
## Providing Actions After Completion
{# ... full actionable commands docs (~130 lines) ... #}

## Refreshing UI After Changes
{# ... full automatic commands docs ... #}
{% endif %}
```

---

## Metadata: Loop Agent Type Schema

### Location: Update via migration or mj-sync

Populate `PromptParamsSchema` for the Loop Agent Type.

The schema uses JSON Schema format with `description` fields on each property. These descriptions serve dual purposes:
1. **Documentation** - Explains what each parameter does
2. **Future UI** - Can be displayed as help text/tooltips in the agent configuration UI

```json
{
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
            "description": "Include actionable and automatic commands documentation. Actionable commands create clickable buttons (e.g., 'Open Record'), automatic commands trigger UI updates (e.g., refresh cache, show notification). Disable for agents that don't need to provide navigation or trigger UI actions."
        },
        "includeMessageExpansionDocs": {
            "type": "boolean",
            "default": true,
            "description": "Include message expansion documentation. Message expansion allows agents to request full content from previously compacted messages. Disable for agents that don't use message compaction or don't need to access compacted content."
        },
        "includeVariableRefsDocs": {
            "type": "boolean",
            "default": true,
            "description": "Include variable references documentation (payload.*, item.*, index, etc.). These explain how to reference data in action parameters and loop contexts. Disable if your agent's custom examples already demonstrate variable usage patterns."
        },
        "maxSubAgentsInPrompt": {
            "type": "integer",
            "default": -1,
            "description": "Maximum number of sub-agents to include in the prompt's capabilities section. Use -1 to include all available sub-agents, 0 to hide sub-agent capabilities entirely, or a positive number to limit to the first N sub-agents. Useful for agents with many sub-agents where only a few are commonly used."
        },
        "maxActionsInPrompt": {
            "type": "integer",
            "default": -1,
            "description": "Maximum number of actions to include in the prompt's capabilities section. Use -1 to include all available actions, 0 to hide action capabilities entirely, or a positive number to limit to the first N actions. Useful for agents with many actions where only a few are commonly used."
        }
    }
}
```

---

## Implementation Tasks

### Phase 1: Database & Entities
1. Create migration adding `PromptParamsSchema` to `AIAgentType`
2. Create migration adding `AgentTypePromptParams` to `AIAgent`
3. Run CodeGen to generate entity properties
4. Build affected packages

### Phase 2: BaseAgent Implementation
1. Create `loop-agent-prompt-params.ts` with TypeScript interface
2. Add `buildAgentTypePromptParams()` method to BaseAgent
3. Add `extractSchemaDefaults()` helper method
4. Modify `gatherPromptTemplateData()` to inject `__agentTypePromptParams`
5. Export interface from package index

### Phase 3: Prompt Template Updates
1. Update loop agent system prompt with Nunjucks conditionals
2. Test with various param combinations
3. Verify backward compatibility (no params = full prompt)

### Phase 4: Metadata Population
1. Create migration or metadata file to populate Loop Agent Type's `PromptParamsSchema`
2. Optionally update existing agents with optimized params

### Phase 5: Testing
1. Test agent with no params (should get full prompt)
2. Test agent with params disabling sections
3. Test runtime override via ExecuteAgentParams.data
4. Verify token savings with disabled sections
5. Test merge precedence (schema < agent < runtime)

---

## Token Savings Estimate

For an agent that disables all optional sections:

| Section | Est. Tokens Saved |
|---------|-------------------|
| Response Type Definition | ~1,000 |
| ForEach Docs | ~700 |
| While Docs | ~300 |
| Response Form Docs | ~600 |
| Command Docs | ~1,000 |
| Message Expansion Docs | ~200 |
| Variable Refs Docs | ~80 |
| **Total Potential Savings** | **~3,880 tokens/iteration** |

For a typical 10-iteration agent run, this could save ~38,800 tokens.

---

## Future Enhancements

1. **UI Form Section** - Add custom form section for AIAgent form showing available params based on agent type's schema
2. **Validation** - Runtime validation of AgentTypePromptParams against schema
3. **Other Agent Types** - Apply same pattern to Flow agent type or future types
4. **Analytics** - Track token usage with/without optimizations
 