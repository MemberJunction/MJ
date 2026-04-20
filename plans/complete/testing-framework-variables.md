# Testing Framework Variables System

## Overview

This plan describes a parameterized testing system that allows tests and test suites to expose "variables" that can be set at runtime. This enables running the same test definitions with different configurations (e.g., different AI models, temperature settings, etc.) without duplicating test definitions.

## Problem Statement

Currently, to test an agent with different AI configurations (Claude, GPT-4, Gemini), you must either:
1. Create separate test definitions for each configuration
2. Manually modify test configuration before each run

Neither approach scales well. We need a way to:
- Define variables at the test type level (what variables are available)
- Expose variables at the test level (which variables this test uses)
- Set variable values at suite level (defaults for all tests in suite)
- Override variable values at run time (CLI, API)

## Design

### Variable Inheritance Hierarchy

```
TestType (defines available variables for this type of test)
    ↓
Test (exposes subset of type's variables, may set defaults)
    ↓
TestSuite (can set values for all child tests - optional)
    ↓
TestRun / SuiteRun (actual values used at execution time)
```

### Variable Resolution Order (Highest to Lowest Priority)

1. **Run-level** - CLI flags, API params (highest priority)
2. **Suite-level** - Suite's variable defaults (if running in suite)
3. **Test-level** - Test's default values
4. **TestType defaults** - Type-level defaults (lowest priority)

If a required variable has no value after resolution, the test fails validation.

### JSON Schema Approach

Rather than separate database tables, we use JSON columns on existing entities with strongly-typed TypeScript interfaces for each level.

## Interfaces

### Core Variable Definition (Shared)

```typescript
/**
 * Data types supported for test variables
 */
export type TestVariableDataType = 'string' | 'number' | 'boolean' | 'date';

/**
 * How the valid values for a variable are determined
 */
export type TestVariableValueSource =
  | 'static'    // Hardcoded list in possibleValues
  | 'freeform'; // Any value of the given dataType
  // Future: | 'entity'   // Pull from MJ entity (e.g., AI Configurations)

/**
 * Definition of a single test variable
 */
export interface TestVariableDefinition {
  /**
   * Unique name for the variable (e.g., "AIConfiguration", "Temperature")
   */
  name: string;

  /**
   * Human-readable display name
   */
  displayName: string;

  /**
   * Description of what this variable controls
   */
  description?: string;

  /**
   * Data type of the variable value
   */
  dataType: TestVariableDataType;

  /**
   * How valid values are determined
   */
  valueSource: TestVariableValueSource;

  /**
   * For static valueSource: list of valid values
   * Each entry has a value and optional display label
   */
  possibleValues?: TestVariablePossibleValue[];

  /**
   * Default value (must match dataType)
   */
  defaultValue?: string | number | boolean | Date;

  /**
   * Whether this variable must have a value to run the test
   */
  required: boolean;
}

/**
 * A possible value for a static variable
 */
export interface TestVariablePossibleValue {
  /**
   * The actual value
   */
  value: string | number | boolean;

  /**
   * Display label (defaults to value.toString() if not provided)
   */
  label?: string;

  /**
   * Optional description of what this value means
   */
  description?: string;
}
```

### TestType Level

```typescript
/**
 * Variables schema for a TestType
 * Stored in TestType.VariablesSchema JSON column
 */
export interface TestTypeVariablesSchema {
  /**
   * Version of the schema format (for future migrations)
   */
  schemaVersion: '1.0';

  /**
   * Variables available for tests of this type
   */
  variables: TestVariableDefinition[];
}
```

### Test Level

