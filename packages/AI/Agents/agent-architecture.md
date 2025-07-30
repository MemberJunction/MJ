# MemberJunction AI Agent Framework Architecture

## Technical Design Document

---

## 1. Executive Summary

The MemberJunction AI Agent Framework provides a comprehensive, metadata-driven system for developing, configuring, and deploying AI agents that leverage large language models (LLMs) and the MemberJunction Actions framework. This framework abstracts common AI agent functionality, enables configuration without code, and provides a flexible architecture for building sophisticated AI applications.

Key features include:
- Hierarchical prompt execution with system + agent prompt pattern
- Agent type system for reusable behavior patterns
- Comprehensive execution tracking and state management
- Integration with MemberJunction Actions framework
- Automatic context compression for long conversations
- Factory pattern with ClassFactory integration

This document details the technical architecture, data models, and workflows that power the framework.

---

## 2. Core Architecture

### 2.1 Architectural Principles

The MemberJunction AI Agent Framework is built on these principles:

1. **Metadata-Driven:** All configuration stored in database entities
2. **Hierarchical Execution:** System prompts provide base behavior, agent prompts provide specifics
3. **Type-Based Patterns:** Reusable agent types encapsulate common behaviors
4. **Action Integration:** Seamless integration with MJ Actions framework
5. **Comprehensive Tracking:** Every step tracked in database for analysis
6. **Context Efficiency:** Automatic compression and management

### 2.2 System Components

The framework consists of these major components:

1. **BaseAgent:** Core execution engine handling prompt execution, actions, and sub-agents
2. **BaseAgentType:** Abstract class defining agent behavior patterns
3. **AgentRunner:** Simple orchestrator for loading and executing agents
4. **Execution Tracking:** AIAgentRun and AIAgentRunStep entities
5. **Context Management:** Automatic compression and placeholder handling
6. **Factory System:** ClassFactory integration for extensibility

### 2.3 High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Application Layer                      │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│ │   Agent 1   │  │   Agent 2   │  │   Agent 3   │     │
│ │(Loop Type)  │  │(Decision)   │  │  (Custom)   │     │
│ └─────────────┘  └─────────────┘  └─────────────┘     │
└─────────────────────────────────────────────────────────┘
                          ▲
                          │
┌─────────────────────────▼────────────────────────────────┐
│                    AgentRunner                           │
├──────────────────────────────────────────────────────────┤
│ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│ │Load Metadata│  │Instantiate  │  │  Execute    │      │
│ │from Database│  │Agent Class  │  │   Agent     │      │
│ └─────────────┘  └─────────────┘  └─────────────┘      │
└──────────────────────────────────────────────────────────┘
                          ▲
                          │
┌─────────────────────────▼────────────────────────────────┐
│                     BaseAgent                            │
├──────────────────────────────────────────────────────────┤
│ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│ │ Hierarchical│  │   Action    │  │  Sub-Agent  │      │
│ │   Prompts   │  │ Execution   │  │ Orchestration│     │
│ └─────────────┘  └─────────────┘  └─────────────┘      │
│ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│ │   Context   │  │  Execution  │  │ Agent Type  │      │
│ │ Management  │  │  Tracking   │  │Integration  │      │
│ └─────────────┘  └─────────────┘  └─────────────┘      │
└──────────────────────────────────────────────────────────┘
          ▲                  ▲                   ▲
          │                  │                   │
┌─────────▼──────┐  ┌────────▼───────┐  ┌───────▼────────┐
│BaseAgentType   │  │ AI Prompts     │  │MJ Actions      │
├────────────────┤  ├────────────────┤  ├─────────────────┤
│┌──────────────┐│  │┌──────────────┐│  │┌───────────────┐│
││LoopAgentType ││  ││Prompt Runner ││  ││Action Engine  ││
│└──────────────┘│  │└──────────────┘│  │└───────────────┘│
│┌──────────────┐│  │┌──────────────┐│  │┌───────────────┐│
││Custom Types  ││  ││Hierarchical  ││  ││Action Results ││
│└──────────────┘│  │└──────────────┘│  │└───────────────┘│
└────────────────┘  └────────────────┘  └─────────────────┘
          ▲                  ▲                   ▲
          │                  │                   │
