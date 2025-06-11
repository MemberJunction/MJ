# @memberjunction/ai-agents

The MemberJunction AI Agents package provides a comprehensive framework for creating, managing, and executing AI agents within the MemberJunction ecosystem. This package implements a clean separation of concerns architecture that separates domain execution from orchestration decision-making.

## Features

- **🎯 Separation of Concerns**: Clean architecture separating BaseAgent (execution), ConductorAgent (decisions), and AgentRunner (coordination)
- **🤖 Hierarchical Prompt Execution**: Advanced prompt system with depth-first traversal and parallel execution at each level
- **🏗️ Agent Composition**: Hierarchical agent architecture with parent-child relationships
- **🔄 Mixed Execution**: Action execution and sub-agent delegation with parallel/sequential coordination
- **📝 Comprehensive Tracking**: Agent run and prompt run linking for complete execution visibility
- **🎯 Action Framework**: Extensible action system integrated with ActionEngine
- **🧠 Context Management**: Intelligent conversation context handling and compression
- **🔧 Factory Pattern**: Enhanced AgentFactory for dynamic agent instantiation and extensibility
- **🔐 Metadata-Driven**: Database-driven configuration for agents, types, and prompts
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

The AI Agents framework implements a clean separation of concerns architecture:

### BaseAgent - Domain Execution
- Focuses solely on executing agent-specific prompts and tasks
- Handles template rendering with data context
- Manages conversation context and compression
- Returns standardized execution results

### ConductorAgent - Decision Making
- Specialized agent for making orchestration decisions
- Analyzes current state and available resources
- Makes autonomous decisions about next steps
- Plans execution sequences with proper ordering

### AgentRunner - Coordination
- Orchestrates interaction between BaseAgent and ConductorAgent
- Implements the core execution loop
- Manages progress tracking and cancellation
- Provides user interface abstraction

```typescript
import { GetAgentFactory } from '@memberjunction/ai-agents';
import { UserInfo } from '@memberjunction/core';

// Get agent factory and create agents
const factory = GetAgentFactory();
const baseAgent = await factory.CreateAgent("Customer Support", null, contextUser);
const conductorAgent = await factory.CreateAgent("Conductor", null, contextUser);

// Create runner and execute with separation of concerns
const runner = new AgentRunner(conductorAgent, contextUser);
const result = await runner.Run({
  agent: baseAgent,
  goal: "Help customer with their order",
  data: { customerQuery: "Where is my order?" },
  conversationMessages: [...],
  onProgress: (progress) => console.log(progress.message),
  cancellationToken: controller.signal
});

if (result.success) {
  console.log("Task completed:", result.finalDecision?.finalResponse);
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
import { GetAgentFactory } from '@memberjunction/ai-agents';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentRunner } from '@memberjunction/ai-agents';
import { UserInfo } from '@memberjunction/core';

// Initialize AI Engine to access agents and types
await AIEngine.Instance.Config(false, contextUser);

// Get agent factory and create agents
const factory = GetAgentFactory();
const baseAgent = await factory.CreateAgent('Customer Support', null, contextUser);
const conductorAgent = await factory.CreateAgent('Conductor', null, contextUser);

// Create and run with separation of concerns architecture
const runner = new AgentRunner(conductorAgent, contextUser);
const result = await runner.Run({
    agent: baseAgent,
    goal: 'Help customer with their order',
    data: {
        customerQuery: 'I need help with my order',
        customerId: 'cust-123'
    },
    conversationMessages: [
        { role: 'user', content: 'I need help with my order' }
    ]
});

if (result.success) {
    console.log('Task completed:', result.finalDecision?.finalResponse);
    console.log('Execution summary:', result.metadata);
}
```

### Hierarchical Agent Composition

```typescript
import { GetAgentFactory, AgentRunner } from '@memberjunction/ai-agents';

// Hierarchical agents are handled through conductor decision-making
// Parent agents delegate to child agents based on AI decisions

// Get factory and create hierarchical agents
const factory = GetAgentFactory();
const managerAgent = await factory.CreateAgent('Customer Service Manager', null, contextUser);
const conductorAgent = await factory.CreateAgent('Conductor', null, contextUser);

// Create runner and execute - conductor will make autonomous delegation decisions
const runner = new AgentRunner(conductorAgent, contextUser);
const result = await runner.Run({
    agent: managerAgent,
    goal: 'Resolve complex customer issue',
    data: {
        customerQuery: 'Complex billing and technical issue',
        priority: 'high'
    },
    conversationMessages: [...],
    onProgress: (progress) => {
        if (progress.step === 'prompt_execution') {
            console.log('Agent coordinating execution:', progress.metadata);
        }
    }
});

// The conductor's decision history shows which sub-agents were chosen
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
import { GetAgentFactory, AgentRunner } from '@memberjunction/ai-agents';

// Context compression is automatically handled by BaseAgent
// Configure compression through the agent entity properties

const factory = GetAgentFactory();
const longConversationAgent = AIEngine.Instance.Agents.find(a => {
    return a.EnableContextCompression && 
           a.ContextCompressionMessageThreshold === 50 &&
           a.ContextCompressionMessageRetentionCount === 10;
});

const baseAgent = factory.CreateAgentFromEntity(longConversationAgent, null, contextUser);
const conductorAgent = await factory.CreateAgent('Conductor', null, contextUser);
const runner = new AgentRunner(conductorAgent, contextUser);

// Execute with long conversation - compression happens automatically in BaseAgent
const longConversation = Array(60).fill(null).map((_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `Message ${i + 1} in a very long conversation`
}));

const result = await runner.Run({
    agent: baseAgent,
    goal: 'Handle long conversation with compression',
    conversationMessages: longConversation,
    onProgress: (progress) => {
        if (progress.step === 'prompt_execution') {
            console.log('Processing context (may include compression):', progress.message);
        }
    }
});

// Compression is applied automatically by BaseAgent based on agent configuration
// The agent run record tracks the compression activity
```

