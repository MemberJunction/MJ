# Execution Limits Configuration, Literal Sweep, Approved Backstops & Runaway Governance

MemberJunction centralizes all execution limits, safety backstops, multi-scope budgets, deterministic progress detection, and operational tuning knobs in **`LimitsConfigResolver`** (`packages/MJCore/src/generic/limitsConfig.ts`) with a uniform 5-tier precedence chain and zero unapproved `RunawayGuard` numeric literals anywhere else in the codebase.

---

## 1. The 5-Tier `limits` Configuration Surface

`LimitsConfigResolver.Instance.Resolve(layers?, options?)` merges five tiers from lowest to highest precedence:

| Rank | Tier | Source | Notes |
|---|---|---|---|
| 1 | `CodeFallback` | `CODE_FALLBACK_LIMITS` / `DEFAULT_MJ_LIMITS_CONFIG` | Built-in approved defaults in `@memberjunction/core`. |
| 2 | `MjConfig` | `mj.config.cjs` `limits` block | Loaded at startup by `packages/MJServer/src/config.ts` and registered via `LimitsConfigResolver.Instance.RegisterMjConfigLimits(config.limits)`. |
| 3 | `AgentOrWorkflowMetadata` | `MJ: AI Agents` (`MaxCostPerRun`, `MaxTimePerRun`, `MaxTokensPerRun`, `TypeConfiguration.limits`) & workflow/channel metadata | Resolved per run via `ResolveAgentRunLimits()` (`@memberjunction/ai-core-plus`). |
| 4 | `UserAgentPolicy` | `MJ: AI Agent User Policies` (`Status = 'Active'`) | User-scoped policy overrides; supports `EnforceUserPolicyAsCeiling: true` so `RunOverride` cannot raise finite ceilings above user policy bounds. |
| 5 | `RunOverride` | `ExecuteAgentParams` (`absoluteMaxIterations`, `maxExecutionTimeMs`, `maxTreeCost`, `maxTreeTokens`, `limitsOverride`) | Per-run override (highest precedence; clamped when policy ceiling enforcement is enabled). |

Every resolved key carries full per-key provenance (`KeyRole`, `SourceTier`, `IsOverridden`, `TierValues`, `WasClampedByPolicyCeiling`) serialized into `AIAgentRun.Data.__limitsDiagnostics` (`LimitsDiagnosticsSnapshot`).

### Overridable Defaults vs. Policy Ceilings & Override Authorization

`LIMITS_KEY_ROLES` (`GetLimitsKeyRole`, `IsPolicyCeilingKey`) distinguishes every limit key into two governance roles:
- **`PolicyCeiling`**: Numeric safety backstops, briefing caps, dollar/wall-clock/token budget caps (`Budgets.*` numeric fields), `ProgressDetector.FastJudgeMaxInputChars`, and `ResourceGuards.*`. Any user/caller may **tighten** a ceiling (`RunOverride <= ceiling`), but **raising** a configured ceiling (`RunOverride > ceiling` or `null` over a finite bound) requires server-side `ContextUser` authorization via `CanUserRaiseEnforcedLimitsCeilings(user, provider)` (`Owner` user type or `'System Administrator'` / `'AI: Manage Agents'` authorization). Missing or unauthorized callers fail closed and clamp down to the enforced ceiling (`WasClampedByPolicyCeiling = true`).
- **`OverridableDefault`**: Operational defaults and tuning parameters (`Budgets.PerUserPerDay.DayBoundaryTimezone`, `Budgets.CountPausedTimeTowardsWallClock`, `ProgressDetector.*` tuning/threshold flags, and `Tuning.*`) that callers may tune without ceiling-raise privileges.

### Example `mj.config.cjs` `limits` Block

