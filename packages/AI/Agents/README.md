# @memberjunction/ai-agents

This npm package provides a complete framework for building AI agents using the MemberJunction platform. Agents can execute prompts, invoke actions, and orchestrate complex workflows with comprehensive execution tracking.

## Overview

The `@memberjunction/ai-agents` package enables developers to create sophisticated AI agents that can:
- Execute AI prompts in a hierarchical structure (system + agent prompts)
- Perform actions based on prompt results using the MJ Actions framework
- Make decisions about next steps through configurable agent types
- Orchestrate sub-agents for complex, multi-step tasks
- Track all execution steps in database for analysis and debugging
- Manage conversation context with automatic compression

## Key Components

### BaseAgent
The core execution engine that all agents use. Provides functionality for:
- Hierarchical prompt execution (system prompt as parent, agent prompts as children)
- Managing conversation context and placeholders
- Invoking MemberJunction actions
- Running sub-agents recursively
- Comprehensive execution tracking via AIAgentRun and AIAgentRunStep entities
- Automatic context compression for long conversations
- **Effort level management** with hierarchical precedence and inheritance

### BaseAgentType
Abstract class that defines reusable agent behavior patterns:
- Determines next steps based on prompt results
- Encapsulates decision-making logic
- Enables different execution patterns (loops, decision trees, etc.)

### LoopAgentType
Concrete implementation of BaseAgentType that:
- Executes in a loop until task completion
- Parses structured JSON responses from prompts
- Supports actions, sub-agents, and conditional termination
- ForEach and While iteration operations (v2.112+)
  - LLM can request batch processing over collections
  - Conditional loops with While operations
  - 90% token reduction for iterative tasks

### FlowAgentType
Deterministic workflow agent type that:
- Executes predefined workflows using directed graphs
- Evaluates boolean conditions to determine paths
- Supports parallel starting steps (Sequence=0)
- Provides action output mapping to payload
- Enables hybrid AI/deterministic workflows
- ForEach and While loop step types (v2.112+)
  - Iterate over collections with ForEach steps
  - Conditional loops with While steps
  - Self-contained loop configuration
  - Support for Action, Sub-Agent, and Prompt loop bodies
- **Execution customization** (v2.127+) - Start at specific steps or skip steps

### AgentRunner
Orchestrator that provides multiple execution modes:
- Loads agent metadata from database
- Instantiates correct agent class using ClassFactory
- Executes agents with provided context
- **RunAgent**: Core execution method for direct agent invocation
- **RunAgentInConversation**: Integrated execution with conversation and artifact management

### PayloadManager
Advanced payload access control for hierarchical agent execution:
- Controls which payload paths sub-agents can read (downstream)
- Controls which payload paths sub-agents can write (upstream)
- Supports JSON path patterns with wildcards
- Detects suspicious changes with configurable rules
- Generates human-readable diffs for audit trails
- PayloadScope support for narrowing sub-agent data access
    - Transformation for scoped payload merging

## Installation

```bash
npm install @memberjunction/ai-agents
```

## Basic Usage

```typescript
import { AgentRunner } from '@memberjunction/ai-agents';
import { UserInfo } from '@memberjunction/core';

// Using AgentRunner (recommended) which uses `ClassFactory` to pick the highest priority sub-class of BaseAgent that matches your Agent (and falls back to just using `BaseAgent` if there's no custom sub-class)
const runner = new AgentRunner();
const result = await runner.RunAgent({
    agent: agentEntity, // AIAgentEntity from database
    conversationMessages: messages,
    contextUser: user
});

// Direct instantiation when you want to pick the exact class that gets run
const agent = new YourAgentClass();
const result = await agent.Execute({
    agent: agentEntity,
    conversationMessages: messages,
    contextUser: user
});

// Using run chaining to maintain context across multiple runs
const followUpResult = await runner.RunAgent({
    agent: agentEntity,
    conversationMessages: newMessages,
    contextUser: user,
    lastRunId: result.agentRun.ID,
    autoPopulateLastRunPayload: true // Automatically use previous run's final payload
});
```

### RunAgentInConversation - Integrated Conversation & Artifact Management

The `RunAgentInConversation` method provides a complete workflow for executing agents within a conversation context, automatically handling conversation creation, artifact generation, and linking:

```typescript
import { AgentRunner } from '@memberjunction/ai-agents';
import { UserInfo } from '@memberjunction/core';

const runner = new AgentRunner();

// Execute agent with automatic conversation and artifact management
const result = await runner.RunAgentInConversation({
    agent: agentEntity,
    conversationMessages: messages,
    contextUser: user
}, {
    // Optional: Use existing conversation
    conversationId: 'existing-conversation-id',

    // Optional: Use existing conversation detail (skips creation)
    conversationDetailId: 'existing-detail-id',

    // Required if conversationDetailId not provided
    userMessage: 'Analyze the sales data for Q4',

    // Optional: Control artifact creation (default: true)
    createArtifacts: true,

    // Optional: Source artifact for versioning (continuity/refinement)
    sourceArtifactId: 'base-artifact-id',

    // Optional: Custom conversation name
    conversationName: 'Q4 Sales Analysis'
});

// Result includes everything you need
console.log('Agent result:', result.agentResult);
console.log('Conversation ID:', result.conversationId);
console.log('Detail ID:', result.conversationDetailId);
if (result.artifactInfo) {
    console.log('Artifact created:', result.artifactInfo.artifactId);
    console.log('Version:', result.artifactInfo.versionNumber);
}
```

#### What RunAgentInConversation Does

The method provides a complete workflow:

1. **Conversation Management**
   - Creates new conversation if not provided
   - Uses existing conversation if `conversationId` provided
   - Skips creation entirely if `conversationDetailId` provided

2. **Conversation Detail Creation**
   - Creates conversation detail record for user message
   - Automatically handles message ordering via `__mj_CreatedAt`
   - Skipped if `conversationDetailId` already provided

3. **Agent Execution**
   - Runs agent with conversation context
   - Links agent run to conversation detail
   - Passes through all execution parameters (callbacks, data, context, etc.)

4. **Artifact Processing** (if `createArtifacts !== false`)
   - Creates artifacts from agent payload
   - Handles intelligent versioning:
     - Uses `sourceArtifactId` if provided (explicit continuity)
     - Otherwise checks for previous artifacts on this conversation detail
     - Creates new artifact version or entirely new artifact as appropriate
   - Respects agent's `ArtifactCreationMode` configuration
   - Links artifacts to conversation details via junction table
   - Extracts artifact names from payload attributes

#### Artifact Versioning Logic

The method implements smart artifact versioning:

```typescript
// Priority 1: Explicit source artifact (agent continuity/refinement)
{
    sourceArtifactId: 'artifact-to-refine'
    // Creates version 2, 3, 4, etc. of the specified artifact
}

// Priority 2: Previous artifact on this conversation detail (fallback)
// Automatically finds last artifact linked to the conversation detail
// Creates next version of that artifact

// Priority 3: No previous artifact
// Creates entirely new artifact with version 1
```

#### Respecting Agent Configuration

The method honors agent-level settings:

- **`ArtifactCreationMode === 'Never'`**: Skips artifact creation entirely
- **`ArtifactCreationMode === 'System Only'`**: Creates artifact with `Visibility='System Only'`
- **`DefaultArtifactTypeID`**: Uses agent's preferred artifact type (defaults to JSON type)

#### Use Cases

**GraphQL Resolvers** - Simplify agent execution endpoints:
```typescript
// Before: Manually manage conversations, artifacts, notifications
// After: One method call handles everything
const result = await runner.RunAgentInConversation({...}, {
    conversationDetailId: args.conversationDetailId,
    createArtifacts: args.createArtifacts,
    sourceArtifactId: args.sourceArtifactId
});
```

**Interactive Chat Interfaces** - Maintain conversation context:
```typescript
// First message - creates conversation
const firstResult = await runner.RunAgentInConversation({...}, {
    userMessage: 'Analyze sales data',
    createArtifacts: true
});

// Follow-up message - uses existing conversation
const followUp = await runner.RunAgentInConversation({...}, {
    conversationId: firstResult.conversationId,
    userMessage: 'Show me the trends',
    createArtifacts: true
});
```

**Agent Refinement Workflows** - Iterate on artifacts:
```typescript
// Initial generation
const initial = await runner.RunAgentInConversation({...}, {
    userMessage: 'Create a report',
    createArtifacts: true
});

// Refinement - creates version 2 of same artifact
const refined = await runner.RunAgentInConversation({...}, {
    userMessage: 'Make it more concise',
    createArtifacts: true,
    sourceArtifactId: initial.artifactInfo.artifactId
});
```

#### Benefits

- **Single Responsibility**: One method handles entire workflow
- **Flexible**: Works with new or existing conversations
- **Intelligent**: Smart artifact versioning without manual tracking
- **Clean Code**: Moves business logic out of transport layers (GraphQL, REST)
- **Type Safe**: Full TypeScript typing for results
- **Auditable**: All artifacts linked to conversation details

#### Helper Methods

`RunAgentInConversation` uses these public helper methods (available for custom workflows):

```typescript
// Get maximum version number for an artifact
const maxVersion = await runner.GetMaxVersionForArtifact(artifactId, user);

// Find previous artifact for a conversation detail
const previousArtifact = await runner.FindPreviousArtifactForMessage(detailId, user);

// Process agent artifacts manually
const artifactInfo = await runner.ProcessAgentArtifacts(
    agentResult,
    conversationDetailId,
    sourceArtifactId,
    user
);
```

## Iterative Operations (v2.112+)

Both Flow and Loop agents support native ForEach and While iterations for efficient batch processing and retry logic.

**📘 Complete Guide:** [Guide to Iterative Operations in Agents](./guide-to-iterative-operations-in-agents.md)

### Quick Start

**Flow Agent - ForEach Example:**
```typescript
// Create a ForEach step that sends email to each customer
const forEachStep = await md.GetEntityObject<AIAgentStepEntity>('MJ: AI Agent Steps');
forEachStep.StepType = 'ForEach';
forEachStep.LoopBodyType = 'Action';
forEachStep.ActionID = sendEmailActionId;
forEachStep.Configuration = JSON.stringify({
    type: 'ForEach',
    collectionPath: 'payload.customers',
    itemVariable: 'customer',
    maxIterations: 500
});
forEachStep.ActionInputMapping = JSON.stringify({
    to: 'customer.email',
    subject: 'Welcome!'
});
```

**Loop Agent - ForEach Example:**
```json
{
    "taskComplete": false,
    "message": "Processing all documents",
    "nextStep": {
        "type": "ForEach",
        "forEach": {
            "collectionPath": "payload.documents",
            "action": {
                "name": "Analyze Document",
                "params": { "path": "item.path" }
            }
        }
    }
}
```

