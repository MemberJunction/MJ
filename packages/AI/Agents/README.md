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
- **📡 Streaming Support**: Real-time streaming of execution progress and AI model responses
- **🛑 Cancellation Support**: Graceful cancellation of long-running operations with AbortSignal

## Installation

```bash
npm install @memberjunction/ai-agents
```

### Type Organization Update (2025)

As part of improving code organization and reducing circular dependencies:
- **This package** now contains all agent-specific types:
  - Agent execution types (`AgentExecutionParams`, `AgentExecutionResult`, etc.)
  - Agent runner types (`AgentRunnerParams`, `AgentRunnerResult`)
  - Conductor types (`ConductorDecisionInput`, `ConductorDecisionResponse`)
  - Progress and streaming callbacks
- **Base AI types** are imported from `@memberjunction/ai` (Core)
- **Prompt types** are imported from `@memberjunction/ai-prompts`
- **Engine types** (agent type definitions) are imported from `@memberjunction/aiengine`

## Requirements

- Node.js 16+
- MemberJunction Core libraries
- [@memberjunction/ai](../Core/README.md) for base AI types and interfaces
- [@memberjunction/ai-prompts](../Prompts/README.md) for advanced prompt management
- [@memberjunction/aiengine](../Engine/README.md) for AI model orchestration and agent type definitions

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

### Streaming and Progress Tracking

The AI Agents framework supports real-time streaming of execution progress and AI model responses:

```typescript
import { AgentRunner } from '@memberjunction/ai-agents';

const runner = new AgentRunner();

// Execute with streaming and progress callbacks
const result = await runner.RunAgent({
    agent: myAgent,
    conversationMessages: messages,
    contextUser: user,
    
    // Progress callback for execution status updates
    onProgress: (progress) => {
        console.log(`[${progress.percentage}%] ${progress.step}: ${progress.message}`);
        
        // Progress steps include:
        // - initialization: Setting up the agent
        // - validation: Validating agent configuration
        // - prompt_execution: Executing AI prompts
        // - action_execution: Running actions
        // - subagent_execution: Running sub-agents
        // - decision_processing: Processing next steps
        // - finalization: Completing execution
    },
    
    // Streaming callback for real-time AI responses
    onStreaming: (chunk) => {
        process.stdout.write(chunk.content);
        
        if (chunk.isComplete) {
            console.log('\n--- Stream complete ---');
        }
        
        // Additional metadata available:
        // - chunk.stepType: 'prompt', 'action', 'subagent', or 'chat'
        // - chunk.stepEntityId: ID of the step being executed
        // - chunk.modelName: AI model producing the content (for prompts)
    }
});
```

### Cancellation Support

Long-running agent operations can be cancelled gracefully using AbortSignal:

```typescript
import { AgentRunner } from '@memberjunction/ai-agents';

const runner = new AgentRunner();
const controller = new AbortController();

// Set up cancellation after 30 seconds
setTimeout(() => {
    console.log('Cancelling agent execution...');
    controller.abort();
}, 30000);

try {
    const result = await runner.RunAgent({
        agent: myAgent,
        conversationMessages: messages,
        contextUser: user,
        cancellationToken: controller.signal,
        onProgress: (progress) => {
            console.log(`Progress: ${progress.message}`);
        }
    });
    
    if (result.cancelled) {
        console.log('Execution was cancelled:', result.cancellationReason);
    }
} catch (error) {
    if (controller.signal.aborted) {
        console.log('Operation cancelled by user');
    } else {
        console.error('Execution error:', error);
    }
}

// Cancellation is checked at multiple points:
// - Before starting execution
// - After initialization
// - Before each execution step
// - After prompt/action/sub-agent completion
// The agent run is properly marked as 'Cancelled' in the database
```

### Context Propagation (New in v2.51.0)

The AI Agents framework now supports type-safe context propagation throughout the execution hierarchy. This allows runtime-specific information to flow from agents to sub-agents and actions without being part of the formal parameters.

