# @memberjunction/ai-agents

The MemberJunction AI Agents package provides a comprehensive framework for creating, managing, and executing AI agents within the MemberJunction ecosystem. This package serves as the foundation for building sophisticated agentic AI applications with hierarchical composition, context management, and intelligent execution strategies.

## Features

- **🤖 Decision-Driven Architecture**: AI-powered autonomous decision making with structured execution plans
- **🧠 System Prompt Integration**: Agent prompts embedded in system prompt wrappers for deterministic response format
- **🏗️ Agent Composition**: Hierarchical agent architecture with parent-child relationships
- **🔄 Mixed Execution**: Tool actions and sub-agent delegation with parallel/sequential coordination
- **📝 Comprehensive Tracking**: Agent run and prompt run linking for complete execution visibility
- **🎯 Action Framework**: Extensible action system integrated with ActionEngine
- **🧠 Context Management**: Intelligent conversation context handling and compression
- **🔧 AgentRunner Framework**: Clean delegation pattern to AIPromptRunner for all prompt execution
- **🔐 Metadata-Driven**: Database-driven configuration for agents, types, and system prompts
- **📊 Analytics**: Hierarchical execution logging with performance tracking across agent workflows

## Installation

```bash
npm install @memberjunction/ai-agents
```

## Requirements

- Node.js 16+
- MemberJunction Core libraries
- [@memberjunction/ai-prompts](../Prompts/README.md) for advanced prompt management
- [@memberjunction/aiengine](../Engine/README.md) for AI model orchestration

## Core Architecture

### AgentRunner Class

The `AgentRunner` class is the central component of the AI Agents framework, providing:

- **Decision-Driven Execution**: LLM makes autonomous decisions about what actions to take
- **System Prompt Embedding**: Uses AIPromptRunner with system prompt wrappers for deterministic JSON responses
- **Mixed Execution Support**: Coordinates both tool actions and sub-agent delegation
- **Comprehensive Tracking**: Links all executions through AIAgentRun and AIPromptRun entities
- **Context Management**: Automatic conversation compression and state management
- **Clean Architecture**: Delegates all prompt execution to AIPromptRunner for separation of concerns

```typescript
import { AgentRunner } from '@memberjunction/ai-agents';
import { AIAgentTypeEntityExtended } from '@memberjunction/ai-engine-base';
import { UserInfo } from '@memberjunction/core';

// Create an agent runner for a specific agent type
const agentType = await manager.GetAgentTypeEntity("Customer Support");
const runner = new AgentRunner(agentType, contextUser);

// Execute an agent with decision-driven architecture
const result = await runner.Execute({
  agentEntity: customerSupportAgent,
  contextUser: user,
  data: { customerQuery: "Help with my order" },
  conversationMessages: [...],
  onProgress: (progress) => console.log(progress.message),
  cancellationToken: controller.signal
});

if (result.success) {
  console.log("Agent completed:", result.finalDecision?.finalResponse);
  console.log("Decisions made:", result.decisionHistory?.length);
  console.log("Actions executed:", result.actionResults?.length);
}
```
 

## Architecture Deep Dive

For comprehensive details about the AI Agents framework architecture, data models, workflows, and implementation guidelines, see the [Agent Architecture.md](./Agent%20Architecture.md) document.

Key architectural concepts covered include:

- **Hierarchical Agent Composition**: How agents are organized and orchestrated
- **Metadata-Driven Configuration**: Database-driven agent and prompt management
- **Execution Workflows**: Detailed execution patterns and context management
- **Performance Optimization**: Caching, parallel execution, and resource management
- **Extensibility Patterns**: Guidelines for custom agent development

## Usage Examples

### Basic Agent Implementation

