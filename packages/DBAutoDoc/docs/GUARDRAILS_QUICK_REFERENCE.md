# Guardrails Quick Reference

## Configuration Template

```json
{
  "analysis": {
    "guardrails": {
      // Enable guardrails
      "enabled": true,

      // HARD LIMITS (stop execution when exceeded)
      "maxTokensPerRun": 250000,           // Total tokens for entire run
      "maxDurationSeconds": 3600,          // Total time (1 hour)
      "maxCostDollars": 50,                // Maximum spend ($50)

      // PER-PHASE TOKEN LIMITS
      "maxTokensPerPhase": {
        "discovery": 100000,               // 40% of tokens
        "analysis": 150000,                // 60% of tokens
        "sanityChecks": 50000              // 20% of tokens
      },

      // PER-ITERATION LIMITS
      "maxTokensPerIteration": 50000,      // Stop iteration at 50K tokens
      "maxIterationDurationSeconds": 600,  // Stop iteration at 10 minutes

      // WARNING THRESHOLDS (at X% of limits)
      "warnThresholds": {
        "tokenPercentage": 80,             // Warn at 80% of max
        "durationPercentage": 80,          // Warn at 80% of max
        "costPercentage": 80,              // Warn at 80% of max
        "iterationTokenPercentage": 85,    // Warn at 85% of iteration limit
        "phaseTokenPercentage": 85         // Warn at 85% of phase limit
      },

      "stopOnExceeded": true               // Stop immediately on hard limit
    }
  }
}
```

## Configuration Presets

### Development (No Limits)
```json
{
  "enabled": false
}
```

### Small Database (Conservative)
```json
{
  "maxTokensPerRun": 50000,
  "maxDurationSeconds": 600,
  "maxCostDollars": 10
}
```

### Medium Database
```json
{
  "maxTokensPerRun": 250000,
  "maxDurationSeconds": 3600,
  "maxCostDollars": 50,
  "maxTokensPerPhase": {
    "discovery": 50000,
    "analysis": 150000,
    "sanityChecks": 50000
  }
}
```

### Large Complex Database
```json
{
  "maxTokensPerRun": 500000,
  "maxDurationSeconds": 7200,
  "maxCostDollars": 100,
  "maxTokensPerPhase": {
    "discovery": 200000,    // Complex relationships
    "analysis": 250000,
    "sanityChecks": 50000
  },
  "maxTokensPerIteration": 100000,
  "warnThresholds": {
    "iterationTokenPercentage": 75  // Alert on expensive iterations
  }
}
```

## Key Metrics

### In State File (run.phaseMetrics)

```typescript
// After each phase completes:
{
  discovery: {
    tokensUsed: 45000,
    estimatedCost: 0.45,
    startedAt: "2024-01-01T10:00:00Z",
    completedAt: "2024-01-01T10:05:00Z",
    warned: false,
    exceeded: false
  }
}
```

### In State File (run.iterationMetrics)

```typescript
// After each iteration:
[
  {
    iterationNumber: 1,
    tokensUsed: 25000,
    estimatedCost: 0.25,
    duration: 45000,  // milliseconds
    startedAt: "2024-01-01T10:05:00Z",
    completedAt: "2024-01-01T10:05:45Z",
    warned: false
  }
]
```

### In State File (run.guardrailsEnforced)

```typescript
{
  exceedances: [
    {
      type: "tokens_per_phase",
      phase: "analysis",
      limit: 150000,
      actual: 155000,
      unit: "tokens"
    }
  ],
  warnings: [
    {
      type: "tokens_per_run",
      percentage: 85,
      message: "Token usage at 85% (212500 / 250000)"
    }
  ],
  stoppedDueToGuardrails: true,
  stoppedReason: "Phase token limit exceeded (analysis): 155000 / 150000 tokens"
}
```

## Monitoring Checklist

- [ ] Set `maxTokensPerRun` to control total budget
- [ ] Set `maxDurationSeconds` to control wall-clock time
- [ ] Set `maxCostDollars` to control spending
- [ ] Allocate `maxTokensPerPhase` based on database complexity
- [ ] Set `maxTokensPerIteration` if convergence is slow
- [ ] Configure `warnThresholds` conservatively (80-85%)
- [ ] Run test analysis and review `phaseMetrics`
- [ ] Check `iterationMetrics` for expensive iterations
- [ ] Review `guardrailsEnforced` for enforcement records

## Typical Workflow

1. **Initial Run**
   - Start with conservative limits
   - Disable some limits: `"maxTokensPerPhase": undefined`
   - Monitor actual token usage

2. **Review Metrics**
   ```bash
   cat output/run-1/state.json | jq '.summary'
   cat output/run-1/state.json | jq '.phases.descriptionGeneration[0].phaseMetrics'
   cat output/run-1/state.json | jq '.phases.descriptionGeneration[0].iterationMetrics'
   ```

