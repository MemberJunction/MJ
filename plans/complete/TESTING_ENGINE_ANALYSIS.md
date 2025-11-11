# Testing Engine Architecture Analysis

## Executive Summary

The Testing Framework Engine is a well-structured, extensible system for executing and evaluating tests in MemberJunction. It follows established patterns from the AI Agent framework and can be invoked from the UI through a GraphQL resolver pattern similar to `RunAIAgentResolver`.

---

## 1. Testing Engine Package Structure

**Location**: `/packages/TestingFramework/Engine/`

### Core Components

```
Engine/
├── src/
│   ├── engine/
│   │   └── TestEngine.ts          # Main orchestrator (singleton)
│   ├── drivers/
│   │   ├── BaseTestDriver.ts      # Abstract base for all drivers
│   │   └── AgentEvalDriver.ts     # Concrete implementation for agent testing
│   ├── oracles/
│   │   ├── IOracle.ts             # Oracle interface
│   │   ├── ExactMatchOracle.ts    # Deterministic matching
│   │   ├── SchemaValidatorOracle.ts
│   │   ├── TraceValidatorOracle.ts
│   │   ├── LLMJudgeOracle.ts
│   │   └── SQLValidatorOracle.ts
│   ├── types.ts                   # Core type definitions
│   └── utils/
│       ├── cost-calculator.ts
│       ├── scoring.ts
│       └── result-formatter.ts
```

---

## 2. Main Entry Points and APIs

### TestEngine Class (Singleton Pattern)

**File**: `/packages/TestingFramework/Engine/src/engine/TestEngine.ts`

#### Initialization
```typescript
// Get singleton instance
const engine = TestEngine.Instance;

// Must call Config() before use
await engine.Config(false, contextUser);
```

#### Key Methods for Test Execution

**1. Run Single Test**
```typescript
public async RunTest(
    testId: string,
    options: TestRunOptions,
    contextUser: UserInfo
): Promise<TestRunResult>
```

**Parameters**:
- `testId`: ID of test to execute
- `options`: 
  - `verbose?: boolean` - Enable verbose logging
  - `dryRun?: boolean` - Validate without executing
  - `environment?: string` - Execution environment (dev, staging, prod)
  - `gitCommit?: string` - Version being tested
  - `agentVersion?: string` - Agent/system version
  - `configOverride?: Record<string, unknown>` - Override test config

**Returns**: `TestRunResult` with complete execution data
- `testRunId`, `testId`, `testName`
- `status: 'Passed' | 'Failed' | 'Skipped' | 'Error'`
- `score: number` (0.0 to 1.0)
- `passedChecks`, `failedChecks`, `totalChecks`
- `oracleResults: OracleResult[]`
- `targetType`, `targetLogId`
- `durationMs`, `totalCost`
- `startedAt`, `completedAt`

**2. Run Test Suite**
```typescript
public async RunSuite(
    suiteId: string,
    options: TestRunOptions,
    contextUser: UserInfo
): Promise<TestSuiteRunResult>
```

**Returns**: `TestSuiteRunResult`
- Suite-level metrics (passed/failed tests, average score)
- Array of individual `TestRunResult[]`
- Aggregated cost and duration

#### Oracle Management
```typescript
// Register custom oracle
public RegisterOracle(oracle: IOracle): void

// Get oracle by type
public GetOracle(type: string): IOracle | undefined

// Get all registered oracle types
public GetOracleTypes(): string[]
```

---

## 3. How Tests Are Invoked/Executed

### Execution Flow

```
RunTest() / RunSuite()
    ↓
1. Load Test/Suite Entities
    ↓
2. Get TestType (determines which Driver to use)
    ↓
3. Get/Create Driver (via ClassFactory)
    ↓
4. Create TestRun Entity (marks status as 'Running')
    ↓
5. Execute via Driver.Execute()
    ├─ Parse Configuration, InputDefinition, ExpectedOutcomes
    ├─ Execute test-specific logic (e.g., run agent)
    └─ Run Oracles to evaluate results
    ↓
6. Update TestRun Entity with results
    ↓
7. Return TestRunResult
```