**Benefits:**
- 90% token reduction (Loop agents)
- Deterministic iteration (Flow agents)
- Type-safe loop variables
- Built-in error handling

See the [complete guide](./guide-to-iterative-operations-in-agents.md) for While loops, nested iterations, and advanced patterns.

## Agent Configuration

Agents are configured through MemberJunction entities:

1. **AIAgentType**: Defines the behavior pattern and system prompt
   - `DriverClass`: The TypeScript class implementing the behavior
   - `SystemPromptID`: Base prompt providing foundational behavior

2. **AIAgent**: Specific agent instance
   - `AgentTypeID`: Links to the agent type
   - Configuration for specific use cases

3. **AIPrompt**: Reusable prompt templates
   - Support for placeholders and dynamic content
   - Can be chained hierarchically

4. **AIAgentPrompt**: Associates prompts with agents
   - `ExecutionOrder`: Determines prompt execution sequence
   - Links agents to their specific prompts

5. **AIAgentStep**: Defines workflow steps for Flow agents
   - `StepType`: Action, Sub-Agent, or Prompt
   - `StartingStep`: Boolean flag for initial steps
   - `TimeoutSeconds`: Step execution timeout
   - `ActionOutputMapping`: JSON mapping for action results

6. **AIAgentStepPath**: Connects workflow steps
   - `Condition`: Boolean expression for path evaluation
   - `Priority`: Determines path selection order

## Creating Custom Agent Types

```typescript
import { BaseAgentType, RegisterClass, BaseAgentNextStep } from '@memberjunction/ai-agents';
import { AIPromptRunResult } from '@memberjunction/ai-prompts';

@RegisterClass(BaseAgentType, "MyCustomAgentType")
export class MyCustomAgentType extends BaseAgentType {
    async DetermineNextStep(promptResult: AIPromptRunResult): Promise<BaseAgentNextStep> {
        // Parse the prompt result
        const response = JSON.parse(promptResult.FullResult);
        
        // Determine next action based on response
        if (response.taskComplete) {
            return { type: 'stop', reason: 'Task completed successfully' };
        } else if (response.action) {
            return {
                type: 'action',
                actionName: response.action.name,
                actionParams: response.action.params
            };
        } else {
            return { type: 'continue' };
        }
    }
}
```

### Handling JSON Validation Syntax in Agent Responses

When AI prompts use validation syntax (like `?`, `*`, `:type`, etc.), the AI might inadvertently include these in its JSON response keys. Agent types that parse embedded JSON need to handle this cleaning:

```typescript
import { JSONValidator } from '@memberjunction/global';

@RegisterClass(BaseAgentType, "StructuredResponseAgent")
export class StructuredResponseAgent extends BaseAgentType {
    async DetermineNextStep(promptResult: AIPromptRunResult): Promise<BaseAgentNextStep> {
        // For responses with embedded JSON strings
        const outerResponse = promptResult.result as any;
        
        // If the response contains an embedded JSON string
        if (outerResponse.response && typeof outerResponse.response === 'string') {
            // Parse the embedded JSON
            const innerData = JSON.parse(outerResponse.response);
            
            // Clean validation syntax that AI might have included
            const validator = new JSONValidator();
            const cleanedData = validator.cleanValidationSyntax<any>(innerData);
            
            // Now work with cleaned data
            if (cleanedData.analysisComplete) {
                return { type: 'stop', reason: 'Analysis completed' };
            }
        }
        
        return { type: 'continue' };
    }
}
```

**Important Notes:**
- The AIPromptRunner automatically cleans validation syntax for top-level JSON objects when an OutputExample is defined
- However, agent types must handle cleaning for **embedded JSON strings** within the response
- This is common when the prompt response structure contains a JSON string as a field value
- The `cleanValidationSyntax` method preserves values while removing validation syntax from keys

Example scenario:
```typescript
// AI Prompt response (top-level is cleaned automatically)
{
    "status": "success",
    "response": "{\"analysisComplete?\":true,\"recommendations:[3+]\":[\"A\",\"B\",\"C\"]}"
}

// After agent type cleans the embedded JSON
{
    "analysisComplete": true,
    "recommendations": ["A", "B", "C"]
}
```

## Execution Flow

1. **Initialization**: 
   - Creates AIAgentRun entity for tracking
   - Loads agent configuration and type
   - Initializes AI and Action engines

2. **Configuration Loading**:
   - Loads AIAgentType with system prompt
   - Loads agent's prompts ordered by ExecutionOrder
   - Validates placeholders and dependencies

3. **Execution Loop**:
   - Executes prompts hierarchically (system as parent)
   - Agent type analyzes results via DetermineNextStep()
   - Executes actions or sub-agents as determined
   - Creates AIAgentRunStep for each operation
   - Continues until stop condition met

4. **Result Tracking**:
   - All steps recorded with full context
   - Execution tree available for analysis
   - Errors and outputs captured

### Early Run ID Callback

Get the AgentRun ID immediately after creation for real-time monitoring:

```typescript
const params: ExecuteAgentParams = {
    agent: myAgent,
    conversationMessages: messages,
    contextUser: currentUser,
    
    // Callback fired immediately after AgentRun record is saved
    onAgentRunCreated: async (agentRunId) => {
        console.log(`Agent run started: ${agentRunId}`);
        
        // Use cases:
        // - Link to parent records (e.g., AIAgentRunStep.TargetLogID for sub-agents)
        // - Send to monitoring systems
        // - Update UI with tracking info
        // - Start real-time log streaming
    }
};

const result = await runner.RunAgent(params);
```

The callback is invoked:
- **When**: Right after the AIAgentRun record is created and saved
- **Before**: The actual agent execution begins
- **Error Handling**: Callback errors are logged but don't fail the execution
- **Async Support**: Can be synchronous or asynchronous
- **Sub-Agent Tracking**: BaseAgent automatically uses this callback to link sub-agent runs to their parent step's TargetLogID

## Advanced Features

### Agent Data Preloading

Agents can declaratively preload reference data without requiring custom application code or action calls. Data sources are configured through the `AIAgentDataSource` entity and automatically loaded before agent execution.

#### Overview

Data preloading solves the common problem of agents needing access to reference data (like entity lists, configuration values, or initial state) that doesn't change during execution. Instead of:
- Writing custom application code to load data
- Having agents call actions to fetch data (which bloats conversation context)
- Manually passing the same data to every agent invocation

Agents can now specify data sources that are automatically loaded and injected into the appropriate destination (`data`, `context`, or `payload`).

#### Three Destination Types

**1. Data Destination** - For Nunjucks templates in prompts (visible to LLMs)
```typescript
// Configuration
{
  "Name": "ALL_ENTITIES",
  "SourceType": "RunView",
  "EntityName": "Entities",
  "OrderBy": "Name ASC",
  "DestinationType": "Data",
  "DestinationPath": null  // Uses "ALL_ENTITIES" at root level
}

// Result in agent prompt:
// params.data.ALL_ENTITIES = [{ Name: "Users", ... }, { Name: "Entities", ... }]

// Prompt can use Nunjucks:
// You have access to {{ALL_ENTITIES.length}} entities:
// {% for entity in ALL_ENTITIES %}
// - {{entity.Name}}: {{entity.Description}}
// {% endfor %}
```

**2. Context Destination** - For actions only (NOT visible to LLMs)
```typescript
// Configuration
{
  "Name": "ORG_SETTINGS",
  "SourceType": "RunView",
  "EntityName": "Organization Settings",
  "ExtraFilter": "OrgID='${context.organizationId}'",
  "DestinationType": "Context",
  "DestinationPath": "organization.settings"
}

// Result:
// params.context.organization.settings = { apiEndpoint: "...", features: [...] }

// Actions can access context, but prompts/LLMs cannot
// This keeps API keys and sensitive configuration away from LLMs
```

**3. Payload Destination** - For agent state initialization
```typescript
// Configuration
{
  "Name": "CustomerOrders",
  "SourceType": "RunQuery",
  "QueryName": "Recent Orders by Customer",
  "Parameters": JSON.stringify({ customerId: "{{context.customerId}}" }),
  "DestinationType": "Payload",
  "DestinationPath": "analysis.orders.recent"
}

// Result:
// params.payload.analysis.orders.recent = [{ OrderID: "123", ... }]

// Agent starts with rich initial state without caller manually loading it
```

#### Data Source Types

**RunView Data Sources** - Query entities with filters
```typescript
{
  "Name": "ACTIVE_MODELS",
  "SourceType": "RunView",
  "EntityName": "AI Models",
  "ExtraFilter": "IsActive=1 AND Vendor='OpenAI'",
  "OrderBy": "Priority DESC",
  "FieldsToRetrieve": JSON.stringify(["ID", "Name", "Vendor", "MaxInputTokens"]),
  "ResultType": "simple",  // or "entity_object"
  "MaxRows": 100,
  "DestinationType": "Data"
}
```

**RunQuery Data Sources** - Execute stored queries
```typescript
{
  "Name": "MONTHLY_STATS",
  "SourceType": "RunQuery",
  "QueryName": "Monthly Analytics",
  "CategoryPath": "/Reports/Analytics",
  "Parameters": JSON.stringify({
    month: "{{context.currentMonth}}",
    year: "{{context.currentYear}}"
  }),
  "DestinationType": "Payload",
  "DestinationPath": "stats.monthly"
}
```

#### Path Support

The `DestinationPath` field supports nested paths using dot notation:

```typescript
// Simple root-level
{
  "Name": "ENTITIES",
  "DestinationPath": null  // Uses "ENTITIES" at root
}
// Result: data.ENTITIES

// Nested paths
{
  "Name": "ModelList",
  "DestinationPath": "config.ai.models"
}
// Result: data.config.ai.models

// Deep nesting
{
  "Name": "CustomerData",
  "DestinationPath": "analysis.customer.profile.orders"
}
// Result: payload.analysis.customer.profile.orders
```

#### Caching Policies

Data sources support three caching strategies:

**1. None** - No caching (default)
```typescript
{
  "CachePolicy": "None"
  // Data is loaded fresh every time
}
```

**2. PerRun** - Cache for duration of a single agent run
```typescript
{
  "CachePolicy": "PerRun"
  // Multiple data sources with same AgentID+Name share cached data within one run
  // Cache is cleared when agent run completes
}
```

**3. PerAgent** - Global cache with TTL
```typescript
{
  "CachePolicy": "PerAgent",
  "CacheTimeoutSeconds": 3600  // 1 hour
  // Cached across all runs for this agent until TTL expires
  // Good for rarely-changing reference data like entity lists
}
```

