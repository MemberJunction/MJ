# @memberjunction/computer-use

A Vision-to-Action browser automation engine that enables LLM-driven web interactions through screenshot analysis and natural language reasoning.

## Overview

The ComputerUse package provides a sophisticated abstraction layer for LLM-controlled browser automation. Unlike traditional browser automation tools that require explicit selectors and DOM knowledge, ComputerUse allows AI models to interact with web pages the same way humans do: by seeing screenshots and reasoning about what actions to take next.

**Core Concept**: The engine captures screenshots of web pages, sends them to vision-capable LLMs, and executes the actions the model determines are necessary to accomplish a natural language goal. A separate judge component evaluates progress and determines goal completion.

This package serves as the foundational layer for MemberJunction's Computer Use capabilities, designed to be extended by the `@memberjunction/mj-computer-use` package for full MJ integration.

## Key Features

### 🎯 Vision-Based Automation
- **Screenshot-Driven Reasoning**: LLMs analyze visual state instead of DOM structure
- **Normalized Coordinate System**: Actions use 1000x1000 space for viewport independence
- **Ring Buffer History**: Maintains bounded screenshot history for context
- **Adaptive Delays**: Configurable screenshot capture delays for render stability

### 🧠 Intelligent Judge System
- **HybridJudge** (Recommended): Combines heuristics with LLM evaluation
  - Zero-cost stuck detection (identical screenshots)
  - Navigation loop detection (URL cycles)
  - Error accumulation tracking
  - LLM fallback for ambiguous cases
- **HeuristicJudge**: Fast, free pattern-based evaluation
- **LLMJudge**: Vision-capable model for nuanced goal assessment
- **Configurable Frequency**: Evaluate every step, every N steps, or on stagnation

### 🔐 Sophisticated Authentication
- **Per-Domain Bindings**: Different auth methods for different domains
- **Lazy Application**: Auth applied on first navigation to each domain
- **Global Callback Support**: SSO and MFA flows via custom callbacks
- **Multiple Auth Types**: Basic, Bearer, API Key, OAuth2, Cookies, LocalStorage, Custom

### 🛠️ Extensible Tool System
- **Type-Safe Tools**: Generic `ComputerUseTool<TInput, TOutput>` with JSON Schema
- **Controller Integration**: Tools exposed to LLM for custom operations
- **Error Resilience**: Tool failures don't crash the step
- **Automatic Schema Generation**: Input/output validation via JSON Schema

### 🌐 Navigation Control
- **Domain Filtering**: Whitelist/blacklist with wildcard support
- **Pattern Matching**: `*.example.com`, exact domains, or wildcard `*`
- **Precedence Rules**: BlockedDomains override AllowedDomains
- **Pre-Navigation Checks**: Validation before browser navigation

### 🔌 Browser Adapter Abstraction
- **Strategy Pattern**: Swap browser implementations (Playwright, Selenium, Puppeteer)
- **PlaywrightBrowserAdapter**: Production-ready Chromium automation
- **Isolated Interface**: No direct browser library dependencies in core logic
- **Extensibility**: Implement `BaseBrowserAdapter` for custom browsers

### 🎪 Robust Error Handling
- **No Uncaught Exceptions**: All errors wrapped in `ComputerUseResult`
- **Categorized Errors**: Browser crashes, timeouts, LLM errors, auth failures, etc.
- **Partial Success**: Tool/action failures captured but don't halt execution
- **Graceful Degradation**: Missing LLM data returns empty actions

### 🎛️ Flexible Configuration
- **Model Selection**: Separate controller and judge models
- **Custom Prompts**: Template-based with variable substitution
- **Browser Settings**: Headless mode, viewport size, user agent, timeouts
- **Performance Tuning**: Max steps, screenshot depth, delays
- **Cooperative Cancellation**: `Stop()` method for graceful termination

## Installation

```bash
npm install @memberjunction/computer-use
```

**Required Peer Dependency**: Install Playwright for the default browser adapter:

```bash
npm install playwright
npx playwright install chromium
```

## Basic Usage

### Simple Goal Execution

