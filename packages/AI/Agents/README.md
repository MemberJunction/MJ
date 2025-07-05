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

### AgentRunner
Simple orchestrator that:
- Loads agent metadata from database
- Instantiates correct agent class using ClassFactory
- Executes agents with provided context

### PayloadManager
Advanced payload access control for hierarchical agent execution:
- Controls which payload paths sub-agents can read (downstream)
- Controls which payload paths sub-agents can write (upstream)
- Supports JSON path patterns with wildcards
- Detects suspicious changes with configurable rules
- Generates human-readable diffs for audit trails

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

## Advanced Features

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
- Compresses context when approaching token limits
- Handles placeholder replacement in prompts
- Preserves important context during compression

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

## Database Schema

Key entities used by the agent framework:

- **AIAgentType**: Agent behavior patterns and system prompts
- **AIAgent**: Configured agent instances
  - `PayloadDownstreamPaths`: JSON array of paths sub-agents can read
  - `PayloadUpstreamPaths`: JSON array of paths sub-agents can write
- **AIPrompt**: Reusable prompt templates with placeholders
- **AIAgentPrompt**: Links agents to prompts with execution order
- **AIAgentRun**: Tracks complete agent executions
  - `LastRunID`: Links to previous run in a chain (for run chaining)
  - `StartingPayload`: Initial payload for the run
- **AIAgentRunStep**: Records individual steps within runs
  - `PayloadAtStart`: JSON snapshot of payload before step
  - `PayloadAtEnd`: JSON snapshot of payload after step
  - `OutputData`: Includes `payloadChangeResult` with analysis
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

## Architecture Documentation

For detailed architecture information, see [agent-architecture.md](./agent-architecture.md).

## Contributing

Contributions are welcome! Please see the main MemberJunction [contributing guide](../../../CONTRIBUTING.md).

## API Keys

The AI Agents framework supports flexible API key management through integration with the AI Prompts system. For detailed information about API key configuration, see the [AI Prompts API Keys documentation](../Prompts/README.md#api-keys).

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

### Benefits for Agent Systems

Runtime API keys are particularly useful for agent architectures:
- **Multi-tenant isolation**: Different customers use their own API keys
- **Cost attribution**: Track API usage per department or project
- **Security**: Limit exposure of production API keys
- **Testing**: Use test API keys for development agents

## License

This package is part of the MemberJunction project. See the [LICENSE](../../../LICENSE) file for details.