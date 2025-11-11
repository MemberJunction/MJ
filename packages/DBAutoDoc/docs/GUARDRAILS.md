# Granular Guardrails System

The DBAutoDoc guardrails system provides comprehensive control over resource consumption during database analysis. It supports multiple levels of enforcement to prevent runaway analysis and manage costs effectively.

## Overview

The guardrails system enforces limits at multiple levels:

1. **Total Run Limits** - Stop after consuming total tokens, duration, or cost across entire analysis
2. **Per-Phase Limits** - Control token usage in specific analysis phases (discovery, analysis, sanity checks)
3. **Per-Iteration Limits** - Cap tokens and duration per iteration to detect iteration-level exhaustion
4. **Warning Thresholds** - Alert when approaching limits at configurable percentages

## Configuration

### Basic Guardrails (Legacy Support)

```json
{
  "analysis": {
    "guardrails": {
      "maxTokensPerRun": 250000,
      "maxDurationSeconds": 3600,
      "maxCostDollars": 50,
      "warnThresholds": {
        "tokenPercentage": 80,
        "durationPercentage": 80,
        "costPercentage": 80
      }
    }
  }
}
```

### Granular Guardrails (Recommended)

```json
{
  "analysis": {
    "guardrails": {
      "enabled": true,
      "stopOnExceeded": true,

      // Total run limits (hard limits - stop execution)
      "maxTokensPerRun": 250000,
      "maxDurationSeconds": 3600,
      "maxCostDollars": 50,

      // Per-phase token limits
      "maxTokensPerPhase": {
        "discovery": 100000,
        "analysis": 150000,
        "sanityChecks": 50000
      },

      // Per-iteration limits
      "maxTokensPerIteration": 50000,
      "maxIterationDurationSeconds": 600,

      // Warning thresholds (at X% of limits)
      "warnThresholds": {
        "tokenPercentage": 80,
        "durationPercentage": 80,
        "costPercentage": 80,
        "iterationTokenPercentage": 85,
        "phaseTokenPercentage": 85
      }
    }
  }
}
```

## Configuration Options

### Hard Limits (Stop Execution)

These limits cause immediate termination when exceeded (if `stopOnExceeded: true`):

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxTokensPerRun` | number | undefined | Maximum tokens for entire analysis run |
| `maxDurationSeconds` | number | undefined | Maximum duration in seconds |
| `maxCostDollars` | number | undefined | Maximum estimated cost in USD |
| `maxTokensPerPrompt` | number | undefined | Maximum tokens per individual prompt (truncation) |

### Per-Phase Limits

Control token budget for specific analysis phases:

```typescript
maxTokensPerPhase?: {
  discovery?: number;     // Relationship discovery phase
  analysis?: number;      // Main table/column analysis
  sanityChecks?: number;  // Validation and sanity checks
}
```

Use case: If your database has complex relationships, allocate more tokens to discovery; for stable schemas, minimize discovery tokens.

### Per-Iteration Limits

Detect when individual iterations are consuming excessive resources:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxTokensPerIteration` | number | undefined | Tokens per convergence iteration |
| `maxIterationDurationSeconds` | number | undefined | Time limit per iteration |

Use case: Identify iterations that spiral into expensive backpropagation cycles.

### Control Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | true | Enable all guardrails checks |
| `stopOnExceeded` | boolean | true | Stop immediately when hard limit exceeded |

### Warning Thresholds

Warnings are issued when approaching limits (percentage-based):

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `tokenPercentage` | number | 80 | Warn at % of `maxTokensPerRun` |
| `durationPercentage` | number | 80 | Warn at % of `maxDurationSeconds` |
| `costPercentage` | number | 80 | Warn at % of `maxCostDollars` |
| `iterationTokenPercentage` | number | 80 | Warn at % of `maxTokensPerIteration` |
| `phaseTokenPercentage` | number | 80 | Warn at % of `maxTokensPerPhase` limits |

## Enforcement Behavior

