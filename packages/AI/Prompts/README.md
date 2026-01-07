# @memberjunction/ai-prompts

Advanced AI prompt execution engine with hierarchical template composition, intelligent model selection, parallel execution, output validation, and comprehensive execution tracking.

> **Note on Parameters**: This package uses the parameter types defined in `@memberjunction/ai`. For a complete reference of available LLM parameters (temperature, topP, topK, etc.), see the [Parameter Reference](../Core/README.md#parameter-reference) in the AI Core documentation.

> **Authentication**: For details on how AI provider credentials are resolved, including the hierarchical credential system, integration with encrypted credentials, and legacy environment variable support, see the [AI Authentication Guide](./AI-AUTHENTICATION.md).

[![npm version](https://badge.fury.io/js/%40memberjunction%2Fai-prompts.svg)](https://www.npmjs.com/package/@memberjunction/ai-prompts)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

## Key Features

### 🎯 Effort Level Control
Granular control over AI model reasoning effort through a 1-100 integer scale. Higher values request more thorough reasoning and analysis from AI models that support effort levels.

#### Effort Level Hierarchy
The effort level is resolved using the following precedence (highest to lowest priority):

1. **`AIPromptParams.effortLevel`** - Runtime override (highest priority)
2. **`AIPrompt.EffortLevel`** - Individual prompt setting (lower priority)
3. **Provider default** - Model's natural behavior (lowest priority)

#### Provider Support
Different AI providers map the 1-100 scale to their specific parameters:
- **OpenAI**: Maps to `reasoning_effort` (1-33=low, 34-66=medium, 67-100=high)
- **Anthropic**: Maps to thinking mode with token budgets (1-100 → 25K-2M tokens)
- **Groq**: Maps to experimental `reasoning_effort` parameter
- **Gemini**: Controls reasoning mode intensity

```typescript
const params = new AIPromptParams();
params.prompt = myPrompt;
params.effortLevel = 85; // High effort for thorough analysis

const result = await AIPromptRunner.RunPrompt(params);
```

### 🛡️ Model Selection & Intelligent Failover

The AI Prompts system provides sophisticated model selection with instant failover across models and vendors. Configure explicit model/vendor priorities using `AIPromptModel` records, and the system automatically tries all candidates in order when errors occur.

#### Selection Strategies

**`SelectionStrategy='Specific'`** (Recommended for production)
- Use explicit `AIPromptModel` configuration for complete control
- Configuration-specific models tried before universal fallbacks
- Priority determines order (higher number = tried first)
- Instant failover to next candidate on any error

**`SelectionStrategy='ByPower'`**
- Automatically selects models based on `PowerRank`
- Use `PowerPreference`: `Highest`, `Lowest`, or `Balanced`

**`SelectionStrategy='Default'`**
- Uses model type filtering and power ranking

#### Model Ranking Algorithm (Specific Strategy)

When using `SelectionStrategy='Specific'`, candidates are prioritized using clear, predictable rules:

```mermaid
sequenceDiagram
    participant User as User Request
    participant Engine as AIPromptRunner
    participant DB as AIPromptModel Table
    participant Exec as Execution

    User->>Engine: Execute Prompt with ConfigurationID
    Engine->>DB: Get AIPromptModel records
    DB-->>Engine: Return all records for prompt

    Note over Engine: Filter Phase
    Engine->>Engine: Keep: ConfigurationID match OR NULL
    Engine->>Engine: Exclude: Different ConfigurationID

    Note over Engine: Sort Phase (2-level)
    Engine->>Engine: 1. Config-match before Universal
    Engine->>Engine: 2. Priority DESC within group

    Note over Engine: Expand Phase
    loop For each AIPromptModel
        alt VendorID specified
            Engine->>Engine: Create 1 candidate (Model+Vendor)
        else VendorID is NULL
            Engine->>Engine: Create N candidates (all vendors)
            Engine->>Engine: Sort by AIModelVendor.Priority DESC
        end
    end

    Engine->>Exec: Try candidates in order

    loop Instant Failover
        Exec->>Exec: Try Candidate N
        alt Success
            Exec-->>User: Return result
        else Recoverable Error
            Exec->>Exec: Try Candidate N+1 (instant)
        else Fatal Error
            Exec-->>User: Fail immediately
        end
    end
```

#### Configuration Rules

**Priority Precedence:**
1. **Configuration-specific** models (matching `ConfigurationID`) - Always tried first
2. **Universal** models (`ConfigurationID = NULL`) - Fallback options
3. Within each group: **Higher Priority number** tried first

**Configuration Filtering:**
- If `ConfigurationID` provided: Use matching config + universal (NULL) models
- If NO `ConfigurationID`: Use ONLY universal (NULL) models
- Models with DIFFERENT `ConfigurationID` are EXCLUDED

**Vendor Expansion:**
- `AIPromptModel.VendorID` specified → Single candidate (exact model+vendor)
- `AIPromptModel.VendorID = NULL` → Multiple candidates (all vendors for that model, sorted by `AIModelVendor.Priority DESC`)

#### Example Configuration

```sql
-- Example: Production prompt with config-specific and universal fallbacks
INSERT INTO AIPromptModel (PromptID, ModelID, VendorID, ConfigurationID, Priority, Status) VALUES
  -- Config-specific models (tried first, regardless of priority number)
  (@promptId, @gpt4Id,    @openaiId,     @prodConfigId, 5,  'Active'),
  (@promptId, @gpt4Id,    @azureId,      @prodConfigId, 3,  'Active'),

  -- Universal fallbacks (tried after config-specific, despite higher priority numbers)
  (@promptId, @claudeId,  @anthropicId,  NULL,          10, 'Active'),
  (@promptId, @geminiId,  @googleId,     NULL,          8,  'Active');

-- Example: Multi-vendor support for same model
INSERT INTO AIPromptModel (PromptID, ModelID, VendorID, ConfigurationID, Priority, Status) VALUES
  (@promptId, @gpt4Id,    NULL,          @prodConfigId, 10, 'Active');
  -- VendorID=NULL expands to all vendors (OpenAI, Azure, Groq)
  -- Vendors sorted by AIModelVendor.Priority
```

**Execution order for above config with ConfigurationID=@prodConfigId:**
1. GPT-4/OpenAI (Config match, Priority 5)
2. GPT-4/Azure (Config match, Priority 3)
3. GPT-4/OpenAI (From VendorID=NULL expansion, highest AIModelVendor.Priority)
4. GPT-4/Azure (From VendorID=NULL expansion)
5. GPT-4/Groq (From VendorID=NULL expansion, lowest AIModelVendor.Priority)
6. Claude/Anthropic (Universal fallback, Priority 10)
7. Gemini/Google (Universal fallback, Priority 8)

#### Failover Behavior

**Instant Failover** - No delays between candidates
- Authentication errors → Filters out all candidates from failed vendor
- Fatal errors → Stops immediately
- Recoverable errors → Tries next candidate instantly

**Validation Retry** - After all candidates exhausted
- If all candidates fail, retries entire list with delays
- Uses `AIPrompt.MaxRetries` and `RetryDelayMode` (Fixed/Linear/Exponential)

**Error Handling:**
```typescript
// SelectionStrategy='Specific' with no candidates throws error
if (strategy === 'Specific' && candidates.length === 0) {
  throw new Error('Please configure AIPromptModel records for this prompt');
}
```

### 🎯 Dynamic Hierarchical Template Composition

#### Why Dynamic Template Composition?

While MemberJunction's template system already supports static template composition (where Template A always includes Templates B and C), the AI Prompts system adds **dynamic template composition** - the ability to inject ANY prompt template into ANY other prompt template at runtime.

**Static Composition (MJ Templates):** Perfect for fixed relationships like email headers/footers
```liquid
<!-- Email template always includes same header -->
{% include 'email-header' %}
{{ content }}
{% include 'email-footer' %}
```

**Dynamic Composition (AI Prompts):** Essential for flexible runtime relationships
```typescript
// Inject ANY child prompt into ANY parent prompt at runtime
const params = new AIPromptParams();
params.prompt = systemPrompt;        // e.g., Agent Type's control flow prompt
params.childPrompts = [
  new ChildPromptParam(agentPrompt, 'agentInstructions')  // Specific agent's prompt
];
// System prompt can use {{ agentInstructions }} to embed the agent's specific logic
```

#### The Agent System Use Case

This dynamic composition is crucial for AI Agents:
- **Agent Types** have **System Prompts** that control execution flow and response format
- **Individual Agents** have their own **specific prompts** with domain logic
- At runtime, any agent's prompt is dynamically injected into its type's system prompt
- This creates a complete prompt combining the control wrapper with agent-specific instructions

```typescript
// Agent Type System Prompt (controls flow)
const systemPrompt = {
  templateText: `You are an AI agent. Follow these instructions:
  
  {{ agentInstructions }}  <!-- Dynamically injected at runtime -->
  
  Respond in JSON format with: { decision: ..., reasoning: ... }`
};

// Individual Agent Prompt (domain logic)
const dataGatherAgent = {
  templateText: `Your role is to gather data from: {{ dataSources }}`
};

// At runtime, compose them dynamically
params.childPrompts = [
  new ChildPromptParam(dataGatherAgent, 'agentInstructions')
];
```

### 🔄 System Placeholders
Automatically inject common values into all templates without manual data passing. Includes date/time, user context, prompt metadata, and more.

```liquid
Current user: {{ _USER_NAME }}
Date: {{ _CURRENT_DATE }}
Expected output: {{ _OUTPUT_EXAMPLE }}
```

## System Placeholders Reference

System placeholders are automatically available in all AI prompt templates, providing dynamic values like current date/time, prompt metadata, and user context without requiring manual data passing.

### Available System Placeholders

#### Date/Time Placeholders
- `{{ _CURRENT_DATE }}` - Current date in YYYY-MM-DD format
- `{{ _CURRENT_TIME }}` - Current time in HH:MM AM/PM format with timezone
- `{{ _CURRENT_DATE_AND_TIME }}` - Full timestamp with date and time
- `{{ _CURRENT_DAY_OF_WEEK }}` - Current day name (e.g., Monday, Tuesday)
- `{{ _CURRENT_TIMEZONE }}` - Current timezone identifier
- `{{ _CURRENT_TIMESTAMP_UTC }}` - Current UTC timestamp in ISO format

#### Prompt Metadata Placeholders
- `{{ _OUTPUT_EXAMPLE }}` - The expected output example from the prompt configuration
- `{{ _PROMPT_NAME }}` - The name of the current prompt
- `{{ _PROMPT_DESCRIPTION }}` - The description of the current prompt
- `{{ _EXPECTED_OUTPUT_TYPE }}` - The expected output type (string, object, number, etc.)
- `{{ _RESPONSE_FORMAT }}` - The expected response format from the prompt

#### User Context Placeholders
- `{{ _USER_NAME }}` - Current user's full name
- `{{ _USER_EMAIL }}` - Current user's email address
- `{{ _USER_ID }}` - Current user's unique identifier

#### Environment Placeholders
- `{{ _ENVIRONMENT }}` - Current environment (development, staging, production)
- `{{ _API_VERSION }}` - Current API version

### System Placeholder Usage Examples

#### Example 1: Time-Aware Agent Prompt
```liquid
You are an AI assistant helping {{ _USER_NAME }} on {{ _CURRENT_DAY_OF_WEEK }}, {{ _CURRENT_DATE }} at {{ _CURRENT_TIME }}.

User's request: {{ userRequest }}

Please provide a helpful response considering the current time and day.
```

#### Example 2: Agent Type System Prompt with Metadata
```liquid
# Agent Type: Loop Decision Maker

Current execution context:
- Date/Time: {{ _CURRENT_DATE_AND_TIME }}
- User: {{ _USER_NAME }} ({{ _USER_EMAIL }})
- Environment: {{ _ENVIRONMENT }}

## Expected Output Format
{{ _OUTPUT_EXAMPLE }}

## Agent Specific Instructions
{{ agentResponse }}

Based on the above agent response and the expected output format ({{ _EXPECTED_OUTPUT_TYPE }}), determine the next step.
```

#### Example 3: Debug-Friendly Prompt
```liquid
[Debug Info]
- Prompt: {{ _PROMPT_NAME }}
- Description: {{ _PROMPT_DESCRIPTION }}
- Expected Output: {{ _EXPECTED_OUTPUT_TYPE }}
- User ID: {{ _USER_ID }}
- Timestamp: {{ _CURRENT_TIMESTAMP_UTC }}

[Task]
{{ taskDescription }}
```

### Adding Custom System Placeholders

You can add custom system placeholders programmatically:

```typescript
import { SystemPlaceholderManager } from '@memberjunction/ai-prompts';

// Add a custom placeholder
SystemPlaceholderManager.addPlaceholder({
  name: '_ORGANIZATION_NAME',
  description: 'Current organization name',
  getValue: async (params) => {
    // Custom logic to get organization name
    return params.contextUser?.OrganizationName || 'Default Organization';
  }
});

// Or add directly to the array
const placeholders = SystemPlaceholderManager.getPlaceholders();
placeholders.push({
  name: '_CUSTOM_VALUE',
  description: 'My custom value',
  getValue: async (params) => 'custom result'
});
```

### Data Merge Priority Order

When rendering templates, data is merged in this priority order (highest to lowest):
1. Template-specific data (`templateData` parameter)
2. Child template renders (for hierarchical template composition)
3. User-provided data (`data` parameter)
4. System placeholders (lowest priority)

This means users can override system placeholders by providing their own values with the same names.

### ⚡ Parallel Processing
Multi-model execution with intelligent result selection strategies and AI judge ranking for optimal results.

### ✅ Output Validation
JSON schema validation against OutputExample with intelligent retry logic and configurable validation behaviors.

### 🚫 Cancellation Support
AbortSignal integration for graceful execution cancellation with proper cleanup and partial result preservation.

### 📈 Progress & Streaming
Real-time progress callbacks and streaming response support for responsive user interfaces.

### 📊 Comprehensive Tracking
Hierarchical execution logging with the AIPromptRun entity, including token usage, timing, and validation attempts.

### 🤖 Agent Integration
Seamless integration with AI Agents through hierarchical prompts and execution tracking.

### 💾 Intelligent Caching
Vector similarity matching and TTL-based result caching for performance optimization.

### 🔧 Template Integration
Dynamic prompt generation with MemberJunction template system supporting conditionals, loops, and data injection.

## Installation

```bash
npm install @memberjunction/ai-prompts
```

> **Note**: This package uses MemberJunction's class registration system. The package automatically registers its classes on import to ensure proper functionality within the MJ ecosystem.

### Type Organization Update (2025)

As part of improving code organization:
- **This package** now imports base AI types from `@memberjunction/ai` (Core)
- **Prompt-specific types** remain in this package:
  - `AIPromptParams`, `AIPromptRunResult`
  - `ChildPromptParam`, `SystemPlaceholder`
  - Execution callbacks and progress types
- **Agent integration types** are imported from `@memberjunction/ai-agents` when needed

## Requirements

- Node.js 16+
- MemberJunction Core libraries
- [@memberjunction/ai](../Core/README.md) for base AI types and result structures
- [@memberjunction/aiengine](../Engine/README.md) for model management and basic AI operations
- [@memberjunction/templates](../../Templates/README.md) for template rendering

## Core Architecture

### Dynamic vs Static Template Composition

The AI Prompts system introduces **dynamic template composition** that extends beyond MemberJunction's built-in static template features:

#### Static Template Composition (MJ Templates)
MemberJunction's template system supports embedding templates within templates through `{% include %}` directives. This is perfect for fixed relationships:
- Email templates with standard headers/footers
- Report templates with consistent formatting sections
- Any scenario where Template A always includes Templates B and C

#### Dynamic Template Composition (AI Prompts)
The AI Prompts system adds runtime template composition where relationships are determined dynamically:
- **Runtime Flexibility**: Inject ANY prompt template into ANY other prompt template
- **Context-Aware**: Choose which child templates to inject based on runtime conditions
- **Agent Architecture**: Combine system prompts (control flow) with agent prompts (domain logic)
- **Modular Design**: Build complex prompts from reusable components selected at runtime

**Key Difference**: While MJ Templates handle "Template A always includes B", AI Prompts handle "Template A includes X, where X is determined at runtime"

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
    console.log(`Prompt tokens: ${result.promptTokens}`);
    console.log(`Completion tokens: ${result.completionTokens}`);
    console.log(`Total tokens: ${result.tokensUsed}`);
    if (result.cost) {
        console.log(`Cost: ${result.cost} ${result.costCurrency || 'USD'}`);
    }
} else {
    console.error("Error:", result.errorMessage);
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

### 4. Dynamic Template Composition for AI Agents

This example demonstrates the primary use case for dynamic template composition - the AI Agent system:

```typescript
import { AIPromptRunner, ChildPromptParam } from '@memberjunction/ai-prompts';

// Agent Type System Prompt - Controls execution flow and response format
const agentTypeSystemPrompt = {
    Name: "Data Analysis Agent Type System Prompt",
    TemplateID: "system-prompt-template-id",
    // Template contains: "You are an AI agent. {{ agentInstructions }} Respond with JSON..."
};

// Individual Agent Prompt - Contains domain-specific logic
const specificAgentPrompt = {
    Name: "Customer Churn Analysis Agent",
    TemplateID: "churn-agent-template-id",
    // Template contains: "Analyze customer data for churn risk factors..."
};

// At runtime, dynamically compose the prompts
const runner = new AIPromptRunner();
const result = await runner.ExecutePrompt({
    prompt: agentTypeSystemPrompt,  // Parent template
    childPrompts: [
        // Dynamically inject the specific agent's instructions
        new ChildPromptParam(specificAgentPrompt, 'agentInstructions')
    ],
    data: { 
        customerData: analysisData,
        thresholds: { churnRisk: 0.7 }
    },
    contextUser: currentUser
});

// The system executed ONE prompt that combined:
// 1. System prompt wrapper (control flow)
// 2. Specific agent instructions (domain logic)
// 3. Runtime data
console.log("Agent decision:", result.result);
```

**Why This Matters:**
- Different agents can use the SAME system prompt template
- System prompt enforces consistent response format across all agents
- Agent-specific logic is cleanly separated and reusable
- Runtime composition allows flexible agent architectures

### 5. Complete Example with All New Features

```typescript
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIEngine } from '@memberjunction/aiengine';

// Complete example showcasing all Phase 6 enhancements
async function comprehensivePromptExecution() {
    // Initialize
    await AIEngine.Instance.Config(false, currentUser);
    const runner = new AIPromptRunner();
    
    // Set up cancellation (e.g., from user clicking cancel button)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
        console.log('Operation timed out after 2 minutes');
    }, 120000);
    
    try {
        const result = await runner.ExecutePrompt({
            prompt: complexAnalysisPrompt, // ParallelizationMode: 'ModelSpecific'
            data: { 
                document: largeDocument,
                analysisType: 'comprehensive',
                outputFormat: 'structured'
            },
            contextUser: currentUser,
            
            // Enable cancellation
            cancellationToken: controller.signal,
            
            // Track progress throughout execution
            onProgress: (progress) => {
                console.log(`[${progress.step}] ${progress.percentage}% - ${progress.message}`);
                
                // Handle parallel execution progress
                if (progress.metadata?.parallelExecution) {
                    const parallel = progress.metadata.parallelExecution;
                    console.log(`  → Group ${parallel.currentGroup + 1}/${parallel.totalGroups}, Tasks: ${parallel.completedTasks}/${parallel.totalTasks}`);
                }
                
                // Update UI
                updateProgressBar(progress.percentage);
                updateStatusText(progress.message);
            },
            
            // Receive streaming content updates
            onStreaming: (chunk) => {
                if (chunk.isComplete) {
                    console.log(`Streaming complete for ${chunk.modelName}`);
                    finalizeOutput();
                } else {
                    // Show real-time content generation
                    console.log(`[${chunk.modelName}]: ${chunk.content.substring(0, 50)}...`);
                    appendToDisplay(chunk.content, chunk.taskId);
                }
            }
        });
        
        // Clear timeout since we completed successfully
        clearTimeout(timeoutId);
        
        // Handle different result scenarios
        if (result.cancelled) {
            console.log(`Execution cancelled: ${result.cancellationReason}`);
            // May still have partial results available
            if (result.additionalResults && result.additionalResults.length > 0) {
                console.log(`${result.additionalResults.length} partial results available`);
            }
        } else if (result.success) {
            console.log('Execution completed successfully!');
            console.log(`Primary result from ${result.modelInfo?.modelName}: ${result.result}`);
            
            // Analyze judge selection if multiple results
            if (result.ranking && result.judgeRationale) {
                console.log(`Selected as #${result.ranking} by AI judge: ${result.judgeRationale}`);
            }
            
            // Review alternative results from parallel execution
            if (result.additionalResults) {
                console.log(`${result.additionalResults.length} alternative results ranked by judge:`);
                result.additionalResults.forEach((altResult, index) => {
                    console.log(`  ${altResult.ranking}. ${altResult.modelInfo?.modelName}: ${altResult.judgeRationale}`);
                });
            }
            
            // Analyze execution performance using hierarchical logging
            if (result.promptRun?.RunType === 'ParallelParent') {
                await analyzeParallelExecutionPerformance(result.promptRun.ID);
            }
            
            // Check streaming and caching
            if (result.wasStreamed) {
                console.log('Response was streamed in real-time');
            }
            if (result.cacheInfo?.cacheHit) {
                console.log(`Result served from cache: ${result.cacheInfo.cacheSource}`);
            }
        } else {
            console.error(`Execution failed: ${result.errorMessage}`);
        }
        
    } catch (error) {
        clearTimeout(timeoutId);
        console.error('Execution error:', error.message);
    }
}

