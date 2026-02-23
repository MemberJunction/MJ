# @memberjunction/computer-use-engine

MemberJunction integration layer for the Computer Use browser automation engine, providing seamless integration with MJ's credential management, AI prompts, actions system, and testing framework.

## Overview

The MJComputerUse package extends the base `@memberjunction/computer-use` engine with deep MemberJunction integration. It bridges vision-based browser automation with MJ's infrastructure, enabling:

- **AIPromptRunner Integration**: Execute controller and judge prompts through MJ's prompt system with template rendering and model failover
- **Credential Management**: Automatic resolution of MJ Credential entities to concrete authentication methods
- **Actions-as-Tools**: Wrap any MJ Action as a tool for the controller LLM to invoke
- **Entity Persistence**: Store screenshots and execution history as MJ entities for audit trails
- **Testing Framework**: Full integration with MJ's testing engine for automated browser test execution
- **Agent Linkage**: Connect operations to agent runs for comprehensive tracking

This package is Layer 2 of MJ's Computer Use capabilities - it requires the base `@memberjunction/computer-use` package and provides the MJ-specific orchestration layer.

## Key Features

### 🎨 AIPromptRunner Integration
- **Template Rendering**: Nunjucks template support with context data
- **Model Failover**: Automatic alternative model selection on failures
- **Auto-Selection**: Uses `AIEngine.GetHighestPowerLLM()` for vision models
- **Prompt Entities**: Reference prompts by ID or name for reusability
- **Token Tracking**: Automatic cost and token logging to AIPromptRun entities

### 🔐 MJ Credentials Integration
- **Automatic Resolution**: Convert Credential entities to auth methods
- **Type Mapping**: API Key, Basic Auth, OAuth2 Client Credentials support
- **Secure Decryption**: Handles encrypted credential values transparently
- **Per-Domain Binding**: Different credentials for different domains

### 🛠️ MJ Actions as Tools
- **Metadata-Driven**: Automatically generates JSON Schema from ActionParam metadata
- **Type Safety**: Full TypeScript typing from Action definitions
- **Execution Wrapping**: Converts Action results to tool outputs
- **Extensibility**: Expose any MJ Action to the controller LLM

### 📊 Entity Persistence
- **Screenshot Storage**: AIPromptRunMedia entities for step screenshots
- **Audit Trails**: Complete execution history linked to prompts and agents
- **Agent Run Linkage**: Connect operations to parent agent executions
- **Media Management**: Organized storage with proper entity relationships

### 🧪 Testing Framework Integration
- **ComputerUseTestDriver**: Full MJ testing-engine integration
- **Built-in Oracles**: Goal completion, URL matching, step count validation
- **Composite Scoring**: Weighted oracle results for test evaluation
- **Configuration Validation**: Comprehensive pre-execution checks
- **Timeout Support**: Graceful cancellation with configurable limits

### 📋 Test Oracles
- **Goal Completion Oracle**: Validates FinalJudgeVerdict with confidence thresholds
- **URL Match Oracle**: Regex pattern matching on final URL
- **Step Count Oracle**: Validates efficiency (step count within bounds)
- **Custom Oracles**: Extensible oracle system via global registry

## Installation

```bash
npm install @memberjunction/computer-use-engine
```

**Dependencies**: This package requires the base Computer Use package and core MJ packages:

```bash
npm install @memberjunction/computer-use \
  @memberjunction/core \
  @memberjunction/core-entities \
  @memberjunction/ai \
  @memberjunction/aiengine \
  @memberjunction/ai-prompts \
  @memberjunction/actions \
  @memberjunction/testing-engine
```

## Basic Usage

### Using as an MJ Action

The simplest way to use MJ Computer Use is through the registered `Computer Use` action:

```typescript
import { RunAction } from '@memberjunction/actions';

const result = await RunAction({
    ActionName: 'Computer Use',
    Params: {
        Goal: "Navigate to news.ycombinator.com and get the top story title",
        StartUrl: "https://news.ycombinator.com",
        MaxSteps: "10",
        Headless: "false",
        ControllerPromptName: "Computer Use: Controller",
        JudgePromptName: "Computer Use: Judge"
    },
    ContextUser: contextUser
});

if (result.Success) {
    console.log(`Status: ${result.Params.find(p => p.Name === 'Status')?.Value}`);
    console.log(`Total Steps: ${result.Params.find(p => p.Name === 'TotalSteps')?.Value}`);
    console.log(`Final URL: ${result.Params.find(p => p.Name === 'FinalUrl')?.Value}`);

    // Access screenshot
    const screenshot = result.Params.find(p => p.Name === 'FinalScreenshot')?.Value;
    // screenshot is base64 PNG
}
```

