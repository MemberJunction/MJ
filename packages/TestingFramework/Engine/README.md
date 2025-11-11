# MemberJunction Testing Engine

Core execution engine for the MemberJunction Testing Framework. Provides the foundational infrastructure for running tests, evaluating results, and managing test execution.

## Architecture

The Testing Engine follows a driver-based architecture that allows for extensible test types:

```
TestEngine (Orchestration)
    ↓
BaseTestDriver (Abstract base class)
    ↓
Concrete Drivers:
    - AgentEvalDriver
    - WorkflowScenarioDriver (future)
    - CodeGenTestDriver (future)
    - IntegrationTestDriver (future)
```

## Core Components

### 1. Test Engine (`TestEngine`)
Main orchestration layer responsible for:
- Loading test definitions from database
- Instantiating appropriate test drivers via ClassFactory
- Managing test execution lifecycle
- Aggregating and storing results
- Tracking costs and performance metrics

### 2. Base Test Driver (`BaseTestDriver`)
Abstract base class that all test drivers extend:
- Defines execution contract
- Provides common utilities (scoring, validation, result formatting)
- Handles error management
- Manages test context

### 3. Oracle System
Pluggable evaluation components:
- **SchemaValidator** - Validates output structure
- **TraceValidator** - Checks execution traces for errors
- **LLMJudge** - Uses LLM to evaluate quality
- **ExactMatcher** - Deterministic output comparison
- **SQLValidator** - Database state verification

### 4. Result Management
Structured result capture and storage:
- TestRun entity management
- Metric collection and aggregation
- Artifact storage coordination
- Cost tracking

## Class Structure

### TestEngine

```typescript
export class TestEngine {
  /**
   * Run a single test by ID
   */
  async runTest(
    testId: string,
    contextUser: UserInfo,
    options?: TestRunOptions
  ): Promise<TestRunResult>

  /**
   * Run an entire test suite
   */
  async runSuite(
    suiteId: string,
    contextUser: UserInfo,
    options?: SuiteRunOptions
  ): Promise<SuiteRunResult>

  /**
   * Validate test definition without executing
   */
  async validateTest(testId: string): Promise<ValidationResult>
}
```

### BaseTestDriver

```typescript
export abstract class BaseTestDriver {
  /**
   * Execute the test and return results
   * Must be implemented by concrete drivers
   */
  abstract execute(
    test: TestEntity,
    contextUser: UserInfo,
    options: ExecutionOptions
  ): Promise<DriverExecutionResult>

  /**
   * Validate test configuration
   * Can be overridden by concrete drivers
   */
  async validate(test: TestEntity): Promise<ValidationResult>

  /**
   * Calculate overall score from oracle results
   */
  protected calculateScore(
    oracleResults: OracleResult[],
    weights: ScoringWeights
  ): number

  /**
   * Store execution results to database
   */
  protected async storeResults(
    testRun: TestRunEntity,
    results: DriverExecutionResult
  ): Promise<void>
}
```

### Oracle Interface

```typescript
export interface IOracle {
  /**
   * Unique identifier for this oracle type
   */
  readonly type: string;

  /**
   * Execute the oracle evaluation
   */
  evaluate(
    input: OracleInput,
    config: OracleConfig
  ): Promise<OracleResult>
}

export interface OracleResult {
  oracleType: string;
  passed: boolean;
  score?: number;
  message: string;
  details?: any;
}
```

## Agent Eval Driver

The first concrete implementation:

```typescript
export class AgentEvalDriver extends BaseTestDriver {
  async execute(
    test: TestEntity,
    contextUser: UserInfo,
    options: ExecutionOptions
  ): Promise<DriverExecutionResult> {
    // 1. Parse test configuration
    const config = this.parseConfig(test);

    // 2. Execute agent with test inputs
    const agentRun = await this.executeAgent(config.inputs, contextUser);

    // 3. Run oracles to evaluate output
    const oracleResults = await this.runOracles(
      agentRun,
      config.oracles,
      config.expectedOutcomes
    );

    // 4. Calculate score based on weights
    const score = this.calculateScore(oracleResults, config.weights);

    // 5. Return structured results
    return {
      targetType: 'Agent Run',
      targetLogId: agentRun.ID,
      status: this.determineStatus(oracleResults),
      score,
      oracleResults,
      cost: this.calculateCost(agentRun),
      duration: this.calculateDuration(agentRun)
    };
  }

  private async runOracles(
    agentRun: AIAgentRunEntity,
    oracleConfigs: OracleConfig[],
    expectedOutcomes: any
  ): Promise<OracleResult[]> {
    const results: OracleResult[] = [];

    for (const config of oracleConfigs) {
      const oracle = this.getOracle(config.type);
      const result = await oracle.evaluate({
        agentRun,
        expectedOutcomes
      }, config);
      results.push(result);
    }

    return results;
  }
}
```

## Oracle Implementations

### Schema Validator
```typescript
export class SchemaValidatorOracle implements IOracle {
  readonly type = 'schema-validate';

  async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
    const { agentRun } = input;
    const schema = this.loadSchema(config.schema);

    try {
      schema.parse(agentRun.ResultPayload);
      return {
        oracleType: this.type,
        passed: true,
        score: 1.0,
        message: 'Output matches schema'
      };
    } catch (error) {
      return {
        oracleType: this.type,
        passed: false,
        score: 0.0,
        message: `Schema validation failed: ${error.message}`,
        details: error.errors
      };
    }
  }
}
```