### How Guardrails Work

1. **Check Frequency**: Guardrails are checked after each LLM prompt execution
2. **Hard Limits**: If a hard limit is exceeded and `stopOnExceeded: true`, execution stops immediately
3. **Warnings**: When usage approaches thresholds, warnings are logged but execution continues
4. **Tracking**: All enforcements (warnings and stops) are recorded in `run.guardrailsEnforced`

### Stop Behavior

When a hard limit is exceeded:

1. Current analysis stops (no additional prompts executed)
2. Partially-analyzed tables remain in incomplete state
3. Analysis can be resumed from the state file (future enhancement)
4. Error reason recorded in `guardrailsEnforced.stoppedReason`

### Warning Behavior

When approaching a limit:

1. Warning is logged to console and `run.warnings`
2. Execution continues normally
3. User can manually stop or let execution proceed
4. Multiple warnings may be issued as resource usage increases

## Monitoring

### Run-Level Metrics

Track overall resource consumption:

```typescript
run.totalTokensUsed       // Total tokens for entire run
run.estimatedCost         // Estimated cost in USD
```

### Phase Metrics

Per-phase resource consumption:

```typescript
run.phaseMetrics = {
  discovery?: {
    tokensUsed: number;
    estimatedCost: number;
    warned?: boolean;
    exceeded?: boolean;
  },
  analysis?: { /* same structure */ },
  sanityChecks?: { /* same structure */ }
}
```

### Iteration Metrics

Track resources per convergence iteration:

```typescript
run.iterationMetrics = [
  {
    iterationNumber: 1,
    tokensUsed: 12345,
    estimatedCost: 0.15,
    duration: 45000,  // milliseconds
    warned?: boolean
  },
  // ... more iterations
]
```

### Enforcement Records

Detailed information about guardrails actions:

```typescript
run.guardrailsEnforced = {
  exceedances: [
    {
      type: 'tokens_per_phase',
      phase: 'analysis',
      limit: 150000,
      actual: 155000,
      unit: 'tokens'
    }
  ],
  warnings: [
    {
      type: 'tokens_per_run',
      percentage: 85,
      message: 'Token usage at 85%...'
    }
  ],
  stoppedDueToGuardrails: true,
  stoppedReason: 'Phase token limit exceeded (analysis)...'
}
```

## Usage Examples

### Example 1: Conservative Analysis (Small Database)

```json
{
  "guardrails": {
    "enabled": true,
    "maxTokensPerRun": 50000,
    "maxDurationSeconds": 600,
    "maxCostDollars": 10,
    "maxTokensPerPhase": {
      "discovery": 10000,
      "analysis": 30000,
      "sanityChecks": 10000
    },
    "warnThresholds": {
      "tokenPercentage": 75
    }
  }
}
```

### Example 2: Large Complex Database

```json
{
  "guardrails": {
    "enabled": true,
    "maxTokensPerRun": 500000,
    "maxDurationSeconds": 7200,
    "maxCostDollars": 100,
    "maxTokensPerPhase": {
      "discovery": 200000,  // Complex relationships need more tokens
      "analysis": 250000,
      "sanityChecks": 50000
    },
    "maxTokensPerIteration": 100000,
    "warnThresholds": {
      "tokenPercentage": 80,
      "iterationTokenPercentage": 75  // Alert on expensive iterations
    }
  }
}
```

### Example 3: Development/Testing (No Limits)

```json
{
  "guardrails": {
    "enabled": false  // Disable all guardrails for exploratory analysis
  }
}
```

## Cost Management

### Understanding Cost Estimates

Cost is estimated based on:

1. **Token Count**: Total input + output tokens
2. **Model Pricing**: From AI provider configuration
3. **Vendor Rates**: Per-token pricing set in system configuration

### Cost-Based Limits

Stop analysis when estimated cost exceeds threshold:

```json
{
  "maxCostDollars": 25,
  "warnThresholds": {
    "costPercentage": 80  // Warn at 80% of $25 = $20
  }
}
```