```typescript
import { AgentRunner } from '@memberjunction/ai-agents';
import { AIEngine } from '@memberjunction/aiengine';
import { UserInfo } from '@memberjunction/core';

// Initialize AI Engine to access agents and types
await AIEngine.Instance.Config(false, contextUser);

// Get agent type and specific agent
const agentType = AIEngine.Instance.AgentTypes.find(t => t.Name === 'Customer Support');
const agentEntity = AIEngine.Instance.Agents.find(a => a.Name === 'Customer Support Agent');

// Create agent runner
const runner = new AgentRunner(agentType, contextUser);

// Execute with decision-driven architecture
const result = await runner.Execute({
    agentEntity: agentEntity,
    contextUser: contextUser,
    data: {
        customerQuery: 'I need help with my order',
        customerId: 'cust-123'
    },
    conversationMessages: [
        { role: 'user', content: 'I need help with my order' }
    ]
});

if (result.success) {
    console.log('Agent response:', result.finalDecision?.finalResponse);
    console.log('Execution summary:', result.metadata);
}
```

### Hierarchical Agent Composition

```typescript
import { AgentRunner } from '@memberjunction/ai-agents';

// The AgentRunner automatically handles sub-agent delegation through decision-making
// Parent agents can delegate to child agents based on AI decisions

// Create a parent agent runner
const parentAgentType = AIEngine.Instance.AgentTypes.find(t => t.Name === 'Customer Service Manager');
const parentRunner = new AgentRunner(parentAgentType, contextUser);

// Execute - the agent will make autonomous decisions about delegation
const result = await parentRunner.Execute({
    agentEntity: managerAgent,
    contextUser: contextUser,
    data: {
        customerQuery: 'Complex billing and technical issue',
        priority: 'high'
    },
    conversationMessages: [...],
    onProgress: (progress) => {
        if (progress.step === 'subagent_coordination') {
            console.log('Agent coordinating sub-agents:', progress.metadata);
        }
    }
});

// The agent's decision history shows which sub-agents were chosen
result.decisionHistory?.forEach((decision, i) => {
    console.log(`Decision ${i + 1}: ${decision.decision}`);
    console.log(`Reasoning: ${decision.reasoning}`);
    if (decision.executionPlan.length > 0) {
        console.log('Execution plan:', decision.executionPlan);
    }
});
```

### Context Management and Compression

```typescript
import { AgentRunner } from '@memberjunction/ai-agents';

// Context compression is automatically handled by AgentRunner
// Configure compression through the agent entity properties

const longConversationAgent = AIEngine.Instance.Agents.find(a => {
    return a.EnableContextCompression && 
           a.ContextCompressionMessageThreshold === 50 &&
           a.ContextCompressionMessageRetentionCount === 10;
});

const runner = new AgentRunner(agentType, contextUser);

// Execute with long conversation - compression happens automatically
const longConversation = Array(60).fill(null).map((_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `Message ${i + 1} in a very long conversation`
}));

const result = await runner.Execute({
    agentEntity: longConversationAgent,
    contextUser: contextUser,
    conversationMessages: longConversation,
    onProgress: (progress) => {
        if (progress.step === 'context_processing') {
            console.log('Processing context (may include compression):', progress.message);
        }
    }
});

// Compression is applied automatically based on agent configuration
// The agent run record tracks the compression activity
```

## API Reference

### AgentRunner Class

The core execution engine for AI agents with decision-driven architecture.

#### Constructor
```typescript
constructor(agentType: AIAgentTypeEntityExtended, contextUser: UserInfo)
```

**Parameters:**
- `agentType: AIAgentTypeEntityExtended` - The agent type that defines system prompt and configuration
- `contextUser: UserInfo` - User context for authentication and permissions

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `AgentType` | `AIAgentTypeEntityExtended` | The agent type that defines this runner's configuration |

#### Methods

##### `Execute(params: AgentExecutionParams): Promise<AgentExecutionResult>`
Executes an AI agent using autonomous decision-making and action orchestration.

**Parameters:**
- `params: AgentExecutionParams` - Execution parameters including agent entity, context, and callbacks

**Returns:** `Promise<AgentExecutionResult>` - The execution result with decision history and outcomes

**Key Features:**
- AI-driven decision making (no predetermined execution paths)
- Mixed action and sub-agent execution with proper ordering
- Context compression for long conversations
- Progress tracking and cancellation support
- Comprehensive error handling and fallback strategies

##### `pauseExecution(context: AgentExecutionContext, reason?: string): Promise<string | null>`
Pauses the current execution by serializing state and updating the run status.

**Parameters:**
- `context: AgentExecutionContext` - Current execution context
- `reason: string` - Optional reason for pausing

