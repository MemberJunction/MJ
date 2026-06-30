/**
 * @module agent/modeling-plan-to-pipeline
 *
 * The DETERMINISTIC translation at the heart of the Predictive Studio Agent's builder: it turns the
 * agent's strongly-typed, conversation-accumulated {@link ModelingPlanSpec} into the concrete
 * `MJ: ML Training Pipelines` field shapes — `SourceBindings`, the `FeatureStep` DAG, `AsOfStrategy`,
 * `LeakageGuard`, `ValidationStrategy`. This is pure code (no LLM, no DB), so the structure the
 * builder commits to metadata is type-safe and never hallucinated — the same guarantee Database
 * Designer and Agent Manager give for schema/agent metadata.
 *
 * Pure + framework-free (no entity/provider deps) → fully unit-testable with zero setup.
 */

import type {
  ModelingPlanSpec,
  SourceBinding,
  FeatureStepGraph,
  FeatureStep,
  AsOfStrategy,
  LeakageGuard,
  ValidationStrategy,
  ProblemType,
} from '@memberjunction/predictive-studio-core';

/** The resolved, ready-to-persist configuration for one `MJ: ML Training Pipelines` row. */
export interface PipelineConfig {
  /** Human-readable pipeline name (derived from the plan's Goal). */
  name: string;
  /** Plain-language description carried onto the pipeline row. */
  description: string;
  /** The training-unit entity NAME (resolved to TargetEntityID by the builder). */
  targetEntityName: string;
  /** Label column / expression. */
  targetVariable: string;
  /** Classification or regression. */
  problemType: ProblemType;
  /** The algorithm NAME the chosen experiment proposes (resolved to AlgorithmID by the builder). */
  algorithmName: string;
  /** Source bindings the features draw from. */
  sourceBindings: SourceBinding[];
  /** The assembled FeatureStep DAG. */
  featureSteps: FeatureStepGraph;
  /** Point-in-time assembly strategy. */
  asOf: AsOfStrategy;
  /** Leakage protection (deny-list + dominance threshold). */
  leakageGuard: LeakageGuard;
  /** Validation strategy. */
  validation: ValidationStrategy;
}

/** Default single-feature-dominance threshold when the plan doesn't override it. */
const DEFAULT_DOMINANCE_THRESHOLD = 0.85;

/** The chosen experiment = the highest-priority (lowest `Priority` number) proposed experiment. */
function chooseExperiment(spec: ModelingPlanSpec): ModelingPlanSpec['ProposedExperiments'][number] | null {
  const experiments = spec.ProposedExperiments ?? [];
  if (experiments.length === 0) return null;
  return [...experiments].sort((a, b) => (a.Priority ?? 0) - (b.Priority ?? 0))[0];
}

/** Build the FeatureStep DAG from the selected candidate features (select raw cols; one-hot categoricals). */
function buildFeatureSteps(spec: ModelingPlanSpec, featureSet: string[]): FeatureStepGraph {
  const all = spec.CandidateFeatures ?? [];
  // Honor the chosen experiment's FeatureSet when present; otherwise use every candidate feature.
  const selected = featureSet.length > 0 ? all.filter((f) => featureSet.includes(f.Name)) : all;

  // Raw passthrough columns: numeric + categorical features (embedding/llm-derived are handled by
  // their own step kinds and aren't simple row columns).
  const rawColumns = selected.filter((f) => f.Kind === 'numeric' || f.Kind === 'categorical').map((f) => f.Name);

  const steps: FeatureStep[] = [];
  if (rawColumns.length > 0) {
    steps.push({ Id: 'select-raw', Kind: 'select', Columns: rawColumns });
  }
  // One-hot each categorical feature so the sidecar fits the vocabulary once and applies it everywhere.
  for (const f of selected.filter((f) => f.Kind === 'categorical')) {
    steps.push({ Id: `onehot-${f.Name}`, Kind: 'onehot', Column: f.Name });
  }
  return { Steps: steps };
}

/** Source bindings from the plan's candidate sources (drop the agent's `Why` rationale). */
function buildSourceBindings(spec: ModelingPlanSpec): SourceBinding[] {
  return (spec.CandidateSources ?? []).map((s) => ({ Kind: s.Kind, Ref: s.Ref }));
}

/** Leakage guard: deny every field the plan marked `exclude`, plus the dominance threshold. */
function buildLeakageGuard(spec: ModelingPlanSpec): LeakageGuard {
  const denyFields = (spec.LeakageNotes ?? []).filter((n) => n.Action === 'exclude').map((n) => n.Field);
  return { DenyFields: denyFields, SingleFeatureDominanceThreshold: DEFAULT_DOMINANCE_THRESHOLD };
}

/** Validation strategy straight from the plan (LockedHoldoutFraction is always carried). */
function buildValidation(spec: ModelingPlanSpec): ValidationStrategy {
  const v = spec.ValidationStrategy;
  return {
    Strategy: v?.Strategy ?? 'holdout',
    TestSize: v?.TestSize,
    K: v?.K,
    LockedHoldoutFraction: v?.LockedHoldoutFraction ?? 0.2,
  };
}

/** Derive a concise pipeline name from the plan's goal (trim + cap length). */
function deriveName(goal: string): string {
  const trimmed = (goal ?? '').trim();
  if (!trimmed) return 'New prediction';
  return trimmed.length <= 80 ? trimmed : `${trimmed.slice(0, 77)}…`;
}

/**
 * Deterministically translate an approved {@link ModelingPlanSpec} into the concrete pipeline
 * configuration the builder will persist. Throws on a spec that can't yield a trainable pipeline
 * (no target entity, no target variable, or no proposed algorithm) — the builder surfaces these as a
 * clean failure rather than creating a broken pipeline.
 *
 * @param spec the approved modeling plan the agent accumulated.
 * @returns the resolved {@link PipelineConfig}.
 */
export function modelingPlanToPipelineConfig(spec: ModelingPlanSpec): PipelineConfig {
  const target = spec.TargetDefinition;
  if (!target?.EntityName?.trim()) {
    throw new Error('ModelingPlanSpec.TargetDefinition.EntityName is required to build a pipeline.');
  }
  if (!target.TargetVariable?.trim()) {
    throw new Error('ModelingPlanSpec.TargetDefinition.TargetVariable is required to build a pipeline.');
  }
  const experiment = chooseExperiment(spec);
  if (!experiment?.AlgorithmName?.trim()) {
    throw new Error('ModelingPlanSpec needs at least one ProposedExperiment with an AlgorithmName to build a pipeline.');
  }

  return {
    name: deriveName(spec.Goal),
    description: spec.Goal?.trim() || 'Created by the Predictive Studio Agent.',
    targetEntityName: target.EntityName.trim(),
    targetVariable: target.TargetVariable.trim(),
    problemType: target.ProblemType,
    algorithmName: experiment.AlgorithmName.trim(),
    sourceBindings: buildSourceBindings(spec),
    featureSteps: buildFeatureSteps(spec, experiment.FeatureSet ?? []),
    asOf: target.AsOfStrategy ?? { Mode: 'none' },
    leakageGuard: buildLeakageGuard(spec),
    validation: buildValidation(spec),
  };
}