#### Execution Control

**Disable data preloading** for specific executions:
```typescript
const result = await runner.RunAgent({
    agent: myAgent,
    conversationMessages: messages,
    contextUser: user,
    disableDataPreloading: true  // Skip automatic data preloading
});
```

**Caller precedence**: Caller-provided data always takes precedence over preloaded data:
```typescript
const result = await runner.RunAgent({
    agent: myAgent,
    conversationMessages: messages,
    contextUser: user,
    data: {
        CUSTOM_ENTITIES: myEntities  // Overrides preloaded CUSTOM_ENTITIES
    }
});
```

#### Configuration Examples

**Database Research Agent** - Preload entity metadata
```typescript
// Data source 1: All entities for reference
{
  "AgentID": "database-research-agent-id",
  "Name": "ALL_ENTITIES",
  "SourceType": "RunView",
  "EntityName": "Entities",
  "OrderBy": "Name ASC",
  "FieldsToRetrieve": JSON.stringify(["ID", "Name", "SchemaName", "Description", "BaseView"]),
  "DestinationType": "Data",
  "ExecutionOrder": 1,
  "Status": "Active",
  "CachePolicy": "PerAgent",
  "CacheTimeoutSeconds": 3600
}

// Data source 2: Schema information
{
  "AgentID": "database-research-agent-id",
  "Name": "SCHEMA_INFO",
  "SourceType": "RunView",
  "EntityName": "Entity Fields",
  "DestinationType": "Data",
  "DestinationPath": "schema.fields",
  "ExecutionOrder": 2,
  "Status": "Active",
  "CachePolicy": "PerAgent",
  "CacheTimeoutSeconds": 3600
}
```

**Customer Service Agent** - Preload customer context
```typescript
// Preload customer data into payload
{
  "AgentID": "customer-service-agent-id",
  "Name": "CUSTOMER_PROFILE",
  "SourceType": "RunView",
  "EntityName": "Customers",
  "ExtraFilter": "ID='{{context.customerId}}'",
  "DestinationType": "Payload",
  "DestinationPath": "customer.profile",
  "Status": "Active",
  "CachePolicy": "PerRun"
}

// Preload recent orders
{
  "AgentID": "customer-service-agent-id",
  "Name": "RECENT_ORDERS",
  "SourceType": "RunQuery",
  "QueryName": "Recent Orders by Customer",
  "Parameters": JSON.stringify({ customerId: "{{context.customerId}}", days: 30 }),
  "DestinationType": "Payload",
  "DestinationPath": "customer.orders",
  "Status": "Active",
  "CachePolicy": "PerRun"
}

// Preload organization settings (for actions)
{
  "AgentID": "customer-service-agent-id",
  "Name": "ORG_CONFIG",
  "SourceType": "RunView",
  "EntityName": "Organization Settings",
  "ExtraFilter": "OrgID='{{context.organizationId}}'",
  "DestinationType": "Context",
  "DestinationPath": "organization.config",
  "Status": "Active",
  "CachePolicy": "PerAgent",
  "CacheTimeoutSeconds": 1800
}
```

#### Benefits

- **Declarative**: Configure data preloading through metadata, not code
- **Reusable**: Same agent works across different environments
- **Efficient**: Caching reduces redundant database queries
- **Clean Separation**: Keeps data in appropriate destinations (data/context/payload)
- **Flexible**: Supports both RunView and RunQuery with full parameter control
- **Secure**: Context destination keeps sensitive data away from LLMs
- **Performance**: Multiple caching strategies for different use cases

#### Database Schema

The `AIAgentDataSource` table includes:
- **AgentID**: The agent using this data source
- **Name**: Variable name (used as fallback if DestinationPath is null)
- **SourceType**: RunView or RunQuery
- **EntityName**, **ExtraFilter**, **OrderBy**, **FieldsToRetrieve**, **ResultType**: RunView parameters
- **QueryName**, **CategoryPath**, **Parameters**: RunQuery parameters
- **MaxRows**: Limit results (applies to both source types)
- **DestinationType**: Data, Context, or Payload
- **DestinationPath**: Nested path using dot notation (optional)
- **ExecutionOrder**: Order to execute when multiple sources exist
- **Status**: Active or Disabled
- **CachePolicy**: None, PerRun, or PerAgent
- **CacheTimeoutSeconds**: TTL for PerAgent cache

**Unique Constraint**: `AgentID + Name + DestinationType + DestinationPath`
- Allows same Name across different destinations/paths
- Example: "ENTITIES" can exist in both Data and Payload destinations

### Runtime Action Changes (v2.123.0)

The framework supports dynamic customization of which actions are available to agents at runtime, without modifying database configuration. This is particularly useful for:

- **Multi-tenant scenarios** where different executions need different integrations
- **Security restrictions** where sub-agents should have limited action access
- **Testing scenarios** with controlled action availability

#### ActionChange Interface

```typescript
interface ActionChange {
  scope: ActionChangeScope;  // Which agents to apply to
  mode: ActionChangeMode;    // 'add' or 'remove'
  actionIds: string[];       // Action entity IDs to add/remove
  agentIds?: string[];       // Required when scope is 'specific'
}

type ActionChangeScope = 'global' | 'root' | 'all-subagents' | 'specific';
type ActionChangeMode = 'add' | 'remove';
```

#### Scope Options

- **`global`**: Applies to all agents in the hierarchy (root + all sub-agents)
- **`root`**: Applies only to the root agent
- **`all-subagents`**: Applies to all sub-agents but NOT the root agent
- **`specific`**: Applies only to agents listed in `agentIds`

#### Usage Examples

```typescript
// Example 1: Tenant A context - add LMS and CRM integrations to all agents
const result = await runner.RunAgent({
    agent: myAgent,
    conversationMessages: messages,
    contextUser: user,
    actionChanges: [
        {
            scope: 'global',
            mode: 'add',
            actionIds: ['lms-query-action-id', 'crm-search-action-id']
        }
    ]
});

// Example 2: Tenant B context - different integrations
const result = await runner.RunAgent({
    agent: myAgent,
    conversationMessages: messages,
    contextUser: user,
    actionChanges: [
        {
            scope: 'global',
            mode: 'add',
            actionIds: ['membership-action-id', 'events-action-id']
        }
    ]
});

// Example 3: Remove dangerous actions from sub-agents only
const result = await runner.RunAgent({
    agent: myAgent,
    conversationMessages: messages,
    contextUser: user,
    actionChanges: [
        {
            scope: 'all-subagents',
            mode: 'remove',
            actionIds: ['delete-record-action-id', 'execute-sql-action-id']
        }
    ]
});

// Example 4: Add special actions to a specific sub-agent
const result = await runner.RunAgent({
    agent: myAgent,
    conversationMessages: messages,
    contextUser: user,
    actionChanges: [
        { scope: 'global', mode: 'add', actionIds: ['common-action-id'] },
        {
            scope: 'specific',
            mode: 'add',
            actionIds: ['special-data-action-id'],
            agentIds: ['data-gatherer-sub-agent-id']
        }
    ]
});

// Example 5: Replace actions (remove then add)
const result = await runner.RunAgent({
    agent: myAgent,
    conversationMessages: messages,
    contextUser: user,
    actionChanges: [
        // First remove the default integrations
        {
            scope: 'global',
            mode: 'remove',
            actionIds: ['default-crm-action-id']
        },
        // Then add the tenant-specific ones
        {
            scope: 'global',
            mode: 'add',
            actionIds: ['tenant-specific-crm-action-id']
        }
    ]
});
```

#### Propagation Rules

When sub-agents are executed, action changes are propagated based on scope:

| Original Scope | Propagated As | Behavior |
|---------------|---------------|----------|
| `global` | `global` | Propagated as-is to all sub-agents |
| `root` | (not propagated) | Only applied to root agent |
| `all-subagents` | `global` | Becomes global for sub-agent's perspective |
| `specific` | `specific` | Propagated as-is; each agent checks if it's in agentIds |

#### How It Works

1. **During prompt preparation** (`gatherPromptTemplateData`):
   - Base actions are loaded from database configuration (`AIAgentAction` table)
   - Runtime action changes are applied based on scope
   - The modified action list is injected into the prompt template
   - LLM sees only the effective actions

2. **During action execution** (`executeActionsStep`):
   - When LLM requests an action, it's validated against the effective action list
   - Actions not in the effective list are rejected with a clear error message

3. **During sub-agent execution** (`ExecuteSubAgent`):
   - Action changes are filtered and transformed for propagation
   - Sub-agents receive only applicable changes

#### Key Benefits

- **No database changes required** - Actions are modified at runtime
- **Tenant isolation** - Same agent, different action sets per tenant
- **Security** - Restrict sub-agents from dangerous operations
- **Flexibility** - Combine add/remove operations for complex scenarios
- **Type-safe** - Full TypeScript typing with ActionChange interface

**See:** [@memberjunction/ai-core-plus README](../CorePlus/README.md) for type definitions.

### Payload Scoping for Sub-Agents

The framework now supports narrowing the payload that sub-agents work with through the `PayloadScope` field:

```typescript
// Configure an agent to work with a specific part of the payload
const subAgent = {
    Name: 'RequirementsAnalyzer',
    PayloadScope: '/functionalRequirements',  // Only sees this part of parent payload
    PayloadSelfWritePaths: ['analysis', 'recommendations']  // Paths within the scope
};

// When parent payload is:
{
    "functionalRequirements": {
        "features": ["A", "B", "C"],
        "constraints": {...}
    },
    "technicalSpecs": {...},
    "timeline": {...}
}

// Sub-agent only sees:
{
    "features": ["A", "B", "C"],
    "constraints": {...}
}

// Sub-agent changes are merged back under the scope path
```

Benefits:
- **Reduced token usage**: Sub-agents only see relevant data
- **Improved focus**: Agents work with their specific domain
- **Automatic merging**: Changes are properly placed back in parent payload
- **Error handling**: Critical failures if scope path doesn't exist

### Input Payload Validation

Agents can validate their input payload before execution begins to ensure data quality and prevent errors:

```typescript
// Configure validation in AIAgent entity
{
    StartingPayloadValidation: JSON.stringify({
        "customerId": "string:!empty",
        "orderItems": "array:[1+]",
        "shippingAddress": {
            "street": "string:!empty",
            "city": "string:!empty",
            "zipCode": "string:[5]"
        },
        "priority": "string?:enum:normal,high,urgent"  // Optional with enum values
    }),
    StartingPayloadValidationMode: "Fail"  // or "Warn" (default: "Fail")
}
```