**Returns:** `Promise<string | null>` - The agent run ID if successful

##### `resumeExecution(agentRunId: string, contextUser?: UserInfo): Promise<AgentExecutionResult>`
Resumes execution from a paused agent run by restoring state and continuing.

**Parameters:**
- `agentRunId: string` - ID of the paused agent run to resume
- `contextUser: UserInfo` - User context for the resumed execution

**Returns:** `Promise<AgentExecutionResult>` - The execution result

##### `getRunHistory(agentRunId: string): Promise<{agentRun: AIAgentRunEntity; steps: AIAgentRunStepEntity[];} | null>`
Retrieves the complete run history for a specific agent run, including all execution steps.

**Parameters:**
- `agentRunId: string` - ID of the agent run to retrieve

**Returns:** Promise resolving to the run details with steps, or null if not found

##### `cleanupFailedRuns(maxAgeHours?: number): Promise<number>`
Cleans up failed or stale agent runs by marking them as failed.

**Parameters:**
- `maxAgeHours: number` - Maximum age in hours for running agents before marking as failed (default: 24)

**Returns:** Promise resolving to the number of runs cleaned up

### Types and Interfaces

#### AgentExecutionParams
```typescript
interface AgentExecutionParams {
    agentEntity: AIAgentEntityExtended;
    contextUser?: UserInfo;
    data?: Record<string, unknown>;
    conversationMessages?: ChatMessage[];
    cancellationToken?: AbortSignal;
    onProgress?: (progress: AgentProgressUpdate) => void;
    onStreaming?: (chunk: AgentStreamingUpdate) => void;
}
```

#### AgentExecutionResult
```typescript
interface AgentExecutionResult {
    success: boolean;
    result?: unknown;
    errorMessage?: string;
    executionTimeMS?: number;
    metadata?: Record<string, unknown>;
    cancelled?: boolean;
    conversationMessages?: ChatMessage[];
    decisionHistory?: AgentDecisionResponse[];
    actionResults?: ActionResult[];
    finalDecision?: AgentDecisionResponse;
}
```

#### AgentDecisionResponse
```typescript
interface AgentDecisionResponse {
    decision: AgentDecisionType;
    reasoning: string;
    executionPlan: ExecutionStep[];
    isTaskComplete: boolean;
    finalResponse?: string;
    confidence: number;
    metadata?: {
        estimatedDuration?: number;
        riskLevel?: 'low' | 'medium' | 'high';
        failureStrategy?: string;
    };
}
```

#### ExecutionStep
```typescript
interface ExecutionStep {
    type: 'action' | 'subagent';
    targetId: string;
    parameters?: Record<string, unknown>;
    executionOrder: number;
    allowParallel?: boolean;
    description?: string;
}
```

#### AgentProgressUpdate
```typescript
interface AgentProgressUpdate {
    step: 'initialization' | 'context_processing' | 'prompt_execution' | 'subagent_coordination' | 'result_aggregation' | 'completion';
    percentage: number;
    message: string;
    metadata?: Record<string, unknown>;
}
```
 
## Configuration

Agents are configured through the MemberJunction metadata system. Key configuration options include:

### Agent Configuration (AIAgent Entity)

| Field | Description | Default |
|-------|-------------|---------|
| `Name` | Unique agent identifier | Required |
| `Description` | Agent purpose and capabilities | Required |
| `ParentID` | Parent agent for hierarchical composition | null |
| `ExecutionMode` | How child agents execute (Sequential/Parallel) | Sequential |
| `EnableContextCompression` | Whether to compress long conversations | false |
| `ContextCompressionMessageThreshold` | Messages before compression triggers | 50 |
| `ContextCompressionMessageRetentionCount` | Recent messages to keep uncompressed | 10 |

### Integration with Prompts

Agents use prompts through the `AIAgentPrompt` entity:

```typescript
// Example: Associate a prompt with an agent
const agentPrompt = await md.GetEntityObject<AIAgentPromptEntity>('AI Agent Prompts');
agentPrompt.NewRecord();
agentPrompt.AgentID = agent.ID;
agentPrompt.PromptID = prompt.ID;
agentPrompt.Purpose = 'Main conversation handler';
agentPrompt.ExecutionOrder = 1;
agentPrompt.ContextBehavior = 'Recent'; // or 'Full', 'None'
agentPrompt.ContextMessageCount = 20;
await agentPrompt.Save();
```