### Parameters Needed for Test Execution

**From Test Entity** (stored in database):
- `TypeID` - References TestType (determines driver)
- `Configuration` - JSON with test-specific config
- `InputDefinition` - JSON input for the test
- `ExpectedOutcomes` - JSON expected results
- `Name` - Test name

**From TestType Entity**:
- `DriverClass` - Class name of driver (e.g., 'AgentEvalDriver')
- Used by ClassFactory to instantiate correct driver

**From TestRunOptions**:
- `verbose` - Enable logging
- `dryRun` - Validate without executing
- `environment`, `gitCommit`, `agentVersion` - Metadata
- `configOverride` - Override stored configuration

---

## 4. Progress and Status Reporting

### Current Implementation

**Status Updates During Execution**:
```typescript
// In TestEngine
private log(message: string, verboseOnly: boolean = false): void {
    LogStatusEx({
        message: `[TestEngine] ${message}`,
        verboseOnly,
        isVerboseEnabled: () => IsVerboseLoggingEnabled()
    });
}
```

**TestRun Entity Updates**:
- `Status` field set to: 'Running' → 'Passed'/'Failed'/'Error'
- `StartedAt`, `CompletedAt` timestamps
- `Score` - Overall score (0.0-1.0)
- `PassedChecks`, `FailedChecks`, `TotalChecks`
- `ResultDetails` - JSON with oracle results

**No Built-in Streaming**: Current implementation does not have streaming callbacks like `RunAIAgentResolver`. However, the architecture is designed to support them:

```typescript
// Driver receives full context including options for progress reporting
private async ExecuteAIAgent(
    // ... params ...
    onProgress?: (progress: any) => void;
    onStreaming?: (chunk: any) => void;
)
```

---

## 5. Return Types and Result Structures

### TestRunResult (Individual Test)
```typescript
interface TestRunResult {
    testRunId: string;           // Database ID
    testId: string;              // Test ID
    testName: string;            // Test name (lookup field)
    status: 'Passed' | 'Failed' | 'Skipped' | 'Error';
    score: number;               // 0.0-1.0
    passedChecks: number;        // Oracles that passed
    failedChecks: number;
    totalChecks: number;         // Total oracles run
    oracleResults: OracleResult[];  // Details from each oracle
    targetType: string;          // 'AI Agent', etc.
    targetLogId: string;         // ID of related entity (AgentRun)
    durationMs: number;
    totalCost: number;           // USD
    startedAt: Date;
    completedAt: Date;
    errorMessage?: string;       // If status is Error
}
```

### TestSuiteRunResult (Suite of Tests)
```typescript
interface TestSuiteRunResult {
    suiteRunId: string;
    suiteId: string;
    suiteName: string;
    status: 'Completed' | 'Failed' | 'Cancelled' | 'Pending' | 'Running';
    passedTests: number;
    failedTests: number;
    totalTests: number;
    averageScore: number;        // Average of test scores
    testResults: TestRunResult[];  // Individual test results
    durationMs: number;
    totalCost: number;           // Aggregated cost
    startedAt: Date;
    completedAt: Date;
}
```

### OracleResult
```typescript
interface OracleResult {
    oracleType: string;          // 'exact-match', 'llm-judge', etc.
    passed: boolean;
    score: number;               // 0.0-1.0
    message: string;             // Human-readable result
    details?: unknown;           // Oracle-specific details
}
```

---

## 6. Driver Architecture

### BaseTestDriver (Abstract)

**Location**: `/packages/TestingFramework/Engine/src/drivers/BaseTestDriver.ts`

**Responsibilities**:
- Parse Configuration, InputDefinition, ExpectedOutcomes (all JSON)
- Execute test-specific logic
- Run oracles to evaluate results
- Calculate score and determine pass/fail status

**Key Methods**:

```typescript
// Main execution method - must be implemented by subclasses
abstract Execute(context: DriverExecutionContext): Promise<DriverExecutionResult>

// Validation - can be overridden for type-specific checks
async Validate(test: TestEntity): Promise<ValidationResult>

// Score calculation helpers
protected calculateScore(
    oracleResults: OracleResult[],
    weights?: ScoringWeights
): number

protected determineStatus(oracleResults: OracleResult[]): 'Passed' | 'Failed'

// Configuration parsing helpers
protected parseConfig<T>(test: TestEntity): T
protected parseInputDefinition<T>(test: TestEntity): T
protected parseExpectedOutcomes<T>(test: TestEntity): T
```

### AgentEvalDriver (Concrete Implementation)

**Location**: `/packages/TestingFramework/Engine/src/drivers/AgentEvalDriver.ts`

**Registration**:
```typescript
@RegisterClass(BaseTestDriver, 'AgentEvalDriver')
export class AgentEvalDriver extends BaseTestDriver {
```

**Example Configuration** (JSON in Test entity):
```typescript
interface AgentEvalConfig {
    agentId: string;                    // Agent to test
    oracles: {
        type: string;                   // 'llm-judge', 'trace-no-errors', etc.
        config?: Record<string, unknown>;
        weight?: number;
    }[];
    scoringWeights?: Record<string, number>;
    maxExecutionTime?: number;
}
```

**Execution Steps**:
1. Parse configuration
2. Load agent entity
3. Execute agent via AgentRunner
4. Create bidirectional link (TestRun ↔ AgentRun)
5. Run configured oracles
6. Calculate score and status
7. Return results

---

## 7. Oracle System

### IOracle Interface

```typescript
export interface IOracle {
    readonly type: string;  // 'exact-match', 'llm-judge', etc.
    
    evaluate(
        input: OracleInput,
        config: OracleConfig
    ): Promise<OracleResult>;
}
```

### Built-in Oracles

1. **ExactMatchOracle** (`exact-match`)
   - Modes: 'exact', 'contains', 'regex', 'deep', 'partial'
   - Deterministic output comparison

2. **SchemaValidatorOracle** (`schema-validate`)
   - JSON schema validation

3. **TraceValidatorOracle** (`trace-no-errors`)
   - Execution safety checks

4. **LLMJudgeOracle** (`llm-judge`)
   - LLM-based semantic validation

5. **SQLValidatorOracle** (`sql-validate`)
   - Database state verification

### Custom Oracle Example

```typescript
export class MyOracleOracle implements IOracle {
    readonly type = 'my-oracle';

    async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
        // Implement evaluation logic
        return {
            oracleType: this.type,
            passed: true,
            score: 0.95,
            message: 'Custom check passed'
        };
    }
}

// Register it
const engine = TestEngine.Instance;
engine.RegisterOracle(new MyOracleOracle());
```

---

## 8. GraphQL Resolver Pattern (For UI Invocation)

### Reference: RunAIAgentResolver

**Location**: `/packages/MJServer/src/resolvers/RunAIAgentResolver.ts`

This resolver shows the pattern for invoking async operations from the UI:

**Key Features**:
1. **Separate internal and public methods**
   - `executeAIAgent()` - Internal logic (used by both Mutation and Query)
   - `RunAIAgent()` - Public mutation (authenticated users)
   - `RunAIAgentSystemUser()` - System user query (elevated privileges)

2. **Progress streaming with PubSub**
   ```typescript
   @Mutation(() => AIAgentRunResult)
   async RunAIAgent(
       @Arg('agentId') agentId: string,
       @Ctx() { userPayload, providers, dataSource }: AppContext,
       @Arg('messages') messagesJson: string,
       @Arg('sessionId') sessionId: string,
       @PubSub() pubSub: PubSubEngine,  // For streaming updates
       // ... other args ...
   ): Promise<AIAgentRunResult>
   ```

3. **Result type with scalars only** (for JSON serialization)
   ```typescript
   @ObjectType()
   export class AIAgentRunResult {
       @Field() success: boolean;
       @Field({ nullable: true }) errorMessage?: string;
       @Field({ nullable: true }) executionTimeMs?: number;
       @Field() result: string;  // JSON stringified result
   }
   ```

4. **PubSub streaming pattern**
   ```typescript
   // Create progress callback
   private createProgressCallback(pubSub: PubSubEngine, sessionId: string, ...){
       return (progress: any) => {
           pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
               message: JSON.stringify({ /* progress data */ }),
               sessionId: userPayload.sessionId,
           });
       };
   }
   ```

