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
 * Pure + framework-free (no entity/provider deps) → fully unit-testable with zero setup. It also refuses, before the
 * builder writes any row, the plan settings training would refuse (an as-of mode training ignores, an unknown
 * majority-baseline rule) — so a refused plan never leaves an orphan Draft pipeline behind.
 */

import {
  DOMINANCE_THRESHOLD_DEFAULT,
  EvaluationLineage,
  type ModelingPlanSpec,
  type SourceBinding,
  type FeatureStepGraph,
  type FeatureStep,
  type AsOfStrategy,
  type LeakageGuard,
  type ValidationStrategy,
  type ProblemType,
  type FeatureStepWarning,
} from '@memberjunction/predictive-studio-core';

import { AsOfSettingHasNoEffectError } from '../training/as-of-refusal';

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
  /** Structured warnings emitted during plan translation (e.g. dropped candidate features). */
  warnings: FeatureStepWarning[];
  /** Point-in-time assembly strategy. */
  asOf: AsOfStrategy;
  /** Leakage protection (deny-list + dominance threshold). */
  leakageGuard: LeakageGuard;
  /** Validation strategy. */
  validation: ValidationStrategy;
}


/** The chosen experiment = the highest-priority (lowest `Priority` number) proposed experiment. */
function chooseExperiment(spec: ModelingPlanSpec): ModelingPlanSpec['ProposedExperiments'][number] | null {
  const experiments = spec.ProposedExperiments ?? [];
  if (experiments.length === 0) return null;
  return [...experiments].sort((a, b) => (a.Priority ?? 0) - (b.Priority ?? 0))[0];
}

/** One candidate feature of a modeling plan. */
type CandidateFeature = ModelingPlanSpec['CandidateFeatures'][number];

/** The selected features sorted by how they become steps: raw columns, persisted values per Feature Pipeline, and the dropped ones. */
interface ClassifiedFeatures {
  readonly RawColumns: string[];
  readonly PersistedFeaturesByPipeline: Map<string, string[]>;
  readonly Warnings: FeatureStepWarning[];
}

/** Build the FeatureStep DAG from the selected candidate features (select raw cols; one-hot categoricals) and collect structured warnings for unmapped features. */
function buildFeatureSteps(spec: ModelingPlanSpec, featureSet: string[]): { steps: FeatureStepGraph; warnings: FeatureStepWarning[] } {
  const all = spec.CandidateFeatures ?? [];
  // Honor the chosen experiment's FeatureSet when present; otherwise use every candidate feature.
  const selected = featureSet.length > 0 ? all.filter((f) => featureSet.includes(f.Name)) : all;
  const classified = classifyFeatures(spec, selected);
  return { steps: emitFeatureSteps(selected, classified), warnings: classified.Warnings };
}

/** Sorts each selected feature into a raw column, a persisted value of its Feature Pipeline, or a dropped feature with a warning. */
function classifyFeatures(spec: ModelingPlanSpec, selected: readonly CandidateFeature[]): ClassifiedFeatures {
  const out: ClassifiedFeatures = { RawColumns: [], PersistedFeaturesByPipeline: new Map<string, string[]>(), Warnings: [] };
  for (const f of selected) {
    switch (f.Kind) {
      case 'numeric':
      case 'categorical':
        out.RawColumns.push(f.Name);
        break;
      case 'llm-derived':
      case 'decision-derived': {
        const pipelineSource = spec.CandidateSources?.find((s) => s.Ref === f.SourceRef && s.Kind === 'FeaturePipeline');
        if (pipelineSource) {
          const list = out.PersistedFeaturesByPipeline.get(pipelineSource.Ref) || [];
          list.push(f.Name);
          out.PersistedFeaturesByPipeline.set(pipelineSource.Ref, list);
        } else {
          out.Warnings.push(droppedFeature(f, `Candidate feature "${f.Name}" (${f.Kind}) was dropped from training pipeline steps. Persisted-value features (llm-derived, decision-derived) require an upstream Feature Pipeline to persist values before training.`));
        }
        break;
      }
      case 'embedding':
        out.Warnings.push(droppedFeature(f, `Candidate feature "${f.Name}" (embedding) was dropped from training pipeline steps. Embedding features require a dedicated vector embedding step.`));
        break;
      default: {
        const _exhaustive: never = f.Kind;
        void _exhaustive;
        out.Warnings.push(droppedFeature(f, `Candidate feature "${f.Name}" with kind "${String(f.Kind)}" cannot be automatically mapped to a pipeline step.`));
        break;
      }
    }
  }
  return out;
}

/** The warning for a feature that has no pipeline step. */
function droppedFeature(f: CandidateFeature, reason: string): FeatureStepWarning {
  return { FeatureName: f.Name, Kind: f.Kind, Reason: reason };
}