// Helper function to analyze parallel execution performance
async function analyzeParallelExecutionPerformance(parentPromptRunId: string) {
    // Query hierarchical logs to understand execution breakdown
    console.log('Analyzing parallel execution performance...');
    
    // This would typically be a database query or API call
    // For demonstration, showing the concept:
    const analysisQuery = `
        SELECT 
            pr.RunType,
            pr.ExecutionOrder,
            pr.Success,
            pr.ExecutionTimeMS,
            pr.TokensUsed,
            m.Name as ModelName
        FROM AIPromptRun pr
            JOIN AIModel m ON pr.ModelID = m.ID
        WHERE pr.ParentID = '${parentPromptRunId}' OR pr.ID = '${parentPromptRunId}'
        ORDER BY pr.RunType, pr.ExecutionOrder
    `;
    
    console.log('Performance analysis query:', analysisQuery);
    // Execute query and analyze results...
}

// Execute the comprehensive example
comprehensivePromptExecution().catch(console.error);
```

## Advanced Features

### Intelligent Failover System

The AI Prompt Runner includes a sophisticated failover system that automatically handles provider outages, rate limits, and service degradation. This ensures your AI-powered applications remain resilient and responsive even when individual providers experience issues.

#### How Failover Works

When a prompt execution fails, the system:
1. **Analyzes the error** using the ErrorAnalyzer to determine if failover is appropriate
2. **Selects alternative models/vendors** based on the configured strategy
3. **Applies intelligent delays** with exponential backoff to prevent overwhelming providers
4. **Tracks all attempts** for debugging and analysis
5. **Updates the execution** to use the successful model/vendor combination

#### Failover Configuration

Configure failover behavior at the prompt level:

```typescript
// Database columns added to AIPrompt entity:
FailoverStrategy: 'SameModelDifferentVendor' | 'NextBestModel' | 'PowerRank' | 'None'
FailoverMaxAttempts: number        // Maximum failover attempts (default: 3)
FailoverDelaySeconds: number       // Initial delay between attempts (default: 1)
FailoverModelStrategy: 'PreferSameModel' | 'PreferDifferentModel' | 'RequireSameModel'
FailoverErrorScope: 'All' | 'NetworkOnly' | 'RateLimitOnly' | 'ServiceErrorOnly'
```

#### Failover Strategies Explained

**SameModelDifferentVendor**: Ideal for multi-cloud deployments
```typescript
// Example: Claude from different providers
// Primary: Anthropic API
// Failover 1: AWS Bedrock
// Failover 2: Google Vertex AI
```

**NextBestModel**: Balances capability and availability
```typescript
// Example: Gradual capability reduction
// Primary: GPT-4-turbo
// Failover 1: Claude-3-opus
// Failover 2: GPT-3.5-turbo
```

**PowerRank**: Uses MemberJunction's model power rankings
```typescript
// Automatically selects models based on their PowerRank scores
// Ensures you always get the best available model
```

#### Error Scope Configuration

Control which types of errors trigger failover:

- **All**: Any error triggers failover (most resilient)
- **NetworkOnly**: Only network/connection errors
- **RateLimitOnly**: Only rate limit errors (429 status)
- **ServiceErrorOnly**: Only service errors (500, 503 status)

#### Failover Tracking

The system comprehensively tracks failover attempts in the database:

```typescript
// AIPromptRun entity tracking fields:
OriginalModelID: string           // The initially selected model
OriginalRequestStartTime: Date    // When the request started
FailoverAttempts: number          // Number of failover attempts made
FailoverErrors: string (JSON)     // Detailed error information for each attempt
FailoverDurations: string (JSON)  // Duration of each attempt in milliseconds
TotalFailoverDuration: number     // Total time spent in failover
```

#### Advanced Failover Customization

The AIPromptRunner exposes protected methods for advanced customization:

```typescript
class CustomPromptRunner extends AIPromptRunner {
    // Override to implement custom failover configuration
    protected getFailoverConfiguration(prompt: AIPromptEntity): FailoverConfiguration {
        // Add environment-specific logic
        if (process.env.NODE_ENV === 'production') {
            return {
                strategy: 'SameModelDifferentVendor',
                maxAttempts: 5,
                delaySeconds: 2,
                modelStrategy: 'PreferSameModel',
                errorScope: 'NetworkOnly'
            };
        }
        return super.getFailoverConfiguration(prompt);
    }

