# @memberjunction/ai-prompts

The MemberJunction AI Prompts package provides sophisticated prompt management, execution, and optimization capabilities within the MemberJunction ecosystem. This package handles advanced prompt features including template rendering, parallel execution, intelligent caching, and result selection strategies.

## Features

- **📝 Advanced Prompt System**: Sophisticated prompt management with template rendering and validation
- **⚡ Parallel Processing**: Multi-model execution with result selection strategies
- **💾 Intelligent Caching**: Vector similarity matching and TTL-based result caching
- **🔄 Template Integration**: Dynamic prompt generation with MemberJunction template system
- **📊 Execution Analytics**: Comprehensive metrics, token usage tracking, and performance monitoring
- **🎯 Result Selection**: AI-powered selection of best results from parallel executions
- **🔧 Output Validation**: Structured output validation with retry logic
- **⚙️ Configuration-Driven**: Metadata-driven prompt configuration and execution

## Installation

```bash
npm install @memberjunction/ai-prompts
```

## Requirements

- Node.js 16+
- MemberJunction Core libraries
- [@memberjunction/aiengine](../Engine/README.md) for model management and basic AI operations
- [@memberjunction/templates](../../Templates/README.md) for template rendering

## Core Architecture

### AIPromptRunner Class

The `AIPromptRunner` class is the central component for executing prompts with advanced features:

```typescript
import { AIPromptRunner, AIPromptParams } from '@memberjunction/ai-prompts';

// Get a prompt from the system
const prompts = AIEngine.Instance.Prompts;
const summaryPrompt = prompts.find(p => p.Name === 'Document Summarization');

// Execute the prompt
const params: AIPromptParams = {
    prompt: summaryPrompt,
    data: { 
        documentText: "Long document content here...",
        targetLength: "2 paragraphs" 
    },
    contextUser: currentUser
};

const runner = new AIPromptRunner();
const result = await runner.RunPrompt(params);

if (result.success) {
    console.log("Summary:", result.result);
    console.log(`Execution time: ${result.executionTimeMS}ms`);
    console.log(`Tokens used: ${result.totalTokensUsed}`);
} else {
    console.error("Error:", result.error);
}
```

## Quick Start

### 1. Basic Prompt Execution

```typescript
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIEngine } from '@memberjunction/aiengine';

// Initialize the AI Engine
await AIEngine.Instance.Config(false, currentUser);

// Find a prompt
const prompt = AIEngine.Instance.Prompts.find(p => p.Name === 'Text Analysis');

// Execute with data
const runner = new AIPromptRunner();
const result = await runner.RunPrompt({
    prompt: prompt,
    data: { 
        text: "Analyze this sample text for sentiment and key themes.",
        format: "bullet points"
    },
    contextUser: currentUser
});

console.log("Analysis:", result.result);
```

### 2. Template-Driven Prompts

```typescript
// Prompt templates support dynamic data substitution
const templatePrompt = {
    UserMessage: `Analyze the {{entity.EntityType}} record for {{entity.Name}}. 
                 Focus on {{analysisType}} and provide insights about {{entity.Description}}.`
};

// Data context provides template variables
const result = await runner.RunPrompt({
    prompt: templatePrompt,
    data: {
        entity: {
            EntityType: "Customer",
            Name: "Acme Corp",
            Description: "Enterprise software company"
        },
        analysisType: "growth opportunities"
    },
    contextUser: currentUser
});
```

### 3. Parallel Execution with Multiple Models

```typescript
// Execute the same prompt across multiple models in parallel
const multiModelPrompt = prompts.find(p => p.ParallelizationMode === 'ModelSpecific');

const result = await runner.RunPrompt({
    prompt: multiModelPrompt,
    data: { query: "Analyze this data pattern" },
    contextUser: currentUser
});

// Result contains aggregated outputs from all models
console.log(`Executed across ${result.executionResults?.length} models`);
console.log(`Selected result: ${result.result}`);
console.log(`All results available: ${result.allResults?.length}`);

// Examine individual model results
if (result.executionResults) {
    result.executionResults.forEach((execResult, index) => {
        console.log(`Model ${index}: ${execResult.model.Name}`);
        console.log(`  Tokens: ${execResult.totalTokensUsed}`);
        console.log(`  Time: ${execResult.executionTimeMS}ms`);
        console.log(`  Success: ${execResult.success}`);
    });
}
```

