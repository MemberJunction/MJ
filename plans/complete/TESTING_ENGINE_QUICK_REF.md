# Testing Engine - Quick Reference for UI Integration

## Quick Facts

| Aspect | Details |
|--------|---------|
| **Main Class** | `TestEngine` (singleton) |
| **Location** | `/packages/TestingFramework/Engine/src/engine/TestEngine.ts` |
| **Package** | `@memberjunction/testing-engine` |
| **Key Methods** | `RunTest(testId, options, user)`, `RunSuite(suiteId, options, user)` |
| **Test Execution Time** | Varies (includes agent run time + oracle evaluation) |
| **Cost Tracking** | Automatic (from AI Agent runs + oracle costs) |
| **Progress Tracking** | Via standard logging (can be enhanced with PubSub) |

---

## Quick Code: Invoke a Test

### From TypeScript Code (Backend/Service)

```typescript
import { TestEngine } from '@memberjunction/testing-engine';
import { UserInfo } from '@memberjunction/core';

async function runTestExample(testId: string, user: UserInfo) {
    const engine = TestEngine.Instance;
    
    // Must configure first
    await engine.Config(false, user);
    
    // Run test
    const result = await engine.RunTest(testId, {
        verbose: true,
        environment: 'dev'
    }, user);
    
    console.log(`Test ${result.testName}: ${result.status}`);
    console.log(`Score: ${result.score}, Cost: $${result.totalCost}`);
    
    return result;
}
```

### From GraphQL Resolver (For UI)

```typescript
import { Resolver, Mutation, Arg, Ctx } from 'type-graphql';
import { TestEngine } from '@memberjunction/testing-engine';
import { ResolverBase } from '../generic/ResolverBase.js';

@Resolver()
export class RunTestResolver extends ResolverBase {
    
    @Mutation(() => String)  // Return JSON string
    async RunTest(
        @Arg('testId') testId: string,
        @Ctx() { userPayload }: AppContext
    ): Promise<string> {
        try {
            const user = this.GetUserFromPayload(userPayload);
            if (!user) throw new Error('No user context');
            
            const engine = TestEngine.Instance;
            await engine.Config(false, user);
            
            const result = await engine.RunTest(testId, {}, user);
            return JSON.stringify(result);
            
        } catch (error) {
            throw new Error(`Test failed: ${(error as Error).message}`);
        }
    }
}
```

---

## Result Structure

```typescript
// Individual Test Result
{
    testRunId: "uuid",
    testId: "uuid",
    testName: "My Test",
    status: "Passed",           // 'Passed' | 'Failed' | 'Error' | 'Skipped'
    score: 0.85,                // 0.0-1.0
    passedChecks: 4,
    failedChecks: 1,
    totalChecks: 5,
    oracleResults: [
        {
            oracleType: "exact-match",
            passed: true,
            score: 1.0,
            message: "Output matches expected"
        }
    ],
    targetType: "AI Agent",
    targetLogId: "agent-run-uuid",
    durationMs: 2500,
    totalCost: 0.0042,
    startedAt: Date,
    completedAt: Date
}
```

---

## Driver System

### How Drivers Work

1. **Test defines its TypeID** → References a TestType entity
2. **TestType has DriverClass** → e.g., 'AgentEvalDriver'
3. **TestEngine loads driver** → Via ClassFactory
4. **Driver executes** → Runs test logic + oracles
5. **Driver returns result** → With score and status

### Built-in Drivers

| Driver | Entity Type | What It Tests |
|--------|-------------|--------------|
| AgentEvalDriver | AI Agents | Agent responses & behavior |
| (Extensible) | Custom | Custom test logic |

### Example: AgentEvalDriver Configuration

```typescript
// Store this as Test.Configuration (JSON)
{
    "agentId": "my-agent-uuid",
    "oracles": [
        {
            "type": "trace-no-errors",
            "weight": 0.2
        },
        {
            "type": "llm-judge",
            "weight": 0.5,
            "config": {
                "criteria": [
                    "Response is accurate",
                    "Response is helpful"
                ]
            }
        },
        {
            "type": "exact-match",
            "weight": 0.3
        }
    ],
    "scoringWeights": {
        "trace-no-errors": 0.2,
        "llm-judge": 0.5,
        "exact-match": 0.3
    },
    "maxExecutionTime": 30000
}
```

---

## Oracle System

### Available Oracles

```
exact-match      → Deterministic output comparison
schema-validate  → JSON schema validation  
trace-no-errors  → Execution safety checks
llm-judge        → LLM-based semantic evaluation
sql-validate     → Database state verification
```

### Example: ExactMatch Configuration

```typescript
// Store in oracle.config within test Configuration
{
    "mode": "exact",           // exact | contains | regex | deep | partial
    "caseSensitive": true,
    "ignoreWhitespace": false,
    "fields": ["field1", "field2"]  // For 'partial' mode
}
```