```typescript
import { ComputerUseEngine, RunComputerUseParams, ModelConfig } from '@memberjunction/computer-use';

// Create engine instance
const engine = new ComputerUseEngine();

// Configure the run
const params = new RunComputerUseParams();
params.Goal = "Navigate to news.ycombinator.com and find the top story title";
params.StartUrl = "https://news.ycombinator.com";
params.MaxSteps = 10;
params.Headless = false; // Watch the browser work

// Configure models (controller analyzes screenshots, judge evaluates completion)
params.ControllerModel = new ModelConfig("anthropic", "claude-3-5-sonnet-20241022");
params.JudgeModel = new ModelConfig("anthropic", "claude-3-5-sonnet-20241022");

// Execute
const result = await engine.Run(params);

if (result.Success) {
    console.log(`Goal completed in ${result.TotalSteps} steps!`);
    console.log(`Final URL: ${result.FinalUrl}`);
    console.log(`Judge verdict: ${result.FinalJudgeVerdict?.Reason}`);
} else {
    console.error(`Failed: ${result.Status}`);
    if (result.Error) {
        console.error(`Error: ${result.Error.Message}`);
    }
}

// Access step-by-step history
for (const step of result.Steps) {
    console.log(`Step ${step.StepNumber}: ${step.ControllerReasoning}`);
    console.log(`Actions: ${step.ActionsRequested.length}`);
    // step.Screenshot contains base64 PNG for audit/debugging
}
```

### Using Authentication

```typescript
import {
    RunComputerUseParams,
    DomainAuthBinding,
    BasicAuthMethod,
    BearerTokenAuthMethod,
    ComputerUseAuthConfig
} from '@memberjunction/computer-use';

const params = new RunComputerUseParams();
params.Goal = "Login to example.com and check notifications";
params.StartUrl = "https://example.com/login";

// Configure per-domain authentication
const authConfig = new ComputerUseAuthConfig();

// Basic auth for login form (credentials shown to LLM)
authConfig.Bindings.push(new DomainAuthBinding(
    ["example.com"],
    new BasicAuthMethod({
        Username: "user@example.com",
        Password: "secure-password",
        FormLogin: true // LLM will enter credentials into form
    })
));

// Bearer token for API subdomain
authConfig.Bindings.push(new DomainAuthBinding(
    ["api.example.com"],
    new BearerTokenAuthMethod({
        Token: "eyJhbGciOi..."
    })
));

params.Auth = authConfig;

const result = await engine.Run(params);
```

### Adding Custom Tools

```typescript
import { ComputerUseTool, RunComputerUseParams } from '@memberjunction/computer-use';

// Define a tool for the controller LLM to invoke
const weatherTool = new ComputerUseTool<{ city: string }, { temperature: number; condition: string }>(
    "get_weather",
    "Get current weather for a city",
    {
        type: "object",
        properties: {
            city: { type: "string", description: "City name" }
        },
        required: ["city"]
    },
    async (args) => {
        // Your implementation (API call, database lookup, etc.)
        const weather = await fetchWeatherAPI(args.city);
        return {
            temperature: weather.temp,
            condition: weather.condition
        };
    }
);

const params = new RunComputerUseParams();
params.Goal = "Check the weather in San Francisco using the weather tool";
params.Tools = [weatherTool];

const result = await engine.Run(params);

// Access tool call history
for (const step of result.Steps) {
    for (const toolCall of step.ToolCalls || []) {
        console.log(`Tool: ${toolCall.ToolName}`);
        console.log(`Input: ${JSON.stringify(toolCall.Input)}`);
        console.log(`Output: ${JSON.stringify(toolCall.Output)}`);
    }
}
```

### Navigation Control

```typescript
const params = new RunComputerUseParams();
params.Goal = "Research competitor pricing on trusted sites only";
params.StartUrl = "https://google.com";

// Only allow specific trusted domains
params.AllowedDomains = [
    "google.com",
    "competitor1.com",
    "competitor2.com",
    "*.trusteddomain.com" // Wildcard for subdomains
];

// Block known problematic domains
params.BlockedDomains = [
    "ads.example.com",
    "tracker.analytics.com"
];

const result = await engine.Run(params);
// Browser will be prevented from navigating to blocked/non-allowed domains
```

### Judge Configuration