## Advanced Features

### Intelligent Caching

The prompt system provides sophisticated caching with vector similarity matching:

```typescript
// Caching is automatically handled based on prompt configuration:
// - EnableCaching: Whether to use caching for this prompt
// - CacheMatchType: 'Exact' or 'Vector' similarity matching
// - CacheTTLSeconds: Time-to-live for cached results
// - CacheMustMatchModel/Vendor/Agent: Cache constraint options

// Vector similarity allows reusing results for semantically similar prompts
// even if the exact text differs

const cachedPrompt = {
    Name: "Smart Summary",
    EnableCaching: true,
    CacheMatchType: "Vector",
    CacheTTLSeconds: 3600,
    CacheSimilarityThreshold: 0.85,
    CacheMustMatchModel: true,
    CacheMustMatchVendor: false
};
```

### Parallel Execution Strategies

The system supports multiple parallelization modes:

```typescript
// Prompts can be configured for parallel execution:
// - ParallelizationMode: 'None', 'StaticCount', 'ConfigParam', 'ModelSpecific'
// - ParallelCount: Number of parallel executions
// - ExecutionGroups: Sequential group execution with parallel tasks within groups

// Example configurations:

// Static parallel count
const staticParallelPrompt = {
    ParallelizationMode: "StaticCount",
    ParallelCount: 3
};

// Configuration-driven count
const configParallelPrompt = {
    ParallelizationMode: "ConfigParam",
    ParallelConfigParam: "analysis_parallel_count"
};

// Model-specific configuration
const modelSpecificPrompt = {
    ParallelizationMode: "ModelSpecific",
    // Uses settings from AIPromptModel entries
};
```

### Result Selection Strategies