### Proposed Test Resolver Pattern

See section 9 below.

---

## 9. Proposed GraphQL Resolver for Testing

### Architecture

Create a new resolver: `RunTestResolver.ts`

**Pattern** (following `RunAIAgentResolver`):

```typescript
// Test Results Type
@ObjectType()
export class TestRunResultType {
    @Field() testRunId: string;
    @Field() testId: string;
    @Field() testName: string;
    @Field() status: string;  // 'Passed' | 'Failed' | 'Error' | 'Skipped'
    @Field() score: number;
    @Field() passedChecks: number;
    @Field() failedChecks: number;
    @Field() totalChecks: number;
    @Field() targetType: string;
    @Field() targetLogId: string;
    @Field() durationMs: number;
    @Field() totalCost: number;
    @Field() startedAt: Date;
    @Field() completedAt: Date;
    @Field({ nullable: true }) errorMessage?: string;
    @Field() oracleResults: string;  // JSON stringified OracleResult[]
}

@ObjectType()
export class RunTestResult {
    @Field() success: boolean;
    @Field({ nullable: true }) errorMessage?: string;
    @Field({ nullable: true }) executionTimeMs?: number;
    @Field() result: string;  // JSON stringified TestRunResultType
}

// Resolver
@Resolver()
export class RunTestResolver extends ResolverBase {
    
    // Internal execution method
    private async executeTest(
        testId: string,
        userPayload: UserPayload,
        pubSub: PubSubEngine,
        sessionId: string,
        options?: string  // JSON stringified TestRunOptions
    ): Promise<RunTestResult> {
        const startTime = Date.now();
        
        try {
            // Parse options
            const testOptions: TestRunOptions = options 
                ? JSON.parse(options) 
                : { verbose: false };
            
            // Get current user
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                throw new Error('Unable to determine current user');
            }
            
            // Get test engine singleton
            const engine = TestEngine.Instance;
            await engine.Config(false, currentUser);
            
            // Execute test
            const testResult = await engine.RunTest(testId, testOptions, currentUser);
            
            // Serialize and return
            return {
                success: true,
                executionTimeMs: Date.now() - startTime,
                result: JSON.stringify(testResult)
            };
            
        } catch (error) {
            return {
                success: false,
                errorMessage: (error as Error).message,
                executionTimeMs: Date.now() - startTime,
                result: JSON.stringify({ error: (error as Error).message })
            };
        }
    }
    
    // Public mutation
    @Mutation(() => RunTestResult)
    async RunTest(
        @Arg('testId') testId: string,
        @Arg('sessionId') sessionId: string,
        @Ctx() { userPayload, providers, dataSource }: AppContext,
        @PubSub() pubSub: PubSubEngine,
        @Arg('options', { nullable: true }) options?: string
    ): Promise<RunTestResult> {
        return this.executeTest(testId, userPayload, pubSub, sessionId, options);
    }
}
```

### Resolver Registration

**Automatic via glob pattern**:
- MJServer scans `/src/resolvers/**/*Resolver.ts`
- Registers all exported resolver classes
- File should be named `RunTestResolver.ts`

**Exports in index.ts**:
```typescript
export * from './resolvers/RunTestResolver.js';
```

**Usage in GraphQL**:
```graphql
mutation RunTest(
    $testId: String!
    $sessionId: String!
    $options: String
) {
    RunTest(testId: $testId, sessionId: $sessionId, options: $options) {
        success
        errorMessage
        executionTimeMs
        result
    }
}
```

---

## 10. Key Design Patterns

### Singleton Pattern (TestEngine)
- Single instance shared across application
- Lazy initialization with `Instance` getter
- Configuration required before use

### ClassFactory Pattern (Drivers)
```typescript
// In TestEngine
const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseTestDriver>(
    BaseTestDriver,
    testType.DriverClass  // 'AgentEvalDriver'
);
```