```js
module.exports = {
  // ...existing DB / GraphQL config...
  limits: {
    AgentChannelConsecutiveTurns: 1000,
    AgentChannelWakesPerHour: 600,
    AgentAbsoluteIterations: 100_000,
    MaxTasksPerAgentGraph: 10_000,
    WhileLoopMaxIterations: 1_000_000,
    ForEachMaxIterations: 1_000_000,
    MaxTasksPerGraph: 100_000,
    BriefingContributorTimeoutMs: 10_000,
    BriefingMaxContributorChars: 32_768,
    Budgets: {
      PerRun: { MaxCostUsd: 25.0, MaxWallClockMs: 7_200_000, MaxTokens: null },
      PerRoutine: { MaxCostUsd: 100.0, MaxWallClockMs: null },
      PerUserPerDay: { MaxCostUsd: 250.0, MaxWallClockMs: null, DayBoundaryTimezone: 'UTC' },
      CountPausedTimeTowardsWallClock: false,
      AllowedInFlightOvershootUsd: 0.05,
      AllowedInFlightOvershootMs: 5_000,
    },
    ProgressDetector: {
      Enabled: true,
      WindowSize: 10,
      MinIterationsBeforeCheck: 6,
      DuplicateStepRatioThreshold: 0.75,
      NoPayloadDeltaWindowCount: 5,
      RepeatingErrorWindowCount: 4,
      AmbiguityLowScoreThreshold: 0.25,
      AmbiguityHighScoreThreshold: 0.65,
      FastJudgeEnabled: true,
      FastJudgeTimeoutMs: 200,
      FastJudgeMinIntervalIterations: 5,
      FastJudgeMaxInputChars: 8192,
      FastJudgeFailureFallback: 'ContinueWithWarning',
    },
  },
};
```

---

## 2. Approved Safety Backstops & Briefing Limits

| Key Path | Approved Default | Scope / Purpose |
|---|---|---|
| `AgentChannelConsecutiveTurns` | `1,000` | Maximum consecutive agent turns in an Agent Channel before pausing for human reply (`CHANNEL_PAUSED_LOOP_GUARD`). |
| `AgentChannelWakesPerHour` | `600` | Maximum peer-agent wakes per hour in an Agent Channel (`CHANNEL_PAUSED_RATE_LIMIT`). |
| `AgentAbsoluteIterations` | `100,000` | System-wide safety net on prompt iterations per agent run. |
| `MaxTasksPerAgentGraph` | `10,000` | Maximum nodes permitted in a model-authored task graph (`ValidateTaskGraphSpec` / `WorkflowDraftOperation`). |
| `WhileLoopMaxIterations` | `1,000,000` | Default ceiling for durable `While` loop steps (`TaskLoopExecutor`). |
| `ForEachMaxIterations` | `1,000,000` | Default ceiling for durable `ForEach` loop steps (`TaskLoopExecutor`). |
| `MaxTasksPerGraph` | `100,000` | Blast-radius ceiling on nodes in any submitted workflow or task graph. |
| `BriefingContributorTimeoutMs` | `10,000` ms | Timeout per briefing skill contributor execution. |
| `BriefingMaxContributorChars` | `32,768` chars | Maximum serialized character length retained per briefing skill contributor. |

---

## 3. Mechanical Literal Sweep & Standards Enforcement

All numeric bounds across `packages/` were mechanically swept and categorized into `docs/limits-sweep-inventory.csv` using `.github/scripts/sweep-limits-literals.mjs`:

- **`RunawayGuard`**: Work/iteration/turn/wake/graph-size backstops — must live **strictly** inside `packages/MJCore/src/generic/limitsConfig.ts`.
- **`ResourceGuard`**: Bounded retry/depth/concurrency/timeout guards (e.g. `MaxValidationRetries`, `MaxHandoffHops`, `ClientToolTimeoutMs`) — exposed under `Limits.ResourceGuards` and annotated `// ResourceGuard: ...` where retained locally.
- **`Tuning`**: Cache sizes, TTLs, compaction thresholds, candidate caps — exposed under `Limits.Tuning` or annotated `// Tuning: ...`.
- **`ProtocolLimit`**: External specification or wire-protocol bounds — annotated `// ProtocolLimit: ...`.
- **`UX`**: UI pagination/preview truncation limits — annotated `// UX: ...`.

CI and local gates fail immediately if any unapproved `RunawayGuard` literal is introduced outside `limitsConfig.ts`:

```bash
node .github/scripts/sweep-limits-literals.mjs --check-standards
npm run check:standards
npm run check:guards
```

---

## 4. Multi-Scope Budgets (`BudgetEnforcementGuard`)

`BudgetEnforcementGuard` (`packages/AI/Agents/src/BudgetEnforcementGuard.ts`) enforces **both** dollar spend (`CostUsd`) and active wall-clock time (`WallClockMs`) across all three scopes:

1. **`PerRun`** — single run spend, active wall-clock time, and optional token ceiling.
2. **`PerRoutine`** — cumulative spend and active wall-clock time across runs sharing a `RoutineID` (matched via `ScheduledJobRunID`, `AIAgentRun.Data.__limitsDiagnostics.Context.RoutineID`, or checkpoint `RoutineID`).
3. **`PerUserPerDay`** — cumulative daily spend and active wall-clock time per user within `[DayStartISO, DayEndISO)` computed by `ComputeDayBoundaryWindow()` for `DayBoundaryTimezone` (default `'UTC'`), automatically resetting at day rollover.

Key accounting semantics:
- **Paused time exclusion**: When `CountPausedTimeTowardsWallClock` is `false` (default), time spent in `Paused` awaiting human approval AND waiting between approval (`ApproveCheckpoint` / `PrepareResume: false`) and actual resume execution (`BuildResumePreparation` / `ApproveAndResumePausedGraph`) is subtracted from elapsed wall-clock time via `PausedIntervals` (`ComputeTotalPausedMs()`). `ApproveCheckpoint()` keeps the active `PausedIntervals` entry open (`ResumedAtMs: null`), and only the actual resume transition closes it with `resumeNowMs`.
- **Concurrent run deduplication**: Historical `PerRoutine` and `PerUserPerDay` queries exclude `ExcludeRunID` and deduplicate rows by normalized `ID` (`seenRunIds`) via batched `RunView.RunViews`, so concurrent runs under the same routine or user accumulate accurately without double-counting the active run.
- **In-flight overshoot tolerance**: Bounded `AllowedInFlightOvershootUsd` and `AllowedInFlightOvershootMs` tolerances (`EffectiveLimit = Limit + OvershootAllowed`) prevent interrupting already-dispatched billable LLM/tool calls mid-flight while still halting before the next turn.
- **Human-approved extensions**: `ApplyBudgetExtensionToBudgets()` applies incremental (`AdditionalCostUsd`, `AdditionalWallClockMs`, `AdditionalTokens`) or explicit replacement ceilings upon human approval.

---

## 5. Deterministic Progress Detection & Sub-200ms Fast Convergence Judge

Before an unproductive loop ever approaches the 100,000 / 1,000,000 backstops, `DeterministicProgressDetector` (`packages/AI/Agents/src/DeterministicProgressDetector.ts`) evaluates a sliding window (`WindowSize`, after `MinIterationsBeforeCheck` warmup iterations) across **6 zero-LLM deterministic signals**:

1. **Records created or changed** (`RecordsCreatedOrChangedRate`)
2. **Tasks closed / completed** (`TasksClosedRate`)
3. **Distinct outputs** (`DistinctOutputRatio`)
4. **Repeated text similarity** (`RepeatedTextSimilarity` via character trigram or embedding cosine similarity)
5. **Tokens spent per unit of progress** (`TokensPerProgressUnit`, `TokenEfficiencyScore`)
6. **Heap growth & output-length variance** (`OutputLengthVariance`, `HeapGrowthRatio`, `VarianceHealthScore`)

Classification outcomes:
- **`Converging`** (`ProgressScore >= AmbiguityHighScoreThreshold`): continues uninterrupted with zero judge overhead.
- **`Stalled`** (hard-stall streak or `ProgressScore < AmbiguityLowScoreThreshold`): immediately pauses non-destructively (`PauseReason = 'ProgressStalled'`).
- **`Ambiguous`**: invokes `FastConvergenceJudge` (`packages/AI/Agents/src/FastConvergenceJudge.ts`) strictly when classification is `'Ambiguous'`:
  - **Deadline & input caps**: `AbortController` timer enforces `FastJudgeTimeoutMs` (default `200ms`) via `Promise.race`, and state summaries are truncated to `FastJudgeMaxInputChars` (default `8,192`).
  - **Cooldown throttling**: skips model calls within `FastJudgeMinIntervalIterations` (default `5`) iterations since the previous judge invocation (resettable on human resume via `ResetCooldown()`).
  - **Budget attribution & exactly-once late timeout settlement**: Tracks each invocation by a unique `InvocationId` and separates the bounded deadline fallback from underlying usage settlement via `OnLateUsageSettled` / `DrainPendingLateUsage()`. Even if an underlying judge call ignores abort and settles after the timeout deadline, `BaseAgent` reconciles its `CostUsd` and `TokensUsed` **exactly once** (never poisoned by a zero-cost timeout fallback) into `AIAgentRun.TotalCost`, `AIAgentRun.TotalTokensUsed`, `_treeBudget`, `AIAgentRun.Data.__budgetCostEvents` (`BudgetEnforcementGuard.RecordBatchedPromptCost`), and re-evaluates `BudgetEnforcementGuard`.
  - **Failure / timeout / invalid-response fallback**: never blocks execution past the deadline; on timeout, disabled flag, missing `ContextUser`, invalid choice/response shape, or evaluator error it applies `FastJudgeFailureFallback` (`'ContinueWithWarning'` or `'PauseForHuman'`) and appends the bounded reason (`<= 240` chars) to `AIAgentRun.Data.__progressDiagnostics`.