```typescript
// The engine supports multiple result selection methods:
// - 'First': Use the first successful result
// - 'Random': Randomly select from successful results  
// - 'PromptSelector': Use AI to select the best result
// - 'Consensus': Select result with highest agreement

// Result selector prompts can be configured to intelligently choose
// the best result from parallel executions

const selectorPrompt = {
    Name: "Best Result Selector",
    PromptText: `
        You are evaluating multiple AI responses to select the best one.
        Original query: {{originalQuery}}
        
        Responses:
        {{#each responses}}
        Response {{@index}}: {{this}}
        {{/each}}
        
        Select the response number (0-based) that is most accurate, helpful, and well-written.
        Return only the number.
    `,
    OutputType: "number"
};

const mainPrompt = {
    ParallelizationMode: "StaticCount",
    ParallelCount: 3,
    ResultSelectorPromptID: selectorPrompt.ID
};
```

### Output Validation

```typescript
// Configure structured output validation
const validatedPrompt = {
    Name: "Structured Analysis",
    OutputType: "object",
    OutputExample: {
        sentiment: "positive|negative|neutral",
        confidence: 0.95,
        keyThemes: ["theme1", "theme2"],
        summary: "Brief summary text"
    },
    ValidationBehavior: "Strict",
    MaxRetries: 3,
    RetryDelayMS: 1000,
    RetryStrategy: "exponential"
};

// Validation is automatically applied
const result = await runner.RunPrompt({
    prompt: validatedPrompt,
    data: { text: "Content to analyze" },
    contextUser: currentUser,
    skipValidation: false // Validation enabled
});

// Result.result will be validated against the expected structure
```

### Template Integration

Advanced template features with the MemberJunction template system:

```typescript
// Complex template with conditionals and loops
const advancedTemplate = {
    PromptText: `
        Analyze the following {{entityType}} records:
        
        {{#each records}}
        {{@index + 1}}. {{this.Name}}
           Status: {{this.Status}}
           {{#if this.Priority}}Priority: {{this.Priority}}{{/if}}
           {{#each this.Tags}}
           - Tag: {{this}}
           {{/each}}
        {{/each}}
        
        {{#if includeRecommendations}}
        Please provide recommendations for improvement.
        {{/if}}
        
        Focus on: {{analysisAreas.join(", ")}}
    `
};

const result = await runner.RunPrompt({
    prompt: advancedTemplate,
    data: {
        entityType: "Customer",
        records: customerData,
        includeRecommendations: true,
        analysisAreas: ["revenue potential", "risk factors", "engagement"]
    },
    contextUser: currentUser
});
```

## Parallel Execution System

The package includes sophisticated parallel execution capabilities:

### ExecutionPlanner

Plans and organizes execution tasks based on prompt configuration:

- Analyzes parallelization modes and model configurations
- Creates execution groups for coordinated processing
- Determines optimal task distribution and priority

### ParallelExecutionCoordinator  

Orchestrates parallel execution across multiple models:

- Manages concurrency limits and resource utilization
- Handles error recovery and retry logic
- Aggregates results and applies selection strategies
- Provides comprehensive execution metrics

### Supported Parallelization Modes

- **None**: Traditional single execution
- **StaticCount**: Fixed number of parallel executions
- **ConfigParam**: Dynamic parallel count from configuration
- **ModelSpecific**: Individual model configurations with execution groups

```typescript
// Example of model-specific parallel configuration
const modelSpecificExecution = {
    prompt: complexPrompt,
    data: analysisData,
    contextUser: currentUser
};

// The system will:
// 1. Query AIPromptModel entries for this prompt
// 2. Group executions by ExecutionGroup
// 3. Execute groups sequentially, models within groups in parallel
// 4. Apply result selection strategy
const result = await runner.RunPrompt(modelSpecificExecution);
```

## Performance Monitoring & Analytics

Comprehensive tracking and analytics for prompt executions:

```typescript
// Execution results include detailed metrics
const result = await runner.RunPrompt(params);

console.log(`Execution time: ${result.executionTimeMS}ms`);
console.log(`Tokens used: ${result.totalTokensUsed}`);
console.log(`Cost estimate: $${result.estimatedCost}`);
console.log(`Cache hit: ${result.cacheHit}`);

// For parallel executions
if (result.executionResults) {
    result.executionResults.forEach((execResult, index) => {
        console.log(`Model ${index}: ${execResult.model.Name}`);
        console.log(`  Tokens: ${execResult.totalTokensUsed}`);
        console.log(`  Time: ${execResult.executionTimeMS}ms`);
        console.log(`  Success: ${execResult.success}`);
        console.log(`  Cache hit: ${execResult.cacheHit}`);
    });
}

// Aggregate analytics
console.log(`Total models used: ${result.modelsUsed}`);
console.log(`Success rate: ${result.successRate}%`);
console.log(`Cache efficiency: ${result.cacheEfficiency}%`);
```

## API Reference

### AIPromptRunner Class

Handles execution of AI prompts with advanced parallel processing.

#### Methods

- `RunPrompt(params: AIPromptParams)`: Execute a prompt with full feature support
- `ValidatePromptOutput(prompt, result, data?)`: Validate AI output against criteria

#### AIPromptParams Interface

```typescript
interface AIPromptParams {
    prompt: AIPromptEntity;           // The prompt to execute
    data?: any;                       // Template and context data
    modelId?: string;                 // Override model selection
    vendorId?: string;                // Override vendor selection
    configurationId?: string;         // Environment-specific config
    contextUser?: UserInfo;           // User context
    skipValidation?: boolean;         // Skip output validation
}
```

### Extended Entity Classes

#### AIPromptCategoryEntityExtended

Extended prompt category with prompt collection:

```typescript
class AIPromptCategoryEntityExtended extends AIPromptCategoryEntity {
    get Prompts(): AIPromptEntity[];       // Prompts in this category
}
```

### Key Interfaces

```typescript
interface AIPromptResult {
    success: boolean;                       // Execution success
    result?: any;                          // Primary result
    error?: string;                        // Error message
    executionTimeMS?: number;              // Execution duration
    totalTokensUsed?: number;              // Total tokens consumed
    estimatedCost?: number;                // Estimated cost
    cacheHit?: boolean;                    // Whether result was cached
    executionResults?: ModelExecutionResult[]; // Individual model results
    allResults?: any[];                    // All results before selection
    selectedResultIndex?: number;          // Index of selected result
}

interface ModelExecutionResult {
    model: AIModelEntity;                  // Model used
    vendor: AIVendorEntity;                // Vendor used
    success: boolean;                      // Execution success
    result?: any;                          // Model result
    executionTimeMS: number;               // Execution time
    totalTokensUsed: number;               // Tokens used
    estimatedCost: number;                 // Cost estimate
    cacheHit: boolean;                     // Cache hit status
    error?: string;                        // Error if failed
}
```

## Integration with Other Packages

### With AI Engine

The Prompts package builds on the AI Engine for basic functionality:

```typescript
// AI Engine provides model management and basic operations
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';

// Initialize AI Engine first
await AIEngine.Instance.Config(false, currentUser);

// Access prompts managed by AI Engine
const prompts = AIEngine.Instance.Prompts;
const prompt = prompts.find(p => p.Name === 'Your Prompt');

// Use Prompts package for advanced execution
const runner = new AIPromptRunner();
const result = await runner.RunPrompt({ prompt, data, contextUser });
```

### With AI Agents

AI Agents can leverage the prompt system for sophisticated operations:

```typescript
// Agents use prompts for their intelligence
import { BaseAgent } from '@memberjunction/ai-agents';
import { AIPromptRunner } from '@memberjunction/ai-prompts';

class IntelligentAgent extends BaseAgent {
    private promptRunner = new AIPromptRunner();
    
    async execute(context: AgentContext): Promise<AgentResult> {
        const prompt = this.getPromptForContext(context);
        
        const result = await this.promptRunner.RunPrompt({
            prompt: prompt,
            data: context.data,
            contextUser: context.user
        });
        
        return this.formatAgentResult(result);
    }
}
```

## Dependencies

- `@memberjunction/core`: MemberJunction core library
- `@memberjunction/global`: MemberJunction global utilities  
- `@memberjunction/core-entities`: MemberJunction entity definitions
- `@memberjunction/ai`: AI abstractions and interfaces
- `@memberjunction/aiengine`: AI model management and basic operations
- `@memberjunction/templates`: Template rendering system
- `rxjs`: Reactive programming support

## Related Packages

- `@memberjunction/aiengine`: Core AI engine and model management
- `@memberjunction/ai-agents`: Advanced agent framework built on prompts
- `@memberjunction/templates`: Template rendering for dynamic content

## Migration Guide

### From AI Engine Simple Completions

For cases requiring more sophisticated prompt management:

```typescript
// Old: Simple LLM completion (still valid for basic cases)
const response = await AIEngine.Instance.SimpleLLMCompletion(
    "Analyze this data",
    currentUser,
    "You are a data analyst"
);

// New: Advanced prompt with caching, validation, and parallel execution
const prompt = {
    Name: "Data Analysis",
    PromptText: "Analyze this data: {{data}}",
    EnableCaching: true,
    ParallelizationMode: "StaticCount",
    ParallelCount: 2,
    OutputType: "object",
    ValidationBehavior: "Strict"
};

const runner = new AIPromptRunner();
const result = await runner.RunPrompt({
    prompt: prompt,
    data: { data: "your data here" },
    contextUser: currentUser
});
```

## Best Practices

1. **Enable Caching**: Use intelligent caching for expensive operations
2. **Validate Outputs**: Always specify expected output types for critical operations
3. **Use Templates**: Leverage template system for dynamic prompts
4. **Monitor Performance**: Track token usage and execution times
5. **Parallel Wisely**: Use parallel execution for independent tasks, not dependent ones
6. **Handle Errors**: Implement proper retry logic and error handling

## License

ISC

---

## Advanced Configuration

### Cache Configuration

```typescript
const cacheOptimizedPrompt = {
    EnableCaching: true,
    CacheMatchType: "Vector",           // Vector similarity matching
    CacheTTLSeconds: 3600,             // 1 hour cache
    CacheSimilarityThreshold: 0.9,     // High similarity required
    CacheMustMatchModel: true,         // Model must match
    CacheMustMatchVendor: false,       // Vendor can differ
    CacheMustMatchAgent: false,        // Agent can differ
    CacheMustMatchConfig: true         // Configuration must match
};
```

### Model Selection Strategies

```typescript
// By power ranking
const powerBasedPrompt = {
    SelectionStrategy: "ByPower",
    PowerPreference: "Highest",        // or "Lowest"
    MinPowerRank: 80                   // Minimum capability required
};

// Specific models
const specificModelsPrompt = {
    SelectionStrategy: "Specific",
    // Models defined in AIPromptModel entries
};

// Default system selection
const defaultPrompt = {
    SelectionStrategy: "Default"
};
```

For additional configuration options and advanced use cases, refer to the source code and entity definitions in the MemberJunction core system.