### Using MJComputerUseEngine Directly

For programmatic access with full type safety:

```typescript
import { MJComputerUseEngine, MJRunComputerUseParams, PromptEntityRef } from '@memberjunction/computer-use-engine';
import { Metadata } from '@memberjunction/core';

const engine = new MJComputerUseEngine();
const params = new MJRunComputerUseParams();

// Set goal and basic config
params.Goal = "Login to example.com and navigate to dashboard";
params.StartUrl = "https://example.com/login";
params.MaxSteps = 20;
params.Headless = false;

// Use MJ AI Prompts for controller and judge
params.ControllerPromptRef = new PromptEntityRef();
params.ControllerPromptRef.PromptName = "Computer Use: Controller";

params.JudgePromptRef = new PromptEntityRef();
params.JudgePromptRef.PromptName = "Computer Use: Judge";

// Controller model will auto-select if not specified
// params.ControllerModel = undefined; // Auto-selects vision-capable LLM

// Provide MJ context
params.ContextUser = contextUser;
params.AgentRunId = agentRunId; // Optional: link to agent execution

const result = await engine.Run(params);

if (result.Success) {
    console.log(`Goal completed in ${result.TotalSteps} steps`);
    console.log(`Final URL: ${result.FinalUrl}`);
    console.log(`Judge verdict: ${result.FinalJudgeVerdict?.Reason}`);
}

// Screenshots are automatically persisted as AIPromptRunMedia entities
```

### Using MJ Credentials for Authentication

```typescript
import { MJRunComputerUseParams, MJDomainAuthBinding } from '@memberjunction/computer-use-engine';
import { Metadata } from '@memberjunction/core';

const md = new Metadata();

// Load credentials from MJ
const apiKeyCredential = await md.GetEntityObject<CredentialEntity>('Credentials', contextUser);
await apiKeyCredential.Load(`Name='Example API Key'`);

const oauthCredential = await md.GetEntityObject<CredentialEntity>('Credentials', contextUser);
await oauthCredential.Load(`Name='Example OAuth'`);

// Configure auth bindings
const params = new MJRunComputerUseParams();
params.Auth = new ComputerUseAuthConfig();

// API key for main domain
const apiBinding = new MJDomainAuthBinding(
    ["example.com", "*.example.com"],
    undefined // No explicit method - will be resolved from credential
);
apiBinding.Credential = apiKeyCredential;
params.Auth.Bindings.push(apiBinding);

// OAuth for API subdomain
const oauthBinding = new MJDomainAuthBinding(
    ["api.example.com"],
    undefined
);
oauthBinding.Credential = oauthCredential;
params.Auth.Bindings.push(oauthBinding);

// Engine will automatically resolve Credential to appropriate AuthMethod
const result = await engine.Run(params);
```

**Supported Credential Types** (mapped automatically):
- `"API Key"` → `APIKeyHeaderAuthMethod`
- `"API Key with Endpoint"` → `BearerTokenAuthMethod`
- `"Basic Auth"` → `BasicAuthMethod` (FormLogin variant)
- `"OAuth2 Client Credentials"` → `OAuthClientCredentialsAuthMethod`

### Using MJ Actions as Tools

Expose any MJ Action to the controller LLM as a callable tool:

```typescript
import { MJRunComputerUseParams, ActionRef } from '@memberjunction/computer-use-engine';

const params = new MJRunComputerUseParams();
params.Goal = "Research competitor pricing and send summary email";

// Add actions as tools
params.Actions = [
    { ActionName: "Send Email" },
    { ActionName: "Create Record" },
    { ActionId: "some-uuid-here" } // Can reference by ID
];

params.ContextUser = contextUser;

const result = await engine.Run(params);

// Check which actions were called
for (const step of result.Steps) {
    if (step.ToolCalls) {
        for (const toolCall of step.ToolCalls) {
            console.log(`Action called: ${toolCall.ToolName}`);
            console.log(`Input: ${JSON.stringify(toolCall.Input)}`);
            console.log(`Output: ${JSON.stringify(toolCall.Output)}`);
        }
    }
}
```