    // Override to implement custom failover decision logic
    protected shouldAttemptFailover(
        error: Error,
        config: FailoverConfiguration,
        attemptNumber: number
    ): boolean {
        // Add custom error analysis
        if (error.message.includes('quota_exceeded')) {
            return false; // Don't retry quota errors
        }
        return super.shouldAttemptFailover(error, config, attemptNumber);
    }

    // Override to implement custom delay calculation
    protected calculateFailoverDelay(
        attemptNumber: number,
        baseDelaySeconds: number,
        previousError?: Error
    ): number {
        // Custom backoff strategy
        if (previousError?.message.includes('rate_limit')) {
            return 60000; // 1 minute for rate limits
        }
        return super.calculateFailoverDelay(attemptNumber, baseDelaySeconds, previousError);
    }
}
```

#### Failover Best Practices

1. **Configure Appropriately**: Use `NetworkOnly` or `RateLimitOnly` for production to avoid retrying invalid requests
2. **Set Reasonable Attempts**: 3-5 attempts typically sufficient
3. **Monitor Failover Patterns**: Query the tracking data to identify problematic providers
4. **Test Failover Scenarios**: Simulate provider outages in development
5. **Consider Costs**: Failover may route to more expensive providers

#### Example: Production-Ready Configuration

```typescript
const productionPrompt = {
    Name: "Customer Service Assistant",
    FailoverStrategy: "SameModelDifferentVendor",
    FailoverMaxAttempts: 4,
    FailoverDelaySeconds: 2,
    FailoverModelStrategy: "PreferSameModel",
    FailoverErrorScope: "NetworkOnly",
    // Ensure failover stays within approved models
    MinPowerRank: 85
};

// Query failover performance
const failoverStats = await runView.RunView({
    EntityName: 'MJ: AI Prompt Runs',
    ExtraFilter: `FailoverAttempts > 0 AND RunAt >= '2024-01-01'`,
    OrderBy: 'RunAt DESC'
});

// Analyze which vendors are most reliable
SELECT 
    OriginalModelID,
    ModelID as FinalModelID,
    COUNT(*) as FailoverCount,
    AVG(TotalFailoverDuration) as AvgFailoverTime
FROM AIPromptRun
WHERE FailoverAttempts > 0
GROUP BY OriginalModelID, ModelID
ORDER BY FailoverCount DESC;
```

#### Configuration-Aware Failover

The failover system respects `AIConfiguration` boundaries to ensure environment-specific models stay isolated:

**How It Works:**
- When you specify a `configurationId`, the system builds a candidate list with two priority tiers:
  1. **Configuration-specific models** (priority 5000+): Models assigned to your configuration
  2. **NULL configuration models** (priority 2000+): Universal fallback models available to all configurations

**Example Setup:**
```sql
-- Production Configuration: Only approved production models
INSERT INTO AIPromptModel (PromptID, ModelID, ConfigurationID, Priority)
VALUES
  (@PromptID, @Claude35SonnetID, @ProductionConfigID, 100),
  (@PromptID, @GPT4ID, @ProductionConfigID, 90);

-- Development Configuration: Include experimental models
INSERT INTO AIPromptModel (PromptID, ModelID, ConfigurationID, Priority)
VALUES
  (@PromptID, @LlamaExperimentalID, @DevelopmentConfigID, 100);

-- NULL Configuration: Universal fallbacks for all environments
INSERT INTO AIPromptModel (PromptID, ModelID, ConfigurationID, Priority)
VALUES
  (@PromptID, @Claude3HaikuID, NULL, 100),
  (@PromptID, @GPT35TurboID, NULL, 90);
```

**Failover Behavior:**
```typescript
// Execute with Production configuration
const result = await runner.ExecutePrompt({
    prompt: myPrompt,
    configurationId: productionConfigID,
    data: { query: 'Analyze this' }
});

// Failover order:
// 1. Try Claude 3.5 Sonnet (Production config, priority 5100)
// 2. Try GPT-4 (Production config, priority 5090)
// 3. Try Claude 3 Haiku (NULL config fallback, priority 2100)
// 4. Try GPT-3.5 Turbo (NULL config fallback, priority 2090)
// ✅ Never crosses to Development config models
```

**Key Benefits:**
- **Environment Isolation**: Production models never failover to development/experimental models
- **Controlled Fallback**: Explicit hierarchy from config-specific to universal fallbacks
- **Performance**: Candidate list built once and cached, no rebuilding during failover
- **Consistency**: Same candidate list used for initial selection and all failover attempts

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

### Validation Syntax Cleaning

When using output validation with JSON responses, the AI Prompt Runner automatically handles validation syntax that AI models might inadvertently include in their JSON keys:

```typescript
// Validation syntax in prompts:
// - name?: optional field
// - items:[2+]: array with minimum 2 items
// - status:!empty: non-empty required field
// - count:number: field with type hint

// If the AI returns JSON with validation syntax in keys:
{
  "name?": "John Doe",
  "items:[2+]": ["apple", "banana", "orange"],
  "status:!empty": "active",
  "count:number": 42
}

// The system automatically cleans it to:
{
  "name": "John Doe",
  "items": ["apple", "banana", "orange"],
  "status": "active",
  "count": 42
}
```

**Automatic Cleaning Behavior:**
- **Always enabled** when prompt has `ValidationBehavior` set to `"Strict"` or `"Warn"`
- **Always enabled** when prompt has an `OutputExample` defined
- **Optional** for prompts with `ValidationBehavior` set to `"None"` (via `cleanValidationSyntax` parameter)

This ensures that validation patterns used in prompt templates don't interfere with the actual JSON structure returned by the AI model.

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

### Early Run ID Callback

Get the PromptRun ID immediately after creation for real-time monitoring:

```typescript
const params = new AIPromptParams();
params.prompt = myPrompt;
params.data = { query: 'Analyze this data' };

// Callback fired immediately after PromptRun record is saved
params.onPromptRunCreated = async (promptRunId) => {
    console.log(`Prompt run started: ${promptRunId}`);
    
    // Use cases:
    // - Link to parent records (e.g., AIAgentRunStep.TargetLogID)
    // - Send to monitoring systems
    // - Update UI with tracking info
    // - Start real-time log streaming
};

const result = await runner.ExecutePrompt(params);
```

The callback is invoked:
- **When**: Right after the AIPromptRun record is created and saved
- **Before**: The actual AI model execution begins
- **Error Handling**: Callback errors are logged but don't fail the execution
- **Async Support**: Can be synchronous or asynchronous

## AI Prompt Run Logging

The AI Prompt Runner implements a sophisticated hierarchical logging system that tracks all execution activities in the database through the `AIPromptRun` entity. This system provides complete traceability and analytics for both simple and complex parallel executions.

### Hierarchical Logging Structure

The logging system uses a parent-child relationship model with different `RunType` values to represent the execution hierarchy:

- **`Single`**: Standard single-model execution
- **`ParallelParent`**: Parent record for parallel execution coordinating multiple models
- **`ParallelChild`**: Individual model execution within a parallel run
- **`ResultSelector`**: AI judge execution that selects the best result from parallel executions

### RunType Values and Relationships

```typescript
// Single execution - no parent relationship
{
    RunType: 'Single',
    ParentID: null,
    ExecutionOrder: null
}

// Parallel execution creates a hierarchical structure:
// 1. Parent record coordinates the overall execution
{
    RunType: 'ParallelParent', 
    ParentID: null,
    ExecutionOrder: null
}

// 2. Child records for each model execution
{
    RunType: 'ParallelChild',
    ParentID: '12345-parent-id',
    ExecutionOrder: 0  // Order within execution group
}

// 3. Result selector judges the best result
{
    RunType: 'ResultSelector',
    ParentID: '12345-parent-id', 
    ExecutionOrder: 5  // After all parallel children
}
```

### Database Schema Fields

Key fields in the `AIPromptRun` entity for hierarchical logging:

```sql
-- Core execution tracking
PromptID        uniqueidentifier  -- Prompt being executed
ModelID         uniqueidentifier  -- AI model used
VendorID        uniqueidentifier  -- Vendor providing the model
RunAt           datetime2         -- Execution start time
CompletedAt     datetime2         -- Execution completion time

-- Hierarchical logging fields
RunType         nvarchar(50)      -- 'Single', 'ParallelParent', 'ParallelChild', 'ResultSelector'
ParentID        uniqueidentifier  -- Parent prompt run ID (NULL for top-level)
ExecutionOrder  int               -- Order within parallel execution group

-- Results and metrics
Success         bit               -- Whether execution succeeded
Result          nvarchar(max)     -- Raw result from AI model
ErrorMessage    nvarchar(500)     -- Error message if failed
ExecutionTimeMS int               -- Total execution time
TokensUsed      int               -- Total tokens consumed
TokensPrompt    int               -- Prompt tokens used
TokensCompletion int              -- Completion tokens generated

-- Cost tracking
Cost            decimal(19,8)     -- Cost of this specific execution
CostCurrency    nvarchar(10)      -- ISO 4217 currency code (USD, EUR, etc.)

-- Hierarchical rollup fields (NEW)
TokensUsedRollup        int       -- Total tokens including all children
TokensPromptRollup      int       -- Total prompt tokens including all children
TokensCompletionRollup  int       -- Total completion tokens including all children
-- Note: TotalCost (existing field) serves as the cost rollup