```typescript
/**
 * Variable configuration for a specific Test
 * Stored in Test.Variables JSON column
 */
export interface TestVariablesConfig {
  /**
   * Variables exposed by this test (subset of type's variables)
   * Key is the variable name from TestType
   */
  variables: {
    [variableName: string]: TestVariableOverride;
  };
}

/**
 * Override settings for a variable at the test level
 */
export interface TestVariableOverride {
  /**
   * Whether this variable is exposed for this test
   * If false, the variable is not available for override
   */
  exposed: boolean;

  /**
   * Override the default value for this test
   */
  defaultValue?: string | number | boolean | Date;

  /**
   * If true, this variable cannot be overridden at suite/run level
   */
  locked?: boolean;

  /**
   * Restrict possible values to a subset of the type's values
   */
  restrictedValues?: (string | number | boolean)[];
}
```

### TestSuite Level

```typescript
/**
 * Variable values for a TestSuite
 * Stored in TestSuite.Variables JSON column (new column)
 */
export interface TestSuiteVariablesConfig {
  /**
   * Variable values to apply to all tests in this suite
   * Key is the variable name
   */
  variables: {
    [variableName: string]: string | number | boolean | Date;
  };
}
```

### Run Level (Options)

```typescript
/**
 * Variable values provided at run time
 * Extension to existing TestRunOptions
 */
export interface TestRunOptions {
  // ... existing fields ...

  /**
   * Variable values to use for this run
   * Key is the variable name, value is the resolved value
   */
  variables?: {
    [variableName: string]: string | number | boolean | Date;
  };
}

/**
 * Extension to SuiteRunOptions
 */
export interface SuiteRunOptions extends TestRunOptions {
  // ... existing fields ...
  // variables inherited from TestRunOptions
}
```

### Execution Context

```typescript
/**
 * Extended DriverExecutionContext with resolved variables
 */
export interface DriverExecutionContext {
  // ... existing fields ...

  /**
   * Resolved variable values for this execution
   * Variables have been resolved through the hierarchy and validated
   */
  resolvedVariables: ResolvedTestVariables;
}

/**
 * Resolved variables with metadata
 */
export interface ResolvedTestVariables {
  /**
   * The resolved values
   */
  values: {
    [variableName: string]: string | number | boolean | Date;
  };

  /**
   * Source of each resolved value (for debugging/auditing)
   */
  sources: {
    [variableName: string]: 'run' | 'suite' | 'test' | 'type';
  };
}
```

### TestRun Storage

```typescript
/**
 * Variables stored on TestRun for reproducibility
 * Stored in TestRun.ResolvedVariables JSON column (new column)
 */
export interface TestRunResolvedVariables {
  /**
   * Resolved variable values that were used
   */
  values: {
    [variableName: string]: string | number | boolean | Date;
  };

  /**
   * Source of each value
   */
  sources: {
    [variableName: string]: 'run' | 'suite' | 'test' | 'type';
  };
}
```

## Database Changes

### New Columns

| Entity | Column | Type | Description |
|--------|--------|------|-------------|
| TestType | VariablesSchema | nvarchar(MAX) | JSON - TestTypeVariablesSchema |
| Test | Variables | nvarchar(MAX) | JSON - TestVariablesConfig |
| TestSuite | Variables | nvarchar(MAX) | JSON - TestSuiteVariablesConfig |
| TestRun | ResolvedVariables | nvarchar(MAX) | JSON - TestRunResolvedVariables |
| TestSuiteRun | ResolvedVariables | nvarchar(MAX) | JSON - TestRunResolvedVariables |

### Migration SQL

```sql
-- Add VariablesSchema to TestType
ALTER TABLE [${flyway:defaultSchema}].[TestType]
ADD VariablesSchema NVARCHAR(MAX) NULL;

-- Add Variables to Test
ALTER TABLE [${flyway:defaultSchema}].[Test]
ADD Variables NVARCHAR(MAX) NULL;

-- Add Variables to TestSuite
ALTER TABLE [${flyway:defaultSchema}].[TestSuite]
ADD Variables NVARCHAR(MAX) NULL;

-- Add ResolvedVariables to TestRun
ALTER TABLE [${flyway:defaultSchema}].[TestRun]
ADD ResolvedVariables NVARCHAR(MAX) NULL;

-- Add ResolvedVariables to TestSuiteRun
ALTER TABLE [${flyway:defaultSchema}].[TestSuiteRun]
ADD ResolvedVariables NVARCHAR(MAX) NULL;
```

