# Testing Engine Documentation Index

Complete analysis of the Testing Framework Engine architecture for UI integration.

## Documents Included

### 1. TESTING_ENGINE_ANALYSIS.md (20KB)
**Comprehensive architecture guide with 15 sections**

- **Section 1-2**: Package structure and APIs
- **Section 3**: Test execution flow and parameters
- **Section 4**: Progress and status reporting mechanisms
- **Section 5**: Return types and result structures
- **Section 6**: Driver architecture (Base + Concrete)
- **Section 7**: Oracle system (IOracle interface + 5 implementations)
- **Section 8-9**: GraphQL resolver patterns and proposed implementation
- **Section 10**: Design patterns (Singleton, ClassFactory, Registry, Template Method)
- **Section 11**: Dependencies and imports
- **Section 12**: Error handling strategies
- **Section 13**: Performance considerations
- **Section 14**: File structure overview
- **Section 15**: Key findings summary

**Best for**: Understanding the complete system and detailed implementation guidance

### 2. TESTING_ENGINE_QUICK_REF.md (9.4KB)
**Quick reference guide for rapid lookups**

- Quick facts table
- Code examples (TypeScript)
- Result structure examples
- Driver and Oracle system overview
- Step-by-step UI integration instructions
- Local testing commands

**Best for**: Quick reference while developing, copy-paste code examples

### 3. This File (TESTING_ENGINE_DOCS_INDEX.md)
Navigation guide for all documentation

---

## Quick Navigation

### I need to...

**Invoke a test from code:**
- See: TESTING_ENGINE_ANALYSIS.md Section 2 (APIs) and Section 3 (Execution Flow)
- Code example: TESTING_ENGINE_QUICK_REF.md "Quick Code: Invoke a Test"

**Create a GraphQL Resolver:**
- See: TESTING_ENGINE_ANALYSIS.md Section 8-9 (Resolver Patterns)
- Code template: TESTING_ENGINE_QUICK_REF.md "Step-by-Step: UI Integration"
- Reference: `/packages/MJServer/src/resolvers/RunAIAgentResolver.ts`

**Understand test result structure:**
- See: TESTING_ENGINE_ANALYSIS.md Section 5 (Return Types)
- Example: TESTING_ENGINE_QUICK_REF.md "Result Structure"

**Learn about Drivers:**
- See: TESTING_ENGINE_ANALYSIS.md Section 6 (Driver Architecture)
- Details: AgentEvalDriver in Section 6

**Learn about Oracles:**
- See: TESTING_ENGINE_ANALYSIS.md Section 7 (Oracle System)
- Examples: ExactMatchOracle code included

**Implement streaming progress:**
- See: TESTING_ENGINE_ANALYSIS.md Section 8 (RunAIAgentResolver Pattern)
- Optional section: TESTING_ENGINE_QUICK_REF.md "Next: Adding Streaming"

**Set up test locally:**
- See: TESTING_ENGINE_QUICK_REF.md "Testing Locally"

---

## Key Classes and Files

### Core Classes
| Class | File | Purpose |
|-------|------|---------|
| TestEngine | `packages/TestingFramework/Engine/src/engine/TestEngine.ts` | Main orchestrator (singleton) |
| BaseTestDriver | `packages/TestingFramework/Engine/src/drivers/BaseTestDriver.ts` | Abstract base for drivers |
| AgentEvalDriver | `packages/TestingFramework/Engine/src/drivers/AgentEvalDriver.ts` | Concrete driver for agents |
| IOracle | `packages/TestingFramework/Engine/src/oracles/IOracle.ts` | Oracle interface |
| ExactMatchOracle | `packages/TestingFramework/Engine/src/oracles/ExactMatchOracle.ts` | Exact match oracle |

### Type Definitions
| Type | File | Purpose |
|------|------|---------|
| TestRunResult | `packages/TestingFramework/Engine/src/types.ts` | Individual test result |
| TestSuiteRunResult | `packages/TestingFramework/Engine/src/types.ts` | Suite result |
| OracleResult | `packages/TestingFramework/Engine/src/types.ts` | Oracle evaluation result |
| DriverExecutionContext | `packages/TestingFramework/Engine/src/types.ts` | Driver execution context |

### Reference Implementation
| File | Purpose |
|------|---------|
| `/packages/MJServer/src/resolvers/RunAIAgentResolver.ts` | Reference for GraphQL resolver pattern |

---

## Main Entry Points

### TestEngine API

```typescript
// Get singleton instance
const engine = TestEngine.Instance;

// Configure before use
await engine.Config(false, contextUser);

// Run single test
const result = await engine.RunTest(testId, options, contextUser);

// Run test suite
const suiteResult = await engine.RunSuite(suiteId, options, contextUser);

// Oracle management
engine.RegisterOracle(oracle);
engine.GetOracle(type);
engine.GetOracleTypes();
```

### GraphQL Resolver Pattern

```typescript
@Resolver()
export class RunTestResolver extends ResolverBase {
    @Mutation(() => RunTestResult)
    async RunTest(
        @Arg('testId') testId: string,
        @Ctx() { userPayload }: AppContext
    ): Promise<RunTestResult>
}
```