### Registry Pattern (Oracles)
```typescript
// Store oracles in map
private _oracleRegistry = new Map<string, IOracle>();

// Get by type
public GetOracle(type: string): IOracle | undefined
```

### Template Method Pattern (BaseTestDriver)
- Abstract `Execute()` - overridden by subclasses
- Protected helper methods - used by subclasses
- Shared logic for parsing, scoring, etc.

---

## 11. Dependencies and Imports

**Core**: 
- `@memberjunction/core` - UserInfo, Metadata, RunView, LogStatus
- `@memberjunction/core-entities` - TestEntity, TestRunEntity, etc.
- `@memberjunction/global` - ClassFactory

**AI/Agents**:
- `@memberjunction/ai-agents` - AgentRunner
- `@memberjunction/ai` - ChatMessage
- `@memberjunction/aiengine` - AIEngine

**Type System**:
- TypeScript with strict typing
- Zod for schema validation (available in package)
- RxJS for reactive patterns (available in package)

---

## 12. Error Handling

### TestEngine Level
```typescript
// Catches and logs errors
try {
    const test = await this.loadTest(testId, contextUser);
    // ... execution ...
} catch (error) {
    this.logError(`Test execution failed: ${testId}`, error as Error);
    throw error;  // Re-throw to caller
}
```

### Driver Level
```typescript
// Drivers can fail gracefully
try {
    const result = await oracle.evaluate(input, config);
    // ...
} catch (error) {
    this.logError(`Oracle ${type} failed`, error as Error);
    oracleResults.push({
        oracleType: type,
        passed: false,
        score: 0,
        message: `Oracle execution failed: ${(error as Error).message}`
    });
}
```

### RunView Calls
```typescript
// RunView doesn't throw - check Success property
const result = await rv.RunView({...}, contextUser);
if (!result.Success) {
    throw new Error(`Failed to load: ${result.ErrorMessage}`);
}
```

---

## 13. Performance Considerations

### Test Execution Cost Tracking
```typescript
// Costs are tracked from agent runs
agentRun.TotalCost  // Already calculated by AI framework
```

### Batch Operations
```typescript
// RunViews can batch multiple queries
const [tests, suites] = await rv.RunViews([
    { EntityName: 'Tests', ... },
    { EntityName: 'Test Suites', ... }
], contextUser);
```

### Caching
- Drivers cached by TestType ID
- Metadata cached (standard MJ behavior)
- No built-in oracle result caching

---

## 14. Testing Framework File Structure

```
packages/TestingFramework/
├── CLI/                    # CLI interface
├── Engine/                 # Main execution engine (analyzed)
│   ├── src/
│   │   ├── engine/
│   │   ├── drivers/
│   │   ├── oracles/
│   │   ├── types.ts
│   │   ├── utils/
│   │   └── index.ts
│   └── package.json
├── UI/                     # Angular UI components
├── SETUP.md                # Setup documentation
└── README.md               # Framework overview
```

---

## 15. Key Findings Summary

### Main Class for Test Invocation
**`TestEngine.Instance.RunTest()` and `TestEngine.Instance.RunSuite()`**

### Progress Callbacks
Currently use standard logging. Can be enhanced with PubSub pattern from `RunAIAgentResolver` for streaming updates.

### AI Agent Execution Streaming
`RunAIAgentResolver` uses:
- `onProgress` callback for step updates
- `onStreaming` callback for content chunks
- `PubSub.publish()` to send updates to client via `PUSH_STATUS_UPDATES_TOPIC`

### Resolver Registration
- Automatic glob pattern: `/src/resolvers/**/*Resolver.ts`
- Uses `type-graphql` for schema generation
- Exported from `index.ts`

### GraphQL Result Types
- Use scalars only (no complex objects)
- JSON stringify objects for transmission
- Include both `success` flag and serialized `result`

---

## Next Steps for UI Integration

1. **Create RunTestResolver** extending ResolverBase
2. **Define GraphQL types** for test results
3. **Implement streaming callbacks** if real-time progress needed
4. **Add test/suite selection UI** to select TestID
5. **Parse and display results** from TestRunResult
6. **Show cost breakdown** using formatter utilities
7. **Link to TestRun entity** for historical records