```typescript
import { RunComputerUseParams, EveryNStepsFrequency, OnStagnationFrequency } from '@memberjunction/computer-use';

const params = new RunComputerUseParams();
params.Goal = "Find and save the top 5 tech news headlines";

// Option 1: Evaluate every 3 steps (cost/accuracy balance)
params.JudgeFrequency = new EveryNStepsFrequency(3);

// Option 2: Evaluate only when stuck (cost optimization)
params.JudgeFrequency = new OnStagnationFrequency(3); // After 3 identical screenshots

// Option 3: Evaluate every step (maximum accuracy, higher cost)
// params.JudgeFrequency = new EveryStepFrequency(); // Default

const result = await engine.Run(params);

// Check judge evaluations
for (const step of result.Steps) {
    if (step.JudgeVerdict) {
        console.log(`Step ${step.StepNumber} Judge:`);
        console.log(`  Done: ${step.JudgeVerdict.Done}`);
        console.log(`  Confidence: ${step.JudgeVerdict.Confidence}`);
        console.log(`  Reason: ${step.JudgeVerdict.Reason}`);
        console.log(`  Feedback: ${step.JudgeVerdict.Feedback}`);
    }
}
```

## Architecture

### Core Components

#### ComputerUseEngine

The main orchestrator that manages the entire vision-to-action loop:

```
Run(params)
  → Initialize Components (NavGuard, AuthHandler, ToolProvider, Judge)
  → Launch Browser
  → Apply Global Auth Callback
  → Navigate to StartUrl
  → Main Step Loop:
      ├─ Capture Screenshot → Ring Buffer
      ├─ Build Controller Prompt (goal, screenshots, tools, feedback)
      ├─ Execute Controller Prompt → LLM reasoning
      ├─ Parse Response → Actions + Tool Calls
      ├─ Execute Tool Calls → Wrapped results
      ├─ Scale Actions (1000x1000 → viewport pixels)
      ├─ Execute Browser Actions (with NavGuard + Auth)
      ├─ Evaluate Judge (if frequency indicates)
      ├─ Check Judge verdict (Done=true → exit)
      └─ Track empty steps (3+ consecutive → abort)
  → Close Browser
  → Return ComputerUseResult
```

**Extension Points** (protected virtual methods):
- `executeControllerPrompt()` - Override to use custom LLM routing
- `executeJudgePrompt()` - Override for custom judge execution
- `onStepComplete()` - Hook called after each step (logging, persistence)
- `onRunComplete()` - Hook called at run completion (cleanup, finalization)

#### Browser Adapters

**BaseBrowserAdapter** (abstract interface):
```typescript
abstract class BaseBrowserAdapter {
    abstract Launch(config: BrowserConfig): Promise<void>;
    abstract Close(): Promise<void>;
    abstract Navigate(url: string): Promise<void>;
    abstract CaptureScreenshot(): Promise<string>; // Base64 PNG
    abstract ExecuteAction(action: BrowserAction): Promise<ActionResult>;
    abstract SetExtraHeaders(headers: Record<string, string>): Promise<void>;
    abstract SetCookies(cookies: Cookie[]): Promise<void>;
    abstract SetLocalStorage(domain: string, items: Record<string, string>): Promise<void>;
}
```

**PlaywrightBrowserAdapter** (default implementation):
- Uses Playwright's Chromium for production automation
- Handles all browser action types (Click, Type, Keypress, Scroll, Navigate, etc.)
- Manages viewport scaling and coordinate normalization
- Supports custom headers, cookies, and localStorage injection

**Custom Adapters**: Implement `BaseBrowserAdapter` to use Selenium, Puppeteer, or custom browsers.

#### Judge System

**Judge Verdict Structure**:
```typescript
interface JudgeVerdict {
    Done: boolean;                    // Has the goal been accomplished?
    Confidence: number;               // 0.0 - 1.0 certainty score
    Reason: string;                   // Explanation of the verdict
    Feedback: string;                 // Actionable guidance for controller
    SuggestedNextAction?: string;     // Optional hint (not enforced)
}
```

**Judge Types**:

1. **HeuristicJudge** (zero-cost):
   - Stuck detection: 3+ identical screenshots in a row
   - Loop detection: 2 or 3-length URL navigation cycles
   - Error accumulation: 3+ consecutive step errors
   - Returns `Confidence > 0` when problem detected, `Confidence = 0` when inconclusive

2. **LLMJudge** (vision-based):
   - Analyzes screenshots with LLM to evaluate goal completion
   - Nuanced understanding of visual state
   - Higher cost but handles complex goal states

3. **HybridJudge** (recommended default):
   - Heuristics first (free, fast)
   - LLM fallback when heuristics are inconclusive (cost optimization)
   - Best balance of cost and accuracy

