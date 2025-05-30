# @memberjunction/ai-prompts

The MemberJunction AI Prompts package provides sophisticated prompt management, execution, and optimization capabilities within the MemberJunction ecosystem. This package handles advanced prompt features including template rendering, parallel execution, intelligent caching, and result selection strategies.

[![npm version](https://badge.fury.io/js/%40memberjunction%2Fai-prompts.svg)](https://www.npmjs.com/package/@memberjunction/ai-prompts)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

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

> **Note**: This package uses MemberJunction's class registration system. The package automatically registers its classes on import to ensure proper functionality within the MJ ecosystem.

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
const result = await runner.ExecutePrompt(params);

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
const result = await runner.ExecutePrompt({
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
const result = await runner.ExecutePrompt({
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

const result = await runner.ExecutePrompt({
    prompt: multiModelPrompt,
    data: { query: "Analyze this data pattern" },
    contextUser: currentUser
});

// When using parallel execution, the system automatically selects the best result
console.log(`Final result: ${result.result}`);
console.log(`Execution time: ${result.executionTimeMS}ms`);
console.log(`Total tokens used: ${result.tokensUsed}`);

// The promptRun entity contains metadata about parallel execution in its Messages field
if (result.promptRun?.Messages) {
    const metadata = JSON.parse(result.promptRun.Messages);
    if (metadata.parallelExecution) {
        console.log(`Parallelization mode: ${metadata.parallelExecution.parallelizationMode}`);
        console.log(`Total tasks: ${metadata.parallelExecution.totalTasks}`);
        console.log(`Successful tasks: ${metadata.parallelExecution.successfulTasks}`);
    }
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
const result = await runner.ExecutePrompt({
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

const result = await runner.ExecutePrompt({
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

The package includes sophisticated parallel execution capabilities through specialized classes that work together to manage complex multi-model executions.

> **Note**: The ExecutionPlanner and ParallelExecutionCoordinator are internal components used by AIPromptRunner. They are not directly exposed in the public API but understanding their operation helps in configuring prompts effectively.

### ExecutionPlanner (Internal)

The `ExecutionPlanner` class analyzes prompt configuration and creates optimal execution strategies:

**Key Responsibilities:**
- Analyzes parallelization modes (None, StaticCount, ConfigParam, ModelSpecific)
- Creates execution groups for coordinated processing
- Determines optimal task distribution based on model availability
- Assigns priorities and manages execution order
- Handles model selection based on power rankings and configuration

**Execution Plan Creation:**
- For `StaticCount`: Creates N parallel tasks using available models
- For `ConfigParam`: Uses configuration parameters to determine parallel count
- For `ModelSpecific`: Uses AIPromptModel entries to define exact model usage
- Supports execution groups for sequential/parallel hybrid execution

### ParallelExecutionCoordinator (Internal)

The `ParallelExecutionCoordinator` orchestrates the actual execution of tasks created by the ExecutionPlanner:

**Core Features:**
- Manages concurrency limits (default: 5 concurrent executions)
- Implements retry logic with exponential backoff
- Handles partial result collection when some tasks fail
- Provides comprehensive execution metrics and timing
- Supports fail-fast mode for critical operations

**Execution Flow:**
1. Groups tasks by execution group number
2. Executes groups sequentially (group 0, then 1, then 2, etc.)
3. Within each group, executes tasks in parallel up to concurrency limit
4. Collects and aggregates results from all executions
5. Applies result selection strategy if multiple results available

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
const result = await runner.ExecutePrompt(modelSpecificExecution);
```

## Performance Monitoring & Analytics

Comprehensive tracking and analytics for prompt executions:

```typescript
// Execution results include detailed metrics
const result = await runner.ExecutePrompt(params);

console.log(`Execution time: ${result.executionTimeMS}ms`);
console.log(`Tokens used: ${result.tokensUsed}`);

// The AIPromptRunResult includes execution tracking
if (result.promptRun) {
    console.log(`Prompt Run ID: ${result.promptRun.ID}`);
    console.log(`Model used: ${result.promptRun.ModelID}`);
    console.log(`Configuration: ${result.promptRun.ConfigurationID}`);
}
```

## API Reference

### Exported Classes and Types

The package exports the following public API:

```typescript
export { AIPromptCategoryEntityExtended } from './AIPromptCategoryExtended';
export { AIPromptRunner, AIPromptParams, AIPromptRunResult } from './AIPromptRunner';
```

### AIPromptRunner Class

Handles execution of AI prompts with advanced parallel processing, template rendering, and result validation.

#### Methods

- `ExecutePrompt(params: AIPromptParams): Promise<AIPromptRunResult>`: Execute a prompt with full feature support including template rendering, model selection, parallel execution, and output validation

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
    templateData?: any;               // Additional template data that augments the main data context
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

### Key Interfaces and Types

```typescript
interface AIPromptRunResult {
    success: boolean;                       // Whether the execution was successful
    rawResult?: string;                     // The raw result from the AI model
    result?: any;                          // The parsed/validated result based on OutputType
    errorMessage?: string;                  // Error message if execution failed
    promptRun?: AIPromptRunEntity;          // The AIPromptRun entity that was created for tracking
    executionTimeMS?: number;              // Total execution time in milliseconds
    tokensUsed?: number;                   // Tokens used in the execution
    validationResult?: ValidationResult;    // Validation result if output validation was performed
}

// Parallelization strategies supported by the system
type ParallelizationStrategy = 'None' | 'StaticCount' | 'ConfigParam' | 'ModelSpecific';

// Result selection methods for choosing best result from parallel executions
type ResultSelectionMethod = 'First' | 'Random' | 'PromptSelector' | 'Consensus';
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
const result = await runner.ExecutePrompt({ prompt, data, contextUser });
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
        
        const result = await this.promptRunner.ExecutePrompt({
            prompt: prompt,
            data: context.data,
            contextUser: context.user
        });
        
        return this.formatAgentResult(result);
    }
}
```

## Dependencies

- `@memberjunction/core` (v2.43.0): MemberJunction core library
- `@memberjunction/global` (v2.43.0): MemberJunction global utilities  
- `@memberjunction/core-entities` (v2.43.0): MemberJunction entity definitions
- `@memberjunction/ai` (v2.43.0): AI abstractions and interfaces
- `@memberjunction/aiengine` (v2.43.0): AI model management and basic operations
- `@memberjunction/templates` (v2.43.0): Template rendering system
- `dotenv` (^16.4.1): Environment variable management
- `rxjs` (^7.8.1): Reactive programming support

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
const result = await runner.ExecutePrompt({
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

## Troubleshooting

### Common Issues

1. **"No suitable model found" Error**
   - Ensure AIEngine.Instance.Config() is called before using prompts
   - Verify prompt has active AIPromptModel associations or proper model selection configuration
   - Check that models meet MinPowerRank requirements

2. **Template Rendering Failures**
   - Verify template exists and is associated with the prompt
   - Ensure template data contains all required variables
   - Check template syntax for Handlebars errors

3. **Parallel Execution Not Working**
   - Confirm ParallelizationMode is set to a value other than 'None'
   - For ModelSpecific mode, ensure AIPromptModel entries exist
   - Check that multiple suitable models are available

4. **Output Validation Errors**
   - Ensure OutputType matches the expected result format
   - Provide a valid OutputExample for structured data
   - Consider increasing MaxRetries for complex outputs

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