## Implementation

### 1. Variable Resolution Service

Create a new utility class to handle variable resolution:

```typescript
// packages/TestingFramework/Engine/src/utils/variable-resolver.ts

export class VariableResolver {
  /**
   * Resolve variables for a test execution
   */
  resolveVariables(
    testType: TestTypeEntity,
    test: TestEntity,
    suite: TestSuiteEntity | null,
    runOptions: TestRunOptions
  ): ResolvedTestVariables {
    // 1. Parse schemas
    const typeSchema = this.parseTypeSchema(testType);
    const testConfig = this.parseTestConfig(test);
    const suiteConfig = suite ? this.parseSuiteConfig(suite) : null;

    // 2. For each variable in type schema
    const values: Record<string, unknown> = {};
    const sources: Record<string, string> = {};

    for (const varDef of typeSchema.variables) {
      // Check if test exposes this variable
      const testOverride = testConfig?.variables?.[varDef.name];
      if (testOverride && !testOverride.exposed) {
        continue; // Variable not exposed by this test
      }

      // Resolve value in priority order
      const resolved = this.resolveValue(varDef, testOverride, suiteConfig, runOptions);

      if (resolved.value !== undefined) {
        values[varDef.name] = resolved.value;
        sources[varDef.name] = resolved.source;
      } else if (varDef.required) {
        throw new Error(`Required variable '${varDef.name}' has no value`);
      }
    }

    return { values, sources };
  }

  private resolveValue(
    varDef: TestVariableDefinition,
    testOverride: TestVariableOverride | undefined,
    suiteConfig: TestSuiteVariablesConfig | null,
    runOptions: TestRunOptions
  ): { value: unknown; source: string } {
    // Check if locked at test level
    if (testOverride?.locked) {
      return {
        value: testOverride.defaultValue ?? varDef.defaultValue,
        source: 'test'
      };
    }

    // Priority 1: Run-level
    if (runOptions.variables?.[varDef.name] !== undefined) {
      const value = runOptions.variables[varDef.name];
      this.validateValue(varDef, testOverride, value);
      return { value, source: 'run' };
    }

    // Priority 2: Suite-level
    if (suiteConfig?.variables?.[varDef.name] !== undefined) {
      const value = suiteConfig.variables[varDef.name];
      this.validateValue(varDef, testOverride, value);
      return { value, source: 'suite' };
    }

    // Priority 3: Test-level default
    if (testOverride?.defaultValue !== undefined) {
      return { value: testOverride.defaultValue, source: 'test' };
    }

    // Priority 4: Type-level default
    if (varDef.defaultValue !== undefined) {
      return { value: varDef.defaultValue, source: 'type' };
    }

    return { value: undefined, source: '' };
  }

  private validateValue(
    varDef: TestVariableDefinition,
    testOverride: TestVariableOverride | undefined,
    value: unknown
  ): void {
    // Type validation
    this.validateDataType(varDef, value);

    // Check against possible values (static)
    if (varDef.valueSource === 'static' && varDef.possibleValues) {
      const allowedValues = testOverride?.restrictedValues
        ?? varDef.possibleValues.map(pv => pv.value);

      if (!allowedValues.includes(value as string | number | boolean)) {
        throw new Error(
          `Variable '${varDef.name}' value '${value}' not in allowed values: ${allowedValues.join(', ')}`
        );
      }
    }
  }
}
```

### 2. TestEngine Updates

Update `TestEngine.runSingleTestIteration()` to resolve and pass variables:

```typescript
// In TestEngine.ts

private async runSingleTestIteration(...): Promise<TestRunResult> {
  // ... existing code ...

  // Get test type
  const testType = this.GetTestTypeByID(test.TypeID);

  // Resolve variables
  const variableResolver = new VariableResolver();
  const resolvedVariables = variableResolver.resolveVariables(
    testType,
    test,
    suite,  // Pass suite if running in suite context
    options
  );

  // ... existing driver creation code ...

  // Execute test via driver with resolved variables
  const driverResult = await driver.Execute({
    test,
    testRun,
    contextUser,
    options: enhancedOptions,
    oracleRegistry: this._oracleRegistry,
    resolvedVariables  // NEW: Pass resolved variables to driver
  });

  // Store resolved variables on TestRun for reproducibility
  testRun.ResolvedVariables = JSON.stringify(resolvedVariables);

  // ... rest of existing code ...
}
```

### 3. AgentEvalDriver Updates

Update the driver to use resolved variables:

```typescript
// In AgentEvalDriver.ts

public async Execute(context: DriverExecutionContext): Promise<DriverExecutionResult> {
  // ... existing setup code ...

  // Check for AIConfiguration variable
  const aiConfigId = context.resolvedVariables?.values?.['AIConfiguration'] as string;

  // Build execution parameters
  const runParams = {
    agent: agent,
    // ... existing params ...

    // Pass AI Configuration override if specified via variable
    aiConfigurationId: aiConfigId || undefined,

    // Could also use variables for other params
    temperatureOverride: context.resolvedVariables?.values?.['Temperature'] as number,
  };

  // ... rest of execution ...
}
```

### 4. CLI Updates

Update CLI to accept `--var` flags:

```typescript
// packages/TestingFramework/CLI/src/commands/run.ts

// Add to command flags
flags: {
  // ... existing flags ...
  var: flags.string({
    char: 'V',
    description: 'Set a variable value (format: name=value)',
    multiple: true  // Allow multiple --var flags
  })
}

// In run handler
const variables: Record<string, unknown> = {};
if (flags.var) {
  for (const varStr of flags.var) {
    const [name, value] = varStr.split('=');
    variables[name] = this.parseVariableValue(value);
  }
}

const result = await engine.RunTest(testId, {
  ...otherOptions,
  variables
}, contextUser);
```

### 5. Agent Eval Test Type Variables Schema

Define the standard variables for the Agent Eval test type:

```json
{
  "schemaVersion": "1.0",
  "variables": [
    {
      "name": "AIConfiguration",
      "displayName": "AI Configuration",
      "description": "Which AI configuration to use for the agent (controls model, provider, etc.)",
      "dataType": "string",
      "valueSource": "static",
      "possibleValues": [
        { "value": "claude-sonnet", "label": "Claude Sonnet 4", "description": "Anthropic Claude Sonnet model" },
        { "value": "claude-opus", "label": "Claude Opus 4", "description": "Anthropic Claude Opus model" },
        { "value": "gpt-4o", "label": "GPT-4o", "description": "OpenAI GPT-4o model" },
        { "value": "gemini-pro", "label": "Gemini Pro", "description": "Google Gemini Pro model" }
      ],
      "required": false
    },
    {
      "name": "Temperature",
      "displayName": "Temperature",
      "description": "LLM temperature setting (0.0 = deterministic, 1.0 = creative)",
      "dataType": "number",
      "valueSource": "freeform",
      "defaultValue": 0.7,
      "required": false
    },
    {
      "name": "MaxTokens",
      "displayName": "Max Tokens",
      "description": "Maximum output tokens for the LLM response",
      "dataType": "number",
      "valueSource": "freeform",
      "required": false
    }
  ]
}
```

## Usage Examples

### CLI Usage

```bash
# Run test with specific AI configuration
mj test run <test-id> --var AIConfiguration=claude-sonnet

# Run test with multiple variables
mj test run <test-id> --var AIConfiguration=gpt-4o --var Temperature=0.3

# Run suite with variables (applies to all tests)
mj test suite <suite-id> --var AIConfiguration=gemini-pro

# List available variables for a test
mj test list <test-id> --show-variables
```

### Programmatic Usage

