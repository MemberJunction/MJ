# Guardrails Implementation Guide

This document describes how the granular guardrails system is implemented and how to extend it.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ AnalysisOrchestrator                                        │
│ - Orchestrates phases (discovery, analysis, sanity checks)  │
│ - Creates AnalysisRun and AnalysisEngine                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ AnalysisEngine                                              │
│ - Manages main analysis workflow                            │
│ - Delegates guardrail checks to GuardrailsManager          │
│ - Tracks iteration progression                             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ GuardrailsManager                                           │
│ - Phase lifecycle (startPhase, endPhase)                   │
│ - Iteration tracking (startIteration, endIteration)        │
│ - Check enforcement (checkGuardrails)                      │
│ - Record metrics (recordEnforcement)                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ PromptEngine                                                │
│ - Executes LLM prompts                                      │
│ - Calls guardrail check after each prompt                  │
│ - Returns canContinue flag                                 │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### Configuration

```
config.json
    ↓
GuardrailsConfig (interface)
    ↓
GuardrailsManager (initialization)
```

### Execution

```
startAnalysis(run)
    ↓
startPhase('analysis')
    ↓
[Execute Prompts]
    ├→ checkGuardrails(run) [after each prompt]
    ├→ recordEnforcement(run)
    ↓
endPhase('analysis')
    ├→ record phaseMetrics
    ↓
startIteration(1)
    ├→ [Process level, backpropagation, sanity checks]
    ├→ endIteration(1)
    ├→ record iterationMetrics
    ↓
[Next iteration...]
```

## Key Classes

### GuardrailsManager

**Location**: `src/core/GuardrailsManager.ts`

**Responsibilities**:
- Manage phase lifecycle
- Track iteration metrics
- Check guardrail limits
- Record enforcement data

**Key Methods**:

```typescript
public startPhase(phase: PhaseType): void
// Begin tracking a new phase
// Updates phaseStartTimes map

public endPhase(run: AnalysisRun, phase: PhaseType): void
// End phase tracking and record metrics in run.phaseMetrics

public startIteration(iteration: number): void
// Begin iteration tracking

public endIteration(run: AnalysisRun, iteration: number): void
// Record iteration metrics in run.iterationMetrics

public checkGuardrails(run: AnalysisRun): GuardrailCheckResult
// Perform all guard rail checks
// Returns: { canContinue, warnings?, exceedances?, reason? }

public recordEnforcement(run: AnalysisRun, result: GuardrailCheckResult): void
// Store enforcement results in run.guardrailsEnforced
```

### AnalysisEngine Changes

**Updated Constructor**:
```typescript
constructor(...) {
  // ...
  this.guardrailsManager = new GuardrailsManager(config.analysis.guardrails);

  this.promptEngine.setGuardrailCheck(() => {
    const result = this.guardrailsManager.checkGuardrails(this.currentRun!);
    this.guardrailsManager.recordEnforcement(this.currentRun!, result);
    return result;
  });
}
```

**Updated startAnalysis**:
```typescript
public startAnalysis(run: AnalysisRun): void {
  this.startTime = Date.now();
  this.currentRun = run;
  this.guardrailsManager.startPhase('analysis');  // NEW
}
```

## Type System

### GuardrailsConfig (Configuration)

```typescript
interface GuardrailsConfig {
  // Hard limits
  maxTokensPerRun?: number;
  maxDurationSeconds?: number;
  maxCostDollars?: number;
  maxTokensPerPrompt?: number;

  // Per-phase limits
  maxTokensPerPhase?: {
    discovery?: number;
    analysis?: number;
    sanityChecks?: number;
  };

  // Per-iteration limits
  maxTokensPerIteration?: number;
  maxIterationDurationSeconds?: number;

  // Warning thresholds
  warnThresholds?: {
    tokenPercentage?: number;
    durationPercentage?: number;
    costPercentage?: number;
    iterationTokenPercentage?: number;
    phaseTokenPercentage?: number;
  };

  // Control
  enabled?: boolean;
  stopOnExceeded?: boolean;
}
```

### Run State Tracking