Input validation features:
- **Early failure detection**: Validates before any processing begins
- **Two modes**:
  - `Fail`: Reject invalid input immediately (default)
  - `Warn`: Log warning but proceed with execution
- **Deterministic guardrails**: Ensures agents receive valid data
- **Cost savings**: Prevents expensive operations with invalid input
- **Parent responsibility**: Parent agents provide properly scoped payloads to children

### Final Payload Validation

Agents can validate their final output before marking execution as successful:

```typescript
// Configure validation in AIAgent entity
{
    FinalPayloadValidation: JSON.stringify({
        "analysis": {
            "summary": "string:!empty",
            "score": "number:[0-100]",
            "recommendations": "array:[3+]"
        },
        "metadata": {
            "processedAt": "string",
            "version": "string?"  // Optional field
        }
    }),
    FinalPayloadValidationMode: "Retry",  // or "Fail" or "Warn"
    FinalPayloadValidationMaxRetries: 3
}
```

Validation features:
- **JSON schema validation**: Using JSONValidator from @memberjunction/global
- **Multiple modes**: 
  - `Retry`: Re-execute with validation feedback (up to max retries)
  - `Fail`: Immediately fail the run
  - `Warn`: Log warning but allow success
- **Retry tracking**: Prevents infinite validation loops
- **Step-level logging**: Validation results stored in AIAgentRunStep

### Execution Guardrails

New fields provide comprehensive limits to prevent runaway agent execution:

```typescript
// Configure guardrails in AIAgent entity
{
    MaxCostPerRun: 10.00,        // $10 maximum
    MaxTokensPerRun: 100000,     // 100k tokens total
    MaxIterationsPerRun: 50,     // 50 prompt iterations
    MaxTimePerRun: 300           // 5 minutes
}

// The framework monitors these in real-time and terminates if exceeded
// Termination reason is logged in AIAgentRun.ErrorMessage
```

Guardrail features:
- **Cost tracking**: Monitors cumulative API costs
- **Token counting**: Tracks input + output tokens
- **Iteration limits**: Counts each prompt execution
- **Time limits**: Enforces maximum execution duration
- **Graceful termination**: Saves state before stopping

### Run Chaining

The framework supports linking multiple agent runs together to maintain context across interactions:

```typescript
// Execute an agent with run chaining
const result = await agent.Execute({
    agent: agentEntity,
    conversationMessages: messages,
    contextUser: user,
    lastRunId: previousRunId,        // Links to previous run
    autoPopulateLastRunPayload: true  // Auto-loads previous payload
});

// The framework will:
// 1. Load the FinalPayload from the previous run
// 2. Set it as StartingPayload for the new run
// 3. Use it as the initial payload if none provided
// 4. Validate against circular references in the chain
```

Key features:
- **LastRunID**: Links runs in a chain (different from ParentRunID for sub-agents)
- **StartingPayload**: Captures the initial state of each run
- **Auto-population**: Reduces bandwidth by avoiding payload round-trips
- **Circular reference detection**: Prevents infinite loops in run chains

### Payload Management and Change Detection

The framework includes sophisticated payload management with automatic change detection:

```typescript
// Payload changes are automatically analyzed
const changeResult = payloadManager.applyAgentChangeRequest(
    originalPayload,
    changeRequest,
    {
        analyzeChanges: true,    // Detect suspicious changes
        generateDiff: true,      // Create audit trail
        agentName: 'MyAgent'
    }
);

// Suspicious changes are flagged:
// - Content truncation (>70% reduction)
// - Non-empty key removal
// - Type changes (object→primitive)
// - Pattern anomalies (placeholder replacement)
```

**Sub-agent Payload Access Control**:
```typescript
// In AIAgent entity configuration:
{
    PayloadDownstreamPaths: ["customer.id", "order.*"],  // What sub-agent can read
    PayloadUpstreamPaths: ["analysis.*", "recommendations"]  // What sub-agent can write
}
```

**Operation-Level Payload Control**:
The framework supports fine-grained control over which operations (add, update, delete) are allowed on specific payload paths:

```typescript
// Basic syntax - all operations allowed (backward compatible)
PayloadUpstreamPaths: ["analysis.*", "recommendations"]

// Operation-specific syntax using colon notation
PayloadUpstreamPaths: [
    "analysis.*:add,update",      // Can add or update, but not delete
    "recommendations:add",        // Can only add new recommendations
    "summary:update",            // Can only update existing summary
    "temp.*:delete",             // Can only delete temporary data
    "metadata.tags:add,delete"   // Can add/remove tags but not modify existing
]

// For agent's own payload access (PayloadSelfWritePaths)
PayloadSelfWritePaths: [
    "workspace.*",               // Full access to workspace
    "results:add",               // Can only add results, not modify
    "status:update"              // Can only update status field
]
```

Operation types:
- `add` - Create new properties or array elements
- `update` - Modify existing values
- `delete` - Remove properties or array elements

When operations are restricted, the framework will:
- Log warnings when unauthorized operations are attempted
- Block the disallowed changes while preserving allowed ones
- Include operation details in the audit trail

### Hierarchical Prompt Execution
```typescript
// System prompt provides base behavior
// Agent prompts execute as children with shared context
const result = await agent.ExecutePrompt({
    systemPrompt: agentType.SystemPrompt,
    agentPrompt: currentPrompt,
    messages: conversationContext
});
```

### Context Management
Agents automatically manage conversation context:
- Maintains message history across steps
- **Intelligent message expiration** - Automatically compacts or removes old action results
- Compresses context when approaching token limits
- Handles placeholder replacement in prompts
- Preserves important context during compression

### Message Expiration and Compaction

The framework provides sophisticated message lifecycle management to prevent context bloat from large action results:

**Per-Action Configuration** (in `AIAgentAction` table):
- `ResultExpirationTurns`: Number of turns before message expires (e.g., 2)
- `ResultExpirationMode`: 'None' | 'Remove' | 'Compact'
- `CompactMode`: 'First N Chars' | 'AI Summary'
- `CompactLength`: Character limit for 'First N Chars' mode
- `CompactPromptID`: Custom AI prompt for 'AI Summary' mode

**How It Works**:
```typescript
// Configure a Google Search action to compact results after 2 turns
await agentAction.Save({
    ResultExpirationTurns: 2,
    ResultExpirationMode: 'Compact',
    CompactMode: 'First N Chars',
    CompactLength: 500
});

// Turn 1: Action returns 10,000 char search results
// Turn 2: Results still in conversation (turn 1, limit 2)
// Turn 3: Results still in conversation (turn 2, limit 2)
// Turn 4: Results compacted to 500 chars (turn 3 > limit 2)
//         Original content preserved in metadata for expansion
```

**Compaction Modes**:
1. **First N Chars**: Fast truncation with annotation
   ```
   First 500 chars of result...

   [Compacted: showing first 500 of 10000 characters. Agent can request expansion if needed.]
   ```

2. **AI Summary**: Intelligent LLM-based summarization
   ```
   [AI Summary of 10000 chars. Agent can request full expansion if needed.]

   Search found 47 results for "MemberJunction". Top results include...
   ```

**Message Expansion**:
Agents can restore compacted messages when needed:
```typescript
// In agent's JSON response
{
    "taskComplete": false,
    "nextStep": {
        "type": "Retry",
        "messageIndex": 5,  // Index of compacted message
        "reason": "Need full search results to answer user's question about item #47"
    }
}
```

**Runtime Override**:
Test different expiration strategies without modifying database:
```typescript
const result = await runner.RunAgent({
    agent: myAgent,
    conversationMessages: messages,
    contextUser: user,
    messageExpirationOverride: {
        expirationTurns: 1,
        expirationMode: 'Compact',
        compactMode: 'First N Chars',
        compactLength: 200,
        preserveOriginalContent: true
    }
});
```

**Lifecycle Monitoring**:
Track message compaction for debugging and token savings analysis:
```typescript
const result = await runner.RunAgent({
    agent: myAgent,
    conversationMessages: messages,
    contextUser: user,
    onMessageLifecycle: (event) => {
        console.log(`[Turn ${event.turn}] ${event.type}: ${event.reason}`);
        if (event.tokensSaved) {
            console.log(`  Tokens saved: ${event.tokensSaved}`);
        }
    }
});
// Output:
// [Turn 3] message-compacted: Compacted using First N Chars (saved 2375 tokens)
// [Turn 5] message-removed: Removed due to expiration
```

**Prompt Lookup Hierarchy**:
For AI Summary mode, prompts are resolved in this order:
1. Runtime override (`messageExpirationOverride.compactPromptId`)
2. Agent action configuration (`AIAgentAction.CompactPromptID`)
3. Action default (`Action.DefaultCompactPromptID`)
4. System default ("Compact Agent Message" prompt)

**Benefits**:
- **Addresses Large Action Results**: Automatically handles the most common cause of context bloat
- **Configurable Per-Action**: Different expiration strategies for different action types
- **Non-Destructive**: Original content preserved in metadata for on-demand expansion
- **Token Savings**: Reduces context window usage by 70-95% for large results
- **Agent-Aware**: Agents can detect compacted messages and request full expansion when needed

### Context Length Recovery

When a prompt execution fails due to context length overflow (even after model failover), BaseAgent provides **one-time automatic recovery** instead of immediately terminating. This gives the agent an opportunity to adapt its approach.

**How It Works**:
1. **Prompt fails with ContextLengthExceeded** → Detected as fatal error
2. **First occurrence**: Recovery is attempted automatically (once per run)
3. **Last user message is trimmed** using smart strategies:
   - JSON arrays: Keeps first 10 items with truncation notice
   - CSV data: Keeps header + first 10 rows
   - Plain text: Keeps first 1000 characters
4. **Agent receives clear guidance** explaining what happened and recommended actions
5. **Agent gets Retry step** to choose alternative approach (e.g., more specific filters, batch requests)
6. **If recovery fails again**: Normal fatal error handling (agent terminates)

**Example Recovery Message**:
```
⚠️ CONTEXT OVERFLOW RECOVERY ⚠️

The previous step returned a result that exceeded the context window (147,532 characters truncated).

Here is a PARTIAL result from the previous action:
---
[First 10 items from JSON array...]
... (487 more items truncated due to context length)
---

❗ THE ABOVE IS INCOMPLETE - the full result was too large for the context window.

RECOMMENDED ACTIONS:
1. Use a different action with more specific filters to get smaller result sets
2. Request data in batches or pages instead of all at once
3. Ask the user to clarify scope to narrow the query
4. If you need the full data, acknowledge the limitation and ask the user how to proceed

Please choose an alternative approach to complete your task.
```