-- Context and configuration
Messages        nvarchar(max)     -- JSON with input data and metadata
ConfigurationID uniqueidentifier  -- Environment configuration used
AgentRunID      uniqueidentifier  -- Links to parent AIAgentRun if applicable
```

### Hierarchical Token and Cost Tracking

The AI Prompts system implements a sophisticated rollup pattern for tracking token usage and costs across hierarchical prompt executions:

#### Prompt Execution Rollup Pattern

For hierarchical prompt executions (parent prompts with child prompts), each node in the tree contains:
- **Direct fields** (`TokensPrompt`, `TokensCompletion`, `Cost`): Usage for just that execution
- **Rollup fields** (`TokensPromptRollup`, `TokensCompletionRollup`, `TotalCost`): Total including all descendants

**Example:**
```
Parent Prompt (100 prompt, 200 completion tokens, $0.05)
├── Child A (50 prompt, 100 completion, $0.02)
└── Child B (75 prompt, 150 completion, $0.03)

Database records:
- Parent: TokensPrompt=100, TokensPromptRollup=225 (100+50+75)
         TokensCompletion=200, TokensCompletionRollup=450 (200+100+150)
         Cost=0.05, TotalCost=0.10 (0.05+0.02+0.03)
- Child A: TokensPrompt=50, TokensPromptRollup=50 (leaf node)
          Cost=0.02, TotalCost=0.02 (leaf node)
- Child B: TokensPrompt=75, TokensPromptRollup=75 (leaf node)
          Cost=0.03, TotalCost=0.03 (leaf node)
```

This enables efficient queries like:
- "What was the total cost of this hierarchical prompt?" → Check root's `TotalCost`
- "How many tokens did this sub-prompt and its children use?" → Check that node's rollup fields
- No complex SQL joins or recursive CTEs needed!

#### Agent Run Token Tracking

The `AIAgentRun` entity tracks aggregate token usage across all prompt executions during an agent's lifecycle:

```sql
-- New fields in AIAgentRun
TotalTokensUsed              int  -- Total tokens (existing)
TotalPromptTokensUsed        int  -- Breakdown: prompt tokens (NEW)
TotalCompletionTokensUsed    int  -- Breakdown: completion tokens (NEW)
TotalCost                    decimal  -- Total cost (existing)

-- Hierarchical agent rollup fields (NEW)
TotalTokensUsedRollup              int  -- Including sub-agent runs
TotalPromptTokensUsedRollup        int  -- Including sub-agent runs
TotalCompletionTokensUsedRollup    int  -- Including sub-agent runs
TotalCostRollup                    decimal  -- Including sub-agent runs
```

**Agent Hierarchy Example:**
```
Parent Agent (A)
├── Own prompts: 200 prompt, 400 completion tokens
├── Sub-Agent (B)
│   └── Own prompts: 100 prompt, 200 completion tokens
└── Sub-Agent (C)
    └── Own prompts: 150 prompt, 300 completion tokens

Rollup values:
- Agent A: TotalPromptTokensUsedRollup = 450 (200+100+150)
          TotalCompletionTokensUsedRollup = 900 (400+200+300)
- Agent B: TotalPromptTokensUsedRollup = 100 (leaf agent)
- Agent C: TotalPromptTokensUsedRollup = 150 (leaf agent)
```

### Querying Hierarchical Log Data

The hierarchical structure enables powerful analytics queries:

```sql
-- Get all executions for a parallel run
SELECT 
    pr.ID,
    pr.RunType,
    pr.ExecutionOrder,
    pr.Success,
    pr.ExecutionTimeMS,
    pr.TokensUsed,
    m.Name as ModelName,
    p.Name as PromptName
FROM AIPromptRun pr
    JOIN AIModel m ON pr.ModelID = m.ID
    JOIN AIPrompt p ON pr.PromptID = p.ID
WHERE pr.ParentID = '12345-parent-id' 
   OR pr.ID = '12345-parent-id'
ORDER BY pr.RunType, pr.ExecutionOrder;

-- Analyze parallel execution performance
WITH ParallelStats AS (
    SELECT 
        ParentID,
        COUNT(*) as TotalChildren,
        SUM(CASE WHEN Success = 1 THEN 1 ELSE 0 END) as SuccessfulChildren,
        AVG(ExecutionTimeMS) as AvgExecutionTime,
        SUM(TokensUsed) as TotalTokens
    FROM AIPromptRun 
    WHERE RunType = 'ParallelChild'
      AND ParentID IS NOT NULL
    GROUP BY ParentID
)
SELECT 
    parent.ID as ParentRunID,
    parent.RunAt,
    parent.ExecutionTimeMS as ParentExecutionTime,
    stats.TotalChildren,
    stats.SuccessfulChildren,
    stats.AvgExecutionTime,
    stats.TotalTokens,
    prompt.Name as PromptName
FROM AIPromptRun parent
    JOIN ParallelStats stats ON parent.ID = stats.ParentID
    JOIN AIPrompt prompt ON parent.PromptID = prompt.ID
WHERE parent.RunType = 'ParallelParent'
ORDER BY parent.RunAt DESC;

-- Find failed executions with context
SELECT 
    pr.ID,
    pr.RunType,
    pr.ParentID,
    pr.ErrorMessage,
    pr.ExecutionTimeMS,
    m.Name as ModelName,
    v.Name as VendorName,
    p.Name as PromptName
FROM AIPromptRun pr
    JOIN AIModel m ON pr.ModelID = m.ID
    LEFT JOIN AIVendor v ON pr.VendorID = v.ID
    JOIN AIPrompt p ON pr.PromptID = p.ID
WHERE pr.Success = 0
ORDER BY pr.RunAt DESC;
```

## Cancellation Support

The AI Prompt Runner provides comprehensive cancellation support through the standard JavaScript `AbortSignal` and `AbortController` pattern, enabling graceful termination of long-running operations.

### Understanding AbortSignal in Prompt Execution

The `AbortSignal` pattern separates **cancellation control** from **cancellation handling**:

- **Your Code (Controller)**: Creates the `AbortController` and decides **when** to cancel
- **Prompt Runner (Worker)**: Receives the `AbortSignal` token and handles **how** to cancel gracefully

This separation allows for flexible cancellation from multiple sources (user actions, timeouts, resource limits) while the Prompt Runner handles the complex cleanup across parallel executions, model calls, and result selection.

**The Pattern Flow:**
```
Controller (Your Code)  →  AbortController.signal  →  AIPromptRunner
      ↓                           ↓                         ↓
  Decides WHEN              The "Red Phone"          Handles HOW
  to cancel                    Token                  to stop
```

### Basic Cancellation Usage

```typescript
import { AIPromptRunner } from '@memberjunction/ai-prompts';

// Create cancellation controller
const controller = new AbortController();
const cancellationToken = controller.signal;

// Set up cancellation after 30 seconds
setTimeout(() => {
    controller.abort();
    console.log('Prompt execution cancelled due to timeout');
}, 30000);

// Execute prompt with cancellation support
const runner = new AIPromptRunner();
const result = await runner.ExecutePrompt({
    prompt: myPrompt,
    data: { query: 'Long running analysis...' },
    contextUser: currentUser,
    cancellationToken: cancellationToken
});

// Check if execution was cancelled
if (result.cancelled) {
    console.log(`Execution cancelled: ${result.cancellationReason}`);
    console.log('Partial results may be available');
} else if (result.success) {
    console.log('Execution completed successfully');
}
```

### Cancellation in Parallel Execution

Cancellation works seamlessly with parallel execution, allowing you to stop all running tasks:

```typescript
const controller = new AbortController();

// User clicks cancel button
document.getElementById('cancelButton').onclick = () => {
    controller.abort();
};

// Execute parallel prompt with multiple models
const result = await runner.ExecutePrompt({
    prompt: parallelPrompt, // ParallelizationMode: 'ModelSpecific'
    data: analysisData,
    contextUser: currentUser,
    cancellationToken: controller.signal
});

// Parallel cancellation behavior:
// - Tasks not yet started will be marked as cancelled
// - Currently executing tasks will be terminated
// - Completed tasks remain in the results
// - Partial results may still be available for analysis
```

### Multiple Cancellation Sources

One of the powerful aspects of the AbortSignal pattern is that multiple sources can cancel the same operation:

```typescript
async function intelligentPromptExecution() {
    const controller = new AbortController();
    const signal = controller.signal;

    // 1. User cancel button
    document.getElementById('cancelBtn')?.addEventListener('click', () => {
        controller.abort(); // User-initiated cancellation
        console.log('User cancelled the operation');
    });

    // 2. Timeout cancellation (prevent runaway prompts)
    const timeout = setTimeout(() => {
        controller.abort(); // Timeout cancellation
        console.log('Operation timed out after 2 minutes');
    }, 120000);

    // 3. Resource limit cancellation
    const memoryCheck = setInterval(async () => {
        if (await getMemoryUsage() > MAX_MEMORY_THRESHOLD) {
            controller.abort(); // Resource limit cancellation
            console.log('Cancelled due to memory limits');
        }
    }, 5000);

    // 4. Window unload cancellation (cleanup on page close)
    window.addEventListener('beforeunload', () => {
        controller.abort(); // Page closing cancellation
    });

    try {
        const result = await runner.ExecutePrompt({
            prompt: complexAnalysisPrompt,
            data: largeDataset,
            cancellationToken: signal // One token, many cancel sources!
        });

        // Clean up timers if successful
        clearTimeout(timeout);
        clearInterval(memoryCheck);
        
        return result;
    } catch (error) {
        // The Prompt Runner doesn't know WHY it was cancelled
        // It just knows it should stop gracefully
        console.log('Prompt execution was cancelled:', error.message);
    } finally {
        clearTimeout(timeout);
        clearInterval(memoryCheck);
    }
}
```

### Cancellation in Component-Based UIs

Perfect for React, Angular, or Vue components:

```typescript
class PromptExecutionComponent {
    private currentController: AbortController | null = null;
    private isExecuting: boolean = false;

    async executePrompt(prompt: AIPromptEntity, data: any) {
        // Cancel any existing execution
        this.cancelCurrentExecution();
        
        // Create new controller for this execution
        this.currentController = new AbortController();
        this.isExecuting = true;

        try {
            const result = await this.runner.ExecutePrompt({
                prompt,
                data,
                cancellationToken: this.currentController.signal,
                onProgress: (progress) => {
                    this.updateUI(`${progress.step}: ${progress.percentage}%`);
                },
                onStreaming: (chunk) => {
                    this.appendStreamingContent(chunk.content);
                }
            });

            this.handleSuccess(result);
        } catch (error) {
            if (error.message.includes('cancelled')) {
                this.handleCancellation();
            } else {
                this.handleError(error);
            }
        } finally {
            this.isExecuting = false;
            this.currentController = null;
        }
    }

    // Called when user clicks "Cancel" or navigates away
    cancelCurrentExecution() {
        if (this.currentController && this.isExecuting) {
            this.currentController.abort();
            console.log('Cancelled current prompt execution');
        }
    }

    // Component cleanup
    ngOnDestroy() { // Angular example
        this.cancelCurrentExecution();
    }
}
```

### Integration with BaseLLM Cancellation

The cancellation token is automatically propagated through the entire execution chain:

```typescript
// Cancellation Flow in MemberJunction AI Architecture:
//
// 1. User Code (AbortController.signal)
//    ↓
// 2. AIPromptRunner.ExecutePrompt(cancellationToken)
//    ↓
// 3. ParallelExecutionCoordinator.executeTasksInParallel(cancellationToken)
//    ↓
// 4. Individual Task Execution with cancellation
//    ↓
// 5. BaseLLM.ChatCompletion({ cancellationToken })
//    ↓
// 6. Provider-specific cancellation (fetch signal, Promise.race)
//    ↓
// 7. AI Model API cancellation (if supported)

