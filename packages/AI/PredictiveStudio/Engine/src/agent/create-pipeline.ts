/**
 * @module agent/create-pipeline
 *
 * Creating a `MJ: ML Training Pipelines` row from a resolved {@link PipelineConfig} — extracted so
 * it is a **leaf** concern with no dependency on the training/delegation stack.
 *
 * Two callers need it and only one of them can import the other: the agent's
 * `PredictiveStudioPipelineBuilder` (which also trains and publishes, and so imports the delegation
 * layer) and the experiment session's `MaterializingPipelineResolver` (which the delegation layer
 * itself imports). Leaving the logic on the builder made that a cycle, which failed at class-extend
 * time with an undefined base class. Extracting it removes the cycle rather than working around it.
 */

import { RunView } from '@memberjunction/core';
import type { EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';

import type { PipelineConfig } from './modeling-plan-to-pipeline';

/**
 * Create + save a training pipeline from a resolved config.
 *
 * The whole plan is validated against real metadata BEFORE any row is created, so an invalid plan
 * (bad entity, bad target column, bad feature, unknown algorithm) fails fast with an actionable
 * message and leaves no orphan pipeline behind, rather than erroring mid-train.
 *
 * @throws when the target entity, a referenced field, or the algorithm does not exist, or the save fails
 */
export async function createTrainingPipeline(
  config: PipelineConfig,
  provider: IMetadataProvider,
  user: UserInfo,
): Promise<MJMLTrainingPipelineEntity> {
  const entity = provider.EntityByName(config.targetEntityName);
  if (!entity) {
    throw new Error(`Target entity '${config.targetEntityName}' was not found in metadata. The plan must reference a real entity.`);
  }
  validatePlanFields(config, entity);
  const algorithmId = await resolveAlgorithmId(config.algorithmName, provider, user);

  const pipeline = await provider.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', user);
  pipeline.NewRecord();
  pipeline.Name = config.name;
  pipeline.Description = config.description;
  pipeline.Version = 1;
  pipeline.Status = 'Draft';
  pipeline.TargetEntityID = entity.ID;
  pipeline.TargetVariable = config.targetVariable;
  pipeline.ProblemType = config.problemType;
  pipeline.AlgorithmID = algorithmId;
  pipeline.SourceBindings = JSON.stringify(config.sourceBindings);
  pipeline.FeatureSteps = JSON.stringify(config.featureSteps);
  pipeline.AsOfStrategy = JSON.stringify(config.asOf);
  // Persist the as-of sources so TrainingEngine can freeze them into the model's Lineage — the
  // train→score round-trip. Null (not `[]`) when there are none, so a pipeline that never used
  // as-of features is distinguishable from one that declared an empty list.
  pipeline.DatedSources = config.datedSources?.length ? JSON.stringify(config.datedSources) : null;
  // Without this the plan's proposed hyperparameters never reach TrainingEngine, which reads them
  // from this column — every model would train at the algorithm's defaults regardless.
  pipeline.Hyperparameters = JSON.stringify(config.hyperparameters ?? {});
  pipeline.LeakageGuard = JSON.stringify(config.leakageGuard);
  pipeline.ValidationStrategy = JSON.stringify(config.validation);
  if (!(await pipeline.Save())) {
    throw new Error(`Failed to create training pipeline: ${pipeline.LatestResult?.CompleteMessage ?? 'unknown error'}`);
  }
  return pipeline;
}

/**
 * Validate that the plan's target variable and its `select` feature columns actually exist as fields
 * on the target entity — throwing a single actionable error (with a sample of the real field names)
 * when they don't. This turns a would-be mid-train failure (or a garbage model trained on missing
 * columns) into a fast, correctable "the plan references fields that don't exist" message.
 *
 * SINGLE-SOURCE ASSUMPTION: select columns are validated against the TARGET entity only, which is
 * correct today because the plan converter only emits select columns from `CandidateFeatures` on the
 * training-unit entity (see `modeling-plan-to-pipeline.ts`). If feature steps ever gain multi-source
 * selects, this must validate each select against ITS source entity or it will false-reject valid plans.
 */
export function validatePlanFields(config: PipelineConfig, entity: EntityInfo): void {
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
 * Resolve an algorithm reference to its `MJ: ML Algorithms` id. Tolerant of LLM naming variation:
 * matches the display `Name` OR the `DriverClass`, comparing case- and separator-insensitively — so
 * `'LogisticRegression'`, `'Logistic Regression'`, and `'logistic_regression'` all resolve to the
 * same row. Throws with the available algorithm list if nothing matches.
 */
export async function resolveAlgorithmId(algorithmName: string, provider: IMetadataProvider, user: UserInfo): Promise<string> {
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