**Benefits**:
- **Resilient**: Agents can adapt instead of failing immediately
- **Informative**: Clear explanation of what went wrong and how to recover
- **Safe**: ONE-TIME recovery prevents infinite loops
- **Smart**: Preserves data structure when possible (JSON, CSV)

This feature is particularly useful when agents call actions that can return very large datasets (e.g., "Get Entity List" without filters).

### Action Integration
```typescript
// In agent type's DetermineNextStep
return {
    type: 'action',
    actionName: 'SendEmail',
    actionParams: { 
        to: 'user@example.com', 
        subject: 'Analysis Complete',
        body: analysisResult 
    }
};
```

### Sub-agent Orchestration
```typescript
// Agents can invoke other agents recursively
return {
    type: 'sub_agent',
    agentName: 'DataValidationAgent',
    messages: [
        { role: 'user', content: `Validate this data: ${JSON.stringify(data)}` }
    ]
};
```

### Conversation Message Mapping for Actions and Sub-Agents

The framework includes a **ConversationMessageResolver** utility that enables flexible conversation message referencing in action input mappings and sub-agent configurations. This is particularly useful for passing conversation context to knowledge base assistants, chatbots, or analysis agents.

#### Basic Usage with Actions

**In Flow Agent Step Configuration** (`ActionInputMapping`):
```typescript
// Pass full conversation history to an action
{
    "ActionInputMapping": {
        "ConversationMessages": "conversation.all"
    }
}
```

**In Loop Agent Response**:
```typescript
{
    "taskComplete": false,
    "nextStep": {
        "type": "Actions",
        "actions": [{
            "name": "Betty",  // Knowledge base assistant
            "params": {
                "ConversationMessages": "conversation.all"
            }
        }]
    }
}
```

#### Supported Conversation Patterns

The `ConversationMessageResolver` supports powerful pattern-based message selection:

**1. All Messages**:
```typescript
"ConversationMessages": "conversation.all"
// Returns entire conversation history
```

**2. Role-Based Selection**:
```typescript
// Last N user messages
"ConversationMessages": "conversation.user.last[5]"

// Last N assistant messages
"ConversationMessages": "conversation.assistant.last[3]"

// Last N system messages
"ConversationMessages": "conversation.system.last[1]"
```

**3. All Messages of a Role**:
```typescript
// All user messages
"ConversationMessages": "conversation.user.all"

// All assistant messages
"ConversationMessages": "conversation.assistant.all"
```

**4. Single Last Message by Role**:
```typescript
// Just the last user message
"ConversationMessages": "conversation.user.last"

// Just the last assistant message
"ConversationMessages": "conversation.assistant.last"
```

#### Use Cases

**Knowledge Base Assistants** - Pass full conversation history for context-aware responses:
```typescript
// In Knowledge Base Research Agent step
{
    "StepType": "Action",
    "ActionID": "betty-action-id",
    "ActionInputMapping": {
        "ConversationMessages": "conversation.all"  // Betty sees full context
    }
}
```

**Sentiment Analysis** - Analyze just user messages:
```typescript
{
    "ActionInputMapping": {
        "messagesToAnalyze": "conversation.user.last[10]",
        "includeSentiment": true
    }
}
```

**Context Summarization** - Summarize recent conversation:
```typescript
{
    "ActionInputMapping": {
        "recentMessages": "conversation.all",  // or "conversation.last[20]" if supported
        "summarizeAs": "bullet_points"
    }
}
```

**Follow-up Question Generation** - Based on assistant responses:
```typescript
{
    "ActionInputMapping": {
        "previousResponses": "conversation.assistant.last[3]",
        "generateFollowUps": true
    }
}
```

#### Sub-Agent Usage

Sub-agents automatically receive the parent's conversation context, but you can control which messages are passed:

**In Loop Agent** (via agent prompt instructions):
```typescript
// The agent's system prompt can instruct:
"When invoking sub-agents, you can specify which conversation messages to pass using the ConversationMessages parameter in your action input mappings."
```

**In Flow Agent** (via SubAgentConfiguration):
```typescript
// Configure sub-agent relationships with conversation context
{
    "AgentID": "parent-agent-id",
    "SubAgentID": "knowledge-base-research-agent-id",
    "SubAgentOutputMapping": { "*": "knowledgeBaseResearch" },
    "SubAgentContextPaths": ["*"]  // Full context by default
}
```

#### How It Works

The resolver operates during the parameter mapping phase:

1. **Detection**: Identifies `conversation.` prefixed strings in action/sub-agent parameters
2. **Pattern Matching**: Parses the pattern (role, selector, count)
3. **Message Filtering**: Extracts matching messages from conversation history
4. **Type Validation**: Ensures the target parameter expects an array of messages
5. **Injection**: Replaces the pattern with actual message objects

**Example Resolution**:
```typescript
// Input mapping configuration
{
    "ConversationMessages": "conversation.user.last[3]"
}

// Conversation history
[
    { role: 'system', content: 'You are a helpful assistant' },
    { role: 'user', content: 'What is MemberJunction?' },
    { role: 'assistant', content: 'MemberJunction is...' },
    { role: 'user', content: 'How do agents work?' },
    { role: 'assistant', content: 'Agents work by...' },
    { role: 'user', content: 'Can you give an example?' }
]

// Resolved parameter value (last 3 user messages)
[
    { role: 'user', content: 'What is MemberJunction?' },
    { role: 'user', content: 'How do agents work?' },
    { role: 'user', content: 'Can you give an example?' }
]
```

#### Benefits

- **Context-Aware Actions**: Actions receive relevant conversation history
- **Flexible Filtering**: Select exactly which messages are needed
- **Declarative Configuration**: No custom code needed in action implementations
- **Type Safety**: Resolver validates parameter types at runtime
- **Performance**: Only selected messages are passed, reducing token usage
- **Composability**: Works seamlessly with Flow and Loop agents

#### Integration with Betty Knowledge Base Action

A prime example of this feature is the Betty action for knowledge base queries:

```typescript
// Betty action accepts ConversationMessages parameter
{
    "name": "Betty",
    "params": {
        "ConversationMessages": "conversation.all"  // Full conversation context
    }
}

// Betty uses the conversation history to provide context-aware responses
// and can reference earlier questions/answers in its knowledge base queries
```

This enables knowledge base agents to maintain conversation context across multiple queries, improving response relevance and follow-up question handling.

## Agent Permissions System

The agent framework includes a comprehensive ACL-based permissions system that controls who can view, run, edit, and delete agents.

### Permission Model

The permissions system uses **hierarchical permissions** with the following levels:

1. **View** - See agent configuration and details
2. **Run** - Execute the agent (implies View)
3. **Edit** - Modify agent configuration (implies Run and View)
4. **Delete** - Remove the agent (implies Edit, Run, and View)

### Default Permission Behavior

The system uses an **"open by default"** approach to minimize administrative overhead:

- **No permission records exist**: Anyone can **View** and **Run** the agent
- **Owner**: Always has full permissions (View, Run, Edit, Delete)
- **Explicit permissions**: When permission records exist, only users/roles with matching permissions can access

**Why this approach?**
- Minimizes setup overhead for most agents
- Allows broad access for running agents (common use case)
- Protects modification operations (Edit/Delete) through ownership
- Explicit permissions provide fine-grained control when needed

### Ownership

Every agent has an `OwnerUserID` field:
- Owners always have full permissions regardless of ACL records
- Defaults to the user who created the agent
- Can be transferred by editing the agent

### Permission Records

Permission records are stored in the `AIAgentPermission` table with these fields:

- **AgentID** - The agent being controlled
- **UserID** - Direct user permission (mutually exclusive with RoleID)
- **RoleID** - Role-based permission (mutually exclusive with UserID)
- **CanView** - Boolean flag for view permission
- **CanRun** - Boolean flag for run permission
- **CanEdit** - Boolean flag for edit permission
- **CanDelete** - Boolean flag for delete permission
- **Comments** - Optional description of why permission was granted

**Important**: Each record must have either `UserID` OR `RoleID` set, but not both.

### Permission Resolution

When checking if a user can perform an operation:

1. **Check ownership** - If user is the owner, grant all permissions
2. **Check if no permissions exist** - Grant View and Run by default
3. **Find matching permissions** - Get all records for the user OR their roles
4. **Apply OR logic** - If ANY permission grants access, allow the operation
5. **Apply hierarchy** - Higher permissions automatically grant lower ones:
   - Delete → Edit → Run → View
   - If you have Run permission, you automatically get View
   - If you have Edit permission, you automatically get Run and View

### Using Permissions in Code

The framework provides helper methods for checking permissions:

```typescript
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { AIAgentPermissionHelper } from '@memberjunction/ai-engine-base';

// Check specific permission
const canRun = await AIEngineBase.Instance.CanUserRunAgent(agentId, user);
const canEdit = await AIEngineBase.Instance.CanUserEditAgent(agentId, user);

// Get all effective permissions
const permissions = await AIEngineBase.Instance.GetUserAgentPermissions(agentId, user);
console.log(permissions);
// {
//   canView: true,
//   canRun: true,
//   canEdit: false,
//   canDelete: false,
//   isOwner: false
// }

// Get all agents user can access with specific permission
const runnableAgents = await AIEngineBase.Instance.GetAccessibleAgents(user, 'run');

// Using the helper directly
const hasPermission = await AIAgentPermissionHelper.HasPermission(agentId, user, 'run');
```

### Runtime Permission Enforcement

The BaseAgent class automatically enforces run permissions:

```typescript
// BaseAgent.Execute() checks permissions before running
const result = await agent.Execute({
    agent: agentEntity,
    conversationMessages: messages,
    contextUser: user
});

// If user lacks run permission, execution fails with:
// Error: "User {email} does not have permission to run agent '{name}'"
```

### Managing Permissions in the UI

The AI Agent form includes a "Permissions" button that opens a dialog for managing permissions:

- View all existing permissions for the agent
- Add new user or role-based permissions
- Edit existing permissions with hierarchical checkboxes
- Delete permissions to return to default behavior
- See effective permissions after hierarchy is applied
- Display owner information with visual indicator

### Permission Caching

Permissions are cached in the AIEngineBase metadata system for performance:

```typescript
// Clear cache after modifying permissions
AIEngineBase.Instance.ClearAgentPermissionsCache();

// Refresh cache for specific agent
await AIEngineBase.Instance.RefreshAgentPermissionsCache(agentId, user);
```

### Best Practices for Permissions

1. **Start Open**: Let anyone run new agents by default, add restrictions only when needed
2. **Use Roles**: Grant permissions to roles instead of individual users when possible
3. **Document Permissions**: Use the Comments field to explain why permissions were granted
4. **Ownership Transfer**: Transfer ownership when primary maintainers change
5. **Hierarchical Thinking**: Set the highest permission needed; lower ones are automatic
6. **Test Access**: Verify permissions work as expected before deploying agents
7. **Regular Audits**: Review permission records periodically to remove unnecessary entries