**Note**: Context typing is now done at the parameter level rather than the class level, providing better flexibility and type inference.

#### Basic Context Usage

```typescript
import { BaseAgent, ExecuteAgentParams } from '@memberjunction/ai-agents';

// Define your context type
interface MyAgentContext {
    apiEndpoint: string;
    apiKey: string;
    environment: 'dev' | 'staging' | 'prod';
    userPreferences: {
        language: string;
        timezone: string;
    };
}

// Execute agent with typed context
const agent = new BaseAgent();
const params: ExecuteAgentParams<MyAgentContext> = {
    agent: myAgentEntity,
    conversationMessages: messages,
    contextUser: currentUser,
    context: {
        apiEndpoint: 'https://api.example.com',
        apiKey: process.env.API_KEY,
        environment: 'prod',
        userPreferences: {
            language: 'en',
            timezone: 'UTC'
        }
    }
};
const result = await agent.Execute(params);
```

#### Context Flow Through Hierarchy

Context automatically flows through the entire execution hierarchy:

```typescript
// Parent agent execution
const parentParams: ExecuteAgentParams<MyContext> = {
    agent: parentAgentEntity,
    conversationMessages: messages,
    context: myContext  // Context passed here
};
const parentResult = await parentAgent.Execute(parentParams);

// When parent executes sub-agents, context flows automatically
// Sub-agents receive the same context without manual passing

// When agents execute actions, context flows to them as well
// Actions can access context via params.Context
```

#### Using Context in Custom Agents

```typescript
export class CustomAgent extends BaseAgent {
    protected async preparePromptParams(
        agentType: AIAgentTypeEntity,
        systemPrompt: any,
        childPrompt: any,
        params: ExecuteAgentParams<MyAgentContext>
    ): Promise<AIPromptParams> {
        const promptParams = await super.preparePromptParams(agentType, systemPrompt, childPrompt, params);
        
        // Access typed context
        if (params.context) {
            promptParams.data.apiEndpoint = params.context.apiEndpoint;
            promptParams.data.environment = params.context.environment;
            
            // Use context to modify behavior
            if (params.context.environment === 'dev') {
                promptParams.data.debugMode = true;
            }
        }
        
        return promptParams;
    }
}
```

#### Using Context in Actions

```typescript
import { BaseAction, RunActionParams } from '@memberjunction/actions';

export class APICallAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams<MyAgentContext>): Promise<ActionResultSimple> {
        // Access typed context
        const endpoint = params.Context?.apiEndpoint;
        const apiKey = params.Context?.apiKey;
        
        if (!endpoint || !apiKey) {
            return {
                Success: false,
                ResultCode: 'MISSING_CONTEXT',
                Message: 'Required API configuration not found in context'
            };
        }
        
        // Use context for action execution
        const response = await fetch(endpoint, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept-Language': params.Context.userPreferences.language
            }
        });
        
        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: 'API call completed'
        };
    }
}
```

#### Common Context Use Cases

1. **Environment Configuration**
   ```typescript
   interface EnvironmentContext {
       apiEndpoints: Record<string, string>;
       featureFlags: Record<string, boolean>;
       debugMode: boolean;
   }
   ```

2. **User Session Information**
   ```typescript
   interface SessionContext {
       sessionId: string;
       correlationId: string;
       userPreferences: UserPreferences;
       authTokens: Record<string, string>;
   }
   ```

3. **Runtime Service Connections**
   ```typescript
   interface ServiceContext {
       databaseConnection: string;
       cacheClient: CacheClient;
       messageQueue: QueueService;
   }
   ```

#### Best Practices for Context Usage

1. **Define Clear Context Types**: Create well-defined interfaces for your context objects
2. **Keep Context Focused**: Include only runtime-specific data, not business logic parameters
3. **Avoid Sensitive Data**: While context can contain API keys when necessary, minimize sensitive data exposure
4. **Document Context Requirements**: Clearly document what context your agents and actions expect
5. **Provide Defaults**: Handle cases where context might be undefined or partial