**How it works**:
1. Engine loads Action entity metadata
2. Generates JSON Schema from ActionParam metadata
3. Wraps Action as `ComputerUseTool<TInput, TOutput>`
4. Controller can call actions via tool invocation syntax
5. Results returned to controller for adaptation

## Testing Framework Integration

### Creating Computer Use Tests

Define tests using the MJ testing framework with Computer Use configuration:

```typescript
import { Metadata } from '@memberjunction/core';

const md = new Metadata();

// Create test entity
const test = await md.GetEntityObject<TestEntity>('Tests', contextUser);
test.Name = "Login Flow Test";
test.TypeID = "computer-use-type-id"; // Reference to Computer Use test type
test.Status = "Draft";

// Configuration (ComputerUseTestConfig JSON)
test.Configuration = JSON.stringify({
    headless: true,
    maxSteps: 15,
    maxExecutionTime: 120000, // 2 minutes
    controllerPromptName: "Computer Use: Controller",
    judgePromptName: "Computer Use: Judge",
    judgeFrequency: "EveryNSteps:3",
    viewportWidth: 1280,
    viewportHeight: 720,
    oracles: [
        {
            type: "goal-completion",
            weight: 0.6,
            config: { minConfidence: 0.7 }
        },
        {
            type: "url-match",
            weight: 0.4,
            config: { pattern: "^https://example\\.com/dashboard" }
        }
    ],
    scoringWeights: {
        "goal-completion": 0.6,
        "url-match": 0.4
    }
});

// Input Definition (ComputerUseTestInput JSON)
test.InputDefinition = JSON.stringify({
    goal: "Login to example.com with test credentials and navigate to dashboard",
    startUrl: "https://example.com/login",
    allowedDomains: ["example.com", "*.example.com"],
    auth: {
        bindings: [
            {
                domains: ["example.com"],
                credentialName: "Test User Credentials"
            }
        ]
    }
});

// Expected Outcomes (ComputerUseExpectedOutcomes JSON)
test.ExpectedOutcomes = JSON.stringify({
    goalCompleted: true,
    finalUrlPattern: "^https://example\\.com/dashboard",
    minConfidence: 0.7,
    maxSteps: 15
});

await test.Save();
```

### Running Tests Programmatically

```typescript
import { ComputerUseTestDriver } from '@memberjunction/computer-use-engine';
import { TestRunnerEngine } from '@memberjunction/testing-engine';

const driver = new ComputerUseTestDriver();
const testRunner = new TestRunnerEngine();

// Execute test
const result = await testRunner.RunTest({
    TestId: test.ID,
    ContextUser: contextUser
});

console.log(`Test Status: ${result.Status}`);
console.log(`Overall Score: ${result.Score}`);
console.log(`Duration: ${result.DurationMs}ms`);

// Check oracle results
for (const oracleResult of result.OracleResults) {
    console.log(`Oracle: ${oracleResult.Type}`);
    console.log(`  Passed: ${oracleResult.Passed}`);
    console.log(`  Score: ${oracleResult.Score}`);
    console.log(`  Message: ${oracleResult.Message}`);
}
```

### Built-in Oracle Types

#### Goal Completion Oracle

Validates that the judge determined the goal was completed with sufficient confidence:

```json
{
    "type": "goal-completion",
    "weight": 0.6,
    "config": {
        "minConfidence": 0.7
    }
}
```

**Scoring**:
- Engine failure: 0.0
- No verdict: 0.5
- Judge says not done: `Confidence * 0.5`
- Below threshold: `Confidence` score
- Passed: `Confidence` score (0.5-1.0)

#### URL Match Oracle

Validates final browser URL matches expected regex pattern:

```json
{
    "type": "url-match",
    "weight": 0.3,
    "config": {
        "pattern": "^https://example\\.com/dashboard$"
    }
}
```

**Scoring**:
- Match: 1.0
- No match: 0.0

**Alternative**: Can also define in `ExpectedOutcomes.finalUrlPattern` instead of oracle config.

#### Step Count Oracle

Validates task completed within expected number of steps (efficiency check):

```json
{
    "type": "step-count",
    "weight": 0.1,
    "config": {
        "maxSteps": 10
    }
}
```

**Scoring**:
- No limit defined: 1.0
- Within limit: `0.5 + 0.5 * (1 - steps/maxSteps)` (efficiency bonus)
- Exceeds limit: 0.0