┌─────────▼──────────────────▼───────────────────▼────────┐
│                      Data Layer                          │
├──────────────────────────────────────────────────────────┤
│┌──────────┐┌────────────┐┌──────────┐┌────────┐┌───────┐│
││AIAgent   ││AIAgentType ││AIPrompt  ││Actions ││Runs   ││
││          ││            ││          ││        ││Steps  ││
│└──────────┘└────────────┘└──────────┘└────────┘└───────┘│
└──────────────────────────────────────────────────────────┘
```

---

## 3. Data Models

### 3.1 Agent Configuration

#### 3.1.1 AIAgentType

Defines types of AI agents with their system prompts and behavioral characteristics.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| Name | nvarchar(100) | Type name (e.g., "LoopAgent", "DecisionTree") |
| Description | nvarchar(max) | Detailed description of the agent type |
| SystemPromptID | uniqueidentifier | References the AI Prompt containing base behavior |
| DriverClass | nvarchar(255) | TypeScript class name implementing BaseAgentType |
| IsActive | bit | Whether this agent type is available for use |

#### 3.1.2 AIAgent

Defines AI agents in the system.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| Name | nvarchar(255) | Agent name |
| Description | nvarchar(max) | Detailed description |
| AgentTypeID | uniqueidentifier | References AIAgentType defining behavior |
| IsActive | bit | Whether agent is active |
| EnableContextCompression | bit | Whether to compress context |
| ContextCompressionMessageThreshold | int | Messages before compression |
| ContextCompressionMessageRetentionCount | int | Recent messages to keep |

#### 3.1.3 AIAgentPrompt

Associates prompts with agents in execution order.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| AgentID | uniqueidentifier | References the agent |
| PromptID | uniqueidentifier | References the prompt |
| ExecutionOrder | int | Order of execution (1-based) |
| IsActive | bit | Whether this association is active |

### 3.2 Execution Tracking

#### 3.2.1 AIAgentRun

Tracks individual execution runs of AI agents.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| AgentID | uniqueidentifier | References the AIAgent being executed |
| AgentTypeID | uniqueidentifier | References the AIAgentType used |
| ParentRunID | uniqueidentifier | For sub-agent executions |
| Status | nvarchar(50) | Running, Completed, Failed, Cancelled |
| StartedAt | datetimeoffset(7) | When execution began |
| CompletedAt | datetimeoffset(7) | When execution completed |
| Success | bit | Whether execution was successful |
| ErrorMessage | nvarchar(max) | Error details if failed |
| Result | nvarchar(max) | Final execution result |
| TotalTokensUsed | int | Total tokens consumed |
| TotalCost | decimal(18,6) | Estimated cost |

#### 3.2.2 AIAgentRunStep

Provides step-by-step tracking of agent execution.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| AgentRunID | uniqueidentifier | References parent run |
| StepNumber | int | Sequential step number |
| StepType | nvarchar(50) | prompt, action, subagent, decision |
| StepName | nvarchar(255) | Human-readable name |
| Status | nvarchar(50) | Running, Completed, Failed |
| StartedAt | datetimeoffset(7) | Step start time |
| CompletedAt | datetimeoffset(7) | Step end time |
| Success | bit | Whether step succeeded |
| ErrorMessage | nvarchar(max) | Error if failed |
| InputData | nvarchar(max) | JSON input data |
| OutputData | nvarchar(max) | JSON output data |

#### 3.2.3 AIAgentRunStepPrompt

Links run steps to prompt executions.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| AgentRunStepID | uniqueidentifier | References the step |
| PromptRunID | uniqueidentifier | References AIPromptRun |

#### 3.2.4 AIAgentRunStepAction

Tracks action executions within agent runs.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| AgentRunStepID | uniqueidentifier | References the step |
| ActionID | uniqueidentifier | References the action |
| ActionResultID | uniqueidentifier | References action execution |

---

## 4. Key Workflows

### 4.1 Agent Execution Workflow

The agent execution workflow in BaseAgent follows these steps:

1. **Initialization**:
   - Create AIAgentRun with Running status
   - Load agent configuration from database
   - Initialize AI and Action engines if needed
   - Validate agent has required prompts

2. **Configuration Loading**:
   - Load AIAgentType with system prompt
   - Load agent's prompts ordered by ExecutionOrder
   - Prepare conversation context
   - Set up execution tracking

3. **Prompt Execution Loop**:
   - For each agent prompt in order:
     - Create AIAgentRunStep for tracking
     - Execute hierarchically (system as parent, agent as child)
     - Track via AIAgentRunStepPrompt
     - Get agent type to determine next step
     - Process actions or sub-agents if needed
     - Continue or stop based on decision

4. **Action Processing**:
   - When agent type returns action decision:
     - Parse action names and parameters
     - Execute actions via ActionEngine
     - Create AIAgentRunStepAction records
     - Format results as conversation messages
     - Append to context and continue

5. **Sub-agent Processing**:
   - When agent type returns sub-agent decision:
     - Load sub-agent configuration
     - Execute recursively with new AIAgentRun
     - Link via ParentRunID
     - Format results and continue

6. **Completion**:
   - Update AIAgentRun with final status
   - Aggregate token usage and costs
   - Return complete execution result

### 4.2 Hierarchical Prompt Execution

BaseAgent implements a specific pattern for prompt execution:

1. **System Prompt as Parent**:
   - Agent type's system prompt provides base behavior
   - Defines how agent should think and respond
   - Sets up structured response format

2. **Agent Prompt as Child**:
   - Specific prompt for the current task
   - Executes with system prompt as parent
   - Inherits context and behavior from system

3. **Execution Pattern**:
   ```
   System Prompt (from AIAgentType)
      └── Agent Prompt 1 (ExecutionOrder: 1)
      └── Agent Prompt 2 (ExecutionOrder: 2)
      └── Agent Prompt N (ExecutionOrder: N)
   ```

4. **Benefits**:
   - Consistent behavior across all agent prompts
   - System prompt can define response format once
   - Agent prompts focus on specific tasks
   - Easy to modify behavior by changing system prompt

### 4.3 Agent Type Decision Flow

BaseAgentType implementations control execution flow:

1. **DetermineNextStep Method**:
   - Receives AIPromptRunResult from prompt execution
   - Parses result based on expected format
   - Returns BaseAgentNextStep decision

2. **Decision Types**:
   - `continue`: Execute next prompt in sequence
   - `stop`: Complete execution with reason
   - `action`: Execute specified actions
   - `sub_agent`: Execute specified sub-agent
   - `retry`: Re-execute current prompt

3. **LoopAgentType Example**:
   ```typescript
   async DetermineNextStep(result: AIPromptRunResult): Promise<BaseAgentNextStep> {
     const response = JSON.parse(result.FullResult);
     
     if (response.taskComplete) {
       return { type: 'stop', reason: response.summary };
     } else if (response.actions) {
       return { 
         type: 'action',
         actions: response.actions.map(a => ({
           name: a.name,
           params: a.parameters
         }))
       };
     } else {
       return { type: 'continue' };
     }
   }
   ```

### 4.4 Context Management

BaseAgent handles context automatically:

1. **Context Building**:
   - Starts with provided conversation messages
   - Appends action results as user messages
   - Appends sub-agent results as user messages
   - Maintains conversation flow

2. **Context Compression**:
   - When message count > threshold:
     - Keep N most recent messages
     - Compress older messages via prompt
     - Replace with summary
   - Preserves conversation continuity

3. **Placeholder Support**:
   - `{{messages}}`: Full conversation history
   - `{{lastMessage}}`: Most recent message
   - Custom placeholders via data parameter

---

## 5. Implementation Patterns

### 5.1 Creating Custom Agent Types

```typescript
import { BaseAgentType, RegisterClass, BaseAgentNextStep } from '@memberjunction/ai-agents';
import { AIPromptRunResult } from '@memberjunction/ai-prompts';