// At each level, cancellation is handled appropriately:
const internalFlow = {
    // Level 1: Prompt Runner checks before major operations
    promptRunner: () => {
        if (cancellationToken?.aborted) {
            return { success: false, cancelled: true };
        }
    },

    // Level 2: Parallel coordinator cancels remaining tasks
    parallelCoordinator: () => {
        tasks.forEach(task => {
            if (cancellationToken?.aborted) {
                task.cancelled = true;
            }
        });
    },

    // Level 3: BaseLLM uses Promise.race for instant cancellation
    baseLLM: () => {
        return Promise.race([
            actualModelCall(params),
            cancellationPromise(cancellationToken)
        ]);
    },

    // Level 4: Native provider cancellation (where supported)
    provider: () => {
        fetch(apiUrl, {
            signal: cancellationToken  // Native browser/Node.js cancellation
        });
    }
};
```

### Cancellation Guarantees

The AI Prompt Runner provides these cancellation guarantees:

1. **🚫 Instant Recognition**: Cancellation requests are checked at multiple points throughout execution
2. **🧹 Graceful Cleanup**: Partial results are preserved and returned when possible
3. **📊 Proper Logging**: Cancelled operations are logged with appropriate status and metadata
4. **💾 Resource Release**: Network connections and memory are cleaned up promptly
5. **🔄 State Consistency**: The system remains in a consistent state after cancellation

**Key Benefits:**
- **Responsive UI**: Users get immediate feedback when cancelling operations
- **Resource Efficiency**: Prevents wasted compute and API costs
- **System Stability**: Avoids memory leaks and hanging operations
- **Standard Pattern**: Uses native JavaScript APIs - no custom cancellation logic needed

### Cancellation Result Properties

When execution is cancelled, the result includes detailed cancellation information:

```typescript
interface AIPromptRunResult {
    success: boolean;
    cancelled?: boolean;                    // True if execution was cancelled
    cancellationReason?: CancellationReason; // Why it was cancelled
    status?: ExecutionStatus;               // Current execution status
    // ... other properties
}

type CancellationReason = 'user_requested' | 'timeout' | 'error' | 'resource_limit';
type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
```

## Progress Updates & Streaming

The AI Prompt Runner provides real-time progress updates and streaming support for long-running executions, enabling responsive user interfaces and monitoring dashboards.

### Progress Callbacks

Track execution progress through different phases:

```typescript
const runner = new AIPromptRunner();

const result = await runner.ExecutePrompt({
    prompt: complexPrompt,
    data: { document: longDocument },
    contextUser: currentUser,
    
    // Progress callback receives updates throughout execution
    onProgress: (progress) => {
        console.log(`${progress.step}: ${progress.percentage}% - ${progress.message}`);
        
        // Update UI progress bar
        updateProgressBar(progress.percentage);
        updateStatusMessage(progress.message);
        
        // Access additional metadata
        if (progress.metadata) {
            console.log('Execution metadata:', progress.metadata);
        }
    }
});
```

### Execution Progress Phases

The progress callback receives updates for these execution phases:

```typescript
type ProgressPhase = 
    | 'template_rendering'    // Rendering prompt template with data
    | 'model_selection'       // Selecting appropriate AI model
    | 'execution'            // Executing AI model
    | 'validation'           // Validating and parsing results
    | 'parallel_coordination' // Coordinating parallel executions
    | 'result_selection';    // AI judge selecting best result

// Example progress updates:
// template_rendering: 20% - "Rendering prompt template with provided data"
// model_selection: 40% - "Selected GPT-4 model based on prompt configuration"  
// execution: 60% - "Executing AI model..."
// validation: 80% - "Validating output against expected format"
// result_selection: 90% - "AI judge selecting best result from 3 candidates"
```

### Streaming Response Support

Receive real-time content updates as AI models generate responses:

```typescript
const result = await runner.ExecutePrompt({
    prompt: streamingPrompt,
    data: { query: 'Generate a detailed report...' },
    contextUser: currentUser,
    
    // Streaming callback receives content chunks as they arrive
    onStreaming: (chunk) => {
        if (chunk.isComplete) {
            console.log('Streaming complete');
            finalizeDocument();
        } else {
            // Append content chunk to UI
            appendToDocument(chunk.content);
            
            // Show which model is generating content (for parallel execution)
            if (chunk.modelName) {
                showActiveModel(chunk.modelName);
            }
        }
    }
});
```

### Progress Updates in Parallel Execution

Progress tracking works seamlessly with parallel execution:

```typescript
const result = await runner.ExecutePrompt({
    prompt: parallelPrompt, // Uses multiple models
    data: analysisData,
    contextUser: currentUser,
    
    onProgress: (progress) => {
        // Parallel execution provides additional metadata
        if (progress.metadata?.parallelExecution) {
            const parallel = progress.metadata.parallelExecution;
            console.log(`Group ${parallel.currentGroup}/${parallel.totalGroups}`);
            console.log(`Tasks: ${parallel.completedTasks}/${parallel.totalTasks}`);
            console.log(`Successful: ${parallel.successfulTasks}`);
        }
    },
    
    onStreaming: (chunk) => {
        // Multiple models may stream simultaneously
        console.log(`${chunk.modelName}: ${chunk.content}`);
        
        // Update model-specific UI sections
        updateModelSection(chunk.taskId, chunk.content);
    }
});
```

### Advanced Streaming Configuration

Fine-tune streaming behavior for optimal performance:

```typescript
// Streaming configuration can be applied globally or per-prompt
const streamingConfig = {
    enabled: true,
    aggregateParallelUpdates: false,  // Separate updates per parallel task
    progressUpdateIntervalMS: 250     // Limit update frequency
};

// Progress updates are automatically throttled to prevent UI flooding
// Minimum interval between updates prevents performance issues
```

### Integration with BaseLLM Streaming

The streaming system integrates seamlessly with BaseLLM capabilities:

```typescript
// The AI Prompt Runner automatically detects streaming support:
// 1. Checks if the selected model supports streaming
// 2. Configures BaseLLM streaming callbacks
// 3. Aggregates streaming updates from multiple models in parallel execution
// 4. Provides unified streaming interface regardless of underlying model

// Models that support streaming will automatically use it when callbacks are provided
// Models without streaming support will provide content in the final result
```

## API Reference

### Exported Classes and Types

The package exports the following public API:

```typescript
// Main classes
export { AIPromptCategoryEntityExtended } from './AIPromptCategoryExtended';
export { AIPromptRunner, AIPromptParams, AIPromptRunResult } from './AIPromptRunner';

// Helper types
export { ChildPromptParam } from './AIPromptRunner';
export { SystemPlaceholder, SystemPlaceholderManager } from './SystemPlaceholders';

// Callback types
export type { ExecutionProgressCallback, ExecutionStreamingCallback } from './AIPromptRunner';
```

### Import Examples

```typescript
// Import from this package
import { AIPromptRunner, AIPromptParams, AIPromptRunResult } from '@memberjunction/ai-prompts';
import { ChildPromptParam, SystemPlaceholderManager } from '@memberjunction/ai-prompts';

// Import base types from Core
import { ChatResult, ModelUsage, ChatMessage } from '@memberjunction/ai';