/** The steps: one select of the raw columns, one llm-derived step per Feature Pipeline, one one-hot per categorical feature. */
function emitFeatureSteps(selected: readonly CandidateFeature[], classified: ClassifiedFeatures): FeatureStepGraph {
  const steps: FeatureStep[] = [];
  if (classified.RawColumns.length > 0) {
    steps.push({ Id: 'select-raw', Kind: 'select', Columns: classified.RawColumns });
  }
  for (const [pipelineRef, cols] of classified.PersistedFeaturesByPipeline.entries()) {
    steps.push({ Id: `llm-derived-${pipelineRef}`, Kind: 'llm-derived', FeaturePipelineRef: pipelineRef, Columns: cols });
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
  return { DenyFields: denyFields, SingleFeatureDominanceThreshold: DOMINANCE_THRESHOLD_DEFAULT };
}

/**
 * Validation strategy straight from the plan, with the evaluation settings `TimeIndexColumn` and `MajorityBaselineRule`.
 * A plan's `LockedHoldoutFraction` is not carried: the pipeline's bound Evaluation Protocol decides its holdout, so a
 * fraction on the pipeline would only contradict it. An unknown `MajorityBaselineRule` is refused here with
 * `InvalidMajorityBaselineRuleError`, the same refusal training raises.
 */
function buildValidation(spec: ModelingPlanSpec): ValidationStrategy {
  const v = spec.ValidationStrategy;
  const validation: ValidationStrategy = {
    Strategy: v?.Strategy ?? 'holdout',
    TestSize: v?.TestSize,
    K: v?.K,
  };
  if (v?.TimeIndexColumn) {
    validation.TimeIndexColumn = v.TimeIndexColumn;
  }
  if (v?.MajorityBaselineRule) {
    validation.MajorityBaselineRule = EvaluationLineage.ParseMajorityBaselineRule(v.MajorityBaselineRule);
  }
  return validation;
}

/** The plan's as-of strategy; a mode training would ignore is refused before any pipeline row exists. */
function buildAsOf(spec: ModelingPlanSpec): AsOfStrategy {
  const asOf = spec.TargetDefinition.AsOfStrategy;
  if (AsOfSettingHasNoEffectError.WouldBeIgnored(asOf)) {
    throw new AsOfSettingHasNoEffectError('modeling-plan', asOf.Mode, null);
  }
  return asOf || { Mode: 'none' };
}

/** Derive a concise pipeline name from the plan's goal or custom name (trim + cap length). */
function deriveName(goal: string, customName?: string): string {
  const custom = (customName ?? '').trim();
  if (custom) return custom.length <= 80 ? custom : `${custom.slice(0, 77)}…`;
  const trimmed = (goal ?? '').trim();
  if (!trimmed) return 'New prediction';
  return trimmed.length <= 80 ? trimmed : `${trimmed.slice(0, 77)}…`;
}

/**
 * Deterministically translate an approved {@link ModelingPlanSpec} into the concrete pipeline
 * configuration the builder will persist. Throws on a spec that can't yield a trainable pipeline
 * (no target entity, no target variable, or no proposed algorithm) or that training would refuse
 * ({@link AsOfSettingHasNoEffectError}, `InvalidMajorityBaselineRuleError`) — the builder surfaces these as a
 * clean failure rather than creating a broken pipeline.
 *
 * @param spec the approved modeling plan the agent accumulated.
 * @param experimentIndex optional index of the specific experiment from ProposedExperiments to configure.
 * @returns the resolved {@link PipelineConfig}.
 */
export function ModelingPlanToPipelineConfig(spec: ModelingPlanSpec, experimentIndex?: number): PipelineConfig {
  const target = spec.TargetDefinition;
  if (!target?.EntityName?.trim()) {
    throw new Error('ModelingPlanSpec.TargetDefinition.EntityName is required to build a pipeline.');
  }
  if (!target.TargetVariable?.trim()) {
    throw new Error('ModelingPlanSpec.TargetDefinition.TargetVariable is required to build a pipeline.');
  }
  const experiments = spec.ProposedExperiments ?? [];
  const experiment =
    experimentIndex !== undefined && experiments[experimentIndex]
      ? experiments[experimentIndex]
      : chooseExperiment(spec);
  if (!experiment?.AlgorithmName?.trim()) {
    throw new Error('ModelingPlanSpec needs at least one ProposedExperiment with an AlgorithmName to build a pipeline.');
  }

  const baseName = deriveName(spec.Goal, spec.Name);
  const name =
    experimentIndex !== undefined && experiments.length > 1
      ? `${baseName} (${experiment.AlgorithmName})`
      : baseName;

  const asOf = buildAsOf(spec);
  const validation = buildValidation(spec);
  const { steps: featureSteps, warnings } = buildFeatureSteps(spec, experiment.FeatureSet ?? []);

  return {
    name,
    description: spec.Goal?.trim() || 'Created by the Predictive Studio Agent.',
    targetEntityName: target.EntityName.trim(),
    targetVariable: target.TargetVariable.trim(),
    problemType: target.ProblemType,
    algorithmName: experiment.AlgorithmName.trim(),
    sourceBindings: buildSourceBindings(spec),
    featureSteps,
    warnings,
    asOf,
    leakageGuard: buildLeakageGuard(spec),
    validation,
  };
}