#### Context vs Parameters

Use **Context** for:
- Environment-specific configuration
- Runtime credentials and connections
- User session information
- Feature flags and toggles
- Cross-cutting concerns

Use **Parameters** for:
- Business logic inputs
- Data to be processed
- Explicit action configuration
- Values that should be logged/audited
- Data that varies per execution

## Extending BaseAgent

The BaseAgent class provides a flexible execution pipeline that can be extended and customized through protected methods. This allows subclasses to override specific parts of the execution flow while maintaining the overall architecture.

### Execution Pipeline Overview

The BaseAgent execution pipeline consists of the following overridable methods:

1. **`initializeEngines()`** - Initialize AI and Action engines
2. **`validateAgent()`** - Validate agent readiness
3. **`loadAgentConfiguration()`** - Load agent type and prompts
4. **`preparePromptParams()`** - Prepare hierarchical prompt parameters
5. **`executePrompt()`** - Execute the configured prompts
6. **`processNextStep()`** - Process agent type decisions
7. **`handleActionResults()`** - Handle action execution and recursion
8. **`handleSubAgentResult()`** - Handle sub-agent execution and recursion
9. **`createActionResultMessage()`** - Format action results as chat messages
10. **`createSubAgentResultMessage()`** - Format sub-agent results as chat messages

### Creating Custom Agent Classes

```typescript
import { BaseAgent, ExecuteAgentParams, ExecuteAgentResult } from '@memberjunction/ai-agents';
import { AIPromptParams } from '@memberjunction/ai-prompts';

export class CustomAnalysisAgent extends BaseAgent {
    // Override initialization to add custom setup
    protected async initializeEngines(contextUser?: UserInfo): Promise<void> {
        await super.initializeEngines(contextUser);
        
        // Add custom initialization
        await this.initializeAnalysisTools();
    }
    
    // Override validation to add custom checks
    protected async validateAgent(agent: AIAgentEntity): Promise<ExecuteAgentResult | null> {
        const baseValidation = await super.validateAgent(agent);
        if (baseValidation) return baseValidation;
        
        // Add custom validation
        if (!this.hasRequiredPermissions(agent)) {
            return {
                nextStep: 'failed',
                errorMessage: 'Agent lacks required analysis permissions'
            };
        }
        
        return null;
    }
    
    // Override prompt preparation to inject custom data
    protected async preparePromptParams(
        agentType: AIAgentTypeEntity,
        systemPrompt: any,
        childPrompt: any,
        params: ExecuteAgentParams
    ): Promise<AIPromptParams> {
        const promptParams = await super.preparePromptParams(agentType, systemPrompt, childPrompt, params);
        
        // Add custom context data
        promptParams.data = {
            ...promptParams.data,
            analysisContext: await this.gatherAnalysisContext(),
            historicalData: await this.loadHistoricalData()
        };
        
        return promptParams;
    }
    
    // Override action result formatting
    protected createActionResultMessage(actions: AgentAction[], results: any[]): ChatMessage {
        // Custom formatting for analysis results
        const analysisResults = results.map((result, index) => {
            return {
                action: actions[index].name,
                success: result.Success,
                analysisScore: result.Params?.find(p => p.Name === 'score')?.Value,
                insights: result.Params?.find(p => p.Name === 'insights')?.Value
            };
        });
        
        return {
            role: 'user',
            content: `Analysis completed:\n${JSON.stringify(analysisResults, null, 2)}`
        };
    }
}
```

### Selective Method Overriding

You can override just the methods you need to customize:

```typescript
export class StreamingAgent extends BaseAgent {
    // Only override prompt execution to add streaming
    protected async executePrompt(promptParams: AIPromptParams): Promise<any> {
        // Add streaming configuration
        promptParams.streaming = true;
        promptParams.streamingCallback = (chunk) => {
            this.handleStreamingChunk(chunk);
        };
        
        return await super.executePrompt(promptParams);
    }
    
    private handleStreamingChunk(chunk: string): void {
        // Process streaming response chunks
        console.log('Streaming:', chunk);
    }
}
```

