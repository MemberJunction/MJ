# @memberjunction/ai-agents

The MemberJunction AI Agents package provides a comprehensive framework for creating, managing, and executing AI agents within the MemberJunction ecosystem. This package serves as the foundation for building sophisticated agentic AI applications with hierarchical composition, context management, and intelligent execution strategies.

## Features

- **🤖 BaseAgent Class**: Core foundation for all AI agent implementations
- **🏗️ Agent Composition**: Hierarchical agent architecture with parent-child relationships
- **🧠 Context Management**: Intelligent conversation context handling and compression
- **🔄 Execution Strategies**: Sequential and parallel agent execution modes
- **📝 Learning System**: Agent note-taking and knowledge retention capabilities
- **🎯 Action Framework**: Extensible action system for agent capabilities
- **🔧 Subclassing Support**: Easy extension and customization of agent behavior
- **🔐 Metadata-Driven**: Database-driven configuration for agents and behaviors
- **📊 Analytics**: Comprehensive execution logging and performance tracking

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

### BaseAgent Class

The `BaseAgent` class is the central component of the AI Agents framework, providing:

- **Standard Interface**: Consistent API for all agent implementations
- **Lifecycle Management**: Initialization, execution, and cleanup workflows
- **Context Handling**: Automatic conversation context management
- **Error Handling**: Robust error recovery and logging
- **Extensibility**: Clean extension points for custom behavior

```typescript
import { BaseAgent } from '@memberjunction/ai-agents';
import { AIAgentEntity } from '@memberjunction/core-entities';

// Create a custom agent by extending BaseAgent
class CustomerSupportAgent extends BaseAgent {
    // Agent metadata from database
    private agentEntity: AIAgentEntity;
    
    constructor(agentEntity: AIAgentEntity) {
        super();
        this.agentEntity = agentEntity;
    }
    
    async initialize(): Promise<void> {
        // Custom initialization logic
        await super.initialize();
        this.setupCustomCapabilities();
    }

    async execute(context: AgentContext): Promise<AgentResult> {
        // Custom execution logic
        const result = await super.execute(context);
        return this.enhanceResult(result);
    }
    
    async handleAction(actionName: string, params: any): Promise<any> {
        // Handle agent-specific actions
        switch(actionName) {
            case 'searchKnowledgeBase':
                return this.searchKnowledgeBase(params);
            case 'createTicket':
                return this.createSupportTicket(params);
            default:
                return super.handleAction(actionName, params);
        }
    }
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
import { BaseAgent } from '@memberjunction/ai-agents';
import { Metadata } from '@memberjunction/core';
import { AIAgentEntity } from '@memberjunction/core-entities';

// Load agent metadata from database
const md = new Metadata();
const agentEntity = await md.GetEntityObject<AIAgentEntity>('AI Agents');
await agentEntity.Load('Customer Support Agent');

// Create agent instance
const agent = new CustomerSupportAgent(agentEntity);
await agent.initialize();

// Execute agent with context
const result = await agent.execute({
    conversationId: 'conv-123',
    messages: [
        { role: 'user', content: 'I need help with my order' }
    ],
    metadata: {
        userId: 'user-456',
        sessionId: 'session-789'
    }
});

console.log(result.response);
```

### Hierarchical Agent Composition

```typescript
import { BaseAgent, ConductorAgent } from '@memberjunction/ai-agents';

// Create a conductor agent that manages other agents
class CustomerServiceConductor extends ConductorAgent {
    async routeToSubAgent(context: AgentContext): Promise<string> {
        // Analyze context to determine which sub-agent to use
        const intent = await this.analyzeIntent(context);
        
        switch(intent.category) {
            case 'billing':
                return 'BillingAgent';
            case 'technical':
                return 'TechnicalSupportAgent';
            case 'general':
                return 'GeneralInquiryAgent';
            default:
                return 'DefaultAgent';
        }
    }
}

// Use the conductor
const conductor = new CustomerServiceConductor(conductorEntity);
await conductor.initialize();

// Add child agents
await conductor.addChildAgent(billingAgent);
await conductor.addChildAgent(technicalAgent);
await conductor.addChildAgent(generalAgent);

// Execute - conductor will route to appropriate sub-agent
const result = await conductor.execute(context);
```