## Dependencies

- `@memberjunction/core`: ^2.43.0 - MemberJunction core library
- `@memberjunction/global`: ^2.43.0 - MemberJunction global utilities
- `@memberjunction/core-entities`: ^2.43.0 - MemberJunction entity definitions
- `@memberjunction/ai`: ^2.43.0 - Base AI functionality
- `@memberjunction/aiengine`: ^2.43.0 - AI model orchestration
- `@memberjunction/ai-prompts`: ^2.43.0 - Advanced prompt management
- `@memberjunction/templates`: ^2.43.0 - Template rendering support
- `rxjs`: ^7.8.1 - Reactive programming support
- `dotenv`: ^16.4.1 - Environment configuration

## Related Packages

- `@memberjunction/aiengine`: Core AI engine and model management
- `@memberjunction/ai-prompts`: Advanced prompt execution and management
- `@memberjunction/templates`: Template rendering for dynamic content

## Advanced Features

### Parallel Agent Execution

```typescript
class ParallelAnalysisAgent extends BaseAgent {
    async execute(context: AgentContext): Promise<AgentResult> {
        // Execute multiple sub-agents in parallel
        const [sentiment, intent, entities] = await Promise.all([
            this.sentimentAgent.execute(context),
            this.intentAgent.execute(context),
            this.entityExtractorAgent.execute(context)
        ]);
        
        // Combine results
        return {
            response: this.synthesizeResults(sentiment, intent, entities),
            success: true,
            metadata: {
                childAgentResults: [sentiment, intent, entities]
            }
        };
    }
}
```

### Agent Learning and Adaptation

```typescript
class LearningAgent extends BaseAgent {
    async execute(context: AgentContext): Promise<AgentResult> {
        try {
            const result = await super.execute(context);
            
            // Learn from successful execution
            if (result.success) {
                await this.addNote(
                    `Successfully handled query type: ${this.classifyQuery(context)}`,
                    'learning'
                );
            }
            
            return result;
        } catch (error) {
            // Learn from errors
            await this.addNote(
                `Error handling query: ${error.message}`,
                'error'
            );
            throw error;
        }
    }
}
```

### Custom Action Implementation

```typescript
class DataAnalysisAgent extends BaseAgent {
    async initialize(): Promise<void> {
        await super.initialize();
        
        // Register custom actions
        this.registerAction('analyzeData', this.analyzeData.bind(this));
        this.registerAction('generateReport', this.generateReport.bind(this));
        this.registerAction('exportResults', this.exportResults.bind(this));
    }
    
    private async analyzeData(params: { datasetId: string }): Promise<any> {
        // Implementation for data analysis
        const dataset = await this.loadDataset(params.datasetId);
        return this.performAnalysis(dataset);
    }
}
```

## Error Handling

The framework provides comprehensive error handling:

```typescript
try {
    const result = await agent.execute(context);
    console.log('Success:', result);
} catch (error) {
    if (error instanceof AgentExecutionError) {
        console.error('Execution failed:', error.message);
        console.error('Agent:', error.agentName);
        console.error('Context:', error.context);
    } else if (error instanceof AgentInitializationError) {
        console.error('Failed to initialize agent:', error.message);
    } else {
        console.error('Unexpected error:', error);
    }
}
```

## Performance Considerations

1. **Context Compression**: Enable for long conversations to reduce token usage
2. **Caching**: Leverage result caching for repeated queries
3. **Parallel Execution**: Use parallel mode for independent sub-agents
4. **Resource Limits**: Configure appropriate timeouts and token limits

## Development Status

✅ **Core Framework Complete** - The MJ AI Agent framework now provides a comprehensive, metadata-driven system for creating and executing AI agents.

### Current Implementation Status

- ✅ Package structure and configuration
- ✅ BaseAgent class implementation with full metadata-driven execution
- ✅ AgentFactory for dynamic agent instantiation
- ✅ Hierarchical agent composition with parent-child relationships
- ✅ Context management and compression
- ✅ AI Prompt system integration
- ✅ Progress tracking and streaming support
- ✅ ClassFactory integration for extensible agent types
- ✅ Comprehensive error handling and cancellation support
- ✅ Example agents and usage patterns