```typescript
const engine = TestEngine.Instance;

// Run with variables
const result = await engine.RunTest(testId, {
  verbose: true,
  variables: {
    'AIConfiguration': 'claude-opus',
    'Temperature': 0.5
  }
}, contextUser);

// Run suite with variables
const suiteResult = await engine.RunSuite(suiteId, {
  variables: {
    'AIConfiguration': 'gpt-4o'
  }
}, contextUser);
```

## Implementation Phases

### Phase 1: Core Infrastructure (COMPLETED)
- [x] Add database columns (migration) - `V202601131726__v2.134.x__Add_Test_Variables_Support.sql`
- [x] Create TypeScript interfaces in EngineBase - `EngineBase/src/types.ts`
- [x] Implement VariableResolver class with unit tests - `Engine/src/utils/variable-resolver.ts`
- [x] Update TestEngine to resolve and pass variables - `Engine/src/engine/TestEngine.ts`
- [x] Update DriverExecutionContext interface - `Engine/src/types.ts`
- [x] Store resolved variables on TestRun - integrated in TestEngine
- [x] Update AgentEvalDriver to use AIConfiguration variable - `Engine/src/drivers/AgentEvalDriver.ts`
- [x] Add --var flag to CLI run command - `CLI/src/commands/run.ts`
- [x] Add --var flag to CLI suite command - `CLI/src/commands/suite.ts`
- [x] Add --show-variables flag to CLI list command - `CLI/src/commands/list.ts`
- [x] Add Agent Eval test type VariablesSchema metadata - `metadata/test-types/`

### Phase 2: Enhanced Features (Future)
- [ ] Entity-sourced variables (pull values from AI Configurations table)
- [ ] Variable validation in UI
- [ ] Variable suggestions/autocomplete in CLI
- [ ] Suite-level variable defaults in UI

### Phase 3: Advanced Features (Future)
- [ ] Test matrix execution (run test with all combinations)
- [ ] Variable dependencies (e.g., Model depends on Provider)
- [ ] Variable profiles/presets (named collections of values)

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `migrations/v2/V*.sql` | New | Add columns to TestType, Test, TestSuite, TestRun, TestSuiteRun |
| `EngineBase/src/types.ts` | Modify | Add variable interfaces |
| `Engine/src/types.ts` | Modify | Update DriverExecutionContext |
| `Engine/src/utils/variable-resolver.ts` | New | Variable resolution logic |
| `Engine/src/engine/TestEngine.ts` | Modify | Integrate variable resolution |
| `Engine/src/drivers/BaseTestDriver.ts` | Modify | Document variable access patterns |
| `Engine/src/drivers/AgentEvalDriver.ts` | Modify | Use resolved variables for AI config |
| `CLI/src/commands/run.ts` | Modify | Add --var flag |
| `CLI/src/commands/suite.ts` | Modify | Add --var flag |
| `CLI/src/commands/list.ts` | Modify | Add --show-variables flag |
| `metadata/test-types/.agent-eval.json` | Modify | Add VariablesSchema |

## Testing Strategy

1. **Unit Tests**
   - VariableResolver resolution logic
   - Priority order tests
   - Validation tests (type, allowed values)
   - Locked variable tests

2. **Integration Tests**
   - End-to-end test run with variables
   - Suite run with variable propagation
   - CLI --var flag parsing

3. **Manual Testing**
   - Run Skip agent test with different AI configurations
   - Verify results stored correctly in TestRun.ResolvedVariables
   - Compare test results across configurations

## Open Questions

1. ~~Should variables be stored as structured tables or JSON?~~ **Decision: JSON**
2. ~~For enumerated variables like AIConfiguration, should we reference entities?~~ **Decision: Static for Phase 1, entity sourcing in Phase 2**
3. How should we handle backward compatibility for existing tests without Variables config? **Recommendation: Treat missing config as "all type variables exposed with type defaults"**
4. Should we add a "list variables" CLI command? **Recommendation: Yes, add --show-variables flag to `mj test list`**