### Customizing Recursion Behavior

Override the action/sub-agent handling methods to customize recursion:

```typescript
export class BatchProcessingAgent extends BaseAgent {
    protected async handleActionResults(
        params: ExecuteAgentParams,
        nextStep: any,
        promptResult: any
    ): Promise<ExecuteAgentResult> {
        // Execute actions
        const actionResults = await this.ExecuteActions(nextStep.actions, params.contextUser);
        
        // Batch results instead of immediate recursion
        if (this.shouldBatchResults(actionResults)) {
            this.batchedResults.push(...actionResults);
            
            // Continue without recursion if batching
            return {
                nextStep: 'retry',
                returnValue: { batching: true, count: this.batchedResults.length }
            };
        }
        
        // Otherwise use default recursion behavior
        return await super.handleActionResults(params, nextStep, promptResult);
    }
}
```

### Advanced Pipeline Customization

For complex scenarios, you can completely override the Execute method while still using the helper methods:

```typescript
export class MultiStageAgent extends BaseAgent {
    public async Execute(params: ExecuteAgentParams): Promise<ExecuteAgentResult> {
        // Stage 1: Initial analysis
        const stage1Result = await this.executeStage1(params);
        if (stage1Result.nextStep === 'failed') return stage1Result;
        
        // Stage 2: Deep processing based on stage 1
        const stage2Params = this.prepareStage2Params(params, stage1Result);
        const stage2Result = await this.executeStage2(stage2Params);
        if (stage2Result.nextStep === 'failed') return stage2Result;
        
        // Stage 3: Synthesis and final execution
        return await this.executeFinalStage(params, stage1Result, stage2Result);
    }
    
    private async executeStage1(params: ExecuteAgentParams): Promise<ExecuteAgentResult> {
        // Use base methods for configuration loading
        const config = await this.loadAgentConfiguration(params.agent);
        if (!config.success) {
            return { nextStep: 'failed', errorMessage: config.errorMessage };
        }
        
        // Custom stage 1 logic...
    }
}
```

### Best Practices for Extending BaseAgent

1. **Always call super methods** when overriding unless completely replacing functionality
2. **Maintain the contract** - return the expected types from overridden methods
3. **Use protected methods** for extensibility rather than duplicating logic
4. **Document overrides** clearly in your subclass
5. **Test thoroughly** - ensure your overrides work with the recursion logic
6. **Handle errors gracefully** - follow the error result pattern
7. **Preserve metadata** - pass through rawResult and other metadata

### Common Extension Patterns

#### Adding Pre/Post Processing
```typescript
protected async executePrompt(promptParams: AIPromptParams): Promise<any> {
    // Pre-processing
    await this.beforePromptExecution(promptParams);
    
    // Execute
    const result = await super.executePrompt(promptParams);
    
    // Post-processing
    await this.afterPromptExecution(result);
    
    return result;
}
```

#### Custom Context Injection
```typescript
protected async preparePromptParams(...args): Promise<AIPromptParams> {
    const params = await super.preparePromptParams(...args);
    
    // Inject custom context
    params.data.customContext = await this.loadCustomContext();
    params.conversationMessages = this.preprocessMessages(params.conversationMessages);
    
    return params;
}
```

#### Conditional Execution Flow
```typescript
protected async processNextStep(
    params: ExecuteAgentParams,
    agentType: AIAgentTypeEntity,
    promptResult: any
): Promise<ExecuteAgentResult> {
    // Check for special conditions
    if (this.shouldUseAlternativeFlow(promptResult)) {
        return await this.executeAlternativeFlow(params, promptResult);
    }
    
    // Otherwise use default flow
    return await super.processNextStep(params, agentType, promptResult);
}
```

## Enhanced Execution Result Structure

The AI Agents framework now provides comprehensive execution tracking through the enhanced `ExecuteAgentResult` type. This structure gives complete visibility into every step of agent execution, including all prompts, actions, sub-agents, and decisions made along the way.