@RegisterClass(BaseAgentType, "WorkflowAgent")
export class WorkflowAgentType extends BaseAgentType {
    async DetermineNextStep(promptResult: AIPromptRunResult): Promise<BaseAgentNextStep> {
        try {
            const response = JSON.parse(promptResult.FullResult);
            
            // Workflow-specific logic
            switch(response.stage) {
                case 'gather_info':
                    return {
                        type: 'action',
                        actions: [{
                            name: 'GetUserData',
                            params: { userId: response.userId }
                        }]
                    };
                    
                case 'analyze':
                    return {
                        type: 'sub_agent',
                        agentName: 'DataAnalysisAgent',
                        messages: [
                            { role: 'user', content: response.data }
                        ]
                    };
                    
                case 'complete':
                    return {
                        type: 'stop',
                        reason: 'Workflow completed',
                        returnValue: response.result
                    };
                    
                default:
                    return { type: 'continue' };
            }
        } catch (error) {
            return {
                type: 'stop',
                reason: 'Failed to parse response',
                error: error.message
            };
        }
    }
}
```

### 5.2 Extending BaseAgent

```typescript
import { BaseAgent, ExecuteAgentParams, ExecuteAgentResult } from '@memberjunction/ai-agents';

export class CustomAgent extends BaseAgent {
    // Override to add custom validation
    protected async validateAgent(agent: AIAgentEntity): Promise<ExecuteAgentResult | null> {
        const baseResult = await super.validateAgent(agent);
        if (baseResult) return baseResult;
        
        // Add custom validation
        if (!this.hasRequiredConfig(agent)) {
            return {
                nextStep: 'failed',
                errorMessage: 'Missing required configuration'
            };
        }
        
        return null;
    }
    