**Alternative**: Can also define in `ExpectedOutcomes.maxSteps` or `Configuration.maxSteps`.

### Custom Oracles

Register custom oracle implementations via the global oracle registry:

```typescript
import { OracleRegistry } from '@memberjunction/testing-engine';
import { BaseOracle } from '@memberjunction/testing-engine';

class CustomScreenshotOracle extends BaseOracle {
    async Evaluate(actualOutput: Record<string, unknown>, expectedOutcome: Record<string, unknown>): Promise<OracleResult> {
        // Your custom evaluation logic
        const screenshot = actualOutput.FinalScreenshot as string;

        // Example: check if screenshot contains specific visual element
        const passed = await this.analyzeScreenshot(screenshot);

        return {
            Passed: passed,
            Score: passed ? 1.0 : 0.0,
            Message: passed ? "Screenshot validation passed" : "Expected element not found",
            Type: "custom-screenshot"
        };
    }
}

// Register globally
OracleRegistry.RegisterOracle("custom-screenshot", CustomScreenshotOracle);
```

## Configuration Reference

### MJRunComputerUseParams

Extends `RunComputerUseParams` from base package with MJ-specific fields:

```typescript
class MJRunComputerUseParams extends RunComputerUseParams {
    // Base fields (inherited)
    Goal: string;                      // Required: natural language goal
    StartUrl?: string;
    MaxSteps: number = 30;
    Headless: boolean = true;
    AllowedDomains?: string[];
    BlockedDomains?: string[];
    // ... see base package for full list

    // MJ-specific fields
    ControllerPromptRef?: PromptEntityRef;  // Reference to MJ AI Prompt entity
    JudgePromptRef?: PromptEntityRef;       // Reference to MJ AI Prompt entity
    Actions?: ActionRef[];                  // MJ Actions to expose as tools
    ContextUser?: UserInfo;                 // MJ security context (required)
    AgentRunId?: string;                    // Link to parent agent run
}
```

### PromptEntityRef

Reference to an MJ AI Prompt entity:

```typescript
class PromptEntityRef {
    PromptId?: string;      // Takes precedence - direct entity ID
    PromptName?: string;    // Fallback - lookup by name
}

// Usage
const ref = new PromptEntityRef();
ref.PromptName = "Computer Use: Controller";
// OR
ref.PromptId = "12345678-1234-1234-1234-123456789012";
```

### ActionRef

Reference to an MJ Action entity:

```typescript
class ActionRef {
    ActionId?: string;      // Takes precedence - direct entity ID
    ActionName?: string;    // Fallback - lookup by name
}

// Usage
params.Actions = [
    { ActionName: "Send Email" },
    { ActionName: "Create Record" },
    { ActionId: "specific-action-uuid" }
];
```

### MJDomainAuthBinding

Auth binding that can use MJ Credential entities:

```typescript
class MJDomainAuthBinding extends DomainAuthBinding {
    Credential?: CredentialEntity;  // MJ Credential to use for auth
}

// Usage
const binding = new MJDomainAuthBinding(
    ["example.com"],
    undefined // Method will be auto-resolved from Credential
);
binding.Credential = credentialEntity;
```

**Credential Type Mapping**:
| Credential Type Name | Resolved AuthMethod |
|---------------------|---------------------|
| `"API Key"` | `APIKeyHeaderAuthMethod` |
| `"API Key with Endpoint"` | `BearerTokenAuthMethod` |
| `"Basic Auth"` | `BasicAuthMethod` (FormLogin) |
| `"OAuth2 Client Credentials"` | `OAuthClientCredentialsAuthMethod` |

### ComputerUseTestConfig

Test configuration JSON structure (stored in `TestEntity.Configuration`):