### Example Permission Scenarios

**Scenario 1: Public Agent**
- No permission records
- Anyone can view and run
- Only owner can edit/delete

**Scenario 2: Department Agent**
- Permission record: Role="Sales Team", CanRun=true
- Sales team members can view and run
- Owner can edit/delete
- Others cannot access

**Scenario 3: Restricted Agent**
- Permission record: Role="Admins", CanEdit=true
- Admins can view, run, edit (and delete via hierarchy)
- Permission record: Role="Developers", CanRun=true
- Developers can view and run
- Owner has full access
- Others cannot access

**Scenario 4: Shared Ownership**
- Permission record: User="alice@example.com", CanEdit=true
- Alice can view, run, and edit
- Permission record: User="bob@example.com", CanEdit=true
- Bob can view, run, and edit
- Owner can delete
- Creates "co-owner" scenario for collaborative development

## Database Schema

Key entities used by the agent framework:

- **AIAgentType**: Agent behavior patterns and system prompts
- **AIAgent**: Configured agent instances
  - `OwnerUserID`: User who owns the agent (defaults to creator, grants full permissions)
  - `PayloadDownstreamPaths`: JSON array of paths sub-agents can read
  - `PayloadUpstreamPaths`: JSON array of paths sub-agents can write
  - **NEW** `PayloadScope`: Path to narrow payload for sub-agents (e.g., "/functionalRequirements")
  - **NEW** `StartingPayloadValidation`: JSON validation schema for input validation
  - **NEW** `StartingPayloadValidationMode`: How to handle input validation failures (Fail/Warn)
  - **NEW** `FinalPayloadValidation`: JSON validation schema for success validation
  - **NEW** `FinalPayloadValidationMode`: How to handle validation failures (Retry/Fail/Warn)
  - **NEW** `FinalPayloadValidationMaxRetries`: Maximum retry attempts for validation (default: 3)
  - **NEW** `MaxCostPerRun`: Cost limit per agent run
  - **NEW** `MaxTokensPerRun`: Token limit per agent run
  - **NEW** `MaxIterationsPerRun`: Iteration limit per agent run
  - **NEW** `MaxTimePerRun`: Time limit in seconds per agent run
- **AIAgentPermission**: Permission records for agent access control
  - `AgentID`: The agent being controlled
  - `UserID`: Direct user permission (exclusive with RoleID)
  - `RoleID`: Role-based permission (exclusive with UserID)
  - `CanView`: View agent configuration
  - `CanRun`: Execute the agent
  - `CanEdit`: Modify agent configuration
  - `CanDelete`: Remove the agent
  - `Comments`: Optional permission description
- **AIPrompt**: Reusable prompt templates with placeholders
- **AIAgentPrompt**: Links agents to prompts with execution order
- **AIAgentRun**: Tracks complete agent executions
  - `LastRunID`: Links to previous run in a chain (for run chaining)
  - `StartingPayload`: Initial payload for the run
  - **NEW** `TotalPromptIterations`: Count of prompt executions in the run
- **AIAgentRunStep**: Records individual steps within runs
  - `PayloadAtStart`: JSON snapshot of payload before step
  - `PayloadAtEnd`: JSON snapshot of payload after step
  - `OutputData`: Includes `payloadChangeResult` with analysis
  - **NEW** `FinalPayloadValidationResult`: Validation outcome (Pass/Retry/Fail/Warn)
  - **NEW** `FinalPayloadValidationMessages`: Validation error messages
- **AIAgentRunStepAction**: Details of actions executed
- **AIAgentRunStepPrompt**: Prompt execution details

## Best Practices

1. **Hierarchical Design**: Use system prompts for base behavior, agent prompts for specifics
2. **Structured Responses**: Design prompts to return parseable JSON for agent types
3. **Modular Prompts**: Break complex tasks into ordered, focused prompts
4. **Proper Type Registration**: Register custom agent types with ClassFactory
5. **Comprehensive Tracking**: Leverage built-in tracking for debugging and analysis
6. **Context Efficiency**: Let the framework handle context compression automatically
7. **Error Handling**: Implement robust error handling in custom agent types
8. **Payload Security**: Use path-based access control for sub-agents
9. **Change Monitoring**: Review payload change warnings in OutputData
10. **Payload Scoping**: Use PayloadScope to reduce token usage for sub-agents
11. **Input Validation**: Define StartingPayloadValidation to catch errors early
12. **Output Validation**: Define FinalPayloadValidation for output quality control
13. **Set Guardrails**: Configure cost/token/time limits to prevent runaway execution
14. **Monitor Retries**: Track validation retry counts to avoid infinite loops
15. **Fail Fast**: Use StartingPayloadValidation with 'Fail' mode for deterministic behavior
16. **Permission Strategy**: Start with open access, add restrictions only when needed
17. **Role-Based Permissions**: Use role-based permissions for easier management at scale
18. **Document Access**: Use Comments field in permission records to explain grant rationale

## Examples

### Basic Loop Agent
```typescript
// Agent type configured with LoopAgentType driver
// System prompt defines JSON response format
// Agent prompts execute tasks iteratively
const result = await runner.RunAgent({
    agent: loopAgent,
    conversationMessages: [
        { role: 'user', content: 'Analyze these sales figures and create a report' }
    ],
    contextUser: user
});
```

### Payload Operation Control Example
```typescript
// Configure an agent with specific operation permissions
const analysisAgent = {
    Name: 'DataAnalysisAgent',
    PayloadSelfWritePaths: JSON.stringify([
        "workspace.*",              // Full control over workspace
        "analysis.results:add",     // Can only add new results
        "analysis.status:update",   // Can only update status
        "temp.*:add,delete"        // Can add/delete temp data, but not modify
    ])
};

// Configure a sub-agent with restricted write access
const validationAgent = {
    Name: 'ValidationAgent',
    PayloadDownstreamPaths: JSON.stringify([
        "data.*",                   // Can read all data
        "analysis.results"          // Can read analysis results
    ]),
    PayloadUpstreamPaths: JSON.stringify([
        "data.validated:update",    // Can only update validation flag
        "errors:add",              // Can only add errors, not modify
        "warnings:add,delete"      // Can add/remove warnings
    ])
};

// When the sub-agent tries unauthorized operations:
// - Attempt to delete data.records → Blocked (no delete permission)
// - Attempt to update errors → Blocked (only add permission)
// - Add new warning → Allowed
// - Update data.validated → Allowed
```

### Custom Decision Tree Agent
```typescript
@RegisterClass(BaseAgentType, "DecisionTreeAgent")
export class DecisionTreeAgent extends BaseAgentType {
    async DetermineNextStep(result: AIPromptRunResult): Promise<BaseAgentNextStep> {
        const decision = JSON.parse(result.FullResult);
        
        switch(decision.branch) {
            case 'needs_data':
                return { type: 'action', actionName: 'FetchData', actionParams: decision.params };
            case 'analyze':
                return { type: 'sub_agent', agentName: 'AnalysisAgent', messages: decision.context };
            case 'complete':
                return { type: 'stop', reason: decision.summary };
            default:
                return { type: 'continue' };
        }
    }
}
```

## Flow Agent Type - Deterministic Workflows

Flow agents execute **deterministic, graph-based workflows** where the execution path is determined by boolean conditions evaluated against the payload and step results. Unlike Loop agents that rely on LLM decision-making at each step, Flow agents follow predefined paths through a directed graph.

### When to Use Flow Agents

Flow agents are ideal for:
- **Predictable workflows** with well-defined decision points
- **Approval processes** with conditional routing
- **Data pipelines** with validation and transformation steps
- **Hybrid workflows** combining deterministic logic with AI prompts
- **Multi-step processes** where you need guaranteed execution order

### Flow Agent Execution Parameters

Flow agents support specialized execution parameters via `FlowAgentExecuteParams` (v2.127+) that allow runtime customization of how the flow executes:

```typescript
import { FlowAgentExecuteParams } from '@memberjunction/ai-agents';
import { ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/ai-engine-base';

// Get the steps you want to work with
const agentSteps = AIEngine.Instance.GetAgentSteps(myFlowAgent.ID);
const approvalStep = agentSteps.find(s => s.Name === 'Approval Review');
const notificationStep = agentSteps.find(s => s.Name === 'Send Notification');

// Execute with Flow Agent-specific parameters
const params: ExecuteAgentParams<unknown, unknown, FlowAgentExecuteParams> = {
    agent: myFlowAgent,
    conversationMessages: messages,
    contextUser: user,
    agentTypeParams: {
        // Start at a specific step instead of the configured entry point
        startAtStep: approvalStep,

        // Skip these steps during execution
        skipSteps: [notificationStep]
    }
};

const result = await runner.RunAgent(params);
```

#### FlowAgentExecuteParams Interface

```typescript
interface FlowAgentExecuteParams {
    /**
     * Start execution at a specific step instead of the flow's entry point.
     *
     * When provided, the flow agent will begin execution at this step,
     * skipping all steps that would normally precede it. Useful for:
     * - Resuming a flow from a specific point
     * - Testing specific branches of a flow
     * - Re-running a portion of a flow after a failure
     *
     * The step must belong to the agent being executed.
     */
    startAtStep?: AIAgentStepEntity;

    /**
     * Steps to skip during execution.
     *
     * When the flow would normally execute one of these steps, it will
     * instead immediately evaluate the step's outgoing paths and continue
     * to the next valid step. Useful for:
     * - Bypassing steps that have already been completed externally
     * - Testing flows without certain side effects
     * - Conditional step execution based on runtime state
     *
     * Skipped steps are recorded in the execution path but marked as skipped.
     * The step's output mapping is not applied when skipped.
     */
    skipSteps?: AIAgentStepEntity[];
}
```

#### Use Cases

**Resume Flow After Failure:**
```typescript
// User's approval was rejected, they fixed issues and want to resume
const reviewStep = agentSteps.find(s => s.Name === 'Manager Review');

await runner.RunAgent({
    agent: approvalFlowAgent,
    agentTypeParams: {
        startAtStep: reviewStep  // Skip validation, go straight to review
    },
    payload: fixedPayload
});
```

**Skip Steps Based on External State:**
```typescript
// Notification was already sent via another system
const notifyStep = agentSteps.find(s => s.Name === 'Send Notification');
const auditStep = agentSteps.find(s => s.Name === 'Create Audit Log');

await runner.RunAgent({
    agent: workflowAgent,
    agentTypeParams: {
        skipSteps: [notifyStep, auditStep]  // Skip these, they're handled externally
    }
});
```