---

## File Paths Summary

| What | File |
|------|------|
| **Main Engine** | `/packages/TestingFramework/Engine/src/engine/TestEngine.ts` |
| **Base Driver** | `/packages/TestingFramework/Engine/src/drivers/BaseTestDriver.ts` |
| **Agent Driver** | `/packages/TestingFramework/Engine/src/drivers/AgentEvalDriver.ts` |
| **Type Definitions** | `/packages/TestingFramework/Engine/src/types.ts` |
| **Oracle Interface** | `/packages/TestingFramework/Engine/src/oracles/IOracle.ts` |
| **Proposed Resolver** | `/packages/MJServer/src/resolvers/RunTestResolver.ts` (create) |
| **Reference Resolver** | `/packages/MJServer/src/resolvers/RunAIAgentResolver.ts` |
| **Analysis Document** | `/TESTING_ENGINE_ANALYSIS.md` |

---

## Step-by-Step: UI Integration

### 1. Create GraphQL Resolver

File: `packages/MJServer/src/resolvers/RunTestResolver.ts`

```typescript
import { Resolver, Mutation, Query, Arg, Ctx, ObjectType, Field } from 'type-graphql';
import { TestEngine } from '@memberjunction/testing-engine';
import { ResolverBase } from '../generic/ResolverBase.js';
import { AppContext } from '../types.js';

@ObjectType()
export class RunTestResult {
    @Field() success: boolean;
    @Field({ nullable: true }) errorMessage?: string;
    @Field({ nullable: true }) executionTimeMs?: number;
    @Field() result: string;  // JSON stringified TestRunResult
}

@Resolver()
export class RunTestResolver extends ResolverBase {
    @Mutation(() => RunTestResult)
    async RunTest(
        @Arg('testId') testId: string,
        @Ctx() { userPayload }: AppContext
    ): Promise<RunTestResult> {
        const startTime = Date.now();
        
        try {
            const user = this.GetUserFromPayload(userPayload);
            if (!user) throw new Error('No user context');
            
            const engine = TestEngine.Instance;
            await engine.Config(false, user);
            
            const result = await engine.RunTest(testId, { verbose: true }, user);
            
            return {
                success: true,
                executionTimeMs: Date.now() - startTime,
                result: JSON.stringify(result)
            };
        } catch (error) {
            return {
                success: false,
                errorMessage: (error as Error).message,
                executionTimeMs: Date.now() - startTime,
                result: '{}'
            };
        }
    }
}
```

### 2. Export from index.ts

Add to `/packages/MJServer/src/index.ts`:
```typescript
export * from './resolvers/RunTestResolver.js';
```

### 3. Call from UI (GraphQL)

```graphql
mutation {
    RunTest(testId: "test-uuid-here") {
        success
        errorMessage
        executionTimeMs
        result
    }
}
```

### 4. Parse Result in Angular

```typescript
// In your component
async runTest(testId: string) {
    const response = await this.apollo.mutate({
        mutation: RUN_TEST_MUTATION,
        variables: { testId }
    }).toPromise();
    
    if (response.data.RunTest.success) {
        const result = JSON.parse(response.data.RunTest.result);
        
        // Display result
        console.log(`Test: ${result.testName}`);
        console.log(`Status: ${result.status}`);
        console.log(`Score: ${(result.score * 100).toFixed(1)}%`);
        console.log(`Cost: $${result.totalCost.toFixed(4)}`);
    }
}
```

---

## What to Watch Out For

1. **Must call Config()** before using TestEngine
2. **userPayload is required** - RunTest/RunSuite need UserInfo
3. **Test entity structure** - Configuration/InputDefinition/ExpectedOutcomes must be valid JSON
4. **Oracle types must be registered** - TestEngine registers built-in oracles automatically
5. **Costs include agent runs** - Agent execution + oracle evaluation
6. **No streaming yet** - Current implementation uses standard logging

---

## Next: Adding Streaming (Optional)

If you want real-time progress updates like `RunAIAgentResolver`:

```typescript
@Mutation(() => RunTestResult)
async RunTest(
    @Arg('testId') testId: string,
    @Arg('sessionId') sessionId: string,
    @Ctx() { userPayload }: AppContext,
    @PubSub() pubSub: PubSubEngine  // Add this
): Promise<RunTestResult> {
    // ... existing code ...
    
    // To publish progress:
    pubSub.publish('TEST_PROGRESS', {
        message: JSON.stringify({
            testId,
            status: 'Running step 2 of 5',
            percentage: 40
        })
    });
}
```

---

## Testing Locally

```bash
# Build the engine
cd packages/TestingFramework/Engine
npm run build

# Build MJServer 
cd packages/MJServer
npm run build

# Start API
npm run start:api

# Test mutation
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { RunTest(testId:\"test-123\") { success result } }"
  }'
```