### Cost Prediction

Before starting analysis, estimate:

1. **Expected token usage** based on:
   - Database size (schemas, tables, columns)
   - Relationship complexity
   - Requested analysis depth

2. **Associated cost** using:
   - Model pricing from configuration
   - Historical analysis patterns
   - Phase allocation percentages

## Best Practices

### 1. Start Conservative

Begin with lower limits, gradually increase as you understand resource consumption:

```json
{
  "maxTokensPerRun": 100000,  // Start here
  "maxDurationSeconds": 1800  // 30 minutes
}
```

Monitor actual usage in state files, then adjust.

### 2. Allocate by Phase

Distribute token budget across phases based on your database:

```json
{
  "maxTokensPerRun": 300000,
  "maxTokensPerPhase": {
    "discovery": 0.25 * 300000,    // 25% for discovery
    "analysis": 0.65 * 300000,     // 65% for main analysis
    "sanityChecks": 0.10 * 300000  // 10% for validation
  }
}
```

### 3. Monitor Warnings

Don't ignore warnings - they indicate:

- Approaching limits (may need to increase or optimize)
- Inefficient analysis (may need config tweaks)
- Model cost considerations (premium models consume more tokens)

### 4. Set Iteration Limits

For databases with convergence issues:

```json
{
  "maxTokensPerIteration": 50000,      // Stop iteration if it uses too many
  "maxIterationDurationSeconds": 300   // Kill slow iterations
}
```

### 5. Enable Selective Phases

If you only care about specific analysis phases, set phase limits:

```json
{
  "maxTokensPerPhase": {
    "analysis": 200000,           // Focus tokens on main analysis
    "sanityChecks": 10000         // Minimal validation
    // discovery: undefined         // No limit
  }
}
```

## Troubleshooting

### Analysis Stops Due to Limits

**Problem**: "Token limit exceeded" or similar error

**Solutions**:
1. Check which limit was exceeded in `guardrailsEnforced.exceedances`
2. Increase the specific limit (phase, iteration, or total)
3. Reduce analysis scope (fewer schemas, disable features)
4. Optimize model selection (faster models use fewer tokens)

### Warnings Issued Too Early

**Problem**: Warnings at 50% usage instead of 80%

**Check**:
1. Verify `warnThresholds` configuration
2. Ensure thresholds are expressed as percentages (0-100)
3. Review actual vs. expected token usage

### Iterations Taking Too Long

**Problem**: Single iteration uses excessive tokens

**Solutions**:
1. Set `maxTokensPerIteration` to prevent runaway cycles
2. Increase `convergence.maxIterations` if iterations are valuable
3. Tune `convergence.stabilityWindow` to converge faster
4. Consider disabling `backpropagation` if not needed

## Implementation Details

### GuardrailsManager Class

The `GuardrailsManager` class handles:

- Phase lifecycle management (start/end phase tracking)
- Iteration tracking (token and duration per iteration)
- Guard rail checking (return enforcement decisions)
- Metric recording (store enforcement data in run)

### Prompt Engine Integration

The `PromptEngine` checks guardrails after each LLM call:

```typescript
const result = await promptEngine.executePrompt(...);
const guardrailCheck = guardrailsManager.checkGuardrails(run);

if (!guardrailCheck.canContinue) {
  // Stop and record reason
  run.status = 'stopped';
  return;
}
```

### State Persistence

All metrics are stored in state file for:
- Resuming analysis from specific point
- Post-analysis review of resource usage
- Historical comparison across runs

## Future Enhancements

Planned improvements:

1. **Resume from Checkpoint**: Continue analysis from where guardrails stopped
2. **Predictive Warnings**: Estimate when limits will be exceeded
3. **Dynamic Adjustment**: Automatically reduce scope if limits approached
4. **Cost Forecasting**: Predict final cost before completion
5. **Per-Schema Limits**: Control resources per schema independently