```typescript
{
    headless?: boolean;                      // Default: true
    maxSteps?: number;                       // Default: 30
    maxExecutionTime?: number;               // Timeout in ms (default: 300000)
    screenshotHistoryDepth?: number;         // Ring buffer size
    controllerPromptName?: string;           // MJ prompt name
    judgePromptName?: string;                // MJ prompt name
    controllerModel?: {                      // Explicit model override
        vendor: string;
        model: string;
        driverClass?: string;
    };
    judgeModel?: {                           // Explicit model override
        vendor: string;
        model: string;
        driverClass?: string;
    };
    judgeFrequency?: string;                 // "EveryStep", "EveryNSteps:5", "OnStagnation:3"
    viewportWidth?: number;                  // Default: 1280
    viewportHeight?: number;                 // Default: 720
    oracles?: Array<{                        // Test evaluation rules
        type: string;
        weight: number;
        config?: Record<string, unknown>;
    }>;
    scoringWeights?: Record<string, number>; // Oracle weight overrides
    agentRunId?: string;                     // Link to agent run
    actions?: Array<{                        // MJ Actions as tools
        actionName?: string;
        actionId?: string;
    }>;
}
```

### ComputerUseTestInput

Test input definition JSON (stored in `TestEntity.InputDefinition`):

```typescript
{
    goal: string;                    // Required: natural language goal
    startUrl?: string;               // Starting URL
    allowedDomains?: string[];       // Domain whitelist
    blockedDomains?: string[];       // Domain blacklist
    auth?: {
        bindings?: Array<{
            domains: string[];
            credentialName?: string;
            credentialId?: string;
            method?: Record<string, unknown>;  // Explicit auth method
        }>;
        globalCallback?: string;     // Not supported in JSON - use code
    };
}
```

### ComputerUseExpectedOutcomes

Expected test outcomes JSON (stored in `TestEntity.ExpectedOutcomes`):

```typescript
{
    goalCompleted?: boolean;         // Should goal complete? (default: true)
    finalUrlPattern?: string;        // Regex for final URL validation
    minConfidence?: number;          // Judge confidence threshold (0.0-1.0)
    maxSteps?: number;               // Max steps allowed
    judgeValidationCriteria?: string[];  // Custom criteria (future use)
}
```

## Advanced Usage

### Auto-Selecting Vision Models

When `ControllerModel` is not specified, MJComputerUseEngine automatically selects the highest-power vision-capable model:

```typescript
const params = new MJRunComputerUseParams();
params.Goal = "Analyze this dashboard and extract key metrics";
// No ControllerModel specified

// Engine will call AIEngine.GetHighestPowerLLM() to select best vision model
const result = await engine.Run(params);
```

**Selection Criteria** (from `AIEngine.GetHighestPowerLLM()`):
1. Vision-capable models only (supports image inputs)
2. Highest power rating (from AI Model metadata)
3. Available and active models only

### Custom Prompt Templates with MJ Variables

MJ AI Prompts support Nunjucks templates with context variables:

```
You are controlling a browser to accomplish this goal: {{goal}}

Current step: {{stepNumber}}/{{maxSteps}}
Current URL: {{url}}

{% if judgeFeedback %}
Previous judge feedback: {{judgeFeedback}}
{% endif %}

{% if credentials %}
Available credentials:
{% for cred in credentials %}
  - {{cred.type}}: {{cred.value}}
{% endfor %}
{% endif %}

Analyze the screenshot and determine next action...
```

**Available Template Variables**:
- `{{goal}}` - User's natural language goal
- `{{stepNumber}}` - Current step number
- `{{maxSteps}}` - Maximum steps configured
- `{{url}}` - Current page URL
- `{{judgeFeedback}}` - Feedback from recent judge verdict
- `{{credentials}}` - Auth credentials (for FormLogin)
- `{{tools}}` - JSON schema of available tools

### Persisting Screenshots to Custom Entities

Override `onStepComplete` to implement custom persistence:

```typescript
import { MJComputerUseEngine } from '@memberjunction/computer-use-engine';
import { Metadata } from '@memberjunction/core';

class CustomMJEngine extends MJComputerUseEngine {
    protected override async onStepComplete(
        step: StepRecord,
        context: RunContext
    ): Promise<void> {
        // Call base implementation (persists to AIPromptRunMedia)
        await super.onStepComplete(step, context);

        // Your custom persistence
        const md = new Metadata();
        const customEntity = await md.GetEntityObject('CustomStepLog', this.contextUser);
        customEntity.StepNumber = step.StepNumber;
        customEntity.Screenshot = step.Screenshot;
        customEntity.Reasoning = step.ControllerReasoning;
        customEntity.AgentRunId = this.agentRunId;
        await customEntity.Save();
    }
}
```

### Linking to Agent Runs

Connect Computer Use operations to agent executions for audit trails:

```typescript
const params = new MJRunComputerUseParams();
params.Goal = "Research and summarize competitor features";
params.AgentRunId = agentRun.ID;  // Link to parent agent run
params.ContextUser = contextUser;

const result = await engine.Run(params);

// All screenshots persisted to AIPromptRunMedia will have:
// - Relationship to AIPromptRun
// - AIPromptRun linked to AgentRunId
// - Complete audit trail from agent → run → media
```

### Complex Multi-Domain Authentication

```typescript
import { MJRunComputerUseParams, MJDomainAuthBinding } from '@memberjunction/computer-use-engine';
import { ComputerUseAuthConfig, CookieInjectionAuthMethod } from '@memberjunction/computer-use';

const params = new MJRunComputerUseParams();
params.Auth = new ComputerUseAuthConfig();

// MJ credential for main domain
const mainBinding = new MJDomainAuthBinding(["example.com"], undefined);
mainBinding.Credential = await loadCredential("Example API Key");
params.Auth.Bindings.push(mainBinding);

// Explicit cookie method for subdomain
const cookieBinding = new MJDomainAuthBinding(
    ["secure.example.com"],
    new CookieInjectionAuthMethod({
        Cookies: [{
            Name: "session",
            Value: "secure-token",
            Domain: "secure.example.com",
            Path: "/",
            Secure: true,
            HttpOnly: true
        }]
    })
);
params.Auth.Bindings.push(cookieBinding);

// MJ OAuth for API
const apiBinding = new MJDomainAuthBinding(["api.example.com"], undefined);
apiBinding.Credential = await loadCredential("Example OAuth");
params.Auth.Bindings.push(apiBinding);

const result = await engine.Run(params);
```

### Timeout and Graceful Cancellation

```typescript
import { MJComputerUseEngine } from '@memberjunction/computer-use-engine';

const engine = new MJComputerUseEngine();
const params = new MJRunComputerUseParams();
params.Goal = "Long-running research task...";
params.ContextUser = contextUser;

// Start execution
const resultPromise = engine.Run(params);

// Set timeout
const timeout = setTimeout(() => {
    engine.Stop(); // Graceful cancellation after current step
}, 120000); // 2 minutes

const result = await resultPromise;
clearTimeout(timeout);

if (result.Status === "Cancelled") {
    console.log(`Cancelled after ${result.TotalSteps} steps`);
    console.log(`Partial results available in ${result.Steps.length} steps`);
}
```

## Architecture

### Integration with Base ComputerUse

| Feature | Base Package | MJ Enhancement |
|---------|-------------|----------------|
| **Prompt Execution** | Direct LLM calls | AIPromptRunner with templates and failover |
| **Model Selection** | Explicit in params | Auto-select via `AIEngine.GetHighestPowerLLM()` |
| **Authentication** | Generic `AuthMethod` | MJ Credential entities auto-resolved |
| **Tools** | Custom JS functions | MJ Actions with metadata-driven schemas |
| **Judge** | `LLMJudge` base class | `MJLLMJudge` with prompt entity reference |
| **Persistence** | In-memory only | Screenshots as `AIPromptRunMedia` entities |
| **Testing** | Not provided | Full testing-engine integration |
| **Agent Tracking** | Not supported | `AgentRunId` parameter for linkage |

### Class Hierarchy

```
ComputerUseEngine (base package)
  ↑
MJComputerUseEngine (this package)
  - Override: executeControllerPrompt() → AIPromptRunner
  - Override: executeJudgePrompt() → AIPromptRunner
  - Override: onStepComplete() → AIPromptRunMedia persistence
  - Override: Run() → Resolve MJ references
```

### Data Flow

```
ComputerUseAction.InternalRunAction()
  ↓
Build MJRunComputerUseParams from string params
  ↓
MJComputerUseEngine.Run()
  ↓
Resolve prompt refs → AIPromptEntityExtended
  ↓
Auto-select controller model (if needed)
  ↓
Resolve credential-backed auth bindings
  ↓
Wrap MJ Actions as ComputerUseTool instances
  ↓
Delegate to base ComputerUseEngine.Run()
  ↓
For each step:
  ├─ executeControllerPrompt() → AIPromptRunner
  │   ├─ Template rendering (Nunjucks)
  │   ├─ Model selection with failover
  │   ├─ Prompt run logging
  │   └─ Token/cost tracking
  ├─ Execute browser actions
  ├─ Execute tool calls (wrapped Actions)
  ├─ Judge evaluation (if configured)
  └─ onStepComplete() → AIPromptRunMedia persistence
  ↓
Return ComputerUseResult
  ↓
Map to ActionResultSimple (if from action)
```