// Import entities and engine types
import { AIPromptEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
```

### AIPromptRunner Class

Handles execution of AI prompts with advanced parallel processing, template rendering, and result validation.

#### Methods

- `ExecutePrompt(params: AIPromptParams): Promise<AIPromptRunResult>`: Execute a prompt with full feature support including template rendering, model selection, parallel execution, and output validation

#### AIPromptParams Interface

```typescript
interface AIPromptParams {
    prompt: AIPromptEntity;                    // The prompt to execute
    data?: any;                                // Template and context data
    modelId?: string;                          // Override model selection
    vendorId?: string;                         // Override vendor selection
    configurationId?: string;                  // AI Configuration ID for environment-specific model selection (e.g., Prod vs Dev)
    contextUser?: UserInfo;                    // User context
    skipValidation?: boolean;                  // Skip output validation
    templateData?: any;                        // Additional template data that augments the main data context
    conversationMessages?: ChatMessage[];     // Multi-turn conversation messages
    templateMessageRole?: TemplateMessageRole; // How to use rendered template ('system'|'user'|'none')
    cancellationToken?: AbortSignal;           // Cancellation token for aborting execution
    onProgress?: ExecutionProgressCallback;    // Progress update callback
    onStreaming?: ExecutionStreamingCallback;  // Streaming content callback
    agentRunId?: string;                       // Optional agent run ID to link prompt executions to parent agent run
    cleanValidationSyntax?: boolean;           // Clean validation syntax from JSON responses (auto-enabled for validated prompts)
}

/**
 * Progress callback function type
 */
type ExecutionProgressCallback = (progress: {
    step: 'template_rendering' | 'model_selection' | 'execution' | 'validation' | 'parallel_coordination' | 'result_selection';
    percentage: number;     // Progress percentage (0-100)
    message: string;        // Human-readable status message
    metadata?: Record<string, any>; // Additional metadata about the current step
}) => void;

/**
 * Streaming callback function type
 */
type ExecutionStreamingCallback = (chunk: {
    content: string;        // The content chunk received
    isComplete: boolean;    // Whether this is the final chunk
    taskId?: string;        // Which task/model is producing this content (for parallel execution)
    modelName?: string;     // Model name producing this content
}) => void;

/**
 * Template message role type
 */
type TemplateMessageRole = 'system' | 'user' | 'none';
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
interface AIPromptRunResult<T = unknown> {
    success: boolean;                       // Whether the execution was successful
    status?: ExecutionStatus;               // Current execution status
    cancelled?: boolean;                    // Whether the execution was cancelled
    cancellationReason?: CancellationReason; // Reason for cancellation if applicable
    rawResult?: string;                     // The raw result from the AI model
    result?: T;                            // The parsed/validated result based on OutputType
    errorMessage?: string;                  // Error message if execution failed
    promptRun?: AIPromptRunEntity;          // The AIPromptRun entity that was created for tracking
    executionTimeMS?: number;              // Total execution time in milliseconds
    
    // Token tracking (follows ModelUsage convention)
    promptTokens?: number;                 // Prompt/input tokens for this execution
    completionTokens?: number;             // Completion/output tokens for this execution
    tokensUsed?: number;                   // Total tokens (calculated getter)
    
    // Hierarchical token tracking
    combinedPromptTokens?: number;         // Total prompt tokens including all children
    combinedCompletionTokens?: number;     // Total completion tokens including all children
    combinedTokensUsed?: number;           // Total tokens including all children (calculated)
    
    // Cost tracking
    cost?: number;                         // Cost of this execution
    costCurrency?: string;                 // ISO 4217 currency code (USD, EUR, etc.)
    combinedCost?: number;                 // Total cost including all children
    
    validationResult?: ValidationResult;    // Validation result if output validation was performed
    validationAttempts?: ValidationAttempt[]; // Detailed validation attempts
    additionalResults?: AIPromptRunResult<T>[]; // Additional results from parallel execution, ranked by judge
    ranking?: number;                       // Ranking assigned by judge (1 = best, 2 = second best, etc.)
    judgeRationale?: string;               // Judge's rationale for this ranking
    modelInfo?: ModelInfo;                 // Model information for this result
    judgeMetadata?: JudgeMetadata;         // Metadata about the judging process (only present on the main result)
    wasStreamed?: boolean;                 // Whether streaming was used for this execution
    cacheInfo?: {                          // Cache information if caching was involved
        cacheHit: boolean;
        cacheKey?: string;
        cacheSource?: string;
    };
}

// Execution status enumeration
type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

// Cancellation reason enumeration
type CancellationReason = 'user_requested' | 'timeout' | 'error' | 'resource_limit';

// Model information interface
interface ModelInfo {
    modelId: string;
    modelName: string;
    vendorId?: string;
    vendorName?: string;
    powerRank?: number;
    modelType?: string;
}

// Judge metadata interface
interface JudgeMetadata {
    judgePromptId: string;
    judgeExecutionTimeMS: number;
    judgeTokensUsed?: number;
    judgeCancelled?: boolean;
    judgeErrorMessage?: string;
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

AI Agents can leverage the prompt system for sophisticated operations with comprehensive execution tracking:

```typescript
// Agents use prompts for their intelligence with hierarchical logging
import { AgentRunner } from '@memberjunction/ai-agents';
import { AIPromptRunner } from '@memberjunction/ai-prompts';

class IntelligentAgent extends AgentRunner {
    private promptRunner = new AIPromptRunner();
    
    async execute(context: AgentExecutionContext): Promise<AgentExecutionResult> {
        const prompt = this.getPromptForContext(context);
        
        // Link prompt execution to agent run for comprehensive tracking
        const result = await this.promptRunner.ExecutePrompt({
            prompt: prompt,
            data: context.data,
            contextUser: context.user,
            agentRunId: context.agentRun?.ID  // Links prompt to parent agent run
        });
        
        return this.formatAgentResult(result);
    }
}
```

#### Agent-Prompt Integration Features

The AI Prompts system provides seamless integration with AI Agents through the `agentRunId` parameter:

**Hierarchical Execution Tracking:**
- Prompt executions are linked to their parent agent runs via `AgentRunID` foreign key
- Provides complete audit trail from agent decision to prompt execution
- Enables comprehensive resource usage tracking across agent workflows

**Usage Patterns:**
```typescript
// 1. Direct agent-prompt linking
const result = await promptRunner.ExecutePrompt({
    prompt: myPrompt,
    data: promptData,
    agentRunId: agentRun.ID,  // Links to parent agent execution
    contextUser: user
});

// 2. Parallel execution with agent tracking
const parallelResult = await promptRunner.ExecutePrompt({
    prompt: parallelPrompt,  // ParallelizationMode: 'ModelSpecific'
    data: analysisData,
    agentRunId: agentRun.ID,  // All parallel child prompts link to agent
    contextUser: user
});

// 3. Context compression with agent linking (automatic in AgentRunner)
// When agents use context compression, compression prompts are automatically
// linked to the parent agent run for complete execution visibility
```

**Database Schema Integration:**
```sql
-- Query agent execution with all related prompts
SELECT 
    ar.ID as AgentRunID,
    ar.Status as AgentStatus,
    ar.StartedAt,
    ar.CompletedAt,
    pr.ID as PromptRunID,
    pr.RunType,
    pr.Success as PromptSuccess,
    pr.ExecutionTimeMS,
    pr.TokensUsed
FROM AIAgentRun ar
    LEFT JOIN AIPromptRun pr ON ar.ID = pr.AgentRunID
WHERE ar.ID = 'your-agent-run-id'
ORDER BY pr.RunAt;
```

**Benefits:**
- **Complete Traceability**: Track all AI model usage from agent decisions to prompt executions
- **Resource Attribution**: Understand token usage and costs at the agent level
- **Performance Analysis**: Analyze execution patterns across the agent-prompt hierarchy
- **Debugging Support**: Full execution history for troubleshooting agent workflows

## Dependencies

- `@memberjunction/core` (v2.43.0): MemberJunction core library
- `@memberjunction/global` (v2.43.0): MemberJunction global utilities  
- `@memberjunction/core-entities` (v2.43.0): MemberJunction entity definitions
- `@memberjunction/ai` (v2.43.0): Base AI types and result structures (imported for core types)
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
7. **Implement Cancellation**: Always provide cancellation tokens for user-facing operations
8. **Use Progress Callbacks**: Provide progress feedback for long-running operations
9. **Leverage Hierarchical Logging**: Use the logging hierarchy for debugging and analytics
10. **Configure Streaming Appropriately**: Enable streaming for responsive user experiences
11. **Optimize Judge Selection**: Use efficient judge prompts for parallel result selection
12. **Monitor Resource Usage**: Track token consumption and execution times across hierarchical runs

### Implementation Guidelines

```typescript
// Comprehensive prompt execution with all new features
const controller = new AbortController();

const result = await runner.ExecutePrompt({
    prompt: myPrompt,
    data: executionData,
    contextUser: currentUser,
    
    // Cancellation support
    cancellationToken: controller.signal,
    
    // Progress tracking
    onProgress: (progress) => {
        updateProgressIndicator(progress.percentage, progress.message);
        if (progress.metadata?.parallelExecution) {
            updateParallelStatus(progress.metadata.parallelExecution);
        }
    },
    
    // Streaming for real-time updates
    onStreaming: (chunk) => {
        if (chunk.isComplete) {
            finalizePage();
        } else {
            appendContent(chunk.content);
        }
    }
});

// Always check for cancellation in results
if (result.cancelled) {
    handleCancellation(result.cancellationReason);
} else if (result.success) {
    processResults(result);
    
    // Analyze additional results from parallel execution
    if (result.additionalResults) {
        analyzeAlternativeResults(result.additionalResults);
    }
}

// Use hierarchical logging data for analytics
if (result.promptRun) {
    trackExecutionMetrics(result.promptRun);
    if (result.promptRun.RunType === 'ParallelParent') {
        analyzeParallelPerformance(result.promptRun.ID);
    }
}
```

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

5. **Cancellation Not Working**
   - Verify the AbortController is properly created and signal is passed
   - Check that the cancellation token is not already aborted before execution
   - Ensure model implementations support cancellation (older models may not)
   - Review cancellation timing - very fast executions may complete before cancellation

6. **Progress Updates Not Received**
   - Confirm onProgress callback is properly defined and passed to ExecutePrompt
   - Check that the callback function doesn't throw errors (which can stop updates)
   - Progress updates are throttled - very fast operations may have fewer updates
   - Parallel execution provides more detailed progress metadata

7. **Streaming Not Working**
   - Verify the selected AI model supports streaming (not all models do)
   - Ensure onStreaming callback is provided in AIPromptParams
   - Check BaseLLM implementation supports streaming for the specific model
   - Review model configuration - some vendors require specific settings for streaming

8. **Hierarchical Logging Missing**
   - Ensure database schema includes RunType, ParentID, and ExecutionOrder fields
   - Check that user has permissions to create AIPromptRun records
   - Verify prompt run creation isn't being skipped due to errors
   - Review logs for save failures on prompt run entities

9. **Judge Selection Failing**
   - Confirm ResultSelectorPromptID is set and points to a valid, active prompt
   - Verify the judge prompt returns valid JSON with rankings array
   - Check that judge prompt has proper model associations
   - Review judge prompt timeout settings for complex evaluations

### Performance Optimization

For optimal performance with the new features:

```typescript
// Minimize progress update frequency for high-performance scenarios
const result = await runner.ExecutePrompt({
    prompt: myPrompt,
    data: myData,
    onProgress: (progress) => {
        // Throttle UI updates
        if (progress.percentage % 10 === 0) {
            updateUI(progress);
        }
    }
});

// Use cancellation for long-running operations
const controller = new AbortController();
setTimeout(() => controller.abort(), 60000); // 1 minute timeout

// Configure parallel execution for optimal throughput
const parallelPrompt = {
    ParallelizationMode: "ModelSpecific",
    // Configure specific models with different execution groups for coordination
};
```

### Debugging Hierarchical Logs

Use these queries to troubleshoot execution issues:

```sql
-- Find incomplete executions
SELECT * FROM AIPromptRun 
WHERE CompletedAt IS NULL 
  AND RunAt < DATEADD(minute, -5, GETDATE());

-- Check parallel execution hierarchy
SELECT 
    ID, RunType, ParentID, ExecutionOrder, Success, ErrorMessage
FROM AIPromptRun 
WHERE ParentID = 'your-parent-id' OR ID = 'your-parent-id'
ORDER BY RunType, ExecutionOrder;

-- Find resource usage patterns
SELECT 
    RunType,
    AVG(ExecutionTimeMS) as AvgTimeMS,
    AVG(TokensUsed) as AvgTokens,
    COUNT(*) as ExecutionCount
FROM AIPromptRun 
WHERE RunAt > DATEADD(day, -7, GETDATE())
GROUP BY RunType;
```

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

### Model Priority Behavior

When multiple models are configured for a prompt (using `AIPromptModel` entries), the execution engine uses the `Priority` field to determine the order in which models are tried:

- **Higher priority numbers are executed first** (e.g., Priority 10 before Priority 5)
- The engine sorts models by `Priority DESC` to establish execution order
- For models with the same priority, creation date is used as a tiebreaker
- The first successful model execution is used (fail-fast approach)

```typescript
// Example: Models are tried in this order based on Priority
const promptModels = [
    { ModelID: 'gpt-4-id', Priority: 100 },      // Tried first
    { ModelID: 'claude-3-id', Priority: 50 },    // Tried second
    { ModelID: 'gpt-3.5-id', Priority: 10 }      // Tried third
];

// The PromptRunner sorts internally using:
// models.sort((a, b) => b.Priority - a.Priority)
```

This priority system allows you to:
- Set preferred models with higher priorities
- Configure fallback models with lower priorities
- Ensure expensive/powerful models are only used when necessary
- Control the exact execution order for cost optimization

## Multi-Vendor Model Support

MemberJunction supports multiple inference providers (vendors) for the same AI model, enabling flexible deployment scenarios and vendor failover. This is crucial for:
- Using the same model from different providers (e.g., Claude from Anthropic API vs AWS Bedrock)
- Vendor-specific configurations (different token limits, API endpoints, pricing)
- Failover strategies when primary vendors are unavailable
- Cost optimization by routing to cheaper providers

### Vendor Selection Precedence

The AI Prompt Runner uses a sophisticated vendor selection system with clear precedence rules:

1. **Explicit Runtime Override** (`params.override.vendorId`)
   - Highest precedence - always used when specified
   - If the vendor doesn't provide the selected model, a warning is issued and fallback occurs

2. **Prompt-Model Association Vendor** (`AIPromptModel.VendorID`)
   - When a prompt has specific model associations, the vendor from the highest priority association is used
   - Configured in the database for prompt-specific vendor preferences

3. **Highest Priority Vendor** (`AIModelVendor.Priority`)
   - When no explicit vendor is specified, the system uses the vendor with the highest priority value
   - Priority is configured per model-vendor combination in the database
   - **Higher Priority numbers = Higher preference** (e.g., Priority 100 is preferred over Priority 50)

### Vendor-Specific Configuration

Each vendor can have different configurations for the same model:

```typescript
// AIModelVendor entity fields used during execution:
{
    ModelID: 'claude-3-opus-id',
    VendorID: 'anthropic-id',
    Priority: 100,                    // Higher = preferred
    DriverClass: 'AnthropicLLM',      // Vendor-specific implementation
    APIName: 'claude-3-opus-20240229', // Vendor's API model name
    MaxInputTokens: 200000,           // Vendor-specific limits
    MaxOutputTokens: 4096,
    SupportsStreaming: true,
    SupportsEffortLevel: false
}
```

### Vendor Override Example

```typescript
// Execute with specific vendor
const result = await runner.ExecutePrompt({
    prompt: myPrompt,
    data: { query: 'Analyze this data' },
    contextUser: currentUser,
    override: {
        modelId: 'claude-3-opus-id',
        vendorId: 'aws-bedrock-id'  // Use AWS Bedrock instead of default
    }
});

// The system will:
// 1. Validate that AWS Bedrock provides Claude 3 Opus
// 2. Use AWS Bedrock's driver class and configuration
// 3. Fall back to highest priority vendor if mismatch occurs
```

### Model-Vendor Mismatch Handling

When a specified vendor doesn't provide the requested model:

```typescript
// Scenario: User requests GPT-4 from Anthropic (invalid combination)
const result = await runner.ExecutePrompt({
    prompt: myPrompt,
    override: {
        modelId: 'gpt-4-id',
        vendorId: 'anthropic-id'  // Anthropic doesn't provide GPT-4
    }
});

// System behavior:
// 1. Logs warning: "⚠️ Warning: Vendor anthropic does not provide model GPT-4. Falling back to highest priority vendor."
// 2. Finds highest priority vendor for GPT-4 (e.g., OpenAI)
// 3. Uses the fallback vendor's configuration
// 4. Execution continues with valid vendor
```

### Database Configuration

Configure multi-vendor support through the MemberJunction metadata:

```sql
-- Example: Claude available from multiple vendors
INSERT INTO [MJ: AI Model Vendors] (ModelID, VendorID, Priority, DriverClass, APIName, MaxInputTokens)
VALUES 
    ('claude-3-id', 'anthropic-id', 100, 'AnthropicLLM', 'claude-3-opus-20240229', 200000),
    ('claude-3-id', 'aws-bedrock-id', 90, 'BedrockLLM', 'anthropic.claude-3-opus', 180000),
    ('claude-3-id', 'vertex-ai-id', 80, 'VertexAILLM', 'claude-3-opus@001', 150000);

-- Query vendor options for a model
SELECT 
    mv.Priority,
    v.Name as VendorName,
    mv.DriverClass,
    mv.APIName,
    mv.MaxInputTokens,
    mv.MaxOutputTokens
FROM [MJ: AI Model Vendors] mv
    JOIN [MJ: AI Vendors] v ON mv.VendorID = v.ID
WHERE mv.ModelID = 'claude-3-id' 
    AND mv.Status = 'Active'
ORDER BY mv.Priority DESC;
```

### Benefits of Multi-Vendor Support

1. **Resilience**: Automatic failover when primary vendor is unavailable
2. **Cost Optimization**: Route to cheaper vendors for non-critical tasks
3. **Regional Compliance**: Use region-specific vendors for data residency
4. **Performance**: Choose vendors with better latency for your location
5. **Feature Access**: Some vendors may offer unique features (streaming, tools, etc.)

### Implementation Details

The multi-vendor support is implemented in the `executeModel` method:

1. **Vendor Resolution**: Determines which vendor to use based on precedence rules
2. **Configuration Loading**: Loads vendor-specific settings from AIModelVendor
3. **Driver Selection**: Uses vendor-specific driver class for API communication
4. **Fallback Logic**: Handles mismatches gracefully with warnings
5. **Execution Tracking**: Records the actual vendor used in AIPromptRun

For additional configuration options and advanced use cases, refer to the source code and entity definitions in the MemberJunction core system.

## System Prompt Embedding

The AI Prompt Runner provides sophisticated system prompt embedding capabilities for agent architectures through the template engine integration.

### Architecture Overview

When `systemPromptId` is provided in AIPromptParams, the runner:
1. Loads the system prompt template from the database
2. Embeds the agent-specific AI prompt using `{% PromptEmbed %}` syntax
3. Renders the complete system prompt with agent context
4. Uses the rendered system prompt instead of the regular AI prompt template

This enables sophisticated agent architectures where:
- **System prompts** provide execution control and enforce deterministic JSON response format
- **Agent prompts** contain domain-specific logic (e.g., DATA_GATHER instructions)
- **Available actions and sub-agents** are injected for agent decision-making

### Template Syntax

System prompt templates use the `{% PromptEmbed %}` syntax to embed AI prompts:

```nunjucks
# System Prompt Template Example

You are an AI agent with the following specialized instructions:

{% PromptEmbed %}

## Available Actions
{{#each availableActions}}
- **{{this.name}}**: {{this.description}}
{{/each}}

## Available Sub-Agents  
{{#each availableSubAgents}}
- **{{this.name}}**: {{this.description}}
{{/each}}

## Response Format
You must respond with valid JSON following this structure:
{
  "decision": "execute_action|execute_subagent|complete_task|request_clarification",
  "reasoning": "Explanation of your decision",
  "executionPlan": [
    {
      "type": "action|subagent",
      "targetId": "action-or-agent-id",
      "parameters": {},
      "executionOrder": 1,
      "allowParallel": true
    }
  ],
  "isTaskComplete": false,
  "confidence": 0.95
}
```

### Validation and Security

The system includes comprehensive validation to ensure proper prompt embedding:

```typescript
// Validation process:
// 1. Verify system prompt exists and has template
// 2. Check agent-prompt relationships via AIAgentPrompt table
// 3. Ensure agents using system prompt are linked to current prompt
// 4. Validate template contains {% PromptEmbed %} syntax

const params = new AIPromptParams();
params.prompt = agentSpecificPrompt;
params.systemPromptId = 'system-prompt-id'; // Triggers validation
params.data = { agentName: 'DataGather', availableActions: [...] };
```

### Integration with AI Agents

The AgentRunner seamlessly uses system prompt embedding:

```typescript
// AgentRunner delegates to AIPromptRunner with system prompt embedding
const promptParams = new AIPromptParams();
promptParams.prompt = primaryAgentPrompt.prompt;
promptParams.systemPromptId = this.agentType.SystemPromptID;
promptParams.data = promptData;
promptParams.agentRunId = context.agentRun.ID;

const promptResult = await this._promptRunner.ExecutePrompt(promptParams);
```

### Database Schema Integration

The system prompt embedding feature integrates with several database entities:

#### Entity Relationships

```sql
-- System prompts are stored as AIPrompt entities with templates
AIPrompt (SystemPromptID) -> Template -> TemplateContent (contains {% PromptEmbed %})

-- Agent types reference system prompts
AIAgentType.SystemPromptID -> AIPrompt (system prompt)

-- Agents belong to agent types
AIAgent.TypeID -> AIAgentType

-- Agent prompts link agents to their specific prompts
AIAgentPrompt: AgentID + PromptID

-- Validation ensures proper linkage:
-- Agent -> AgentType -> SystemPrompt
-- Agent -> AIAgentPrompt -> AIPrompt (to be embedded)
```

#### Storage Structure

```sql
-- Example system prompt template storage
INSERT INTO Template (Name, Description) 
VALUES ('AI Agent System Prompt', 'Control wrapper for agent decision-making');

INSERT INTO TemplateContent (TemplateID, TemplateText, Priority) 
VALUES (@TemplateID, 'You are {{agentName}}... {% PromptEmbed %}... Respond with JSON...', 100);

INSERT INTO AIPrompt (Name, Description, TemplateID, Category) 
VALUES ('System Prompt', 'Agent execution control wrapper', @TemplateID, 'System');

UPDATE AIAgentType SET SystemPromptID = @SystemPromptID WHERE Name = 'DataGatherAgent';
```

## API Keys

The AI Prompts system provides flexible API key management for runtime configuration without modifying environment variables or global settings.

### Environment-Based API Configuration

MemberJunction now supports sophisticated environment-based API key resolution through AIConfigSet entities, allowing different configurations for different environments:

```typescript
// Configurations are loaded based on the environment name
// Default fallback order: process.env.NODE_ENV -> 'production'

// Example: Different API keys per environment
// Development -> AIConfigSet(Name='development') -> Config Key OPENAI_LLM_APIKEY
// Production -> AIConfigSet(Name='production') -> Config Key OPENAI_LLM_APIKEY
```

#### Configuration Set Priority

When multiple configuration sets exist, they are evaluated in this order:
1. **Exact environment match** (e.g., 'development' matches 'development')
2. **Priority field** (higher priority values are preferred)
3. **Custom resolver logic** (if implemented via subclassing)

### Using Runtime API Keys

You can provide API keys at prompt execution time, which is useful for:
- Multi-tenant applications where different users have different API keys
- Testing with different API providers or accounts
- Isolating API usage by application or department
- Temporary API key usage for specific operations

```typescript
import { AIPromptRunner, AIPromptParams } from '@memberjunction/ai-prompts';
import { AIAPIKey } from '@memberjunction/ai';

const runner = new AIPromptRunner();

// Execute with specific API keys
const result = await runner.ExecutePrompt({
    prompt: myPrompt,
    data: { query: 'Analyze this data' },
    contextUser: currentUser,
    apiKeys: [
        { driverClass: 'OpenAILLM', apiKey: 'sk-user-specific-key' },
        { driverClass: 'AnthropicLLM', apiKey: 'sk-ant-department-key' }
    ]
});
```

### API Key Precedence

When executing prompts, API keys are resolved in this order:
1. **Local API keys** provided in `AIPromptParams.apiKeys` (highest priority)
2. **Configuration sets** from database based on environment
3. **Environment variables** (traditional dotenv approach)
4. **Custom implementations** via AIAPIKeys subclassing

### Configuration Set Structure

Configuration sets are managed through these entities:

#### AIConfigSet
- **Name**: Environment name (e.g., 'development', 'production', 'staging')
- **Description**: Human-readable description
- **Priority**: Higher values take precedence when multiple sets match
- **Status**: 'Active' or 'Inactive'

#### AIConfiguration
- **ConfigSetID**: Links to parent configuration set
- **ConfigKey**: The configuration key (e.g., 'OPENAI_LLM_APIKEY')
- **ConfigValue**: The actual value (encrypted for sensitive data)
- **EncryptedValue**: Whether the value is encrypted
- **Description**: Documentation for the configuration

### Environment Variables vs Configuration Sets

```typescript
// Traditional environment variable approach (still supported)
process.env.OPENAI_LLM_APIKEY = 'sk-...';

// New configuration set approach (recommended)
// Stored in database:
// ConfigSet: { Name: 'production', Priority: 100 }
// Config: { ConfigKey: 'OPENAI_LLM_APIKEY', ConfigValue: 'sk-...', Encrypted: true }

// The system automatically uses the configuration set if available
// Falls back to environment variables if not found in database
```

### Hierarchical API Key Propagation

For hierarchical prompt execution (prompts with child prompts), API keys are automatically propagated:

```typescript
const parentParams = new AIPromptParams();
parentParams.prompt = parentPrompt;
parentParams.childPrompts = [
    new ChildPromptParam(childPrompt1, 'analysis'),
    new ChildPromptParam(childPrompt2, 'summary')
];
parentParams.apiKeys = [
    { driverClass: 'OpenAILLM', apiKey: 'sk-parent-key' }
];

// Child prompts automatically inherit the parent's API keys
// This ensures consistent API key usage throughout the execution tree
const result = await runner.ExecutePrompt(parentParams);
```

### Custom Global API Key Management

For advanced scenarios, you can subclass the global `AIAPIKeys` object:

```typescript
import { AIAPIKeys, RegisterClass } from '@memberjunction/ai';

@RegisterClass(AIAPIKeys, 'CustomAPIKeys', 2) // Priority 2 overrides default
export class CustomAPIKeys extends AIAPIKeys {
    public GetAPIKey(AIDriverName: string): string {
        // First check configuration sets
        const configValue = this.getFromConfigSet(AIDriverName);
        if (configValue) return configValue;
        
        // Then check custom logic: database lookup, vault access, etc.
        if (AIDriverName === 'OpenAILLM') {
            return this.getFromVault('openai-key');
        }
        
        // Finally fall back to environment variables
        return super.GetAPIKey(AIDriverName);
    }
    
    private getFromConfigSet(driverName: string): string | null {
        // Implementation would query AIConfiguration entities
        // based on current environment
        const envName = process.env.NODE_ENV || 'production';
        // ... query logic here
        return null;
    }
}
```

### Multi-Environment Setup Example

```typescript
// Development environment setup
const devConfig = {
    ConfigSet: { Name: 'development', Priority: 100 },
    Configurations: [
        { ConfigKey: 'OPENAI_LLM_APIKEY', ConfigValue: 'sk-dev-...', Encrypted: true },
        { ConfigKey: 'ANTHROPIC_LLM_APIKEY', ConfigValue: 'sk-ant-dev-...', Encrypted: true },
        { ConfigKey: 'LOG_LEVEL', ConfigValue: 'debug', Encrypted: false }
    ]
};

// Production environment setup
const prodConfig = {
    ConfigSet: { Name: 'production', Priority: 100 },
    Configurations: [
        { ConfigKey: 'OPENAI_LLM_APIKEY', ConfigValue: 'sk-prod-...', Encrypted: true },
        { ConfigKey: 'ANTHROPIC_LLM_APIKEY', ConfigValue: 'sk-ant-prod-...', Encrypted: true },
        { ConfigKey: 'LOG_LEVEL', ConfigValue: 'error', Encrypted: false }
    ]
};

// The system automatically loads the correct configuration based on NODE_ENV
```

### Security Best Practices

1. **Never hardcode API keys** in your source code
2. **Use encrypted storage** for sensitive configuration values
3. **Separate configurations** by environment (dev, staging, prod)
4. **Rotate keys regularly** and update configuration sets
5. **Monitor API key usage** to detect unauthorized access
6. **Use the principle of least privilege** - give each user/app only the keys they need
7. **Audit configuration changes** through MemberJunction's change tracking

## AI Configuration System

The AI Prompts system supports sophisticated environment-specific model selection through AI Configurations. This allows you to use different sets of models for the same prompts based on the active configuration (e.g., Production vs Development).

### Configuration Concepts

#### AI Configurations
- Named configuration sets (e.g., "Production", "Development", "Europe-Region")
- Filter which models are available for prompt execution
- Support configuration parameters for dynamic behavior
- One configuration can be marked as default (`IsDefault = true`)

#### AI Configuration Parameters
- Name-value pairs stored per configuration
- Support different data types (string, number, boolean, date, object)
- Can control dynamic parallelization and other runtime behavior
- Example: `ParallelExecutions = 5` for development testing

### Model Selection with Configurations

When executing a prompt with a specific `configurationId`, the system follows a two-phase model selection process that ensures configuration-specific models ALWAYS take precedence:

#### Phase 1: Configuration-Specific Models (Highest Priority)
```typescript
// First, try to find models with matching configuration
const configModels = promptModels.filter(pm => 
    pm.ConfigurationID === configurationId &&
    (pm.Status === 'Active' || pm.Status === 'Preview')
);
```

If configuration-specific models are found, they are used exclusively. The system will NOT consider models with NULL or mismatched configurations.

#### Phase 2: Default Models (Fallback)

Only if NO models match the specific configuration, the system falls back to models with NULL configuration:

```typescript
// Fall back to NULL configuration models only if no matches found
if (configModels.length === 0) {
    const defaultModels = promptModels.filter(pm => 
        pm.ConfigurationID === null &&
        (pm.Status === 'Active' || pm.Status === 'Preview')
    );
}
```

This ensures:
- **Configuration-specific models always win**: When you specify a configuration, only models explicitly assigned to that configuration are considered first
- **Clear environment separation**: Production models never mix with Development models when configurations are used
- **Explicit fallback behavior**: NULL configuration models serve as defaults only when no configuration-specific models exist

### Configuration Setup Example

```sql
-- Create configurations
INSERT INTO AIConfiguration (Name, Description, IsDefault, Status)
VALUES 
    ('Production', 'Stable models for production use', 1, 'Active'),
    ('Development', 'Experimental models for testing', 0, 'Active');

-- Assign models to configurations
-- Production uses GPT-4
UPDATE AIPromptModel 
SET ConfigurationID = (SELECT ID FROM AIConfiguration WHERE Name = 'Production')
WHERE PromptID = @PromptID AND ModelID = @GPT4ModelID;

-- Development uses GPT-4-Turbo and Claude-3-Opus
UPDATE AIPromptModel 
SET ConfigurationID = (SELECT ID FROM AIConfiguration WHERE Name = 'Development')
WHERE PromptID = @PromptID AND ModelID IN (@GPT4TurboID, @Claude3OpusID);

-- Models with NULL ConfigurationID serve as defaults when no configuration matches
UPDATE AIPromptModel 
SET ConfigurationID = NULL
WHERE PromptID = @PromptID AND ModelID = @FallbackModelID;
```

### Using Configurations

#### In Code
```typescript
const result = await promptRunner.ExecutePrompt({
    prompt: myPrompt,
    configurationId: 'dev-config-id', // Optional
    data: { query: 'Analyze this data' },
    contextUser: currentUser
});
```

#### Configuration Precedence
1. **Configuration-specific models** (highest priority) - When a configurationId is provided, ONLY models with matching ConfigurationID are considered initially
2. **NULL configuration models** (fallback only) - Used only when NO models match the specified configuration
3. **Priority within each phase** - Models are ranked by their Priority field (higher number = higher priority)

### Dynamic Parallelization with Configurations

Configurations can control parallel execution through parameters:

```typescript
// Set up configuration parameter
INSERT INTO AIConfigurationParam (ConfigurationID, Name, Type, Value)
VALUES (@DevConfigID, 'ParallelExecutions', 'number', '5');

// Use in prompt setup
UPDATE AIPrompt 
SET ParallelizationMode = 'ConfigParam',
    ParallelConfigParam = 'ParallelExecutions'
WHERE ID = @PromptID;
```

### Best Practices

1. **Use NULL ConfigurationID for fallback models** that provide a safety net when no configuration-specific models exist
2. **Create environment-specific configurations** for different deployment scenarios (Production, Development, Testing)
3. **Document configuration purposes** in the Description field to clarify their intended use
4. **Test configuration precedence** to ensure configuration-specific models always take priority over defaults
5. **Use configuration parameters** for environment-specific settings beyond just model selection
6. **Assign models explicitly to configurations** to ensure clear separation between environments

For more details on API key management, see the [AI Core API Keys documentation](../Core/README.md#api-key-management).

### Configuration Inheritance (v3.1+)

AI Configurations now support parent-child inheritance relationships. This enables you to create child configurations that inherit prompt-model mappings from parent configurations while overriding specific settings.

#### Use Cases

- **Experimentation**: Create a child config that inherits from "Production" but overrides just 2-3 prompts with experimental models
- **Regional Variations**: Create "Production-EU" inheriting from "Production" with region-specific model overrides
- **A/B Testing**: Create test configurations that inherit baseline settings while varying specific prompts

#### How Inheritance Works

When you specify a `configurationId`, the system builds an inheritance chain from child to root:

```
Child Config → Parent Config → Grandparent Config → ... → Root Config
```

For each prompt, the system walks this chain looking for AIPromptModel matches:
1. First checks for models assigned to the child config
2. If none found, checks the parent config
3. Continues up the chain until a match is found
4. Falls back to NULL configuration models as final fallback

#### Setting Up Inheritance

```sql
-- Create parent configuration
INSERT INTO AIConfiguration (ID, Name, Description, ParentID, IsDefault, Status)
VALUES (NEWID(), 'Production', 'Standard production configuration', NULL, 1, 'Active');

-- Create child configuration that inherits from Production
INSERT INTO AIConfiguration (ID, Name, Description, ParentID, IsDefault, Status)
VALUES (NEWID(), 'Production-Experimental', 'Production with experimental models for select prompts',
        (SELECT ID FROM AIConfiguration WHERE Name = 'Production'), 0, 'Active');
```

#### Model Override Example

```sql
-- Parent (Production) uses GPT-4 for the summarization prompt
INSERT INTO AIPromptModel (PromptID, ModelID, ConfigurationID, Priority)
VALUES (@SummarizePromptID, @GPT4ModelID, @ProductionConfigID, 100);

-- Child (Production-Experimental) overrides with Claude for summarization
INSERT INTO AIPromptModel (PromptID, ModelID, ConfigurationID, Priority)
VALUES (@SummarizePromptID, @ClaudeModelID, @ExperimentalConfigID, 100);

-- Other prompts in Production-Experimental inherit GPT-4 from parent
```

#### Using Inherited Configurations

```typescript
// Execute with child configuration - inherits from parent where no override exists
const result = await promptRunner.ExecutePrompt({
    prompt: summarizePrompt,
    configurationId: experimentalConfigId, // Child config
    data: { text: 'Content to summarize' },
    contextUser: currentUser
});

// For summarization: Uses Claude (child override)
// For other prompts: Uses parent's models (inherited)
```

#### Parameter Inheritance

Configuration parameters also inherit from parent configurations. Child parameters override parent parameters with the same name:

```typescript
// Get all parameters including inherited ones
const params = AIEngine.Instance.GetConfigurationParamsWithInheritance(childConfigId);

// Parent has: temperature=0.7, maxTokens=4000
// Child has: temperature=0.9
// Result: temperature=0.9 (child), maxTokens=4000 (inherited)
```

#### Cycle Detection

The system automatically detects circular references in the configuration hierarchy. If a cycle is detected, an error is thrown with a descriptive message showing the problematic chain.

#### Best Practices

1. **Keep inheritance chains shallow** - 2-3 levels is usually sufficient
2. **Document override intentions** - Use Description field to explain why child configs exist
3. **Use meaningful names** - Name child configs to indicate their parent (e.g., "Production-EU", "Standard-Experimental")
4. **Test inheritance** - Verify that child configs properly inherit unoverridden models

## Model Selection Tracking (v2.78+)

The AIPromptRunner now provides comprehensive tracking of model selection decisions through the `modelSelectionInfo` property in `AIPromptRunResult`. This feature helps developers understand:

- Which models were considered during selection
- Why specific models were or weren't available
- Which configuration influenced the selection
- What selection strategy was used

### Enhanced Model Selection Information

```typescript
const result = await promptRunner.ExecutePrompt(params);

if (result.modelSelectionInfo) {
  // Access the configuration that was used
  const config = result.modelSelectionInfo.aiConfiguration;
  console.log(`Configuration: ${config?.Name || 'Default'}`);
  
  // See all models that were considered
  for (const candidate of result.modelSelectionInfo.modelsConsidered) {
    console.log(`Model: ${candidate.model.Name}`);
    console.log(`  Vendor: ${candidate.vendor?.Name || 'default'}`);
    console.log(`  Priority: ${candidate.priority}`);
    console.log(`  Available: ${candidate.available}`);
    if (!candidate.available) {
      console.log(`  Reason: ${candidate.unavailableReason}`);
    }
  }
  
  // Understand the final selection
  console.log(`Selected: ${result.modelSelectionInfo.modelSelected.Name}`);
  console.log(`Vendor: ${result.modelSelectionInfo.vendorSelected?.Name}`);
  console.log(`Reason: ${result.modelSelectionInfo.selectionReason}`);
  console.log(`Strategy: ${result.modelSelectionInfo.selectionStrategy}`);
}
```

### Database Storage

Model selection information is stored in the `AIPromptRun.ModelSelection` field as JSON, containing:
- Model and vendor IDs (not full entities)
- Configuration ID and name
- Array of considered models with their availability status
- Selection reason and strategy

Additional fields track:
- `SelectionStrategy`: The strategy used ('Default', 'Specific', 'ByPower')
- `ModelPowerRank`: Power rank of the selected model
- `Status`: Execution status ('Pending', 'Running', 'Completed', 'Failed', 'Cancelled')
- `Cancelled`: Boolean flag for cancellation
- `CancellationReason`: Why execution was cancelled
- `ErrorDetails`: Detailed error information for failures

### Benefits

- **Debugging**: Understand why a specific model was selected
- **Monitoring**: Track which models are being used across prompts
- **Optimization**: Identify models that are frequently unavailable
- **Compliance**: Audit model selection for regulatory requirements

## Version History

- **2.78.0** - Added model selection tracking with full entity objects in results
- **2.77.0** - Enhanced status tracking and cancellation support
- **2.76.0** - Added intelligent failover system
- **2.75.0** - Introduced dynamic template composition
- **2.50.0** - Initial release with core prompt execution