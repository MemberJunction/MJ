/**
 * @module agent/pipeline-builder
 *
 * The **deterministic builder** behind the Predictive Studio Agent — the Predictive Studio analogue
 * of Database Designer's schema builder and Agent Manager's `AgentSpecSync`. It takes an approved,
 * strongly-typed {@link ModelingPlanSpec} and, in pure code (NO LLM), crafts the actual metadata:
 * creates the `MJ: ML Training Pipelines` row, kicks off training, then **publishes the model only
 * if the trust verdict clears the bar** — the same `deriveTrustVerdict` gate the business UI uses, so
 * a coin-flip / unmeasured / leakage-flagged model is never silently published into the catalog.
 *
 * Used by the agent's builder sub-agent AND directly callable from a headless script/test, so the
 * "build a new prediction" path is verifiable without the full LLM loop.
 */

import { RunView, type IMetadataProvider, type UserInfo, type EntityInfo, LogError } from '@memberjunction/core';
import type { MJMLTrainingPipelineEntity, MJMLModelEntity } from '@memberjunction/core-entities';
import { type ModelingPlanSpec, deriveTrustVerdict, type TrustVerdict } from '@memberjunction/predictive-studio-core';

import { modelingPlanToPipelineConfig, type PipelineConfig } from './modeling-plan-to-pipeline';
import { trainModelViaEngine, wasTrainingLeakageFlagged } from '../operations/delegation';

/** Inputs for {@link PredictiveStudioPipelineBuilder.build}. */
export interface BuildPredictionInput {
  /** The approved modeling plan the agent accumulated. */
  spec: ModelingPlanSpec;
  /** The owning provider (multi-provider correctness). */
  provider: IMetadataProvider;
  /** The acting user (isolation/audit). */
  user: UserInfo;
  /** Publish the trained model when the trust verdict clears the bar. Default true. */
  autoPublish?: boolean;
  /** Sidecar version marker recorded in lineage. */
  sidecarVersion?: string;
}

/** The outcome of building a prediction from a plan. */
export interface BuildPredictionResult {
  /** Whether the build (pipeline create + train) succeeded. */
  success: boolean;
  /** The created `MJ: ML Training Pipelines` id (present once the pipeline is created). */
  pipelineId?: string;
  /** The trained `MJ: ML Models` id (present once training completes). */
  modelId?: string;
  /** The plain-language trust verdict for the trained model. */
  trust?: TrustVerdict;
  /** Whether the model was published into the business catalog. */
  published: boolean;
  /** Whether training flagged a leakage warning (held for analyst review). */
  leakageFlagged: boolean;
  /** When not published, the plain reason (trust gate or leakage); else null. */
  heldReason: string | null;
  /** A clean error message when the build failed; else null. */
  errorMessage: string | null;
}

