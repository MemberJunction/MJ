/**
 * @module @memberjunction/predictive-studio
 *
 * Server-side engine for MemberJunction Predictive Studio. This is a scaffold —
 * the real components land in later phases. The engine composes onto existing MJ
 * substrates (Record Set Processing, Remote Operations, Agents, Vectors) and the
 * Python sidecar, per `plans/predictive-studio.md`.
 *
 * This package depends on `@memberjunction/predictive-studio-core` for its type
 * contracts and on the MJ core/global packages for entity + class-factory access.
 */

import type { ModelingPlanSpec } from '@memberjunction/predictive-studio-core';

// The self-managing Python-sidecar client `MLSidecar` lives in its own package,
// `@memberjunction/predictive-studio-sidecar` — import it directly from there.
// It is intentionally NOT re-exported here (CLAUDE.md rule 5: no cross-package re-exports).

// FeatureAssembly executor + as-of / leakage-guard correctness primitives (§5/§6).
export * from './feature-assembly';

// Training orchestration — TrainingEngine + its injected seams (§3/§4.3/§4.4/§8.2/§11).
export * from './training';

// Scoring — MLModelInferenceProcessor (Record Set Processing work type) + write-back (§10).
export * from './scoring';

// Experiment orchestration — deterministic, wave-based ExperimentOrchestrator that
// executes an approved ModelingPlanSpec with a leaderboard, pruning, and a budget gate (§8.3/§8.4/§9.1).
export * from './experiment';

// Action boundaries — thin MJ Actions over the engine service classes (train /
// score / experiment / promote), so agents / UI / workflows can invoke them (§12).
export * from './actions';

// Remote Operations — the six Manual-mode server bodies for the CodeGen-emitted
// `PredictiveStudio.*` operation bases. The typed peers of the Actions (same engine
// delegation path), invocable by stable key from client or server (§12).
export * from './operations';

// Maintenance — MaintenanceEngine (staleness detection / scheduled re-scoring /
// retraining triggers + challenger-vs-incumbent promotion recommendation), the
// RetrainingPolicy model, its DI seams, and the default honest drift detector (§12 / SP10).
export * from './maintenance';

/**
 * Version marker for the Predictive Studio engine package. Kept in sync with the
 * package version so consumers can assert compatibility at runtime.
 */
export const PredictiveStudioEngineVersion = '5.43.0';

// region: Components added in later phases (scaffold placeholders)
// ---------------------------------------------------------------------------
// FeatureAssembly executor   — turns (record set, frozen FeatureSteps) → matrix,
//                              identical across train / scheduled / on-demand (§6).
//                              [Implemented — see ./feature-assembly]
// TrainingEngine             — orchestrates /train against the Python sidecar,
//                              persists immutable, versioned MJ: ML Models (§3/§4.3).
//                              [Implemented — see ./training]
// MLModelInferenceProcessor  — Record Set Processing work type for batch + single
//                              -record scoring with optional write-back (§10).
// ExperimentOrchestrator     — deterministic plan executor running iterations in
//                              waves through Record Set Processing (§8.3/§9.1).
// MLSidecar                  — self-managing client for the /train + /predict
//                              sidecar contract (§3.2), spawning the bundled Python
//                              microservice. [Implemented in package
//                              @memberjunction/predictive-studio-sidecar — import directly]
// ---------------------------------------------------------------------------
// endregion

/**
 * Internal scaffold guard proving the core dependency is wired and a
 * `ModelingPlanSpec` is consumable here. Replaced by real orchestration in a
 * later phase.
 *
 * @param plan a (possibly partial) modeling plan
 * @returns whether the plan has passed the user approval gate
 */
export function isModelingPlanApproved(plan: ModelingPlanSpec): boolean {
  return plan.Approved === true;
}