### Judge Integration

```typescript
// MJLLMJudge extends base LLMJudge
class MJLLMJudge extends LLMJudge {
    private judgePromptEntity: AIPromptEntityExtended;

    get JudgePromptEntity(): AIPromptEntityExtended {
        return this.judgePromptEntity;
    }
}

// MJComputerUseEngine uses it
const judge = new MJLLMJudge(
    (request) => this.executeJudgePrompt(request),
    judgePromptEntity,
    params.JudgePrompt
);
```

## Best Practices

### ✅ Do

- **Use PromptEntityRef** instead of raw prompt strings for reusability
- **Store prompts as MJ entities** for versioning and team collaboration
- **Link to AgentRunId** for complete audit trails
- **Use MJ Credentials** instead of hardcoded auth values
- **Leverage Actions as tools** for complex operations (email, records, workflows)
- **Set ContextUser** on all MJ operations (required for server-side)
- **Configure test oracles** with appropriate weights for scoring
- **Validate test configurations** before execution (driver does this automatically)
- **Use auto-model-selection** for vision models unless you need specific models
- **Review AIPromptRunMedia** entities for screenshot audit trails
- **Test with representative data** in test InputDefinition
- **Use composite scoring** with multiple oracles for robust tests

### ❌ Don't

- **Don't use `any` types** - MJ maintains strict typing throughout
- **Don't bypass ContextUser** - required for security and audit
- **Don't hardcode credentials** - use MJ Credential entities
- **Don't skip validation** - test driver validates before execution
- **Don't ignore oracle results** - they provide detailed failure analysis
- **Don't use overly broad action lists** - expose only needed actions as tools
- **Don't skip AgentRunId** when running from agents - breaks audit trail
- **Don't modify test config during execution** - params are frozen
- **Don't assume prompt templates are static** - they can be updated in MJ
- **Don't rely on screenshot retention** without configuring `screenshotHistoryDepth`

### Integration Patterns

#### Pattern 1: Agent-Driven Browser Automation

```typescript
// In your MJ Agent implementation
class ResearchAgent extends BaseAgent {
    async Execute(params: AgentParams): Promise<AgentResult> {
        const engine = new MJComputerUseEngine();
        const cuParams = new MJRunComputerUseParams();

        cuParams.Goal = "Research competitor pricing for product X";
        cuParams.StartUrl = "https://google.com";
        cuParams.MaxSteps = 30;

        // Link to this agent run
        cuParams.AgentRunId = this.currentRunId;
        cuParams.ContextUser = params.ContextUser;

        // Use agent's configured prompts
        cuParams.ControllerPromptRef = { PromptName: "Research Agent: Browser Controller" };

        // Expose tools for data extraction
        cuParams.Actions = [
            { ActionName: "Save Research Data" },
            { ActionName: "Create Summary" }
        ];

        const result = await engine.Run(cuParams);

        return {
            Success: result.Success,
            Data: { findings: result.FinalUrl, steps: result.TotalSteps }
        };
    }
}
```

#### Pattern 2: Automated Testing Pipeline

```typescript
// Run all Computer Use tests in CI/CD
import { TestRunnerEngine } from '@memberjunction/testing-engine';
import { RunView } from '@memberjunction/core';

async function runComputerUseTests(contextUser: UserInfo) {
    const rv = new RunView();
    const testsResult = await rv.RunView<TestEntity>({
        EntityName: 'Tests',
        ExtraFilter: `TypeID='computer-use-type-id' AND Status='Active'`,
        ResultType: 'entity_object'
    }, contextUser);

    const runner = new TestRunnerEngine();
    const results = [];

    for (const test of testsResult.Results) {
        const result = await runner.RunTest({
            TestId: test.ID,
            ContextUser: contextUser
        });

        results.push({
            testName: test.Name,
            passed: result.Status === 'Passed',
            score: result.Score,
            duration: result.DurationMs,
            oracles: result.OracleResults
        });
    }

    return results;
}
```

#### Pattern 3: Credential Rotation

