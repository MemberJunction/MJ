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

import {
  DOMINANCE_THRESHOLD_DEFAULT,
  type ModelingPlanSpec,
  type SourceBinding,
  type FeatureStepGraph,
  type FeatureStep,
  type AsOfStrategy,
  type LeakageGuard,
  type ValidationStrategy,
  type ProblemType,
  type ComponentGraphNode,
} from '@memberjunction/predictive-studio-core';
import type { DatedSourceSpec, FeatureAssemblyParams } from '../feature-assembly';

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
  /**
   * Dated ("as-of") feature sources persisted onto the pipeline row. `TrainingEngine` freezes
   * these into the trained model's `Lineage`, so scoring assembles the SAME as-of columns
   * without any caller-supplied configuration. Absent/empty ⇒ the pipeline has no as-of
   * features. Populated by the Architect sub-agent; not derivable from `ModelingPlanSpec`
   * today, so plan-built pipelines start empty.
   */
  datedSources?: DatedSourceSpec[];
  /**
   * The composition to train, when the architecture is a `compose` decision.
   *
   * Carrying this is not optional decoration. The architecture gate declares `compose` EXECUTABLE,
   * so without it the builder trains a bare single-algorithm model while every downstream
   * record — the plan, the leaderboard, the model row — says a composed one was built. Nothing
   * afterwards can tell the difference, which is why {@link modelingPlanToPipelineConfig} refuses
   * rather than degrades when a compose decision carries no graph.
   */
  componentGraph?: ComponentGraphNode | null;
  /** Leakage protection (deny-list + dominance threshold). */
  leakageGuard: LeakageGuard;
  /** Validation strategy. */
  validation: ValidationStrategy;
  /**
   * The chosen experiment's starting hyperparameters, persisted on the pipeline row.
   *
   * `TrainingEngine` reads them from `MLTrainingPipeline.Hyperparameters`, so a config that omits
   * them trains at the algorithm's defaults no matter what the Experiment Designer proposed — which
   * is what happened before this field existed: `ProposedExperiments[i].Hyperparameters` was written
   * by the agent and then silently dropped on the way to the pipeline.
   */
  hyperparameters: Record<string, unknown>;
}