/** Deterministic builder: approved {@link ModelingPlanSpec} → pipeline + trained (+ maybe published) model. */
export class PredictiveStudioPipelineBuilder {
  /**
   * Build a prediction from an approved plan: create the pipeline, train, and publish if the trust
   * verdict clears the bar. Never throws — returns a typed result with `success`/`errorMessage`.
   */
  public async build(input: BuildPredictionInput): Promise<BuildPredictionResult> {
    const { spec, provider, user, autoPublish = true, sidecarVersion = 'predictive-studio-agent' } = input;
    try {
      const config = modelingPlanToPipelineConfig(spec);
      const pipeline = await this.createPipeline(config, provider, user);
      const trainResult = await trainModelViaEngine({ pipelineId: pipeline.ID, sidecarVersion }, provider, user);
      const model = trainResult.model;
      const trust = deriveTrustVerdict(model);
      const leakageFlagged = wasTrainingLeakageFlagged(trainResult);

      const { published, heldReason } = await this.maybePublish(model, trust, leakageFlagged, autoPublish);
      return {
        success: true,
        pipelineId: pipeline.ID,
        modelId: model.ID,
        trust,
        published,
        leakageFlagged,
        heldReason,
        errorMessage: null,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      LogError(`PredictiveStudioPipelineBuilder.build failed: ${errorMessage}`);
      return { success: false, published: false, leakageFlagged: false, heldReason: null, errorMessage };
    }
  }

  /** Create + save the `MJ: ML Training Pipelines` row from the resolved config. */
  private async createPipeline(config: PipelineConfig, provider: IMetadataProvider, user: UserInfo): Promise<MJMLTrainingPipelineEntity> {
    // Validate the whole plan against real metadata BEFORE creating any rows or training — so an invalid
    // plan (bad entity / target / feature / algorithm) fails fast with an actionable message and leaves
    // no orphan pipeline/run rows behind, instead of erroring mid-train.
    const entity = provider.EntityByName(config.targetEntityName);
    if (!entity) {
      throw new Error(`Target entity '${config.targetEntityName}' was not found in metadata. The plan must reference a real entity.`);
    }
    this.validatePlanFields(config, entity);
    const targetEntityId = entity.ID;
    const algorithmId = await this.resolveAlgorithmId(config.algorithmName, provider, user);

    const pipeline = await provider.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', user);
    pipeline.NewRecord();
    pipeline.Name = config.name;
    pipeline.Description = config.description;
    pipeline.Version = 1;
    pipeline.Status = 'Draft';
    pipeline.TargetEntityID = targetEntityId;
    pipeline.TargetVariable = config.targetVariable;
    pipeline.ProblemType = config.problemType;
    pipeline.AlgorithmID = algorithmId;
    pipeline.SourceBindings = JSON.stringify(config.sourceBindings);
    pipeline.FeatureSteps = JSON.stringify(config.featureSteps);
    pipeline.AsOfStrategy = JSON.stringify(config.asOf);
    pipeline.LeakageGuard = JSON.stringify(config.leakageGuard);
    pipeline.ValidationStrategy = JSON.stringify(config.validation);
    if (!(await pipeline.Save())) {
      throw new Error(`Failed to create training pipeline: ${pipeline.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
    return pipeline;
  }

  /**
   * Validate that the plan's target variable and its `select` feature columns actually exist as fields on
   * the target entity — throwing a single actionable error (with a sample of the real field names) when
   * they don't. This turns a would-be mid-train failure (or a garbage model trained on missing columns)
   * into a fast, correctable "the plan references fields that don't exist" message.
   *
   * SINGLE-SOURCE ASSUMPTION: select columns are validated against the TARGET entity only, which is
   * correct today because the plan converter only emits select columns from `CandidateFeatures` on the
   * training-unit entity (see modeling-plan-to-pipeline.ts). If feature steps ever gain multi-source
   * selects, this must validate each select against ITS source entity or it will false-reject valid plans.
   */
  private validatePlanFields(config: PipelineConfig, entity: EntityInfo): void {
    const fieldNames = new Set(entity.Fields.map((f) => f.Name.toLowerCase()));
    const missing: string[] = [];
    if (config.targetVariable && !fieldNames.has(config.targetVariable.toLowerCase())) {
      missing.push(`target field '${config.targetVariable}'`);
    }
    const steps = (config.featureSteps?.Steps ?? []) as Array<{ Kind?: string; Columns?: string[] }>;
    const selectCols = steps.filter((s) => s.Kind === 'select').flatMap((s) => s.Columns ?? []);
    for (const c of selectCols) {
      if (!fieldNames.has(c.toLowerCase())) missing.push(`feature '${c}'`);
    }
    if (missing.length > 0) {
      const available = entity.Fields.map((f) => f.Name).slice(0, 25).join(', ');
      throw new Error(
        `The plan references field(s) that don't exist on '${entity.Name}': ${missing.join(', ')}. Available fields include: ${available}.`,
      );
    }
  }

  /**
   * Resolve an algorithm reference to its `MJ: ML Algorithms` id. Tolerant of LLM
   * naming variation: matches the display `Name` OR the `DriverClass`, comparing
   * case- and separator-insensitively — so `'LogisticRegression'`,
   * `'Logistic Regression'`, and `'logistic_regression'` all resolve to the same row.
   * Throws with the available algorithm list if nothing matches.
   */
  private async resolveAlgorithmId(algorithmName: string, provider: IMetadataProvider, user: UserInfo): Promise<string> {
    const rv = RunView.FromMetadataProvider(provider);
    const res = await rv.RunView<{ ID: string; Name: string; DriverClass: string }>(
      { EntityName: 'MJ: ML Algorithms', Fields: ['ID', 'Name', 'DriverClass'], ResultType: 'simple' },
      user,
    );
    const algos = res.Success ? res.Results ?? [] : [];
    const normalize = (s: string | null | undefined): string => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const want = normalize(algorithmName);
    const match = algos.find((a) => normalize(a.Name) === want || normalize(a.DriverClass) === want);
    if (!match) {
      const available = algos.map((a) => a.Name).join(', ');
      throw new Error(`Algorithm '${algorithmName}' was not found in MJ: ML Algorithms. Available: ${available || '(none)'}.`);
    }
    return match.ID;
  }

  /**
   * Publish the trained model into the business catalog ONLY if the trust verdict clears the bar and
   * training wasn't leakage-flagged. Otherwise leave it Draft and return the plain held-reason.
   */
  private async maybePublish(
    model: MJMLModelEntity,
    trust: TrustVerdict,
    leakageFlagged: boolean,
    autoPublish: boolean,
  ): Promise<{ published: boolean; heldReason: string | null }> {
    if (!autoPublish) {
      return { published: false, heldReason: 'Not published — auto-publish was off; review and publish when ready.' };
    }
    if (leakageFlagged) {
      return { published: false, heldReason: 'Held for analyst review — training flagged a possible data-leakage issue.' };
    }
    if (!trust.canAct) {
      return { published: false, heldReason: trust.gateReason ?? 'Held — this prediction is not reliable enough to publish yet.' };
    }
    model.Status = 'Published';
    if (!(await model.Save())) {
      throw new Error(`Trained model could not be published: ${model.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
    return { published: true, heldReason: null };
  }
}