### Trace Validator
```typescript
export class TraceValidatorOracle implements IOracle {
  readonly type = 'trace-no-errors';

  async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
    const { agentRun } = input;

    // Load agent run steps
    const rv = new RunView();
    const stepsResult = await rv.RunView<AIAgentRunStepEntity>({
      EntityName: 'MJ: AI Agent Run Steps',
      ExtraFilter: `AgentRunID='${agentRun.ID}'`,
      ResultType: 'entity_object'
    });

    if (!stepsResult.Success) {
      throw new Error(`Failed to load agent run steps: ${stepsResult.ErrorMessage}`);
    }

    const steps = stepsResult.Results || [];
    const errorSteps = steps.filter(s => s.Status === 'Error' || s.Status === 'Failed');

    if (errorSteps.length === 0) {
      return {
        oracleType: this.type,
        passed: true,
        score: 1.0,
        message: `All ${steps.length} steps completed without errors`
      };
    } else {
      return {
        oracleType: this.type,
        passed: false,
        score: 0.0,
        message: `${errorSteps.length} of ${steps.length} steps had errors`,
        details: errorSteps.map(s => ({
          stepId: s.ID,
          sequence: s.Sequence,
          error: s.Notes
        }))
      };
    }
  }
}
```

### LLM Judge
```typescript
export class LLMJudgeOracle implements IOracle {
  readonly type = 'llm-judge';

  async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
    const { agentRun, expectedOutcomes } = input;

    // Load rubric
    const md = new Metadata();
    const rubric = await md.GetEntityObject<TestRubricEntity>('Test Rubrics');
    await rubric.Load(config.rubricId);

    // Build evaluation prompt
    const prompt = this.buildPrompt(rubric, agentRun, expectedOutcomes);

    // Execute LLM evaluation
    const judgmentResult = await this.executeJudgment(prompt);

    // Parse structured response
    const scores = this.parseScores(judgmentResult, rubric.Criteria);

    // Calculate weighted score
    const overallScore = this.calculateWeightedScore(scores, rubric.Criteria);

    return {
      oracleType: this.type,
      passed: overallScore >= (config.threshold || 0.7),
      score: overallScore,
      message: `LLM judge score: ${(overallScore * 100).toFixed(1)}%`,
      details: {
        rubricId: rubric.ID,
        rubricVersion: rubric.Version,
        dimensionScores: scores,
        judgmentNotes: judgmentResult.notes
      }
    };
  }
}
```

## Usage Example

```typescript
import { TestEngine } from '@memberjunction/testing-engine';
import { getSystemUser } from '@memberjunction/core';

// Initialize engine
const engine = new TestEngine();

// Run a single test
const contextUser = getSystemUser();
const result = await engine.runTest('test-id-123', contextUser, {
  dryRun: false,
  environment: 'staging'
});

console.log(`Test ${result.status}: Score ${result.score}`);
console.log(`Cost: $${result.cost}, Duration: ${result.duration}s`);

// Run a suite
const suiteResult = await engine.runSuite('suite-id-456', contextUser, {
  parallel: false,
  failFast: true
});

console.log(`Suite completed: ${suiteResult.passedTests}/${suiteResult.totalTests} passed`);
```

## Extension Points

### Adding New Test Types

1. Create driver class extending `BaseTestDriver`:
```typescript
export class WorkflowScenarioDriver extends BaseTestDriver {
  async execute(test: TestEntity, contextUser: UserInfo, options: ExecutionOptions) {
    // Your workflow test logic
  }
}
```

2. Register with ClassFactory:
```typescript
MJGlobal.Instance.ClassFactory.Register(
  BaseTestDriver,
  'WorkflowScenarioDriver',
  WorkflowScenarioDriver
);
```

3. Create TestType record in database:
```sql
INSERT INTO TestType (Name, DriverClass, Status)
VALUES ('Workflow Scenario', 'WorkflowScenarioDriver', 'Active');
```

### Adding New Oracles

1. Implement `IOracle` interface:
```typescript
export class CustomOracle implements IOracle {
  readonly type = 'custom-check';

  async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
    // Your evaluation logic
  }
}
```

2. Register with engine:
```typescript
engine.registerOracle(new CustomOracle());
```

## Testing Best Practices

1. **Use appropriate oracles** - Combine deterministic checks (schema, trace) with semantic checks (LLM judge)
2. **Set realistic weights** - Balance different evaluation dimensions
3. **Track costs** - Monitor LLM evaluation costs
4. **Validate before execute** - Use `validateTest()` to catch config errors
5. **Leverage traces** - Link TestRun to target entities for debugging

## Future Enhancements

- [ ] Parallel test execution within suites
- [ ] Test retry logic with exponential backoff
- [ ] Result caching for expensive evaluations
- [ ] Composite oracles (AND/OR logic)
- [ ] Dataset-driven test execution (run same test with multiple inputs)
- [ ] Comparative evaluation (A/B testing different agent versions)
- [ ] Replay mode (re-evaluate existing agent runs)