#### Authentication System

**Lifecycle**:
1. **Global Callback** (optional): Runs once after browser launch for SSO/MFA
2. **Per-Domain Bindings**: Applied lazily on first navigation to each domain
3. **First-Match Wins**: First binding in array order matching the domain applies
4. **One-Time Application**: `appliedDomains` Set prevents re-application

**Auth Methods**:

```typescript
// Basic Auth (FormLogin variant with credential exposure)
new BasicAuthMethod({
    Username: "user",
    Password: "pass",
    FormLogin: true  // Credentials shown to controller LLM for form entry
})

// Bearer Token (Authorization header)
new BearerTokenAuthMethod({
    Token: "eyJhbGci..."
})

// API Key Header
new APIKeyHeaderAuthMethod({
    HeaderName: "X-API-Key",
    HeaderValue: "sk-..."
})

// OAuth2 Client Credentials
new OAuthClientCredentialsAuthMethod({
    ClientId: "client-id",
    ClientSecret: "secret",
    TokenEndpoint: "https://auth.example.com/token",
    Scopes: ["read", "write"]
})

// Cookie Injection
new CookieInjectionAuthMethod({
    Cookies: [{
        Name: "session",
        Value: "abc123",
        Domain: "example.com",
        Path: "/",
        Secure: true
    }]
})

// LocalStorage Injection (pre-populated at context creation)
new LocalStorageInjectionAuthMethod({
    Items: {
        "auth_token": "xyz789",
        "user_id": "12345"
    }
})

// Custom Callback
new CustomCallbackAuthMethod({
    Callback: async (adapter) => {
        await adapter.Navigate("https://example.com/custom-auth");
        // Custom auth logic here
    }
})
```

#### Tool System

**Tool Definition**:
```typescript
const tool = new ComputerUseTool<TInput, TOutput>(
    name: string,           // Alphanumeric + underscores only
    description: string,    // LLM-friendly explanation
    inputSchema: object,    // JSON Schema for validation
    handler: async (args: TInput) => Promise<TOutput>,
    outputSchema?: object   // Optional output documentation
);
```

**Tool Execution**:
- Controller LLM requests tool calls in its response
- Engine executes handlers and wraps results in `ToolCallRecord`
- Failures captured but don't crash the step
- Results provided to controller in next prompt for adaptation

**Example Tool Call Record**:
```typescript
interface ToolCallRecord {
    ToolName: string;
    Input: TInput;
    Output?: TOutput;
    Error?: string;
    DurationMs: number;
}
```

#### Navigation Guard

**Purpose**: Enforces domain restrictions to prevent the controller from navigating to untrusted sites.

**Pattern Matching**:
- `*` - Allow all domains (open navigation)
- `example.com` - Exact match only
- `*.example.com` - All subdomains of example.com

**Precedence Rules**:
1. If domain matches `BlockedDomains` → BLOCKED
2. Else if domain matches `AllowedDomains` → ALLOWED
3. Else if `AllowedDomains` is empty → ALLOWED (open navigation)
4. Else → BLOCKED

### Data Flow

#### Coordinate Normalization

The controller LLM reasons about actions in a **normalized 1000x1000 space** regardless of actual viewport size. This provides viewport independence and consistent prompting.

**Flow**:
1. Screenshot captured at actual viewport size (e.g., 1280x720)
2. Controller reasons about clicks at normalized coordinates (e.g., `Click(500, 300)` = center)
3. Engine scales coordinates to actual viewport before browser execution
4. Example: `(500, 300)` normalized → `(640, 216)` at 1280x720 viewport

**Benefits**:
- Prompts don't need to mention viewport size
- Same prompt works across different browser configurations
- LLM reasoning is viewport-agnostic

#### Screenshot Ring Buffer

**Purpose**: Maintain bounded screenshot history without unbounded memory growth.

**Behavior**:
- Configurable via `ScreenshotHistoryDepth` (default: 5)
- Acts as a ring buffer (FIFO eviction)
- Most recent N screenshots included in controller prompt
- Provides temporal context while limiting memory usage

**Example** with depth=3:
```
Step 1: [A] → Buffer: [A]
Step 2: [B] → Buffer: [A, B]
Step 3: [C] → Buffer: [A, B, C]
Step 4: [D] → Buffer: [B, C, D]  (A evicted)
Step 5: [E] → Buffer: [C, D, E]  (B evicted)
```