    // Override to inject custom data
    protected async preparePromptParams(
        agentType: AIAgentTypeEntity,
        systemPrompt: any,
        childPrompt: any,
        params: ExecuteAgentParams
    ): Promise<AIPromptParams> {
        const promptParams = await super.preparePromptParams(
            agentType, systemPrompt, childPrompt, params
        );
        
        // Add custom data
        promptParams.data.customField = await this.loadCustomData();
        
        return promptParams;
    }
}
```

### 5.3 Using AgentRunner

```typescript
import { AgentRunner } from '@memberjunction/ai-agents';

// Simple usage
const runner = new AgentRunner();
const result = await runner.RunAgent({
    agent: agentEntity,
    conversationMessages: [
        { role: 'user', content: 'Help me analyze this data' }
    ],
    contextUser: user
});

// With data and tracking
const result = await runner.RunAgent({
    agent: agentEntity,
    conversationMessages: messages,
    data: {
        customerId: '12345',
        analysisType: 'trend'
    },
    contextUser: user,
    onProgress: (update) => {
        console.log(`Progress: ${update.message}`);
    }
});
```

---

## 6. Best Practices

### 6.1 Agent Design

1. **Single Responsibility**: Each agent should have one clear purpose
2. **Modular Prompts**: Break complex tasks into multiple prompts
3. **Structured Responses**: Use JSON for agent type parsing
4. **Error Handling**: Implement graceful fallbacks in agent types
5. **Context Efficiency**: Enable compression for conversational agents

### 6.2 System Prompt Design

1. **Define Response Format**: Specify exact JSON structure expected
2. **Provide Examples**: Include example responses in prompt
3. **Set Behavioral Rules**: Define how agent should think
4. **Error Instructions**: Tell agent how to handle errors
5. **Keep Focused**: System prompt should be about behavior, not tasks

### 6.3 Agent Type Implementation

1. **Robust Parsing**: Handle malformed responses gracefully
2. **Clear Decisions**: Return unambiguous next steps
3. **Meaningful Errors**: Provide helpful error messages
4. **Type Registration**: Always use @RegisterClass decorator
5. **Validate Inputs**: Check response structure before using

### 6.4 Performance Optimization

1. **Prompt Caching**: Enable caching on reusable prompts
2. **Context Compression**: Set appropriate thresholds
3. **Action Batching**: Execute related actions together
4. **Sub-agent Planning**: Minimize recursive depth
5. **Token Efficiency**: Design concise prompts

---

## 7. Integration with MemberJunction

### 7.1 Entity System

- All configuration stored in MJ entities
- Uses standard MJ patterns for data access
- Integrates with MJ security and permissions
- Leverages MJ metadata system

### 7.2 Actions Framework

- Seamless integration with MJ Actions
- Actions executed via ActionEngine
- Results automatically tracked
- Full action parameter support

### 7.3 Prompts System

- Built on @memberjunction/ai-prompts
- Supports hierarchical execution
- Template rendering with placeholders
- Model selection and caching

### 7.4 ClassFactory

- Agent types registered with ClassFactory
- Dynamic instantiation based on metadata
- Supports custom implementations
- Extensible architecture

---

## 8. Common Patterns

### 8.1 Loop Until Complete

```typescript
// System prompt defines response format
{
  "thinking": "explanation of current analysis",
  "taskComplete": true/false,
  "actions": [...],
  "subAgent": {...},
  "summary": "final result if complete"
}