### Context Management and Compression

```typescript
import { BaseAgent } from '@memberjunction/ai-agents';

class LongConversationAgent extends BaseAgent {
    async execute(context: AgentContext): Promise<AgentResult> {
        // Check if context needs compression
        if (context.messages.length > this.agentEntity.ContextCompressionMessageThreshold) {
            // Compress older messages while keeping recent ones
            context = await this.compressContext(context);
        }
        
        // Continue with execution
        return super.execute(context);
    }
    
    private async compressContext(context: AgentContext): Promise<AgentContext> {
        // Use configured compression prompt
        const compressionPrompt = await this.getCompressionPrompt();
        const compressed = await compressionPrompt.execute({
            messages: context.messages.slice(0, -this.agentEntity.ContextCompressionMessageRetentionCount)
        });
        
        // Return new context with compressed history
        return {
            ...context,
            messages: [
                { role: 'system', content: compressed.summary },
                ...context.messages.slice(-this.agentEntity.ContextCompressionMessageRetentionCount)
            ]
        };
    }
}
```

## API Reference

### BaseAgent Class

The foundation class for all AI agents.

#### Constructor
```typescript
constructor(agentEntity?: AIAgentEntity)
```

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `agentEntity` | `AIAgentEntity` | The database entity containing agent configuration |
| `isInitialized` | `boolean` | Whether the agent has been initialized |
| `actions` | `AIAgentActionEntity[]` | Available actions for this agent |
| `notes` | `AIAgentNoteEntity[]` | Learning notes accumulated by the agent |

#### Methods

##### `initialize(): Promise<void>`
Initializes the agent, loading configuration and preparing for execution.

##### `execute(context: AgentContext): Promise<AgentResult>`
Executes the agent with the provided context.

**Parameters:**
- `context: AgentContext` - The execution context containing conversation history and metadata

**Returns:** `Promise<AgentResult>` - The agent's response and metadata

##### `handleAction(actionName: string, params: any): Promise<any>`
Handles agent-specific actions.

**Parameters:**
- `actionName: string` - The name of the action to execute
- `params: any` - Parameters for the action

**Returns:** `Promise<any>` - The action result

##### `addNote(content: string, type: string): Promise<void>`
Adds a learning note for the agent.

**Parameters:**
- `content: string` - The note content
- `type: string` - The type of note (e.g., 'learning', 'error', 'improvement')

### Types and Interfaces

#### AgentContext
```typescript
interface AgentContext {
    conversationId: string;
    messages: Message[];
    metadata?: Record<string, any>;
    parentContext?: AgentContext;
}
```

#### AgentResult
```typescript
interface AgentResult {
    response: string;
    success: boolean;
    metadata?: {
        tokensUsed?: number;
        executionTimeMs?: number;
        modelUsed?: string;
        childAgentResults?: AgentResult[];
    };
    error?: string;
}
```

#### Message
```typescript
interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
    timestamp?: Date;
    metadata?: Record<string, any>;
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

🚧 **Under Active Development** - This package is currently being built and will house all functionality for the MJ AI Agent framework. The `BaseAgent` class and core infrastructure are being implemented to provide the foundation for all agentic execution work in the MemberJunction ecosystem.

### Current Implementation Status

- ✅ Package structure and configuration
- 🚧 BaseAgent class implementation (in progress)
- 📋 ConductorAgent for hierarchical composition (planned)
- 📋 Context management and compression (planned)
- 📋 Action framework integration (planned)
- 📋 Learning and note system (planned)
- 📋 Execution logging and analytics (planned)

### Roadmap

1. **Phase 1**: Core BaseAgent implementation with basic execution
2. **Phase 2**: Hierarchical agent composition and conductor pattern
3. **Phase 3**: Advanced context management and compression
4. **Phase 4**: Action framework and extensibility
5. **Phase 5**: Learning system and performance optimization

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