### Error Handling

**Philosophy**: Never throw exceptions; wrap all errors in results for graceful handling.

**Error Categories** (`ErrorCategory` enum):
- `BrowserCrash` - Browser process terminated unexpectedly
- `NavigationTimeout` - Page load exceeded timeout
- `ElementNotFound` - Action target not found in page
- `LLMError` - LLM API call failed
- `LLMParseError` - LLM response parsing failed
- `ToolExecutionError` - Custom tool handler threw exception
- `AuthenticationError` - Auth method application failed
- `DomainBlocked` - Navigation blocked by NavigationGuard
- `Cancelled` - User called `Stop()` method

**Error Wrapping**:
```typescript
interface ComputerUseError {
    Message: string;
    Category: ErrorCategory;
    Step?: number;
    OriginalError?: Error;
}
```

**Recovery Strategies**:
- **Tool failures**: Wrapped, reported to controller, step continues
- **Action failures**: Wrapped, reported to controller, step continues
- **Parse failures**: Return empty actions, empty step detection triggers after 3 consecutive
- **Fatal errors**: Stop execution, return result with Error field populated

### Configuration

#### Run Parameters

**Required**:
```typescript
params.Goal = "Natural language description of what to accomplish";
```

**Model Configuration**:
```typescript
params.ControllerModel = new ModelConfig("anthropic", "claude-3-5-sonnet-20241022");
params.JudgeModel = new ModelConfig("anthropic", "claude-3-5-sonnet-20241022");

// Optional: Override driver class
params.ControllerModel = new ModelConfig("anthropic", "claude-3-5-sonnet-20241022", "AnthropicLLM");
```

**Browser Configuration**:
```typescript
params.Headless = true;                    // Hide browser window
params.BrowserConfig.ViewportWidth = 1280;
params.BrowserConfig.ViewportHeight = 720;
params.BrowserConfig.UserAgent = "Custom/1.0";
params.BrowserConfig.NavigationTimeoutMs = 30000;  // Page load timeout
params.BrowserConfig.ActionTimeoutMs = 10000;      // Action execution timeout
params.BrowserConfig.SlowMo = 100;                 // Debugging: slow down actions by 100ms
```

**Engine Configuration**:
```typescript
params.MaxSteps = 30;                      // Maximum controller loop iterations
params.ScreenshotHistoryDepth = 5;         // Screenshots in ring buffer
params.ScreenshotDelayMs = 500;            // Wait after action before screenshot
```

**Judge Configuration**:
```typescript
import { EveryStepFrequency, EveryNStepsFrequency, OnStagnationFrequency } from '@memberjunction/computer-use';

params.JudgeFrequency = new EveryStepFrequency();        // Default: every step
params.JudgeFrequency = new EveryNStepsFrequency(5);     // Every 5 steps
params.JudgeFrequency = new OnStagnationFrequency(3);    // After 3 stuck/loop indicators
```

**Navigation Configuration**:
```typescript
params.AllowedDomains = ["example.com", "*.trusted.com", "partner.com"];
params.BlockedDomains = ["ads.example.com", "tracker.com"];
```

**Authentication Configuration**:
```typescript
const authConfig = new ComputerUseAuthConfig();

// Per-domain bindings
authConfig.Bindings.push(new DomainAuthBinding(
    ["example.com", "*.example.com"],
    new BearerTokenAuthMethod({ Token: "..." })
));

// Global callback for SSO/MFA
authConfig.GlobalCallback = async (adapter) => {
    await adapter.Navigate("https://sso.example.com");
    // Custom SSO flow
};

params.Auth = authConfig;
```

**Custom Prompts**:
```typescript
// Override controller prompt (template variables supported)
params.ControllerPrompt = `
You are controlling a browser to accomplish this goal: {{goal}}

Current step: {{stepNumber}}/{{maxSteps}}
Current URL: {{url}}

Previous judge feedback: {{judgeFeedback}}

Analyze the screenshot and determine the next action...
`;

// Override judge prompt
params.JudgePrompt = `
Goal: {{goal}}
Current URL: {{url}}

Has the goal been accomplished? Respond with JSON...
`;
```