```typescript
interface AnalysisRun {
  // ... existing fields ...

  // Granular guardrail tracking
  phaseMetrics?: PhaseMetrics;
  iterationMetrics?: IterationMetrics[];
  guardrailsEnforced?: GuardrailEnforcement;
}

interface PhaseMetrics {
  discovery?: PhaseMetric;
  analysis?: PhaseMetric;
  sanityChecks?: PhaseMetric;
}

interface PhaseMetric {
  startedAt: string;
  completedAt?: string;
  tokensUsed: number;
  estimatedCost: number;
  warned?: boolean;
  exceeded?: boolean;
}

interface IterationMetrics {
  iterationNumber: number;
  startedAt: string;
  completedAt?: string;
  tokensUsed: number;
  estimatedCost: number;
  duration: number;
  warned?: boolean;
}

interface GuardrailEnforcement {
  exceedances: GuardrailExceeded[];
  warnings: GuardrailWarning[];
  stoppedDueToGuardrails?: boolean;
  stoppedReason?: string;
}

interface GuardrailExceeded {
  type: 'tokens_per_run' | 'tokens_per_phase' | 'tokens_per_iteration' |
        'duration' | 'cost' | 'iteration_duration';
  phase?: string;
  iteration?: number;
  limit: number;
  actual: number;
  unit: string;
}

interface GuardrailWarning {
  type: string;
  phase?: string;
  iteration?: number;
  percentage: number;
  message: string;
}
```

## Integration Points

### 1. AnalysisOrchestrator (Discovery Phase)

The discovery phase uses its own guardrails through `DiscoveryEngine`:

```typescript
const discoveryRatio = config.analysis.relationshipDiscovery.tokenBudget?.ratioOfTotal || 0.25;
const discoveryTokenBudget = totalTokenBudget
  ? Math.floor(totalTokenBudget * discoveryRatio)
  : config.analysis.relationshipDiscovery.tokenBudget?.maxTokens || 50000;
```

**Future Enhancement**: Create separate GuardrailsManager for discovery phase to track per-phase metrics.

### 2. PromptEngine (Guardrail Checking)

Currently, `PromptEngine.setGuardrailCheck()` is called with a callback:

```typescript
promptEngine.setGuardrailCheck(() => {
  const result = guardrailsManager.checkGuardrails(run);
  guardrailsManager.recordEnforcement(run, result);
  return result;
});
```

The prompt engine then:
1. Calls this callback after LLM execution
2. If `result.canContinue === false`, stops processing
3. Returns guardrailExceeded flag to caller

### 3. StateManager (Persistence)

When saving state, phase and iteration metrics are automatically included in `AnalysisRun`:

```typescript
await stateManager.save(state);  // Includes guardrails data
```

## Control Flow Examples

### Example: Monitoring Iteration Token Usage

```typescript
// In AnalysisEngine.processLevel()
for (let iteration = 0; iteration < maxIterations; iteration++) {
  this.guardrailsManager.startIteration(iteration + 1);

  // Process level...
  for (const table of tables) {
    const result = await this.analyzeTable(state, run, table, level);
    if (result.guardrailExceeded) {
      break;  // Stop on guardrail
    }
  }

  this.guardrailsManager.endIteration(run, iteration + 1);

  // After iteration, check if we should continue
  const check = this.guardrailsManager.checkGuardrails(run);
  if (!check.canContinue) {
    // Stop main loop
    break;
  }
}
```

### Example: Phase-Specific Limits

```typescript
// In AnalysisOrchestrator
if (this.config.analysis.sanityChecks.schemaLevel) {
  this.guardrailsManager.startPhase('sanityChecks');

  for (const schema of state.schemas) {
    await analysisEngine.performSchemaLevelSanityCheck(state, run, schema);
  }

  this.guardrailsManager.endPhase(run, 'sanityChecks');
}
```

## Extending the System

### Adding New Limit Types

1. **Define in GuardrailsConfig**:
```typescript
interface GuardrailsConfig {
  maxTablesPerIteration?: number;  // NEW
}
```

2. **Add to GuardrailCheckResult type**:
```typescript
type GuardrailExceeded =
  | /* ... existing ... */
  | { type: 'tables_per_iteration'; ... };
```

3. **Implement in GuardrailsManager.checkGuardrails()**:
```typescript
if (this.config.maxTablesPerIteration && tablesProcessed >= this.config.maxTablesPerIteration) {
  exceedances.push({
    type: 'tables_per_iteration',
    iteration: this.currentIteration,
    limit: this.config.maxTablesPerIteration,
    actual: tablesProcessed,
    unit: 'tables'
  });
  // Return stop result
}
```

### Adding New Phases

1. **Add to PhaseType union**:
```typescript
export type PhaseType = 'discovery' | 'analysis' | 'sanityChecks' | 'export';  // NEW
```

2. **Add config option**:
```typescript
maxTokensPerPhase?: {
  discovery?: number;
  analysis?: number;
  sanityChecks?: number;
  export?: number;  // NEW
}
```