---

## Typical Test Execution Flow

```
User selects test in UI
    ↓
UI calls GraphQL mutation (RunTest)
    ↓
Resolver gets TestEngine singleton
    ↓
TestEngine.RunTest(testId, options, user)
    ↓
Load Test entity from database
    ↓
Get TestType (determines which Driver to use)
    ↓
Instantiate Driver (via ClassFactory)
    ↓
Create TestRun entity (status: 'Running')
    ↓
Driver.Execute(context)
  ├─ Parse Configuration/InputDefinition/ExpectedOutcomes
  ├─ Execute test-specific logic (e.g., run agent)
  └─ Run oracles to evaluate results
    ↓
Update TestRun entity with results
    ↓
Return TestRunResult
    ↓
Resolver serializes to JSON
    ↓
UI receives result and displays
```

---

## Configuration Examples

### Test Configuration (AgentEvalDriver)

Store as Test.Configuration (JSON):
```json
{
    "agentId": "agent-uuid",
    "oracles": [
        { "type": "trace-no-errors", "weight": 0.2 },
        { "type": "llm-judge", "weight": 0.5 },
        { "type": "exact-match", "weight": 0.3 }
    ],
    "scoringWeights": {
        "trace-no-errors": 0.2,
        "llm-judge": 0.5,
        "exact-match": 0.3
    },
    "maxExecutionTime": 30000
}
```

### Test Input (AgentEvalDriver)

Store as Test.InputDefinition (JSON):
```json
{
    "userMessage": "What is 2 + 2?",
    "conversationContext": null,
    "executionParams": {
        "temperatureOverride": 0.3
    }
}
```

### Expected Outcomes (AgentEvalDriver)

Store as Test.ExpectedOutcomes (JSON):
```json
{
    "responsePatterns": ["4", "four"],
    "expectedEntities": [],
    "responseSchema": {
        "type": "object",
        "properties": {
            "answer": { "type": "string" }
        }
    }
}
```

---

## Built-in Oracles

| Oracle Type | ID | Purpose |
|-------------|-----|---------|
| Exact Match | `exact-match` | Deterministic output comparison |
| Schema Validator | `schema-validate` | JSON schema validation |
| Trace Validator | `trace-no-errors` | Execution safety checks |
| LLM Judge | `llm-judge` | LLM-based semantic evaluation |
| SQL Validator | `sql-validate` | Database state verification |

---

## Performance Notes

### Cost Tracking
- Automatic from agent runs: `agentRun.TotalCost`
- Can include oracle evaluation costs
- Available in result: `testResult.totalCost`

### Execution Time
- Test duration: `result.durationMs`
- Includes agent execution + oracle evaluation
- Can be limited via `config.maxExecutionTime`

### Batch Loading
- Tests and suites loaded via RunView
- Can batch multiple queries for efficiency
- Results cached in Metadata

---

## Error Handling

### Engine Level
- Catches errors from drivers
- Logs with context
- Returns error status in result

### Driver Level
- Graceful oracle failures
- Continues with remaining oracles
- Reports failed oracle in results

### RunView Calls
- Always check `Success` property
- RunView doesn't throw
- Returns `ErrorMessage` for failures

---

## Debugging

### Enable Verbose Logging
```typescript
const result = await engine.RunTest(testId, {
    verbose: true
}, user);
```

### Check TestRun Entity
- Query TestRun table for executed tests
- View `ResultDetails` JSON for oracle results
- Check `Status`, `Score`, `PassedChecks`, etc.

### Monitor Costs
- Agent execution cost in `agentRun.TotalCost`
- Oracle costs in result details
- Breakdown available via utility functions

---

## Next Steps

1. **Read TESTING_ENGINE_ANALYSIS.md** for complete understanding
2. **Review TESTING_ENGINE_QUICK_REF.md** for quick code examples
3. **Study RunAIAgentResolver.ts** as reference implementation
4. **Create RunTestResolver.ts** following the pattern
5. **Build and test** locally following "Testing Locally" section
6. **Integrate with UI** - create Angular component for test selection and results

---

## Additional Resources

### Documentation Files
- Full analysis: `TESTING_ENGINE_ANALYSIS.md`
- Quick reference: `TESTING_ENGINE_QUICK_REF.md`
- Package README: `packages/TestingFramework/Engine/README.md`
- Setup guide: `packages/TestingFramework/SETUP.md`

### Source Code
- Engine: `packages/TestingFramework/Engine/src/`
- MJServer: `packages/MJServer/src/`
- Related: `packages/TestingFramework/{CLI,UI}/`

### MJ Documentation
- Core patterns: MemberJunction developer guide
- AI agents: `packages/MJServer/src/resolvers/RunAIAgentResolver.ts`
- Type-GraphQL: Apollo Server documentation

---

## Document Summary

| Document | Size | Best For |
|----------|------|----------|
| TESTING_ENGINE_ANALYSIS.md | 20 KB | Complete understanding, implementation details |
| TESTING_ENGINE_QUICK_REF.md | 9.4 KB | Quick lookups, code examples, quick start |
| TESTING_ENGINE_DOCS_INDEX.md | This file | Navigation and overview |

Generated: November 2024