/** The chosen experiment = the highest-priority (lowest `Priority` number) proposed experiment. */
function chooseExperiment(spec: ModelingPlanSpec): ModelingPlanSpec['ProposedExperiments'][number] | null {
  const experiments = spec.ProposedExperiments ?? [];
  if (experiments.length === 0) return null;
  const byPriority = [...experiments].sort((a, b) => (a.Priority ?? 0) - (b.Priority ?? 0));

  // A `reify` decision says the candidates ARE variations of one generalized parent — that claim is
  // the entire content of the decision. Building the highest-priority experiment regardless would
  // train something the decision never named while the plan records "these are all variations of
  // <parent>", so the choice is narrowed to the candidates the Architect actually reified.
  const architecture = spec.Architecture;
  if (architecture?.Decision === 'reify') {
    const named = new Set(
      (architecture.Candidates ?? [])
        .map((c) => c.ComponentTypeRef?.trim().toLowerCase())
        .filter((n): n is string => !!n),
    );
    const underParent = byPriority.filter((e) => named.has(e.AlgorithmName?.trim().toLowerCase() ?? ''));
    if (underParent.length > 0) {
      return underParent[0];
    }
    // Refuse rather than fall back: the plan would otherwise record a reify under a parent while
    // training a family the decision never considered.
    throw new Error(
      `The architecture reifies under '${architecture.ReifiedUnderComponentTypeRef}' across ` +
        `[${[...named].join(', ')}], but no ProposedExperiment names any of them. Building would train a ` +
        `family the decision never considered.`,
    );
  }
  return byPriority[0];
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
  return { DenyFields: denyFields, SingleFeatureDominanceThreshold: DOMINANCE_THRESHOLD_DEFAULT };
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
function deriveName(goal: string, experimentLabel?: string): string {
  const trimmed = (goal ?? '').trim();
  const base = trimmed.length > 0 ? trimmed : 'New prediction';
  // An experiment SESSION materializes one pipeline per proposed experiment. Naming them all after
  // the goal would leave a registry full of identically-named rows that only differ inside their
  // JSON columns — so the experiment's own label distinguishes them.
  const label = experimentLabel?.trim();
  const full = label ? `${base} — ${label}` : base;
  return full.length <= 80 ? full : `${full.slice(0, 77)}…`;
}

/**
 * The composition this pipeline should train, or null when it is an ordinary single-family model.
 *
 * An experiment may carry its own graph (the combination search proposes them per candidate);
 * otherwise a `compose` architecture supplies one for the whole plan.
 *
 * **Refuses rather than degrades.** A `compose` decision with no graph anywhere is a plan that says
 * "build a custom structure" and describes none — training the fallback algorithm would produce a
 * model, metrics and a leaderboard entry that all quietly disagree with the decision that authorized
 * them. The architecture gate has already declared the decision executable by this point, so this is
 * the last place the contradiction can be caught.
 */
function resolveComponentGraph(
  spec: ModelingPlanSpec,
  experiment: ModelingPlanSpec['ProposedExperiments'][number],
): ComponentGraphNode | null {
  const fromExperiment = experiment.ComponentGraph ?? null;
  if (fromExperiment) {
    return fromExperiment;
  }
  const architecture = spec.Architecture;
  if (architecture?.Decision !== 'compose') {
    return null;
  }
  if (!architecture.ComposedGraph) {
    throw new Error(
      "The architecture decision is 'compose' but carries no ComposedGraph, and the chosen experiment supplies none. " +
        'Building this would train a single ' +
        `'${experiment.AlgorithmName}' estimator while the plan records a composed model.`,
    );
  }
  return architecture.ComposedGraph;
}

/**
 * Deterministically translate an approved {@link ModelingPlanSpec} into the concrete pipeline
 * configuration the builder will persist. Throws on a spec that can't yield a trainable pipeline
 * (no target entity, no target variable, or no proposed algorithm) — the builder surfaces these as a
 * clean failure rather than creating a broken pipeline.
 *
 * @param spec the approved modeling plan the agent accumulated.
 * @param targetExperiment map THIS experiment rather than the plan's highest-priority one. An
 *   experiment SESSION trains several of the plan's proposed experiments, each needing its own
 *   pipeline; without this the whole session would collapse onto the top-ranked one.
 * @returns the resolved {@link PipelineConfig}.
 */
export function modelingPlanToPipelineConfig(
  spec: ModelingPlanSpec,
  targetExperiment?: ModelingPlanSpec['ProposedExperiments'][number],
): PipelineConfig {
  const target = spec.TargetDefinition;
  if (!target?.EntityName?.trim()) {
    throw new Error('ModelingPlanSpec.TargetDefinition.EntityName is required to build a pipeline.');
  }
  if (!target.TargetVariable?.trim()) {
    throw new Error('ModelingPlanSpec.TargetDefinition.TargetVariable is required to build a pipeline.');
  }
  const experiment = targetExperiment ?? chooseExperiment(spec);
  if (!experiment?.AlgorithmName?.trim()) {
    throw new Error('ModelingPlanSpec needs at least one ProposedExperiment with an AlgorithmName to build a pipeline.');
  }

  return {
    name: deriveName(spec.Goal, targetExperiment ? experiment.Label : undefined),
    description: spec.Goal?.trim() || 'Created by the Predictive Studio Agent.',
    targetEntityName: target.EntityName.trim(),
    targetVariable: target.TargetVariable.trim(),
    problemType: target.ProblemType,
    algorithmName: experiment.AlgorithmName.trim(),
    sourceBindings: buildSourceBindings(spec),
    featureSteps: buildFeatureSteps(spec, experiment.FeatureSet ?? []),
    asOf: target.AsOfStrategy ?? { Mode: 'none' },
    componentGraph: resolveComponentGraph(spec, experiment),
    leakageGuard: buildLeakageGuard(spec),
    validation: buildValidation(spec),
    hyperparameters: experiment.Hyperparameters ?? {},
  };
}

/**
 * Project a {@link ModelingPlanSpec} onto the {@link FeatureAssemblyParams} the executor takes —
 * so the **statistics pre-pass** describes the matrix the plan would actually produce, not an
 * approximation of it.
 *
 * Built on {@link modelingPlanToPipelineConfig} rather than re-deriving anything, which is what
 * keeps the pre-pass and the eventual pipeline in lockstep: if the plan→pipeline mapping changes,
 * the pass follows automatically.
 *
 * @param spec the (not necessarily approved) plan
 * @param options row cap + primary-key field, matching the training call's own options
 */
export function modelingPlanToAssemblyParams(
  spec: ModelingPlanSpec,
  options: { maxRows?: number; primaryKeyField?: string } = {},
): FeatureAssemblyParams {
  const config = modelingPlanToPipelineConfig(spec);
  return {
    targetEntityName: config.targetEntityName,
    recordSet: { EntityName: config.targetEntityName, MaxRows: options.maxRows },
    sources: config.sourceBindings,
    steps: config.featureSteps,
    asOf: config.asOf,
    leakageGuard: config.leakageGuard,
    datedSources: config.datedSources,
    targetVariable: config.targetVariable,
    primaryKeyField: options.primaryKeyField,
    // Train context: the pre-pass must see exactly what training will see.
    context: 'train',
  };
}