**Available Template Variables**:
- `{{goal}}` - User's natural language goal
- `{{stepNumber}}` - Current step number
- `{{maxSteps}}` - Maximum steps configured
- `{{url}}` - Current page URL
- `{{judgeFeedback}}` - Feedback from most recent judge verdict
- `{{credentials}}` - Available auth credentials (for FormLogin scenarios)
- `{{tools}}` - JSON schema of available tools

#### Browser Actions

The controller LLM can request these actions in its response:

```typescript
// Click at normalized coordinates
{
    Type: "Click",
    X: 500,           // 0-1000 normalized
    Y: 300,           // 0-1000 normalized
    Button: "Left",   // "Left" | "Right" | "Middle"
    ClickCount: 1     // Single, double, triple click
}

// Type text
{ Type: "Type", Text: "hello world" }

// Press keys (supports combinations)
{ Type: "Keypress", Key: "Enter" }
{ Type: "Keypress", Key: "Shift+A" }
{ Type: "Keypress", Key: "ControlOrMeta+C" }  // Ctrl on Windows/Linux, Cmd on Mac

// Individual key state
{ Type: "KeyDown", Key: "Shift" }
{ Type: "KeyUp", Key: "Shift" }

// Scroll
{ Type: "Scroll", DeltaX: 0, DeltaY: -100 }  // Negative = up

// Wait (for loading, animations)
{ Type: "Wait", DurationMs: 2000 }

// Navigate to URL
{ Type: "Navigate", Url: "https://example.com" }

// Browser navigation
{ Type: "GoBack" }
{ Type: "GoForward" }
{ Type: "Refresh" }
```

#### Results

```typescript
interface ComputerUseResult {
    Success: boolean;                      // Goal accomplished?
    Status: ComputerUseStatus;             // Terminal state
    Steps: StepRecord[];                   // Complete history
    TotalSteps: number;
    TotalDurationMs: number;
    FinalScreenshot?: string;              // Base64 PNG
    FinalUrl?: string;
    FinalJudgeVerdict?: JudgeVerdict;
    Error?: ComputerUseError;              // If Status is 'Error'
}

type ComputerUseStatus =
    | "Completed"        // Goal achieved (judge verdict Done=true)
    | "Failed"           // Judge determined goal failed
    | "MaxStepsReached"  // Hit MaxSteps without completion
    | "Error"            // Fatal error occurred
    | "Cancelled";       // Stop() called
```

```typescript
interface StepRecord {
    StepNumber: number;                    // 1-indexed
    Screenshot: string;                    // Base64 PNG
    ControllerReasoning: string;           // LLM's explanation
    ActionsRequested: BrowserAction[];
    ActionResults: ActionResult[];
    ToolCalls?: ToolCallRecord[];
    JudgeVerdict?: JudgeVerdict;           // If evaluated this step
    DurationMs: number;
    Error?: ComputerUseError;
    Url: string;
}
```

## Advanced Usage

### Extending ComputerUseEngine

The engine is designed to be subclassed for custom integrations:

```typescript
import { ComputerUseEngine, RunComputerUseParams } from '@memberjunction/computer-use';

class CustomComputerUseEngine extends ComputerUseEngine {
    // Override to use custom LLM routing
    protected override async executeControllerPrompt(
        request: ControllerPromptRequest
    ): Promise<string> {
        // Your custom LLM integration
        const response = await myCustomLLMService.call({
            prompt: request.Prompt,
            images: request.Screenshots,
            tools: request.Tools
        });
        return response.text;
    }

    // Override to use custom judge execution
    protected override async executeJudgePrompt(
        request: JudgePromptRequest
    ): Promise<string> {
        // Your custom judge logic
        return await myJudgeService.evaluate(request);
    }

    // Hook called after each step
    protected override async onStepComplete(
        step: StepRecord,
        context: RunContext
    ): Promise<void> {
        // Custom logging, persistence, etc.
        await this.saveStepToDatabase(step);
    }

    // Hook called at run completion
    protected override async onRunComplete(
        result: ComputerUseResult,
        context: RunContext
    ): Promise<void> {
        // Cleanup, finalization, etc.
        await this.updateDashboard(result);
    }
}

const engine = new CustomComputerUseEngine();
const result = await engine.Run(params);
```

### Custom Browser Adapters

Implement `BaseBrowserAdapter` to use alternative browser automation libraries:

```typescript
import { BaseBrowserAdapter, BrowserConfig, BrowserAction, ActionResult } from '@memberjunction/computer-use';

class SeleniumBrowserAdapter extends BaseBrowserAdapter {
    private driver: WebDriver;

    async Launch(config: BrowserConfig): Promise<void> {
        // Initialize Selenium WebDriver
        this.driver = await new Builder()
            .forBrowser('chrome')
            .setChromeOptions(new ChromeOptions().headless())
            .build();
    }

    async CaptureScreenshot(): Promise<string> {
        return await this.driver.takeScreenshot();
    }

    async ExecuteAction(action: BrowserAction): Promise<ActionResult> {
        switch (action.Type) {
            case "Click":
                // Selenium click implementation
                break;
            case "Type":
                // Selenium type implementation
                break;
            // ... implement all action types
        }
    }

    // ... implement remaining abstract methods
}

// Use custom adapter
const engine = new ComputerUseEngine();
const params = new RunComputerUseParams();
params.BrowserAdapter = new SeleniumBrowserAdapter();
```

### Cooperative Cancellation

For long-running tasks, support graceful cancellation:

```typescript
const engine = new ComputerUseEngine();
const params = new RunComputerUseParams();
params.Goal = "Long-running research task...";

// Start execution (non-blocking)
const resultPromise = engine.Run(params);

// Cancel after 60 seconds
setTimeout(() => {
    engine.Stop(); // Graceful cancellation after current step
}, 60000);

const result = await resultPromise;
if (result.Status === "Cancelled") {
    console.log("Run was cancelled");
    console.log(`Completed ${result.TotalSteps} steps before cancellation`);
}
```

### Multi-Step SSO Authentication

Handle complex authentication flows with global callbacks:

```typescript
const authConfig = new ComputerUseAuthConfig();

// Global callback for SSO flow
authConfig.GlobalCallback = async (adapter) => {
    // Navigate to SSO login
    await adapter.Navigate("https://sso.example.com/login");

    // Wait for redirect
    await adapter.ExecuteAction({ Type: "Wait", DurationMs: 2000 });

    // Enter credentials (these would be from secure storage)
    await adapter.ExecuteAction({ Type: "Type", Text: "username" });
    await adapter.ExecuteAction({ Type: "Keypress", Key: "Tab" });
    await adapter.ExecuteAction({ Type: "Type", Text: "password" });
    await adapter.ExecuteAction({ Type: "Keypress", Key: "Enter" });

    // Wait for MFA prompt
    await adapter.ExecuteAction({ Type: "Wait", DurationMs: 3000 });

    // Handle MFA (could integrate with authenticator app)
    const mfaCode = await getMFACode();
    await adapter.ExecuteAction({ Type: "Type", Text: mfaCode });
    await adapter.ExecuteAction({ Type: "Keypress", Key: "Enter" });
};

params.Auth = authConfig;
```

## Best Practices

### ✅ Do

- **Use HybridJudge** for the best cost/accuracy balance
- **Set reasonable MaxSteps** (20-50) to prevent runaway costs
- **Configure AllowedDomains** for security-sensitive tasks
- **Use ring buffer depth of 3-5** for sufficient context without memory bloat
- **Add descriptive tool descriptions** so the LLM understands when to use them
- **Test with Headless=false** initially to debug controller behavior
- **Check result.Success** before accessing step data
- **Store screenshots** from critical steps for audit trails
- **Use EveryNSteps or OnStagnation** for cost optimization on long tasks
- **Provide clear, specific goals** for better controller performance
- **Use template variables** in custom prompts for flexibility
- **Implement onStepComplete** for persistence in production
- **Set appropriate timeouts** based on expected page load times

### ❌ Don't

- **Don't use `any` types** - this package maintains full type safety
- **Don't ignore result.Error** - check for errors even if Success is false
- **Don't modify params during execution** - params are frozen after Run() starts
- **Don't call Run() concurrently** on the same engine instance - create separate instances
- **Don't assume screenshots are identical** to visual equality - use judge evaluation
- **Don't expose sensitive credentials** in FormLogin scenarios without review
- **Don't use EveryStep judge frequency** for long tasks (cost explosion)
- **Don't hardcode viewport sizes** in custom prompts - use normalized coordinates
- **Don't skip error handling** for tool implementations - wrap in try/catch
- **Don't use overly broad AllowedDomains** (`*`) for security-sensitive tasks
- **Don't rely on precise element targeting** - this is vision-based, not selector-based
- **Don't expect pixel-perfect clicking** - vision models approximate element centers