### ExecuteAgentResult

The main result structure returned from agent execution:

```typescript
interface ExecuteAgentResult {
    // Core execution outcome
    success: boolean;                    // Whether the overall execution was successful
    finalStep: BaseAgentNextStep['step']; // The final step type that terminated execution
    returnValue?: any;                   // Optional return value from the agent
    errorMessage?: string;               // Error message if execution failed
    
    // Tracking and history
    agentRun: AIAgentRunEntity;          // Database entity tracking this execution
    executionChain: ExecutionChainStep[]; // Complete chain of execution steps
}
```

### ExecutionChainStep

Each step in the execution chain captures:

```typescript
interface ExecutionChainStep {
    stepEntity: AIAgentRunStepEntity;    // Database entity for this step
    executionType: 'prompt' | 'action' | 'sub-agent' | 'decision' | 'chat' | 'validation';
    executionResult: StepExecutionResult; // The actual result (varies by type)
    nextStepDecision: NextStepDecision;   // What was decided after this step
    startTime: Date;                      // When the step started
    endTime?: Date;                       // When the step completed
    durationMs?: number;                  // Execution duration in milliseconds
}
```

### Step Execution Results

Different execution types have specialized result structures:

#### PromptExecutionResult
```typescript
{
    type: 'prompt';
    promptId: string;
    promptName: string;
    result: AIPromptRunResult;  // Native result from @memberjunction/ai-prompts
}
```

#### ActionExecutionResult
```typescript
{
    type: 'action';
    actionId: string;
    actionName: string;
    result: ActionResult | ActionResultSimple;  // Native result from @memberjunction/actions
}
```

#### SubAgentExecutionResult
```typescript
{
    type: 'sub-agent';
    subAgentId: string;
    subAgentName: string;
    result: ExecuteAgentResult;  // Recursive - full execution result of sub-agent
}
```

### Usage Example

```typescript
const runner = new AgentRunner();
const result = await runner.RunAgent({
    agent: myAgent,
    conversationMessages: messages,
    contextUser: user
});

// Access execution outcome
console.log(`Success: ${result.success}`);
console.log(`Final step: ${result.finalStep}`);
console.log(`Return value:`, result.returnValue);

// Access the agent run record
console.log(`Agent run ID: ${result.agentRun.ID}`);
console.log(`Started at: ${result.agentRun.StartedAt}`);
console.log(`Duration: ${result.agentRun.CompletedAt - result.agentRun.StartedAt}ms`);

// Analyze the execution chain
result.executionChain.forEach((step, index) => {
    console.log(`\nStep ${index + 1}: ${step.executionType}`);
    console.log(`  Name: ${step.stepEntity.StepName}`);
    console.log(`  Duration: ${step.durationMs}ms`);
    console.log(`  Success: ${step.stepEntity.Success}`);
    
    // Access type-specific results
    switch (step.executionResult.type) {
        case 'prompt':
            console.log(`  Prompt: ${step.executionResult.promptName}`);
            console.log(`  Tokens used: ${step.executionResult.result.tokensUsed}`);
            break;
        case 'action':
            console.log(`  Action: ${step.executionResult.actionName}`);
            console.log(`  Result: ${step.executionResult.result.Success}`);
            break;
        case 'sub-agent':
            console.log(`  Sub-agent: ${step.executionResult.subAgentName}`);
            console.log(`  Sub-steps: ${step.executionResult.result.executionChain.length}`);
            break;
    }
    
    // Show what was decided next
    console.log(`  Next decision: ${step.nextStepDecision.decision}`);
    console.log(`  Reasoning: ${step.nextStepDecision.reasoning}`);
});

// Visualize the execution flow
const executionFlow = result.executionChain
    .map(step => `${step.executionType} → ${step.nextStepDecision.decision}`)
    .join(' → ');
console.log(`\nExecution flow: ${executionFlow}`);
```

### Database Persistence

All execution data is automatically persisted to the database:

- **AIAgentRun**: Tracks the overall agent execution
  - Links to parent runs for sub-agent tracking
  - Stores final results and state
  - Tracks timing and success status

- **AIAgentRunStep**: Tracks individual execution steps
  - Links to the parent run
  - Stores step-specific data (input/output)
  - Tracks step timing and success

This enables:
- Historical analysis of agent behavior
- Performance optimization based on real data
- Debugging complex agent interactions
- Compliance and audit trails

### Analyzing Sub-Agent Execution

Sub-agent results are fully recursive, allowing deep analysis:

```typescript
function analyzeExecutionDepth(result: ExecuteAgentResult, depth = 0): void {
    const indent = '  '.repeat(depth);
    console.log(`${indent}Agent: ${result.agentRun.AgentID}`);
    console.log(`${indent}Steps: ${result.executionChain.length}`);
    
    // Find sub-agent executions
    const subAgentSteps = result.executionChain.filter(
        step => step.executionType === 'sub-agent'
    ) as Array<{ executionResult: SubAgentExecutionResult }>;
    
    // Recursively analyze sub-agents
    for (const step of subAgentSteps) {
        analyzeExecutionDepth(step.executionResult.result, depth + 1);
    }
}

// Analyze the entire execution tree
analyzeExecutionDepth(result);
```

### Performance Analysis

Use the execution chain for performance optimization:

```typescript
// Calculate time spent in each type of operation
const timingAnalysis = result.executionChain.reduce((acc, step) => {
    const type = step.executionType;
    acc[type] = (acc[type] || 0) + (step.durationMs || 0);
    return acc;
}, {} as Record<string, number>);

console.log('Time spent by operation type:', timingAnalysis);

// Find slowest steps
const slowestSteps = result.executionChain
    .filter(step => step.durationMs)
    .sort((a, b) => b.durationMs! - a.durationMs!)
    .slice(0, 5);

console.log('Top 5 slowest steps:', slowestSteps.map(s => ({
    name: s.stepEntity.StepName,
    duration: s.durationMs,
    type: s.executionType
})));
```

## Type Exports

The Agents package exports comprehensive types for agent operations:

### Core Agent Types
- `AgentExecutionParams` - Parameters for agent execution
- `AgentExecutionResult` - Result from agent execution
- `BaseAgentNextStep` - Next step decision structure
- `ExecutionChainStep` - Individual step in execution chain

### Agent Runner Types
- `AgentRunnerParams` - Parameters for AgentRunner
- `AgentRunnerResult` - Enhanced result with decision history
- `AgentProgressUpdate` - Progress tracking structure
- `AgentStreamingUpdate` - Streaming content structure

### Conductor Types
- `ConductorDecisionInput` - Input for conductor decisions
- `ConductorDecisionResponse` - Structured decision response
- `ExecutionStep` - Individual execution plan step
- `ConductorDecisionType` - Decision type enumeration

### Factory and Interface Types
- `IAgentFactory` - Factory interface for agent creation
- `BaseAgent` - Base class for all agents
- `ConductorAgent` - Specialized conductor agent class

## Import Examples

```typescript
// Import main classes
import { BaseAgent, ConductorAgent, AgentRunner } from '@memberjunction/ai-agents';
import { GetAgentFactory } from '@memberjunction/ai-agents';

// Import types
import { 
  AgentExecutionParams, 
  AgentExecutionResult,
  AgentRunnerParams,
  AgentRunnerResult,
  ConductorDecisionResponse 
} from '@memberjunction/ai-agents';

// Import base AI types from Core
import { ChatMessage, ChatResult } from '@memberjunction/ai';

// Import prompt types when needed
import { AIPromptParams, AIPromptRunResult } from '@memberjunction/ai-prompts';

// Import entity types
import { AIAgentEntity, AIAgentTypeEntity } from '@memberjunction/core-entities';
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
- `@memberjunction/ai`: ^2.43.0 - Base AI types and interfaces (imported for core types)
- `@memberjunction/aiengine`: ^2.43.0 - AI model orchestration and agent type definitions
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