```typescript
// Update credentials and re-run tests
async function updateCredentialAndTest(credentialId: string, newValue: string, contextUser: UserInfo) {
    const md = new Metadata();

    // Update credential
    const credential = await md.GetEntityObject<CredentialEntity>('Credentials', contextUser);
    await credential.Load(`ID='${credentialId}'`);
    credential.Value = newValue; // Will be encrypted on save
    await credential.Save();

    // Re-run tests that use this credential
    const tests = await findTestsUsingCredential(credentialId, contextUser);
    const runner = new TestRunnerEngine();

    for (const test of tests) {
        const result = await runner.RunTest({
            TestId: test.ID,
            ContextUser: contextUser
        });

        if (!result.Success) {
            console.error(`Test ${test.Name} failed after credential update`);
        }
    }
}
```

## Troubleshooting

### Prompt Not Found

**Symptoms**: Error "Prompt not found" when running with `PromptEntityRef`.

**Solutions**:
- Verify prompt exists: `SELECT * FROM [AI Prompts] WHERE Name = 'Your Prompt Name'`
- Check ContextUser has access to the prompt entity
- Use PromptId instead of PromptName for explicit reference
- Ensure prompt is active and not deleted

### Action Tool Schema Mismatch

**Symptoms**: Controller calls action but gets validation error.

**Solutions**:
- Review ActionParam metadata for the action
- Check that required parameters are properly defined
- Verify ActionParam types match JSON Schema types
- Test action independently before wrapping as tool
- Check MJ logs for detailed schema validation errors

### Screenshot Not Persisted

**Symptoms**: Expected AIPromptRunMedia entity not created.

**Solutions**:
- Verify `onStepComplete` was called (check logs)
- Ensure ContextUser has permission to create AIPromptRunMedia
- Check that prompt run entity exists and is linked
- Verify database constraints allow media creation
- Review error logs for save failures

### Test Execution Timeout

**Symptoms**: Test exceeds `maxExecutionTime` and is cancelled.

**Solutions**:
- Increase `maxExecutionTime` in test configuration
- Reduce `maxSteps` to prevent runaway execution
- Check if site has unusually slow load times
- Increase navigation timeout: `navigationTimeoutMs`
- Review step history to identify stuck points

### Oracle Scoring Unexpected

**Symptoms**: Test score doesn't match expected value.

**Solutions**:
- Verify `scoringWeights` sum to 1.0
- Check individual oracle scores in `OracleResults`
- Ensure oracle `weight` values are set correctly
- Review oracle-specific `config` parameters
- Check if custom oracles are properly registered

### Auto Model Selection Fails

**Symptoms**: Error "No vision-capable model found".

**Solutions**:
- Verify at least one vision model is configured in MJ
- Check AI Model entities have `SupportsVision: true`
- Ensure models are active and available
- Explicitly set `ControllerModel` as fallback
- Review AIEngine model selection logs

## API Reference

### Primary Exports

```typescript
// Main engine
export { MJComputerUseEngine } from './engine/MJComputerUseEngine';

// Parameter types
export {
    MJRunComputerUseParams,
    PromptEntityRef,
    ActionRef,
    MJDomainAuthBinding
} from './types/mj-params';

// MJ Action wrapper
export { ComputerUseAction } from './action/ComputerUseAction';

// Test driver
export { ComputerUseTestDriver } from './test-driver/ComputerUseTestDriver';

// Test configuration types
export type {
    ComputerUseTestConfig,
    ComputerUseTestInput,
    ComputerUseExpectedOutcomes,
    ComputerUseOracleConfig
} from './test-driver/types';

// Judge implementation
export { MJLLMJudge } from './judge/MJLLMJudge';

// Utilities
export { parseJudgeFrequency } from './utils/judge-frequency-parser';

// Tree-shaking prevention
export { LoadMJComputerUse } from './index';
```

## Contributing

We welcome contributions! Please see the main [MemberJunction Contributing Guide](../../../CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone repository
git clone https://github.com/memberjunction/mj.git
cd mj

# Install dependencies
npm install

# Build dependencies
cd packages/AI/ComputerUse
npm run build

cd ../MJComputerUse
npm run build

# Run tests
npm test
```

### Adding New Oracle Types

1. Create oracle class extending `BaseOracle`
2. Implement `Evaluate()` method
3. Register in `LoadMJComputerUse()` function
4. Add to oracle type documentation

## License

This package is part of the MemberJunction project and is licensed under the MIT License. See [LICENSE](../../../LICENSE) for details.