### Performance Optimization

1. **Judge Frequency**: Use `EveryNStepsFrequency(5)` or `OnStagnationFrequency(3)` for long tasks
2. **Screenshot Depth**: Use depth of 3-5; more history = larger prompts = higher cost
3. **Screenshot Delay**: Tune based on site render times (100-500ms for static, 1000ms+ for SPAs)
4. **Model Selection**: Use lighter models for simple tasks (Claude Haiku for basic navigation)
5. **Max Steps**: Set based on expected task complexity (simple navigation: 10, complex research: 50)

### Security Considerations

1. **Domain Whitelisting**: Always use `AllowedDomains` for production tasks
2. **Credential Exposure**: Be cautious with `FormLogin: true` - credentials are shown to LLM
3. **Tool Validation**: Validate tool inputs thoroughly to prevent injection attacks
4. **Screenshot Retention**: PII/PHI may appear in screenshots - handle according to compliance needs
5. **Error Messages**: Don't expose sensitive system details in error messages
6. **Network Isolation**: Consider running in sandboxed environments for untrusted goals

### Debugging Tips

1. **Enable visual mode**: Set `Headless: false` to watch the browser
2. **Slow down execution**: Use `SlowMo: 1000` to see each action clearly
3. **Check step reasoning**: Examine `step.ControllerReasoning` to understand LLM decisions
4. **Review screenshots**: Decode `step.Screenshot` base64 to see what the LLM saw
5. **Enable judge every step**: Use `EveryStepFrequency()` for detailed evaluation
6. **Check action results**: Review `step.ActionResults` for execution details
7. **Monitor tool calls**: Examine `step.ToolCalls` for tool execution history
8. **Review judge feedback**: Check `step.JudgeVerdict.Feedback` for guidance

## Troubleshooting

### Controller keeps clicking the same element

**Cause**: Vision model may not detect state changes from previous actions.

**Solution**:
- Increase `ScreenshotDelayMs` to allow more render time
- Check if site uses animations that obscure state changes
- Add custom feedback in judge prompts about progress indicators

### Browser times out on navigation

**Cause**: Page load exceeds `NavigationTimeoutMs`.

**Solution**:
- Increase timeout: `params.BrowserConfig.NavigationTimeoutMs = 60000`
- Check if site has slow resources (fonts, analytics)
- Use navigation guard to skip slow third-party domains

### Judge always says goal is incomplete

**Cause**: Goal may be ambiguous or too complex for vision-based evaluation.

**Solution**:
- Break down into smaller, more specific goals
- Provide more explicit success criteria in goal description
- Add URL pattern or element checks to judge prompt
- Use custom tools to verify state programmatically

### Tool calls failing repeatedly

**Cause**: JSON Schema mismatch or handler exceptions.

**Solution**:
- Validate tool input schema matches handler expectations
- Add error handling in tool handler with descriptive messages
- Check `step.ToolCalls[].Error` for specific failure reasons
- Ensure async handlers return promises correctly

### MaxSteps reached without completion

**Cause**: Goal too complex, controller stuck, or judge not evaluating.

**Solution**:
- Increase `MaxSteps` for complex tasks
- Review step reasoning to identify loops
- Enable HybridJudge to detect stuck states
- Simplify goal or break into multiple runs

## Contributing

We welcome contributions! Please see the main [MemberJunction Contributing Guide](../../../CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone repository
git clone https://github.com/memberjunction/mj.git
cd mj

# Install dependencies
npm install

# Build the package
cd packages/AI/ComputerUse
npm run build

# Run tests
npm test
```

### Prompt Sync Process

The package includes default prompts for the controller and judge LLMs. These prompts are automatically synced from MemberJunction metadata during the build process:

- **Source**: `metadata/prompts/templates/computer-use/` (metadata definitions)
- **Target**: `packages/AI/ComputerUse/src/prompts/` (package code)
- **Sync Script**: `scripts/sync-prompts.mjs` (runs automatically as prebuild step)

The script converts Nunjucks-style metadata templates to simple TypeScript constants. If you modify the metadata prompts, they'll be automatically synced the next time you run `npm run build`.

For more details, see [scripts/README.md](scripts/README.md).

## License

This package is part of the MemberJunction project and is licensed under the MIT License. See [LICENSE](../../../LICENSE) for details.