## API Reference

### AgentRunner Class

The core coordination engine for orchestrating BaseAgent and ConductorAgent interactions.

#### Constructor
```typescript
constructor(conductor: ConductorAgent, contextUser: UserInfo)
```

**Parameters:**
- `conductor: ConductorAgent` - The conductor agent that makes orchestration decisions
- `contextUser: UserInfo` - User context for authentication and permissions

#### Methods

##### `Run(params: AgentRunnerParams): Promise<AgentRunnerResult>`
Runs the agent using the BaseAgent + ConductorAgent separation of concerns pattern.

**Parameters:**
- `params: AgentRunnerParams` - Execution parameters including base agent, goal, and configuration

**Returns:** `Promise<AgentRunnerResult>` - Enhanced execution result with decision history and outcomes

**Key Features:**
- Clean separation between execution and decision-making
- Iterative BaseAgent → ConductorAgent → Action execution pattern
- Mixed action and sub-agent execution with proper ordering
- Progress tracking and cancellation support
- Comprehensive execution step tracking

### BaseAgent Class

The domain execution engine that focuses solely on executing agent-specific prompts.

#### Constructor
```typescript
constructor(agent: AIAgentEntityExtended, factory: IAgentFactory, contextUser: UserInfo, promptRunner?: AIPromptRunner)
```

**Parameters:**
- `agent: AIAgentEntityExtended` - The agent entity definition
- `factory: IAgentFactory` - Factory for creating additional agent instances
- `contextUser: UserInfo` - User context for authentication and permissions
- `promptRunner: AIPromptRunner` - Optional prompt runner instance

#### Methods

##### `Execute(params: AgentExecutionParams): Promise<AgentExecutionResult>`
Executes the agent's specific prompts and returns the result.

**Parameters:**
- `params: AgentExecutionParams` - Execution parameters including context, data, and callbacks

**Returns:** `Promise<AgentExecutionResult>` - The execution result

**Key Features:**
- Single responsibility: execute agent-specific prompts only
- Conversation context management and compression
- Progress monitoring and streaming response support
- Cancellation support with graceful cleanup

### ConductorAgent Class

The decision-making engine that analyzes context and makes orchestration decisions.

#### Constructor
```typescript
constructor(agent: AIAgentEntityExtended, factory: IAgentFactory, contextUser: UserInfo)
```

#### Methods

##### `MakeDecision(decisionInput: ConductorDecisionInput): Promise<ConductorDecisionResponse>`
Makes an autonomous decision about what to do next based on current context.

**Parameters:**
- `decisionInput: ConductorDecisionInput` - Complete context for decision-making

**Returns:** `Promise<ConductorDecisionResponse>` - Structured decision response

##### `executeAction(actionId: string, parameters: Record<string, unknown>): Promise<ActionResult>`
Executes an action using the ActionEngine.

##### `executeSubAgent(subAgentId: string, parameters: Record<string, unknown>, parentContext?: Record<string, unknown>): Promise<AgentExecutionResult>`
Executes a sub-agent with the provided parameters.

### Types and Interfaces

#### AgentRunnerParams
```typescript
interface AgentRunnerParams extends AgentExecutionParams {
    agent: BaseAgent;
    maxIterations?: number;
    goal?: string;
    enableDetailedLogging?: boolean;
}
```

#### AgentRunnerResult
```typescript
interface AgentRunnerResult extends AgentExecutionResult {
    decisionHistory?: ConductorDecisionResponse[];
    actionResults?: ActionResult[];
    finalDecision?: ConductorDecisionResponse;
    iterationCount?: number;
    executionSteps?: ExecutionHistoryItem[];
}
```

#### ConductorDecisionResponse
```typescript
interface ConductorDecisionResponse {
    decision: ConductorDecisionType;
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
    step: 'initialization' | 'prompt_execution' | 'completion';
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

The framework provides a separation of concerns architecture with specialized responsibilities:

```typescript
// Get factory and create specialized agents
const factory = GetAgentFactory();
const baseAgent = await factory.CreateAgent("CustomerSupport", null, contextUser);
const conductorAgent = await factory.CreateAgent("Conductor", null, contextUser);

// Execute with clean separation of concerns
const runner = new AgentRunner(conductorAgent, contextUser);
const result = await runner.Run({
  agent: baseAgent,
  goal: "Help customer with their issue",
  data: { customerName: "John" },
  conversationMessages: [...],
  onProgress: (progress) => console.log(progress),
  cancellationToken: controller.signal
});

// BaseAgent handles domain execution, ConductorAgent makes decisions
// AgentRunner coordinates the interaction between them
```

### Hierarchical Prompt Integration

The framework integrates with the AI Prompts system through hierarchical prompt execution:

```typescript
// Agent types define system prompts for behavioral characteristics
AIAgentType.SystemPromptID -> AIPrompt (system template)

// Agent-specific prompts provide domain logic
AIAgent -> AIAgentPrompt -> AIPrompt (agent-specific instructions)

// Runtime: Hierarchical execution with parent-child relationships
// Parent prompts specify children via childPrompts array
// Depth-first traversal with parallel execution at each level
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