3. **Use in code**:
```typescript
this.guardrailsManager.startPhase('export');
// ... export work ...
this.guardrailsManager.endPhase(run, 'export');
```

### Logging Enforcement Events

To integrate with a logging system:

```typescript
public recordEnforcement(run: AnalysisRun, result: GuardrailCheckResult): void {
  if (!run.guardrailsEnforced) {
    run.guardrailsEnforced = { exceedances: [], warnings: [] };
  }

  if (result.exceedances) {
    result.exceedances.forEach(exc => {
      logger.warn(`Guardrail exceeded: ${exc.type}`, exc);
    });
  }

  if (result.warnings) {
    result.warnings.forEach(warn => {
      logger.info(`Guardrail warning: ${warn.type}`, warn);
    });
  }
}
```

## Testing

### Unit Tests (Planned)

```typescript
describe('GuardrailsManager', () => {

  it('should detect token limit exceeded', () => {
    const manager = new GuardrailsManager({
      maxTokensPerRun: 1000
    });

    const run: AnalysisRun = {
      totalTokensUsed: 1001,
      // ... other fields ...
    };

    const result = manager.checkGuardrails(run);
    expect(result.canContinue).toBe(false);
    expect(result.reason).toContain('Token limit exceeded');
  });

  it('should warn at threshold', () => {
    const manager = new GuardrailsManager({
      maxTokensPerRun: 1000,
      warnThresholds: { tokenPercentage: 80 }
    });

    const run: AnalysisRun = {
      totalTokensUsed: 850,
      // ... other fields ...
    };

    const result = manager.checkGuardrails(run);
    expect(result.canContinue).toBe(true);
    expect(result.warnings).toBeDefined();
  });

  it('should track phase metrics', () => {
    const manager = new GuardrailsManager();
    const run = createTestRun();

    manager.startPhase('analysis');
    // ... simulate analysis ...
    manager.endPhase(run, 'analysis');

    expect(run.phaseMetrics?.analysis).toBeDefined();
    expect(run.phaseMetrics.analysis?.tokensUsed).toBeGreaterThan(0);
  });
});
```

### Integration Tests (Planned)

- Test phase transitions during full analysis
- Test iteration metrics with real convergence cycles
- Test cost calculations with different model pricing
- Test resume capability with saved guardrails state

## Monitoring & Observability

### Metrics to Track

1. **Per-phase efficiency**:
   - tokens_per_phase_discovery
   - tokens_per_phase_analysis
   - tokens_per_phase_sanity_checks

2. **Per-iteration patterns**:
   - avg_tokens_per_iteration
   - iteration_duration_percentiles
   - iterations_hitting_warnings

3. **Cost metrics**:
   - estimated_cost_total
   - cost_per_table_analyzed
   - cost_per_phase

### Logging Recommendations

```typescript
// After analysis complete
console.log('Guardrails Summary:', {
  total: {
    tokens: run.totalTokensUsed,
    cost: run.estimatedCost,
    duration: elapsed
  },
  phases: run.phaseMetrics,
  iterations: run.iterationMetrics?.length,
  enforcements: run.guardrailsEnforced
});
```

## Performance Considerations

### Overhead of Guardrails Checking

GuardrailsManager adds minimal overhead:
- `checkGuardrails()`: O(1) - just comparisons and lookups
- `recordEnforcement()`: O(n) where n = number of exceedances/warnings (typically < 5)
- Phase/iteration tracking: O(1) map operations

### Optimization

For high-frequency checking:
1. Cache config parsing in constructor
2. Pre-calculate thresholds instead of per-check
3. Use early-exit in checks (most complete before reaching end)

Current implementation already optimized with:
- Pre-cached threshold percentages
- Early return on first exceeded limit
- Minimal object allocation

## Backward Compatibility

The new system maintains backward compatibility:

1. **Old config still works**:
```json
{
  "maxTokensPerRun": 250000,
  "maxDurationSeconds": 3600,
  "warnThresholds": { "tokenPercentage": 80 }
}
```

2. **New fields optional**: All phase/iteration tracking fields optional
3. **Default behavior**: If guardrails disabled or not configured, analysis proceeds normally
4. **No breaking changes**: Existing analysis workflows unchanged

## Future Roadmap

### Phase 1 (Current)
- Granular per-phase limits
- Per-iteration tracking
- Cost-based limits
- Detailed enforcement recording

### Phase 2
- Resume from checkpoint
- Predictive warnings
- Cost forecasting
- Per-schema limits

### Phase 3
- Dynamic adjustment of scope
- Automatic model selection based on limits
- Multi-run analysis aggregation
- Cost optimization suggestions