---

## 6. Non-Destructive Pause, Persisted Checkpoint & Resume (`RunawayCheckpointManager`)

When `BudgetEnforcementGuard`, `DeterministicProgressDetector`, or `FastConvergenceJudge` triggers a pause:

1. `BaseAgent` flushes pending steps/prompt saves and calls `RunawayCheckpointManager.PauseRunWithCheckpoint()`.
2. The run transitions cleanly to `Status = 'Paused'` (`CompletedAt = null`, `ErrorMessage = null`) — completed work is **never** discarded.
3. A versioned `RunawayCheckpointState` (`mj-runaway-checkpoint/v1`) is persisted under `AIAgentRun.Data.__runawayCheckpoint` capturing completed steps/turns/nodes, conversation messages, in-flight payload, scratchpad, cumulative budget ledger, and pause evidence.
4. An owner notification (`MJ: User Notifications`) and approval request (`MJ: AI Agent Requests`) are emitted.
5. `PrepareResumeFromCheckpoint()` / `BuildResumePreparation()` **fails closed** until `HumanApproval.Status === 'Approved'`, closing open `PausedIntervals` at the actual resume timestamp. Once approved (with optional `BudgetExtensionGrant`), `BaseAgent.ResumePausedRun()` restores payload, scratchpad, message history, and cumulative USD + active wall-clock accounting without re-executing already-completed turns.
6. **Durable TaskGraph loop governance (`TaskLoopExecutor` + `TaskGraphDispatcher` + `TaskGraphGovernanceCoordinator`)**: `TaskGraphDispatcher` passes `LoopExecutionOptions` (`OnIterationGovernance`, `ResumeFromCursor`) into sequential `ForEach`, parallel `ForEach`, and `While` loops. When `EvaluateLoopIterationGovernance` pauses between iterations or parallel batches, the task returns cleanly to `Pending` (`ClaimedBy = null`) with `Configuration.runtime.loopCursor` (`LoopCursorSnapshot`, completed indices/results, live payload, accumulated cost/tokens) persisted so a replacement worker resumes only remaining iterations after approval without replaying completed ones.

---

## 7. Explorer Admin Limits Panel & `BaseRemotableOperation` API

Three `BaseRemotableOperation` classes in `packages/AI/Agents/src/operations/LimitsOperations.ts` expose typed server access without bespoke GraphQL resolvers:

- **`Limits.GetDiagnostics`** (`LimitsGetDiagnosticsServerOperation`): returns resolved 5-tier config, per-key provenance, approved backstops, multi-scope budget utilization, active/paused runs, deterministic progress classifications, and fast judge logs.
- **`Limits.ResumePausedRun`** (`LimitsResumePausedRunServerOperation`): records human approval + optional budget extension and transitions the paused run back to `Running`.
- **`Limits.PauseRun`** (`LimitsPauseRunServerOperation`): non-destructively pauses an active `Running` run with a persisted checkpoint.

In MJ Explorer, **`AdminLimitsResourceComponent`** (`@RegisterClass(BaseResourceComponent, 'AdminLimitsResource')`, wired into `metadata/applications/.admin-application.json` as **Execution Limits**) provides four interactive views (`Hierarchy & Backstops`, `Tier Provenance`, `Budget Utilization`, and `Active & Paused Runs` with inspect drawer and Approve & Resume modal).