**Testing Specific Flow Branches:**
```typescript
// Test only the rejection path
const rejectionStep = agentSteps.find(s => s.Name === 'Handle Rejection');

await runner.RunAgent({
    agent: approvalFlowAgent,
    agentTypeParams: {
        startAtStep: rejectionStep
    },
    payload: { decision: { approved: false, reason: 'Budget exceeded' } }
});
```

#### Behavior Notes

- **startAtStep validation**: The step must belong to the agent being executed. If invalid, execution fails with a descriptive error.
- **skipSteps behavior**: Skipped steps are marked as completed in the flow state with `{ skipped: true, stepName: '...' }` as the result.
- **Path evaluation**: When a step is skipped, its outgoing paths are still evaluated to determine the next step.
- **Recursive skipping**: If the next step after a skipped step is also in `skipSteps`, it will also be skipped until a non-skipped step is reached.
- **Output mapping**: Skipped steps do not apply their `ActionOutputMapping` since no action is executed.

### Core Concepts

#### 1. Workflow Steps (AIAgentStep)

Steps are the nodes in your workflow graph. Each step represents an action to perform:

```typescript
// Three types of steps:
{
    Name: 'ValidateInput',
    StepType: 'Action',           // Execute a MJ Action
    ActionID: 'validation-action-id',
    StartingStep: true,           // Marks this as an entry point
    Sequence: 0,                  // For parallel starting steps
    Status: 'Active',             // Active, Disabled, or Pending
    TimeoutSeconds: 30            // Optional timeout
}

{
    Name: 'AnalyzeData',
    StepType: 'Prompt',           // Execute an AI prompt
    PromptID: 'analysis-prompt-id',
    Description: 'Analyze data quality and completeness'
}

{
    Name: 'ProcessWithSubAgent',
    StepType: 'Sub-Agent',        // Invoke another agent
    SubAgentID: 'processing-agent-id'
}
```

#### 2. Workflow Paths (AIAgentStepPath)

Paths are the edges connecting your workflow nodes. They determine the flow:

```typescript
{
    OriginStepID: 'step-a-id',
    DestinationStepID: 'step-b-id',
    Condition: 'payload.amount > 1000 && payload.approved === true',
    Priority: 10                  // Higher priority paths evaluated first
}

// Path without condition (always valid)
{
    OriginStepID: 'step-a-id',
    DestinationStepID: 'default-step-id',
    Condition: null,              // No condition = always valid
    Priority: 0                   // Lower priority = fallback
}
```

#### 3. Output Mapping with Array Append Syntax

**Array Append Syntax** - When mapping outputs that can occur multiple times, use the `[]` suffix to append values to an array instead of replacing them:

```typescript
// SubAgentOutputMapping for agents that can be called multiple times
{
    "*": "codeAnalysis[]"  // Append each sub-agent result to array
}

// ActionOutputMapping for actions that run in loops
{
    "result": "findings[]",              // Append to array
    "score": "scores[]",                 // Each iteration adds to array
    "*": "rawResults.allData[]"          // Wildcard append
}

// Without [] suffix (default behavior - replace)
{
    "*": "latestResult"  // Each call REPLACES the value
}

// Array append features:
// - Auto-initializes array if it doesn't exist
// - Validates target is an array before appending
// - Prevents data loss from multiple sub-agent/action calls
// - Works with both simple and nested payload paths
```

**When to Use Array Append**:
- Sub-agents that can be invoked multiple times (e.g., Codesmith for different analysis tasks)
- Actions in ForEach/While loops where each iteration produces a result
- Accumulating multiple responses over agent execution
- Building collections of findings, recommendations, or analysis results

**Example Use Case**:
```typescript
// Research Agent with Codesmith sub-agent for code-based analytics
// Each time Codesmith is called, its output is appended to codeAnalysis[]

// First call to Codesmith
{
  "name": "Sales Trend Analysis",
  "code": "...",
  "output": { trend: "increasing", rate: 0.15 }
}

// Second call to Codesmith
{
  "name": "Customer Segmentation",
  "code": "...",
  "output": { segments: [...] }
}

// Final payload.codeAnalysis array contains BOTH results:
[
  { name: "Sales Trend Analysis", output: {...} },
  { name: "Customer Segmentation", output: {...} }
]
```

#### 4. Action Input/Output Mapping

**Action Input Mapping** (`ActionInputMapping`) - Maps payload values to action parameters:

```typescript
// In AIAgentStep.ActionInputMapping
{
    "customerId": "payload.customer.id",              // Map from payload
    "orderDate": "static:2024-01-01",                 // Static value
    "includeDetails": true,                           // Boolean literal
    "maxResults": 100,                                // Numeric literal
    "filters": {                                      // Nested object
        "status": "payload.filters.orderStatus",
        "region": "static:US-WEST"
    },
    "itemIds": "payload.order.items"                  // Can map arrays
}

// Supports nested resolution
{
    "searchParams": {
        "query": "payload.searchTerm",
        "filters": {
            "category": "payload.category",
            "tags": "payload.selectedTags"
        },
        "options": {
            "maxResults": 50,
            "includeMetadata": true
        }
    }
}
```

**Action Output Mapping** (`ActionOutputMapping`) - Maps action results back to payload or special fields:

```typescript
// In AIAgentStep.ActionOutputMapping
{
    "userId": "payload.customer.id",                  // Map specific output param
    "orderTotal": "payload.order.total",              // Nested path in payload
    "metadata": "payload.action.lastResult",          // Arbitrary nesting
    "*": "payload.rawResults.fullData",               // Wildcard = entire result
    "responseText": "$message",                       // Special field - user message
    "analysisDetails": "$reasoning",                  // Special field - reasoning
    "confidenceScore": "$confidence"                  // Special field - confidence
}

// Case-insensitive output parameter matching
// If action returns { UserId: "123" }, it matches "userId" in mapping
```

**Special Fields** (Flow Agents Only):

Use the `$` prefix to map action outputs to special response fields instead of the payload:

- **`$message`**: Maps to the user-facing message in the final Success step
- **`$reasoning`**: Optional reasoning/explanation shown with the response
- **`$confidence`**: Optional confidence score (number) for the response

**Example - Betty Knowledge Base Agent:**
```typescript
// Betty action returns: { BettyResponse: "The answer is...", BettyReferences: [...] }
{
    "BettyResponse": "$message",      // Shows directly to user
    "BettyReferences": "references"   // Stored in payload
}

// When flow completes, user sees Betty's response as the message
// No LLM processing needed - deterministic, single-step flow
```

**Special Field Benefits:**
- ✅ Eliminates need for LLM to format final response
- ✅ Enables deterministic flows with dynamic user messages
- ✅ Clearly separates UI content from payload data
- ✅ No namespace pollution - can still have `message` in payload

#### 5. Prompt Result Merging

When a Prompt step executes, its JSON response is **deep merged** into the payload:

```typescript
// Before prompt execution
payload = {
    decision: {
        status: "pending",
        reviewerId: "user-123"
    },
    metadata: { startTime: "..." }
};

// Prompt returns
promptResponse = {
    decision: {
        approved: true,
        confidence: 0.95
    }
};

// After deep merge (preserves existing keys!)
payload = {
    decision: {
        approved: true,        // NEW from prompt
        confidence: 0.95,      // NEW from prompt
        status: "pending",     // PRESERVED from before
        reviewerId: "user-123" // PRESERVED from before
    },
    metadata: { startTime: "..." }  // PRESERVED
};
```

**Why Deep Merge?**
- **Preserves context** - Existing payload data isn't lost
- **Incremental updates** - Prompts can add fields without destroying structure
- **Composable decisions** - Multiple prompts can build up complex objects

**Special Prompt Response Handling**:
```typescript
// If prompt response contains Chat step request
{
    "nextStep": { "type": "Chat" },
    "message": "I need more information from the user",
    "taskComplete": false
}
// OR
{
    "taskComplete": true,
    "message": "Here's the final result..."
}

// Flow agent returns Chat step to bubble message to user
// This allows prompts within flows to communicate with users
```

### Complete Flow Agent Example

```typescript
// Database configuration for a complete approval workflow
// 1. Define the workflow steps
const steps = [
    {
        Name: 'ValidateRequest',
        StepType: 'Action',
        ActionID: validateActionId,
        StartingStep: true,
        Sequence: 0,
        ActionInputMapping: JSON.stringify({
            "requestData": "payload.request",
            "validationRules": "payload.rules"
        }),
        ActionOutputMapping: JSON.stringify({
            "isValid": "payload.validation.isValid",
            "errors": "payload.validation.errors"
        })
    },
    {
        Name: 'CheckAmount',
        StepType: 'Prompt',
        PromptID: amountCheckPromptId,
        Description: 'AI analyzes amount and risk factors'
        // Prompt returns: { risk: "low"|"medium"|"high", reasoning: "..." }
        // Deep merged into payload.risk and payload.reasoning
    },
    {
        Name: 'AutoApprove',
        StepType: 'Action',
        ActionID: approveActionId,
        ActionInputMapping: JSON.stringify({
            "requestId": "payload.request.id",
            "approvedBy": "static:SYSTEM_AUTO"
        }),
        ActionOutputMapping: JSON.stringify({
            "approvalId": "payload.approval.id",
            "timestamp": "payload.approval.timestamp"
        })
    },
    {
        Name: 'ManagerReview',
        StepType: 'Sub-Agent',
        SubAgentID: managerReviewAgentId
        // Sub-agent payload inherits and can modify parent payload
    },
    {
        Name: 'NotifyUser',
        StepType: 'Action',
        ActionID: notificationActionId,
        ActionInputMapping: JSON.stringify({
            "userId": "payload.request.userId",
            "message": "payload.approval.notificationMessage",
            "channel": "static:email"
        })
    }
];

// 2. Define the workflow paths
const paths = [
    // From validation
    {
        OriginStepID: validateStepId,
        DestinationStepID: checkAmountStepId,
        Condition: 'payload.validation.isValid === true',
        Priority: 10
    },
    {
        OriginStepID: validateStepId,
        DestinationStepID: notifyUserStepId,
        Condition: 'payload.validation.isValid === false',
        Priority: 10
    },

    // From AI risk assessment
    {
        OriginStepID: checkAmountStepId,
        DestinationStepID: autoApproveStepId,
        Condition: 'payload.risk === "low" && payload.request.amount <= 1000',
        Priority: 10
    },
    {
        OriginStepID: checkAmountStepId,
        DestinationStepID: managerReviewStepId,
        Condition: 'payload.risk === "medium" || payload.risk === "high"',
        Priority: 10
    },

    // From manager review
    {
        OriginStepID: managerReviewStepId,
        DestinationStepID: autoApproveStepId,
        Condition: 'payload.managerDecision.approved === true',
        Priority: 10
    },
    {
        OriginStepID: managerReviewStepId,
        DestinationStepID: notifyUserStepId,
        Condition: 'payload.managerDecision.approved === false',
        Priority: 5
    },

    // Final notification after approval
    {
        OriginStepID: autoApproveStepId,
        DestinationStepID: notifyUserStepId,
        Condition: null,  // Always execute
        Priority: 0
    }
];

// 3. Execute the flow agent
const result = await runner.RunAgent({
    agent: flowAgentEntity,
    conversationMessages: messages,
    contextUser: user,
    payload: {
        request: {
            id: "req-123",
            userId: "user-456",
            amount: 5000,
            description: "Equipment purchase"
        },
        rules: {
            maxAutoApprove: 1000,
            requiresManagerReview: true
        }
    }
});
```

