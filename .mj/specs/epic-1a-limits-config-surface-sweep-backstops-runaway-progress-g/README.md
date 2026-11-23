# Epic 1a Specification: Execution Limits Config Surface, Sweep, Backstops & Runaway Governance

## Summary

Epic 1a establishes a unified, strongly-typed 5-tier configuration surface (`LimitsConfigResolver`), mechanically eliminates unapproved `RunawayGuard` literals across the monorepo (`docs/limits-sweep-inventory.csv` + `limits-literals` standards gate), enforces multi-scope USD and active wall-clock budgets (`BudgetEnforcementGuard`), adds 6-signal deterministic progress detection paired with a bounded sub-200ms convergence judge (`DeterministicProgressDetector` + `FastConvergenceJudge`), implements non-destructive pause/checkpoint/resume (`RunawayCheckpointManager`), and exposes full provenance and governance controls in MJ Explorer (`AdminLimitsResourceComponent` via `Limits.*` `BaseRemotableOperation`).

## Architecture & Key Artifacts

- **Core Resolver & Defaults**: [`packages/MJCore/src/generic/limitsConfig.ts`](../../packages/MJCore/src/generic/limitsConfig.ts) (`LimitsConfigResolver`, `CODE_FALLBACK_LIMITS`, `DEFAULT_MJ_LIMITS_CONFIG`)
- **AI CorePlus Adapters & Operation Contracts**:
  - [`packages/AI/CorePlus/src/limits-diagnostics.ts`](../../packages/AI/CorePlus/src/limits-diagnostics.ts) (`ResolveAgentRunLimits`, `LimitsDiagnosticsSnapshot`)
  - [`packages/AI/CorePlus/src/runaway-governance.ts`](../../packages/AI/CorePlus/src/runaway-governance.ts) (`RunawayCheckpointState`, `CumulativeBudgetLedger`, `ProgressEvaluationResult`)
  - [`packages/AI/CorePlus/src/limits-operations.ts`](../../packages/AI/CorePlus/src/limits-operations.ts) (`LimitsGetDiagnosticsOperation`, `LimitsResumePausedRunOperation`, `LimitsPauseRunOperation`)
- **AI Agents Runaway Governance & Server Operations**:
  - [`packages/AI/Agents/src/BudgetEnforcementGuard.ts`](../../packages/AI/Agents/src/BudgetEnforcementGuard.ts)
  - [`packages/AI/Agents/src/DeterministicProgressDetector.ts`](../../packages/AI/Agents/src/DeterministicProgressDetector.ts)
  - [`packages/AI/Agents/src/FastConvergenceJudge.ts`](../../packages/AI/Agents/src/FastConvergenceJudge.ts)
  - [`packages/AI/Agents/src/RunawayCheckpointManager.ts`](../../packages/AI/Agents/src/RunawayCheckpointManager.ts)
  - [`packages/AI/Agents/src/operations/LimitsOperations.ts`](../../packages/AI/Agents/src/operations/LimitsOperations.ts)
- **Standards & CI Sweep Guard**:
  - [`.github/scripts/sweep-limits-literals.mjs`](../../.github/scripts/sweep-limits-literals.mjs)
  - [`packages/Standards/src/checks/limits-literals.ts`](../../packages/Standards/src/checks/limits-literals.ts)
  - [`docs/limits-sweep-inventory.csv`](../../docs/limits-sweep-inventory.csv)
  - [`docs/limits-config-and-sweep.md`](../../docs/limits-config-and-sweep.md)
- **MJ Explorer Admin Limits Surface**:
  - [`packages/Angular/Explorer/dashboards/src/AdminLimits/admin-limits-resource.component.ts`](../../packages/Angular/Explorer/dashboards/src/AdminLimits/admin-limits-resource.component.ts)
  - [`metadata/applications/.admin-application.json`](../../metadata/applications/.admin-application.json) (`AdminLimitsResource`)

## Acceptance Guarantees Verified

1. **5-Tier Precedence & Provenance**: `CodeFallback < MjConfig < AgentOrWorkflowMetadata < UserAgentPolicy < RunOverride`, with optional `EnforceUserPolicyAsCeiling` clamping and per-run `__limitsDiagnostics` snapshots.
2. **Zero Unapproved RunawayGuard Literals**: `sweep-limits-literals.mjs --check-standards` and `mj standards check --check limits-literals` pass with 0 violations.
3. **High-Scale Legitimate Workloads**: 5,000-node drawn workflow (`MaxTasksPerGraph = 100,000`) and 2,000-turn Agent Channel (`MaxConsecutiveAgentTurns`) complete 100% cleanly when making deterministic progress.
4. **Early Synthetic Runaway Pause & Non-Destructive Resume**: Repeating loops pause via `DeterministicProgressDetector` / `FastConvergenceJudge` well before hitting 100,000 / 1,000,000 backstops, persist `mj-runaway-checkpoint/v1`, notify the owner, block unapproved resume, and resume cleanly after human approval preserving completed steps and cumulative USD/wall-clock ledgers.