### Architecture Highlights

1. **Metadata-Driven**: Agents configured through database entities (AIAgent, AIAgentPrompt, etc.)
2. **Hierarchical Composition**: Support for conductor patterns with child agents
3. **Intelligent Context Management**: Automatic compression and filtering
4. **Advanced Prompt Integration**: Full integration with AI Prompt system
5. **Extensible Design**: Easy custom agent creation through class registration

### Current Architecture (Implemented)

The framework provides a decision-driven architecture with clean separation of concerns:

```typescript
// Create agent runner for specific agent type
const agentType = await manager.GetAgentTypeEntity("CustomerSupport");
const runner = new AgentRunner(agentType, contextUser);

// Execute with autonomous decision-making
const result = await runner.Execute({
  agentEntity: customerSupportAgent,
  data: { customerName: "John" },
  conversationMessages: [...],
  onProgress: (progress) => console.log(progress),
  cancellationToken: controller.signal
});

// AgentRunner delegates all prompt execution to AIPromptRunner
// with system prompt embedding for deterministic JSON responses
```

### System Prompt Integration

The framework integrates with the AI Prompts system through system prompt embedding:

```typescript
// Agent types define system prompts for deterministic response format
AIAgentType.SystemPromptID -> AIPrompt (system template)

// Agent-specific prompts provide domain logic
AIAgent -> AIAgentPrompt -> AIPrompt (agent-specific instructions)

// Runtime: System prompt embeds agent prompt via {% PromptEmbed %}
System Prompt: "You are {{agentName}}... {% PromptEmbed %}... Respond with JSON..."
```

## License

ISC

---

## Testing

```typescript
import { BaseAgent } from '@memberjunction/ai-agents';
import { MockAgentEntity } from './test-utils';

describe('CustomerSupportAgent', () => {
    let agent: CustomerSupportAgent;
    
    beforeEach(async () => {
        const mockEntity = new MockAgentEntity({
            Name: 'Test Agent',
            EnableContextCompression: true,
            ContextCompressionMessageThreshold: 10
        });
        
        agent = new CustomerSupportAgent(mockEntity);
        await agent.initialize();
    });
    
    test('should handle customer query', async () => {
        const result = await agent.execute({
            conversationId: 'test-123',
            messages: [
                { role: 'user', content: 'What is my order status?' }
            ]
        });
        
        expect(result.success).toBe(true);
        expect(result.response).toContain('order');
    });
    
    test('should compress long conversations', async () => {
        const longContext = {
            conversationId: 'test-456',
            messages: Array(15).fill(null).map((_, i) => ({
                role: i % 2 === 0 ? 'user' : 'assistant',
                content: `Message ${i}`
            }))
        };
        
        const result = await agent.execute(longContext);
        expect(result.metadata.contextCompressed).toBe(true);
    });
});
```

## Troubleshooting

### Common Issues

1. **Agent Not Found**: Ensure the agent is properly registered in the database
2. **Initialization Failures**: Check that all required prompts and configurations exist
3. **Context Overflow**: Enable context compression for long conversations
4. **Performance Issues**: Review parallel execution settings and caching configuration

### Debug Mode

```typescript
// Enable debug logging
process.env.MJ_AI_AGENT_DEBUG = 'true';

const agent = new MyAgent(entity);
agent.on('debug', (message) => {
    console.log('[Agent Debug]:', message);
});
```

## Contributing

When developing agents using this framework:

1. **Always extend BaseAgent** for consistency and built-in functionality
2. **Follow the lifecycle patterns** defined in the base class
3. **Use meaningful names and descriptions** for agents and actions
4. **Implement proper error handling** in custom execution logic
5. **Leverage the note system** for agent learning and improvement
6. **Test with various context scenarios** to ensure robustness
7. **Document custom actions and behaviors** in your agent implementations
8. **Follow TypeScript best practices** and avoid `any` types

For detailed development guidelines and best practices, refer to the [Agent Architecture.md](./Agent%20Architecture.md) documentation.