// LoopAgentType parses and decides
// Continues until taskComplete: true
```

### 8.2 Decision Tree

```typescript
// System prompt defines branches
{
  "analysis": "current situation",
  "branch": "gather_data" | "process" | "complete",
  "data": {...}
}

// Custom agent type routes based on branch
// Different actions for each branch
```

### 8.3 Pipeline Processing

```typescript
// Multiple prompts in sequence
// Each builds on previous results
// Agent type can skip or repeat based on results
// Final prompt produces output
```

---

## 9. Troubleshooting

### 9.1 Common Issues

1. **No Prompts Found**: Check AIAgentPrompt associations
2. **Parse Errors**: Verify system prompt defines correct format
3. **Action Not Found**: Ensure action is registered and active
4. **Context Too Large**: Enable compression or reduce threshold
5. **Type Not Found**: Verify @RegisterClass decorator used

### 9.2 Debugging

1. **Check AIAgentRun**: Review status and error messages
2. **Examine Steps**: Look at AIAgentRunStep sequence
3. **Review Prompts**: Check AIPromptRun for actual execution
4. **Validate JSON**: Ensure responses match expected format
5. **Test Types**: Unit test DetermineNextStep logic

---

## 10. Future Enhancements

### 10.1 Planned Features

1. **Parallel Prompt Execution**: Execute independent prompts concurrently
2. **Conditional Prompts**: Skip prompts based on conditions
3. **State Persistence**: Save/resume agent execution
4. **Learning Integration**: Agents that improve over time
5. **Visual Designer**: GUI for agent configuration

### 10.2 Architecture Evolution

1. **Event System**: Publish events during execution
2. **Plugin Architecture**: Extend agents with plugins
3. **Distributed Execution**: Scale across multiple servers
4. **Advanced Analytics**: Deeper execution insights
5. **Multi-modal Support**: Images, audio, video processing

---

## Appendix A: Database Schema Relationships

```
AIAgentType ──────┐
     │            │
     │            ├── AIAgent
     │            │      │
     └────────────┘      ├── AIAgentPrompt ── AIPrompt
                         │
                         ├── AIAgentRun
                         │      │
                         │      ├── AIAgentRunStep
                         │      │      │
                         │      │      ├── AIAgentRunStepPrompt ── AIPromptRun
                         │      │      │
                         │      │      └── AIAgentRunStepAction ── ActionExecutionLog
                         │      │
                         │      └── (ParentRunID for sub-agents)
                         │
                         └── (Recursive for sub-agents)
```

---

## Appendix B: Type Registration Example

```typescript
// 1. Create the type class
@RegisterClass(BaseAgentType, "MyCustomType") 
export class MyCustomType extends BaseAgentType {
    async DetermineNextStep(result: AIPromptRunResult): Promise<BaseAgentNextStep> {
        // Implementation
    }
}

// 2. Create database record
INSERT INTO AIAgentType (ID, Name, Description, SystemPromptID, DriverClass, IsActive)
VALUES (
    NEWID(),
    'My Custom Type',
    'Description of what this type does',
    'system-prompt-id-here',
    'MyCustomType',
    1
);

// 3. Use in agents
INSERT INTO AIAgent (ID, Name, AgentTypeID, ...)
VALUES (
    NEWID(), 
    'My Custom Agent',
    'my-custom-type-id',
    ...
);
```

---

This architecture provides a flexible, extensible foundation for building AI agents within the MemberJunction ecosystem. The combination of metadata-driven configuration, type-based behaviors, and comprehensive tracking enables rapid development while maintaining consistency and control.