3. **Adjust Configuration**
   - Increase limits that were exceeded
   - Decrease limits that had low usage
   - Set per-phase limits based on observed distribution

4. **Optimize**
   - Reduce `convergence.maxIterations` if iterations are expensive
   - Disable `backpropagation` if not needed
   - Adjust `sanityChecks` settings

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Analysis stops at limit | Increase limit or reduce analysis scope |
| Warnings too early | Check threshold values (should be 75-85%) |
| High iteration costs | Set `maxTokensPerIteration` or `maxIterationDurationSeconds` |
| Unexpected phase costs | Review which phase is using most tokens, increase that phase limit |
| Cost exceeds budget | Set `maxCostDollars` lower or use cheaper model |

## Limit Calculation

### Total Budget Distribution

```
Total: 250,000 tokens @ $0.002/1K = $0.50

Discovery Phase (40%):  100,000 tokens
Analysis Phase (60%):   150,000 tokens
Sanity Checks (20%):     50,000 tokens
Total:                  300,000 tokens (allow 20% overage)
```

### Per-Iteration Budget

```
Max iterations: 50
Token budget: 250,000 total
Per iteration average: ~5,000 tokens
Safety limit: 50,000 tokens/iteration (10x average)
```

### Cost Calculation

```
Model: gpt-4-turbo
Input: $0.01 per 1K tokens
Output: $0.03 per 1K tokens

Example:
- 50,000 input tokens = $0.50
- 50,000 output tokens = $1.50
- Total per run: ~$2.00

Set maxCostDollars: $10 for safety (5x buffer)
```

## Phase Information

### Discovery Phase
- Detects primary keys and foreign keys
- Analyzes relationships automatically
- Budget: 20-40% of total (depends on complexity)
- Can be disabled: `relationshipDiscovery.enabled: false`

### Analysis Phase
- Generates table and column descriptions
- Performs semantic analysis
- Budget: 50-70% of total
- Most token-intensive phase

### Sanity Checks Phase
- Validates descriptions
- Cross-schema consistency
- Budget: 10-20% of total
- Can be disabled: `sanityChecks.schemaLevel: false`

## API Usage

### Checking Guardrails Programmatically

```typescript
const guardrailsManager = new GuardrailsManager(config.analysis.guardrails);

// Start phase
guardrailsManager.startPhase('analysis');

// ... do work ...

// Check guardrails
const check = guardrailsManager.checkGuardrails(run);
if (!check.canContinue) {
  console.log('Stop reason:', check.reason);
  run.status = 'stopped';
  break;
}

// End phase
guardrailsManager.endPhase(run, 'analysis');

// Access metrics
console.log('Phase tokens:', run.phaseMetrics?.analysis?.tokensUsed);
console.log('Iteration count:', run.iterationMetrics?.length);
console.log('Enforcements:', run.guardrailsEnforced);
```

## JSON Query Examples

### Get total tokens by phase
```bash
cat state.json | jq '.phases.descriptionGeneration[0].phaseMetrics | to_entries | map({phase: .key, tokens: .value.tokensUsed})'
```

### Get iteration costs
```bash
cat state.json | jq '.phases.descriptionGeneration[0].iterationMetrics | map({iteration: .iterationNumber, tokens: .tokensUsed, cost: .estimatedCost})'
```

### Find guardrail exceedances
```bash
cat state.json | jq '.phases.descriptionGeneration[0].guardrailsEnforced.exceedances'
```

### Check for warnings
```bash
cat state.json | jq '.phases.descriptionGeneration[0].guardrailsEnforced.warnings | length'
```

## Environment Variables

Guardrails can be configured via environment (future enhancement):

```bash
export DBAUTO_DOC_MAX_TOKENS=250000
export DBAUTO_DOC_MAX_COST=50
export DBAUTO_DOC_MAX_DURATION=3600
```

## Best Practices

1. **Start Conservative**: Low limits, increase after testing
2. **Phase Allocation**: Allocate based on your database complexity
3. **Monitor Iterations**: Watch for iterations using 50%+ of per-iteration budget
4. **Use Cost Limits**: Protect against expensive models
5. **Review Warnings**: Don't ignore warnings - they indicate approaching limits
6. **Benchmark**: Run same database multiple times to establish patterns
7. **Document**: Note why you chose specific limits
8. **Adjust**: Change limits based on observed patterns

## Summary

**Essential Limits**:
- ✅ Always set: `maxTokensPerRun`, `maxDurationSeconds`, `maxCostDollars`
- ✅ Highly Recommended: `maxTokensPerPhase`, `warnThresholds`
- ✅ Optional: `maxTokensPerIteration`, `maxIterationDurationSeconds`

**Default Behavior**:
- If not set: Limits are disabled (unlimited)
- If set but phase has no limit: Phase is unlimited
- Warnings default to 80% threshold
- If `enabled: false`: All guardrails disabled