### Flow Agent Features

#### Safe Expression Evaluation
Flow agents use the SafeExpressionEvaluator to securely evaluate path conditions without arbitrary code execution:

```typescript
// Supported operations in conditions:
// - Comparisons: ==, ===, !=, !==, <, >, <=, >=
// - Logical: &&, ||, !
// - Property access: payload.user.role, stepResult.score
// - Safe methods: .includes(), .length, .some(), .every()
// - Type checking: typeof

// Example conditions:
"payload.status == 'approved' && payload.priority > 5"
"stepResult.items.some(item => item.price > 100)"
"payload.user.roles.includes('admin') || payload.override === true"
```

#### Action Output Mapping
Automatically map action results to the payload:

```typescript
// In AIAgentStep.ActionOutputMapping
{
    "userId": "payload.customer.id",           // Map specific output
    "orderTotal": "payload.order.total",       // Nested path mapping
    "*": "payload.actionResults.lastResult"    // Wildcard for entire result
}
```

#### Flow Context Tracking
The framework maintains flow execution state in `__flowContext`:

```typescript
// Automatically tracked in payload.__flowContext
{
    agentId: "flow-agent-id",
    currentStepId: "current-step-id",
    completedStepIds: ["step1", "step2"],
    stepResults: {
        "step1": { success: true, data: {...} },
        "step2": { approved: false }
    },
    executionPath: ["step1", "step2", "step3"]
}
```

#### Prompt Steps for AI Decisions
Flow agents can incorporate AI decision points:

```typescript
// Prompt step expects response format:
{
    "nextStepName?": "StepToExecute",
    "reasoning?": "Why this decision was made",
    "confidence?": 0.95,
    "terminate?": false,
    "message?": "Decision explanation"
}
```

## Architecture Documentation

For detailed architecture information, see [agent-architecture.md](./agent-architecture.md).

For multi-tenant memory scoping (notes/examples), see [AGENT_MEMORY_SCOPING.md](./AGENT_MEMORY_SCOPING.md).

## Contributing

Contributions are welcome! Please see the main MemberJunction [contributing guide](../../../CONTRIBUTING.md).

## API Keys

The AI Agents framework supports flexible API key management through integration with the AI Prompts system, including the new environment-based configuration features.

### Environment-Based Configuration for Agents

AI Agents benefit from MemberJunction's environment-based configuration system, allowing different API keys and settings per environment:

```typescript
// Agents automatically use the correct configuration based on NODE_ENV
// Development -> AIConfigSet(Name='development') -> Different API keys
// Production -> AIConfigSet(Name='production') -> Production API keys

// This is especially useful for:
// - Agent testing with development API keys
// - Production agents with higher rate limits
// - Environment-specific agent behaviors
```

### Using Runtime API Keys with Agents

You can provide API keys at agent execution time for multi-tenant scenarios:

```typescript
import { AgentRunner, ExecuteAgentParams } from '@memberjunction/ai-agents';
import { AIAPIKey } from '@memberjunction/ai';

const runner = new AgentRunner();

// Execute agent with specific API keys
const result = await runner.RunAgent({
    agent: agentEntity,
    conversationMessages: messages,
    contextUser: user,
    apiKeys: [
        { driverClass: 'OpenAILLM', apiKey: 'sk-user-specific-key' },
        { driverClass: 'AnthropicLLM', apiKey: 'sk-ant-department-key' }
    ]
});

// API keys are automatically propagated to:
// - All prompt executions by the agent
// - Sub-agent executions
// - Context compression operations
```

### API Key Resolution for Agents

When agents execute, API keys are resolved in this priority order:
1. **Runtime API keys** passed to RunAgent (highest priority)
2. **Configuration sets** from database based on environment
3. **Environment variables** (traditional approach)
4. **Custom implementations** via AIAPIKeys subclassing

### Multi-Environment Agent Setup

```typescript
// Example: Different agent configurations per environment

// Development environment
const devAgentConfig = {
    ConfigSet: { Name: 'development', Priority: 100 },
    Configurations: [
        { ConfigKey: 'OPENAI_LLM_APIKEY', ConfigValue: 'sk-dev-...', Encrypted: true },
        { ConfigKey: 'MAX_AGENT_ITERATIONS', ConfigValue: '10', Encrypted: false },
        { ConfigKey: 'AGENT_DEBUG_MODE', ConfigValue: 'true', Encrypted: false }
    ]
};

// Production environment
const prodAgentConfig = {
    ConfigSet: { Name: 'production', Priority: 100 },
    Configurations: [
        { ConfigKey: 'OPENAI_LLM_APIKEY', ConfigValue: 'sk-prod-...', Encrypted: true },
        { ConfigKey: 'MAX_AGENT_ITERATIONS', ConfigValue: '50', Encrypted: false },
        { ConfigKey: 'AGENT_DEBUG_MODE', ConfigValue: 'false', Encrypted: false }
    ]
};

// Agents can access these configurations through the AI engine
```

### Benefits for Agent Systems

Runtime API keys and environment-based configuration are particularly useful for agent architectures:
- **Multi-tenant isolation**: Different customers use their own API keys
- **Cost attribution**: Track API usage per department or project
- **Security**: Limit exposure of production API keys
- **Testing**: Use test API keys for development agents
- **Environment-specific behavior**: Different limits and debugging per environment
- **Centralized management**: Update configurations without code changes

### Agent-Specific Configuration Example

```typescript
// Custom agent that uses environment-based configuration
@RegisterClass(BaseAgent, "ConfigAwareAgent")
export class ConfigAwareAgent extends BaseAgent {
    protected async getConfiguration(key: string): Promise<string | null> {
        // The framework automatically loads configurations based on NODE_ENV
        const envName = process.env.NODE_ENV || 'production';
        
        // Query AIConfiguration for the current environment
        const config = await this.loadConfigValue(envName, key);
        return config;
    }
    
    protected async setupExecution(): Promise<void> {
        // Load agent-specific configurations
        const maxIterations = await this.getConfiguration('MAX_AGENT_ITERATIONS');
        const debugMode = await this.getConfiguration('AGENT_DEBUG_MODE');
        
        // Apply configurations to agent behavior
        this.maxIterations = parseInt(maxIterations || '50');
        this.debugMode = debugMode === 'true';
    }
}
```

For detailed information about API key configuration and management, see the [AI Prompts API Keys documentation](../Prompts/README.md#api-keys).

## AI Configuration for Agents

Agents fully support the AI Configuration system for environment-specific model selection. When you execute an agent with a `configurationId`, that configuration is automatically propagated to:

- All prompts executed by the agent
- All sub-agents spawned by the agent
- All sub-sub-agents in the hierarchy

### Using Configurations with Agents

```typescript
const result = await runner.RunAgent({
    agent: myAgent,
    conversationMessages: messages,
    contextUser: user,
    configurationId: 'dev-config-id', // Optional - propagates to all prompts
});
```

### Configuration Benefits for Agents

- **Environment Isolation**: Test agents with development models without affecting production
- **Consistent Model Selection**: All prompts in the agent hierarchy use the same configuration
- **Easy Switching**: Change configurations without modifying agent code
- **Fallback Support**: Agents continue to work even if specific models aren't configured

For comprehensive details about how AI Configurations work, including model selection logic and fallback behavior, see the [AI Configuration System documentation](../Prompts/README.md#ai-configuration-system).

## Effort Level Control in Agents

Agents support sophisticated effort level management that controls how much reasoning effort AI models apply to each prompt execution. The effort level uses a 1-100 integer scale where higher values request more thorough analysis.

### Effort Level Hierarchy

The effort level is resolved using hierarchical precedence:

1. **Runtime Override** (`ExecuteAgentParams.effortLevel`) - Highest priority
2. **Agent Default** (`AIAgent.DefaultPromptEffortLevel`) - Medium priority
3. **Prompt Setting** (`AIPrompt.EffortLevel`) - Lower priority
4. **Provider Default** - Natural model behavior (lowest priority)

### Agent Execution with Effort Level

```typescript
// Execute agent with high effort level for all prompts
const result = await runner.RunAgent({
    agent: myAnalysisAgent,
    conversationMessages: messages,
    contextUser: user,
    effortLevel: 85 // High effort - applies to all prompts in execution
});

// Execute with medium effort level
const result = await runner.RunAgent({
    agent: myQuickAgent,  
    conversationMessages: messages,
    contextUser: user,
    effortLevel: 30 // Low effort - for quick responses
});
```

### Sub-Agent Inheritance

Sub-agents automatically inherit the effort level from their parent unless explicitly overridden:

```typescript
// Parent agent runs with effort level 70
const parentResult = await runner.RunAgent({
    agent: parentAgent,
    effortLevel: 70, // Inherited by all sub-agents
    // ...
});

// All sub-agents spawned during execution will use effort level 70
// unless the sub-agent has its own DefaultPromptEffortLevel setting
```

### Agent Configuration

You can configure default effort levels at the agent level:

- **`AIAgent.DefaultPromptEffortLevel`**: Sets the default effort level for all prompts executed by this agent
- This takes precedence over individual prompt effort levels but can be overridden at runtime

### Provider-Specific Behavior

Different AI providers handle effort levels differently:

- **OpenAI**: Maps to reasoning_effort (low/medium/high)
- **Anthropic**: Controls thinking mode and token budgets
- **Groq**: Maps to experimental reasoning_effort parameter
- **Other providers**: May ignore effort levels gracefully

For detailed effort level documentation, see the [AI Core Plus documentation](../CorePlus/README.md#effort-level-control).

## License

This package is part of the MemberJunction project. See the [LICENSE](../../../LICENSE) file for details.